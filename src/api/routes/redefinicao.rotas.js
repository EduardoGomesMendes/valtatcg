import { Router } from 'express';
import * as redefinicoes from '../../auth/redefinicoes.js';

/** "Esqueci minha senha" (sem login, de propósito). Quem cuida do abuso são os limites por e-mail e por IP. */
export function rotasRedefinicao() {
  const rotas = Router();

  function tentar(res, fn) {
    return Promise.resolve()
      .then(fn)
      .catch((erro) => {
        if (erro instanceof redefinicoes.ErroDeRedefinicao) return res.status(erro.status).json({ erro: erro.message });
        throw erro;
      });
  }

  rotas.get('/senha/estado', (req, res) => {
    res.json({ aberto: redefinicoes.redefinicaoAberta() });
  });

  /** A resposta é igual haja ou não conta para o e-mail. */
  rotas.post('/senha/esqueci', (req, res, next) => {
    tentar(res, async () => res.json(await redefinicoes.solicitar({ email: req.body?.email, ip: req.ip }))).catch(next);
  });

  /** O que a página do link mostra. Não altera nada. */
  rotas.get('/senha/redefinir', (req, res) => {
    res.json(redefinicoes.consultar(req.query.t));
  });

  rotas.post('/senha/redefinir', (req, res, next) => {
    tentar(res, async () => res.json(redefinicoes.concluir({ token: req.body?.token, senha: req.body?.senha }))).catch(next);
  });

  return rotas;
}
