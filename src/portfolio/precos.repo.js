import { db } from '../db/index.js';

export function registrarSnapshot(cartaId, precoUsd, data = new Date().toISOString().slice(0, 10)) {
  db.prepare(`
    INSERT INTO preco_historico (carta_id, data, preco_mercado_usd)
    VALUES (?, ?, ?)
    ON CONFLICT(carta_id, data) DO UPDATE SET preco_mercado_usd = excluded.preco_mercado_usd
  `).run(cartaId, data, precoUsd);
}

export function historico(cartaId, dias = 90) {
  return db.prepare(`
    SELECT data, preco_mercado_usd FROM preco_historico
    WHERE carta_id = ? AND data >= date('now', ?)
    ORDER BY data ASC
  `).all(cartaId, `-${dias} days`);
}

/*
  Série somada do valor do portfólio do usuário, dia a dia.

  Simplificação de v1: soma o preço de todo dia com preço gravado, mesmo para
  antes de a carta ter entrado na coleção (não filtra por colecao_item.criado_em).
  Isso é aceitável porque o histórico só começa a existir quando a própria
  carta entra em alguma coleção — na prática a distorção é de no máximo
  algumas horas, até o job de preço rodar pela primeira vez.
*/
export function serieDoPortfolio(usuarioId, dias = 90) {
  return db.prepare(`
    SELECT ph.data AS data, SUM(ph.preco_mercado_usd * ci.quantidade) AS valor
    FROM preco_historico ph
    JOIN colecao_item ci ON ci.carta_id = ph.carta_id AND ci.usuario_id = ?
    WHERE ph.data >= date('now', ?)
    GROUP BY ph.data
    ORDER BY ph.data ASC
  `).all(Number(usuarioId), `-${dias} days`);
}
