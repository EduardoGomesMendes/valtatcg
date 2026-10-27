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

$nascimento.max = new Date().toISOString().slice(0, 10);
$nascimento.addEventListener('input', () => {
  const idade = idadeEm($nascimento.value);
  const menor = idade !== null && idade < 18;
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

$formRegistrar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoRegistrar, null);
  $btnRegistrar.disabled = true;
  $btnRegistrar.textContent = 'Criando…';

  const dados = Object.fromEntries(new FormData($formRegistrar).entries());
  try {
    await api('/registrar', { method: 'POST', body: JSON.stringify(dados) });
    window.location.href = destino();
  } catch (erro) {
    avisar($avisoRegistrar, erro.message);
    $btnRegistrar.disabled = false;
    $btnRegistrar.textContent = 'Criar conta';
  }
});

async function prepararTela() {
  const estado = await api('/estado');
  if (estado.autenticado) window.location.href = destino();
}

prepararTela().catch(() => {});
