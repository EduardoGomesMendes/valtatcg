import { api, avisar, avisarComAssinatura, el, limpar, dolar, dataSimples, prepararCabecalho } from './api.js';
import { carregarCambio, cambioAtual, preco, formatarReais, elementoVariacao, notaDoCambio } from './moeda.js';
import { PERIODOS, periodoDaChave, periodoInicial, recortar, variacaoDoPeriodo, dataBr, hojeLocal, criarGrafico } from './grafico-colecao.js';
import { VARIANTES, rotuloDaVariante, carregarEstados, campoSelect, campoEstado, campoComRotulo, campoPreco, campoData } from './opcoes-carta.js';

prepararCabecalho();

const $valorAtual = document.getElementById('valor-atual');
const $valorCusto = document.getElementById('valor-custo');
const $valorGanho = document.getElementById('valor-ganho');
const $lista = document.getElementById('lista-itens');
const $avisoLista = document.getElementById('aviso-lista');
const $avisoGrafico = document.getElementById('aviso-grafico');
const $legenda = document.getElementById('legenda-grafico');
const $notaCusto = document.getElementById('nota-custo');
const $canvas = document.getElementById('grafico');
const $notaCambio = document.getElementById('nota-cambio');
const $btnSair = document.getElementById('btn-sair');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

const $graficoCabecalho = document.getElementById('grafico-cabecalho');
const $graficoValor = document.getElementById('grafico-valor');
const $graficoDetalhe = document.getElementById('grafico-detalhe');
const $graficoPeriodos = document.getElementById('grafico-periodos');

/* Estado do gráfico: a série inteira chega uma vez; trocar de período só recorta e redesenha (sem nova ida ao servidor). */
let serieCompleta = [];
let resumoAtual = null;
let periodoAtual = periodoDaChave('1m');
let formatarValor = formatarReais;

function sinalDe(n) {
  return n > 0 ? '+' : n < 0 ? '−' : '';
}

/** Cabeçalho do gráfico: o valor de hoje e a variação do período; com o dedo no gráfico, o valor e a data daquele dia. */
function atualizarCabecalhoDoGrafico(ponto) {
  const hoje = hojeLocal();
  if (ponto) {
    $graficoValor.textContent = formatarValor(ponto.valor);
    $graficoDetalhe.className = 'text--sm text--muted';
    $graficoDetalhe.textContent = [dataBr(ponto.data), Number(ponto.custo) > 0 ? `Pago: ${formatarValor(ponto.custo)}` : null].filter(Boolean).join(' · ');
    return;
  }

  $graficoValor.textContent = formatarValor(resumoAtual.valorAtual);
  const v = variacaoDoPeriodo(recortar(serieCompleta, periodoAtual, hoje), periodoAtual, hoje, resumoAtual.valorAtual);
  if (!v) {
    $graficoDetalhe.className = 'text--sm text--muted';
    $graficoDetalhe.textContent = 'Poucos dias de histórico neste período.';
    return;
  }
  const pct = v.percentual === null ? '' : ` (${sinalDe(v.delta)}${Math.abs(v.percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`;
  $graficoDetalhe.className = `text--sm weight--semibold ${v.delta > 0 ? 'text--success' : v.delta < 0 ? 'text--danger' : 'text--muted'}`;
  $graficoDetalhe.textContent = `${sinalDe(v.delta)}${formatarValor(Math.abs(v.delta))}${pct} ${v.rotulo}`;
}

const grafico = criarGrafico($canvas, { aoSelecionar: atualizarCabecalhoDoGrafico });

function mostrarPeriodo() {
  const pontos = recortar(serieCompleta, periodoAtual, hojeLocal());
  grafico.definir(pontos);
  for (const botao of $graficoPeriodos.children) {
    const ativo = botao.dataset.periodo === periodoAtual.chave;
    botao.classList.toggle('botao--primario', ativo);
    botao.classList.toggle('botao--secundario', !ativo);
    botao.setAttribute('aria-pressed', String(ativo));
  }
  if (pontos.length < 2) {
    avisar($avisoGrafico, 'Poucos dias de histórico neste período — escolha um período maior.', 'info');
  } else {
    avisar($avisoGrafico, null);
  }
  const partes = ['Linha cheia: o valor da sua coleção.'];
  if (grafico.custoNoGrafico) partes.push('Linha tracejada: o que você pagou nas cartas com preço informado.');
  else if (grafico.temCusto) partes.push('O quanto você pagou aparece ao tocar no gráfico.');
  partes.push('A variação do período inclui as cartas que você adicionou nele.');
  $legenda.textContent = partes.join(' ');
  $legenda.classList.remove('hidden');
}

function montarSeletorDePeriodo() {
  limpar($graficoPeriodos);
  for (const p of PERIODOS) {
    const botao = el('button', 'botao botao--secundario botao--pequeno', p.rotulo);
    botao.type = 'button';
    botao.dataset.periodo = p.chave;
    botao.addEventListener('click', () => {
      periodoAtual = p;
      mostrarPeriodo();
    });
    $graficoPeriodos.append(botao);
  }
}

