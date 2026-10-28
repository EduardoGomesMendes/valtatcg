import { Router } from 'express';
import fs from 'node:fs';
import * as usuarios from '../../auth/usuarios.repo.js';
import * as assinaturas from '../../assinaturas/assinaturas.repo.js';
import { caminhoAvatar } from '../../auth/avatar.js';
import * as denuncias from '../../seguranca/denuncias.repo.js';
import * as lojas from '../../lojas/lojas.repo.js';
import * as forum from '../../comunidade/forum.repo.js';
import * as eventos from '../../comunidade/eventos.repo.js';
import * as moderacao from '../../comunidade/moderacao.js';
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

  /** Escape enquanto o e-mail não está configurado, ou quando o responsável não consegue abrir o link. */
  rotas.post('/admin/usuarios/:id/responsavel/confirmar', (req, res) => {
    try {
      res.json({ usuario: usuarios.confirmarResponsavelManual(req.params.id) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.post('/admin/usuarios/:id/suspender', (req, res) => {
    try {
      if (Number(req.params.id) === req.usuario.id) {
        return res.status(400).json({ erro: 'não dá para suspender a própria conta' });
      }
      const motivo = String(req.body?.motivo ?? '').trim().slice(0, 300) || null;
      res.json({ usuario: usuarios.suspender(req.params.id, motivo) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.post('/admin/usuarios/:id/reativar', (req, res) => {
    res.json({ usuario: usuarios.reativar(req.params.id) });
  });

  rotas.get('/admin/lojas', (req, res) => {
    res.json({ lojas: lojas.listarParaAdmin(String(req.query.status ?? 'pendente')) });
  });

  rotas.post('/admin/lojas/:id/status', (req, res) => {
    try {
      res.json({ loja: lojas.mudarStatus(req.params.id, req.body?.status, req.body?.motivo) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  /** Libera dias de mensalidade na mão — escape para teste, cortesia ou gateway fora do ar. */
  rotas.post('/admin/lojas/:id/assinatura', (req, res) => {
    const dias = Number(req.body?.dias);
    if (!(dias > 0)) return res.status(400).json({ erro: 'informe quantos dias liberar' });
    try {
      res.json({ loja: lojas.ativarAssinatura(req.params.id, dias) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  /* Moderação do fórum: o que foi escrito (inclusive o que ninguém denunciou) e o que o filtro barrou. */
  rotas.get('/admin/moderacao/mensagens', (req, res) => {
    res.json({ mensagens: moderacao.mensagensRecentes() });
  });

  rotas.get('/admin/moderacao/bloqueios', (req, res) => {
    res.json({ bloqueios: moderacao.bloqueiosRecentes(), limites: moderacao.LIMITES });
  });

  /* Eventos: aprovação e remoção. */
  rotas.get('/admin/eventos', (req, res) => {
    res.json({ eventos: eventos.listarParaAdmin(String(req.query.status ?? 'pendente')) });
  });

  rotas.post('/admin/eventos/:id/decidir', (req, res) => {
    try {
      eventos.decidir(req.params.id, req.body?.status, req.body?.motivo);
      res.json({ ok: true });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.delete('/admin/eventos/:id', (req, res) => {
    try {
      eventos.removerComoAdmin(req.params.id);
      res.status(204).end();
    } catch (erro) {
      res.status(404).json({ erro: erro.message });
    }
  });

  /* Fórum: ocultar, fixar e fechar. Ocultar não apaga — a prova fica e dá para desfazer. */
  rotas.post('/admin/forum/topicos/:id/moderar', (req, res) => {
    try {
      forum.moderarTopico(req.params.id, String(req.body?.acao ?? ''));
      res.json({ ok: true });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.post('/admin/forum/respostas/:id/moderar', (req, res) => {
    try {
      forum.moderarResposta(req.params.id, String(req.body?.acao ?? ''));
      res.json({ ok: true });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.get('/admin/denuncias', (req, res) => {
    const status = ['aberta', 'resolvida', 'descartada', 'todas'].includes(req.query.status) ? req.query.status : 'aberta';
    res.json({ denuncias: denuncias.listar(status) });
  });

  rotas.post('/admin/denuncias/:id/resolver', (req, res) => {
    try {
      denuncias.resolver(req.params.id, {
        adminId: req.usuario.id,
        status: req.body?.status,
        nota: req.body?.nota,
      });
      res.json({ ok: true });
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
