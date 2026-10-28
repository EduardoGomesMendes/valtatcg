import { api, avisar } from './api.js';

const $form = document.getElementById('form-esqueci');
const $aviso = document.getElementById('aviso');
const $btn = document.getElementById('btn-enviar');

// Sem e-mail configurado o servidor não consegue mandar o link: melhor dizer antes de a pessoa digitar.
api('/senha/estado').then(({ aberto }) => {
  if (aberto) return;
  avisar($aviso, 'A redefinição por e-mail está indisponível no momento. Fale com o suporte para gerar uma senha nova.');
  $btn.disabled = true;
}).catch(() => {});

$form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  avisar($aviso, null);
  $btn.disabled = true;
  $btn.textContent = 'Enviando…';
  try {
    await api('/senha/esqueci', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData($form).entries())) });
    $form.classList.add('hidden');
    document.getElementById('enviado').classList.remove('hidden');
  } catch (erro) {
    avisar($aviso, erro.message);
    $btn.disabled = false;
    $btn.textContent = 'Enviar link';
  }
});
