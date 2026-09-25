import { db } from '../db/index.js';

export function listar(usuarioId) {
  return db.prepare(`
    SELECT ci.*, cc.nome, cc.set_nome, cc.numero, cc.raridade,
           cc.imagem_pequena, cc.imagem_grande, cc.preco_mercado_usd
    FROM colecao_item ci
    JOIN carta_cache cc ON cc.id = ci.carta_id
    WHERE ci.usuario_id = ?
    ORDER BY ci.criado_em DESC
  `).all(Number(usuarioId));
}

export function obter(id, usuarioId) {
  return db.prepare('SELECT * FROM colecao_item WHERE id = ? AND usuario_id = ?')
    .get(Number(id), Number(usuarioId)) ?? null;
}

function validarQuantidade(quantidade) {
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error('quantidade precisa ser um número inteiro maior que zero');
  }
}

export function adicionar({ usuarioId, cartaId, quantidade, variante, condicao, precoPagoUsd, adquiridoEm }) {
  validarQuantidade(quantidade);
  const info = db.prepare(`
    INSERT INTO colecao_item (usuario_id, carta_id, quantidade, variante, condicao, preco_pago_usd, adquirido_em)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(usuarioId), cartaId, quantidade,
    variante ?? null, condicao ?? null, precoPagoUsd ?? null, adquiridoEm ?? null,
  );
  return db.prepare('SELECT * FROM colecao_item WHERE id = ?').get(info.lastInsertRowid);
}

export function atualizar(id, usuarioId, { quantidade, variante, condicao, precoPagoUsd, adquiridoEm }) {
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
