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

export async function obterCarta(id) {
  const dados = await chamar(`/cards/${encodeURIComponent(id)}`);
  return dados.data;
}
