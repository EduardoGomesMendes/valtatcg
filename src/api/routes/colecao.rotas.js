import { Router } from 'express';
import * as colecaoRepo from '../../portfolio/colecao.repo.js';
import * as precosRepo from '../../portfolio/precos.repo.js';
import * as cartasRepo from '../../portfolio/cartas.repo.js';
import { obterCarta } from '../../pokemontcg/cliente.js';
import { obterTaxa, taxaDoDia } from '../../cambio/cambio.js';
import { calcularResumo } from '../../portfolio/resumo.js';
import * as cota from '../../portfolio/cota.repo.js';
import { ORDEM_VARIANTES } from '../../portfolio/cartas.repo.js';
import { estadoCanonico, listarEstados } from '../../portfolio/estados.js';

/** Limite do plano grátis é 429 com o sinal para a tela oferecer a assinatura; o resto é erro de validação (400). */
function respostaDeErro(res, erro) {
  if (erro instanceof cota.ErroDeCota) {
    return res.status(429).json({ erro: erro.message, limiteDiario: true, cota: erro.cota });
  }
  return res.status(400).json({ erro: erro.message });
}

/** Valor em dinheiro vindo do formulário: vazio vira null; negativo, texto ou valor absurdo vira erro. */
function dinheiroOuNulo(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new Error('o preço pago precisa ser um número maior ou igual a zero');
  if (n > 1_000_000) throw new Error('o preço pago está alto demais — confira o valor');
  return n;
}

/** Variante: uma das que a API de preços conhece (ou vazia = "não sei"). */
function varianteOuNula(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  if (!ORDEM_VARIANTES.includes(valor)) throw new Error('variante inválida');
  return valor;
}

/** Estado de conservação: um da escala oficial (Mint ... Damaged), os nomes antigos viram os novos, vazio = sem estado. */
function estadoOuNulo(valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const canonico = estadoCanonico(valor);
  if (!canonico) throw new Error('estado da carta inválido — escolha um da lista');
  return canonico;
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

  /** A escala de estados com a explicação e o fator da estimativa: a tela monta o campo a partir daqui. */
  rotas.get('/colecao/estados', (req, res) => {
    res.json({ estados: listarEstados() });
  });

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
        variante: varianteOuNula(variante),
        condicao: estadoOuNulo(condicao),
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

      // Plano grátis: gasta a cota do dia AGORA (depois da espera pela API externa, no mesmo bloco síncrono do cadastro),
      // para dois pedidos ao mesmo tempo não passarem juntos pelo limite. Se o cadastro falhar, devolve.
      if (req.gratis) cota.reservar(req.usuario.id, dados.quantidade);
      try {
        res.status(201).json({ item: colecaoRepo.adicionar(dados) });
      } catch (erro) {
        if (req.gratis) cota.devolver(req.usuario.id, dados.quantidade);
        throw erro;
      }
    } catch (erro) {
      respostaDeErro(res, erro);
    }
  });

  rotas.patch('/colecao/:id', (req, res) => {
    let reservado = 0;
    try {
      const { quantidade, variante, condicao, precoPagoUsd, precoPagoBrl, adquiridoEm } = req.body ?? {};
      const atual = colecaoRepo.obter(req.params.id, req.usuario.id);
      const novaQuantidade = quantidade !== undefined ? Number(quantidade) : undefined;

      // Aumentar a quantidade de uma carta que já existe também é cadastrar cartas novas: gasta a cota do grátis.
      // Corrigir preço, condição, data ou diminuir a quantidade é livre (o preço pago é o que torna o ganho real).
      if (req.gratis && atual && novaQuantidade !== undefined && novaQuantidade > atual.quantidade) {
        colecaoRepo.validarQuantidade(novaQuantidade);
        const aMais = novaQuantidade - atual.quantidade;
        cota.reservar(req.usuario.id, aMais);
        reservado = aMais; // só depois de reservar de verdade: se reservar falhar, não há o que devolver no catch
      }

      const item = colecaoRepo.atualizar(req.params.id, req.usuario.id, {
        quantidade: novaQuantidade,
        variante: varianteOuNula(variante),
        condicao: estadoOuNulo(condicao),
        precoPagoUsd: precoPagoUsd !== undefined ? dinheiroOuNulo(precoPagoUsd) : undefined,
        precoPagoBrl: precoPagoBrl !== undefined ? dinheiroOuNulo(precoPagoBrl) : undefined,
        adquiridoEm: dataOuNula(adquiridoEm),
      });
      res.json({ item });
    } catch (erro) {
      if (reservado) cota.devolver(req.usuario.id, reservado);
      respostaDeErro(res, erro);
    }
  });

  rotas.delete('/colecao/:id', (req, res) => {
    // Cadastrou a carta errada hoje e a tirou no mesmo dia? A cota volta (senão um engano custaria o dia inteiro).
    const item = colecaoRepo.obter(req.params.id, req.usuario.id);
    if (item && cota.itemDeHoje(item.id, req.usuario.id)) cota.devolver(req.usuario.id, item.quantidade);
    colecaoRepo.remover(req.params.id, req.usuario.id);
    res.status(204).end();
  });

  return rotas;
}
