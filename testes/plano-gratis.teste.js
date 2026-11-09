import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
Object.assign(process.env, {
  DATA_DIR: pastaTemp, PORT: '0', EMAIL_MODO: 'memoria', CADASTRO_CHECAR_DOMINIO: 'nao', CADASTRO_PEDIDOS_POR_IP_HORA: '1000',
  DIAS_DE_TESTE: '7', // a primeira conta usa o teste (legado); o padrão SEM teste é conferido mais abaixo
  ASAAS_API_KEY: '$aact_chave_falsa_de_teste', ASAAS_AMBIENTE: 'sandbox', ASAAS_WEBHOOK_TOKEN: 'token-de-teste',
});

const { db } = await import('../src/db/index.js');
const { config } = await import('../src/config.js');
const { criarServidor } = await import('../src/api/servidor.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');
const cartasRepo = await import('../src/portfolio/cartas.repo.js');
const cota = await import('../src/portfolio/cota.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

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
  patch(p, b = {}) { return this.req('PATCH', p, b); }
  del(p) { return this.req('DELETE', p); }
}
async function conta(nome, email, usuario) {
  const c = new Cli();
  await c.post('/cadastro', { nome, email, usuario, nascimento: '1990-03-15', aceiteTermos: true });
  const token = /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)[1];
  const f = await c.post('/cadastro/concluir', { token, senha: 'Senha1234' });
  return { c, id: f.j.usuario.id };
}
const encerrarTeste = (id) => db.prepare("UPDATE usuarios SET teste_termina_em = datetime('now', '-1 day') WHERE id = ?").run(id);
const webhook = (corpo) => fetch(`${base}/pagamento/asaas`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'asaas-access-token': 'token-de-teste' }, body: JSON.stringify(corpo),
});
for (const n of [1, 2, 3, 4]) cartasRepo.salvar({ id: `gr-${n}`, name: `Carta ${n}`, set: { id: 'gr', name: 'Set' }, tcgplayer: { prices: { normal: { market: n } } } });
const add = (c, cartaId = 'gr-1', extra = {}) => c.post('/colecao', { cartaId, quantidade: 1, ...extra });

console.log('\n--- plano grátis: 1 carta por dia; assinante sem limite ---');
ok(`o limite padrão é ${config.assinatura.limiteDiarioGratis} carta por dia`, config.assinatura.limiteDiarioGratis === 1);

/* ---------- teste: tudo liberado ---------- */
const ana = await conta('Ana Lima', 'ana@exemplo.com.br', 'ana_gratis');
let r = await ana.c.post('/colecao', { cartaId: 'gr-1', quantidade: 5 });
ok('no período de teste cadastra sem limite (5 de uma vez)', r.s === 201);
ok('...e várias vezes no mesmo dia', (await add(ana.c, 'gr-2')).s === 201 && (await add(ana.c, 'gr-3')).s === 201);
ok('no teste a tela não recebe cota (não há limite)', (await ana.c.get('/assinatura')).j.cota === null);

/* ---------- acabou o teste: plano grátis ---------- */
encerrarTeste(ana.id);
r = await ana.c.get('/assinatura');
ok('sem assinatura a pessoa está no plano grátis, com a cota do dia na resposta', r.j.gratis === true && r.j.cota?.limiteDiario === 1 && r.j.cota?.usadasHoje === 0 && r.j.cota?.restantesHoje === 1, JSON.stringify(r.j.cota));
ok('o grátis continua LENDO a coleção', (await ana.c.get('/colecao')).s === 200 && (await ana.c.get('/colecao/resumo')).s === 200);

r = await add(ana.c, 'gr-4');
ok('a primeira carta do dia é cadastrada (201)', r.s === 201, JSON.stringify(r.j).slice(0, 80));
const itemDeHoje = r.j.item?.id;
r = await add(ana.c, 'gr-2');
ok('a segunda do mesmo dia é barrada com 429 e o sinal do limite', r.s === 429 && r.j.limiteDiario === true, `${r.s} ${JSON.stringify(r.j)}`);
ok('...com mensagem que oferece a assinatura', /volte amanhã ou assine/i.test(r.j.erro ?? ''), r.j.erro);
ok('...e informa a cota para a tela', r.j.cota?.restantesHoje === 0 && r.j.cota?.usadasHoje === 1);
ok('a carta barrada não entrou na coleção', (await ana.c.get('/colecao')).j.itens.filter((i) => i.carta_id === 'gr-2').length === 1, 'só a do teste');
r = await ana.c.get('/assinatura');
ok('a tela vê a cota esgotada', r.j.cota?.usadasHoje === 1 && r.j.cota?.restantesHoje === 0);

