import { Router } from 'express';
import * as usuarios from '../../auth/usuarios.repo.js';

/**
 * Rotas dos próprios dados da conta logada — sempre disponíveis, mesmo com
 * assinatura vencida (a pessoa precisa conseguir corrigir e-mail/senha para
 * regularizar a conta, não pode ficar presa fora disso).
 */
export function rotasPerfil() {
  const rotas = Router();

  rotas.get('/perfil', (req, res) => {
    res.json({ usuario: req.usuario });
  });

  rotas.patch('/perfil', (req, res) => {
    try {
      const usuario = usuarios.atualizarPerfil(req.usuario.id, req.body ?? {});
      res.json({ usuario });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.post('/perfil/senha', (req, res) => {
    try {
      const { senhaAtual, senhaNova } = req.body ?? {};
      usuarios.trocarSenha(req.usuario.id, senhaNova, senhaAtual);
      res.status(204).end();
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  return rotas;
}
