import { api, avisar, el, limpar, dataBr, prepararCabecalho } from './api.js';

const $abas = document.getElementById('abas-categorias');
const $descricao = document.getElementById('descricao-categoria');
const $lista = document.getElementById('lista-topicos');
const $aviso = document.getElementById('aviso');
const $btnNovo = document.getElementById('btn-novo-topico');
const $cartaoNovo = document.getElementById('cartao-novo');
const $form = document.getElementById('form-topico');
const $selectCategoria = document.getElementById('campo-categoria');
const $avisoTopico = document.getElementById('aviso-topico');
const $paginacao = document.getElementById('paginacao');
const $paginaTexto = document.getElementById('pagina-texto');
const $anterior = document.getElementById('btn-anterior');
const $proxima = document.getElementById('btn-proxima');

let categorias = [];
let categoria = new URLSearchParams(window.location.search).get('categoria') ?? '';
let pagina = 1;
let admin = false;
let permissao = { ok: true };

document.getElementById('btn-sair').addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

function montarAbas() {
  limpar($abas);
  const total = categorias.reduce((soma, c) => soma + c.topicos, 0);
  [{ chave: '', rotulo: 'Todas', topicos: total }, ...categorias].forEach((c) => {
    const b = el('button', `botao botao--pequeno ${c.chave === categoria ? 'botao--primario' : 'botao--secundario'}`, `${c.rotulo} (${c.topicos})`);
    b.type = 'button';
    b.addEventListener('click', () => {
      categoria = c.chave;
      pagina = 1;
      montarAbas();
      carregar();
    });
    $abas.append(b);
  });
  $descricao.textContent = categorias.find((c) => c.chave === categoria)?.descricao ?? '';
}

function linhaTopico(t) {
  const a = el('a', 'cartao p--4 flex flex--col gap--1 forum--linha', '');
  a.href = `/forum/topico/?id=${t.id}`;

  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  if (t.fixado) topo.append(el('span', 'selo selo--neutro', 'Fixado'));
  if (t.fechado) topo.append(el('span', 'selo selo--neutro', 'Fechado'));
  topo.append(el('span', 'weight--semibold', t.titulo));
  a.append(topo);
  a.append(el('span', 'text--xs text--muted', `${t.categoriaRotulo} · por ${t.autor} · ${t.respostas} resposta(s) · última atividade ${dataBr(t.atividadeEm)}`));
  return a;
}

async function carregar() {
  try {
    const params = new URLSearchParams({ categoria, pagina });
    const r = await api(`/forum/topicos?${params}`);
    limpar($lista);
    avisar($aviso, null);
    r.topicos.forEach((t) => $lista.append(linhaTopico(t)));
    if (!r.topicos.length) avisar($aviso, 'Ainda não há tópicos aqui. Que tal abrir o primeiro?', 'info');

    const totalPaginas = Math.max(1, Math.ceil(r.total / r.porPagina));
    $paginacao.classList.toggle('hidden', totalPaginas <= 1);
    $paginaTexto.textContent = `Página ${r.pagina} de ${totalPaginas}`;
    $anterior.disabled = r.pagina <= 1;
    $proxima.disabled = r.pagina >= totalPaginas;
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

function montarSelectDeCategorias() {
  limpar($selectCategoria);
  categorias.filter((c) => admin || !c.soAdmin).forEach((c) => {
    const opcao = el('option', '', c.rotulo);
    opcao.value = c.chave;
    $selectCategoria.append(opcao);
  });
  if (categoria && [...$selectCategoria.options].some((o) => o.value === categoria)) $selectCategoria.value = categoria;
}

$btnNovo.addEventListener('click', () => {
  $cartaoNovo.classList.toggle('hidden');
  montarSelectDeCategorias();
});

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoTopico, null);
  const dados = Object.fromEntries(new FormData($form).entries());
  try {
    const { id } = await api('/forum/topicos', { method: 'POST', body: JSON.stringify(dados) });
    window.location.href = `/forum/topico/?id=${id}`;
  } catch (erro) {
    avisar($avisoTopico, erro.message);
  }
});

/* ------------------------------------------------------------------ */
/* Termo de aceite das regras                                          */
/* ------------------------------------------------------------------ */

const $cartaoAceite = document.getElementById('cartao-aceite');
const $aceiteRegras = document.getElementById('aceite-regras');
const $aceiteCiencia = document.getElementById('aceite-ciencia');
const $rotuloCiencia = document.getElementById('rotulo-ciencia');
const $btnAceitar = document.getElementById('btn-aceitar');
const $avisoAceite = document.getElementById('aviso-aceite');

function mostrarAceite(regras, faixa) {
  const menor = faixa === 'menor';
  $cartaoAceite.classList.remove('hidden');
  $rotuloCiencia.classList.toggle('hidden', !menor);
  document.getElementById('regras').open = true;
  document.getElementById('versao-regras').textContent = `Versão das regras: ${dataBr(`${regras.versao} 12:00:00`)}.`;

  // O botão só habilita com tudo marcado: aceitar tem de ser um ato, não um clique distraído.
  const atualizar = () => { $btnAceitar.disabled = !($aceiteRegras.checked && (!menor || $aceiteCiencia.checked)); };
  $aceiteRegras.addEventListener('change', atualizar);
  $aceiteCiencia.addEventListener('change', atualizar);

  $btnAceitar.addEventListener('click', async () => {
    $btnAceitar.disabled = true;
    avisar($avisoAceite, null);
    try {
      await api('/forum/aceitar', {
        method: 'POST',
        body: JSON.stringify({ aceito: true, versao: regras.versao, ciencia: menor ? $aceiteCiencia.checked : undefined }),
      });
      $cartaoAceite.classList.add('hidden');
      $btnNovo.classList.remove('hidden');
      document.getElementById('regras').open = false;
      avisar(document.getElementById('aviso-escrever'), 'Pronto! Você já pode escrever no fórum.', 'sucesso');
    } catch (erro) {
      avisar($avisoAceite, erro.message);
      atualizar();
    }
  });

  if (window.location.hash === '#aceite') $cartaoAceite.scrollIntoView();
}

$anterior.addEventListener('click', () => { pagina -= 1; carregar(); });
$proxima.addEventListener('click', () => { pagina += 1; carregar(); });

async function iniciar() {
  prepararCabecalho();
  try {
    const estado = await api('/estado');
    admin = Boolean(estado.usuario?.admin);
    let regras;
    ({ categorias, permissao, regras } = await api('/forum/categorias'));
    if (permissao.precisaAceitar) {
      // Falta só o termo de aceite: em vez do botão, o termo (as regras abertas logo acima dele).
      $btnNovo.classList.add('hidden');
      mostrarAceite(regras, estado.usuario?.faixa);
    } else if (!permissao.ok) {
      // Quem não pode escrever só lê: em vez do botão, a razão.
      $btnNovo.classList.add('hidden');
      const motivo = permissao.motivo.charAt(0).toUpperCase() + permissao.motivo.slice(1);
      avisar(document.getElementById('aviso-escrever'), `${motivo}.`, 'info');
    }
    montarAbas();
    await carregar();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

iniciar();
