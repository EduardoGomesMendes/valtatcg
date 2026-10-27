import { api, avisar, dataBr, prepararCabecalho, carregarAvatarEm } from './api.js';

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

/** Carrega a foto atual (se houver) — 404 é esperado para quem nunca enviou uma. */
async function carregarAvatar(nomeParaIniciais) {
  await carregarAvatarEm($avatarImagem, $avatarPlaceholder, nomeParaIniciais);
  $btnRemoverAvatar.classList.toggle('hidden', $avatarImagem.classList.contains('hidden'));
  // O botão redondo do cabeçalho mostra a mesma foto — atualiza junto.
  carregarAvatarEm(
    document.getElementById('avatar-topo-imagem'),
    document.getElementById('avatar-topo-placeholder'),
    nomeParaIniciais,
  );
}

/* ------------------------------------------------------------------ */
/* Idade e responsável                                                 */
/* ------------------------------------------------------------------ */

const $idadeResumo = document.getElementById('idade-resumo');
const $formNascimento = document.getElementById('form-nascimento');
const $avisoNascimento = document.getElementById('aviso-nascimento');
const $blocoStatusResp = document.getElementById('bloco-status-responsavel');
const $respLinha = document.getElementById('responsavel-linha');
const $btnReenviar = document.getElementById('btn-reenviar-responsavel');
const $avisoResp = document.getElementById('aviso-responsavel');
const $inputNascimento = document.getElementById('perfil-nascimento');
const $blocoRespForm = document.getElementById('perfil-bloco-responsavel');
const camposRespForm = [document.getElementById('perfil-resp-nome'), document.getElementById('perfil-resp-email')];

function dataDeNascimento(iso) {
  const [ano, mes, dia] = String(iso).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Só para a tela decidir se pede o responsável — quem valida de verdade é o servidor. */
function idadeEm(textoData) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(textoData);
  if (!m) return null;
  const hoje = new Date();
  const idade = hoje.getFullYear() - Number(m[1]);
  const fez = hoje.getMonth() + 1 > Number(m[2])
    || (hoje.getMonth() + 1 === Number(m[2]) && hoje.getDate() >= Number(m[3]));
  return fez ? idade : idade - 1;
}

let exigeResponsavelNoServidor = false;

function mostrarIdade(usuario) {
  $formNascimento.classList.add('hidden');
  $blocoStatusResp.classList.add('hidden');

  if (usuario.faixa === 'desconhecida') {
    $idadeResumo.textContent = 'Sua conta é anterior à exigência de data de nascimento. Informe a sua para seguir usando o ValtaTCG.';
    $inputNascimento.max = new Date().toISOString().slice(0, 10);
    $formNascimento.classList.remove('hidden');
    return;
  }

  if (usuario.faixa === 'adulto') {
    $idadeResumo.textContent = `Nascimento: ${dataDeNascimento(usuario.nascimento)} · conta de maior de 18 anos.`;
    return;
  }

  $idadeResumo.textContent = `Nascimento: ${dataDeNascimento(usuario.nascimento)} · conta de menor de 18 anos. Menores não vendem, não compram, não dão lances e não trocam mensagens.`;
  if (!exigeResponsavelNoServidor) return;
  $blocoStatusResp.classList.remove('hidden');
  const confirmado = usuario.responsavel_status === 'confirmado';
  const quem = `${usuario.responsavel_nome} (${usuario.responsavel_email})`;
  $respLinha.textContent = confirmado
    ? `Responsável: ${quem} — confirmado.`
    : `Responsável: ${quem} — aguardando a confirmação por e-mail.`;
  $btnReenviar.classList.toggle('hidden', confirmado);
}

$inputNascimento.addEventListener('input', () => {
  const idade = idadeEm($inputNascimento.value);
  const menor = exigeResponsavelNoServidor && idade !== null && idade < 18;
  $blocoRespForm.classList.toggle('hidden', !menor);
  camposRespForm.forEach((campo) => { campo.required = menor; });
});

$formNascimento.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($avisoNascimento, null);
  const dados = Object.fromEntries(new FormData($formNascimento).entries());
  try {
    await api('/perfil/nascimento', { method: 'PATCH', body: JSON.stringify(dados) });
    window.location.reload();
  } catch (erro) {
    avisar($avisoNascimento, erro.message);
  }
});

$btnReenviar.addEventListener('click', async () => {
  avisar($avisoResp, null);
  $btnReenviar.disabled = true;
  try {
    const r = await api('/perfil/responsavel/reenviar', { method: 'POST' });
    avisar(
      $avisoResp,
      r.enviado
        ? 'E-mail enviado. Peça para o responsável abrir o link.'
        : 'Não conseguimos enviar o e-mail agora. Fale com o suporte para confirmar o responsável.',
      r.enviado ? 'sucesso' : 'erro',
    );
  } catch (erro) {
    avisar($avisoResp, erro.message);
  } finally {
    $btnReenviar.disabled = false;
  }
});

async function carregar() {
  try {
    const { usuario, exigeResponsavel } = await api('/perfil');
    exigeResponsavelNoServidor = Boolean(exigeResponsavel);
    $formPerfil.nome.value = usuario.nome;
    $formPerfil.usuario.value = usuario.usuario ?? '';
    $formPerfil.email.value = usuario.email;
    $criadoEm.textContent = `Conta criada em ${dataBr(usuario.criado_em)}`;
    carregarAvatar(usuario.nome);
    mostrarIdade(usuario);
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
