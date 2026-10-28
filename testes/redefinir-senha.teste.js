import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';
process.env.EMAIL_MODO = 'memoria';
process.env.URL_PUBLICA = 'https://valtatcg.teste';
process.env.REDEFINICAO_PEDIDOS_POR_IP_HORA = '100';

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const usuarios = await import('../src/auth/usuarios.repo.js');
const { caixaDeSaida } = await import('../src/email/enviador.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}/api`;

async function chamar(metodo, caminho, corpo) {
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const tokenDoUltimoEmail = () => /redefinir-senha\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)?.[1];

console.log('\n--- esqueci minha senha ---');

const ana = usuarios.criar({ nome: 'Ana Lima', email: 'ana@exemplo.com.br', usuario: 'ana_tcg', senha: 'SenhaAntiga1', nascimento: '1990-01-01', aceiteTermos: true });
const sessaoAntiga = usuarios.abrirSessao(ana.id);

ok('a redefinição está aberta quando há e-mail configurado', (await chamar('GET', '/senha/estado')).json.aberto === true);

/* ---------- pedido ---------- */
let r = await chamar('POST', '/senha/esqueci', { email: 'ANA@exemplo.com.br ' });
ok('pedido de e-mail com conta responde ok (aceita maiúsculas e espaço)', r.status === 200 && r.json.ok === true);
ok('o link sai SÓ para o e-mail da conta', caixaDeSaida.length === 1 && caixaDeSaida[0].para === 'ana@exemplo.com.br');
ok('o e-mail leva o link da URL pública configurada', caixaDeSaida[0].texto.includes('https://valtatcg.teste/redefinir-senha/?t='));
const token = tokenDoUltimoEmail();
ok('o banco guarda só o hash do token', db.prepare('SELECT token_hash FROM redefinicoes_senha WHERE usuario_id = ?').get(ana.id).token_hash !== token);

const antes = caixaDeSaida.length;
const semConta = await chamar('POST', '/senha/esqueci', { email: 'ninguem@exemplo.com.br' });
ok('e-mail SEM conta recebe a MESMA resposta (não revela quem é usuário)', semConta.status === 200 && JSON.stringify(semConta.json) === JSON.stringify(r.json));
ok('e-mail sem conta não recebe nada', caixaDeSaida.length === antes);
ok('e-mail com formato inválido é recusado', (await chamar('POST', '/senha/esqueci', { email: 'isto-nao-e-email' })).status === 400);

/* ---------- consulta do link ---------- */
r = await chamar('GET', `/senha/redefinir?t=${token}`);
ok('o link válido mostra o e-mail da conta', r.json.estado === 'valido' && r.json.email === 'ana@exemplo.com.br');
ok('abrir o link de novo (ex.: antivírus do e-mail) não o gasta', (await chamar('GET', `/senha/redefinir?t=${token}`)).json.estado === 'valido');
r = await chamar('GET', '/senha/redefinir?t=inventado-inventado-inventado');
ok('link inventado não revela nada', r.json.estado === 'invalido' && !r.json.email);

/* ---------- troca ---------- */
r = await chamar('POST', '/senha/redefinir', { token, senha: 'curta' });
ok('senha fraca é recusada e o link continua valendo', r.status === 400 && (await chamar('GET', `/senha/redefinir?t=${token}`)).json.estado === 'valido');
ok('concluir com link inválido dá 404', (await chamar('POST', '/senha/redefinir', { token: 'inventado-inventado-inventado', senha: 'Senha1234' })).status === 404);

ok('antes da troca a sessão antiga está de pé', usuarios.usuarioDaSessao(sessaoAntiga)?.id === ana.id);
const emailsAntes = caixaDeSaida.length;
r = await chamar('POST', '/senha/redefinir', { token, senha: 'SenhaNova99' });
ok('com a senha boa a troca acontece', r.status === 200 && r.json.ok === true, `${r.status}`);
ok('a senha antiga deixa de entrar e a nova entra', (await chamar('POST', '/entrar', { identificador: 'ana_tcg', senha: 'SenhaAntiga1' })).status === 401
  && (await chamar('POST', '/entrar', { identificador: 'ana@exemplo.com.br', senha: 'SenhaNova99' })).status === 200);
ok('a sessão antiga cai junto com a troca', usuarios.usuarioDaSessao(sessaoAntiga) === null);
ok('a pessoa recebe o aviso de senha alterada', caixaDeSaida.length === emailsAntes + 1 && /alterada/.test(caixaDeSaida.at(-1).assunto));
ok('o link só vale uma vez', (await chamar('POST', '/senha/redefinir', { token, senha: 'OutraSenha77' })).status === 410);
ok('o link usado aparece como "usado"', (await chamar('GET', `/senha/redefinir?t=${token}`)).json.estado === 'usado');

/* ---------- link novo cancela o anterior ---------- */
await chamar('POST', '/senha/esqueci', { email: 'ana@exemplo.com.br' });
const primeiro = tokenDoUltimoEmail();
await chamar('POST', '/senha/esqueci', { email: 'ana@exemplo.com.br' });
const segundo = tokenDoUltimoEmail();
ok('pedir de novo invalida o link anterior', primeiro !== segundo && (await chamar('GET', `/senha/redefinir?t=${primeiro}`)).json.estado === 'usado'
  && (await chamar('GET', `/senha/redefinir?t=${segundo}`)).json.estado === 'valido');

/* ---------- validade ---------- */
db.prepare("UPDATE redefinicoes_senha SET expira_em = datetime('now', '-1 minute') WHERE token_hash IS NOT NULL AND usado_em IS NULL").run();
ok('link vencido aparece como vencido', (await chamar('GET', `/senha/redefinir?t=${segundo}`)).json.estado === 'expirado');
r = await chamar('POST', '/senha/redefinir', { token: segundo, senha: 'SenhaNova55' });
ok('link vencido não troca a senha', r.status === 410 && (await chamar('POST', '/entrar', { identificador: 'ana_tcg', senha: 'SenhaNova99' })).status === 200);

/* ---------- conta suspensa ---------- */
const beto = usuarios.criar({ nome: 'Beto Dias', email: 'beto@exemplo.com.br', usuario: 'beto_tcg', senha: 'SenhaDoBeto1', nascimento: '1990-01-01', aceiteTermos: true });
usuarios.suspender(beto.id, 'teste');
const emailsSuspensa = caixaDeSaida.length;
r = await chamar('POST', '/senha/esqueci', { email: 'beto@exemplo.com.br' });
ok('conta suspensa não recebe link e a resposta é igual às outras', r.status === 200 && caixaDeSaida.length === emailsSuspensa);

/* ---------- limite por e-mail ---------- */
for (let i = 0; i < 5; i += 1) await chamar('POST', '/senha/esqueci', { email: 'spam@exemplo.com.br' });
ok('o mesmo e-mail não pode pedir sem parar (429), tenha conta ou não', (await chamar('POST', '/senha/esqueci', { email: 'spam@exemplo.com.br' })).status === 429);

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
