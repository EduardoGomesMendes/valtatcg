import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const { obterTaxa, taxaDoDia, esquecerMemoria } = await import('../src/cambio/cambio.js');
const { calcularResumo } = await import('../src/portfolio/resumo.js');
const { criar } = await import('../src/auth/usuarios.repo.js');
const { salvar } = await import('../src/portfolio/cartas.repo.js');
const colecaoRepo = await import('../src/portfolio/colecao.repo.js');
const precosRepo = await import('../src/portfolio/precos.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}
const perto = (a, b, folga = 1e-9) => Math.abs(a - b) < folga;

console.log('\n--- câmbio, resumo em reais e variação de preço ---');

/* ---------- câmbio ---------- */
// fonte falsa: cada chamada é contada e cada fonte responde conforme o roteiro
function fonteFalsa(roteiro) {
  const chamadas = [];
  const buscar = async (url) => {
    const nome = url.includes('frankfurter') ? 'frankfurter' : 'awesomeapi';
    chamadas.push(nome);
    const r = roteiro[nome];
    if (r === 'cai') throw new Error('rede fora do ar');
    if (typeof r === 'number' && r >= 400) return { ok: false, status: r, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => (nome === 'frankfurter' ? { rates: { BRL: r } } : { USDBRL: { bid: String(r) } }) };
  };
  return { buscar, chamadas };
}

const T0 = Date.parse('2026-10-27T12:00:00Z');
esquecerMemoria();
let f = fonteFalsa({ frankfurter: 5.35, awesomeapi: 5.4 });
const c1 = await obterTaxa({ buscar: f.buscar, agora: T0 });
ok('usa a primeira fonte que responde', c1.usdBrl === 5.35 && c1.fonte === 'frankfurter' && c1.defasada === false && f.chamadas.length === 1);
ok('a cotação fica guardada no banco', db.prepare('SELECT COUNT(*) AS n FROM cambio_diario').get().n === 1);

await obterTaxa({ buscar: f.buscar, agora: T0 + 60 * 60 * 1000 });
ok('dentro de 6 horas usa a memória, sem ir à rede de novo', f.chamadas.length === 1);
await obterTaxa({ buscar: f.buscar, agora: T0 + 7 * 60 * 60 * 1000 });
ok('passadas 6 horas busca de novo', f.chamadas.length === 2);

esquecerMemoria();
f = fonteFalsa({ frankfurter: 500, awesomeapi: 5.41 });
const c2 = await obterTaxa({ buscar: f.buscar, agora: T0 });
ok('se a primeira fonte falha, usa a segunda', c2.usdBrl === 5.41 && c2.fonte === 'awesomeapi' && f.chamadas.join() === 'frankfurter,awesomeapi');

esquecerMemoria();
f = fonteFalsa({ frankfurter: 0.05, awesomeapi: 5.42 });
ok('cotação absurda de uma fonte é recusada (cai para a outra)', (await obterTaxa({ buscar: f.buscar, agora: T0 })).usdBrl === 5.42);

esquecerMemoria();
f = fonteFalsa({ frankfurter: 'cai', awesomeapi: 'cai' });
const c3 = await obterTaxa({ buscar: f.buscar, agora: T0 });
ok('sem nenhuma fonte, usa a última cotação guardada e avisa que está defasada', c3.defasada === true && c3.usdBrl === 5.42);
const c4 = await obterTaxa({ buscar: f.buscar, agora: T0 + 1000 });
ok('cotação defasada não vira memória: a próxima chamada tenta as fontes de novo', f.chamadas.length === 4 && c4.defasada === true);

esquecerMemoria();
f = fonteFalsa({ frankfurter: 5.5, awesomeapi: 5.5 });
const [x, y] = await Promise.all([obterTaxa({ buscar: f.buscar, agora: T0 }), obterTaxa({ buscar: f.buscar, agora: T0 })]);
ok('duas chamadas ao mesmo tempo fazem uma busca só', f.chamadas.length === 1 && x.usdBrl === y.usdBrl);

db.exec('DELETE FROM cambio_diario');
esquecerMemoria();
ok('sem fonte e sem cotação guardada devolve null (a tela segue em dólar)', (await obterTaxa({ buscar: fonteFalsa({ frankfurter: 'cai', awesomeapi: 'cai' }).buscar, agora: T0 })) === null);

db.prepare("INSERT INTO cambio_diario (data, usd_brl) VALUES ('2026-10-20', 5.0), ('2026-10-22', 5.2)").run();
ok('cotação de uma data: a do próprio dia ou a mais recente antes dele', taxaDoDia('2026-10-22') === 5.2 && taxaDoDia('2026-10-21') === 5.0 && taxaDoDia('2026-10-30') === 5.2);
ok('antes da primeira cotação guardada não há taxa', taxaDoDia('2026-10-01') === null);

/* ---------- resumo ---------- */
const itens = [
  { quantidade: 2, preco_mercado_usd: 10, preco_pago_brl: 30, preco_pago_usd: null },   // pago em reais: 60
  { quantidade: 1, preco_mercado_usd: 20, preco_pago_brl: null, preco_pago_usd: 4 },    // antigo, em dólar: 4 * taxa
  { quantidade: 1, preco_mercado_usd: 5, preco_pago_brl: null, preco_pago_usd: null },  // sem custo informado
];
const serie = [{ data: '2026-10-20', valor: 10 }, { data: '2026-10-22', valor: 12 }, { data: '2026-10-01', valor: 8 }];
const r = calcularResumo({ itens, taxa: 5, serie, taxaDoDia });
ok('valor atual em reais = dólar × cotação de hoje', r.moeda === 'BRL' && perto(r.valorAtual, 45 * 5));
ok('o custo pago em reais NÃO muda com o câmbio e o antigo em dólar usa a cotação de hoje', perto(r.custo, 60 + 4 * 5));
ok('ganho = valor − custo', perto(r.ganho, 225 - 80));
const r2 = calcularResumo({ itens, taxa: 6, serie, taxaDoDia });
ok('se o dólar sobe, o custo em reais pago fica igual (só o antigo e o valor mudam)', perto(r2.custo, 60 + 4 * 6) && perto(r2.valorAtual, 45 * 6));
ok('o gráfico usa a cotação de cada dia', perto(r.serie[0].valor, 10 * 5.0) && perto(r.serie[1].valor, 12 * 5.2));
ok('dia sem cotação guardada usa a de hoje', perto(r.serie[2].valor, 8 * 5));
const sem = calcularResumo({ itens, taxa: null, serie, taxaDoDia });
ok('sem cotação nenhuma, o resumo sai em dólar', sem.moeda === 'USD' && sem.taxa === null && perto(sem.valorAtual, 45) && perto(sem.custo, 4));

/* ---------- variação de preço ---------- */
const HOJE = '2026-10-27';
const carta = salvar({ id: 'v-1', name: 'Carta V', set: { id: 's', name: 'Set' }, tcgplayer: { prices: { normal: { market: 10 } } } });
precosRepo.registrarSnapshot('v-1', 8, '2026-10-20');
precosRepo.registrarSnapshot('v-1', 12.5, '2026-10-25');
precosRepo.registrarSnapshot('v-1', 99, HOJE);
let v = precosRepo.variacoes({ 'v-1': 10 }, HOJE)['v-1'];
ok('compara com o último dia ANTERIOR a hoje (ignora o preço de hoje)', v.desde === '2026-10-25' && v.anteriorUsd === 12.5);
ok('calcula valor e percentual', perto(v.deltaUsd, -2.5) && perto(v.percentual, -20));
ok('carta sem histórico não tem variação (em vez de inventar um número)', precosRepo.variacoes({ 'v-sem-historico': 10 }, HOJE)['v-sem-historico'] === undefined);
salvar({ id: 'v-so-hoje', name: 'So hoje', set: { id: 's', name: 'Set' } });
precosRepo.registrarSnapshot('v-so-hoje', 5, HOJE);
ok('histórico só de hoje também não dá variação', precosRepo.variacoes({ 'v-so-hoje': 5 }, HOJE)['v-so-hoje'] === undefined);
salvar({ id: 'v-zero', name: 'Zero', set: { id: 's', name: 'Set' } });
precosRepo.registrarSnapshot('v-zero', 0, '2026-10-20');
ok('preço anterior zero não gera divisão por zero', precosRepo.variacoes({ 'v-zero': 3 }, HOJE)['v-zero'] === undefined);
ok('preço atual ausente é ignorado', Object.keys(precosRepo.variacoes({ 'v-1': null }, HOJE)).length === 0);
ok('muitas cartas de uma vez (mais de um lote) funcionam', (() => {
  const mapa = {};
  for (let i = 0; i < 450; i += 1) mapa[`lote-${i}`] = 1;
  salvar({ id: 'lote-449', name: 'Lote', set: { id: 's', name: 'Set' } });
  precosRepo.registrarSnapshot('lote-449', 2, '2026-10-26');
  return precosRepo.variacoes(mapa, HOJE)['lote-449']?.percentual === -50;
})());

/* ---------- custo em reais na coleção e gráfico ---------- */
const u = criar({ nome: 'Ana', email: 'ana@teste.local', usuario: 'ana', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
const item = colecaoRepo.adicionar({ usuarioId: u.id, cartaId: carta.id, quantidade: 1, precoPagoBrl: 45.9 });
ok('o item guarda o custo em reais', item.preco_pago_brl === 45.9 && item.preco_pago_usd === null);
ok('dá para corrigir o custo em reais', colecaoRepo.atualizar(item.id, u.id, { precoPagoBrl: 50 }).preco_pago_brl === 50);

/* ---------- limpeza do histórico ---------- */
db.prepare("UPDATE colecao_item SET criado_em = '2026-01-01 00:00:00' WHERE id = ?").run(item.id);
precosRepo.registrarSnapshot('v-1', 7, '2026-01-10'); // carta que o usuário possui: fica
precosRepo.registrarSnapshot('v-zero', 7, '2026-01-10'); // carta ninguém possui, antiga: sai
const apagados = precosRepo.apagarHistoricoDeCartasNaoPossuidas(60);
ok('a limpeza apaga histórico antigo de cartas sem dono', apagados >= 1 && db.prepare("SELECT COUNT(*) AS n FROM preco_historico WHERE carta_id = 'v-zero' AND data = '2026-01-10'").get().n === 0);
ok('a limpeza preserva o histórico de cartas que alguém possui', db.prepare("SELECT COUNT(*) AS n FROM preco_historico WHERE carta_id = 'v-1' AND data = '2026-01-10'").get().n === 1);
ok('a limpeza preserva histórico recente mesmo de carta sem dono', db.prepare("SELECT COUNT(*) AS n FROM preco_historico WHERE carta_id = 'v-zero' AND data = '2026-10-20'").get().n === 1);

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
