import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
Object.assign(process.env, {
  DATA_DIR: pastaTemp, PORT: '0', EMAIL_MODO: 'memoria', URL_PUBLICA: 'https://valtatcg.teste',
  CADASTRO_CHECAR_DOMINIO: 'nao', CADASTRO_PEDIDOS_POR_IP_HORA: '1000',
  ASAAS_API_KEY: '$aact_chave_falsa_de_teste', ASAAS_AMBIENTE: 'sandbox', ASAAS_WEBHOOK_TOKEN: 'token-de-teste',
});

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const { pagamento } = await import('../src/pagamento/index.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');
const cartasRepo = await import('../src/portfolio/cartas.repo.js');
const lojasRepo = await import('../src/lojas/lojas.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

/* Asaas falso: só o que a assinatura usa. Guarda as chamadas para conferir o que NÃO deve acontecer. */
const chamadas = [];
let seq = 0;
const asaasFalso = http.createServer((req, res) => {
  chamadas.push(`${req.method} ${req.url}`);
  const json = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  req.resume();
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/v3/customers') return json({ id: `cus_${++seq}` });
    if (req.method === 'POST' && req.url === '/v3/subscriptions') return json({ id: `sub_${++seq}`, status: 'ACTIVE' });
    if (req.method === 'DELETE') return json({ deleted: true });
    if (req.url.includes('/payments')) return json({ data: [{ status: 'PENDING', invoiceUrl: 'https://asaas.teste/i/1', dueDate: '2026-12-01' }] });
    json({});
  });
});
await new Promise((r) => asaasFalso.listen(0, r));
pagamento().base = `http://127.0.0.1:${asaasFalso.address().port}/v3`;

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
}

async function conta(nome, email, usuario) {
  const c = new Cli();
  await c.post('/cadastro', { nome, email, usuario, nascimento: '1990-03-15', aceiteTermos: true });
  const token = /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)[1];
  const f = await c.post('/cadastro/concluir', { token, senha: 'Senha1234' });
  return { c, id: f.j.usuario.id };
}
const webhook = (corpo) => fetch(`${base}/pagamento/asaas`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'asaas-access-token': 'token-de-teste' }, body: JSON.stringify(corpo),
});

cartasRepo.salvar({ id: 'rev-1', name: 'Carta de Revisão', set: { id: 'rev', name: 'Set' }, tcgplayer: { prices: { normal: { market: 4 } } } });

console.log('\n--- revisão geral: correções da auditoria de 28/10/2026 ---');

/* ---------- assinatura: cancelar mantém o período pago ---------- */
const ana = await conta('Ana Lima', 'ana@exemplo.com.br', 'ana_rev');
const CPF = '52998224725';
let r = await ana.c.post('/assinatura/assinar', { documento: CPF });
ok('assinar gera o link de pagamento', r.s === 200 && r.j.pagamento?.url === 'https://asaas.teste/i/1', JSON.stringify(r.j));
await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_rev_1', value: 9.97, externalReference: `usuario:${ana.id}` } });
ok('pagamento ativa a assinatura', (await ana.c.get('/assinatura')).j.status === 'ativa');

const antes = chamadas.length;
r = await ana.c.post('/assinatura/assinar', {});
ok('assinar de novo com a assinatura ativa é recusado (409), sem dupla cobrança', r.s === 409, `${r.s} ${JSON.stringify(r.j)}`);
ok('...e nada foi enviado ao Asaas (a recorrência atual não é cancelada)', chamadas.length === antes, chamadas.slice(antes).join(' | '));

await ana.c.post('/assinatura/cancelar', { motivo: 'teste' });
r = await ana.c.get('/assinatura');
ok('cancelar mantém o acesso até o fim do período pago', r.j.status === 'cancelada' && r.j.bloqueado === false && r.j.diasRestantes >= 29, JSON.stringify(r.j).slice(0, 140));
r = await ana.c.post('/colecao', { cartaId: 'rev-1', quantidade: 1 });
ok('...e a coleção segue editável', r.s === 201, String(r.s));

await webhook({ event: 'PAYMENT_REFUNDED', payment: { id: 'pay_rev_1', value: 9.97, externalReference: `usuario:${ana.id}` } });
r = await ana.c.get('/assinatura');
ok('estorno corta na hora, mesmo com dias pagos', r.j.bloqueado === true && r.j.diasRestantes === 0, JSON.stringify(r.j).slice(0, 140));
ok('...e a escrita volta a ser barrada (402)', (await ana.c.post('/colecao', { cartaId: 'rev-1', quantidade: 1 })).s === 402);

