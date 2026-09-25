import '../db/index.js';
import * as usuarios from '../auth/usuarios.repo.js';

const EMAIL = 'demo@valtatcg.local';
const SENHA = 'Demo1234';

if (!usuarios.buscarPorEmail(EMAIL)) {
  usuarios.criar({ nome: 'Demo', email: EMAIL, senha: SENHA });
  console.log(`usuário de teste criado: ${EMAIL} / ${SENHA}`);
} else {
  console.log('usuário de teste já existe.');
}