/* ---------- edições: o que é livre e o que gasta cota ---------- */
r = await ana.c.patch(`/colecao/${itemDeHoje}`, { precoPagoBrl: 25.9, condicao: 'Mint', adquiridoEm: '2026-10-01' });
ok('informar o preço pago e a condição continua livre, mesmo sem cota', r.s === 200 && r.j.item.preco_pago_brl === 25.9);
r = await ana.c.patch(`/colecao/${itemDeHoje}`, { quantidade: 2 });
ok('AUMENTAR a quantidade de uma carta é cadastrar carta nova: barrado sem cota', r.s === 429 && r.j.limiteDiario === true, `${r.s}`);
ok('...e a quantidade não mudou', (await ana.c.get('/colecao')).j.itens.find((i) => i.id === itemDeHoje).quantidade === 1);
const itemAntigo = db.prepare("SELECT id FROM colecao_item WHERE usuario_id = ? AND carta_id = 'gr-1'").get(ana.id).id;
db.prepare("UPDATE colecao_item SET criado_em = datetime('now', '-2 days') WHERE id = ?").run(itemAntigo); // cadastrada há dois dias
r = await ana.c.patch(`/colecao/${itemAntigo}`, { quantidade: 3 });
ok('diminuir a quantidade é livre', r.s === 200 && r.j.item.quantidade === 3);
r = await ana.c.patch(`/colecao/${itemAntigo}`, { quantidade: 9 });
ok('aumentar uma carta ANTIGA também gasta cota (não dá para burlar o limite editando)', r.s === 429);
for (let i = 0; i < 3; i += 1) await ana.c.patch(`/colecao/${itemAntigo}`, { quantidade: 50 });
ok('tentativas barradas de aumentar a quantidade NÃO devolvem cota (bug pego no teste)', cota.usadasHoje(ana.id) === 1, String(cota.usadasHoje(ana.id)));

/* ---------- remover ---------- */
const delAntigo = await ana.c.del(`/colecao/${itemAntigo}`);
const depoisDeRemover = await add(ana.c, 'gr-2');
ok('remover uma carta de ONTEM não devolve a cota de hoje', delAntigo.s === 204 && depoisDeRemover.s === 429,
  `del=${delAntigo.s} add=${depoisDeRemover.s} usadas=${cota.usadasHoje(ana.id)}`);
ok('remover a carta cadastrada HOJE (engano) devolve a cota', (await ana.c.del(`/colecao/${itemDeHoje}`)).s === 204 && cota.restantesHoje(ana.id) === 1);
ok('...e dá para cadastrar a carta certa', (await add(ana.c, 'gr-3')).s === 201);
ok('...mas só uma', (await add(ana.c, 'gr-4')).s === 429);

/* ---------- virou o dia ---------- */
db.prepare("UPDATE colecao_cota SET dia = date(dia, '-1 day') WHERE usuario_id = ?").run(ana.id);
ok('no dia seguinte a cota volta', cota.restantesHoje(ana.id) === 1 && (await add(ana.c, 'gr-4')).s === 201);

/* ---------- padrão do sistema: SEM teste, a conta já nasce no plano grátis ---------- */
config.assinatura.diasDeTeste = 0;
const nova = await conta('Nina Lopes', 'nina@exemplo.com.br', 'nina_gratis');
r = await nova.c.get('/assinatura');
ok('conta nova (sem teste) já nasce no plano grátis, com a cota do dia', r.j.status === 'gratis' && r.j.gratis === true && r.j.cota?.restantesHoje === 1, JSON.stringify({ s: r.j.status, c: r.j.cota }));
ok('...cadastra a primeira carta do dia', (await add(nova.c, 'gr-1')).s === 201);
ok('...e a segunda é barrada, sem que a conta tenha algum dia de teste', (await add(nova.c, 'gr-2')).s === 429);
ok('...o administrador a enxerga como "Grátis"', db.prepare('SELECT assinatura_status AS s FROM usuarios WHERE id = ?').get(nova.id).s === 'gratis');
config.assinatura.diasDeTeste = 7;

/* ---------- quantidade maior que a cota ---------- */
const beto = await conta('Beto Dias', 'beto@exemplo.com.br', 'beto_gratis');
encerrarTeste(beto.id);
r = await beto.c.post('/colecao', { cartaId: 'gr-1', quantidade: 3 });
ok('cadastrar 3 de uma vez no grátis (cota 1) é barrado, sem gastar a cota', r.s === 429 && /ainda pode cadastrar 1 carta/.test(r.j.erro ?? '') && cota.restantesHoje(beto.id) === 1, `${r.s} ${r.j.erro}`);
ok('dado inválido (quantidade 0) segue sendo 400, e não gasta a cota', (await beto.c.post('/colecao', { cartaId: 'gr-1', quantidade: 0 })).s === 400 && cota.restantesHoje(beto.id) === 1);
ok('carta inexistente não gasta a cota', (await beto.c.post('/colecao', { cartaId: '../x', quantidade: 1 })).s === 400 && cota.restantesHoje(beto.id) === 1);

