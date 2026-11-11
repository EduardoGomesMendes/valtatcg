import { db, agora, emTransacao } from '../db/index.js';

/*
  Fichário: o cadastro das coleções (sets) e as contas de "quantas eu tenho".
  Este repositório é a única parte do fichário que fala com o banco.
*/

/** "2026/11/06" (formato da API) → "2026-11-06"; o que não for data vira null. */
function dataIso(valor) {
  const t = String(valor ?? '').replaceAll('/', '-').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Grava (ou atualiza) as coleções vindas da API. Não mexe em cartas_sync_em: isso é do que foi baixado de cada coleção. */
export function salvarColecoes(colecoesApi) {
  const gravar = db.prepare(`
    INSERT INTO colecao_set (id, nome, serie, total, total_impresso, lancamento, logo, simbolo, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nome = excluded.nome, serie = excluded.serie, total = excluded.total, total_impresso = excluded.total_impresso,
      lancamento = excluded.lancamento, logo = excluded.logo, simbolo = excluded.simbolo, atualizado_em = excluded.atualizado_em
  `);
  const agoraIso = agora();
  emTransacao(() => {
    for (const s of colecoesApi) {
      if (!s?.id || !s?.name) continue;
      gravar.run(
        s.id, s.name, s.series ?? null, Number(s.total) || 0, Number(s.printedTotal) || 0,
        dataIso(s.releaseDate), s.images?.logo ?? null, s.images?.symbol ?? null, agoraIso,
      );
    }
  });
}

export function obterColecao(id) {
  return db.prepare('SELECT * FROM colecao_set WHERE id = ?').get(id) ?? null;
}

/** Quantas coleções há e quando a lista foi atualizada pela última vez (para saber se está velha). */
export function situacaoDaLista() {
  const l = db.prepare('SELECT COUNT(*) AS n, MAX(atualizado_em) AS ultima FROM colecao_set').get();
  return { quantidade: l.n, atualizadaEm: l.ultima };
}

/** As coleções, da mais nova para a mais antiga, cada uma com quantas cartas DIFERENTES o usuário tem dela. */
export function listarComProgresso(usuarioId) {
  return db.prepare(`
    SELECT cs.id, cs.nome, cs.serie, cs.total, cs.total_impresso AS totalImpresso, cs.lancamento, cs.logo, cs.simbolo,
           COALESCE(t.tenho, 0) AS tenho
    FROM colecao_set cs
    LEFT JOIN (
      SELECT cc.set_id AS set_id, COUNT(DISTINCT ci.carta_id) AS tenho
      FROM colecao_item ci
      JOIN carta_cache cc ON cc.id = ci.carta_id
      WHERE ci.usuario_id = ?
      GROUP BY cc.set_id
    ) t ON t.set_id = cs.id
    ORDER BY cs.lancamento DESC, cs.nome
  `).all(Number(usuarioId));
}

export function marcarCartasBaixadas(id) {
  db.prepare('UPDATE colecao_set SET cartas_sync_em = ? WHERE id = ?').run(agora(), id);
}

/** As cartas da coleção que estão no cache (as baixadas da API e as que a pessoa já cadastrou). */
export function cartasDaColecao(id) {
  return db.prepare(`
    SELECT id, nome, numero, raridade, imagem_pequena, preco_mercado_usd, precos_variantes, preco_data_api
    FROM carta_cache WHERE set_id = ?
  `).all(id);
}

/** Os itens da coleção do usuário que são cartas desta coleção: id do item, carta, quantidade e se tem preço pago. */
export function itensDoUsuarioNaColecao(usuarioId, id) {
  return db.prepare(`
    SELECT ci.id, ci.carta_id, ci.quantidade, ci.preco_pago_brl, ci.preco_pago_usd
    FROM colecao_item ci
    JOIN carta_cache cc ON cc.id = ci.carta_id
    WHERE ci.usuario_id = ? AND cc.set_id = ?
  `).all(Number(usuarioId), id);
}
