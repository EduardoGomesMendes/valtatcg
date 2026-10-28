/*
  Camada de acesso à API + helpers de DOM.
  Regra de segurança: nada aqui usa innerHTML com dado vindo do servidor.
  Todo texto entra por textContent, então dado da API nunca vira HTML.
  A sessão vive em cookie HttpOnly — o JavaScript não enxerga o token.
*/

import { icone } from './icones.js';

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

/** "30/10 14:20" no horário de Brasília — para prazos, que importam até a hora. */
export function dataHoraBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function dataBr(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** O fórum só existe para quem entrou: o link nasce aqui, depois do login, e não vai no HTML público. */
export function mostrarLinkDoForum() {
  const antes = document.getElementById('topo-entrar');
  if (!antes || document.getElementById('topo-forum')) return;
  const link = el('a', 'nao--encolhe text--muted', 'Fórum');
  link.href = '/forum/';
  link.id = 'topo-forum';
  antes.before(link);
}

/**
 * Páginas abertas ao público (Lojas, Eventos) nascem com o cabeçalho de visitante. Quem está logado precisa do
 * menu completo do sistema — senão, ao clicar nelas, o resto do menu e o avatar somem. Este cabeçalho é montado
 * aqui (e não no HTML) para o link do fórum também só existir depois do login.
 * @param {string} ativo caminho da página atual, para destacar no menu
 */
export function montarCabecalhoLogado(ativo) {
  const visitante = document.querySelector('header.home--topo');
  if (!visitante) return;

  const cabecalho = el('header', 'topo flex items--center justify--content--between px--6 bg--surface border--bottom', '');

  const marca = el('a', 'flex items--center gap--2', '');
  marca.href = '/colecao/';
  const simbolo = el('img', 'marca--simbolo', '');
  simbolo.src = '/assets/img/logo-simbolo.svg';
  simbolo.alt = '';
  simbolo.width = 32;
  simbolo.height = 32;
  const texto = el('span', 'marca--texto', '');
  texto.append(el('span', 'fonte--display', 'Valta'), ' ', el('span', 'marca--tcg', 'TCG'));
  marca.append(simbolo, texto);

  const nav = el('nav', 'flex items--center gap--5 topo--links', '');
  [['/colecao/', 'Coleção'], ['/buscar/', 'Buscar cartas'], ['/lojas/', 'Lojas'], ['/eventos/', 'Eventos'], ['/forum/', 'Fórum'], ['/assinatura/', 'Assinatura']]
    .forEach(([href, rotulo]) => {
      const a = el('a', `nao--encolhe ${href === ativo ? 'weight--semibold' : 'text--muted'}`, rotulo);
      a.href = href;
      nav.append(a);
    });
  const admin = el('a', 'nao--encolhe text--muted hidden', 'Admin');
  admin.href = '/admin/';
  admin.id = 'link-admin';
  nav.append(admin);

  const grupo = el('div', 'menu--grupo nao--encolhe', '');
  grupo.id = 'menu-perfil';
  const botao = el('button', 'avatar-botao', '');
  botao.type = 'button';
  botao.id = 'btn-avatar-menu';
  botao.setAttribute('aria-haspopup', 'true');
  botao.setAttribute('aria-expanded', 'false');
  botao.title = 'Menu da conta';
  const imagem = el('img', 'hidden', '');
  imagem.id = 'avatar-topo-imagem';
  imagem.alt = '';
  const iniciais = el('span', '', '?');
  iniciais.id = 'avatar-topo-placeholder';
  botao.append(imagem, iniciais);

  const lista = el('div', 'menu--lista hidden', '');
  lista.id = 'menu-avatar-lista';
  [['/perfil/', 'Editar perfil'], ['/minha-loja/', 'Minha loja'], ['/meus-eventos/', 'Meus eventos']].forEach(([href, rotulo]) => {
    const a = el('a', 'menu--item', rotulo);
    a.href = href;
    lista.append(a);
  });
  lista.append(el('span', 'menu--item menu--item--desabilitado', 'Configurações'));
  const sair = el('button', 'menu--item', 'Sair');
  sair.type = 'button';
  sair.id = 'btn-sair';
  sair.addEventListener('click', async () => {
    await api('/sair', { method: 'POST' }).catch(() => {});
    window.location.href = '/entrar/';
  });
  lista.append(sair);

  grupo.append(botao, lista);
  cabecalho.append(marca, nav, grupo);

  const aviso = el('div', 'hidden', '');
  aviso.id = 'aviso-assinatura';
  visitante.replaceWith(cabecalho, aviso);
  prepararCabecalho();
}

/** Data sem hora (AAAA-MM-DD → DD/MM/AAAA). Não passa por Date: o fuso do Brasil deslocaria um dia. */
export function dataSimples(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
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
    // 204 = conta sem foto (não é erro, só não há o que mostrar).
    if (resposta.status !== 200) throw new Error('sem foto');
    const blob = await resposta.blob();
    imgEl.src = URL.createObjectURL(blob);
    imgEl.classList.remove('hidden');
    placeholderEl?.classList.add('hidden');
  } catch {
    imgEl.classList.add('hidden');
    placeholderEl?.classList.remove('hidden');
  }
}