/* ---------- pedidos ao mesmo tempo ---------- */
const respostas = await Promise.all([1, 2, 3, 4, 5].map(() => add(beto.c, 'gr-1')));
ok('cinco cadastros simultâneos: só UM passa pelo limite', respostas.filter((x) => x.s === 201).length === 1 && respostas.filter((x) => x.s === 429).length === 4, respostas.map((x) => x.s).join(','));

/* ---------- assinar tira o limite ---------- */
await beto.c.post('/assinatura/assinar', { documento: '52998224725' }).catch(() => {});
await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_gr_1', value: 9.97, externalReference: `usuario:${beto.id}` } });
r = await beto.c.get('/assinatura');
ok('depois do pagamento a pessoa é assinante, sem cota', r.j.status === 'ativa' && r.j.gratis === false && r.j.cota === null);
const varias = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => beto.c.post('/colecao', { cartaId: `gr-${(n % 4) + 1}`, quantidade: n })));
ok('assinante cadastra sem limite (6 pedidos, quantidades de 1 a 6)', varias.every((x) => x.s === 201), varias.map((x) => x.s).join(','));
ok('...e aumenta quantidades à vontade', (await beto.c.patch(`/colecao/${varias[0].j.item.id}`, { quantidade: 500 })).s === 200);

/* ---------- cancelou, mas pagou: continua sem limite até o fim ---------- */
await beto.c.post('/assinatura/cancelar', {});
r = await beto.c.get('/assinatura');
ok('cancelou com dias pagos: segue como assinante, sem limite', r.j.status === 'cancelada' && r.j.gratis === false && (await add(beto.c, 'gr-2')).s === 201);
await webhook({ event: 'PAYMENT_REFUNDED', payment: { id: 'pay_gr_1', value: 9.97, externalReference: `usuario:${beto.id}` } });
r = await beto.c.get('/assinatura');
ok('com o estorno cai no plano grátis na hora', r.j.gratis === true && r.j.cota?.limiteDiario === 1);
ok('...e o dia já tinha cadastros de assinante: o grátis só conta o que foi gasto como grátis', cota.usadasHoje(beto.id) === 1, String(cota.usadasHoje(beto.id)));

/* ---------- admin ---------- */
const adm = await conta('Admin', 'admin@exemplo.com.br', 'admin_gratis');
db.prepare('UPDATE usuarios SET admin = 1 WHERE id = ?').run(adm.id);
encerrarTeste(adm.id);
const admResp = await Promise.all([1, 2, 3].map(() => add(adm.c, 'gr-2')));
ok('administrador nunca tem limite', admResp.every((x) => x.s === 201) && (await adm.c.get('/assinatura')).j.cota === null);

/* ---------- configuração e dia de Brasília ---------- */
const original = config.assinatura.limiteDiarioGratis;
config.assinatura.limiteDiarioGratis = 0;
const carla = await conta('Carla Souza', 'carla@exemplo.com.br', 'carla_gratis');
encerrarTeste(carla.id);
r = await add(carla.c);
ok('com o limite em 0 o grátis só consulta (e a mensagem diz isso)', r.s === 429 && /não cadastra cartas novas/.test(r.j.erro ?? ''), r.j.erro);
config.assinatura.limiteDiarioGratis = 3;
ok('o limite é configurável (3 por dia)', (await add(carla.c, 'gr-1')).s === 201 && (await add(carla.c, 'gr-2')).s === 201 && (await add(carla.c, 'gr-3')).s === 201 && (await add(carla.c, 'gr-4')).s === 429);
config.assinatura.limiteDiarioGratis = original;
const brasilia = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
ok('o "dia" da cota é o de Brasília (UTC−3), não o do servidor', cota.hoje() === brasilia, `${cota.hoje()} x ${brasilia}`);

/* ---------- as telas ---------- */
const ler = (arquivo) => fs.readFileSync(path.join(config.raiz, 'public', arquivo), 'utf8');
ok('a tela de assinatura explica o plano grátis e o que o plano pago tira', /plano grátis/i.test(ler('assinatura/index.html')) && /sem limite/i.test(ler('assinatura/index.html')));
ok('a página inicial apresenta o plano grátis', /1 carta por dia/.test(ler('index.html')));

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
