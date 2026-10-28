import { api, avisar, el, limpar, dataBr, dataHoraBr, prepararCabecalho } from './api.js';

const $lista = document.getElementById('lista-lojas');
const $aviso = document.getElementById('aviso');
const $filtros = document.getElementById('filtros-status');

const FILTROS = [
  ['pendente', 'Em análise'],
  ['ativa', 'Aprovadas'],
  ['recusada', 'Recusadas'],
  ['suspensa', 'Suspensas'],
  ['todas', 'Todas'],
];
let filtro = 'pendente';

document.getElementById('btn-sair').addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

// CNPJ aparece formatado só aqui, para o admin conferir na Receita.
function cnpjBr(d) {
  return String(d).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

async function acao(caminho, corpo) {
  try {
    await api(caminho, { method: 'POST', body: JSON.stringify(corpo) });
    carregar();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

function mudarStatus(loja, status, pedirMotivo) {
  let motivo = null;
  if (pedirMotivo) {
    motivo = prompt('Motivo (o dono da loja vê este texto):', '');
    if (motivo === null) return;
  }
  acao(`/admin/lojas/${loja.id}/status`, { status, motivo });
}

function botao(rotulo, classes, aoClicar) {
  const b = el('button', `botao ${classes} botao--pequeno`, rotulo);
  b.type = 'button';
  b.addEventListener('click', aoClicar);
  return b;
}

function contato(loja) {
  const partes = [];
  if (loja.whatsapp) partes.push(`WhatsApp ${loja.whatsapp}`);
  if (loja.instagram) partes.push(`@${loja.instagram}`);
  if (loja.site) partes.push(loja.site);
  return partes.join(' · ');
}

function validade(loja) {
  if (!loja.assinatura_expira_em) return 'Sem mensalidade';
  return `Mensalidade ${loja.assinatura_status} · até ${dataBr(loja.assinatura_expira_em)}`;
}

/** "Faltam 20 h 10 min" em texto normal; passado do prazo vira alerta vermelho. */
function linhaDoPrazo(prazoIso) {
  const restante = new Date(`${prazoIso.replace(' ', 'T')}Z`).getTime() - Date.now();
  const abs = Math.abs(restante);
  const horas = Math.floor(abs / 3600000);
  const minutos = Math.floor((abs % 3600000) / 60000);
  const duracao = horas > 0 ? `${horas} h ${minutos} min` : `${minutos} min`;
  return restante > 0
    ? el('span', 'text--sm weight--semibold', `Responder até ${dataHoraBr(prazoIso)} — faltam ${duracao}`)
    : el('span', 'text--sm weight--semibold text--danger', `PRAZO VENCIDO há ${duracao} (era ${dataHoraBr(prazoIso)})`);
}

function cartaoLoja(loja) {
  const cartao = el('article', 'cartao p--4 flex flex--col gap--2', '');

  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  topo.append(el('span', `selo ${loja.status === 'ativa' ? 'selo--sucesso' : loja.status === 'pendente' ? 'selo--neutro' : 'selo--perigo'}`, loja.status));
  topo.append(el('span', 'weight--semibold', loja.nome));
  topo.append(el('span', 'text--sm text--muted', `${loja.cidade} · ${loja.uf}`));
  cartao.append(topo);

  if (loja.status === 'pendente' && loja.prazo_revisao_em) cartao.append(linhaDoPrazo(loja.prazo_revisao_em));
  if (loja.logo) {
    // O administrador vê a logo antes de aprovar: a rota pública só serve loja que já está no ar.
    const logo = document.createElement('img');
    logo.src = `/api/admin/lojas/${Number(loja.id)}/logo?v=${encodeURIComponent(loja.logo_atualizado_em ?? '')}`;
    logo.alt = `Logo de ${loja.nome}`;
    logo.className = 'loja--logo loja--logo--previa';
    cartao.append(logo);
  }

  cartao.append(el('span', 'text--sm', `CNPJ ${cnpjBr(loja.cnpj)}`));
  cartao.append(el('span', 'text--xs text--muted', `Dono: ${loja.dono_nome} (${loja.dono_email})`));
  if (loja.descricao) cartao.append(el('p', 'text--sm', loja.descricao));
  cartao.append(el('span', 'text--xs text--muted', contato(loja)));
  cartao.append(el('span', 'text--xs text--muted', validade(loja)));
  if (loja.motivo_status) cartao.append(el('span', 'text--xs text--muted', `Motivo registrado: ${loja.motivo_status}`));

  const acoes = el('div', 'flex flex--wrap gap--2', '');
  if (loja.status !== 'ativa') acoes.append(botao('Aprovar', 'botao--primario', () => mudarStatus(loja, 'ativa', false)));
  if (loja.status === 'pendente') acoes.append(botao('Recusar', 'botao--secundario', () => mudarStatus(loja, 'recusada', true)));
  if (loja.status === 'ativa') acoes.append(botao('Suspender', 'botao--perigo', () => mudarStatus(loja, 'suspensa', true)));

  acoes.append(botao('Liberar dias de mensalidade', 'botao--secundario', () => {
    const dias = Number(prompt('Quantos dias liberar? (cortesia ou gateway fora do ar)', '30'));
    if (dias > 0) acao(`/admin/lojas/${loja.id}/assinatura`, { dias });
  }));
  cartao.append(acoes);
  return cartao;
}

function montarFiltros() {
  limpar($filtros);
  FILTROS.forEach(([chave, rotulo]) => {
    const b = botao(rotulo, chave === filtro ? 'botao--primario' : 'botao--secundario', () => {
      filtro = chave;
      montarFiltros();
      carregar();
    });
    $filtros.append(b);
  });
}

async function carregar() {
  try {
    const { lojas } = await api(`/admin/lojas?status=${filtro}`);
    limpar($lista);
    avisar($aviso, null);
    if (!lojas.length) {
      avisar($aviso, 'Nenhuma loja nesta situação.', 'info');
      return;
    }
    lojas.forEach((l) => $lista.append(cartaoLoja(l)));
  } catch (erro) {
    avisar($aviso, erro.status === 403 ? 'Só administradores têm acesso a esta página.' : erro.message);
  }
}

prepararCabecalho();
montarFiltros();
carregar();
