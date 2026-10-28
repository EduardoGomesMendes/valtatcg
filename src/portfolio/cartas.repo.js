import { db, agora } from '../db/index.js';

/*
  A pokemontcg.io devolve preço por variante (normal, holofoil,
  reverseHolofoil, 1stEditionHolofoil, 1stEditionNormal), só em dólar
  (tcgplayer). O cardmarket vem em euro — misturar as duas moedas num único
  "valor do portfólio" criaria um número sem sentido, então v1 ignora o
  cardmarket e guarda um preço representativo em USD por carta (não por
  variante que o usuário possui — isso fica para uma v2 que precificar por
  variante escolhida).
*/
const ORDEM_VARIANTES = ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal'];

export function extrairPrecoMercado(cartaApi) {
  const precos = cartaApi?.tcgplayer?.prices;
  if (!precos) return null;
  for (const variante of ORDEM_VARIANTES) {
    const valor = precos[variante]?.market;
    if (typeof valor === 'number') return valor;
  }
  return null;
}

export function obter(id) {
  return db.prepare('SELECT * FROM carta_cache WHERE id = ?').get(id) ?? null;
}

/** Grava (ou atualiza) o cache local a partir da resposta crua da API. */
export function salvar(cartaApi) {
  const preco = extrairPrecoMercado(cartaApi);
  db.prepare(`
    INSERT INTO carta_cache (
      id, nome, set_id, set_nome, numero, raridade,
      imagem_pequena, imagem_grande, preco_mercado_usd, preco_atualizado_em, dados_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nome = excluded.nome,
      set_id = excluded.set_id,
      set_nome = excluded.set_nome,
      numero = excluded.numero,
      raridade = excluded.raridade,
      imagem_pequena = excluded.imagem_pequena,
      imagem_grande = excluded.imagem_grande,
      preco_mercado_usd = excluded.preco_mercado_usd,
      preco_atualizado_em = excluded.preco_atualizado_em,
      dados_json = excluded.dados_json
  `).run(
    cartaApi.id,
    cartaApi.name,
    cartaApi.set?.id ?? null,
    cartaApi.set?.name ?? null,
    cartaApi.number ?? null,
    cartaApi.rarity ?? null,
    cartaApi.images?.small ?? null,
    cartaApi.images?.large ?? null,
    preco,
    preco !== null ? agora() : null,
    JSON.stringify(cartaApi),
  );
  return obter(cartaApi.id);
}

/** Registra que a carta apareceu para alguém agora (busca ou página da carta). */
export function marcarVista(id) {
  db.prepare('UPDATE carta_cache SET visto_em = ? WHERE id = ?').run(agora(), id);
}

/**
 * Cartas vistas nos últimos `dias` dias que ninguém possui. As possuídas já têm o preço renovado todo dia pelo job;
 * as só-vistas precisam disso também, senão a busca mostra "sem histórico" até alguém procurar a mesma carta de novo.
 */
export function vistasRecentementeSemDono(dias = 14) {
  return db.prepare(`
    SELECT id FROM carta_cache
    WHERE visto_em >= datetime('now', ?)
      AND id NOT IN (SELECT carta_id FROM colecao_item)
  `).all(`-${dias} days`).map((l) => l.id);
}

export function atualizarPreco(id, preco) {
  db.prepare('UPDATE carta_cache SET preco_mercado_usd = ?, preco_atualizado_em = ? WHERE id = ?')
    .run(preco, agora(), id);
}
