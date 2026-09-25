import { api, avisar, el, limpar, prepararCabecalho } from './api.js';

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

function formularioAdicionar(carta) {
  const form = el('form', 'flex flex--col gap--2 mt--2', '');

  const linhaQtdVariante = el('div', 'flex gap--2', '');
  const campoQtd = document.createElement('input');
  campoQtd.className = 'campo campo--curto';
  campoQtd.type = 'number';
  campoQtd.name = 'quantidade';
  campoQtd.min = '1';
  campoQtd.value = '1';
  campoQtd.required = true;
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
  campoPreco.name = 'precoPagoUsd';
  campoPreco.placeholder = 'Preço pago (US$)';
  linhaPrecoData.append(campoPreco);

  const campoData = document.createElement('input');
  campoData.className = 'campo';
  campoData.type = 'date';
  campoData.name = 'adquiridoEm';
  linhaPrecoData.append(campoData);
  form.append(linhaPrecoData);

  const aviso = el('p', 'hidden text--xs', '');
  form.append(aviso);

  const botao = el('button', 'botao botao--primario botao--pequeno w--full', 'Confirmar');
  botao.type = 'submit';
  form.append(botao);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    botao.disabled = true;
    botao.textContent = 'Adicionando…';
    const dados = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/colecao', {
        method: 'POST',
        body: JSON.stringify({
          cartaId: carta.id,
          quantidade: Number(dados.quantidade),
          variante: dados.variante || null,
          condicao: dados.condicao || null,
          precoPagoUsd: dados.precoPagoUsd ? Number(dados.precoPagoUsd) : null,
          adquiridoEm: dados.adquiridoEm || null,
        }),
      });
      window.location.href = '/colecao/';
    } catch (erro) {
      avisar(aviso, erro.message);
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

function cartaoResultado(carta) {
  const cartao = el('article', 'cartao p--3 flex flex--col gap--2', '');
  cartao.style.width = '200px';

  const img = document.createElement('img');
  img.src = carta.images?.small ?? '';
  img.alt = carta.name;
  img.className = 'imagem--carta';
  cartao.append(img);

  const link = document.createElement('a');
  link.href = `/carta/?id=${encodeURIComponent(carta.id)}`;
  link.className = 'text--sm weight--semibold text--truncate';
  link.textContent = carta.name;
  cartao.append(link);

  cartao.append(el('span', 'text--xs text--muted', `${carta.set?.name ?? ''} · #${carta.number ?? '?'}`));

  const preco = precoDeExibicao(carta);
  cartao.append(el('span', 'text--sm weight--semibold', preco !== null ? `US$ ${preco.toFixed(2)}` : '—'));

  const botaoAdicionar = el('button', 'botao botao--secundario botao--pequeno w--full', '+ Adicionar');
  botaoAdicionar.type = 'button';
  let aberto = false;
  let form = null;
  botaoAdicionar.addEventListener('click', () => {
    aberto = !aberto;
    if (aberto) {
      form = formularioAdicionar(carta);
      cartao.append(form);
      botaoAdicionar.textContent = 'Cancelar';
    } else {
      form?.remove();
      botaoAdicionar.textContent = '+ Adicionar';
    }
  });
  cartao.append(botaoAdicionar);

  return cartao;
}

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($aviso, null);
  const nome = new FormData($form).get('nome');
  limpar($resultados);
  try {
    const { cartas } = await api(`/cartas/buscar?nome=${encodeURIComponent(nome)}`);
    if (!cartas.length) {
      avisar($aviso, 'Nenhuma carta encontrada.', 'info');
      return;
    }
    cartas.forEach((carta) => $resultados.append(cartaoResultado(carta)));
  } catch (erro) {
    avisar($aviso, erro.message);
  }
});
