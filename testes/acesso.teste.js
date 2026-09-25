import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const { criar, autenticar, abrirSessao, usuarioDaSessao, encerrarSessao } = await import('../src/auth/usuarios.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- acesso ---');

const usuario = criar({ nome: 'Ana', email: 'ana@teste.local', senha: 'Senha1234' });
ok('criar usuário retorna sem hash/salt', !usuario.senha_hash && !usuario.senha_salt);
ok('email fica normalizado', usuario.email === 'ana@teste.local');

let erro = null;
try {
  criar({ nome: 'Outra', email: 'ANA@teste.local', senha: 'Senha1234' });
} catch (e) {
  erro = e;
}
ok('recusa e-mail duplicado (case-insensitive)', erro?.message.includes('já está cadastrado'));

erro = null;
try {
  criar({ nome: 'Fraca', email: 'fraca@teste.local', senha: '123' });
} catch (e) {
  erro = e;
}
ok('recusa senha fraca', Boolean(erro));

ok('autenticar com senha certa funciona', Boolean(autenticar('ana@teste.local', 'Senha1234')));
ok('autenticar com senha errada falha', autenticar('ana@teste.local', 'errada123') === null);
ok('autenticar e-mail inexistente falha', autenticar('ninguem@teste.local', 'Senha1234') === null);

const token = abrirSessao(usuario.id);
const sessao = usuarioDaSessao(token);
ok('sessão recém-aberta resolve o usuário certo', sessao?.id === usuario.id);

encerrarSessao(token);
ok('sessão encerrada não resolve mais', usuarioDaSessao(token) === null);

ok('token inválido não resolve', usuarioDaSessao('token-que-nao-existe') === null);

db.close();
// No Windows o SQLite pode manter um lock residual por alguns instantes
// mesmo depois de fechado; a limpeza é best-effort, não faz o teste falhar.
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
