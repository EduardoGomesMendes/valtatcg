import { api, avisar } from './api.js';

const token = new URLSearchParams(window.location.search).get('t') ?? '';

const $carregando = document.getElementById('carregando');
const $painelSenha = document.getElementById('painel-senha');
const $painelProblema = document.getElementById('painel-problema');
const $form = document.getElementById('form-senha');
const $aviso = document.getElementById('aviso');
const $btn = document.getElementById('btn-concluir');

function mostrarProblema(titulo, texto) {
  $carregando.classList.add('hidden');
  $painelSenha.classList.add('hidden');
  $painelProblema.classList.remove('hidden');
  document.getElementById('titulo-problema').textContent = titulo;
  document.getElementById('texto-problema').textContent = texto;
}

const PROBLEMAS = {
  expirado: ['Este link venceu', 'Por segurança, o link vale por pouco tempo. Peça um novo.'],
  usado: ['Este link já foi usado', 'A senha já foi trocada com ele. Entre com a senha nova; se precisar, peça um link novo.'],
  invalido: ['Link inválido', 'Este link não é válido. Copie o endereço completo do e-mail ou peça um novo.'],
};

async function iniciar() {
  let situacao;
  try {
    situacao = await api(`/senha/redefinir?t=${encodeURIComponent(token)}`);
  } catch (erro) {
    mostrarProblema('Não consegui conferir o link', erro.message);
    return;
  }
  if (situacao.estado === 'valido') {
    $carregando.classList.add('hidden');
    $painelSenha.classList.remove('hidden');
    document.getElementById('email-conta').textContent = situacao.email;
    return;
  }
  mostrarProblema(...(PROBLEMAS[situacao.estado] ?? PROBLEMAS.invalido));
}

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($aviso, null);
  const dados = Object.fromEntries(new FormData($form).entries());
  if (dados.senha !== dados.repetir) {
    avisar($aviso, 'As duas senhas precisam ser iguais.');
    return;
  }
  $btn.disabled = true;
  $btn.textContent = 'Trocando…';
  try {
    await api('/senha/redefinir', { method: 'POST', body: JSON.stringify({ token, senha: dados.senha }) });
    // Volta para o login: digitar a senha nova uma vez confirma que ela foi guardada.
    window.location.href = '/entrar/?senha=trocada';
  } catch (erro) {
    avisar($aviso, erro.message);
    $btn.disabled = false;
    $btn.textContent = 'Trocar a senha';
  }
});

iniciar();
