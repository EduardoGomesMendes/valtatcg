import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';
process.env.EMAIL_MODO = 'memoria';
process.env.URL_PUBLICA = 'https://valtatcg.teste';
process.env.CADASTRO_CHECAR_DOMINIO = 'nao';
process.env.CADASTRO_PEDIDOS_POR_IP_HORA = '100';

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
  return { status: r.status, json: await r.json().catch(() => ({})), cookie: r.headers.get('set-cookie') };
}

const pedido = (extra = {}) => ({
  nome: 'Carla Souza', usuario: 'carla_tcg', email: 'carla@exemplo.com.br',
  nascimento: '1990-05-10', aceiteTermos: true, ...extra,
});
const tokenDoUltimoEmail = () => /confirmar\/\?t=([\w-]+)/.exec(caixaDeSaida.at(-1).texto)?.[1];

console.log('\n--- cadastro por e-mail: o link leva à criação da senha ---');

ok('o cadastro está aberto quando há e-mail configurado', (await chamar('GET', '/cadastro/estado')).json.aberto === true);

/* ---------- pedido ---------- */
let r = await chamar('POST', '/cadastro', pedido());
ok('o pedido é aceito sem senha', r.status === 200 && r.json.ok === true, `${r.status}`);
ok('um e-mail de confirmação sai para o endereço do pedido', caixaDeSaida.length === 1 && caixaDeSaida[0].para === 'carla@exemplo.com.br');
ok('o e-mail leva o link da URL pública configurada', caixaDeSaida[0].texto.includes('https://valtatcg.teste/confirmar/?t='));
ok('NADA de conta foi criada antes do clique no link', usuarios.buscarPorEmail('carla@exemplo.com.br') === null);
const token = tokenDoUltimoEmail();
ok('o banco guarda só o hash do token', db.prepare('SELECT token_hash FROM cadastros_pendentes').get().token_hash !== token);

/* ---------- consulta do link ---------- */
r = await chamar('GET', `/cadastro/confirmar?t=${token}`);
ok('o link válido mostra nome e e-mail', r.json.estado === 'valido' && r.json.email === 'carla@exemplo.com.br' && r.json.nome === 'Carla Souza');
r = await chamar('GET', `/cadastro/confirmar?t=${token}`);
ok('abrir o link de novo (ex.: antivírus do e-mail) não o gasta', r.json.estado === 'valido');
r = await chamar('GET', '/cadastro/confirmar?t=inventado-inventado-inventado');
ok('link inventado não revela nada', r.json.estado === 'invalido' && !r.json.email);

/* ---------- senha ---------- */
r = await chamar('POST', '/cadastro/concluir', { token, senha: 'curta' });
ok('senha fraca é recusada e o link continua valendo', r.status === 400 && (await chamar('GET', `/cadastro/confirmar?t=${token}`)).json.estado === 'valido');
r = await chamar('POST', '/cadastro/concluir', { token: 'inventado-inventado-inventado', senha: 'Senha1234' });
ok('concluir com link inválido dá 404', r.status === 404);

r = await chamar('POST', '/cadastro/concluir', { token, senha: 'Senha1234' });
ok('com a senha boa a conta nasce e a pessoa já entra', r.status === 201 && Boolean(r.cookie) && r.json.usuario?.usuario === 'carla_tcg', `${r.status}`);
const criada = usuarios.buscarPorEmail('carla@exemplo.com.br');
ok('a conta tem a data de nascimento e o aceite dos termos do pedido', criada?.nascimento === '1990-05-10' && Boolean(criada.aceite_termos_em));
ok('o teste grátis começa na criação da conta', criada?.assinatura_status === 'teste' && Boolean(criada.teste_termina_em));
ok('o pedido não guarda mais a data de nascimento', db.prepare('SELECT nascimento, usuario_id FROM cadastros_pendentes').get().nascimento === null);
r = await chamar('POST', '/entrar', { identificador: 'carla@exemplo.com.br', senha: 'Senha1234' });
ok('o login funciona com a senha escolhida', r.status === 200);

r = await chamar('POST', '/cadastro/concluir', { token, senha: 'Outra1234x' });
ok('o link só vale uma vez', r.status === 410);
ok('o link usado aparece como "usado"', (await chamar('GET', `/cadastro/confirmar?t=${token}`)).json.estado === 'usado');

