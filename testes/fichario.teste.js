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
const { compararNumeros, ehPrincipal, montarFichario } = await import('../src/fichario/fichario.js');
const { fontes } = await import('../src/fichario/sincronia.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- fichário: contas ---');

ok('ordena por número de verdade (2 antes de 10, 10 antes de 100)', ['100', '2', '10', '1'].sort(compararNumeros).join(',') === '1,2,10,100');
ok('número com letra (TG01) vai depois dos numerados', ['TG01', '5', 'GG02', '166'].sort(compararNumeros).join(',') === '5,166,GG02,TG01');
ok('principal: até o total impresso; secreta e numeração própria ficam de fora',
  ehPrincipal('165', 165) && !ehPrincipal('166', 165) && !ehPrincipal('TG01', 165) && ehPrincipal('999', 0));

const colecaoTeste = { id: 'x', nome: 'Coleção X', serie: 'S', total: 4, total_impresso: 3, lancamento: '2026-01-01', logo: null, simbolo: null };
const cartasTeste = [
  { id: 'x-4', nome: 'Secreta', numero: '4', raridade: 'Secret', imagem_pequena: null, preco_mercado_usd: 50, precos_variantes: '{"holofoil":50}' },
  { id: 'x-1', nome: 'Uma', numero: '1', raridade: 'Common', imagem_pequena: null, preco_mercado_usd: 1, precos_variantes: '{"normal":1,"reverseHolofoil":9}' },
  { id: 'x-3', nome: 'Três', numero: '3', raridade: 'Rare', imagem_pequena: null, preco_mercado_usd: null, precos_variantes: '{}' },
  { id: 'x-2', nome: 'Duas', numero: '2', raridade: 'Common', imagem_pequena: null, preco_mercado_usd: 2, precos_variantes: '{"normal":2}' },
];
const f = montarFichario({
  colecao: colecaoTeste,
  cartas: cartasTeste,
  itens: [{ id: 10, carta_id: 'x-1', quantidade: 3, preco_pago_brl: 2, preco_pago_usd: null }, { id: 11, carta_id: 'x-4', quantidade: 1, preco_pago_brl: null, preco_pago_usd: null }],
  valores: { 'x-1': 3, 'x-4': 50 },
});
ok('cartas saem em ordem de número', f.cartas.map((c) => c.numero).join(',') === '1,2,3,4');
ok('tenho/falta e quantidade por carta', f.cartas[0].tenho && f.cartas[0].quantidade === 3 && !f.cartas[1].tenho);
ok('o preço padrão é o da versão comum, não o da reverse', f.cartas[0].precoUsd === 1);
ok('totais: 4 cartas, 2 tenho, 2 faltam, 2 repetidas', f.resumo.total === 4 && f.resumo.tenho === 2 && f.resumo.faltam === 2 && f.resumo.repetidas === 2);
ok('custo para completar soma só o que falta (carta sem preço não entra e é contada à parte)',
  f.resumo.custoParaCompletarUsd === 2 && f.resumo.faltamSemPreco === 1);
ok('a conta "só as numeradas" deixa a secreta de fora: 3 cartas, 1 tenho, custo 2',
  f.resumo.principal.total === 3 && f.resumo.principal.tenho === 1 && f.resumo.principal.custoParaCompletarUsd === 2);
ok('valor do que a pessoa tem vem dos valores informados', f.resumo.valorQueTenhoUsd === 53);
ok('o item informa se tem preço pago (a tela avisa antes de apagar)', f.cartas[0].itens[0].comPrecoPago === true && f.cartas[3].itens[0].comPrecoPago === false);

console.log('\n--- fichário: API ---');

