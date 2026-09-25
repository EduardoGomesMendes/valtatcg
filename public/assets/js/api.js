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

/** Mostra o link "Admin" do menu para quem tem acesso — chamado por toda página logada. */
export async function mostrarNavAdminSeAplicavel() {
  try {
    const estado = await api('/estado');
    if (estado.usuario?.admin) document.getElementById('link-admin')?.classList.remove('hidden');
  } catch {
    // silencioso: se a sessão for inválida, o próximo api() da página já redireciona.
  }
}
