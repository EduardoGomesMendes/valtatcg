import { db } from '../db/index.js';
import { precoDaVariante } from './cartas.repo.js';
import { fatorDoEstado, estadoCanonico } from './estados.js';

/**
 * Os itens da coleção, já com o valor de CADA UM:
 *   preco_mercado_usd  preço padrão da carta (a variante comum, estado quase perfeito)
 *   preco_variante_usd preço da variante que a pessoa marcou (sem marcar, o padrão)
 *   fator_estado       fração do preço Near Mint que o estado da carta vale (1 = sem desconto)
 *   preco_estimado_usd preço da variante × fator do estado: é o que entra no valor da coleção (uma ESTIMATIVA)
 *   preco_data         dia em que a API atualizou o preço
 */
export function listar(usuarioId) {
  const linhas = db.prepare(`
    SELECT ci.*, cc.nome, cc.set_nome, cc.numero, cc.raridade,
           cc.imagem_pequena, cc.imagem_grande, cc.preco_mercado_usd,
           cc.precos_variantes, cc.preco_data_api AS preco_data
    FROM colecao_item ci
    JOIN carta_cache cc ON cc.id = ci.carta_id
    WHERE ci.usuario_id = ?
    ORDER BY ci.criado_em DESC
  `).all(Number(usuarioId));

  return linhas.map(({ precos_variantes: variantes, ...item }) => {
    const unitario = precoDaVariante({ precos_variantes: variantes, preco_mercado_usd: item.preco_mercado_usd }, item.variante);
    const fator = fatorDoEstado(item.condicao);
    return {
      ...item,
      condicao: estadoCanonico(item.condicao) ?? item.condicao,
      preco_variante_usd: unitario,
      fator_estado: fator,
      preco_estimado_usd: unitario === null || unitario === undefined ? null : unitario * fator,
    };
  });
}

export function obter(id, usuarioId) {
  return db.prepare('SELECT * FROM colecao_item WHERE id = ? AND usuario_id = ?')
    .get(Number(id), Number(usuarioId)) ?? null;
}

const QUANTIDADE_MAXIMA = 100_000;

export function validarQuantidade(quantidade) {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error('quantidade precisa ser um número inteiro maior que zero');
  }
  // Sem teto, uma quantidade absurda estoura o valor do portfólio e o gráfico.
  if (quantidade > QUANTIDADE_MAXIMA) throw new Error(`quantidade máxima por item: ${QUANTIDADE_MAXIMA.toLocaleString('pt-BR')}`);
}

export function adicionar({ usuarioId, cartaId, quantidade, variante, condicao, precoPagoUsd, precoPagoBrl, adquiridoEm }) {
  validarQuantidade(quantidade);
  const info = db.prepare(`
    INSERT INTO colecao_item (usuario_id, carta_id, quantidade, variante, condicao, preco_pago_usd, preco_pago_brl, adquirido_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(usuarioId), cartaId, quantidade,
    variante ?? null, condicao ?? null, precoPagoUsd ?? null, precoPagoBrl ?? null, adquiridoEm ?? null,
  );
  return db.prepare('SELECT * FROM colecao_item WHERE id = ?').get(info.lastInsertRowid);
}

export function atualizar(id, usuarioId, { quantidade, variante, condicao, precoPagoUsd, precoPagoBrl, adquiridoEm }) {
  const alvo = obter(id, usuarioId);
  if (!alvo) throw new Error('item não encontrado');

  const sets = [];
  const valores = [];

  if (quantidade !== undefined) {
    validarQuantidade(quantidade);
    sets.push('quantidade = ?');
    valores.push(quantidade);
  }
  if (variante !== undefined) { sets.push('variante = ?'); valores.push(variante); }
  if (condicao !== undefined) { sets.push('condicao = ?'); valores.push(condicao); }
  if (precoPagoUsd !== undefined) { sets.push('preco_pago_usd = ?'); valores.push(precoPagoUsd); }
  if (precoPagoBrl !== undefined) { sets.push('preco_pago_brl = ?'); valores.push(precoPagoBrl); }
  if (adquiridoEm !== undefined) { sets.push('adquirido_em = ?'); valores.push(adquiridoEm); }

  if (!sets.length) return alvo;

  db.prepare(`UPDATE colecao_item SET ${sets.join(', ')} WHERE id = ?`).run(...valores, Number(id));
  return obter(id, usuarioId);
}

export function remover(id, usuarioId) {
  db.prepare('DELETE FROM colecao_item WHERE id = ? AND usuario_id = ?').run(Number(id), Number(usuarioId));
}

/** Ids distintos de carta que aparecem em alguma coleção — é o que o job de preço atualiza. */
export function cartasDistintasPossuidas() {
  return db.prepare('SELECT DISTINCT carta_id FROM colecao_item').all().map((l) => l.carta_id);
}
