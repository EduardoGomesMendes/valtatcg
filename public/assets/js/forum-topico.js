import { api, avisar, el, limpar, dataBr, prepararCabecalho } from './api.js';
import { carregarMotivos, denunciar } from './denunciar.js';

const $aviso = document.getElementById('aviso');
const $cartaoTopico = document.getElementById('cartao-topico');
const $selos = document.getElementById('selos-topico');
const $titulo = document.getElementById('topico-titulo');
const $meta = document.getElementById('topico-meta');
const $corpo = document.getElementById('topico-corpo');
const $acoes = document.getElementById('acoes-topico');
const $tituloRespostas = document.getElementById('titulo-respostas');
const $respostas = document.getElementById('lista-respostas');
const $paginacao = document.getElementById('paginacao');
const $paginaTexto = document.getElementById('pagina-texto');
const $anterior = document.getElementById('btn-anterior');
const $proxima = document.getElementById('btn-proxima');
const $cartaoResponder = document.getElementById('cartao-responder');
const $formResposta = document.getElementById('form-resposta');
const $avisoResposta = document.getElementById('aviso-resposta');

const params = new URLSearchParams(window.location.search);
const id = Number(params.get('id'));
let pagina = Number(params.get('pagina')) || 1;
let admin = false;
let podeDenunciar = false;
let podeEscrever = true;

const SELO_MENOR = 'Menor de idade';

document.getElementById('btn-sair').addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

function botao(rotulo, classes, aoClicar) {
  const b = el('button', `botao ${classes} botao--pequeno`, rotulo);
  b.type = 'button';
  b.addEventListener('click', aoClicar);
  return b;
}