/** Abre/fecha o menu da conta ao clicar no avatar — fecha clicando fora ou com Esc. */
function inicializarMenuAvatar() {
  const $grupo = document.getElementById('menu-perfil');
  const $botao = document.getElementById('btn-avatar-menu');
  const $lista = document.getElementById('menu-avatar-lista');
  if (!$grupo || !$botao || !$lista) return;

  const fechar = () => {
    $lista.classList.add('hidden');
    $botao.setAttribute('aria-expanded', 'false');
  };

  $botao.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const estaFechado = $lista.classList.contains('hidden');
    if (estaFechado) {
      $lista.classList.remove('hidden');
      $botao.setAttribute('aria-expanded', 'true');
    } else {
      fechar();
    }
  });

  document.addEventListener('click', (ev) => {
    if (!$grupo.contains(ev.target)) fechar();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') fechar();
  });
}

const ATALHOS = [
  { href: '/colecao/', rotulo: 'Coleção', icone: 'colecao', rotas: ['/colecao/', '/carta/'] },
  { href: '/buscar/', rotulo: 'Buscar', icone: 'buscar', rotas: ['/buscar/'] },
  { href: '/lojas/', rotulo: 'Lojas', icone: 'lojas', rotas: ['/lojas/', '/minha-loja/'] },
  { href: '/eventos/', rotulo: 'Eventos', icone: 'eventos', rotas: ['/eventos/', '/meus-eventos/'] },
  { href: '/forum/', rotulo: 'Fórum', icone: 'forum', rotas: ['/forum/'] },
];

/** Barra de atalhos fixa embaixo da tela, como nos apps. Só aparece no celular: o CSS a esconde em telas maiores. */
export function montarBarraInferior() {
  if (document.getElementById('barra-inferior')) return;
  const barra = el('nav', 'barra--inferior', '');
  barra.id = 'barra-inferior';
  barra.setAttribute('aria-label', 'Atalhos');
  for (const atalho of ATALHOS) {
    const ativo = atalho.rotas.some((r) => window.location.pathname.startsWith(r));
    const link = el('a', `barra--item${ativo ? ' barra--item--ativo' : ''}`, '');
    link.href = atalho.href;
    if (ativo) link.setAttribute('aria-current', 'page');
    link.append(icone(atalho.icone, 22), el('span', '', atalho.rotulo));
    barra.append(link);
  }
  document.body.append(barra);
  document.body.classList.add('com-barra-inferior');
}

/** No celular os links de texto saem do topo; o que não cabe na barra (Assinatura, Admin) vai para o menu do avatar. */
function adicionarItensDoMenuMovel(usuario) {
  const lista = document.getElementById('menu-avatar-lista');
  if (!lista || lista.querySelector('[data-movel]')) return;
  const antes = [...lista.children].find((c) => c.textContent === 'Configurações') ?? null;
  const itens = [['/assinatura/', 'Assinatura']];
  if (usuario?.admin) itens.push(['/admin/', 'Admin']);
  for (const [href, rotulo] of itens) {
    const a = el('a', 'menu--item menu--item--so-movel', rotulo);
    a.href = href;
    a.dataset.movel = '1';
    lista.insertBefore(a, antes);
  }
}

