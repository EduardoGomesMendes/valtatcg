import { api, avisar, avisarComAssinatura, frasePlanoGratis, el, limpar, prepararCabecalho } from './api.js';
import { carregarCambio, preco } from './moeda.js';

/*
  Fichário: escolhe uma coleção e mostra, carta a carta, o que a pessoa tem e o que falta.
  "Marcar" cadastra a carta na coleção (o mesmo caminho da busca, com o mesmo limite do plano grátis).
  Todo texto vem para a tela por textContent: nome de carta e de coleção nunca viram HTML.
*/

prepararCabecalho();

const $telaLista = document.getElementById('tela-lista');
const $telaColecao = document.getElementById('tela-colecao');
const $avisoLista = document.getElementById('aviso-lista');
const $avisoColecao = document.getElementById('aviso-colecao');
const $avisoCota = document.getElementById('aviso-cota');

const idDaUrl = new URLSearchParams(window.location.search).get('colecao');

/** Minúsculas e sem acento, para "pokemon" achar "Pokémon" na busca. */
const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/* ------------------------------------------------------------------ */
/* Lista de coleções                                                    */
/* ------------------------------------------------------------------ */

let todasAsColecoes = [];

function cartaoDaColecao(c) {
  const cartao = el('a', 'cartao fichario--colecao p--3 flex flex--col gap--2', '');
  cartao.href = `/fichario/?colecao=${encodeURIComponent(c.id)}`;

  const logo = el('div', 'fichario--logo-caixa flex items--center justify--content--center', '');
  if (c.logo) {
    const img = document.createElement('img');
    img.src = c.logo;
    img.alt = '';
    img.loading = 'lazy';
    img.className = 'fichario--logo';
    logo.append(img);
  }
  cartao.append(logo);
  cartao.append(el('span', 'text--sm weight--semibold carta--nome', c.nome));

  const completa = c.total > 0 && c.tenho >= c.total;
  cartao.append(el('span', `text--xs ${completa ? 'text--success weight--semibold' : 'text--muted'}`, completa ? `Completa · ${c.total} cartas` : `${c.tenho} de ${c.total} cartas`));

  const barra = document.createElement('progress');
  barra.className = 'progresso';
  barra.max = Math.max(1, c.total);
  barra.value = Math.min(c.tenho, barra.max);
  cartao.append(barra);
  return cartao;
}

function desenharLista() {
  const $lista = document.getElementById('lista-colecoes');
  const termo = normalizar(document.getElementById('busca-colecao').value.trim());
  const soComecadas = document.getElementById('so-comecadas').checked;

  const visiveis = todasAsColecoes.filter((c) => (
    (!soComecadas || c.tenho > 0)
    && (!termo || normalizar(`${c.nome} ${c.serie ?? ''} ${c.id}`).includes(termo))
  ));

  limpar($lista);
  if (!visiveis.length) {
    $lista.append(el('p', 'text--sm text--muted', soComecadas && !termo ? 'Você ainda não tem cartas em nenhuma coleção. Desmarque "Só as que comecei" para ver todas.' : 'Nenhuma coleção encontrada.'));
    return;
  }

  // Agrupa por série mantendo a ordem da lista (da mais nova para a mais antiga).
  const series = new Map();
  for (const c of visiveis) {
    const nome = c.serie ?? 'Outras';
    if (!series.has(nome)) series.set(nome, []);
    series.get(nome).push(c);
  }
  for (const [nome, colecoes] of series) {
    const bloco = el('div', 'flex flex--col gap--3', '');
    bloco.append(el('h2', 'text--md weight--semibold', nome));
    const grade = el('div', 'flex flex--wrap gap--3', '');
    colecoes.forEach((c) => grade.append(cartaoDaColecao(c)));
    bloco.append(grade);
    $lista.append(bloco);
  }
}

async function abrirLista() {
  $telaLista.classList.remove('hidden');
  try {
    todasAsColecoes = (await api('/fichario/colecoes')).colecoes;
    avisar($avisoLista, null);
  } catch (erro) {
    avisar($avisoLista, erro.message);
    return;
  }
  desenharLista();
  document.getElementById('busca-colecao').addEventListener('input', desenharLista);
  document.getElementById('so-comecadas').addEventListener('change', desenharLista);
}

/* ------------------------------------------------------------------ */
/* Uma coleção                                                          */
/* ------------------------------------------------------------------ */

let dados = null; // { colecao, cartas, resumo } do servidor
let filtro = 'todas';
let soPrincipal = false;
let cota = null;
const fichas = new Map(); // id da carta → elemento, para atualizar uma carta sem redesenhar a grade

const $grade = document.getElementById('grade-cartas');

function textoDoEstado(carta) {
  return carta.quantidade > 1 ? `✓ Tenho · ${carta.quantidade}` : '✓ Tenho';
}

