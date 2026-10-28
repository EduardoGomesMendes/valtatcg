import { el } from './api.js';
import { icone } from './icones.js';
import { recorteDaGuia } from './leitura-carta.js';

/*
  Câmera dentro da página, com um quadro no formato da carta. Quem enquadra a carta no quadro entrega ao
  leitor de texto uma imagem já recortada (nome no topo, número no rodapé, sem mesa em volta) — bem mais
  confiável do que adivinhar onde a carta está numa foto qualquer.

  Resolve com:
    - um <canvas> com a carta recortada, quando a pessoa tira a foto;
    - 'galeria', quando ela prefere escolher uma foto que já tem;
    - null, quando cancela.
  Rejeita se a câmera não abrir (sem permissão, sem câmera): quem chama cai no seletor de arquivo.
*/

export const camera = {
  disponivel: () => Boolean(navigator.mediaDevices?.getUserMedia),
};

export async function abrirCamera() {
  const fluxo = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
    audio: false,
  });

  return new Promise((resolver) => {
    const tela = el('div', 'camera--tela', '');
    tela.setAttribute('role', 'dialog');
    tela.setAttribute('aria-label', 'Câmera: enquadre a carta no quadro');

    const video = document.createElement('video');
    video.className = 'camera--video';
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.srcObject = fluxo;

    const guia = el('div', 'camera--guia', '');
    const dica = el('p', 'camera--dica text--sm', 'Encaixe a carta no quadro, com boa luz e sem reflexo');

    const cancelar = el('button', 'camera--botao-texto', 'Cancelar');
    cancelar.type = 'button';
    const galeria = el('button', 'camera--botao-texto', 'Galeria');
    galeria.type = 'button';
    const disparar = el('button', 'camera--disparo', '');
    disparar.type = 'button';
    disparar.setAttribute('aria-label', 'Tirar foto');
    disparar.append(icone('camera', 28));
    const acoes = el('div', 'camera--acoes', '');
    acoes.append(cancelar, disparar, galeria);

    tela.append(video, guia, dica, acoes);
    document.body.append(tela);
    document.body.classList.add('camera--aberta');

    const encerrar = (resultado) => {
      fluxo.getTracks().forEach((t) => t.stop());
      document.removeEventListener('keydown', aoTeclar);
      tela.remove();
      document.body.classList.remove('camera--aberta');
      resolver(resultado);
    };
    const aoTeclar = (ev) => { if (ev.key === 'Escape') encerrar(null); };
    document.addEventListener('keydown', aoTeclar);

    cancelar.addEventListener('click', () => encerrar(null));
    galeria.addEventListener('click', () => encerrar('galeria'));
    disparar.addEventListener('click', () => {
      if (!video.videoWidth) return; // a câmera ainda não entregou o primeiro quadro
      const caixa = tela.getBoundingClientRect();
      const quadro = guia.getBoundingClientRect();
      const r = recorteDaGuia({
        video: { largura: video.videoWidth, altura: video.videoHeight },
        caixa: { largura: caixa.width, altura: caixa.height },
        guia: { x: quadro.left - caixa.left, y: quadro.top - caixa.top, largura: quadro.width, altura: quadro.height },
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(r.largura);
      canvas.height = Math.round(r.altura);
      canvas.getContext('2d').drawImage(video, r.x, r.y, r.largura, r.altura, 0, 0, canvas.width, canvas.height);
      encerrar(canvas);
    });

    video.play().catch(() => encerrar(null));
  });
}
