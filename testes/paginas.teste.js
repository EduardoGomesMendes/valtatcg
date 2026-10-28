import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.PORT = '0';

const { db } = await import('../src/db/index.js');
const { criarServidor } = await import('../src/api/servidor.js');
const usuarios = await import('../src/auth/usuarios.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- páginas: o fórum só existe para quem está logado (HTTP de verdade) ---');

const servidor = criarServidor().listen(0);
await new Promise((r) => servidor.once('listening', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const buscar = (caminho, cookie) => fetch(`${base}${caminho}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const FORUM = /f[oó]rum/i;

/* ---------- visitante ---------- */
for (const caminho of ['/forum', '/forum/', '/forum/index.html', '/forum/topico/', '/forum/topico/?id=1']) {
  const r = await buscar(caminho);
  const destino = r.headers.get('location') ?? '';
  ok(`visitante em ${caminho} é mandado para o login`, r.status === 302 && destino.startsWith('/entrar/?destino='), `${r.status} ${destino}`);
}
const corpoDaPagina = await (await buscar('/forum/')).text();
ok('o visitante não recebe nada da página do fórum (nem o texto das regras)', !corpoDaPagina.includes('Regras do fórum'));

for (const caminho of ['/', '/lojas/', '/eventos/', '/entrar/']) {
  const r = await buscar(caminho);
  const html = await r.text();
  ok(`página pública ${caminho} abre e NÃO menciona o fórum`, r.status === 200 && !FORUM.test(html), FORUM.test(html) ? html.match(FORUM)[0] : '');
}
ok('a API do fórum recusa visitante', (await buscar('/api/forum/categorias')).status === 401 && (await buscar('/api/forum/topicos')).status === 401);

/* ---------- logado ---------- */
const u = usuarios.criar({ nome: 'Ana', email: 'ana@teste.local', usuario: 'ana_cards', senha: 'Senha1234', nascimento: '1990-01-01', aceiteTermos: true });
const token = usuarios.abrirSessao(u.id);
const cookie = `valtatcg_sessao=${encodeURIComponent(token)}`;

const logada = await buscar('/forum/', cookie);
const html = await logada.text();
ok('logado abre a página do fórum', logada.status === 200 && html.includes('Regras do fórum'));
ok('a página do fórum não é guardada em cache nem indexada', logada.headers.get('cache-control') === 'private, no-store' && html.includes('noindex'));
ok('logado abre um tópico', (await buscar('/forum/topico/?id=1', cookie)).status === 200);
ok('a API do fórum responde a quem está logado', (await buscar('/api/forum/categorias', cookie)).status === 200);

const cookieFalso = 'valtatcg_sessao=token-que-nao-existe';
ok('cookie inventado não abre o fórum', (await buscar('/forum/', cookieFalso)).status === 302);

usuarios.suspender(u.id, 'teste');
ok('conta suspensa não abre mais o fórum', (await buscar('/forum/', cookie)).status === 302);

servidor.close();
db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