/**
 * Prepara o cabeçalho de toda página logada: o menu do avatar (foto/
 * iniciais + editar perfil/configurações/sair), o link "Admin" para quem
 * tem acesso, e o aviso de teste/assinatura para quem não é admin (o admin
 * não paga a própria assinatura — ver exigirAssinatura no servidor).
 */
export async function prepararCabecalho() {
  inicializarMenuAvatar();

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

  montarBarraInferior();
  adicionarItensDoMenuMovel(estado.usuario);

  if (estado.usuario?.admin) {
    document.getElementById('link-admin')?.classList.remove('hidden');
    mostrarAvisoDoModerador(estado.usuario.moderacao);
    return;
  }

  const $aviso = document.getElementById('aviso-assinatura');
  if (!$aviso) return;

  // Avisos de segurança vêm antes dos de assinatura: sem eles a conta nem funciona direito.
  const u = estado.usuario;
  if (estado.exigeResponsavel && u?.responsavel_status === 'pendente') {
    mostrarAvisoAssinatura($aviso, 'Falta o seu responsável confirmar o cadastro. Enquanto isso você só consegue olhar.', 'aviso--bloqueio', 'Ver detalhes', '/perfil/');
    return;
  }
  if (u?.faixa === 'desconhecida') {
    mostrarAvisoAssinatura($aviso, 'Informe sua data de nascimento para continuar usando o ValtaTCG.', 'aviso--atencao', 'Informar agora', '/perfil/');
    return;
  }

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

/**
 * O administrador vê em toda página o que espera por ele: denúncias (as de segurança de menores primeiro)
 * e lojas aguardando aprovação, com o prazo de 48 horas. Cada aviso tem o seu link.
 */
function mostrarAvisoDoModerador(resumo) {
  const $aviso = document.getElementById('aviso-assinatura');
  if (!$aviso || !resumo) return;

  const avisos = [];
  if (resumo.denunciasAbertas) {
    const urgentes = resumo.denunciasUrgentes;
    avisos.push({
      urgente: urgentes > 0,
      texto: urgentes > 0
        ? `ATENÇÃO: ${urgentes} denúncia(s) URGENTE(S) de segurança de menores aguardando você (${resumo.denunciasAbertas} no total).`
        : `${resumo.denunciasAbertas} denúncia(s) aguardando análise.`,
      rotulo: 'Abrir denúncias',
      href: '/admin-denuncias/',
    });
  }
  if (resumo.lojasPendentes) {
    const vencidas = resumo.lojasVencidas;
    avisos.push({
      urgente: vencidas > 0,
      texto: vencidas > 0
        ? `ATENÇÃO: ${vencidas} loja(s) passaram do prazo de 48 horas para aprovação (${resumo.lojasPendentes} aguardando no total).`
        : `${resumo.lojasPendentes} loja(s) aguardando aprovação — responder até ${dataHoraBr(resumo.lojasProximoPrazo)}.`,
      rotulo: 'Abrir lojas',
      href: '/admin-lojas/',
    });
  }
  if (!avisos.length) return;

  // O tom do aviso é o do mais urgente; os textos se juntam, cada um com o seu link.
  avisos.sort((a, b) => Number(b.urgente) - Number(a.urgente));
  $aviso.textContent = '';
  avisos.forEach((a, i) => {
    $aviso.append(`${i > 0 ? ' · ' : ''}${a.texto} `);
    const link = el('a', 'weight--semibold', a.rotulo);
    link.href = a.href;
    $aviso.append(link);
  });
  $aviso.className = `aviso--assinatura ${avisos[0].urgente ? 'aviso--bloqueio' : 'aviso--atencao'}`;
}

function mostrarAvisoAssinatura(elemento, mensagem, classeTom, rotuloLink = 'Abrir assinatura', href = '/assinatura/') {
  elemento.textContent = `${mensagem} `;
  const link = el('a', 'weight--semibold', rotuloLink);
  link.href = href;
  elemento.append(link);
  elemento.className = `aviso--assinatura ${classeTom}`;
}
