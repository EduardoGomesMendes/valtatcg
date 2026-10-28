import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';
process.env.ASAAS_API_KEY = '$aact_chave_falsa_de_teste';
process.env.ASAAS_AMBIENTE = 'sandbox';
process.env.ASAAS_WEBHOOK_TOKEN = 'token-de-teste-do-webhook';

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const usuarios = await import('../src/auth/usuarios.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const url = `http://127.0.0.1:${servidor.address().port}/api/pagamento/asaas`;

async function webhook(corpo, token = 'token-de-teste-do-webhook') {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) },
    body: JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const eventos = () => db.prepare('SELECT COUNT(*) AS n FROM pagamento_eventos').get().n;
const recebido = (id, extra = {}) => ({ event: 'PAYMENT_RECEIVED', payment: { id, value: 9.97, billingType: 'PIX', ...extra } });

console.log('\n--- webhook do Asaas numa conta compartilhada com outros produtos da Omva ---');

const ana = usuarios.criar({ nome: 'Ana Lima', email: 'ana@exemplo.com.br', usuario: 'ana_tcg', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
db.prepare("UPDATE usuarios SET asaas_assinatura_id = 'sub_da_ana' WHERE id = ?").run(ana.id);

ok('sem o token do webhook a notificação é recusada (401)', (await webhook(recebido('pay_x', { externalReference: `usuario:${ana.id}` }), '')).status === 401);
ok('com token errado também (401)', (await webhook(recebido('pay_x', { externalReference: `usuario:${ana.id}` }), 'errado')).status === 401);
ok('nada foi gravado pelas recusadas', eventos() === 0);

/* ---------- cobrança de OUTRO produto ---------- */
let r = await webhook(recebido('pay_omvazap', { externalReference: 'empresa:3:pro', customer: 'cus_de_outro' }));
ok('cobrança do omvazap (empresa:ID:plano) é ignorada com 200', r.status === 200 && r.json.ignorado === true);
r = await webhook(recebido('pay_omvalic', { externalReference: 'omvalic:12:plano' }));
ok('cobrança do omvalic é ignorada com 200', r.status === 200 && r.json.ignorado === true);
r = await webhook(recebido('pay_avulsa', { subscription: 'sub_de_outro_sistema' }));
ok('cobrança sem referência e de assinatura desconhecida é ignorada', r.status === 200 && r.json.ignorado === true);
ok('NENHUMA cobrança de outro produto fica guardada aqui (o corpo traz cliente alheio)', eventos() === 0);

/* ---------- cobrança nossa ---------- */
r = await webhook(recebido('pay_ana_1', { externalReference: `usuario:${ana.id}` }));
ok('pagamento do usuário (usuario:ID) é aceito', r.status === 200 && !r.json.ignorado);
ok('e libera a assinatura', usuarios.buscarPorId(ana.id).assinatura_status === 'ativa');
ok('e fica guardado', eventos() === 1);
r = await webhook(recebido('pay_ana_1', { externalReference: `usuario:${ana.id}` }));
ok('a mesma notificação repetida não faz nada de novo', r.status === 200 && r.json.repetido === true && eventos() === 1);

const beto = usuarios.criar({ nome: 'Beto Dias', email: 'beto@exemplo.com.br', usuario: 'beto_tcg', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
db.prepare("UPDATE usuarios SET asaas_assinatura_id = 'sub_do_beto' WHERE id = ?").run(beto.id);
r = await webhook(recebido('pay_beto_1', { subscription: 'sub_do_beto' }));
ok('cobrança sem referência, mas de assinatura NOSSA, é reconhecida pela assinatura', r.status === 200 && !r.json.ignorado && usuarios.buscarPorId(beto.id).assinatura_status === 'ativa');

r = await webhook(recebido('pay_fantasma', { externalReference: 'usuario:99999' }));
ok('referência no nosso formato, sem dono, fica guardada para conferência', r.status === 200 && r.json.semUsuario === true && eventos() === 3);

/* ---------- estorno ---------- */
r = await webhook({ event: 'PAYMENT_REFUNDED', payment: { id: 'pay_ana_1', externalReference: `usuario:${ana.id}`, value: 9.97 } });
ok('estorno nosso suspende a assinatura', r.status === 200 && usuarios.buscarPorId(ana.id).assinatura_status !== 'ativa');

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