/* ---------- mensalidade da loja: não assina duas vezes ---------- */
const beto = await conta('Beto Dias', 'beto@exemplo.com.br', 'beto_rev');
r = await beto.c.post('/minha-loja', { nome: 'Loja Revisão', cnpj: '11222333000181', uf: 'RS', cidade: 'Porto Alegre', whatsapp: '51999998888' });
const lojaId = r.j.loja.id;
lojasRepo.mudarStatus(lojaId, 'ativa');
r = await beto.c.post('/minha-loja/assinar', {});
ok('loja aprovada gera a cobrança da mensalidade', r.s === 200 && r.j.pagamento?.url, JSON.stringify(r.j).slice(0, 100));
await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_loja_rev', value: 49.77, externalReference: `loja:${lojaId}` } });
const antesLoja = chamadas.length;
r = await beto.c.post('/minha-loja/assinar', {});
ok('mensalidade em dia: assinar de novo é recusado (409)', r.s === 409, `${r.s} ${JSON.stringify(r.j)}`);
ok('...sem tocar na recorrência no Asaas', chamadas.length === antesLoja);

/* ---------- perfil: senha e e-mail ---------- */
const clara = await conta('Clara Dias', 'clara@exemplo.com.br', 'clara_rev');
const outraSessao = new Cli();
await outraSessao.post('/entrar', { identificador: 'clara_rev', senha: 'Senha1234' });
ok('há duas sessões abertas', (await outraSessao.get('/estado')).j.autenticado === true && (await clara.c.get('/estado')).j.autenticado === true);
r = await clara.c.post('/perfil/senha', { senhaAtual: 'Senha1234', senhaNova: 'NovaSenha99' });
ok('trocar a senha funciona (204)', r.s === 204);
ok('trocar a senha derruba as OUTRAS sessões', (await outraSessao.get('/estado')).j.autenticado === false);
ok('...e mantém a sessão de quem trocou', (await clara.c.get('/estado')).j.autenticado === true);

r = await clara.c.patch('/perfil', { email: 'clara.nova@exemplo.com.br' });
ok('trocar o e-mail SEM a senha atual é recusado', r.s === 400 && /senha atual/.test(r.j.erro ?? ''), JSON.stringify(r.j));
r = await clara.c.patch('/perfil', { email: 'clara.nova@exemplo.com.br', senhaAtual: 'errada123' });
ok('trocar o e-mail com a senha ERRADA é recusado', r.s === 400);
r = await clara.c.patch('/perfil', { nome: 'Clara D. Souza', email: 'clara@exemplo.com.br' });
ok('salvar o perfil com o MESMO e-mail não pede senha', r.s === 200, JSON.stringify(r.j).slice(0, 100));
r = await clara.c.patch('/perfil', { email: 'clara.nova@exemplo.com.br', senhaAtual: 'NovaSenha99' });
ok('com a senha certa o e-mail muda', r.s === 200 && r.j.usuario?.email === 'clara.nova@exemplo.com.br', JSON.stringify(r.j).slice(0, 100));

/* ---------- avatar: conta sem foto não gera 404 ---------- */
r = await clara.c.get('/perfil/avatar');
ok('conta sem foto: avatar responde 204 (e não 404 no console de toda página)', r.s === 204, String(r.s));

/* ---------- coleção: validação ---------- */
const dani = await conta('Dani Souza', 'dani@exemplo.com.br', 'dani_rev');
const adiciona = (extra) => dani.c.post('/colecao', { cartaId: 'rev-1', quantidade: 1, ...extra });
ok('quantidade comum passa', (await adiciona({ quantidade: 3 })).s === 201);
ok('quantidade absurda (1e15) é recusada', (await adiciona({ quantidade: 1e15 })).s === 400);
ok('quantidade acima do teto (100001) é recusada', (await adiciona({ quantidade: 100001 })).s === 400);
ok('variante de 5000 caracteres é recusada', (await adiciona({ variante: 'x'.repeat(5000) })).s === 400);
ok('condição de 5000 caracteres é recusada', (await adiciona({ condicao: 'y'.repeat(5000) })).s === 400);
ok('data "ontem à noite" é recusada', (await adiciona({ adquiridoEm: 'ontem à noite' })).s === 400);
ok('data inexistente (2026-02-31) é recusada', (await adiciona({ adquiridoEm: '2026-02-31' })).s === 400);
ok('data no futuro é recusada', (await adiciona({ adquiridoEm: '2999-01-01' })).s === 400);
ok('data válida passa', (await adiciona({ adquiridoEm: '2026-05-10' })).s === 201);
ok('preço pago absurdo é recusado', (await adiciona({ precoPagoBrl: 1e12 })).s === 400);
ok('id de carta com caracteres perigosos é recusado antes da API externa', (await dani.c.post('/colecao', { cartaId: '../../etc/passwd', quantidade: 1 })).s === 400);
ok('id de carta que não é texto é recusado', (await dani.c.post('/colecao', { cartaId: { $ne: 1 }, quantidade: 1 })).s === 400);
const item = (await adiciona({})).j.item;
ok('editar com variante enorme é recusado', (await dani.c.patch(`/colecao/${item.id}`, { variante: 'z'.repeat(100) })).s === 400);
ok('editar a quantidade comum passa', (await dani.c.patch(`/colecao/${item.id}`, { quantidade: 7 })).j.item?.quantidade === 7);

servidor.close();
asaasFalso.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
