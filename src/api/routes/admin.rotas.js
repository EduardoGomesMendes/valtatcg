import { Router } from 'express';
import * as usuarios from '../../auth/usuarios.repo.js';
import { exigirAdmin } from '../autenticacao.js';

export function rotasAdmin() {
  const rotas = Router();

  // Escopado a este router: só afeta as rotas /admin/* daqui, não as de baixo.
  rotas.use(exigirAdmin);

  rotas.get('/admin/usuarios', (req, res) => {
    res.json({ usuarios: usuarios.listarTodos() });
  });

  rotas.patch('/admin/usuarios/:id/admin', (req, res) => {
    try {
      if (Number(req.params.id) === req.usuario.id) {
        return res.status(400).json({ erro: 'não dá para mudar o próprio acesso de administrador por aqui' });
      }
      const usuario = usuarios.definirAdmin(req.params.id, Boolean(req.body?.admin));
      res.json({ usuario });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.delete('/admin/usuarios/:id', (req, res) => {
    try {
      if (Number(req.params.id) === req.usuario.id) {
        return res.status(400).json({ erro: 'não dá para excluir a própria conta por aqui' });
      }
      usuarios.excluirComoAdmin(req.params.id);
      res.status(204).end();
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  return rotas;
}
