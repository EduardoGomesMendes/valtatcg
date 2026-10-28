import { api, avisar } from './api.js';

const $abaEntrar = document.getElementById('aba-entrar');
const $abaRegistrar = document.getElementById('aba-registrar');
const $formEntrar = document.getElementById('form-entrar');
const $formRegistrar = document.getElementById('form-registrar');
const $avisoEntrar = document.getElementById('aviso-entrar');
const $avisoRegistrar = document.getElementById('aviso-registrar');
const $btnEntrar = document.getElementById('btn-entrar');
const $btnRegistrar = document.getElementById('btn-registrar');

/** Para onde ir depois de entrar (a página que o usuário tentou abrir). */
function destino() {
  const pedido = new URLSearchParams(window.location.search).get('destino');
  // Só aceitamos caminho interno — link externo aqui seria redirecionamento aberto.
  if (pedido && pedido.startsWith('/') && !pedido.startsWith('//')) return pedido;
  return '/colecao/';
}

function mostrarAba(aba) {
  const ehEntrar = aba === 'entrar';
  $formEntrar.classList.toggle('hidden', !ehEntrar);
  $formRegistrar.classList.toggle('hidden', ehEntrar);
  document.getElementById('registro-enviado').classList.add('hidden');
  $abaEntrar.setAttribute('aria-pressed', String(ehEntrar));
  $abaRegistrar.setAttribute('aria-pressed', String(!ehEntrar));
  $abaEntrar.className = `botao flex--1 ${ehEntrar ? 'botao--primario' : 'botao--secundario'}`;
  $abaRegistrar.className = `botao flex--1 ${ehEntrar ? 'botao--secundario' : 'botao--primario'}`;
}

const $nascimento = document.getElementById('reg-nascimento');
const $blocoResponsavel = document.getElementById('bloco-responsavel');
const camposResponsavel = [document.getElementById('reg-resp-nome'), document.getElementById('reg-resp-email')];

/** Só para a tela decidir se mostra os campos do responsável — quem valida de verdade é o servidor. */
function idadeEm(textoData) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(textoData);
  if (!m) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - Number(m[1]);
  const fezAniversario = hoje.getMonth() + 1 > Number(m[2])
    || (hoje.getMonth() + 1 === Number(m[2]) && hoje.getDate() >= Number(m[3]));
  if (!fezAniversario) idade -= 1;
  return idade;
}

// Só pedimos o responsável quando o servidor exige (RESPONSAVEL_OBRIGATORIO). Por padrão, só a data de nascimento.
let exigeResponsavel = false;
api('/estado').then((e) => { exigeResponsavel = Boolean(e.exigeResponsavel); }).catch(() => {});

$nascimento.max = new Date().toISOString().slice(0, 10);
$nascimento.addEventListener('input', () => {
  const idade = idadeEm($nascimento.value);
  const menor = exigeResponsavel && idade !== null && idade < 18;
  $blocoResponsavel.classList.toggle('hidden', !menor);
  camposResponsavel.forEach((campo) => { campo.required = menor; });
});

$abaEntrar.addEventListener('click', () => mostrarAba('entrar'));
$abaRegistrar.addEventListener('click', () => mostrarAba('registrar'));

$formEntrar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoEntrar, null);
  $btnEntrar.disabled = true;
  $btnEntrar.textContent = 'Entrando…';

  const dados = Object.fromEntries(new FormData($formEntrar).entries());
  try {
    await api('/entrar', { method: 'POST', body: JSON.stringify(dados) });
    window.location.href = destino();
  } catch (erro) {
    avisar($avisoEntrar, erro.message);
    $btnEntrar.disabled = false;
    $btnEntrar.textContent = 'Entrar';
  }
});

const $registroEnviado = document.getElementById('registro-enviado');
const $avisoReenvio = document.getElementById('aviso-reenvio');
const $btnReenviar = document.getElementById('btn-reenviar');
let emailDoPedido = '';

/** Troca o formulário pelo "confira o seu e-mail" (ou volta para o formulário, com os campos como estavam). */
function mostrarEnvio(enviado) {
  $formRegistrar.classList.toggle('hidden', enviado);
  $registroEnviado.classList.toggle('hidden', !enviado);
  avisar($avisoReenvio, null);
}

$formRegistrar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoRegistrar, null);
  $btnRegistrar.disabled = true;
  $btnRegistrar.textContent = 'Enviando…';

  const dados = Object.fromEntries(new FormData($formRegistrar).entries());
  try {
    await api('/cadastro', { method: 'POST', body: JSON.stringify(dados) });
    emailDoPedido = dados.email;
    document.getElementById('email-enviado').textContent = dados.email;
    mostrarEnvio(true);
  } catch (erro) {
    avisar($avisoRegistrar, erro.message);
  } finally {
    $btnRegistrar.disabled = false;
    $btnRegistrar.textContent = 'Cadastrar';
  }
});

$btnReenviar.addEventListener('click', async () => {
  $btnReenviar.disabled = true;
  try {
    await api('/cadastro/reenviar', { method: 'POST', body: JSON.stringify({ email: emailDoPedido }) });
    avisar($avisoReenvio, 'Enviamos o e-mail de novo. O link anterior deixou de valer.', 'sucesso');
  } catch (erro) {
    avisar($avisoReenvio, erro.message);
  } finally {
    $btnReenviar.disabled = false;
  }
});

document.getElementById('btn-corrigir').addEventListener('click', () => mostrarEnvio(false));

async function prepararTela() {
  if (new URLSearchParams(window.location.search).get('senha') === 'trocada') {
    avisar($avisoEntrar, 'Senha trocada! Entre com a senha nova.', 'sucesso');
  }
  const estado = await api('/estado');
  if (estado.autenticado) window.location.href = destino();

  // Sem e-mail configurado o servidor não consegue mandar o link: melhor avisar antes de a pessoa preencher tudo.
  const { aberto } = await api('/cadastro/estado');
  if (!aberto) {
    avisar($avisoRegistrar, 'O cadastro online está indisponível no momento. Tente novamente mais tarde.');
    $btnRegistrar.disabled = true;
  }
}

prepararTela().catch(() => {});
