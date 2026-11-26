/*
  App instalável: registra o service worker e oferece "Instalar o app".

  - Android e computador (Chrome, Edge): o navegador avisa que pode instalar (`beforeinstallprompt`); o botão dispara o convite.
  - iPhone e iPad: não existe convite; o botão abre o passo a passo do "Adicionar à Tela de Início".
  - Já aberto como app, ou navegador sem como instalar: o botão não aparece.

  Qualquer elemento com `data-instalar-app` vira botão de instalar (começa escondido com a classe `hidden`).
*/

/** Que tipo de instalação oferecer aqui: 'convite', 'ios' ou null (nada a oferecer). Conta pura, testável. */
export function modoDeInstalacao({ temConvite, instalado, userAgent = '', plataforma = '', toques = 0 }) {
  if (instalado) return null;
  if (temConvite) return 'convite';
  // O iPad moderno se apresenta como Mac; o que o entrega é ter tela de toque.
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (plataforma === 'MacIntel' && toques > 1);
  return ios ? 'ios' : null;
}

let convite = null;
let instalado = false;

function modoAtual() {
  return modoDeInstalacao({
    temConvite: Boolean(convite),
    instalado,
    userAgent: navigator.userAgent,
    plataforma: navigator.platform,
    toques: navigator.maxTouchPoints,
  });
}

/** Mostra ou esconde todos os botões de instalar da página. Chame depois de criar um botão novo. */
export function atualizarBotoesDeInstalar() {
  const mostrar = modoAtual() !== null;
  for (const botao of document.querySelectorAll('[data-instalar-app]')) botao.classList.toggle('hidden', !mostrar);
}

function paragrafo(texto, classes = 'text--sm') {
  const p = document.createElement('p');
  p.className = classes;
  p.textContent = texto;
  return p;
}

function abrirPassoAPassoDoIos() {
  document.getElementById('janela-instalar')?.remove();
  const janela = document.createElement('dialog');
  janela.id = 'janela-instalar';
  janela.className = 'janela--instalar';
  janela.setAttribute('aria-label', 'Instalar o app');

  const titulo = document.createElement('h2');
  titulo.className = 'text--md weight--semibold';
  titulo.textContent = 'Instalar o ValtaTCG no iPhone';

  const passos = document.createElement('ol');
  passos.className = 'text--sm janela--passos';
  for (const texto of [
    'Abra este site no Safari.',
    'Toque no botão Compartilhar (o quadrado com a seta para cima).',
    'Escolha "Adicionar à Tela de Início" e confirme.',
  ]) {
    const item = document.createElement('li');
    item.textContent = texto;
    passos.append(item);
  }

  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'botao botao--primario';
  fechar.textContent = 'Entendi';
  fechar.addEventListener('click', () => janela.close());
  janela.addEventListener('close', () => janela.remove());

  janela.append(titulo, passos, paragrafo('Na primeira vez, o app pede para você entrar de novo.', 'text--xs text--muted'), fechar);
  document.body.append(janela);
  janela.showModal();
}

async function instalar() {
  const modo = modoAtual();
  if (modo === 'ios') {
    abrirPassoAPassoDoIos();
    return;
  }
  if (modo !== 'convite') return;
  const pedido = convite;
  convite = null; // o convite só pode ser usado uma vez
  await pedido.prompt();
  await pedido.userChoice.catch(() => null);
  atualizarBotoesDeInstalar();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  instalado = window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    convite = evento;
    atualizarBotoesDeInstalar();
  });
  window.addEventListener('appinstalled', () => {
    instalado = true;
    convite = null;
    atualizarBotoesDeInstalar();
  });
  document.addEventListener('click', (evento) => {
    if (evento.target.closest?.('[data-instalar-app]')) instalar().catch(() => {});
  });
  atualizarBotoesDeInstalar();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
