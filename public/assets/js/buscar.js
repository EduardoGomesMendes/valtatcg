import { api, avisar, el, limpar, prepararCabecalho } from './api.js';
import { carregarCambio, preco, elementoVariacao } from './moeda.js';
import { icone } from './icones.js';

prepararCabecalho();

const $form = document.getElementById('form-busca');
const $resultados = document.getElementById('resultados');
const $aviso = document.getElementById('aviso');
const $btnSair = document.getElementById('btn-sair');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

const VARIANTES = [
  ['', 'Não sei'],
  ['normal', 'Normal'],
  ['holofoil', 'Holofoil'],
  ['reverseHolofoil', 'Reverse Holofoil'],
  ['1stEditionHolofoil', '1st Edition Holofoil'],
  ['1stEditionNormal', '1st Edition Normal'],
];

const CONDICOES = ['Lacrado', 'Mint', 'Near Mint', 'Excelente', 'Jogado', 'Danificado'];

/** Quantas de cada carta a pessoa já tem (id da carta → quantidade), para mostrar "Qtd" nos resultados. */
let possuidas = new Map();

async function carregarPossuidas() {
  try {
    const { itens } = await api('/colecao');
    possuidas = new Map();
    for (const item of itens) possuidas.set(item.carta_id, (possuidas.get(item.carta_id) ?? 0) + item.quantidade);
  } catch {
    possuidas = new Map(); // sem a lista, a busca funciona do mesmo jeito, só sem o "Qtd".
  }
}

function campoSelect(nome, opcoes, comEspacoVazio, textoVazio) {
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

/** @param {(quantidade: number) => void} aoAdicionar chamado depois de a carta entrar na coleção */
function formularioAdicionar(carta, aoAdicionar) {
  const form = el('form', 'flex flex--col gap--2 mt--2', '');

  const linhaQtdVariante = el('div', 'flex gap--2', '');
  const campoQtd = document.createElement('input');
  campoQtd.className = 'campo campo--curto';
  campoQtd.type = 'number';
  campoQtd.name = 'quantidade';
  campoQtd.min = '1';
  campoQtd.value = '1';
  campoQtd.required = true;
  campoQtd.setAttribute('aria-label', 'Quantidade');
  linhaQtdVariante.append(campoQtd);
  linhaQtdVariante.append(campoSelect('variante', VARIANTES, false));
  form.append(linhaQtdVariante);

  form.append(campoSelect('condicao', CONDICOES, true, 'Condição (opcional)'));

  const linhaPrecoData = el('div', 'flex gap--2', '');
  const campoPreco = document.createElement('input');
  campoPreco.className = 'campo';
  campoPreco.type = 'number';
  campoPreco.step = '0.01';
  campoPreco.min = '0';
  campoPreco.name = 'precoPagoBrl';
  campoPreco.placeholder = 'Preço pago (R$)';
  linhaPrecoData.append(campoPreco);

  const campoData = document.createElement('input');
  campoData.className = 'campo';
  campoData.type = 'date';
  campoData.name = 'adquiridoEm';
  campoData.setAttribute('aria-label', 'Data da compra');
  linhaPrecoData.append(campoData);
  form.append(linhaPrecoData);

  const avisoForm = el('p', 'hidden text--xs', '');
  form.append(avisoForm);

  const botao = el('button', 'botao botao--primario botao--pequeno w--full', 'Confirmar');
  botao.type = 'submit';
  form.append(botao);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    botao.disabled = true;
    botao.textContent = 'Adicionando…';
    const dados = Object.fromEntries(new FormData(form).entries());
    const quantidade = Number(dados.quantidade);
    try {
      await api('/colecao', {
        method: 'POST',
        body: JSON.stringify({
          cartaId: carta.id,
          quantidade,
          variante: dados.variante || null,
          condicao: dados.condicao || null,
          precoPagoBrl: dados.precoPagoBrl ? Number(dados.precoPagoBrl) : null,
          adquiridoEm: dados.adquiridoEm || null,
        }),
      });
      aoAdicionar(quantidade);
    } catch (erro) {
      avisar(avisoForm, erro.message);
      botao.disabled = false;
      botao.textContent = 'Confirmar';
    }
  });

  return form;
}

