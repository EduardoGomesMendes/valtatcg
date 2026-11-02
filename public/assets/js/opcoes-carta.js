/*
  Opções dos campos de uma carta da coleção (variante, condição, preço pago, data), usadas ao adicionar
  (Buscar) e ao editar (Coleção). Fica num arquivo só para os dois formulários nunca divergirem.
*/

export const VARIANTES = [
  ['', 'Não sei'],
  ['normal', 'Normal'],
  ['holofoil', 'Holofoil'],
  ['reverseHolofoil', 'Reverse Holofoil'],
  ['1stEditionHolofoil', '1st Edition Holofoil'],
  ['1stEditionNormal', '1st Edition Normal'],
];

export const CONDICOES = ['Lacrado', 'Mint', 'Near Mint', 'Excelente', 'Jogado', 'Danificado'];

/** Rótulo de uma variante para mostrar na tela ("holofoil" → "Holofoil"); o que não for conhecido volta como veio. */
export function rotuloDaVariante(valor) {
  return VARIANTES.find(([v]) => v === valor)?.[1] ?? valor;
}

export function campoSelect(nome, opcoes, comEspacoVazio, textoVazio) {
  const campo = document.createElement('select');
  campo.className = 'campo';
  campo.name = nome;
  if (comEspacoVazio) {
    const opcaoVazia = document.createElement('option');
    opcaoVazia.value = '';
    opcaoVazia.textContent = textoVazio;
    campo.append(opcaoVazia);
  }
  opcoes.forEach((item) => {
    const [valor, rotulo] = Array.isArray(item) ? item : [item, item];
    const opcao = document.createElement('option');
    opcao.value = valor;
    opcao.textContent = rotulo;
    campo.append(opcao);
  });
  return campo;
}

/**
 * Um campo com rótulo visível e dica embaixo. O rótulo precisa estar sempre na tela: só com "placeholder" ele some
 * assim que a pessoa digita, e no celular ninguém sabe o que o número significa.
 */
export function campoComRotulo(rotulo, campo, dica = '') {
  const caixa = document.createElement('label');
  caixa.className = 'flex flex--col gap--1 flex--1';
  const r = document.createElement('span');
  r.className = 'rotulo';
  r.textContent = rotulo;
  caixa.append(r, campo);
  if (dica) {
    const d = document.createElement('span');
    d.className = 'text--xs text--muted';
    d.textContent = dica;
    caixa.append(d);
  }
  return caixa;
}

/** Campo de dinheiro em reais (preço pago por carta). */
export function campoPreco(valorInicial = null) {
  const campo = document.createElement('input');
  campo.className = 'campo';
  campo.type = 'number';
  campo.step = '0.01';
  campo.min = '0';
  campo.max = '1000000';
  campo.name = 'precoPagoBrl';
  campo.placeholder = '0,00';
  campo.inputMode = 'decimal';
  if (valorInicial !== null && valorInicial !== undefined) campo.value = String(valorInicial);
  return campo;
}

/** Campo de data da compra: do passado até hoje. */
export function campoData(valorInicial = null) {
  const campo = document.createElement('input');
  campo.className = 'campo';
  campo.type = 'date';
  campo.name = 'adquiridoEm';
  campo.max = new Date().toISOString().slice(0, 10);
  if (valorInicial) campo.value = valorInicial;
  return campo;
}
