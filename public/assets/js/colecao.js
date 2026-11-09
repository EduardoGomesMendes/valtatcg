import { api, avisar, avisarComAssinatura, el, limpar, dolar, dataSimples, prepararCabecalho } from './api.js';
import { carregarCambio, cambioAtual, preco, formatarReais, elementoVariacao, notaDoCambio } from './moeda.js';
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

function desenharGrafico(serie) {
  const ctx = $canvas.getContext('2d');
  const largura = $canvas.width;
  const altura = $canvas.height;
  ctx.clearRect(0, 0, largura, altura);
  $legenda.classList.add('hidden');

  if (serie.length < 2) {
    avisar($avisoGrafico, 'O gráfico aparece depois de alguns dias com cartas na coleção — o histórico é construído dia a dia, a pokemontcg.io não tem preço retroativo.', 'info');
    return;
  }
  avisar($avisoGrafico, null);

  const estilo = getComputedStyle(document.documentElement);
  const corLinha = estilo.getPropertyValue('--color-primary').trim();
  const corPreenchimento = estilo.getPropertyValue('--color-primary-light').trim();
  const corCusto = estilo.getPropertyValue('--color-warning').trim();

  const valores = serie.map((p) => Number(p.valor) || 0);
  // A linha do que a pessoa pagou só aparece se ela informou algum preço; sem isso seria uma linha reta em zero.
  const custos = serie.map((p) => Number(p.custo) || 0);
  const temCusto = custos.some((c) => c > 0);
  const todos = temCusto ? [...valores, ...custos] : valores;
  const min = Math.min(...todos);
  const max = Math.max(...todos);
  const amplitude = max - min || 1;
  const margem = 16;

  const pontoX = (i) => margem + (i / (serie.length - 1)) * (largura - margem * 2);
  const pontoY = (v) => altura - margem - ((v - min) / amplitude) * (altura - margem * 2);

  ctx.beginPath();
  ctx.moveTo(pontoX(0), altura - margem);
  valores.forEach((v, i) => ctx.lineTo(pontoX(i), pontoY(v)));
  ctx.lineTo(pontoX(serie.length - 1), altura - margem);
  ctx.closePath();
  ctx.fillStyle = corPreenchimento;
  ctx.fill();

  ctx.beginPath();
  valores.forEach((v, i) => {
    if (i === 0) ctx.moveTo(pontoX(i), pontoY(v)); else ctx.lineTo(pontoX(i), pontoY(v));
  });
  ctx.strokeStyle = corLinha;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (temCusto) {
    ctx.beginPath();
    custos.forEach((c, i) => {
      if (i === 0) ctx.moveTo(pontoX(i), pontoY(c)); else ctx.lineTo(pontoX(i), pontoY(c));
    });
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = corCusto;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    $legenda.classList.remove('hidden');
  }
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

    desenharGrafico(resumo.serie);

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
