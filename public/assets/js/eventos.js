import { api, avisar, el, limpar, dataSimples, mostrarLinkDoForum } from './api.js';
import { carregarMotivos, denunciar } from './denunciar.js';

const $form = document.getElementById('form-busca');
const $uf = document.getElementById('filtro-uf');
const $cidade = document.getElementById('filtro-cidade');
const $tipo = document.getElementById('filtro-tipo');
const $lista = document.getElementById('lista-eventos');
const $aviso = document.getElementById('aviso');
const $contagem = document.getElementById('contagem');
const $paginacao = document.getElementById('paginacao');
const $paginaTexto = document.getElementById('pagina-texto');
const $anterior = document.getElementById('btn-anterior');
const $proxima = document.getElementById('btn-proxima');

let pagina = 1;
let logado = false;
let tiposCarregados = false;

function linkSeguro(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function quando(e) {
  const datas = e.dataFim !== e.dataInicio ? `${dataSimples(e.dataInicio)} a ${dataSimples(e.dataFim)}` : dataSimples(e.dataInicio);
  return e.hora ? `${datas} às ${e.hora}` : datas;
}

function cartaoEvento(e) {
  const cartao = el('article', 'cartao p--4 flex flex--col gap--2 loja--cartao', '');
  cartao.append(el('span', 'selo selo--neutro self--start', e.tipoRotulo));
  cartao.append(el('h2', 'text--md weight--semibold', e.titulo));
  cartao.append(el('span', 'text--sm weight--semibold', quando(e)));
  cartao.append(el('span', 'text--sm text--muted', `${e.cidade} · ${e.uf}${e.local ? ` — ${e.local}` : ''}`));
  if (e.loja) cartao.append(el('span', 'text--xs text--muted', `Organização: ${e.loja}`));
  if (e.descricao) cartao.append(el('p', 'corpo--texto text--sm', e.descricao));

  const acoes = el('div', 'flex flex--wrap gap--2', '');
  const href = e.link && linkSeguro(e.link);
  if (href) {
    const a = el('a', 'botao botao--secundario botao--pequeno', 'Mais informações');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    acoes.append(a);
  }
  if (logado) {
    const b = el('button', 'botao botao--pequeno text--muted', 'Denunciar');
    b.type = 'button';
    b.addEventListener('click', () => denunciar({ alvoTipo: 'evento', alvoId: e.id, nome: e.titulo, $aviso }));
    acoes.append(b);
  }
  cartao.append(acoes);
  return cartao;
}

async function buscar() {
  const params = new URLSearchParams({ uf: $uf.value, cidade: $cidade.value.trim(), tipo: $tipo.value, pagina });
  try {
    const r = await api(`/eventos?${params}`);

    if (!tiposCarregados) {
      Object.entries(r.tipos).forEach(([chave, rotulo]) => {
        const o = el('option', '', rotulo);
        o.value = chave;
        $tipo.append(o);
      });
      r.ufs.forEach((uf) => {
        const o = el('option', '', uf);
        o.value = uf;
        $uf.append(o);
      });
      tiposCarregados = true;
    }

    limpar($lista);
    avisar($aviso, null);
    r.eventos.forEach((e) => $lista.append(cartaoEvento(e)));
    $contagem.textContent = r.total ? `${r.total} evento(s) encontrado(s)` : '';
    if (!r.total) avisar($aviso, 'Nenhum evento por aqui no momento. Quer divulgar o primeiro?', 'info');

    const totalPaginas = Math.max(1, Math.ceil(r.total / r.porPagina));
    $paginacao.classList.toggle('hidden', totalPaginas <= 1);
    $paginaTexto.textContent = `Página ${r.pagina} de ${totalPaginas}`;
    $anterior.disabled = r.pagina <= 1;
    $proxima.disabled = r.pagina >= totalPaginas;
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

async function iniciar() {
  try {
    const estado = await fetch('/api/estado', { credentials: 'same-origin' }).then((r) => r.json());
    if (estado.autenticado) {
      logado = (await carregarMotivos()).length > 0;
      document.getElementById('topo-entrar').classList.add('hidden');
      mostrarLinkDoForum();
      document.getElementById('topo-colecao').classList.remove('hidden');
    }
  } catch {
    // sem sessão, a agenda continua pública.
  }
  buscar();
}

$form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  pagina = 1;
  buscar();
});
$anterior.addEventListener('click', () => { pagina -= 1; buscar(); });
$proxima.addEventListener('click', () => { pagina += 1; buscar(); });

iniciar();
