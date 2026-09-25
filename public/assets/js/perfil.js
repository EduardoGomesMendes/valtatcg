import { api, avisar, dataBr, prepararCabecalho } from './api.js';

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

async function carregar() {
  try {
    const { usuario } = await api('/perfil');
    $formPerfil.nome.value = usuario.nome;
    $formPerfil.email.value = usuario.email;
    $criadoEm.textContent = `Conta criada em ${dataBr(usuario.criado_em)}`;
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

prepararCabecalho();
carregar();
