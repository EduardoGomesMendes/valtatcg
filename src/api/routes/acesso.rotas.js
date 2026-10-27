import { Router } from 'express';
import { config } from '../../config.js';
import * as usuarios from '../../auth/usuarios.repo.js';
import * as assinaturas from '../../assinaturas/assinaturas.repo.js';
import { enviarConfirmacaoResponsavel } from '../../seguranca/responsavel.js';
import { faixaEtaria } from '../../seguranca/idade.js';
import {
  gravarCookieSessao, apagarCookieSessao,
  registrarFalhaDeLogin, loginBloqueado, limparFalhas,
} from '../autenticacao.js';

export function rotasAcesso() {
  const rotas = Router();

  rotas.get('/estado', (req, res) => {
    res.json({
      autenticado: Boolean(req.usuario),
      exigeResponsavel: config.responsavel.obrigatorio,
      usuario: req.usuario ? { ...req.usuario, faixa: faixaEtaria(req.usuario.nascimento) } : null,
    });
  });

  rotas.post('/registrar', async (req, res) => {
    try {
      const usuario = usuarios.criar(req.body ?? {});
      assinaturas.iniciarTeste(usuario.id);
      const responsavel = usuario.responsavel_status === 'pendente'
        ? await enviarConfirmacaoResponsavel(usuario.id)
        : null;
      const token = usuarios.abrirSessao(usuario.id);
      gravarCookieSessao(res, token);
      res.status(201).json({ usuario, responsavel });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.post('/entrar', (req, res) => {
    const { identificador, senha } = req.body ?? {};
    const chave = `${req.ip}:${String(identificador ?? '').toLowerCase()}`;

    if (loginBloqueado(chave)) {
      return res.status(429).json({ erro: 'muitas tentativas — aguarde alguns minutos e tente de novo' });
    }

    const usuario = usuarios.autenticar(identificador, senha);
    if (!usuario) {
      registrarFalhaDeLogin(chave);
      return res.status(401).json({ erro: 'usuário/e-mail ou senha incorretos' });
    }

    if (usuario.suspenso) {
      return res.status(403).json({ erro: 'esta conta está suspensa — fale com o suporte' });
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
