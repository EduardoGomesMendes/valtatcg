/*
  Ícones em SVG, montados com DOM (nunca com innerHTML). Traço simples que herda a cor do texto
  (currentColor), então o tema do logo e o estado ativo colorem os ícones sem CSS extra.
*/

const NS = 'http://www.w3.org/2000/svg';

const CAMINHOS = {
  mais: ['M12 5v14', 'M5 12h14'],
  fechar: ['M18 6 6 18', 'M6 6l12 12'],
  colecao: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  buscar: ['M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M21 21l-4.3-4.3'],
  lojas: ['M3 9l1.5-5h15L21 9', 'M3 9h18', 'M4 9v11h16V9', 'M9 20v-6h6v6'],
  eventos: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  forum: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
};

/** @param {keyof typeof CAMINHOS} nome */
export function icone(nome, tamanho = 24) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamanho));
  svg.setAttribute('height', String(tamanho));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of CAMINHOS[nome] ?? []) {
    const caminho = document.createElementNS(NS, 'path');
    caminho.setAttribute('d', d);
    svg.append(caminho);
  }
  return svg;
}