/** O que muda numa ficha quando a carta é marcada ou tirada: a cor, o texto e os botões. */
function pintarFicha(ficha, carta) {
  ficha.classList.toggle('ficha--tenho', carta.tenho);
  ficha.classList.toggle('ficha--falta', !carta.tenho);
  const area = ficha.querySelector('.ficha--estado');
  limpar(area);

  if (carta.tenho) {
    area.append(el('span', 'text--xs weight--semibold text--success', textoDoEstado(carta)));
    const tirar = el('button', 'botao botao--secundario botao--pequeno ficha--acao', 'Tirar');
    tirar.type = 'button';
    tirar.addEventListener('click', () => tirarCarta(carta, tirar));
    area.append(tirar);
  } else {
    const marcar = el('button', 'botao botao--primario botao--pequeno ficha--acao', 'Tenho');
    marcar.type = 'button';
    marcar.title = 'Adicionar esta carta à sua coleção';
    marcar.addEventListener('click', () => marcarCarta(carta, marcar));
    area.append(marcar);
  }
}

function criarFicha(carta) {
  const ficha = el('article', 'ficha flex flex--col gap--1', '');
  const link = el('a', 'ficha--imagem', '');
  link.href = `/carta/?id=${encodeURIComponent(carta.id)}`;
  const img = document.createElement('img');
  img.className = 'imagem--carta';
  img.loading = 'lazy';
  img.alt = carta.nome;
  if (carta.imagem) img.src = carta.imagem;
  link.append(img);
  ficha.append(link);
  ficha.append(el('span', 'text--xs weight--semibold ficha--nome', `#${carta.numero ?? '?'} ${carta.nome}`));
  ficha.append(el('span', 'text--xs text--muted', carta.precoUsd === null ? 'sem preço' : preco(carta.precoUsd)));
  ficha.append(el('div', 'ficha--estado flex flex--col gap--1', ''));
  pintarFicha(ficha, carta);
  return ficha;
}

function cartaVisivel(carta) {
  if (soPrincipal && !carta.principal) return false;
  if (filtro === 'faltam') return !carta.tenho;
  if (filtro === 'tenho') return carta.tenho;
  return true;
}

function desenharGrade() {
  limpar($grade);
  fichas.clear();
  const visiveis = dados.cartas.filter(cartaVisivel);
  if (!visiveis.length) {
    $grade.append(el('p', 'text--sm text--muted', filtro === 'faltam' ? 'Nenhuma carta falta: a coleção está completa.' : filtro === 'tenho' ? 'Você ainda não marcou nenhuma carta desta coleção.' : 'Nenhuma carta.'));
    return;
  }
  for (const carta of visiveis) {
    const ficha = criarFicha(carta);
    fichas.set(carta.id, ficha);
    $grade.append(ficha);
  }
}

const quantas = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

function desenharResumo() {
  const { colecao, resumo } = dados;
  // "Só as numeradas" troca os números do cabeçalho pelos da coleção principal (o "165" de "025/165").
  const alvo = soPrincipal ? resumo.principal : resumo;
  const faltam = alvo.total - alvo.tenho;
  const custo = alvo.custoParaCompletarUsd;
  const semPreco = alvo.faltamSemPreco;
  // Arredonda para baixo (99,6% não pode aparecer como 100%), mas quem já tem alguma carta nunca vê "0%".
  const percentual = alvo.total ? Math.max(alvo.tenho > 0 ? 1 : 0, Math.floor((alvo.tenho / alvo.total) * 100)) : 0;

  document.getElementById('colecao-nome').textContent = colecao.nome;
  document.getElementById('colecao-serie').textContent = [colecao.serie, colecao.lancamento ? `lançada em ${colecao.lancamento.split('-').reverse().join('/')}` : null].filter(Boolean).join(' · ');
  const $logo = document.getElementById('colecao-logo');
  if (colecao.logo) {
    $logo.src = colecao.logo;
    $logo.classList.remove('hidden');
  }

  document.getElementById('colecao-progresso').textContent = faltam === 0 && alvo.total > 0
    ? `Completa! ${alvo.tenho} de ${alvo.total} cartas`
    : `${alvo.tenho} de ${alvo.total} cartas (${percentual}%)`;
  const $barra = document.getElementById('colecao-barra');
  $barra.max = Math.max(1, alvo.total);
  $barra.value = alvo.tenho;

  document.getElementById('colecao-faltam').textContent = String(faltam);
  document.getElementById('colecao-custo').textContent = faltam === 0 ? '—' : `${preco(custo)}${semPreco ? ` + ${quantas(semPreco, 'carta sem preço', 'cartas sem preço')}` : ''}`;
  document.getElementById('colecao-valor').textContent = resumo.valorQueTenhoUsd > 0 ? preco(resumo.valorQueTenhoUsd) : '—';
  document.getElementById('colecao-repetidas').textContent = String(resumo.repetidas);

  // O que a pessoa marcou fora da lista principal (secretas) não some do total: só mostramos qual contagem vale agora.
  const temSecretas = resumo.principal.total < resumo.total;
  document.getElementById('rotulo-principal').classList.toggle('hidden', !temSecretas);
  document.getElementById('texto-principal').textContent = `Só as numeradas (${resumo.principal.total} de ${resumo.total})`;
  document.getElementById('colecao-nota').textContent = temSecretas
    ? `Esta coleção tem ${resumo.total - resumo.principal.total} cartas além das numeradas (secretas e especiais), que costumam custar bem mais. Marque "Só as numeradas" para ver a conta sem elas.`
    : '';
}