// A pokemontcg.io não é chamada nos testes: as duas fontes são trocadas por versões locais que contam as chamadas.
let chamadasLista = 0;
let chamadasCartas = 0;
let apiFora = false;
const carta = (n, setId, preco) => ({
  id: `${setId}-${n}`, name: `Carta ${n}`, number: String(n), rarity: 'Common',
  set: { id: setId, name: setId, printedTotal: 3, total: 4 }, images: { small: `https://images.scrydex.com/${setId}-${n}.png` },
  tcgplayer: { updatedAt: '2026/11/06', prices: { normal: { market: preco } } },
});
fontes.listarColecoes = async () => {
  chamadasLista += 1;
  if (apiFora) throw new Error('pokemontcg.io respondeu 500');
  return [
    { id: 'ft1', name: 'Fichário Um', series: 'Série', printedTotal: 3, total: 4, releaseDate: '2026/10/01', images: { logo: 'https://images.scrydex.com/ft1-logo.png', symbol: 'https://images.scrydex.com/ft1-s.png' } },
    { id: 'ft2', name: 'Fichário Dois', series: 'Série', printedTotal: 2, total: 2, releaseDate: '2025/01/01', images: {} },
  ];
};
fontes.cartasDaColecao = async (id) => {
  chamadasCartas += 1;
  if (apiFora) throw new Error('pokemontcg.io respondeu 500');
  return id === 'ft1' ? [1, 2, 3, 4].map((n) => carta(n, 'ft1', n)) : [1, 2].map((n) => carta(n, 'ft2', 10));
};

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}/api`;

class Cli {
  cookie = '';
  async req(metodo, caminho, corpo) {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const texto = await r.text();
    let j = {};
    try { j = texto ? JSON.parse(texto) : {}; } catch { j = {}; }
    return { s: r.status, j };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  del(p) { return this.req('DELETE', p); }
}
async function conta(nome, email, usuario) {
  const c = new Cli();
  await c.post('/cadastro', { nome, email, usuario, nascimento: '1990-03-15', aceiteTermos: true });
  const token = /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)[1];
  const fim = await c.post('/cadastro/concluir', { token, senha: 'Senha1234' });
  return { c, id: fim.j.usuario.id };
}

const anonimo = new Cli();
ok('sem login, a lista de coleções não abre', (await anonimo.get('/fichario/colecoes')).s === 401);

const { c: ana, id: idAna } = await conta('Ana', 'ana@fichario.teste', 'anafichario');
const { c: bia } = await conta('Bia', 'bia@fichario.teste', 'biafichario');

const lista = await ana.get('/fichario/colecoes');
ok('lista as coleções, da mais nova para a mais antiga', lista.s === 200 && lista.j.colecoes.map((c) => c.id).join(',') === 'ft1,ft2', JSON.stringify(lista.j).slice(0, 120));
ok('cada coleção traz total, total impresso e quantas a pessoa tem', lista.j.colecoes[0].total === 4 && lista.j.colecoes[0].totalImpresso === 3 && lista.j.colecoes[0].tenho === 0);
ok('a data de lançamento vira AAAA-MM-DD', lista.j.colecoes[0].lancamento === '2026-10-01');
await bia.get('/fichario/colecoes');
ok('a lista foi buscada na API uma vez só (a segunda vem do banco)', chamadasLista === 1, `chamadas: ${chamadasLista}`);

ok('id inválido é recusado antes de qualquer busca', (await ana.get('/fichario/colecoes/..%2Fx')).s === 400 || (await ana.get('/fichario/colecoes/a%20b')).s === 400);
ok('id que não existe na lista oficial dá 404 e não consulta a API', (await ana.get('/fichario/colecoes/inventada')).s === 404 && chamadasCartas === 0);

const antes = await ana.get('/fichario/colecoes/ft1');
ok('abre a coleção com todas as cartas, nenhuma marcada', antes.s === 200 && antes.j.cartas.length === 4 && antes.j.resumo.tenho === 0 && antes.j.resumo.faltam === 4);
ok('o custo para completar soma o preço de todas (1+2+3+4)', antes.j.resumo.custoParaCompletarUsd === 10, String(antes.j.resumo.custoParaCompletarUsd));
ok('"só as numeradas" ignora a carta 4: custo 6', antes.j.resumo.principal.total === 3 && antes.j.resumo.principal.custoParaCompletarUsd === 6);

// Marcar uma carta é cadastrá-la na coleção: o mesmo caminho (e o mesmo limite do plano grátis) de sempre.
const marcou = await ana.post('/colecao', { cartaId: 'ft1-2' });
ok('marcar "tenho" é cadastrar na coleção (POST /colecao)', marcou.s === 201);
const depois = await ana.get('/fichario/colecoes/ft1');
ok('a carta aparece como "tenho" e o custo cai', depois.j.cartas[1].tenho && depois.j.resumo.tenho === 1 && depois.j.resumo.custoParaCompletarUsd === 8);
ok('o fichário informa o id do item, para a tela poder tirar a carta', depois.j.cartas[1].itens[0].id === marcou.j.item.id);
ok('o valor do que a pessoa tem entra no resumo', depois.j.resumo.valorQueTenhoUsd === 2, String(depois.j.resumo.valorQueTenhoUsd));
ok('as cartas já baixadas não são buscadas de novo', chamadasCartas === 1, `chamadas: ${chamadasCartas}`);

const dabia = await bia.get('/fichario/colecoes/ft1');
ok('o fichário é de cada pessoa: a Bia não vê as cartas da Ana', dabia.j.resumo.tenho === 0);
const listaDepois = await ana.get('/fichario/colecoes');
ok('a lista mostra o progresso (1 de 4)', listaDepois.j.colecoes.find((c) => c.id === 'ft1').tenho === 1);

// No plano grátis marcar uma carta gasta a cota do dia (1 por dia): o fichário não abre uma porta lateral para o limite.
const segunda = await ana.post('/colecao', { cartaId: 'ft1-3' });
ok('plano grátis: a segunda carta do dia é barrada, também pelo fichário (429)', segunda.s === 429 && segunda.j.limiteDiario === true);
const { ativar } = await import('../src/assinaturas/assinaturas.repo.js');
ativar(idAna, { dias: 30 });

// Mesma carta duas vezes (variantes diferentes): continua sendo UMA carta tida, e a repetida é contada.
await ana.post('/colecao', { cartaId: 'ft1-2', variante: 'normal' });
const duas = await ana.get('/fichario/colecoes/ft1');
ok('a mesma carta em dois itens conta como uma só (e como repetida)', duas.j.resumo.tenho === 1 && duas.j.cartas[1].quantidade === 2 && duas.j.resumo.repetidas === 1 && duas.j.cartas[1].itens.length === 2);

ok('tirar a carta pelo item a devolve para "falta"', (await ana.del(`/colecao/${marcou.j.item.id}`)).s === 204);

// API fora: o que já está guardado continua servindo; o que nunca foi baixado avisa de forma amigável.
apiFora = true;
db.prepare("UPDATE colecao_set SET cartas_sync_em = datetime('now', '-10 days'), atualizado_em = datetime('now', '-30 days')").run();
const velha = await ana.get('/fichario/colecoes/ft1');
ok('com a API fora, mostra o que já tinha guardado (velho, mas não quebra)', velha.s === 200 && velha.j.cartas.length === 4);
ok('a lista de coleções também segue com a guardada', (await ana.get('/fichario/colecoes')).s === 200);
const semBase = await ana.get('/fichario/colecoes/ft2');
ok('coleção nunca baixada com a API fora: erro amigável, sem texto técnico', semBase.s === 502 && !/pokemontcg|500/i.test(semBase.j.erro), semBase.j.erro);
apiFora = false;
const recuperada = await ana.get('/fichario/colecoes/ft2');
ok('quando a API volta, a coleção abre', recuperada.s === 200 && recuperada.j.cartas.length === 2);

// Poucas cartas no cache (de uma busca) não podem passar por uma coleção completa.
db.prepare("INSERT OR IGNORE INTO colecao_set (id, nome, total, total_impresso) VALUES ('ft3', 'Só vista', 10, 10)").run();
db.prepare("INSERT OR IGNORE INTO carta_cache (id, nome, set_id, numero) VALUES ('ft3-1', 'Só uma', 'ft3', '1')").run();
apiFora = true;
const parcial = await ana.get('/fichario/colecoes/ft3');
ok('coleção com só algumas cartas no cache e API fora: avisa, não mostra um fichário quase vazio como se fosse completo', parcial.s === 502);
apiFora = false;

// Cartas do fichário não entram no acompanhamento diário de preço (seriam centenas por coleção).
const { vistasRecentementeSemDono } = await import('../src/portfolio/cartas.repo.js');
ok('baixar a coleção não faz o job diário acompanhar cada carta dela', !vistasRecentementeSemDono().includes('ft1-3'));

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