function desenharGrafico(serie, resumo) {
  serieCompleta = serie;
  resumoAtual = resumo;
  formatarValor = resumo.moeda === 'BRL' ? formatarReais : dolar;
  $legenda.classList.add('hidden');

  if (serie.length < 2) {
    $graficoCabecalho.classList.add('hidden');
    $graficoPeriodos.classList.add('hidden');
    grafico.definir([]);
    avisar($avisoGrafico, 'O gráfico aparece depois de alguns dias com cartas na coleção — o histórico é construído dia a dia, a pokemontcg.io não tem preço retroativo.', 'info');
    return;
  }

  // Na primeira vez (ou se o período escolhido ficou vazio) abre no menor período que já tem uma linha para mostrar.
  if (!$graficoPeriodos.children.length) {
    montarSeletorDePeriodo();
    periodoAtual = periodoDaChave(periodoInicial(serie, hojeLocal()));
  }
  $graficoCabecalho.classList.remove('hidden');
  $graficoPeriodos.classList.remove('hidden');
  mostrarPeriodo();
}

/** Preço pago por unidade, em reais: o que foi informado em reais, ou o antigo em dólar pela cotação de hoje. */
function pagoPorCartaBrl(item) {
  if (item.preco_pago_brl !== null && item.preco_pago_brl !== undefined) return item.preco_pago_brl;
  const cotacao = cambioAtual();
  if (item.preco_pago_usd !== null && item.preco_pago_usd !== undefined && cotacao) return item.preco_pago_usd * cotacao.usdBrl;
  return null;
}

/** "+R$ 12,00 (+25,00%)" em verde ou vermelho: quanto a carta rendeu (ou perdeu) frente ao que foi pago. */
function linhaDoGanho(item) {
  const cotacao = cambioAtual();
  const pago = pagoPorCartaBrl(item);
  const unitario = item.preco_estimado_usd ?? item.preco_mercado_usd;
  if (pago === null || !cotacao || unitario === null || unitario === undefined) return null;
  const custo = pago * item.quantidade;
  const valor = unitario * cotacao.usdBrl * item.quantidade;
  const delta = valor - custo;
  const sinal = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const pct = custo > 0 ? ` (${sinal}${Math.abs((delta / custo) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)` : '';
  const linha = el('span', `text--xs weight--semibold ${delta > 0 ? 'text--success' : delta < 0 ? 'text--danger' : 'text--muted'}`, `${sinal}${formatarReais(Math.abs(delta))}${pct}`);
  linha.title = `Valor atual ${formatarReais(valor)} contra ${formatarReais(custo)} pagos`;
  return linha;
}

