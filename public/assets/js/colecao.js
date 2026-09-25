import { api, avisar, el, limpar, dolar } from './api.js';

const $valorAtual = document.getElementById('valor-atual');
const $valorCusto = document.getElementById('valor-custo');
const $valorGanho = document.getElementById('valor-ganho');
const $lista = document.getElementById('lista-itens');
const $avisoLista = document.getElementById('aviso-lista');
const $avisoGrafico = document.getElementById('aviso-grafico');
const $canvas = document.getElementById('grafico');
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

  if (serie.length < 2) {
    avisar($avisoGrafico, 'O gráfico aparece depois de alguns dias com cartas na coleção — o histórico é construído dia a dia, a pokemontcg.io não tem preço retroativo.', 'info');
    return;
  }
  avisar($avisoGrafico, null);

  const estilo = getComputedStyle(document.documentElement);
  const corLinha = estilo.getPropertyValue('--color-primary').trim();
  const corPreenchimento = estilo.getPropertyValue('--color-primary-light').trim();

  const valores = serie.map((p) => Number(p.valor) || 0);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const amplitude = max - min || 1;
  const margem = 16;

  const pontoX = (i) => margem + (i / (serie.length - 1)) * (largura - margem * 2);
  const pontoY = (v) => altura - margem - ((v - min) / amplitude) * (altura - margem * 2);

  ctx.beginPath();
  ctx.moveTo(pontoX(0), altura - margem);
  serie.forEach((p, i) => ctx.lineTo(pontoX(i), pontoY(Number(p.valor) || 0)));
  ctx.lineTo(pontoX(serie.length - 1), altura - margem);
  ctx.closePath();
  ctx.fillStyle = corPreenchimento;
  ctx.fill();

  ctx.beginPath();
  serie.forEach((p, i) => {
    const x = pontoX(i);
    const y = pontoY(Number(p.valor) || 0);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = corLinha;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function cartaoItem(item) {
  const cartao = el('article', 'cartao p--3 flex flex--col gap--2', '');
  cartao.style.width = '160px';

  const img = document.createElement('img');
  img.src = item.imagem_pequena ?? '';
  img.alt = item.nome ?? 'carta';
  img.className = 'imagem--carta';
  cartao.append(img);

  const link = document.createElement('a');
  link.href = `/carta/?id=${encodeURIComponent(item.carta_id)}`;
  link.className = 'text--sm weight--semibold text--truncate';
  link.textContent = item.nome;
  cartao.append(link);
  cartao.append(el('span', 'text--xs text--muted', `${item.set_nome ?? ''} · #${item.numero ?? '?'}`));
  cartao.append(el('span', 'text--sm weight--semibold', dolar(item.preco_mercado_usd)));
  cartao.append(el('span', 'text--xs text--muted', `Qtd: ${item.quantidade}${item.variante ? ' · ' + item.variante : ''}`));

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
    const [resumo, colecao] = await Promise.all([
      api('/colecao/resumo'),
      api('/colecao'),
    ]);

    $valorAtual.textContent = dolar(resumo.valorAtual);
    $valorCusto.textContent = dolar(resumo.custo);
    $valorGanho.textContent = dolar(resumo.ganho);
    $valorGanho.classList.toggle('text--success', resumo.ganho >= 0);
    $valorGanho.classList.toggle('text--danger', resumo.ganho < 0);

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