function precoDeExibicao(carta) {
  const precos = carta.tcgplayer?.prices;
  if (!precos) return null;
  for (const chave of ['holofoil', 'reverseHolofoil', 'normal', '1stEditionHolofoil', '1stEditionNormal']) {
    const valor = precos[chave]?.market;
    if (typeof valor === 'number') return valor;
  }
  return null;
}

function cartaoResultado(carta, variacao) {
  const cartao = el('article', 'cartao carta--item p--3 flex flex--col gap--2', '');

  const img = document.createElement('img');
  img.src = carta.images?.small ?? '';
  img.alt = carta.name;
  img.className = 'imagem--carta';
  img.loading = 'lazy';
  cartao.append(img);

  const link = document.createElement('a');
  link.href = `/carta/?id=${encodeURIComponent(carta.id)}`;
  link.className = 'carta--nome text--sm weight--semibold';
  link.textContent = carta.name;
  cartao.append(link);

  cartao.append(el('span', 'carta--meta text--xs text--muted', carta.set?.name ?? ''));
  cartao.append(el('span', 'text--xs text--muted', `${carta.rarity ? `${carta.rarity} · ` : ''}#${carta.number ?? '?'}`));

  cartao.append(el('span', 'text--md weight--semibold', preco(precoDeExibicao(carta))));
  cartao.append(elementoVariacao(variacao));

  const rotuloQtd = () => `Qtd: ${possuidas.get(carta.id) ?? 0}`;
  const rodape = el('div', 'carta--rodape flex items--center justify--content--between', '');
  const qtd = el('span', 'text--xs text--muted', rotuloQtd());
  const botao = el('button', 'botao--redondo', '');
  botao.type = 'button';
  botao.setAttribute('aria-label', 'Adicionar à coleção');
  botao.append(icone('mais', 22));
  rodape.append(qtd, botao);
  cartao.append(rodape);

  let form = null;
  const fechar = () => {
    form?.remove();
    form = null;
    cartao.classList.remove('carta--item--aberta');
    botao.replaceChildren(icone('mais', 22));
    botao.setAttribute('aria-label', 'Adicionar à coleção');
  };

  botao.addEventListener('click', () => {
    if (form) {
      fechar();
      return;
    }
    form = formularioAdicionar(carta, (quantidade) => {
      possuidas.set(carta.id, (possuidas.get(carta.id) ?? 0) + quantidade);
      qtd.textContent = rotuloQtd();
      fechar();
      avisar($aviso, `${carta.name} foi adicionada à sua coleção.`, 'sucesso');
    });
    cartao.append(form);
    cartao.classList.add('carta--item--aberta');
    botao.replaceChildren(icone('fechar', 22));
    botao.setAttribute('aria-label', 'Cancelar');
  });

  return cartao;
}

// No celular o foco automático abre o teclado e esconde os resultados: só foca onde há mouse.
if (window.matchMedia('(hover: hover)').matches) $form.nome.focus();

const prontos = Promise.all([carregarCambio(), carregarPossuidas()]);

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($aviso, null);
  const nome = new FormData($form).get('nome');
  limpar($resultados);
  try {
    const [{ cartas, variacoes }] = await Promise.all([api(`/cartas/buscar?nome=${encodeURIComponent(nome)}`), prontos]);
    if (!cartas.length) {
      avisar($aviso, 'Nenhuma carta encontrada.', 'info');
      return;
    }
    cartas.forEach((carta) => $resultados.append(cartaoResultado(carta, variacoes?.[carta.id] ?? null)));
  } catch (erro) {
    avisar($aviso, erro.message);
  }
});
