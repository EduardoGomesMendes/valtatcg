import { Router } from 'express';
import * as colecaoRepo from '../../portfolio/colecao.repo.js';
import * as precosRepo from '../../portfolio/precos.repo.js';
import * as cartasRepo from '../../portfolio/cartas.repo.js';
import { obterCarta } from '../../pokemontcg/cliente.js';
import { obterTaxa, taxaDoDia } from '../../cambio/cambio.js';
import { calcularResumo } from '../../portfolio/resumo.js';

/** Valor em dinheiro vindo do formulário: vazio vira null; negativo ou texto vira erro. */
function dinheiroOuNulo(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new Error('o preço pago precisa ser um número maior ou igual a zero');
  return n;
}

export function rotasColecao() {
  const rotas = Router();

  rotas.get('/colecao', (req, res) => {
    const itens = colecaoRepo.listar(req.usuario.id);
    const variacoes = precosRepo.variacoes(Object.fromEntries(itens.map((i) => [i.carta_id, i.preco_mercado_usd])));
    res.json({ itens: itens.map((i) => ({ ...i, variacao: variacoes[i.carta_id] ?? null })) });
  });

  rotas.get('/colecao/resumo', async (req, res) => {
    const cambio = await obterTaxa();
    res.json(calcularResumo({
      itens: colecaoRepo.listar(req.usuario.id),
      taxa: cambio?.usdBrl ?? null,
      serie: precosRepo.serieDoPortfolio(req.usuario.id),
      taxaDoDia,
    }));
  });

  rotas.post('/colecao', async (req, res) => {
    try {
      const { cartaId, quantidade = 1, variante, condicao, precoPagoUsd, precoPagoBrl, adquiridoEm } = req.body ?? {};
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
        precoPagoUsd: dinheiroOuNulo(precoPagoUsd),
        precoPagoBrl: dinheiroOuNulo(precoPagoBrl),
        adquiridoEm,
      });
      res.status(201).json({ item });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.patch('/colecao/:id', (req, res) => {
    try {
      const { quantidade, variante, condicao, precoPagoUsd, precoPagoBrl, adquiridoEm } = req.body ?? {};
      const item = colecaoRepo.atualizar(req.params.id, req.usuario.id, {
        quantidade: quantidade !== undefined ? Number(quantidade) : undefined,
        variante,
        condicao,
        precoPagoUsd: precoPagoUsd !== undefined ? dinheiroOuNulo(precoPagoUsd) : undefined,
        precoPagoBrl: precoPagoBrl !== undefined ? dinheiroOuNulo(precoPagoBrl) : undefined,
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
