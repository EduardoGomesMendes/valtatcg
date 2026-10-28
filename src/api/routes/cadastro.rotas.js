import { Router } from 'express';
import * as cadastros from '../../auth/cadastros.js';
import * as usuarios from '../../auth/usuarios.repo.js';
import { gravarCookieSessao } from '../autenticacao.js';
import { criarLog } from '../../logger.js';

const log = criarLog('cadastro');

/**
 * Cadastro público (sem login, de propósito: é a porta de entrada). Quem cuida do abuso são os limites
 * por e-mail e por IP, dentro das regras.
 */
export function rotasCadastro() {
  const rotas = Router();

  /** Erro de regra vira resposta limpa; o resto é bug e segue para o 500. */
  function tentar(res, fn) {
    return Promise.resolve()
      .then(fn)
      .catch((erro) => {
        if (erro instanceof cadastros.ErroDeCadastro) return res.status(erro.status).json({ erro: erro.message });
        throw erro;
      });
  }

  /** A página consulta antes de mostrar o formulário: sem e-mail configurado, o cadastro fica fechado. */
  rotas.get('/cadastro/estado', (req, res) => {
    res.json({ aberto: cadastros.cadastroAberto() });
  });

  rotas.post('/cadastro', (req, res, next) => {
    tentar(res, async () => res.json(await cadastros.solicitar({ dados: req.body ?? {}, ip: req.ip }))).catch(next);
  });

  rotas.post('/cadastro/reenviar', (req, res, next) => {
    tentar(res, async () => res.json(await cadastros.reenviar({ email: req.body?.email, ip: req.ip }))).catch(next);
  });

  /** O que a página do link mostra. Não altera nada. */
  rotas.get('/cadastro/confirmar', (req, res) => {
    const s = cadastros.consultar(req.query.t);
    // Os dados só voltam com o link válido (ou vencido, para oferecer novo envio): um link inventado não revela nada.
    res.json(s.estado === 'valido' || s.estado === 'expirado' ? s : { estado: s.estado });
  });

  /** Confirma o e-mail, cria a conta com a senha escolhida e já deixa a pessoa dentro. */
  rotas.post('/cadastro/concluir', (req, res, next) => {
    tentar(res, async () => {
      const { usuario, responsavel } = await cadastros.concluir({ token: req.body?.token, senha: req.body?.senha });
      gravarCookieSessao(res, usuarios.abrirSessao(usuario.id));
      log.info(`${usuario.usuario} entrou pela primeira vez`);
      res.status(201).json({ usuario, responsavel });
    }).catch(next);
  });

  return rotas;
}