async function executar(promessa, depois) {
  try {
    await promessa();
    await depois();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

/** Botões de uma mensagem (tópico ou resposta): denunciar, apagar a própria, e os do admin. */
function acoesDe({ tipo, item, recarregar }) {
  const lista = [];
  const rotaAdmin = tipo === 'topico' ? `/admin/forum/topicos/${item.id}/moderar` : `/admin/forum/respostas/${item.id}/moderar`;
  const resumo = tipo === 'topico' ? item.titulo : item.corpo.slice(0, 60);

  if (item.meu) {
    lista.push(botao('Apagar', 'botao--secundario', () => {
      if (!confirm('Apagar isto? Não dá para desfazer.')) return;
      executar(
        () => api(tipo === 'topico' ? `/forum/topicos/${item.id}` : `/forum/respostas/${item.id}`, { method: 'DELETE' }),
        () => (tipo === 'topico' ? (window.location.href = '/forum/') : recarregar()),
      );
    }));
  } else if (podeDenunciar) {
    lista.push(botao('Denunciar', 'text--muted', () => denunciar({ alvoTipo: tipo, alvoId: item.id, nome: resumo, $aviso })));
  }

  if (admin) {
    const moderar = (acao) => executar(() => api(rotaAdmin, { method: 'POST', body: JSON.stringify({ acao }) }), recarregar);
    lista.push(botao(item.oculto ? 'Mostrar' : 'Ocultar', 'botao--perigo', () => moderar(item.oculto ? 'mostrar' : 'ocultar')));
    if (tipo === 'topico') {
      lista.push(botao(item.fixado ? 'Desafixar' : 'Fixar', 'botao--secundario', () => moderar(item.fixado ? 'desafixar' : 'fixar')));
      lista.push(botao(item.fechado ? 'Reabrir' : 'Fechar', 'botao--secundario', () => moderar(item.fechado ? 'abrir' : 'fechar')));
    }
    if (!item.meu) {
      lista.push(botao('Suspender autor', 'botao--perigo', () => {
        const motivo = prompt(`Suspender a conta de "${item.autor}"? Ela é desconectada na hora.\nMotivo (fica registrado):`, '');
        if (motivo === null) return;
        executar(() => api(`/admin/usuarios/${item.autorId}/suspender`, { method: 'POST', body: JSON.stringify({ motivo }) }), recarregar);
      }));
    }
  }
  return lista;
}

function cartaoResposta(r) {
  const cartao = el('article', 'cartao p--4 flex flex--col gap--2', '');
  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  topo.append(el('span', 'weight--semibold text--sm', r.autor));
  if (admin && r.autorFaixa === 'menor') topo.append(el('span', 'selo selo--neutro', SELO_MENOR));
  topo.append(el('span', 'text--xs text--muted', dataBr(r.criadoEm)));
  if (r.oculto) topo.append(el('span', 'selo selo--perigo', 'Oculta'));
  cartao.append(topo);
  cartao.append(el('p', 'corpo--texto text--sm', r.corpo));

  const acoes = acoesDe({ tipo: 'resposta', item: r, recarregar: carregar });
  if (acoes.length) {
    const linha = el('div', 'flex flex--wrap gap--2', '');
    acoes.forEach((a) => linha.append(a));
    cartao.append(linha);
  }
  return cartao;
}

async function carregar() {
  try {
    const { topico } = await api(`/forum/topicos/${id}?pagina=${pagina}`);
    avisar($aviso, null);
    document.title = `${topico.titulo} · ValtaTCG`;

    limpar($selos);
    $selos.append(el('span', 'selo selo--neutro', topico.categoriaRotulo));
    if (topico.fixado) $selos.append(el('span', 'selo selo--neutro', 'Fixado'));
    if (topico.fechado) $selos.append(el('span', 'selo selo--neutro', 'Fechado'));
    if (topico.oculto) $selos.append(el('span', 'selo selo--perigo', 'Oculto'));
    if (admin && topico.autorFaixa === 'menor') $selos.append(el('span', 'selo selo--neutro', `Autor: ${SELO_MENOR.toLowerCase()}`));

    $titulo.textContent = topico.titulo;
    $meta.textContent = `por ${topico.autor} · ${dataBr(topico.criadoEm)}`;
    $corpo.textContent = topico.corpo;
    limpar($acoes);
    acoesDe({ tipo: 'topico', item: topico, recarregar: carregar }).forEach((a) => $acoes.append(a));
    $cartaoTopico.classList.remove('hidden');

    limpar($respostas);
    topico.respostas.forEach((r) => $respostas.append(cartaoResposta(r)));
    $tituloRespostas.classList.toggle('hidden', topico.totalRespostas === 0);
    $tituloRespostas.textContent = `Respostas (${topico.totalRespostas})`;

    const totalPaginas = Math.max(1, Math.ceil(topico.totalRespostas / topico.porPagina));
    $paginacao.classList.toggle('hidden', totalPaginas <= 1);
    $paginaTexto.textContent = `Página ${topico.pagina} de ${totalPaginas}`;
    $anterior.disabled = topico.pagina <= 1;
    $proxima.disabled = topico.pagina >= totalPaginas;

    $cartaoResponder.classList.toggle('hidden', topico.fechado || topico.oculto || !podeEscrever);
  } catch (erro) {
    $cartaoTopico.classList.add('hidden');
    avisar($aviso, erro.status === 404 ? 'Este tópico não existe ou foi removido.' : erro.message);
  }
}

$formResposta.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoResposta, null);
  try {
    await api(`/forum/topicos/${id}/respostas`, { method: 'POST', body: JSON.stringify({ corpo: $formResposta.corpo.value }) });
    $formResposta.reset();
    const { topico } = await api(`/forum/topicos/${id}?pagina=1`);
    pagina = Math.max(1, Math.ceil(topico.totalRespostas / topico.porPagina)); // vai para a última página, onde a resposta nova está
    await carregar();
  } catch (erro) {
    avisar($avisoResposta, erro.message);
  }
});

$anterior.addEventListener('click', () => { pagina -= 1; carregar(); });
$proxima.addEventListener('click', () => { pagina += 1; carregar(); });

async function iniciar() {
  prepararCabecalho();
  if (!id) {
    avisar($aviso, 'Tópico não informado.');
    return;
  }
  try {
    const estado = await api('/estado');
    admin = Boolean(estado.usuario?.admin);
    podeDenunciar = (await carregarMotivos()).length > 0;
    podeEscrever = (await api('/forum/categorias')).permissao.ok;
  } catch {
    // sem o estado, a página segue só com leitura.
  }
  await carregar();
}

iniciar();
