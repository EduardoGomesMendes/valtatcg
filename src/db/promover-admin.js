/*
  Promove uma conta já cadastrada a administrador.
  Uso: node src/db/promover-admin.js email@exemplo.com

  Existe porque o cadastro é auto-serviço (qualquer um cria conta) — precisa
  de um jeito de dar o primeiro acesso de administrador sem passar por uma
  rota HTTP (que exigiria já ter um admin para autorizar).
*/
import '../db/index.js';
import * as usuarios from '../auth/usuarios.repo.js';

const email = process.argv[2];
if (!email) {
  console.error('uso: node src/db/promover-admin.js email@exemplo.com');
  process.exit(1);
}

const usuario = usuarios.buscarPorEmail(email);
if (!usuario) {
  console.error(`nenhum usuário cadastrado com o e-mail "${email}"`);
  process.exit(1);
}

usuarios.definirAdmin(usuario.id, true);
console.log(`"${usuario.nome}" (${usuario.email}) agora é administrador.`);
