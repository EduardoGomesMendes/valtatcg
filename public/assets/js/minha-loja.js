import { api, avisar, el, dataBr, dataHoraBr, prepararCabecalho } from './api.js';

const $ = (id) => document.getElementById(id);
const $form = $('form-loja');
const $aviso = $('aviso-loja');
const $avisoMensalidade = $('aviso-mensalidade');

const ROTULO_STATUS = {
  pendente: ['Em análise', 'Recebemos o cadastro. Assim que a equipe aprovar, a mensalidade é liberada.'], // o prazo entra em mostrarSituacao
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

function mostrarSituacao(loja, prazoHoras) {
  const [selo, textoPadrao] = ROTULO_STATUS[loja.status];
  // Em análise, a promessa concreta: o administrador tem até {prazoHoras} h e a pessoa vê até quando.
  const texto = loja.status === 'pendente' && loja.prazo_revisao_em
    ? `Recebemos o cadastro. A equipe responde em até ${prazoHoras} horas (até ${dataHoraBr(loja.prazo_revisao_em)}). Depois da aprovação, a mensalidade é liberada.`
    : textoPadrao;
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

/** A oferta, dita antes de a pessoa preencher qualquer coisa: o que ela recebe, quanto custa e quanto demora. */
function textoDaOferta({ precoMensal, prazoRevisaoHoras }) {
  const preco = precoMensal > 0
    ? `A mensalidade é de ${reais(precoMensal)}: seu cadastro fica sempre atualizado no ValtaTCG e sua marca aparece no diretório, com a logo e o link direto para o seu site. `
    : '';
  return `${preco}Depois do envio, nossa equipe libera o cadastro em até ${prazoRevisaoHoras} horas.`;
}

function mostrarLogo(loja) {
  $('cartao-logo').classList.toggle('hidden', !loja);
  if (!loja) return;
  const tem = Boolean(loja.logo);
  $('previa-logo').classList.toggle('hidden', !tem);
  $('sem-logo').classList.toggle('hidden', tem);
  $('btn-remover-logo').classList.toggle('hidden', !tem);
  $('btn-escolher-logo').textContent = tem ? 'Trocar logo' : 'Escolher logo';
  // O dono vê a própria logo mesmo antes da aprovação; o ?v= força recarregar depois de uma troca.
  if (tem) $('previa-logo').src = `/api/minha-loja/logo?v=${encodeURIComponent(loja.logo_atualizado_em ?? '')}`;
}

async function carregar() {
  const dados = await api('/minha-loja');
  const { loja, permissao } = dados;
  $('texto-oferta').textContent = textoDaOferta(dados);
  mostrarLogo(loja);

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
    mostrarSituacao(loja, dados.prazoRevisaoHoras);
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

/* ------------------------------------------------------------------ */
/* Logo                                                                */
/* ------------------------------------------------------------------ */

const LADO_MAXIMO = 600;

/** Reduz a imagem no próprio navegador (logo de 4000 px não precisa subir inteira) e a devolve em PNG, com transparência. */
async function prepararLogo(arquivo) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type)) throw new Error('envie a logo em PNG, JPEG ou WEBP');
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('não consegui abrir essa imagem');
  });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/png');
}

$('btn-escolher-logo').addEventListener('click', () => $('entrada-logo').click());

$('entrada-logo').addEventListener('change', async () => {
  const arquivo = $('entrada-logo').files[0];
  $('entrada-logo').value = '';
  if (!arquivo) return;
  $('btn-escolher-logo').disabled = true;
  try {
    const imagem = await prepararLogo(arquivo);
    const r = await api('/minha-loja/logo', { method: 'POST', body: JSON.stringify({ imagem }) });
    avisar($('aviso-logo'), r.voltouParaRevisao
      ? 'Logo enviada. A loja volta para revisão e reaparece no diretório quando for aprovada.'
      : 'Logo enviada. Ela aparece no diretório assim que a loja for aprovada.', 'sucesso');
    await carregar();
  } catch (erro) {
    avisar($('aviso-logo'), erro.message);
  } finally {
    $('btn-escolher-logo').disabled = false;
  }
});

$('btn-remover-logo').addEventListener('click', async () => {
  if (!confirm('Remover a logo da loja?')) return;
  try {
    await api('/minha-loja/logo', { method: 'DELETE' });
    avisar($('aviso-logo'), 'Logo removida.', 'info');
    await carregar();
  } catch (erro) {
    avisar($('aviso-logo'), erro.message);
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
