import { api, avisar, el, limpar, dataBr } from './api.js';

const $lista = document.getElementById('lista-usuarios');
const $aviso = document.getElementById('aviso');
const $btnSair = document.getElementById('btn-sair');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

function linhaUsuario(usuario) {
  const linha = el('article', 'cartao p--4 flex items--center justify--content--between gap--4', '');

  const info = el('div', 'flex flex--col gap--1 min-w--0', '');
  const nomeELinha = el('div', 'flex items--center gap--2', '');
  nomeELinha.append(el('span', 'weight--semibold text--truncate', usuario.nome));
  if (usuario.admin) nomeELinha.append(el('span', 'selo selo--sucesso', 'Admin'));
  info.append(nomeELinha);
  info.append(el('span', 'text--sm text--muted text--truncate', usuario.email));
  info.append(el(
    'span',
    'text--xs text--muted',
    `Desde ${dataBr(usuario.criado_em)} · ${usuario.itens_na_colecao} carta(s) na coleção`,
  ));
  linha.append(info);

  const acoes = el('div', 'flex gap--2 nao--encolhe', '');

  const btnAdmin = el('button', 'botao botao--secundario botao--pequeno', usuario.admin ? 'Remover admin' : 'Tornar admin');
  btnAdmin.type = 'button';
  btnAdmin.addEventListener('click', async () => {
    btnAdmin.disabled = true;
    try {
      await api(`/admin/usuarios/${usuario.id}/admin`, {
        method: 'PATCH',
        body: JSON.stringify({ admin: !usuario.admin }),
      });
      carregar();
    } catch (erro) {
      avisar($aviso, erro.message);
      btnAdmin.disabled = false;
    }
  });
  acoes.append(btnAdmin);

  const btnExcluir = el('button', 'botao botao--perigo botao--pequeno', 'Excluir');
  btnExcluir.type = 'button';
  btnExcluir.addEventListener('click', async () => {
    if (!confirm(`Excluir a conta de "${usuario.nome}" (${usuario.email})? Isso apaga a coleção dela junto.`)) return;
    btnExcluir.disabled = true;
    try {
      await api(`/admin/usuarios/${usuario.id}`, { method: 'DELETE' });
      carregar();
    } catch (erro) {
      avisar($aviso, erro.message);
      btnExcluir.disabled = false;
    }
  });
  acoes.append(btnExcluir);

  linha.append(acoes);
  return linha;
}

async function carregar() {
  try {
    const { usuarios } = await api('/admin/usuarios');
    limpar($lista);
    avisar($aviso, null);
    usuarios.forEach((usuario) => $lista.append(linhaUsuario(usuario)));
  } catch (erro) {
    if (erro.status === 403) {
      avisar($aviso, 'Só administradores têm acesso a esta página.');
    } else {
      avisar($aviso, erro.message);
    }
  }
}

carregar();
