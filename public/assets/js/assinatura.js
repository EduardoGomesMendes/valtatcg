import { api, avisar, dolar, prepararCabecalho } from './api.js';

const $statusTexto = document.getElementById('status-texto');
const $statusDetalhe = document.getElementById('status-detalhe');
const $cartaoAssinar = document.getElementById('cartao-assinar');
const $cartaoCancelar = document.getElementById('cartao-cancelar');
const $precoPlano = document.getElementById('preco-plano');
const $form = document.getElementById('form-assinar');
const $avisoAssinar = document.getElementById('aviso-assinar');
const $btnAssinar = document.getElementById('btn-assinar');
const $linkCobranca = document.getElementById('link-cobranca');
const $btnCancelar = document.getElementById('btn-cancelar');
const $btnSair = document.getElementById('btn-sair');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

// Preços do Asaas são em reais — diferente do resto do app, que mostra em dólar.
function reais(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function textoDoStatus(situacao) {
  switch (situacao.status) {
    case 'teste':
      return [`Período de teste — ${situacao.diasRestantes} dia(s) restante(s).`, null];
    case 'ativa':
      return ['Assinatura ativa.', `Renova em ${situacao.diasRestantes} dia(s).`];
    case 'vencida':
      return ['Assinatura vencida.', situacao.motivo];
    case 'cancelada':
      return ['Assinatura cancelada.', 'Assine de novo para voltar a editar sua coleção.'];
    default:
      return ['—', null];
  }
}

async function carregar() {
  try {
    const situacao = await api('/assinatura');

    $precoPlano.textContent = `${reais(situacao.plano.preco)} / mês`;

    const [texto, detalhe] = textoDoStatus(situacao);
    $statusTexto.textContent = texto;
    $statusTexto.className = `text--lg weight--semibold ${situacao.bloqueado ? 'text--danger' : ''}`.trim();
    $statusDetalhe.textContent = detalhe ?? '';

    // Formulário de assinar só faz sentido para quem não está com ela ativa.
    $cartaoAssinar.classList.toggle('hidden', situacao.status === 'ativa');
    $cartaoCancelar.classList.toggle('hidden', situacao.status !== 'ativa');

    if (situacao.cobranca.documento) {
      $form.documento.value = situacao.cobranca.documento;
    }
    if (situacao.cobranca.email) {
      $form.email.value = situacao.cobranca.email;
    }

    if (situacao.cobranca.temAssinaturaNoGateway) {
      try {
        const cobranca = await api('/assinatura/cobranca');
        if (cobranca.url) {
          $linkCobranca.href = cobranca.url;
          $linkCobranca.classList.remove('hidden');
        }
      } catch {
        // sem link pendente — não é motivo para travar a página.
      }
    }
  } catch (erro) {
    avisar($avisoAssinar, erro.message);
  }
}

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoAssinar, null);
  $btnAssinar.disabled = true;
  $btnAssinar.textContent = 'Gerando cobrança…';

  const dados = Object.fromEntries(new FormData($form).entries());
  try {
    const resultado = await api('/assinatura/assinar', {
      method: 'POST',
      body: JSON.stringify({ documento: dados.documento, email: dados.email || undefined }),
    });

    if (resultado.pagamento?.disponivel && resultado.pagamento?.url) {
      window.open(resultado.pagamento.url, '_blank', 'noopener');
    }
    avisar($avisoAssinar, resultado.pagamento?.mensagem ?? 'Pedido registrado.', 'sucesso');
    carregar();
  } catch (erro) {
    avisar($avisoAssinar, erro.message);
  } finally {
    $btnAssinar.disabled = false;
    $btnAssinar.textContent = 'Assinar agora';
  }
});

$btnCancelar.addEventListener('click', async () => {
  if (!confirm('Cancelar a assinatura? Você continua podendo ver sua coleção, mas não poderá mais adicionar ou editar cartas depois que o período pago acabar.')) return;
  $btnCancelar.disabled = true;
  try {
    await api('/assinatura/cancelar', { method: 'POST' });
    carregar();
  } catch (erro) {
    avisar($avisoAssinar, erro.message);
  } finally {
    $btnCancelar.disabled = false;
  }
});

prepararCabecalho();
carregar();
