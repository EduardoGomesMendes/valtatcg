/*
  Gráfico interativo da evolução da coleção.

  A parte de cima deste arquivo é conta pura (períodos, variação, ponto mais próximo do dedo) e não mexe
  em tela nenhuma: o teste a importa direto. `criarGrafico` (embaixo) é a única parte que desenha.
*/

/** Períodos do seletor. "1D" não existe de propósito: guardamos UM preço por carta por dia. */
export const PERIODOS = [
  { chave: '7d', rotulo: '7D', dias: 7 },
  { chave: '1m', rotulo: '1M', dias: 30 },
  { chave: '3m', rotulo: '3M', dias: 90 },
  { chave: '6m', rotulo: '6M', dias: 180 },
  { chave: 'tudo', rotulo: 'Tudo', dias: null },
];

export const periodoDaChave = (chave) => PERIODOS.find((p) => p.chave === chave) ?? PERIODOS.at(-1);

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dia do calendário como número (sem fuso): a diferença entre dois é o número de dias entre as datas. */
export function numeroDoDia(iso) {
  const m = ISO.exec(String(iso ?? ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : NaN;
}

/** AAAA-MM-DD → DD/MM/AAAA, sem passar por Date (o fuso do Brasil deslocaria um dia). */
export function dataBr(iso) {
  const m = ISO.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

/** O dia de hoje no fuso do aparelho, como AAAA-MM-DD. */
export function hojeLocal(agora = new Date()) {
  const dois = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** Pontos que cabem no período, contando para trás a partir de hoje. "Tudo" devolve a série inteira. */
export function recortar(serie, periodo, hoje) {
  if (!periodo.dias) return serie;
  const limite = numeroDoDia(hoje) - periodo.dias;
  return serie.filter((p) => numeroDoDia(p.data) >= limite);
}

/**
 * Menor período que já tem pelo menos 2 pontos para desenhar uma linha (entre 1M e Tudo).
 * Quem começou ontem não abre a tela num gráfico vazio.
 */
export function periodoInicial(serie, hoje) {
  for (const chave of ['1m', '3m', '6m']) {
    if (recortar(serie, periodoDaChave(chave), hoje).length >= 2) return chave;
  }
  return 'tudo';
}

/**
 * Quanto o valor mudou entre o primeiro ponto do período e o valor final (o atual, se vier; senão o último ponto).
 * Mostra o que de fato foi medido: se o histórico é mais curto que o período, diz "desde DD/MM" em vez de
 * fingir que são 30 dias. Sem 2 pontos não há o que comparar e devolve null.
 */
export function variacaoDoPeriodo(pontos, periodo, hoje, valorFinal = null) {
  if (pontos.length < 2) return null;
  const inicio = pontos[0];
  const fim = Number.isFinite(valorFinal) ? valorFinal : pontos.at(-1).valor;
  const delta = fim - inicio.valor;
  const cobreOPeriodo = periodo.dias && numeroDoDia(inicio.data) <= numeroDoDia(hoje) - periodo.dias + 2;
  return {
    delta,
    percentual: inicio.valor > 0 ? (delta / inicio.valor) * 100 : null,
    desde: inicio.data,
    rotulo: cobreOPeriodo ? `nos últimos ${periodo.dias} dias` : `desde ${dataBr(inicio.data).slice(0, 5)}`,
  };
}

/** Posição horizontal (0..1) de cada ponto pela DATA: um buraco de dias sem preço aparece como buraco. */
export function posicoesNoTempo(pontos) {
  if (pontos.length < 2) return pontos.map(() => 0.5);
  const dias = pontos.map((p) => numeroDoDia(p.data));
  const total = dias.at(-1) - dias[0] || 1;
  return dias.map((d) => (d - dias[0]) / total);
}

/** Índice do ponto mais perto de `x` (as posições vêm em ordem crescente). */
export function indiceMaisProximo(posicoes, x) {
  let melhor = 0;
  let menor = Infinity;
  for (let i = 0; i < posicoes.length; i += 1) {
    const d = Math.abs(posicoes[i] - x);
    if (d < menor) {
      menor = d;
      melhor = i;
    }
  }
  return melhor;
}

/* ==========================================================================
   Desenho
   ========================================================================== */

const MARGEM_X = 10;
const MARGEM_Y = 14;

/**
 * Liga um canvas ao gráfico. Mouse: passar por cima. Toque: arrastar na horizontal (rolar na vertical continua
 * rolando a página, por causa do touch-action no CSS). Teclado: setas, Home, End e Esc.
 * `aoSelecionar(ponto | null)` avisa a tela para trocar o valor do cabeçalho.
 */
export function criarGrafico(canvas, { aoSelecionar = () => {} } = {}) {
  let pontos = [];
  let posicoes = [];
  let temCusto = false;
  let custoNoGrafico = false;
  let selecionado = null;

  const ctx = canvas.getContext('2d');

  /** Ajusta a resolução ao tamanho real na tela (e à densidade de pixels): sem isso a linha fica borrada. */
  function medir() {
    const caixa = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const largura = Math.max(1, Math.round(caixa.width * dpr));
    const altura = Math.max(1, Math.round(caixa.height * dpr));
    if (canvas.width !== largura || canvas.height !== altura) {
      canvas.width = largura;
      canvas.height = altura;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { largura: caixa.width, altura: caixa.height };
  }

  function desenhar() {
    const { largura, altura } = medir();
    ctx.clearRect(0, 0, largura, altura);
    if (pontos.length < 2) return;

    const estilo = getComputedStyle(document.documentElement);
    const cor = (nome) => estilo.getPropertyValue(nome).trim();

    const valores = pontos.map((p) => Number(p.valor) || 0);
    const custos = pontos.map((p) => Number(p.custo) || 0);
    /*
      A escala segue o VALOR. A linha do que a pessoa pagou só entra se não esmagar a variação: com R$ 250 pagos e R$ 1.200
      de valor, incluí-la deixaria a linha do valor quase reta. Fora do gráfico, o custo continua no cabeçalho ao tocar.
    */
    const faixa = (lista) => Math.max(...lista) - Math.min(...lista);
    custoNoGrafico = temCusto && faixa(valores) >= 0.3 * faixa([...valores, ...custos]);
    const todos = custoNoGrafico ? [...valores, ...custos] : valores;
    const min = Math.min(...todos);
    const max = Math.max(...todos);
    const amplitude = max - min || 1;

    const x = (i) => MARGEM_X + posicoes[i] * (largura - MARGEM_X * 2);
    const y = (v) => altura - MARGEM_Y - ((v - min) / amplitude) * (altura - MARGEM_Y * 2);

    ctx.beginPath();
    ctx.moveTo(x(0), altura);
    valores.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(pontos.length - 1), altura);
    ctx.closePath();
    ctx.fillStyle = cor('--color-primary-light');
    ctx.fill();

    ctx.lineJoin = 'round';
    ctx.beginPath();
    valores.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
    ctx.strokeStyle = cor('--color-primary');
    ctx.lineWidth = 2;
    ctx.stroke();

    // A linha do que a pessoa pagou só aparece se ela informou algum preço; sem isso seria uma linha reta em zero.
    if (custoNoGrafico) {
      ctx.beginPath();
      custos.forEach((c, i) => (i === 0 ? ctx.moveTo(x(i), y(c)) : ctx.lineTo(x(i), y(c))));
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = cor('--color-warning');
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (selecionado !== null && pontos[selecionado]) {
      const px = x(selecionado);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, altura);
      ctx.lineWidth = 1;
      ctx.strokeStyle = cor('--color-text-muted');
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, y(valores[selecionado]), 5, 0, Math.PI * 2);
      ctx.fillStyle = cor('--color-primary');
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = cor('--color-surface');
      ctx.stroke();
    }
  }

  function selecionar(indice) {
    if (indice === selecionado) return;
    selecionado = indice;
    desenhar();
    aoSelecionar(indice === null ? null : pontos[indice]);
  }

  function indiceDoPonteiro(evento) {
    const caixa = canvas.getBoundingClientRect();
    const fracao = (evento.clientX - caixa.left - MARGEM_X) / Math.max(1, caixa.width - MARGEM_X * 2);
    return indiceMaisProximo(posicoes, Math.min(1, Math.max(0, fracao)));
  }

  const soltar = () => selecionar(null);
  const mover = (e) => {
    if (pontos.length >= 2) selecionar(indiceDoPonteiro(e));
  };

  canvas.addEventListener('pointerdown', (e) => {
    // Mouse não precisa de captura (passar por cima já seleciona); no toque, ela mantém o arraste mesmo saindo do canvas.
    if (e.pointerType !== 'mouse' && canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    mover(e);
  });
  canvas.addEventListener('pointermove', mover);
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') soltar();
  });

  canvas.addEventListener('keydown', (e) => {
    if (pontos.length < 2) return;
    const ultimo = pontos.length - 1;
    const atual = selecionado ?? ultimo;
    const destino = {
      ArrowLeft: Math.max(0, atual - 1),
      ArrowRight: Math.min(ultimo, atual + 1),
      Home: 0,
      End: ultimo,
    }[e.key];
    if (e.key === 'Escape') {
      soltar();
    } else if (destino !== undefined) {
      e.preventDefault();
      selecionar(destino);
    }
  });
  canvas.addEventListener('blur', soltar);

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(desenhar).observe(canvas);

  return {
    /** Troca a série mostrada (já recortada no período). */
    definir(novosPontos) {
      pontos = novosPontos;
      posicoes = posicoesNoTempo(pontos);
      temCusto = pontos.length >= 2 && pontos.some((p) => Number(p.custo) > 0);
      selecionado = null;
      custoNoGrafico = false;
      desenhar();
      aoSelecionar(null);
    },
    get temCusto() {
      return temCusto;
    },
    /** Se a linha tracejada do custo foi desenhada (ou ficou de fora para não achatar o valor). */
    get custoNoGrafico() {
      return custoNoGrafico;
    },
  };
}
