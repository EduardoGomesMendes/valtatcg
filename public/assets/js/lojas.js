import { api, avisar, el, limpar } from './api.js';

const $form = document.getElementById('form-busca');
const $uf = document.getElementById('filtro-uf');
const $cidade = document.getElementById('filtro-cidade');
const $q = document.getElementById('filtro-q');
const $lista = document.getElementById('lista-lojas');
const $aviso = document.getElementById('aviso');
const $contagem = document.getElementById('contagem');
const $paginacao = document.getElementById('paginacao');
const $paginaTexto = document.getElementById('pagina-texto');
const $anterior = document.getElementById('btn-anterior');
const $proxima = document.getElementById('btn-proxima');

let pagina = 1;
let logado = false;
let motivos = [];

/* Os links só nascem de dado já validado no servidor, mas são montados de novo aqui:
   o número vira dígitos, o @ vira caminho — nada do cadastro entra como URL pronta sem filtro. */
function linkWhatsapp(numero) {
  const digitos = String(numero).replace(/\D/g, '');
  return digitos ? `https://wa.me/${digitos}` : null;
}
function linkInstagram(usuario) {
  return /^[A-Za-z0-9._]{1,30}$/.test(usuario) ? `https://instagram.com/${usuario}` : null;
}
function linkSite(url) {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function botaoLink(rotulo, href) {
  if (!href) return null;
  const a = el('a', 'botao botao--secundario botao--pequeno', rotulo);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

async function denunciar(loja) {
  const lista = motivos.map((m, i) => `${i + 1} - ${m.rotulo}`).join('\n');
  const escolha = prompt(`Por que denunciar "${loja.nome}"?\n\n${lista}\n\nDigite o número:`);
  if (escolha === null) return;
  const motivo = motivos[Number(escolha) - 1];
  if (!motivo) {
    avisar($aviso, 'Escolha um número da lista.');
    return;
  }
  const detalhe = prompt('Quer explicar melhor? (opcional)', '') ?? '';
  try {
    await api('/denuncias', { method: 'POST', body: JSON.stringify({ alvoTipo: 'loja', alvoId: loja.id, motivo: motivo.chave, detalhe }) });
    avisar($aviso, 'Denúncia enviada. Obrigado — nossa equipe vai analisar.', 'sucesso');
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

function cartaoLoja(loja) {
  const cartao = el('article', 'cartao p--4 flex flex--col gap--2 loja--cartao', '');
  cartao.append(el('h2', 'text--md weight--semibold', loja.nome));
  cartao.append(el('span', 'text--sm text--muted', `${loja.cidade} · ${loja.uf}`));
  if (loja.descricao) cartao.append(el('p', 'text--sm', loja.descricao));

  const acoes = el('div', 'flex flex--wrap gap--2', '');
  [
    botaoLink('WhatsApp', loja.whatsapp && linkWhatsapp(loja.whatsapp)),
    botaoLink('Instagram', loja.instagram && linkInstagram(loja.instagram)),
    botaoLink('Site', loja.site && linkSite(loja.site)),
  ].filter(Boolean).forEach((b) => acoes.append(b));
  cartao.append(acoes);

  if (logado && motivos.length) {
    const btn = el('button', 'botao botao--pequeno text--muted', 'Denunciar');
    btn.type = 'button';
    btn.addEventListener('click', () => denunciar(loja));
    cartao.append(btn);
  }
  return cartao;
}

async function buscar() {
  const params = new URLSearchParams({ uf: $uf.value, cidade: $cidade.value.trim(), q: $q.value.trim(), pagina });
  try {
    const r = await api(`/lojas?${params}`);
    limpar($lista);
    avisar($aviso, null);
    r.lojas.forEach((l) => $lista.append(cartaoLoja(l)));

    const totalPaginas = Math.max(1, Math.ceil(r.total / r.porPagina));
    $contagem.textContent = r.total ? `${r.total} loja(s) encontrada(s)` : '';
    if (!r.total) {
      avisar($aviso, 'Nenhuma loja encontrada para essa busca ainda.', 'info');
    }
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
      logado = true;
      document.getElementById('topo-entrar').classList.add('hidden');
      document.getElementById('topo-colecao').classList.remove('hidden');
      const { motivos: porChave } = await api('/denuncias/motivos').catch(() => ({ motivos: {} }));
      motivos = Object.entries(porChave).map(([chave, rotulo]) => ({ chave, rotulo }));
    }
  } catch {
    // sem sessão, o diretório continua público.
  }

  try {
    const { ufs, comLojas } = await api('/lojas/ufs');
    const quantas = new Map(comLojas.map((c) => [c.uf, c.total]));
    ufs.forEach((uf) => {
      const opcao = el('option', '', quantas.has(uf) ? `${uf} (${quantas.get(uf)})` : uf);
      opcao.value = uf;
      $uf.append(opcao);
    });
  } catch {
    // o filtro de estado fica só com "Todo o Brasil".
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
