/*
  Camada de acesso à API + helpers de DOM.
  Regra de segurança: nada aqui usa innerHTML com dado vindo do servidor.
  Todo texto entra por textContent, então dado da API nunca vira HTML.
  A sessão vive em cookie HttpOnly — o JavaScript não enxerga o token.
*/

const PUBLICAS = ['/entrar/'];

function ehPaginaPublica() {
  return PUBLICAS.some((p) => window.location.pathname.startsWith(p));
}

export async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    ...opcoes,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) },
  });

  let corpo = null;
  if (resposta.status !== 204) corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    if (resposta.status === 401 && !ehPaginaPublica()) {
      const destino = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/entrar/?destino=${destino}`;
      throw new Error('não autenticado');
    }
    // Assinatura vencida: em vez de um erro seco, diz o que fazer. Não
    // redireciona sozinho para não jogar fora o que a pessoa estava fazendo.
    if (resposta.status === 402) {
      const onde = window.location.pathname.startsWith('/assinatura/') ? '' : ' Abra "Assinatura" no menu para regularizar.';
      throw new Error(`${corpo?.erro ?? 'Assinatura inativa.'}${onde}`);
    }
    const erro = new Error(corpo?.erro || `erro ${resposta.status}`);
    erro.status = resposta.status;
    erro.corpo = corpo;
    throw erro;
  }

  return corpo;
}

/**
 * Cria um elemento.
 * @param {string} tag
 * @param {string} classes - lista separada por espaço
 * @param {string} texto - inserido como textContent (nunca como HTML)
 */
export function el(tag, classes = '', texto = '') {
  const node = document.createElement(tag);
  if (classes) node.className = classes;
  if (texto !== '' && texto !== null && texto !== undefined) node.textContent = String(texto);
  return node;
}

export function limpar(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Mostra uma mensagem em um elemento reservado para isso. tipo: 'erro' | 'sucesso' | 'info' */
export function avisar(elemento, mensagem, tipo = 'erro') {
  if (!elemento) return;
  elemento.textContent = mensagem ?? '';
  const classe = tipo === 'erro' ? 'text--danger' : tipo === 'sucesso' ? 'text--success' : 'text--muted';
  elemento.className = mensagem ? `faixa text--sm ${classe}` : 'hidden';
}

/* ------------------------------------------------------------------ */
/* Formatação — preços da pokemontcg.io vêm em dólar (tcgplayer)       */
/* ------------------------------------------------------------------ */

export function dolar(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function dataBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Carrega a foto de perfil (própria conta) num par imagem+iniciais — usado
 * tanto no botão redondo do cabeçalho quanto no card grande da tela de
 * perfil. 404 (sem foto enviada) é esperado, não é erro de verdade.
 */
export async function carregarAvatarEm(imgEl, placeholderEl, nome) {
  if (placeholderEl) {
    const partes = String(nome ?? '?').trim().split(/\s+/);
    placeholderEl.textContent = ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes.at(-1)[0] : '')).toUpperCase();
  }
  if (!imgEl) return;
  try {
    const resposta = await fetch('/api/perfil/avatar', { credentials: 'same-origin' });
    if (!resposta.ok) throw new Error('sem foto');
    const blob = await resposta.blob();
    imgEl.src = URL.createObjectURL(blob);
    imgEl.classList.remove('hidden');
    placeholderEl?.classList.add('hidden');
  } catch {
    imgEl.classList.add('hidden');
    placeholderEl?.classList.remove('hidden');
  }
}

/**
 * Prepara o cabeçalho de toda página logada: a foto/iniciais no botão
 * redondo, o link "Admin" para quem tem acesso, e o aviso de teste/
 * assinatura para quem não é admin (o admin não paga a própria assinatura —
 * ver exigirAssinatura no servidor).
 */
export async function prepararCabecalho() {
  let estado;
  try {
    estado = await api('/estado');
  } catch {
    return; // sessão inválida: o próximo api() da página já redireciona.
  }

  carregarAvatarEm(
    document.getElementById('avatar-topo-imagem'),
    document.getElementById('avatar-topo-placeholder'),
    estado.usuario?.nome,
  );

  if (estado.usuario?.admin) {
    document.getElementById('link-admin')?.classList.remove('hidden');
    return;
  }

  const $aviso = document.getElementById('aviso-assinatura');
  if (!$aviso) return;

  try {
    const situacao = await api('/assinatura');
    if (situacao.bloqueado) {
      mostrarAvisoAssinatura($aviso, situacao.motivo ?? 'Assinatura inativa.', 'aviso--bloqueio');
    } else if (situacao.status === 'teste' && situacao.avisar) {
      mostrarAvisoAssinatura($aviso, `Período de teste — ${situacao.diasRestantes} dia(s) restante(s).`, 'aviso--atencao');
    }
  } catch {
    // se a checagem falhar, só não mostra o aviso — não é motivo para travar a página.
  }
}

function mostrarAvisoAssinatura(elemento, mensagem, classeTom) {
  elemento.textContent = `${mensagem} `;
  const link = el('a', 'weight--semibold', 'Abrir assinatura');
  link.href = '/assinatura/';
  elemento.append(link);
  elemento.className = `aviso--assinatura ${classeTom}`;
}
