/*
  As regras do painel do mercado, sem banco e sem rede (por isso testáveis).
  Cada função recebe as linhas de mercado_carta e devolve a lista já ordenada.
*/

/** Abaixo disto (euro, média de 30 dias) a carta "sobe 50%" porque foi de 4 para 6 centavos: é ruído, não mercado. */
export const PRECO_MINIMO_EUR = 3;
/** Variação menor que isto não é movimento: é a oscilação normal de um dia para o outro. */
export const VARIACAO_MINIMA = 0.03;
/** Dado que a própria fonte não atualiza há mais que isto não entra: melhor um painel menor do que um "em alta" velho. */
export const DIAS_DE_VALIDADE = 4;

const DIA_MS = 86_400_000;

/** "2026-11-10T23:49:36.534Z" (da fonte) → ainda vale? Ilegível conta como vencido. */
export function estaFresco(texto, agora = Date.now()) {
  const t = Date.parse(texto ?? '');
  return Number.isFinite(t) && agora - t <= DIAS_DE_VALIDADE * DIA_MS;
}

/** Variação da média de 7 dias frente à de 30 (0,12 = subiu 12%); null se a carta não tem os dois números. */
export function variacaoDe(linha) {
  if (!(linha?.cm_media7_eur > 0) || !(linha?.cm_media30_eur > 0)) return null;
  return linha.cm_media7_eur / linha.cm_media30_eur - 1;
}

function comVariacao(linhas, agora) {
  return linhas
    .filter((l) => l.cm_media30_eur >= PRECO_MINIMO_EUR && estaFresco(l.cm_atualizado_em, agora))
    .map((l) => ({ linha: l, variacao: variacaoDe(l) }))
    .filter((x) => x.variacao !== null);
}

/** As que mais subiram (média de 7 dias contra a de 30). */
export function emAlta(linhas, { limite = 6, agora = Date.now() } = {}) {
  return comVariacao(linhas, agora)
    .filter((x) => x.variacao >= VARIACAO_MINIMA)
    .sort((a, b) => b.variacao - a.variacao)
    .slice(0, limite);
}

/** As que mais caíram. */
export function emQueda(linhas, { limite = 6, agora = Date.now() } = {}) {
  return comVariacao(linhas, agora)
    .filter((x) => x.variacao <= -VARIACAO_MINIMA)
    .sort((a, b) => a.variacao - b.variacao)
    .slice(0, limite);
}

/** As de maior preço de mercado hoje, entre as que o sistema acompanha. */
export function maisValiosas(linhas, { limite = 8, agora = Date.now() } = {}) {
  return linhas
    .filter((l) => l.preco_usd > 0 && estaFresco(l.tcg_atualizado_em, agora))
    .sort((a, b) => b.preco_usd - a.preco_usd)
    .slice(0, limite)
    .map((linha) => ({ linha, variacao: variacaoDe(linha) }));
}
