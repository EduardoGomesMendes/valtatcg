import { db, agora } from '../db/index.js';

/** O repositório do painel do mercado: a única parte que fala com o banco. */

export function salvar({ id, nome, colecao, numero, raridade, imagem, precoUsd, tcgAtualizadoEm, media7, media30, cmAtualizadoEm }) {
  db.prepare(`
    INSERT INTO mercado_carta (id, nome, colecao, numero, raridade, imagem, preco_usd, tcg_atualizado_em,
                               cm_media7_eur, cm_media30_eur, cm_atualizado_em, consultado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nome = excluded.nome, colecao = excluded.colecao, numero = excluded.numero, raridade = excluded.raridade,
      imagem = excluded.imagem, preco_usd = excluded.preco_usd, tcg_atualizado_em = excluded.tcg_atualizado_em,
      cm_media7_eur = excluded.cm_media7_eur, cm_media30_eur = excluded.cm_media30_eur,
      cm_atualizado_em = excluded.cm_atualizado_em, consultado_em = excluded.consultado_em
  `).run(
    id, nome, colecao ?? null, numero ?? null, raridade ?? null, imagem ?? null, precoUsd ?? null,
    tcgAtualizadoEm ?? null, media7 ?? null, media30 ?? null, cmAtualizadoEm ?? null, agora(),
  );
}

/**
 * Dos ids que queremos acompanhar, os que precisam de uma consulta nova: os que nunca foram buscados primeiro, depois
 * os mais antigos, e só os consultados há mais de `horas`. É isso que torna o job retomável (reiniciar o servidor no
 * meio não refaz o que já foi feito).
 */
export function idsParaAtualizar(ids, { horas = 20, limite = 2500 } = {}) {
  const consultados = new Map(
    db.prepare('SELECT id, consultado_em FROM mercado_carta').all().map((l) => [l.id, l.consultado_em]),
  );
  const corte = new Date(Date.now() - horas * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
  return ids
    .filter((id) => !consultados.has(id) || consultados.get(id) < corte)
    .sort((a, b) => (consultados.get(a) ?? '').localeCompare(consultados.get(b) ?? ''))
    .slice(0, limite);
}

export function todas() {
  return db.prepare('SELECT * FROM mercado_carta').all();
}

/** Última vez que alguma carta foi consultada (para o painel dizer "atualizado em"). */
export function ultimaConsulta() {
  return db.prepare('SELECT MAX(consultado_em) AS t FROM mercado_carta').get().t ?? null;
}

/** Tira do painel as cartas que saíram da lista de acompanhadas (ex.: a raridade foi corrigida na fonte). */
export function removerForaDaLista(ids) {
  const manter = new Set(ids);
  const apagar = db.prepare('SELECT id FROM mercado_carta').all().map((l) => l.id).filter((id) => !manter.has(id));
  const del = db.prepare('DELETE FROM mercado_carta WHERE id = ?');
  for (const id of apagar) del.run(id);
  return apagar.length;
}

/**
 * As cartas que mais gente do ValtaTCG cadastrou nos últimos dias. É um dado NOSSO e só aparece agregado: conta de
 * pessoas diferentes, e só entra a carta com `minimoDePessoas` ou mais (uma carta com 1 pessoa mostraria o que ela faz).
 */
export function maisAdicionadas({ dias = 7, minimoDePessoas = 2, limite = 6 } = {}) {
  return db.prepare(`
    SELECT cc.id, cc.nome, cc.set_nome AS colecao, cc.numero, cc.raridade, cc.imagem_pequena AS imagem,
           cc.preco_mercado_usd AS preco_usd, COUNT(DISTINCT ci.usuario_id) AS pessoas
    FROM colecao_item ci
    JOIN carta_cache cc ON cc.id = ci.carta_id
    WHERE ci.criado_em >= datetime('now', ?)
    GROUP BY ci.carta_id
    HAVING COUNT(DISTINCT ci.usuario_id) >= ?
    ORDER BY pessoas DESC, cc.nome
    LIMIT ?
  `).all(`-${Number(dias)} days`, Number(minimoDePessoas), Number(limite));
}
