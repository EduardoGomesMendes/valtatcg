import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;

const { db } = await import('../src/db/index.js');
const usuarios = await import('../src/auth/usuarios.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- admin ---');

const dono = usuarios.criar({ nome: 'Dono', email: 'dono@teste.local', senha: 'Senha1234' });
const convidado = usuarios.criar({ nome: 'Convidado', email: 'convidado@teste.local', senha: 'Senha1234' });

ok('conta nova não nasce admin', dono.admin === 0);

usuarios.definirAdmin(dono.id, true);
ok('definirAdmin promove', usuarios.buscarPorId(dono.id).admin === 1);
ok('contarAdmins reflete a promoção', usuarios.contarAdmins() === 1);

let erro = null;
try {
  usuarios.definirAdmin(dono.id, false);
} catch (e) {
  erro = e;
}
ok('recusa remover o único admin', Boolean(erro));

usuarios.definirAdmin(convidado.id, true);
ok('agora dá para ter dois admins', usuarios.contarAdmins() === 2);

usuarios.definirAdmin(dono.id, false);
ok('com dois admins, dá para rebaixar um', usuarios.buscarPorId(dono.id).admin === 0);

const listados = usuarios.listarTodos();
ok('listarTodos traz todo mundo com contagem de itens', listados.length === 2 && listados.every((u) => 'itens_na_colecao' in u));

erro = null;
try {
  usuarios.excluirComoAdmin(convidado.id);
} catch (e) {
  erro = e;
}
ok('recusa excluir o único admin restante', Boolean(erro));

usuarios.definirAdmin(dono.id, true);
usuarios.excluirComoAdmin(convidado.id);
ok('com outro admin promovido, exclusão funciona', usuarios.buscarPorId(convidado.id) === null);

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
