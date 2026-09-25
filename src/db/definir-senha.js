/*
  Redefine a senha de uma conta já cadastrada, sem precisar da senha antiga.
  Uso: node src/db/definir-senha.js email@exemplo.com [senha-nova]

  Sem o segundo argumento, gera uma senha aleatória e imprime na tela — é o
  caminho até o valtatcg ter um fluxo de "esqueci minha senha" por e-mail.
*/
import { randomBytes } from 'node:crypto';
import '../db/index.js';
import * as usuarios from '../auth/usuarios.repo.js';

const email = process.argv[2];
if (!email) {
  console.error('uso: node src/db/definir-senha.js email@exemplo.com [senha-nova]');
  process.exit(1);
}

const usuario = usuarios.buscarPorEmail(email);
if (!usuario) {
  console.error(`nenhum usuário cadastrado com o e-mail "${email}"`);
  process.exit(1);
}

const senha = process.argv[3] || gerarSenhaAleatoria();

try {
  usuarios.definirSenha(usuario.id, senha);
  console.log(`senha de "${usuario.nome}" (${usuario.email}) redefinida para: ${senha}`);
} catch (erro) {
  console.error(erro.message);
  process.exit(1);
}

function gerarSenhaAleatoria() {
  // Letras + números, fácil de digitar na hora de trocar por uma definitiva.
  return randomBytes(6).toString('hex') + Math.floor(10 + Math.random() * 90);
}
