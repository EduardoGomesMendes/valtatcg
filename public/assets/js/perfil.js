import { api, avisar, dataBr, prepararCabecalho } from './api.js';

const $avatarImagem = document.getElementById('avatar-imagem');
const $avatarPlaceholder = document.getElementById('avatar-placeholder');
const $inputAvatarArquivo = document.getElementById('input-avatar-arquivo');
const $btnSelfie = document.getElementById('btn-selfie');
const $btnRemoverAvatar = document.getElementById('btn-remover-avatar');
const $avisoAvatar = document.getElementById('aviso-avatar');
const $camaraCaixa = document.getElementById('camara-caixa');
const $cameraVideo = document.getElementById('camera-video');
const $cameraCanvas = document.getElementById('camera-canvas');
const $btnCapturar = document.getElementById('btn-capturar');
const $btnCancelarCamera = document.getElementById('btn-cancelar-camera');

const $formPerfil = document.getElementById('form-perfil');
const $avisoPerfil = document.getElementById('aviso-perfil');
const $btnSalvarPerfil = document.getElementById('btn-salvar-perfil');
const $criadoEm = document.getElementById('criado-em');

const $formSenha = document.getElementById('form-senha');
const $avisoSenha = document.getElementById('aviso-senha');
const $btnTrocarSenha = document.getElementById('btn-trocar-senha');

const $btnSair = document.getElementById('btn-sair');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

function iniciais(nome) {
  const partes = String(nome ?? '?').trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes.at(-1)[0] : '')).toUpperCase();
}

/** Carrega a foto atual (se houver) — 404 é esperado para quem nunca enviou uma. */
async function carregarAvatar(nomeParaIniciais) {
  $avatarPlaceholder.textContent = iniciais(nomeParaIniciais);
  try {
    const resposta = await fetch('/api/perfil/avatar', { credentials: 'same-origin' });
    if (!resposta.ok) throw new Error('sem foto');
    const blob = await resposta.blob();
    $avatarImagem.src = URL.createObjectURL(blob);
    $avatarImagem.classList.remove('hidden');
    $avatarPlaceholder.classList.add('hidden');
    $btnRemoverAvatar.classList.remove('hidden');
  } catch {
    $avatarImagem.classList.add('hidden');
    $avatarPlaceholder.classList.remove('hidden');
    $btnRemoverAvatar.classList.add('hidden');
  }
}

async function carregar() {
  try {
    const { usuario } = await api('/perfil');
    $formPerfil.nome.value = usuario.nome;
    $formPerfil.usuario.value = usuario.usuario ?? '';
    $formPerfil.email.value = usuario.email;
    $criadoEm.textContent = `Conta criada em ${dataBr(usuario.criado_em)}`;
    carregarAvatar(usuario.nome);
  } catch (erro) {
    avisar($avisoPerfil, erro.message);
  }
}

$formPerfil.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoPerfil, null);
  $btnSalvarPerfil.disabled = true;
  $btnSalvarPerfil.textContent = 'Salvando…';

  const dados = Object.fromEntries(new FormData($formPerfil).entries());
  // Quem ainda não tem usuário cadastrado pode deixar o campo em branco sem
  // que isso vire uma tentativa de salvar um nome de usuário vazio.
  if (!dados.usuario) delete dados.usuario;
  try {
    await api('/perfil', { method: 'PATCH', body: JSON.stringify(dados) });
    avisar($avisoPerfil, 'Dados atualizados.', 'sucesso');
  } catch (erro) {
    avisar($avisoPerfil, erro.message);
  } finally {
    $btnSalvarPerfil.disabled = false;
    $btnSalvarPerfil.textContent = 'Salvar';
  }
});

$formSenha.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoSenha, null);
  $btnTrocarSenha.disabled = true;
  $btnTrocarSenha.textContent = 'Trocando…';

  const dados = Object.fromEntries(new FormData($formSenha).entries());
  try {
    await api('/perfil/senha', { method: 'POST', body: JSON.stringify(dados) });
    avisar($avisoSenha, 'Senha trocada com sucesso.', 'sucesso');
    $formSenha.reset();
  } catch (erro) {
    avisar($avisoSenha, erro.message);
  } finally {
    $btnTrocarSenha.disabled = false;
    $btnTrocarSenha.textContent = 'Trocar senha';
  }
});

/* ------------------------------------------------------------------ */
/* Foto de perfil — upload de arquivo ou selfie pela câmera            */
/* ------------------------------------------------------------------ */

async function enviarImagem(dataUrl) {
  avisar($avisoAvatar, null);
  try {
    await api('/perfil/avatar', { method: 'POST', body: JSON.stringify({ imagem: dataUrl }) });
    avisar($avisoAvatar, 'Foto atualizada.', 'sucesso');
    carregarAvatar($formPerfil.nome.value);
  } catch (erro) {
    avisar($avisoAvatar, erro.message);
  }
}

$inputAvatarArquivo.addEventListener('change', () => {
  const arquivo = $inputAvatarArquivo.files[0];
  $inputAvatarArquivo.value = ''; // deixa escolher o mesmo arquivo de novo, se precisar
  if (!arquivo) return;

  const leitor = new FileReader();
  leitor.onload = () => enviarImagem(leitor.result);
  leitor.onerror = () => avisar($avisoAvatar, 'não consegui ler o arquivo');
  leitor.readAsDataURL(arquivo);
});

let streamDaCamera = null;

function pararCamera() {
  streamDaCamera?.getTracks().forEach((faixa) => faixa.stop());
  streamDaCamera = null;
  $cameraVideo.srcObject = null;
  $camaraCaixa.classList.add('hidden');
}

$btnSelfie.addEventListener('click', async () => {
  avisar($avisoAvatar, null);
  try {
    streamDaCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    $cameraVideo.srcObject = streamDaCamera;
    $camaraCaixa.classList.remove('hidden');
  } catch {
    avisar($avisoAvatar, 'Não consegui acessar a câmera — confira a permissão do navegador.');
  }
});

$btnCapturar.addEventListener('click', () => {
  $cameraCanvas.width = $cameraVideo.videoWidth;
  $cameraCanvas.height = $cameraVideo.videoHeight;
  // Sem espelhar aqui: o espelhamento em camera-video é só visual (CSS), a
  // foto salva mostra a pessoa como os outros a veem, não como ela se vê.
  $cameraCanvas.getContext('2d').drawImage($cameraVideo, 0, 0);
  const dataUrl = $cameraCanvas.toDataURL('image/jpeg', 0.9);
  pararCamera();
  enviarImagem(dataUrl);
});

$btnCancelarCamera.addEventListener('click', pararCamera);

$btnRemoverAvatar.addEventListener('click', async () => {
  if (!confirm('Remover sua foto de perfil?')) return;
  try {
    await api('/perfil/avatar', { method: 'DELETE' });
    carregarAvatar($formPerfil.nome.value);
  } catch (erro) {
    avisar($avisoAvatar, erro.message);
  }
});

prepararCabecalho();
carregar();
