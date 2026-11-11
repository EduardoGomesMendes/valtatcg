import { escolherPrecoPadrao } from '../portfolio/cartas.repo.js';

/*
  As contas do fichário, sem banco e sem rede (por isso são fáceis de testar):
  dado o cadastro da coleção, as cartas dela e os itens que o usuário tem, devolve cada carta com "tenho / falta" e os totais.
*/

/** Ordena por número impresso: 1, 2, ..., 10 (e não "1, 10, 100, 2"); as cartas com letra no número (TG01, GG05) vão depois. */
export function compararNumeros(a, b) {
  const ra = /^(\D*)(\d+)(.*)$/.exec(String(a ?? '')) ?? ['', String(a ?? ''), '0', ''];
  const rb = /^(\D*)(\d+)(.*)$/.exec(String(b ?? '')) ?? ['', String(b ?? ''), '0', ''];
  if (ra[1] !== rb[1]) {
    if (ra[1] === '') return -1;
    if (rb[1] === '') return 1;
    return ra[1] < rb[1] ? -1 : 1;
  }
  const diferenca = Number(ra[2]) - Number(rb[2]);
  if (diferenca !== 0) return diferenca;
  return ra[3] < rb[3] ? -1 : ra[3] > rb[3] ? 1 : 0;
}

/**
 * "Principal" = as cartas numeradas da coleção (de 1 até o total impresso na carta, o "165" de "025/165").
 * As secretas (166 em diante) e as de numeração própria (TG01, GG05) ficam de fora: é como o colecionador conta
 * "fechei a coleção". Sem total impresso conhecido, tudo é principal.
 */
export function ehPrincipal(numero, totalImpresso) {
  if (!totalImpresso) return true;
  return /^\d+$/.test(String(numero ?? '')) && Number(numero) <= totalImpresso;
}

function precoPadraoDaCarta(carta) {
  let variantes = {};
  try {
    variantes = JSON.parse(carta.precos_variantes ?? '{}');
  } catch {
    variantes = {};
  }
  // Mesma regra da busca e da coleção: a versão comum primeiro; sem variantes guardadas, o preço único do cache.
  return escolherPrecoPadrao(variantes) ?? carta.preco_mercado_usd ?? null;
}

const soma = (valores) => valores.reduce((total, v) => total + v, 0);

/**
 * @param {object} p
 * @param {object} p.colecao   linha de colecao_set
 * @param {object[]} p.cartas  linhas de carta_cache da coleção
 * @param {object[]} p.itens   itens do usuário nesta coleção (id, carta_id, quantidade, preco_pago_brl, preco_pago_usd)
 * @param {Record<string, number>} [p.valores] valor em US$ do que o usuário tem de cada carta (variante e estado já considerados)
 */
export function montarFichario({ colecao, cartas, itens, valores = {} }) {
  const porCarta = new Map();
  for (const item of itens) {
    const lista = porCarta.get(item.carta_id) ?? [];
    lista.push(item);
    porCarta.set(item.carta_id, lista);
  }

  const ordenadas = [...cartas].sort((a, b) => compararNumeros(a.numero, b.numero) || a.nome.localeCompare(b.nome));
  const fichas = ordenadas.map((carta) => {
    const meus = porCarta.get(carta.id) ?? [];
    return {
      id: carta.id,
      nome: carta.nome,
      numero: carta.numero,
      raridade: carta.raridade,
      imagem: carta.imagem_pequena,
      precoUsd: precoPadraoDaCarta(carta),
      principal: ehPrincipal(carta.numero, colecao.total_impresso),
      tenho: meus.length > 0,
      quantidade: soma(meus.map((i) => i.quantidade)),
      itens: meus.map((i) => ({ id: i.id, quantidade: i.quantidade, comPrecoPago: i.preco_pago_brl != null || i.preco_pago_usd != null })),
    };
  });

  const faltam = fichas.filter((f) => !f.tenho);
  const principais = fichas.filter((f) => f.principal);
  const faltamPrincipais = principais.filter((f) => !f.tenho);
  const custo = (lista) => soma(lista.map((f) => f.precoUsd ?? 0));

  return {
    colecao: {
      id: colecao.id,
      nome: colecao.nome,
      serie: colecao.serie,
      totalImpresso: colecao.total_impresso,
      lancamento: colecao.lancamento,
      logo: colecao.logo,
      simbolo: colecao.simbolo,
    },
    cartas: fichas,
    resumo: {
      total: fichas.length,
      tenho: fichas.length - faltam.length,
      faltam: faltam.length,
      repetidas: soma(fichas.map((f) => Math.max(0, f.quantidade - 1))),
      principal: {
        total: principais.length,
        tenho: principais.length - faltamPrincipais.length,
        custoParaCompletarUsd: custo(faltamPrincipais),
        faltamSemPreco: faltamPrincipais.filter((f) => f.precoUsd === null).length,
      },
      custoParaCompletarUsd: custo(faltam),
      faltamSemPreco: faltam.filter((f) => f.precoUsd === null).length,
      valorQueTenhoUsd: soma(fichas.map((f) => valores[f.id] ?? 0)),
    },
  };
}
