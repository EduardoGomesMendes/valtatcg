import { api, el, dolar, dataSimples } from './api.js';

/*
  Moeda das telas. A pokemontcg.io entrega preço em dólar; aqui tudo vira real pela cotação do servidor.
  Se não houver nenhuma cotação (fonte fora do ar e nada guardado), as telas seguem em dólar em vez de quebrar.
*/

let cotacao = null;

/** Busca a cotação uma vez por página. Devolve null se não houver. */
export async function carregarCambio() {
  try {
    cotacao = (await api('/cambio')).cambio ?? null;
  } catch {
    cotacao = null;
  }
  return cotacao;
}

export const cambioAtual = () => cotacao;

const reais = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor que já está em reais (o resumo da coleção vem pronto do servidor). */
export function formatarReais(n) {
  return Number.isFinite(Number(n)) ? reais(n) : '—';
}

/** Preço de uma carta, que chega em dólar, na moeda da tela. */
export function preco(usd) {
  if (usd === null || usd === undefined || !Number.isFinite(Number(usd))) return '—';
  return cotacao ? reais(Number(usd) * cotacao.usdBrl) : dolar(usd);
}

const percentual = (p) => `${Math.abs(p).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** "−R$ 136,79 (−2,02%)" — o sinal acompanha o valor e a porcentagem. */
export function textoDaVariacao(v) {
  const sinal = v.deltaUsd > 0 ? '+' : v.deltaUsd < 0 ? '−' : '';
  return `${sinal}${preco(Math.abs(v.deltaUsd))} (${sinal}${percentual(v.percentual)})`;
}

/** Linha de variação colorida; sem histórico, diz isso em vez de inventar um número. */
export function elementoVariacao(v) {
  if (!v) return el('span', 'text--xs text--muted', 'sem histórico');
  const classe = v.deltaUsd > 0 ? 'text--success' : v.deltaUsd < 0 ? 'text--danger' : 'text--muted';
  const linha = el('span', `text--xs ${classe}`, textoDaVariacao(v));
  linha.title = `Variação desde ${dataSimples(v.desde)}`;
  return linha;
}

/** Texto curto sobre a cotação usada, para o rodapé do resumo. */
export function notaDoCambio() {
  if (!cotacao) return 'Sem cotação do dólar agora — valores em dólar (US$).';
  const base = `Valores em reais pela cotação do dólar de ${dataSimples(cotacao.data)}: ${reais(cotacao.usdBrl)}.`;
  return cotacao.defasada ? `${base} Não foi possível atualizar a cotação agora.` : base;
}
