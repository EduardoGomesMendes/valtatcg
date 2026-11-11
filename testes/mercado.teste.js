import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
Object.assign(process.env, {
  DATA_DIR: pastaTemp, PORT: '0', EMAIL_MODO: 'memoria', CADASTRO_CHECAR_DOMINIO: 'nao', CADASTRO_PEDIDOS_POR_IP_HORA: '1000',
  ASAAS_API_KEY: '$aact_chave_falsa_de_teste', ASAAS_AMBIENTE: 'sandbox', ASAAS_WEBHOOK_TOKEN: 'token-de-teste',
});

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');
const { extrairPrecos } = await import('../src/mercado/tcgdex.js');
const { emAlta, emQueda, maisValiosas, variacaoDe, estaFresco } = await import('../src/mercado/ranking.js');
const { atualizarMercado, fontes } = await import('../src/mercado/mercado.job.js');
const repo = await import('../src/mercado/mercado.repo.js');
const cartasRepo = await import('../src/portfolio/cartas.repo.js');
const colecaoRepo = await import('../src/portfolio/colecao.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- mercado: leitura dos preços ---');

const hoje = new Date().toISOString();
const holo = extrairPrecos({
  pricing: {
    cardmarket: { updated: hoje, avg7: 332.87, avg30: 330.52, trend: 317 },
    tcgplayer: { updated: hoje, holofoil: { marketPrice: 293.04 } },
  },
});
ok('lê o preço do TCGplayer e as médias de 7 e 30 dias do Cardmarket', holo.precoUsd === 293.04 && holo.media7 === 332.87 && holo.media30 === 330.52);
ok('guarda quando a fonte diz ter atualizado', holo.cmAtualizadoEm === hoje && holo.tcgAtualizadoEm === hoje);
ok('a versão comum vem antes da holo no preço', extrairPrecos({ pricing: { tcgplayer: { holofoil: { marketPrice: 9 }, normal: { marketPrice: 2 } } } }).precoUsd === 2);
const soHolo = extrairPrecos({ pricing: { cardmarket: { avg7: null, avg30: null, 'avg7-holo': 12, 'avg30-holo': 10 } } });
ok('carta só holo usa o par -holo (7 e 30 dias da MESMA versão)', soHolo.media7 === 12 && soHolo.media30 === 10);
const misto = extrairPrecos({ pricing: { cardmarket: { avg7: 5, avg30: 0, 'avg7-holo': 12, 'avg30-holo': 10 } } });
ok('não mistura média de 7 de uma versão com a de 30 de outra', misto.media7 === 12 && misto.media30 === 10);
const vazio = extrairPrecos({});
ok('carta sem preço não quebra e vira nulos', vazio.precoUsd === null && vazio.media7 === null && vazio.media30 === null);

console.log('\n--- mercado: regras do painel ---');

const agora = Date.now();
const iso = (diasAtras) => new Date(agora - diasAtras * 86_400_000).toISOString();
const linha = (id, m7, m30, extra = {}) => ({
  id, nome: id, colecao: 'C', numero: '1', raridade: 'R', imagem: 'https://assets.tcgdex.net/x',
  preco_usd: 100, tcg_atualizado_em: iso(0), cm_media7_eur: m7, cm_media30_eur: m30, cm_atualizado_em: iso(0), ...extra,
});
const linhas = [
  linha('sobe-muito', 150, 100),
  linha('sobe-pouco', 110, 100),
  linha('desce', 60, 100),
  linha('estavel', 101, 100),                       // +1%: oscilação normal, não é movimento
  linha('ruido-barato', 0.06, 0.04),                // +50%, mas de 4 para 6 centavos
  linha('velha', 300, 100, { cm_atualizado_em: iso(10) }), // a fonte não atualiza há 10 dias
  linha('sem-media', null, null),
];
ok('variação = média de 7 dias contra a de 30', Math.abs(variacaoDe(linha('x', 150, 100)) - 0.5) < 1e-9 && variacaoDe(linha('y', null, 100)) === null);
ok('em alta: ordenada pela maior subida, sem ruído, sem dado velho e sem oscilação',
  emAlta(linhas, { agora }).map((x) => x.linha.id).join(',') === 'sobe-muito,sobe-pouco');
ok('em queda: só quem caiu de verdade', emQueda(linhas, { agora }).map((x) => x.linha.id).join(',') === 'desce');
ok('o limite de itens vale', emAlta(linhas, { agora, limite: 1 }).length === 1);
const valiosas = maisValiosas([linha('a', 1, 1, { preco_usd: 50 }), linha('b', 1, 1, { preco_usd: 900 }), linha('c', 1, 1, { preco_usd: 10, tcg_atualizado_em: iso(30) })], { agora });
ok('mais valiosas: maior preço primeiro e sem preço vencido', valiosas.map((x) => x.linha.id).join(',') === 'b,a');
ok('dado com mais de 4 dias não está fresco; dia de hoje está; ilegível conta como vencido', !estaFresco(iso(5), agora) && estaFresco(iso(0), agora) && !estaFresco('lixo', agora) && !estaFresco(null, agora));

console.log('\n--- mercado: busca diária ---');

const catalogo = {
  'Special illustration rare': ['m-1', 'm-2'],
  'Illustration rare': ['m-3'],
};
const cartaDaFonte = (id, m7) => ({
  id, name: `Carta ${id}`, localId: '7', rarity: 'Special illustration rare', image: `https://assets.tcgdex.net/en/${id}`,
  set: { name: 'Coleção Teste' },
  pricing: { cardmarket: { updated: new Date().toISOString(), avg7: m7, avg30: 10 }, tcgplayer: { updated: new Date().toISOString(), normal: { marketPrice: 20 } } },
});
let consultas = 0;
let listaFora = false;
let cartasFora = false;
fontes.idsPorRaridade = async (r) => {
  if (listaFora) throw new Error('TCGdex respondeu 500');
  return catalogo[r] ?? [];
};
fontes.obterCarta = async (id) => {
  consultas += 1;
  if (cartasFora) throw new Error('TCGdex respondeu 500');
  return cartaDaFonte(id, id === 'm-1' ? 15 : id === 'm-2' ? 5 : 11);
};

