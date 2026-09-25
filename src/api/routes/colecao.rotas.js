import { Router } from 'express';
import * as colecaoRepo from '../../portfolio/colecao.repo.js';
import * as precosRepo from '../../portfolio/precos.repo.js';
import * as cartasRepo from '../../portfolio/cartas.repo.js';
import { obterCarta } from '../../pokemontcg/cliente.js';

export function rotasColecao() {
  const rotas = Router();

  rotas.get('/colecao', (req, res) => {
    res.json({ itens: colecaoRepo.listar(req.usuario.id) });
  });

  rotas.get('/colecao/resumo', (req, res) => {
    const itens = colecaoRepo.listar(req.usuario.id);
    let custo = 0;
    let valorAtual = 0;
    for (const item of itens) {
      custo += (item.preco_pago_usd ?? 0) * item.quantidade;
      valorAtual += (item.preco_mercado_usd ?? 0) * item.quantidade;
    }
    const serie = precosRepo.serieDoPortfolio(req.usuario.id);
    res.json({ custo, valorAtual, ganho: valorAtual - custo, serie });
  });

  rotas.post('/colecao', async (req, res) => {
    try {
      const { cartaId, quantidade = 1, variante, condicao, precoPagoUsd, adquiridoEm } = req.body ?? {};
      if (!cartaId) return res.status(400).json({ erro: 'cartaId é obrigatório' });

      // Garante a carta em cache antes de referenciá-la (colecao_item.carta_id é FK).
      if (!cartasRepo.obter(cartaId)) {
        const cartaApi = await obterCarta(cartaId);
        cartasRepo.salvar(cartaApi);
      }

      const item = colecaoRepo.adicionar({
        usuarioId: req.usuario.id,
        cartaId,
        quantidade: Number(quantidade),
        variante,
        condicao,
        precoPagoUsd: precoPagoUsd !== undefined && precoPagoUsd !== null ? Number(precoPagoUsd) : null,
        adquiridoEm,
      });
      res.status(201).json({ item });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.patch('/colecao/:id', (req, res) => {
    try {
      const { quantidade, variante, condicao, precoPagoUsd, adquiridoEm } = req.body ?? {};
      const item = colecaoRepo.atualizar(req.params.id, req.usuario.id, {
        quantidade: quantidade !== undefined ? Number(quantidade) : undefined,
        variante,
        condicao,
        precoPagoUsd: precoPagoUsd !== undefined ? Number(precoPagoUsd) : undefined,
        adquiridoEm,
      });
      res.json({ item });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.delete('/colecao/:id', (req, res) => {
    colecaoRepo.remover(req.params.id, req.usuario.id);
    res.status(204).end();
  });

  return rotas;
}
