import { api, avisar } from './api.js';

const token = new URLSearchParams(window.location.search).get('t') ?? '';

const $carregando = document.getElementById('carregando');
const $painelSenha = document.getElementById('painel-senha');
const $painelProblema = document.getElementById('painel-problema');
const $form = document.getElementById('form-senha');
const $aviso = document.getElementById('aviso');
const $btn = document.getElementById('btn-concluir');

function mostrarProblema({ titulo, texto, email }) {
  $carregando.classList.add('hidden');
  $painelSenha.classList.add('hidden');
  $painelProblema.classList.remove('hidden');
  document.getElementById('titulo-problema').textContent = titulo;
  document.getElementById('texto-problema').textContent = texto;

  const $acoes = document.getElementById('acoes-problema');
  $acoes.replaceChildren();
  const link = (rotulo, href, classe) => {
    const a = document.createElement('a');
    a.href = href;
    a.className = `botao ${classe}`;
    a.textContent = rotulo;
    return a;
  };

  // Link vencido: a página sabe o e-mail do pedido, então oferece mandar outro sem digitar de novo.
  if (email) {
    const reenviar = document.createElement('button');
    reenviar.type = 'button';
    reenviar.className = 'botao botao--primario';
    reenviar.textContent = 'Enviar um link novo';
    reenviar.addEventListener('click', async () => {
      reenviar.disabled = true;
      try {
        await api('/cadastro/reenviar', { method: 'POST', body: JSON.stringify({ email }) });
        avisar(document.getElementById('aviso-problema'), 'Pronto! Enviamos um link novo para o seu e-mail.', 'sucesso');
      } catch (erro) {
        avisar(document.getElementById('aviso-problema'), erro.message);
        reenviar.disabled = false;
      }
    });
    $acoes.append(reenviar);
  }
  $acoes.append(link('Ir para o login', '/entrar/', 'botao--secundario'));
}

async function iniciar() {
  let situacao;
  try {
    situacao = await api(`/cadastro/confirmar?t=${encodeURIComponent(token)}`);
  } catch (erro) {
    mostrarProblema({ titulo: 'Não consegui conferir o link', texto: erro.message });
    return;
  }

  if (situacao.estado === 'valido') {
    $carregando.classList.add('hidden');
    $painelSenha.classList.remove('hidden');
    document.getElementById('nome-confirmado').textContent = situacao.nome.split(' ')[0];
    document.getElementById('email-confirmado').textContent = situacao.email;
    return;
  }
  if (situacao.estado === 'expirado') {
    mostrarProblema({ titulo: 'Este link venceu', texto: 'Por segurança, o link vale por pouco tempo. Podemos enviar um novo para o mesmo e-mail.', email: situacao.email });
  } else if (situacao.estado === 'usado') {
    mostrarProblema({ titulo: 'Este link já foi usado', texto: 'Sua conta já foi criada. Entre com o seu e-mail (ou nome de usuário) e a senha que você escolheu.' });
  } else {
    mostrarProblema({ titulo: 'Link inválido', texto: 'Este link não é válido. Copie o endereço completo do e-mail ou faça o cadastro de novo.' });
  }
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
  $btn.textContent = 'Criando…';
  try {
    await api('/cadastro/concluir', { method: 'POST', body: JSON.stringify({ token, senha: dados.senha }) });
    window.location.href = '/colecao/';
  } catch (erro) {
    avisar($aviso, erro.message);
    $btn.disabled = false;
    $btn.textContent = 'Criar minha conta';
  }
});

iniciar();
