import { api } from './api.js';

/*
  Opções dos campos de uma carta da coleção (variante, estado, preço pago, data), usadas ao adicionar
  (Buscar) e ao editar (Coleção). Fica num arquivo só para os dois formulários nunca divergirem.

  A escala de estados (nome, explicação e fator da estimativa de valor) vem do servidor, que é quem a define:
  assim a tela nunca mostra um estado que a API recusaria nem um percentual diferente do usado na conta.
*/

export const VARIANTES = [
  ['', 'Não sei'],
  ['normal', 'Normal'],
  ['holofoil', 'Holofoil'],
  ['reverseHolofoil', 'Reverse Holofoil'],
  ['1stEditionNormal', '1st Edition Normal'],
  ['1stEditionHolofoil', '1st Edition Holofoil'],
];

/** Rótulo de uma variante para mostrar na tela ("holofoil" → "Holofoil"); o que não for conhecido volta como veio. */
export function rotuloDaVariante(valor) {
  return VARIANTES.find(([v]) => v === valor)?.[1] ?? valor;
}

/** { valor, rotulo, descricao, fator }[]; preenchida por carregarEstados(). */
export let ESTADOS = [];

export async function carregarEstados() {
  if (ESTADOS.length) return ESTADOS;
  try {
    ESTADOS = (await api('/colecao/estados')).estados;
  } catch {
    ESTADOS = []; // sem a lista o campo fica só com "Não informado": o servidor continua sendo quem barra valor inválido.
  }
  return ESTADOS;
}

export function campoSelect(nome, opcoes, comEspacoVazio, textoVazio) {
  const campo = document.createElement('select');
  campo.className = 'campo campo--seguro';
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
  caixa.className = 'flex flex--col gap--1 flex--1 campo--caixa';
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

/** O que o estado significa e quanto vale frente ao preço de mercado (que é o de uma carta quase perfeita). */
function textoDoEstado(estado) {
  if (!estado) return 'Opcional. Sem estado, a carta vale o preço de mercado.';
  const valor = estado.fator >= 1
    ? 'Vale o preço de mercado.'
    : `Estimativa: cerca de ${Math.round(estado.fator * 100)}% do preço de uma carta Near Mint.`;
  return `${estado.descricao} ${valor}`;
}

/** Campo "Estado da carta" com a explicação do estado escolhido logo abaixo (muda junto com a escolha). */
export function campoEstado(valorInicial = '') {
  const select = campoSelect('condicao', ESTADOS.map((e) => [e.valor, e.rotulo]), true, 'Não informado');
  select.value = ESTADOS.some((e) => e.valor === valorInicial) ? valorInicial : '';
  const caixa = campoComRotulo('Estado da carta', select, textoDoEstado(ESTADOS.find((e) => e.valor === select.value)));
  const dica = caixa.querySelector('span.text--xs');
  select.addEventListener('change', () => { dica.textContent = textoDoEstado(ESTADOS.find((e) => e.valor === select.value)); });
  return caixa;
}

/** Campo de dinheiro em reais (preço pago por carta). */
export function campoPreco(valorInicial = null) {
  const campo = document.createElement('input');
  campo.className = 'campo campo--seguro';
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
  campo.className = 'campo campo--seguro';
  campo.type = 'date';
  campo.name = 'adquiridoEm';
  campo.max = new Date().toISOString().slice(0, 10);
  if (valorInicial) campo.value = valorInicial;
  return campo;
}
