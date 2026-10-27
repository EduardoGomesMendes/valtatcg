import { Router } from 'express';
import * as forum from '../../comunidade/forum.repo.js';
import * as eventos from '../../comunidade/eventos.repo.js';
import * as usuarios from '../../auth/usuarios.repo.js';
import { UFS } from '../../lojas/regioes.js';

/** Eventos são públicos: quem ainda não tem conta também procura um torneio perto de casa. */
export function rotasEventosPublicos() {
  const rotas = Router();

  rotas.get('/eventos', (req, res) => {
    const { uf, cidade, tipo, pagina } = req.query;
    res.json({
      ...eventos.listarPublicos({
        uf: String(uf ?? ''),
        cidade: String(cidade ?? '').slice(0, 60),
        tipo: String(tipo ?? ''),
        pagina,
      }),
      tipos: eventos.TIPOS,
      ufs: UFS,
    });
  });

  return rotas;
}

/**
 * Fórum e divulgação de eventos para quem tem conta.
 * Ficam depois do bloqueio de "menor sem responsável" (então menor sem confirmação só lê)
 * e ANTES do bloqueio por assinatura: comunidade é livre para quem está cadastrado.
 */
export function rotasComunidade() {
  const rotas = Router();

  /* ---------------- fórum ---------------- */

  rotas.get('/forum/categorias', (req, res) => {
    res.json({ categorias: forum.categoriasComContagem(), permissao: forum.podeEscrever(req.usuario) });
  });

  rotas.get('/forum/topicos', (req, res) => {
    res.json(forum.listarTopicos({ categoria: String(req.query.categoria ?? ''), pagina: req.query.pagina }));
  });

  rotas.get('/forum/topicos/:id', (req, res) => {
    const topico = forum.obterTopico(req.params.id, { pagina: req.query.pagina, usuario: req.usuario });
    if (!topico) return res.status(404).json({ erro: 'tópico não encontrado' });
    res.json({ topico });
  });

  rotas.post('/forum/topicos', (req, res) => {
    try {
      const id = forum.criarTopico(req.usuario, req.body ?? {});
      res.status(201).json({ id });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.post('/forum/topicos/:id/respostas', (req, res) => {
    try {
      res.status(201).json({ id: forum.responder(req.usuario, req.params.id, req.body?.corpo) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.delete('/forum/topicos/:id', (req, res) => {
    try {
      forum.removerProprio(req.usuario, 'topico', req.params.id);
      res.status(204).end();
    } catch (erro) {
      res.status(404).json({ erro: erro.message });
    }
  });

  rotas.delete('/forum/respostas/:id', (req, res) => {
    try {
      forum.removerProprio(req.usuario, 'resposta', req.params.id);
      res.status(204).end();
    } catch (erro) {
      res.status(404).json({ erro: erro.message });
    }
  });

  /* ---------------- eventos da pessoa ---------------- */

  rotas.get('/meus-eventos', (req, res) => {
    const eu = usuarios.buscarPorId(req.usuario.id);
    res.json({ eventos: eventos.listarDaPessoa(req.usuario.id), tipos: eventos.TIPOS, ufs: UFS, permissao: eventos.podeDivulgar(eu) });
  });

  rotas.post('/eventos', (req, res) => {
    try {
      const eu = usuarios.buscarPorId(req.usuario.id);
      const e = eventos.criar({ ...eu, admin: req.usuario.admin }, req.body ?? {});
      res.status(201).json({ id: e.id, status: e.status });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.delete('/eventos/:id', (req, res) => {
    try {
      eventos.removerProprio(req.usuario.id, req.params.id);
      res.status(204).end();
    } catch (erro) {
      res.status(404).json({ erro: erro.message });
    }
  });

  return rotas;
}
