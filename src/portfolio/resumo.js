/*
  Resumo da coleção (valor atual, custo, ganho, gráfico).

  Preços vêm em dólar; o custo, daqui para frente, é guardado em reais (`preco_pago_brl`) — assim ele não
  muda sozinho quando o dólar sobe ou desce. Itens antigos só têm `preco_pago_usd`: valem pela cotação de hoje.
  Sem nenhuma cotação disponível, o resumo sai em dólar e a tela avisa.
*/

/**
 * @param {object[]} itens linhas de colecao_item (com preco_mercado_usd da carta)
 * @param {number|null} taxa dólar→real de hoje
 * @param {{data: string, valor: number}[]} serie valor da coleção por dia, em dólar
 * @param {(data: string) => number|null} taxaDoDia cotação guardada para cada data
 */
export function calcularResumo({ itens, taxa, serie, taxaDoDia = () => null }) {
  let valorUsd = 0;
  let custoUsd = 0;
  let custoBrl = 0;
  for (const item of itens) {
    valorUsd += (item.preco_mercado_usd ?? 0) * item.quantidade;
    if (item.preco_pago_brl !== null && item.preco_pago_brl !== undefined) {
      custoBrl += item.preco_pago_brl * item.quantidade;
    } else {
      custoUsd += (item.preco_pago_usd ?? 0) * item.quantidade;
    }
  }

  if (!taxa) {
    return { moeda: 'USD', taxa: null, custo: custoUsd, valorAtual: valorUsd, ganho: valorUsd - custoUsd, serie };
  }

  const valorAtual = valorUsd * taxa;
  const custo = custoBrl + custoUsd * taxa;
  return {
    moeda: 'BRL',
    taxa,
    custo,
    valorAtual,
    ganho: valorAtual - custo,
    // Cada ponto do gráfico usa a cotação do próprio dia; antes da primeira cotação guardada, a de hoje.
    serie: serie.map((p) => ({ data: p.data, valor: p.valor * (taxaDoDia(p.data) ?? taxa) })),
  };
}