const r1 = await atualizarMercado({ pausaMs: 0 });
ok('a primeira rodada consulta todas as cartas da lista', r1.atualizadas === 3 && consultas === 3 && repo.todas().length === 3, JSON.stringify(r1));
ok('guarda nome, coleção e imagem', repo.todas().find((l) => l.id === 'm-1').colecao === 'Coleção Teste');
await atualizarMercado({ pausaMs: 0 });
ok('rodar de novo logo em seguida não consulta nada (só o que está velho)', consultas === 3, `consultas: ${consultas}`);

db.prepare("UPDATE mercado_carta SET consultado_em = datetime('now', '-30 hours') WHERE id = 'm-2'").run();
await atualizarMercado({ pausaMs: 0 });
ok('só a carta com consulta velha é buscada de novo', consultas === 4, `consultas: ${consultas}`);

catalogo['Illustration rare'] = []; // m-3 sai da lista oficial
await atualizarMercado({ pausaMs: 0 });
ok('carta que saiu da lista oficial sai do painel', !repo.todas().some((l) => l.id === 'm-3'));

listaFora = true;
catalogo['Illustration rare'] = ['m-3'];
const semLista = await atualizarMercado({ pausaMs: 0 });
ok('com a fonte fora, nada quebra e o painel guardado continua (e nada é apagado)', semLista.semLista === true && repo.todas().length === 2);
listaFora = false;

db.prepare("UPDATE mercado_carta SET consultado_em = datetime('now', '-30 hours')").run();
cartasFora = true;
const fora = await atualizarMercado({ pausaMs: 0 });
ok('com as consultas falhando, conta as falhas, não lança erro e mantém os dados antigos', fora.atualizadas === 0 && fora.falhas > 0 && repo.todas().length >= 2, JSON.stringify(fora));
cartasFora = false;

console.log('\n--- mercado: painel aberto na página inicial ---');

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}/api`;

async function conta(nome, email, usuario) {
  const resposta = await fetch(`${base}/cadastro`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome, email, usuario, nascimento: '1990-03-15', aceiteTermos: true }) });
  void resposta;
  const token = /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)[1];
  const fim = await fetch(`${base}/cadastro/concluir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, senha: 'Senha1234' }) });
  return (await fim.json()).usuario.id;
}

const resposta = await fetch(`${base}/mercado/painel`);
const painel = await resposta.json();
ok('o painel abre SEM login', resposta.status === 200);
ok('pode ficar em cache por alguns minutos', /public, max-age=\d+/.test(resposta.headers.get('cache-control') ?? ''));
ok('em alta traz a carta que subiu (média 15 contra 10) com a variação em %', painel.emAlta[0]?.id === 'm-1' && painel.emAlta[0].variacaoPct === 50, JSON.stringify(painel.emAlta[0]));
ok('em queda traz a que caiu (5 contra 10)', painel.emQueda[0]?.id === 'm-2' && painel.emQueda[0].variacaoPct === -50);
ok('mais valiosas existe e traz a miniatura da TCGdex', painel.maisValiosas.length > 0 && painel.maisValiosas[0].imagem.endsWith('/low.webp') && painel.maisValiosas[0].imagem.startsWith('https://assets.tcgdex.net/'));
ok('o preço vem na moeda informada', ['BRL', 'USD'].includes(painel.moeda) && typeof painel.maisValiosas[0].preco === 'number');
ok('diz quando foi atualizado', typeof painel.atualizadoEm === 'string');
ok('nada de dado de pessoa na resposta (só contagens agregadas)', !/email|usuario|nome_usuario/i.test(JSON.stringify(painel.maisAdicionadas)));
ok('com ninguém cadastrando, "mais adicionadas" fica vazio', painel.maisAdicionadas.length === 0);

// "Mais adicionadas": só entra carta que 2 ou mais pessoas diferentes cadastraram.
const ana = await conta('Ana', 'ana@mercado.teste', 'anamercado');
const bia = await conta('Bia', 'bia@mercado.teste', 'biamercado');
for (const [id, preco] of [['mc-1', 5], ['mc-2', 7]]) cartasRepo.salvar({ id, name: `Mais ${id}`, set: { id: 'mc', name: 'Set' }, tcgplayer: { prices: { normal: { market: preco } } } });
colecaoRepo.adicionar({ usuarioId: ana, cartaId: 'mc-1', quantidade: 1 });
colecaoRepo.adicionar({ usuarioId: bia, cartaId: 'mc-1', quantidade: 1 });
colecaoRepo.adicionar({ usuarioId: ana, cartaId: 'mc-2', quantidade: 3 }); // uma pessoa só, mesmo com 3 cartas
const painel2 = await (await fetch(`${base}/mercado/painel`)).json();
ok('mais adicionadas: carta com 2 pessoas entra, com 1 pessoa não (mesmo em quantidade maior)',
  painel2.maisAdicionadas.length === 1 && painel2.maisAdicionadas[0].id === 'mc-1' && painel2.maisAdicionadas[0].pessoas === 2, JSON.stringify(painel2.maisAdicionadas));

const csp = (await fetch(`${base}/estado`)).headers.get('content-security-policy') ?? '';
ok('as imagens da TCGdex estão liberadas na política de segurança', csp.includes('https://assets.tcgdex.net'));

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