/**
 * O faixa do topo da página já diz quanto resta da cota ao abrir a tela; aqui só entra o aviso de que ela acabou
 * (que o faixa, carregado uma vez, não acompanha), com o caminho para assinar.
 */
function desenharCota() {
  if (!cota || cota.restantesHoje > 0) {
    avisar($avisoCota, null);
    return;
  }
  avisar($avisoCota, frasePlanoGratis(cota), 'info');
  const link = el('a', 'weight--semibold', ' Assinar sem limite');
  link.href = '/assinatura/';
  $avisoCota.append(link);
}

async function carregarCota() {
  try {
    cota = (await api('/assinatura')).cota;
  } catch {
    cota = null; // sem a cota a tela funciona igual: quem barra de verdade é o servidor.
  }
  desenharCota();
}

/** Busca os números de novo e atualiza só o que mudou: cabeçalho e as fichas que trocaram de estado (a grade não pisca). */
async function atualizar() {
  const novo = await api(`/fichario/colecoes/${encodeURIComponent(idDaUrl)}`);
  const antes = new Map(dados.cartas.map((c) => [c.id, c]));
  dados = novo;
  desenharResumo();
  for (const carta of dados.cartas) {
    const ficha = fichas.get(carta.id);
    const velha = antes.get(carta.id);
    if (ficha && (velha?.tenho !== carta.tenho || velha?.quantidade !== carta.quantidade)) pintarFicha(ficha, carta);
  }
  await carregarCota();
}

async function marcarCarta(carta, botao) {
  botao.disabled = true;
  avisar($avisoColecao, null);
  try {
    await api('/colecao', { method: 'POST', body: JSON.stringify({ cartaId: carta.id, quantidade: 1 }) });
    await atualizar();
  } catch (erro) {
    avisarComAssinatura($avisoColecao, erro);
    if (erro.status === 429 && erro.corpo?.cota) {
      cota = erro.corpo.cota;
      desenharCota();
    }
    botao.disabled = false;
  }
}

async function tirarCarta(carta, botao) {
  const comPreco = carta.itens.some((i) => i.comPrecoPago);
  const aviso = `Tirar "${carta.nome}" da sua coleção?${comPreco ? ' O preço pago que você informou também será apagado.' : ''}`;
  if (!window.confirm(aviso)) return;
  botao.disabled = true;
  avisar($avisoColecao, null);
  try {
    for (const item of carta.itens) await api(`/colecao/${item.id}`, { method: 'DELETE' });
    await atualizar();
  } catch (erro) {
    avisar($avisoColecao, erro.message);
    botao.disabled = false;
  }
}

function ligarControles() {
  const botoes = [...document.querySelectorAll('#filtros [data-filtro]')];
  botoes.forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    botoes.forEach((outro) => {
      const ativo = outro === b;
      outro.classList.toggle('botao--primario', ativo);
      outro.classList.toggle('botao--secundario', !ativo);
    });
    desenharGrade();
  }));
  document.getElementById('so-principal').addEventListener('change', (ev) => {
    soPrincipal = ev.target.checked;
    desenharResumo();
    desenharGrade();
  });
}

async function abrirColecao() {
  $telaLista.classList.add('hidden');
  $telaColecao.classList.remove('hidden');
  if (!/^[A-Za-z0-9.-]{1,40}$/.test(idDaUrl)) {
    avisar($avisoColecao, 'Coleção inválida. Volte e escolha uma da lista.');
    return;
  }
  avisar($avisoColecao, 'Carregando as cartas da coleção…', 'info');
  try {
    // Na primeira vez que uma coleção é aberta o servidor busca as cartas na fonte, o que pode levar alguns segundos.
    const [resposta] = await Promise.all([api(`/fichario/colecoes/${encodeURIComponent(idDaUrl)}`), carregarCambio(), carregarCota()]);
    dados = resposta;
  } catch (erro) {
    avisar($avisoColecao, erro.status === 404 ? 'Coleção não encontrada. Volte e escolha uma da lista.' : erro.message);
    return;
  }
  avisar($avisoColecao, null);
  document.title = `${dados.colecao.nome} · Fichário · ValtaTCG`;
  ligarControles();
  desenharResumo();
  desenharGrade();
}

document.getElementById('btn-sair')?.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

if (idDaUrl) abrirColecao(); else abrirLista();
