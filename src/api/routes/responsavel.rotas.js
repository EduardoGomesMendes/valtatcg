import { Router } from 'express';
import * as usuarios from '../../auth/usuarios.repo.js';
import { registrarFalhaDeLogin, loginBloqueado } from '../autenticacao.js';

/**
 * Rotas PÚBLICAS: quem chama é o responsável, que não tem conta.
 * O que vale é o token do link (256 bits, só o hash fica guardado).
 */
export function rotasResponsavel() {
  const rotas = Router();

  rotas.get('/responsavel/consulta', (req, res) => {
    const chave = `resp:${req.ip}`;
    if (loginBloqueado(chave)) return res.status(429).json({ erro: 'muitas tentativas — aguarde alguns minutos' });
    const dados = usuarios.consultarTokenResponsavel(String(req.query.token ?? ''));
    if (!dados) {
      registrarFalhaDeLogin(chave);
      return res.status(404).json({ erro: 'este link não é mais válido' });
    }
    res.json(dados);
  });

  rotas.post('/responsavel/confirmar', (req, res) => {
    const chave = `resp:${req.ip}`;
    if (loginBloqueado(chave)) return res.status(429).json({ erro: 'muitas tentativas — aguarde alguns minutos' });
    try {
      usuarios.confirmarResponsavelPorToken(String(req.body?.token ?? ''));
      res.json({ ok: true });
    } catch (erro) {
      registrarFalhaDeLogin(chave);
      res.status(400).json({ erro: erro.message });
    }
  });

  return rotas;
}
