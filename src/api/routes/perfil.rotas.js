import { Router } from 'express';
import fs from 'node:fs';
import * as usuarios from '../../auth/usuarios.repo.js';
import { salvarAvatar, removerAvatar, caminhoAvatar } from '../../auth/avatar.js';

/**
 * Rotas dos próprios dados da conta logada — sempre disponíveis, mesmo com
 * assinatura vencida (a pessoa precisa conseguir corrigir e-mail/senha para
 * regularizar a conta, não pode ficar presa fora disso).
 *
 * O limite maior de corpo para o upload da foto é aplicado em servidor.js,
 * montado só no caminho /api/perfil/avatar — não aqui, porque o
 * express.json() geral já roda antes de qualquer rota deste arquivo.
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

  rotas.get('/perfil/avatar', (req, res) => {
    if (!req.usuario.avatar_mime) return res.status(404).end();
    fs.readFile(caminhoAvatar(req.usuario.id), (erro, buffer) => {
      if (erro) return res.status(404).end();
      res.setHeader('Content-Type', req.usuario.avatar_mime);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(buffer);
    });
  });

  rotas.post('/perfil/avatar', (req, res) => {
    try {
      salvarAvatar(req.usuario.id, req.body?.imagem);
      res.status(204).end();
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.delete('/perfil/avatar', (req, res) => {
    removerAvatar(req.usuario.id);
    res.status(204).end();
  });

  return rotas;
}
