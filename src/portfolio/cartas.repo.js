import { db, agora } from '../db/index.js';

/*
  A pokemontcg.io devolve preço por variante (normal, holofoil,
  reverseHolofoil, 1stEditionHolofoil, 1stEditionNormal), só em dólar
  (tcgplayer). O cardmarket vem em euro — misturar as duas moedas num único
  "valor do portfólio" criaria um número sem sentido, então v1 ignora o
  cardmarket e guarda, além do preço padrão da carta, o de CADA variante
  (precos_variantes): a coleção avalia a variante que a pessoa marcou.
*/
/*
  Preço PADRÃO da carta (quando não sabemos qual variante a pessoa tem): a versão comum primeiro. Antes pegávamos a mais
  cara primeiro (holofoil, reverse) e, numa amostra de 250 cartas, 46 das 63 que têm mais de uma variante ficavam com
  o preço ≥ 2× o da mais barata (ex.: Pikachu da Legendary Collection a US$ 1.575 no reverse holo, contra US$ 6,70
  da normal). A variante premium só entra quando a pessoa a marca na carta.
*/
export const ORDEM_VARIANTES = ['normal', 'holofoil', 'reverseHolofoil', '1stEditionNormal', '1stEditionHolofoil'];

/** Preço de mercado (US$) de CADA variante que a API traz: { normal: 6.7, reverseHolofoil: 1574.99 }. */
export function precosPorVariante(cartaApi) {
  const precos = cartaApi?.tcgplayer?.prices ?? {};
  const saida = {};
  for (const variante of ORDEM_VARIANTES) {
    const valor = precos[variante]?.market;
    if (typeof valor === 'number') saida[variante] = valor;
  }
  return saida;
}

/** O preço padrão: o da primeira variante existente, na ordem acima. */
export function escolherPrecoPadrao(variantes) {
  for (const variante of ORDEM_VARIANTES) if (typeof variantes?.[variante] === 'number') return variantes[variante];
  return null;
}

export function extrairPrecoMercado(cartaApi) {
  return escolherPrecoPadrao(precosPorVariante(cartaApi));
}

/** A data em que a API diz ter atualizado o preço ("2026/10/12" → "2026-10-12"), ou null. */
export function dataDoPreco(cartaApi) {
  const t = String(cartaApi?.tcgplayer?.updatedAt ?? '').replaceAll('/', '-').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Preço (US$) da variante da carta em cache; sem variante conhecida, o padrão. */
export function precoDaVariante(carta, variante) {
  let variantes = {};
  try {
    variantes = JSON.parse(carta?.precos_variantes ?? '{}');
  } catch {
    variantes = {};
  }
  return typeof variantes[variante] === 'number' ? variantes[variante] : (carta?.preco_mercado_usd ?? null);
}

export function obter(id) {
  return db.prepare('SELECT * FROM carta_cache WHERE id = ?').get(id) ?? null;
}

/** Grava (ou atualiza) o cache local a partir da resposta crua da API. */
export function salvar(cartaApi) {
  const variantes = precosPorVariante(cartaApi);
  const preco = escolherPrecoPadrao(variantes);
  db.prepare(`
    INSERT INTO carta_cache (
      id, nome, set_id, set_nome, numero, raridade,
      imagem_pequena, imagem_grande, preco_mercado_usd, preco_atualizado_em, dados_json, precos_variantes, preco_data_api
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      dados_json = excluded.dados_json,
      precos_variantes = excluded.precos_variantes,
      preco_data_api = excluded.preco_data_api
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
    JSON.stringify(variantes),
    dataDoPreco(cartaApi),
  );
  return obter(cartaApi.id);
}

/**
 * Roda no boot: as cartas que já estavam em cache ganham os preços por variante e a data do preço, e o preço PADRÃO é
 * recalculado pela ordem nova. Se o padrão mudou, o histórico da carta foi gravado em outra base (outra variante) e
 * misturá-lo mostraria uma queda falsa de 99%: ele é apagado. Idempotente (só toca linhas ainda sem os preços por variante).
 */
export function migrarPrecosDoCache() {
  const linhas = db.prepare('SELECT id, preco_mercado_usd, dados_json FROM carta_cache WHERE precos_variantes IS NULL').all();
  let mudaram = 0;
  for (const l of linhas) {
    let api = null;
    try {
      api = l.dados_json ? JSON.parse(l.dados_json) : null;
    } catch {
      api = null;
    }
    const variantes = precosPorVariante(api);
    const novo = api ? escolherPrecoPadrao(variantes) : l.preco_mercado_usd;
    db.prepare('UPDATE carta_cache SET precos_variantes = ?, preco_data_api = ?, preco_mercado_usd = ? WHERE id = ?')
      .run(JSON.stringify(variantes), dataDoPreco(api), novo, l.id);
    if (api && novo !== l.preco_mercado_usd) {
      db.prepare('DELETE FROM preco_historico WHERE carta_id = ?').run(l.id);
      mudaram += 1;
    }
  }
  return { conferidas: linhas.length, padraoMudou: mudaram };
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
