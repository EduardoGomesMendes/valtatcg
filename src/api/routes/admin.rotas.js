import { Router } from 'express';
import fs from 'node:fs';
import * as usuarios from '../../auth/usuarios.repo.js';
import * as assinaturas from '../../assinaturas/assinaturas.repo.js';
import { caminhoAvatar } from '../../auth/avatar.js';
import { exigirAdmin } from '../autenticacao.js';

export function rotasAdmin() {
  const rotas = Router();

  // Escopado a este router: só afeta as rotas /admin/* daqui, não as de baixo.
  rotas.use(exigirAdmin);

  rotas.get('/admin/usuarios', (req, res) => {
    res.json({ usuarios: usuarios.listarTodos() });
  });

  rotas.get('/admin/usuarios/:id/avatar', (req, res) => {
    const alvo = usuarios.buscarPorId(req.params.id);
    if (!alvo?.avatar_mime) return res.status(404).end();
    fs.readFile(caminhoAvatar(alvo.id), (erro, buffer) => {
      if (erro) return res.status(404).end();
      res.setHeader('Content-Type', alvo.avatar_mime);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(buffer);
    });
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

  /**
   * Libera ou renova manualmente — usado enquanto o gateway não entra, e
   * como escape para qualquer caso que o automático não cubra.
   */
  rotas.post('/admin/usuarios/:id/assinatura', (req, res) => {
    const dias = Number(req.body?.dias);
    if (!(dias > 0)) return res.status(400).json({ erro: 'informe quantos dias liberar' });
    try {
      const situacao = assinaturas.ativar(req.params.id, {
        dias,
        ator: req.usuario.nome,
        descricao: `Liberado manualmente por ${req.usuario.nome}.`,
      });
      res.json(situacao);
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
