import { api, avisar, el, prepararCabecalho } from './api.js';

prepararCabecalho();

const $detalhe = document.getElementById('detalhe');
const $aviso = document.getElementById('aviso');
const $avisoGrafico = document.getElementById('aviso-grafico');
const $canvas = document.getElementById('grafico');
const $btnSair = document.getElementById('btn-sair');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

function id() {
  return new URLSearchParams(window.location.search).get('id');
}

function desenharGrafico(pontos) {
  const ctx = $canvas.getContext('2d');
  const largura = $canvas.width;
  const altura = $canvas.height;
  ctx.clearRect(0, 0, largura, altura);

  if (pontos.length < 2) {
    avisar($avisoGrafico, 'Ainda não há histórico suficiente para esta carta.', 'info');
    return;
  }
  avisar($avisoGrafico, null);

  const estilo = getComputedStyle(document.documentElement);
  const corLinha = estilo.getPropertyValue('--color-primary').trim();

  const valores = pontos.map((p) => Number(p.preco_mercado_usd) || 0);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const amplitude = max - min || 1;
  const margem = 16;

  const pontoX = (i) => margem + (i / (pontos.length - 1)) * (largura - margem * 2);
  const pontoY = (v) => altura - margem - ((v - min) / amplitude) * (altura - margem * 2);

  ctx.beginPath();
  pontos.forEach((p, i) => {
    const x = pontoX(i);
    const y = pontoY(Number(p.preco_mercado_usd) || 0);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = corLinha;
  ctx.lineWidth = 2;
  ctx.stroke();
}

async function carregar() {
  const cartaId = id();
  if (!cartaId) {
    avisar($aviso, 'Carta não informada.');
    return;
  }
  try {
    const { carta } = await api(`/cartas/${encodeURIComponent(cartaId)}`);

    const img = document.createElement('img');
    img.src = carta.imagem_grande ?? carta.imagem_pequena ?? '';
    img.alt = carta.nome;
    img.style.width = '260px';
    img.className = 'imagem--carta';
    $detalhe.append(img);

    const info = el('div', 'flex flex--col gap--2', '');
    info.append(el('h1', 'text--xl weight--bold', carta.nome));
    info.append(el('p', 'text--sm text--muted', `${carta.set_nome ?? ''} · #${carta.numero ?? '?'} · ${carta.raridade ?? ''}`));
    info.append(el(
      'p',
      'text--2xl weight--bold text--primary',
      carta.preco_mercado_usd !== null && carta.preco_mercado_usd !== undefined
        ? `US$ ${Number(carta.preco_mercado_usd).toFixed(2)}`
        : 'Preço indisponível',
    ));
    $detalhe.append(info);

    const { historico } = await api(`/cartas/${encodeURIComponent(cartaId)}/historico`);
    desenharGrafico(historico);
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

carregar();
