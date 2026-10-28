import { api, avisar, el, limpar, dataBr, prepararCabecalho } from './api.js';

const $abas = document.getElementById('abas');
const $lista = document.getElementById('lista');
const $aviso = document.getElementById('aviso');

const VISOES = [['mensagens', 'Mensagens recentes'], ['bloqueios', 'Tentativas bloqueadas']];
let visao = 'mensagens';

document.getElementById('btn-sair').addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

const ROTULO_FAIXA = { menor: 'Menor de idade', adulto: 'Adulto', desconhecida: 'Idade não informada' };

function botao(rotulo, classes, aoClicar) {
  const b = el('button', `botao ${classes} botao--pequeno`, rotulo);
  b.type = 'button';
  b.addEventListener('click', aoClicar);
  return b;
}

async function executar(promessa) {
  try {
    await promessa();
    await carregar();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

function suspender(autorId, autor) {
  const motivo = prompt(`Suspender a conta de "${autor}"? Ela é desconectada na hora.\nMotivo (fica registrado):`, '');
  if (motivo === null) return null;
  return () => api(`/admin/usuarios/${autorId}/suspender`, { method: 'POST', body: JSON.stringify({ motivo }) });
}

function seloFaixa(faixa) {
  return el('span', `selo ${faixa === 'menor' ? 'selo--perigo' : 'selo--neutro'}`, ROTULO_FAIXA[faixa] ?? faixa);
}

/* ---------------- mensagens recentes ---------------- */

function cartaoMensagem(m) {
  const cartao = el('article', `cartao p--4 flex flex--col gap--2${m.adultoEmTopicoDeMenor ? ' msg--atencao' : ''}`, '');

  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  topo.append(el('span', 'weight--semibold', m.autor));
  topo.append(seloFaixa(m.autorFaixa));
  topo.append(el('span', 'text--xs text--muted', `${m.tipo === 'topico' ? 'abriu o tópico' : 'respondeu em'} “${m.titulo}” · ${dataBr(m.criadoEm)}`));
  if (m.oculto) topo.append(el('span', 'selo selo--perigo', 'Oculta'));
  if (m.autorSuspenso) topo.append(el('span', 'selo selo--perigo', 'Autor suspenso'));
  cartao.append(topo);

  if (m.adultoEmTopicoDeMenor) {
    cartao.append(el('span', 'text--xs weight--semibold text--danger', 'Adulto respondendo em tópico de menor — confira com atenção.'));
  }
  cartao.append(el('p', 'corpo--texto text--sm', m.corpo));

  const acoes = el('div', 'flex flex--wrap gap--2', '');
  const rota = m.tipo === 'topico' ? `/admin/forum/topicos/${m.id}/moderar` : `/admin/forum/respostas/${m.id}/moderar`;
  acoes.append(botao(m.oculto ? 'Mostrar' : 'Ocultar', 'botao--perigo', () => {
    executar(() => api(rota, { method: 'POST', body: JSON.stringify({ acao: m.oculto ? 'mostrar' : 'ocultar' }) }));
  }));
  const ver = el('a', 'botao botao--secundario botao--pequeno', 'Abrir no fórum');
  ver.href = `/forum/topico/?id=${m.topicoId}`;
  ver.target = '_blank';
  ver.rel = 'noopener';
  acoes.append(ver);
  if (!m.autorSuspenso) {
    acoes.append(botao('Suspender autor', 'botao--perigo', () => {
      const fazer = suspender(m.autorId, m.autor);
      if (fazer) executar(fazer);
    }));
  }
  cartao.append(acoes);
  return cartao;
}

/* ---------------- tentativas bloqueadas ---------------- */

function cartaoBloqueio(b) {
  const cartao = el('article', `cartao p--4 flex flex--col gap--2${b.grave ? ' msg--atencao' : ''}`, '');
  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  topo.append(el('span', 'weight--semibold', b.autor));
  topo.append(seloFaixa(b.autorFaixa));
  topo.append(el('span', `selo ${b.grave ? 'selo--perigo' : 'selo--neutro'}`, b.grave ? 'Grave' : 'Leve'));
  if (b.autorSuspenso) topo.append(el('span', 'selo selo--perigo', 'Suspenso'));
  topo.append(el('span', 'text--xs text--muted', `${dataBr(b.criadoEm)} · em ${b.origem}`));
  cartao.append(topo);
  cartao.append(el('span', 'text--sm', `Barrado: ${b.classeRotulo}`));
  cartao.append(el('p', 'corpo--texto text--sm text--muted', `“${b.trecho}”`));
  cartao.append(el('span', 'text--xs text--muted', `${b.autorNome} · ${b.autorEmail}`));

  if (!b.autorSuspenso) {
    const acoes = el('div', 'flex flex--wrap gap--2', '');
    acoes.append(botao('Suspender autor', 'botao--perigo', () => {
      const fazer = suspender(b.autorId, b.autor);
      if (fazer) executar(fazer);
    }));
    cartao.append(acoes);
  }
  return cartao;
}

/* ---------------- tela ---------------- */

function montarAbas() {
  limpar($abas);
  VISOES.forEach(([chave, rotulo]) => {
    $abas.append(botao(rotulo, chave === visao ? 'botao--primario' : 'botao--secundario', () => {
      visao = chave;
      montarAbas();
      carregar();
    }));
  });
}

async function carregar() {
  try {
    limpar($lista);
    if (visao === 'mensagens') {
      const { mensagens } = await api('/admin/moderacao/mensagens');
      avisar($aviso, mensagens.length ? null : 'Ainda não há mensagens no fórum.', 'info');
      mensagens.forEach((m) => $lista.append(cartaoMensagem(m)));
    } else {
      const { bloqueios, limites } = await api('/admin/moderacao/bloqueios');
      avisar($aviso, bloqueios.length
        ? `${limites.gravesEm24h} tentativas graves em 24h suspendem a conta sozinhas. Os registros são apagados depois de ${limites.retencaoDias} dias.`
        : 'Nenhuma mensagem foi barrada até agora.', 'info');
      bloqueios.forEach((b) => $lista.append(cartaoBloqueio(b)));
    }
  } catch (erro) {
    avisar($aviso, erro.status === 403 ? 'Só administradores têm acesso a esta página.' : erro.message);
  }
}

prepararCabecalho();
montarAbas();
carregar();
