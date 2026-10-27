import { Router } from 'express';
import * as denuncias from '../../seguranca/denuncias.repo.js';

/** Qualquer pessoa logada pode denunciar — inclusive menor ainda sem responsável confirmado. */
export function rotasDenuncias() {
  const rotas = Router();

  rotas.get('/denuncias/motivos', (req, res) => {
    res.json({ motivos: denuncias.MOTIVOS });
  });

  rotas.post('/denuncias', (req, res) => {
    try {
      const { alvoTipo, alvoId, motivo, detalhe } = req.body ?? {};
      const r = denuncias.criar({ autorId: req.usuario.id, alvoTipo, alvoId, motivo, detalhe });
      res.status(r.repetida ? 200 : 201).json({ ok: true, repetida: r.repetida });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  return rotas;
}