/* ---------- e-mail que já tem conta ---------- */
const antes = caixaDeSaida.length;
r = await chamar('POST', '/cadastro', pedido({ usuario: 'carla_dois' }));
ok('pedir com e-mail já cadastrado dá a MESMA resposta (não revela quem é usuário)', r.status === 200 && r.json.ok === true);
ok('o dono do e-mail recebe um aviso, sem link de criação de senha', caixaDeSaida.length === antes + 1 && /já tem cadastro/.test(caixaDeSaida.at(-1).texto) && !/confirmar\/\?t=/.test(caixaDeSaida.at(-1).texto));
ok('nenhum pedido novo foi aberto', db.prepare('SELECT COUNT(*) AS n FROM cadastros_pendentes').get().n === 1);

/* ---------- regras do formulário ---------- */
r = await chamar('POST', '/cadastro', pedido({ email: 'outra@exemplo.com.br' }));
ok('nome de usuário já usado é recusado com mensagem', r.status === 400 && /em uso/.test(r.json.erro));
r = await chamar('POST', '/cadastro', pedido({ email: 'menor@exemplo.com.br', usuario: 'crianca_tcg', nascimento: '2020-01-01' }));
ok('menor de 13 anos continua recusado', r.status === 400);
r = await chamar('POST', '/cadastro', pedido({ email: 'x@mailinator.com', usuario: 'descartavel' }));
ok('e-mail descartável é recusado', r.status === 400);
r = await chamar('POST', '/cadastro', pedido({ email: 'semtermo@exemplo.com.br', usuario: 'sem_termo', aceiteTermos: false }));
ok('sem aceitar os termos não há pedido', r.status === 400);
r = await chamar('POST', '/registrar', { ...pedido({ email: 'atalho@exemplo.com.br', usuario: 'atalho' }), senha: 'Senha1234' });
ok('o caminho antigo (/registrar, conta com senha direto) não existe mais', r.status !== 201 && usuarios.buscarPorEmail('atalho@exemplo.com.br') === null, `${r.status}`);

/* ---------- dois pedidos, nome de usuário disputado ---------- */
r = await chamar('POST', '/cadastro', pedido({ email: 'ana@exemplo.com.br', usuario: 'ana_tcg', nome: 'Ana Lima' }));
ok('pedido aberto reserva o nome de usuário', r.status === 200 && (await chamar('POST', '/cadastro', pedido({ email: 'bia@exemplo.com.br', usuario: 'ANA_TCG', nome: 'Bia' }))).status === 400);

/* ---------- reenvio ---------- */
const tokenAna = tokenDoUltimoEmail();
r = await chamar('POST', '/cadastro/reenviar', { email: 'ana@exemplo.com.br' });
const tokenNovo = tokenDoUltimoEmail();
ok('reenviar manda um link novo e o antigo deixa de valer', r.status === 200 && tokenNovo !== tokenAna && (await chamar('GET', `/cadastro/confirmar?t=${tokenAna}`)).json.estado === 'invalido');
const emails = caixaDeSaida.length;
r = await chamar('POST', '/cadastro/reenviar', { email: 'ninguem@exemplo.com.br' });
ok('reenviar para quem nunca pediu responde igual e não manda nada', r.status === 200 && caixaDeSaida.length === emails);

/* ---------- validade ---------- */
db.prepare("UPDATE cadastros_pendentes SET expira_em = datetime('now', '-1 hour') WHERE email = 'ana@exemplo.com.br'").run();
r = await chamar('GET', `/cadastro/confirmar?t=${tokenNovo}`);
ok('link vencido aparece como vencido e oferece o e-mail para reenvio', r.json.estado === 'expirado' && r.json.email === 'ana@exemplo.com.br');
r = await chamar('POST', '/cadastro/concluir', { token: tokenNovo, senha: 'Senha1234' });
ok('link vencido não cria conta', r.status === 410 && usuarios.buscarPorEmail('ana@exemplo.com.br') === null);

/* ---------- limite de e-mails por endereço ---------- */
for (let i = 0; i < 3; i += 1) await chamar('POST', '/cadastro', pedido({ email: 'spam@exemplo.com.br', usuario: 'spam_tcg', nome: 'Spam Teste' }));
r = await chamar('POST', '/cadastro', pedido({ email: 'spam@exemplo.com.br', usuario: 'spam_tcg', nome: 'Spam Teste' }));
ok('o mesmo endereço não recebe e-mail sem parar (429)', r.status === 429);

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
