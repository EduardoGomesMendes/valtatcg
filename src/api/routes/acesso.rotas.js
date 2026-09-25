import { Router } from 'express';
import * as usuarios from '../../auth/usuarios.repo.js';
import * as assinaturas from '../../assinaturas/assinaturas.repo.js';
import {
  gravarCookieSessao, apagarCookieSessao,
  registrarFalhaDeLogin, loginBloqueado, limparFalhas,
} from '../autenticacao.js';

export function rotasAcesso() {
  const rotas = Router();

  rotas.get('/estado', (req, res) => {
    res.json({ autenticado: Boolean(req.usuario), usuario: req.usuario });
  });

  rotas.post('/registrar', (req, res) => {
    try {
      const usuario = usuarios.criar(req.body ?? {});
      assinaturas.iniciarTeste(usuario.id);
      const token = usuarios.abrirSessao(usuario.id);
      gravarCookieSessao(res, token);
      res.status(201).json({ usuario });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.post('/entrar', (req, res) => {
    const { email, senha } = req.body ?? {};
    const chave = `${req.ip}:${String(email ?? '').toLowerCase()}`;

    if (loginBloqueado(chave)) {
      return res.status(429).json({ erro: 'muitas tentativas — aguarde alguns minutos e tente de novo' });
    }

    const usuario = usuarios.autenticar(email, senha);
    if (!usuario) {
      registrarFalhaDeLogin(chave);
      return res.status(401).json({ erro: 'e-mail ou senha incorretos' });
    }

    limparFalhas(chave);
    const token = usuarios.abrirSessao(usuario.id);
    gravarCookieSessao(res, token);
    res.json({ usuario });
  });

  rotas.post('/sair', (req, res) => {
    if (req.token) usuarios.encerrarSessao(req.token);
    apagarCookieSessao(res);
    res.status(204).end();
  });

  return rotas;
}
