import { api, avisar, el, limpar, dataSimples, prepararCabecalho } from './api.js';

const $lista = document.getElementById('lista-eventos');
const $aviso = document.getElementById('aviso');
const $filtros = document.getElementById('filtros-status');

const FILTROS = [['pendente', 'Aguardando'], ['aprovado', 'No ar'], ['recusado', 'Recusados'], ['todos', 'Todos']];
let filtro = 'pendente';

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

async function executar(promessa) {
  try {
    await promessa();
    await carregar();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

function cartaoEvento(e) {
  const cartao = el('article', 'cartao p--4 flex flex--col gap--2', '');
  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  topo.append(el('span', `selo ${e.status === 'aprovado' ? 'selo--sucesso' : e.status === 'recusado' ? 'selo--perigo' : 'selo--neutro'}`, e.status));
  topo.append(el('span', 'weight--semibold', e.titulo));
  topo.append(el('span', 'text--xs text--muted', e.tipoRotulo));
  cartao.append(topo);

  const datas = e.dataFim !== e.dataInicio ? `${dataSimples(e.dataInicio)} a ${dataSimples(e.dataFim)}` : dataSimples(e.dataInicio);
  cartao.append(el('span', 'text--sm', `${datas}${e.hora ? ` às ${e.hora}` : ''} · ${e.cidade} · ${e.uf}${e.local ? ` — ${e.local}` : ''}`));
  if (e.descricao) cartao.append(el('p', 'corpo--texto text--sm', e.descricao));
  if (e.link) cartao.append(el('span', 'text--xs text--muted', `Link: ${e.link}`));
  cartao.append(el('span', 'text--xs text--muted', `Cadastrado por ${e.criador}${e.loja ? ` · loja ${e.loja}` : ''}`));
  if (e.motivoStatus) cartao.append(el('span', 'text--xs text--muted', `Motivo registrado: ${e.motivoStatus}`));

  const acoes = el('div', 'flex flex--wrap gap--2', '');
  if (e.status !== 'aprovado') {
    acoes.append(botao('Aprovar', 'botao--primario', () => executar(() => api(`/admin/eventos/${e.id}/decidir`, { method: 'POST', body: JSON.stringify({ status: 'aprovado' }) }))));
  }
  if (e.status === 'pendente') {
    acoes.append(botao('Recusar', 'botao--secundario', () => {
      const motivo = prompt('Motivo da recusa (quem cadastrou vê este texto):', '');
      if (motivo === null) return;
      executar(() => api(`/admin/eventos/${e.id}/decidir`, { method: 'POST', body: JSON.stringify({ status: 'recusado', motivo }) }));
    }));
  }
  acoes.append(botao('Apagar', 'botao--perigo', () => {
    if (confirm(`Apagar o evento "${e.titulo}"?`)) executar(() => api(`/admin/eventos/${e.id}`, { method: 'DELETE' }));
  }));
  cartao.append(acoes);
  return cartao;
}

function montarFiltros() {
  limpar($filtros);
  FILTROS.forEach(([chave, rotulo]) => {
    $filtros.append(botao(rotulo, chave === filtro ? 'botao--primario' : 'botao--secundario', () => {
      filtro = chave;
      montarFiltros();
      carregar();
    }));
  });
}

async function carregar() {
  try {
    const { eventos } = await api(`/admin/eventos?status=${filtro}`);
    limpar($lista);
    avisar($aviso, eventos.length ? null : 'Nenhum evento nesta situação.', 'info');
    eventos.forEach((e) => $lista.append(cartaoEvento(e)));
  } catch (erro) {
    avisar($aviso, erro.status === 403 ? 'Só administradores têm acesso a esta página.' : erro.message);
  }
}

prepararCabecalho();
montarFiltros();
carregar();
