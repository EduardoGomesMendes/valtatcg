/*
  Resumo da coleção (valor atual, custo, ganho, gráfico).

  Preços vêm em dólar; o custo, daqui para frente, é guardado em reais (`preco_pago_brl`) — assim ele não
  muda sozinho quando o dólar sobe ou desce. Itens antigos só têm `preco_pago_usd`: valem pela cotação de hoje.
  Sem nenhuma cotação disponível, o resumo sai em dólar e a tela avisa.

  Carta SEM preço pago informado não entra na conta do ganho: contar o custo dela como zero faria o valor inteiro
  parecer lucro. O resumo diz quantas ficaram de fora (`itensSemCusto`) para a tela pedir o preço.
*/

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Desde quando a carta conta na coleção: a data da compra, se foi informada e é válida; senão o dia em que entrou. */
export function inicioDoItem(item) {
  if (ISO.test(String(item.adquirido_em ?? ''))) return item.adquirido_em;
  return String(item.criado_em ?? '').slice(0, 10);
}

/**
 * @param {object[]} itens linhas de colecao_item (com preco_mercado_usd da carta)
 * @param {number|null} taxa dólar→real de hoje
 * @param {{data: string, valor: number}[]} serie valor da coleção por dia, em dólar
 * @param {(data: string) => number|null} taxaDoDia cotação guardada para cada data
 */
export function calcularResumo({ itens, taxa, serie, taxaDoDia = () => null }) {
  let valorUsd = 0;
  let valorComCustoBrl = 0; // valor (em dólar) das cartas com preço pago em reais
  let valorComCustoUsd = 0; // idem, com preço pago em dólar (itens antigos)
  let custoUsd = 0;
  let custoBrl = 0;
  let itensSemCusto = 0;
  const comCusto = [];

  for (const item of itens) {
    // O valor do item é a ESTIMATIVA: preço da variante que a pessoa marcou × fator do estado (sem eles, o preço padrão).
    const valorDoItem = (item.preco_estimado_usd ?? item.preco_mercado_usd ?? 0) * item.quantidade;
    valorUsd += valorDoItem;
    if (item.preco_pago_brl !== null && item.preco_pago_brl !== undefined) {
      custoBrl += item.preco_pago_brl * item.quantidade;
      valorComCustoBrl += valorDoItem;
      comCusto.push({ inicio: inicioDoItem(item), brl: item.preco_pago_brl * item.quantidade, usd: 0 });
    } else if (item.preco_pago_usd !== null && item.preco_pago_usd !== undefined) {
      custoUsd += item.preco_pago_usd * item.quantidade;
      valorComCustoUsd += valorDoItem;
      comCusto.push({ inicio: inicioDoItem(item), brl: 0, usd: item.preco_pago_usd * item.quantidade });
    } else {
      itensSemCusto += 1;
    }
  }

  // Quanto a pessoa tinha investido em cada dia do gráfico (só o que já era dela naquele dia).
  // Sem cotação (modo dólar) o que foi pago em reais não tem como entrar: igual ao custo total, que só soma o dólar.
  const custoNoDia = (data, taxaDoCusto, incluirReais) => comCusto
    .filter((c) => c.inicio <= data)
    .reduce((soma, c) => soma + (incluirReais ? c.brl : 0) + c.usd * taxaDoCusto, 0);

  const base = { itensSemCusto, totalItens: itens.length };

  if (!taxa) {
    return {
      ...base,
      moeda: 'USD',
      taxa: null,
      custo: custoUsd,
      valorAtual: valorUsd,
      ganho: valorComCustoUsd - custoUsd,
      serie: serie.map((p) => ({ data: p.data, valor: p.valor, custo: custoNoDia(p.data, 1, false) })),
    };
  }

  const valorAtual = valorUsd * taxa;
  const custo = custoBrl + custoUsd * taxa;
  return {
    ...base,
    moeda: 'BRL',
    taxa,
    custo,
    valorAtual,
    ganho: (valorComCustoBrl + valorComCustoUsd) * taxa - custo,
    // Cada ponto do gráfico usa a cotação do próprio dia; antes da primeira cotação guardada, a de hoje.
    // O custo em reais não depende do dia (o que foi pago em reais não muda); o antigo, em dólar, vale pela cotação de hoje.
    serie: serie.map((p) => ({ data: p.data, valor: p.valor * (taxaDoDia(p.data) ?? taxa), custo: custoNoDia(p.data, taxa, true) })),
  };
}
