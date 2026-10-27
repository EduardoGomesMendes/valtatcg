import { api, avisar, el, limpar, dataSimples, prepararCabecalho } from './api.js';

const $form = document.getElementById('form-evento');
const $avisoEvento = document.getElementById('aviso-evento');
const $avisoLista = document.getElementById('aviso-lista');
const $lista = document.getElementById('lista-meus');
const $tipo = document.getElementById('campo-tipo');
const $uf = document.getElementById('campo-uf');
const $dataInicio = document.getElementById('campo-data-inicio');
const $dataFim = document.getElementById('campo-data-fim');

document.getElementById('btn-sair').addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

const ROTULO_STATUS = { pendente: 'Aguardando aprovação', aprovado: 'No ar', recusado: 'Recusado' };

function cartaoEvento(e) {
  const cartao = el('article', 'cartao p--4 flex flex--col gap--2', '');
  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  topo.append(el('span', `selo ${e.status === 'aprovado' ? 'selo--sucesso' : e.status === 'recusado' ? 'selo--perigo' : 'selo--neutro'}`, ROTULO_STATUS[e.status]));
  topo.append(el('span', 'weight--semibold', e.titulo));
  cartao.append(topo);
  const datas = e.dataFim !== e.dataInicio ? `${dataSimples(e.dataInicio)} a ${dataSimples(e.dataFim)}` : dataSimples(e.dataInicio);
  cartao.append(el('span', 'text--sm text--muted', `${datas} · ${e.cidade} · ${e.uf}`));
  if (e.motivoStatus) cartao.append(el('span', 'text--xs text--muted', `Motivo: ${e.motivoStatus}`));

  const apagar = el('button', 'botao botao--secundario botao--pequeno nao--encolhe', 'Apagar');
  apagar.type = 'button';
  apagar.addEventListener('click', async () => {
    if (!confirm('Apagar este evento?')) return;
    try {
      await api(`/eventos/${e.id}`, { method: 'DELETE' });
      await carregar();
    } catch (erro) {
      avisar($avisoLista, erro.message);
    }
  });
  cartao.append(apagar);
  return cartao;
}

let formMontado = false;

async function carregar() {
  const r = await api('/meus-eventos');

  if (!formMontado) {
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
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    $dataInicio.min = hoje;
    $dataFim.min = hoje;
    formMontado = true;
  }

  document.getElementById('cartao-bloqueio').classList.toggle('hidden', r.permissao.ok);
  document.getElementById('cartao-form').classList.toggle('hidden', !r.permissao.ok);
  if (!r.permissao.ok) {
    const m = r.permissao.motivo;
    document.getElementById('texto-bloqueio').textContent = `${m.charAt(0).toUpperCase()}${m.slice(1)}.`;
  }

  limpar($lista);
  avisar($avisoLista, r.eventos.length ? null : 'Você ainda não cadastrou eventos.', 'info');
  r.eventos.forEach((e) => $lista.append(cartaoEvento(e)));
}

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoEvento, null);
  const dados = Object.fromEntries(new FormData($form).entries());
  try {
    const r = await api('/eventos', { method: 'POST', body: JSON.stringify(dados) });
    $form.reset();
    avisar($avisoEvento, r.status === 'aprovado' ? 'Evento publicado!' : 'Evento enviado. Ele aparece na agenda assim que for aprovado.', 'sucesso');
    await carregar();
  } catch (erro) {
    avisar($avisoEvento, erro.message);
  }
});

prepararCabecalho();
carregar().catch((erro) => avisar($avisoEvento, erro.message));
