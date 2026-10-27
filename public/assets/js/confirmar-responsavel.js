import { api, avisar } from './api.js';

const $texto = document.getElementById('texto');
const $aviso = document.getElementById('aviso');
const $btn = document.getElementById('btn-confirmar');
const token = new URLSearchParams(window.location.search).get('token') ?? '';

async function iniciar() {
  try {
    const dados = await api(`/responsavel/consulta?token=${encodeURIComponent(token)}`);
    $texto.textContent = `${dados.nomeDoMenor} criou uma conta no ValtaTCG e informou ${dados.responsavelNome} como responsável. `
      + 'Ao confirmar, você declara ser o responsável legal e autoriza o uso da plataforma. '
      + 'Menores de 18 anos não vendem, não compram, não dão lances e não trocam mensagens no ValtaTCG.';
    $btn.classList.remove('hidden');
  } catch (erro) {
    $texto.textContent = 'Este link não é mais válido. Peça para o menor reenviar a confirmação pela conta dele.';
    avisar($aviso, erro.message);
  }
}

$btn.addEventListener('click', async () => {
  $btn.disabled = true;
  avisar($aviso, null);
  try {
    await api('/responsavel/confirmar', { method: 'POST', body: JSON.stringify({ token }) });
    $btn.classList.add('hidden');
    $texto.textContent = 'Pronto! Cadastro confirmado. Você já pode fechar esta página.';
  } catch (erro) {
    avisar($aviso, erro.message);
    $btn.disabled = false;
  }
});

iniciar();
