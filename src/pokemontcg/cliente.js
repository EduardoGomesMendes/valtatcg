import { config } from '../config.js';

const BASE_URL = 'https://api.pokemontcg.io/v2';

function cabecalhos() {
  const h = {};
  if (config.pokemontcg.chave) h['X-Api-Key'] = config.pokemontcg.chave;
  return h;
}

/*
  Na prática, a pokemontcg.io devolve 500/502 com bastante frequência mesmo em
  consultas válidas — testado com e sem X-Api-Key, a taxa de falha por
  chamada ficou perto de 40-60% em alguns momentos. Com 5 tentativas, a chance
  de todas falharem seguidas fica baixa; erro de verdade (consulta inválida,
  404) continua aparecendo na hora, sem esperar as repetições.
*/
const TENTATIVAS = 5;
const ESPERA_MS = 300;

async function chamar(caminho) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    const resposta = await fetch(`${BASE_URL}${caminho}`, { headers: cabecalhos() });
    if (resposta.ok) return resposta.json();

    ultimoErro = new Error(`pokemontcg.io respondeu ${resposta.status} para ${caminho}`);
    if (resposta.status < 500 || tentativa === TENTATIVAS) throw ultimoErro;
    await new Promise((resolve) => setTimeout(resolve, ESPERA_MS * tentativa));
  }
  throw ultimoErro;
}

/**
 * Busca cartas por nome.
 *
 * A pokemontcg.io não aceita "*" dentro de aspas (`name:"pika*"` derruba a
 * busca com 500/502, testado na prática) — só funciona sem aspas. Isso
 * significa que não dá para combinar frase exata + prefixo ao mesmo tempo.
 * Solução: uma palavra vira busca por prefixo (`name:charizard*`); mais de
 * uma palavra vira frase exata entre aspas, sem wildcard (`name:"Pikachu V"`).
 */
export async function buscarCartas({ nome, pagina = 1, tamanhoPagina = 20 }) {
  const termo = String(nome ?? '').trim();
  if (!termo) return { cartas: [], total: 0 };

  const consulta = encodeURIComponent(
    /\s/.test(termo) ? `name:"${termo}"` : `name:${termo}*`,
  );
  const dados = await chamar(
    `/cards?q=${consulta}&page=${pagina}&pageSize=${tamanhoPagina}&orderBy=-set.releaseDate`,
  );
  return { cartas: dados.data ?? [], total: dados.totalCount ?? 0 };
}

/**
 * Busca pelo número impresso na carta ("025/165" → número 25 de uma coleção com 165 cartas).
 *
 * É o jeito mais confiável de achar uma carta lida por foto: o número é curto e a leitura costuma
 * acertar, enquanto o nome sai errado com brilho no holofoil. Número + total da coleção quase sempre
 * identifica uma carta só. O chamador valida o formato; aqui só tiramos os zeros à esquerda, porque
 * a API guarda "25" e não "025".
 */
export async function buscarCartasPorNumero({ numero, totalImpresso, nome }) {
  const limpo = String(numero ?? '').replace(/^0+(?=\d)/, '');
  if (!limpo) return { cartas: [], total: 0 };
  const partes = [`number:${limpo}`];
  if (totalImpresso) partes.push(`set.printedTotal:${Number(totalImpresso)}`);
  // Nome opcional ("pikachu 25"): fica só com letras, dígitos e pontuação de nome, para ninguém
  // injetar operadores da consulta da API (aspas, "*", ":") no texto digitado.
  const nomeLimpo = String(nome ?? '').replace(/[^\p{L}\p{N}\s'’.&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (nomeLimpo) partes.push(/\s/.test(nomeLimpo) ? `name:"${nomeLimpo}"` : `name:${nomeLimpo}*`);
  const dados = await chamar(
    `/cards?q=${encodeURIComponent(partes.join(' '))}&pageSize=20&orderBy=-set.releaseDate`,
  );
  return { cartas: dados.data ?? [], total: dados.totalCount ?? 0 };
}

/** Várias cartas numa chamada só (o job diário não pode gastar uma chamada por carta). Máximo 25 ids. */
export async function obterCartasPorIds(ids) {
  // Os ids vêm do nosso banco, mas entram numa consulta da API externa: só letras, dígitos, "-" e "." passam.
  const validos = ids.filter((id) => /^[A-Za-z0-9.-]+$/.test(id)).slice(0, 25);
  if (!validos.length) return [];
  const consulta = validos.map((id) => `id:${id}`).join(' OR ');
  const dados = await chamar(`/cards?q=${encodeURIComponent(consulta)}&pageSize=${validos.length}`);
  return dados.data ?? [];
}

export async function obterCarta(id) {
  const dados = await chamar(`/cards/${encodeURIComponent(id)}`);
  return dados.data;
}
