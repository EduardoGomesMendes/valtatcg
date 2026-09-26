import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const {
  criar, autenticar, abrirSessao, usuarioDaSessao, encerrarSessao,
  atualizarPerfil, trocarSenha, buscarPorEmail,
} = await import('../src/auth/usuarios.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- acesso ---');

const usuario = criar({ nome: 'Ana', email: 'ana@teste.local', usuario: 'ana', senha: 'Senha1234' });
ok('criar usuário retorna sem hash/salt', !usuario.senha_hash && !usuario.senha_salt);
ok('email fica normalizado', usuario.email === 'ana@teste.local');

let erro = null;
try {
  criar({ nome: 'Outra', email: 'ANA@teste.local', usuario: 'outra', senha: 'Senha1234' });
} catch (e) {
  erro = e;
}
ok('recusa e-mail duplicado (case-insensitive)', erro?.message.includes('já está cadastrado'));

erro = null;
try {
  criar({ nome: 'Outra2', email: 'outra2@teste.local', usuario: 'ANA', senha: 'Senha1234' });
} catch (e) {
  erro = e;
}
ok('recusa nome de usuário duplicado (case-insensitive)', erro?.message.includes('já está em uso'));

erro = null;
try {
  criar({ nome: 'Fraca', email: 'fraca@teste.local', usuario: 'fraca', senha: '123' });
} catch (e) {
  erro = e;
}
ok('recusa senha fraca', Boolean(erro));

erro = null;
try {
  criar({ nome: 'Sem usuário', email: 'semusuario@teste.local', usuario: 'ab', senha: 'Senha1234' });
} catch (e) {
  erro = e;
}
ok('recusa nome de usuário curto demais', Boolean(erro));

ok('autenticar com senha certa funciona', Boolean(autenticar('ana@teste.local', 'Senha1234')));
ok('autenticar com senha errada falha', autenticar('ana@teste.local', 'errada123') === null);
ok('autenticar e-mail inexistente falha', autenticar('ninguem@teste.local', 'Senha1234') === null);
ok('autenticar pelo nome de usuário funciona', Boolean(autenticar('ana', 'Senha1234')));
ok('autenticar pelo nome de usuário é case-insensitive', Boolean(autenticar('ANA', 'Senha1234')));
ok('autenticar usuário inexistente falha', autenticar('ninguem', 'Senha1234') === null);

const token = abrirSessao(usuario.id);
const sessao = usuarioDaSessao(token);
ok('sessão recém-aberta resolve o usuário certo', sessao?.id === usuario.id);

encerrarSessao(token);
ok('sessão encerrada não resolve mais', usuarioDaSessao(token) === null);

ok('token inválido não resolve', usuarioDaSessao('token-que-nao-existe') === null);

const perfilAtualizado = atualizarPerfil(usuario.id, { nome: 'Ana Paula', email: 'ana2@teste.local' });
ok('atualizarPerfil muda nome e e-mail', perfilAtualizado.nome === 'Ana Paula' && perfilAtualizado.email === 'ana2@teste.local');

const outraConta = criar({ nome: 'Bia', email: 'bia@teste.local', usuario: 'bia', senha: 'Senha1234' });
erro = null;
try {
  atualizarPerfil(usuario.id, { email: 'bia@teste.local' });
} catch (e) {
  erro = e;
}
ok('atualizarPerfil recusa e-mail já usado por outra conta', erro?.message.includes('já está cadastrado'));

erro = null;
try {
  trocarSenha(usuario.id, 'SenhaNova123', 'senhaErrada');
} catch (e) {
  erro = e;
}
ok('trocarSenha exige a senha atual certa', erro?.message === 'senha atual incorreta');

trocarSenha(usuario.id, 'SenhaNova123', 'Senha1234');
ok('trocarSenha com a senha certa funciona', Boolean(autenticar('ana2@teste.local', 'SenhaNova123')));
ok('a senha antiga para de funcionar', autenticar('ana2@teste.local', 'Senha1234') === null);
ok('outra conta continua intacta', buscarPorEmail('bia@teste.local')?.id === outraConta.id);

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
