import { api, avisar, el, dataBr, prepararCabecalho } from './api.js';

const $ = (id) => document.getElementById(id);
const $form = $('form-loja');
const $aviso = $('aviso-loja');
const $avisoMensalidade = $('aviso-mensalidade');

const ROTULO_STATUS = {
  pendente: ['Em análise', 'Recebemos o cadastro. Assim que a equipe aprovar, a mensalidade é liberada.'],
  ativa: ['Aprovada', 'Loja aprovada.'],
  recusada: ['Recusada', 'O cadastro não foi aprovado.'],
  suspensa: ['Suspensa', 'A loja foi suspensa e não aparece no diretório.'],
};

$('btn-sair').addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

function reais(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
}

function preencherFormulario(loja) {
  for (const campo of ['nome', 'cidade', 'descricao', 'instagram', 'site']) $form[campo].value = loja[campo] ?? '';
  $form.uf.value = loja.uf;
  // whatsapp volta do servidor com o 55 na frente; mostrar sem ele evita duplicar ao salvar.
  $form.whatsapp.value = (loja.whatsapp ?? '').replace(/^55/, '');
  $form.cnpj.value = loja.cnpj;
  $form.cnpj.readOnly = true;
}

function mostrarSituacao(loja) {
  const [selo, texto] = ROTULO_STATUS[loja.status];
  $('selo-status').textContent = selo;
  $('selo-status').className = `selo ${loja.status === 'ativa' ? 'selo--sucesso' : loja.status === 'pendente' ? 'selo--neutro' : 'selo--perigo'}`;
  $('texto-status').textContent = texto;
  $('motivo-status').textContent = loja.motivo_status ? `Motivo: ${loja.motivo_status}` : '';
  $('motivo-status').classList.toggle('hidden', !loja.motivo_status);
  $('cartao-situacao').classList.remove('hidden');
}

async function mostrarMensalidade(dados) {
  const { loja, precoMensal } = dados;
  const $card = $('cartao-mensalidade');
  $card.classList.toggle('hidden', loja.status !== 'ativa');
  if (loja.status !== 'ativa') return;

  const emDia = ['ativa', 'cancelada'].includes(loja.assinatura_status) && loja.assinatura_expira_em
    && new Date(`${loja.assinatura_expira_em.replace(' ', 'T')}Z`) > new Date();

  if (emDia && loja.assinatura_status === 'ativa') {
    $('texto-mensalidade').textContent = `Mensalidade em dia. Sua loja aparece no diretório até ${dataBr(loja.assinatura_expira_em)}.`;
  } else if (emDia) {
    $('texto-mensalidade').textContent = `Mensalidade cancelada. Sua loja continua no ar até ${dataBr(loja.assinatura_expira_em)}.`;
  } else {
    $('texto-mensalidade').textContent = 'Sua loja foi aprovada, mas só aparece no diretório com a mensalidade em dia.';
  }

  $('preco-mensalidade').textContent = precoMensal > 0
    ? `${reais(precoMensal)} / mês — PIX, boleto ou cartão.`
    : 'O valor da mensalidade ainda não foi definido. Fale com o suporte para liberar sua loja.';

  $('btn-assinar-loja').classList.toggle('hidden', !(precoMensal > 0) || (emDia && loja.assinatura_status === 'ativa'));
  $('btn-cancelar-loja').classList.toggle('hidden', !(emDia && loja.assinatura_status === 'ativa'));

  const $link = $('link-cobranca-loja');
  $link.classList.add('hidden');
  if (loja.temAssinaturaNoGateway && !(emDia && loja.assinatura_status === 'ativa')) {
    const cobranca = await api('/minha-loja/cobranca').catch(() => null);
    if (cobranca?.url) {
      $link.href = cobranca.url;
      $link.classList.remove('hidden');
    }
  }
}

async function carregar() {
  const dados = await api('/minha-loja');
  const { loja, permissao } = dados;

  $('cartao-bloqueio').classList.toggle('hidden', Boolean(loja) || permissao.ok);
  if (!loja && !permissao.ok) {
    $('texto-bloqueio').textContent = permissao.motivo.charAt(0).toUpperCase() + permissao.motivo.slice(1) + '.';
    return;
  }

  $('cartao-form').classList.remove('hidden');
  $('aviso-revisao').classList.toggle('hidden', !loja);
  $('titulo-form').textContent = loja ? 'Dados da loja' : 'Cadastrar loja';
  $('btn-salvar-loja').textContent = loja ? 'Salvar alterações' : 'Enviar para aprovação';
  $('ajuda-cnpj').classList.toggle('hidden', Boolean(loja));

  if (loja) {
    preencherFormulario(loja);
    mostrarSituacao(loja);
    await mostrarMensalidade(dados);
  }
}

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const corpo = Object.fromEntries(new FormData($form));
  const jaTem = $form.cnpj.readOnly;
  try {
    await api('/minha-loja', { method: jaTem ? 'PATCH' : 'POST', body: JSON.stringify(corpo) });
    avisar($aviso, jaTem ? 'Alterações salvas.' : 'Loja enviada! Volte aqui para acompanhar a aprovação.', 'sucesso');
    await carregar();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
});

$('btn-assinar-loja').addEventListener('click', async () => {
  $('btn-assinar-loja').disabled = true;
  try {
    const r = await api('/minha-loja/assinar', { method: 'POST', body: JSON.stringify({}) });
    avisar($avisoMensalidade, r.pagamento.mensagem, 'sucesso');
    if (r.pagamento.url) {
      const $link = $('link-cobranca-loja');
      $link.href = r.pagamento.url;
      $link.classList.remove('hidden');
      $('btn-assinar-loja').classList.add('hidden');
    }
  } catch (erro) {
    avisar($avisoMensalidade, erro.message);
  } finally {
    $('btn-assinar-loja').disabled = false;
  }
});

$('btn-cancelar-loja').addEventListener('click', async () => {
  if (!confirm('Cancelar a mensalidade? A loja continua no ar até o fim do período já pago.')) return;
  try {
    await api('/minha-loja/cancelar', { method: 'POST', body: JSON.stringify({}) });
    await carregar();
    avisar($avisoMensalidade, 'Mensalidade cancelada.', 'info');
  } catch (erro) {
    avisar($avisoMensalidade, erro.message);
  }
});

async function iniciar() {
  try {
    const { ufs } = await api('/lojas/ufs');
    ufs.forEach((uf) => {
      const opcao = el('option', '', uf);
      opcao.value = uf;
      $('campo-uf').append(opcao);
    });
    await carregar();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

prepararCabecalho();
iniciar();