function formularioEdicao(item, aoSalvar) {
  const form = el('form', 'flex flex--col gap--2', '');

  const qtd = document.createElement('input');
  qtd.className = 'campo';
  qtd.type = 'number';
  qtd.name = 'quantidade';
  qtd.min = '1';
  qtd.max = '100000';
  qtd.required = true;
  qtd.value = String(item.quantidade);
  form.append(campoComRotulo('Quantidade', qtd));

  const variante = campoSelect('variante', VARIANTES, false);
  variante.value = item.variante ?? '';
  form.append(campoComRotulo('Variante', variante, 'A versão que você tem muda o preço da carta.'));

  form.append(campoEstado(item.condicao ?? ''));

  const pago = pagoPorCartaBrl(item);
  form.append(campoComRotulo('Preço pago por carta (R$)', campoPreco(pago === null ? null : Number(pago.toFixed(2))), 'Com ele calculamos o seu ganho ou perda.'));
  form.append(campoComRotulo('Data da compra', campoData(/^\d{4}-\d{2}-\d{2}$/.test(item.adquirido_em ?? '') ? item.adquirido_em : null)));

  const aviso = el('p', 'hidden text--xs', '');
  form.append(aviso);

  const acoes = el('div', 'flex gap--2', '');
  const salvar = el('button', 'botao botao--primario botao--pequeno flex--1', 'Salvar');
  salvar.type = 'submit';
  const cancelar = el('button', 'botao botao--secundario botao--pequeno', 'Cancelar');
  cancelar.type = 'button';
  cancelar.addEventListener('click', () => aoSalvar(false));
  acoes.append(salvar, cancelar);
  form.append(acoes);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    salvar.disabled = true;
    const dados = Object.fromEntries(new FormData(form).entries());
    try {
      await api(`/colecao/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantidade: Number(dados.quantidade),
          variante: dados.variante || null,
          condicao: dados.condicao || null,
          // O preço novo vale em reais; o antigo em dólar sai, para não haver dois custos para a mesma carta.
          precoPagoBrl: dados.precoPagoBrl === '' ? null : Number(dados.precoPagoBrl),
          precoPagoUsd: null,
          adquiridoEm: dados.adquiridoEm || null,
        }),
      });
      aoSalvar(true);
    } catch (erro) {
      avisarComAssinatura(aviso, erro);
      salvar.disabled = false;
    }
  });

  return form;
}

function cartaoItem(item) {
  const cartao = el('article', 'cartao carta--item p--3 flex flex--col gap--2', '');

  const img = document.createElement('img');
  img.src = item.imagem_pequena ?? '';
  img.alt = item.nome ?? 'carta';
  img.className = 'imagem--carta';
  cartao.append(img);

  const link = document.createElement('a');
  link.href = `/carta/?id=${encodeURIComponent(item.carta_id)}`;
  link.className = 'carta--nome text--sm weight--semibold';
  link.textContent = item.nome;
  cartao.append(link);
  cartao.append(el('span', 'carta--meta text--xs text--muted', item.set_nome ?? ''));
  cartao.append(el('span', 'text--xs text--muted', `#${item.numero ?? '?'}`));
  // O valor da carta que a pessoa TEM: preço da variante marcada, ajustado pelo estado (uma estimativa).
  cartao.append(el('span', 'text--md weight--semibold', preco(item.preco_estimado_usd ?? item.preco_mercado_usd)));
  if (item.fator_estado < 1) {
    const estimativa = el('span', 'text--xs text--muted', `Estimado: ${item.condicao} ≈ ${Math.round(item.fator_estado * 100)}% do preço Near Mint`);
    estimativa.title = 'O preço de mercado é o de uma carta quase perfeita. Para os outros estados usamos uma estimativa, não um preço de venda real.';
    cartao.append(estimativa);
  }
  cartao.append(elementoVariacao(item.variacao));
  if (item.preco_data) cartao.append(el('span', 'text--xs text--muted', `Preço de ${dataSimples(item.preco_data)}`));

  const detalhes = [`Qtd: ${item.quantidade}`];
  if (item.variante) detalhes.push(rotuloDaVariante(item.variante));
  if (item.condicao) detalhes.push(item.condicao);
  cartao.append(el('span', 'text--xs text--muted', detalhes.join(' · ')));

  const pago = pagoPorCartaBrl(item);
  if (pago === null) {
    cartao.append(el('span', 'text--xs text--muted', 'Sem preço pago'));
  } else {
    cartao.append(el('span', 'text--xs text--muted', `Pago: ${formatarReais(pago)} por carta`));
    const ganho = linhaDoGanho(item);
    if (ganho) cartao.append(ganho);
  }

  const editar = el('button', `botao ${pago === null ? 'botao--primario' : 'botao--secundario'} botao--pequeno carta--acao`, pago === null ? 'Informar preço' : 'Editar');
  editar.type = 'button';
  editar.addEventListener('click', () => {
    editar.classList.add('hidden');
    remover.classList.add('hidden');
    cartao.classList.add('carta--item--aberta');
    const form = formularioEdicao(item, (salvou) => {
      if (salvou) { carregar(); return; }
      form.remove();
      cartao.classList.remove('carta--item--aberta');
      editar.classList.remove('hidden');
      remover.classList.remove('hidden');
    });
    cartao.append(form);
  });
  cartao.append(editar);

  const remover = el('button', 'botao botao--perigo botao--pequeno', 'Remover');
  remover.type = 'button';
  remover.addEventListener('click', async () => {
    if (!confirm('Remover esta carta da coleção?')) return;
    try {
      await api(`/colecao/${item.id}`, { method: 'DELETE' });
      carregar();
    } catch (erro) {
      avisar($avisoLista, erro.message);
    }
  });
  cartao.append(remover);

  return cartao;
}

async function carregar() {
  try {
    // A cotação precisa estar carregada antes de desenhar os cartões (o preço de cada carta é convertido na tela).
    const [resumo, colecao] = await Promise.all([api('/colecao/resumo'), api('/colecao'), carregarCambio(), carregarEstados()]);

    const formatar = resumo.moeda === 'BRL' ? formatarReais : dolar;
    $valorAtual.textContent = formatar(resumo.valorAtual);
    $valorCusto.textContent = formatar(resumo.custo);
    $valorGanho.textContent = formatar(resumo.ganho);
    $notaCambio.textContent = notaDoCambio();
    $valorGanho.classList.toggle('text--success', resumo.ganho >= 0);
    $valorGanho.classList.toggle('text--danger', resumo.ganho < 0);

    // Carta sem preço pago fica fora do custo e do ganho (senão o valor inteiro viraria lucro): a tela diz isso e pede o preço.
    if (resumo.itensSemCusto > 0) {
      const n = resumo.itensSemCusto;
      $notaCusto.textContent = `${n} ${n === 1 ? 'carta está' : 'cartas estão'} sem preço pago e ${n === 1 ? 'ficou' : 'ficaram'} fora do custo e do ganho. Toque em "Informar preço" na carta para o resultado ficar completo.`;
      $notaCusto.classList.remove('hidden');
    } else {
      $notaCusto.classList.add('hidden');
    }

    desenharGrafico(resumo.serie, resumo);

    limpar($lista);
    if (!colecao.itens.length) {
      avisar($avisoLista, 'Você ainda não adicionou nenhuma carta.', 'info');
    } else {
      avisar($avisoLista, null);
      colecao.itens.forEach((item) => $lista.append(cartaoItem(item)));
    }
  } catch (erro) {
    avisar($avisoLista, erro.message);
  }
}

carregar();
