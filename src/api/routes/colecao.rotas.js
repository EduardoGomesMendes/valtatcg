import { Router } from 'express';
import * as colecaoRepo from '../../portfolio/colecao.repo.js';
import * as precosRepo from '../../portfolio/precos.repo.js';
import * as cartasRepo from '../../portfolio/cartas.repo.js';
import { obterCarta } from '../../pokemontcg/cliente.js';
import { obterTaxa, taxaDoDia } from '../../cambio/cambio.js';
import { calcularResumo } from '../../portfolio/resumo.js';

/** Valor em dinheiro vindo do formulário: vazio vira null; negativo, texto ou valor absurdo vira erro. */
function dinheiroOuNulo(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new Error('o preço pago precisa ser um número maior ou igual a zero');
  if (n > 1_000_000) throw new Error('o preço pago está alto demais — confira o valor');
  return n;
}

/** Variante e condição são texto livre da tela: vazio vira null, e o tamanho tem teto (o banco não é depósito de texto). */
function textoCurtoOuNulo(valor, campo) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const t = String(valor).trim();
  if (t.length > 40) throw new Error(`${campo} longa demais (máximo 40 caracteres)`);
  return t || null;
}

/** Data de aquisição no formato AAAA-MM-DD, existente e que não seja do futuro. */
function dataOuNula(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const t = String(valor).trim();
  const d = new Date(`${t}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
    throw new Error('data de aquisição inválida — use o formato AAAA-MM-DD');
  }
  if (t > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) throw new Error('a data de aquisição não pode ser no futuro');
  return t;
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
      // O id vai para a URL da API externa: só o formato dos ids da pokemontcg.io ("swsh4-25", "sv3pt5-173") passa.
      if (typeof cartaId !== 'string' || !/^[A-Za-z0-9.-]{1,40}$/.test(cartaId)) {
        return res.status(400).json({ erro: 'carta inválida' });
      }

      // Valida tudo ANTES de ir à API externa: dado ruim não pode custar uma chamada de rede.
      const dados = {
        usuarioId: req.usuario.id,
        cartaId,
        quantidade: Number(quantidade),
        variante: textoCurtoOuNulo(variante, 'variante'),
        condicao: textoCurtoOuNulo(condicao, 'condição'),
        precoPagoUsd: dinheiroOuNulo(precoPagoUsd),
        precoPagoBrl: dinheiroOuNulo(precoPagoBrl),
        adquiridoEm: dataOuNula(adquiridoEm),
      };
      colecaoRepo.validarQuantidade(dados.quantidade);

      // Garante a carta em cache antes de referenciá-la (colecao_item.carta_id é FK).
      if (!cartasRepo.obter(cartaId)) {
        let cartaApi;
        try {
          cartaApi = await obterCarta(cartaId);
        } catch (erro) {
          // A mensagem da pokemontcg.io é interna: a pessoa só precisa saber se a carta não existe ou se foi a rede.
          const naoExiste = /respondeu 404/.test(erro.message);
          return res.status(naoExiste ? 404 : 502).json({ erro: naoExiste ? 'carta não encontrada' : 'não consegui buscar a carta agora — tente de novo em instantes' });
        }
        if (!cartaApi?.id) return res.status(404).json({ erro: 'carta não encontrada' });
        cartasRepo.salvar(cartaApi);
      }

      res.status(201).json({ item: colecaoRepo.adicionar(dados) });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });

  rotas.patch('/colecao/:id', (req, res) => {
    try {
      const { quantidade, variante, condicao, precoPagoUsd, precoPagoBrl, adquiridoEm } = req.body ?? {};
      const item = colecaoRepo.atualizar(req.params.id, req.usuario.id, {
        quantidade: quantidade !== undefined ? Number(quantidade) : undefined,
        variante: textoCurtoOuNulo(variante, 'variante'),
        condicao: textoCurtoOuNulo(condicao, 'condição'),
        precoPagoUsd: precoPagoUsd !== undefined ? dinheiroOuNulo(precoPagoUsd) : undefined,
        precoPagoBrl: precoPagoBrl !== undefined ? dinheiroOuNulo(precoPagoBrl) : undefined,
        adquiridoEm: dataOuNula(adquiridoEm),
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
