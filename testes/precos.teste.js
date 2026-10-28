import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const { criar } = await import('../src/auth/usuarios.repo.js');
const { extrairPrecoMercado, salvar } = await import('../src/portfolio/cartas.repo.js');
const colecaoRepo = await import('../src/portfolio/colecao.repo.js');
const precosRepo = await import('../src/portfolio/precos.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- preços ---');

ok(
  'prefere holofoil sobre normal, na ordem documentada',
  extrairPrecoMercado({ tcgplayer: { prices: { normal: { market: 1 }, holofoil: { market: 2 } } } }) === 2,
);
ok(
  'cai para reverseHolofoil quando não há holofoil',
  extrairPrecoMercado({ tcgplayer: { prices: { reverseHolofoil: { market: 3 } } } }) === 3,
);
ok('sem tcgplayer.prices retorna null (não usa cardmarket, é outra moeda)', extrairPrecoMercado({}) === null);
ok(
  'ignora variante sem campo market',
  extrairPrecoMercado({ tcgplayer: { prices: { holofoil: { low: 1 } } } }) === null,
);

const usuario = criar({ nome: 'Carla', email: 'carla@teste.local', usuario: 'carla', senha: 'Senha1234', nascimento: '1990-05-10', aceiteTermos: true });
const carta = salvar({
  id: 'teste-preco-1',
  name: 'Carta de Preço',
  set: { id: 'teste', name: 'Set de Teste' },
  tcgplayer: { prices: { normal: { market: 5 } } },
});
colecaoRepo.adicionar({ usuarioId: usuario.id, cartaId: carta.id, quantidade: 3 });
// A carta entrou na coleção em 1º/09: os preços de 20 e 21/09 são DEPOIS da compra e contam no gráfico.
db.prepare("UPDATE colecao_item SET criado_em = '2026-09-01 00:00:00' WHERE usuario_id = ?").run(usuario.id);

precosRepo.registrarSnapshot(carta.id, 5, '2026-09-20');
precosRepo.registrarSnapshot(carta.id, 6, '2026-09-21');
// Grava de novo no mesmo dia: precisa substituir, não duplicar (UNIQUE carta_id+data).
precosRepo.registrarSnapshot(carta.id, 7, '2026-09-21');

const historico = precosRepo.historico(carta.id, 365);
ok('histórico tem uma linha por dia (upsert, não duplica)', historico.length === 2);
ok('upsert do mesmo dia atualiza o valor', historico.find((h) => h.data === '2026-09-21')?.preco_mercado_usd === 7);

const serie = precosRepo.serieDoPortfolio(usuario.id, 365);
ok(
  'série do portfólio multiplica preço pela quantidade possuída',
  serie.find((s) => s.data === '2026-09-21')?.valor === 21, // 7 * 3
);

// O histórico também é gravado para cartas só vistas em buscas: o gráfico não pode mostrar dias anteriores à compra.
precosRepo.registrarSnapshot(carta.id, 99, '2026-08-15');
ok(
  'o gráfico ignora preços de antes de a carta entrar na coleção',
  !precosRepo.serieDoPortfolio(usuario.id, 365).some((s) => s.data === '2026-08-15'),
);

// Carta só vista em busca: o job diário precisa acompanhá-la, senão a busca fica em "sem histórico".
const { marcarVista, vistasRecentementeSemDono } = await import('../src/portfolio/cartas.repo.js');
const vista = salvar({ id: 'teste-vista-1', name: 'Só Vista', tcgplayer: { prices: { normal: { market: 2 } } } });
const antiga = salvar({ id: 'teste-vista-antiga', name: 'Vista Faz Tempo', tcgplayer: { prices: { normal: { market: 2 } } } });
marcarVista(vista.id);
db.prepare("UPDATE carta_cache SET visto_em = datetime('now', '-30 days') WHERE id = ?").run(antiga.id);
const acompanhadas = vistasRecentementeSemDono();
ok('carta vista agora entra no acompanhamento diário', acompanhadas.includes('teste-vista-1'));
ok('carta vista há 30 dias sai do acompanhamento', !acompanhadas.includes('teste-vista-antiga'));
ok('carta da coleção não entra (o job já cuida dela)', !acompanhadas.includes(carta.id));

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
