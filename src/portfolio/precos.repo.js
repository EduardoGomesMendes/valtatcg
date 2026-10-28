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

  Só conta o preço de um dia a partir de quando a carta entrou na coleção da pessoa. Isso importa porque o histórico
  também é gravado para cartas que apenas apareceram numa busca: sem o filtro, o gráfico mostraria valor de dias
  em que a pessoa ainda nem tinha a carta.
*/
export function serieDoPortfolio(usuarioId, dias = 90) {
  return db.prepare(`
    SELECT ph.data AS data, SUM(ph.preco_mercado_usd * ci.quantidade) AS valor
    FROM preco_historico ph
    JOIN colecao_item ci ON ci.carta_id = ph.carta_id AND ci.usuario_id = ? AND ph.data >= date(ci.criado_em)
    WHERE ph.data >= date('now', ?)
    GROUP BY ph.data
    ORDER BY ph.data ASC
  `).all(Number(usuarioId), `-${dias} days`);
}

/**
 * Variação de preço desde o último dia ANTERIOR a hoje em que a carta tem preço registrado.
 *
 * Só usa dados nossos (preco_historico), nunca os números de variação da Cardmarket que a pokemontcg.io
 * traz: o campo updatedAt deles está parado em 2025, e mostrar isso como "variação de hoje" seria mentira.
 * Carta sem histórico (ainda não foi vista em dois dias diferentes) simplesmente não tem variação.
 *
 * @param {Record<string, number>} precosAtuais preço atual em dólar, por id de carta
 * @returns {Record<string, {desde: string, anteriorUsd: number, deltaUsd: number, percentual: number}>}
 */
export function variacoes(precosAtuais, hoje = new Date().toISOString().slice(0, 10)) {
  const ids = Object.keys(precosAtuais).filter((id) => typeof precosAtuais[id] === 'number');
  const saida = {};
  for (let i = 0; i < ids.length; i += 400) {
    const lote = ids.slice(i, i + 400);
    const marcas = lote.map(() => '?').join(',');
    const linhas = db.prepare(`
      SELECT ph.carta_id AS carta_id, ph.data AS data, ph.preco_mercado_usd AS anterior
        FROM preco_historico ph
        JOIN (SELECT carta_id, MAX(data) AS d FROM preco_historico
               WHERE data < ? AND preco_mercado_usd IS NOT NULL AND carta_id IN (${marcas})
               GROUP BY carta_id) m ON m.carta_id = ph.carta_id AND m.d = ph.data
    `).all(hoje, ...lote);
    for (const l of linhas) {
      if (!(l.anterior > 0)) continue;
      const delta = precosAtuais[l.carta_id] - l.anterior;
      saida[l.carta_id] = { desde: l.data, anteriorUsd: l.anterior, deltaUsd: delta, percentual: (delta / l.anterior) * 100 };
    }
  }
  return saida;
}

/** Apaga o histórico antigo de cartas que ninguém possui (vem das buscas) — o das cartas da coleção fica. */
export function apagarHistoricoDeCartasNaoPossuidas(dias = 60) {
  return db.prepare(
    `DELETE FROM preco_historico WHERE data < date('now', ?) AND carta_id NOT IN (SELECT carta_id FROM colecao_item)`,
  ).run(`-${dias} days`).changes;
}
