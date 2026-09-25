import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const { criar } = await import('../src/auth/usuarios.repo.js');
const cartasRepo = await import('../src/portfolio/cartas.repo.js');
const colecaoRepo = await import('../src/portfolio/colecao.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- coleção ---');

const usuario = criar({ nome: 'Bruno', email: 'bruno@teste.local', senha: 'Senha1234' });

// Carta falsa no formato da API, só para popular o cache local (evita rede no teste).
const CARTA_API = {
  id: 'teste-1',
  name: 'Carta de Teste',
  set: { id: 'teste', name: 'Set de Teste' },
  number: '1',
  rarity: 'Comum',
  images: { small: 'https://exemplo/small.png', large: 'https://exemplo/large.png' },
  tcgplayer: { prices: { holofoil: { market: 10.5 } } },
};
const carta = cartasRepo.salvar(CARTA_API);
ok('salvar carta extrai o preço de mercado certo', carta.preco_mercado_usd === 10.5);

const item = colecaoRepo.adicionar({
  usuarioId: usuario.id, cartaId: carta.id, quantidade: 2,
  variante: 'holofoil', condicao: 'Mint', precoPagoUsd: 8, adquiridoEm: '2026-01-01',
});
ok('adicionar item retorna com id', Boolean(item.id));

let erro = null;
try {
  colecaoRepo.adicionar({ usuarioId: usuario.id, cartaId: carta.id, quantidade: 0 });
} catch (e) {
  erro = e;
}
ok('recusa quantidade zero', Boolean(erro));

const listados = colecaoRepo.listar(usuario.id);
ok('listar traz o item com dados da carta juntados', listados.length === 1 && listados[0].nome === 'Carta de Teste');

const atualizado = colecaoRepo.atualizar(item.id, usuario.id, { quantidade: 5 });
ok('atualizar muda a quantidade', atualizado.quantidade === 5);

const deOutroUsuario = colecaoRepo.obter(item.id, usuario.id + 999);
ok('item não aparece para outro usuário', deOutroUsuario === null);

colecaoRepo.remover(item.id, usuario.id);
ok('remover apaga o item', colecaoRepo.listar(usuario.id).length === 0);

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
