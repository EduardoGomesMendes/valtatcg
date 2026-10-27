import { api, avisar, el, limpar, dataBr, prepararCabecalho } from './api.js';

const $lista = document.getElementById('lista-denuncias');
const $aviso = document.getElementById('aviso');
const $btnSair = document.getElementById('btn-sair');

$btnSair.addEventListener('click', async () => {
  await api('/sair', { method: 'POST' }).catch(() => {});
  window.location.href = '/entrar/';
});

async function resolver(id, status) {
  const nota = prompt(status === 'resolvida' ? 'O que foi feito? (fica registrado)' : 'Por que descartar? (fica registrado)', '');
  if (nota === null) return;
  try {
    await api(`/admin/denuncias/${id}/resolver`, { method: 'POST', body: JSON.stringify({ status, nota }) });
    carregar();
  } catch (erro) {
    avisar($aviso, erro.message);
  }
}

const ROTULO_ALVO = { loja: 'Loja', usuario: 'Usuário', topico: 'Tópico do fórum', resposta: 'Resposta no fórum', evento: 'Evento' };

function nomeDoAlvo(d) {
  const tipo = ROTULO_ALVO[d.alvo_tipo] ?? d.alvo_tipo;
  if (!d.alvo) return `${tipo} #${d.alvo_id} (não existe mais)`;
  const base = `${tipo}: ${d.alvo.nome}${d.alvo.email ? ` (${d.alvo.email})` : ''}`;
  const menor = d.alvo.autorFaixa === 'menor' ? ' [MENOR DE IDADE]' : '';
  return d.alvo.autorNome ? `${base} — por ${d.alvo.autorNome}${menor}` : base;
}

/** Botões que agem sobre o conteúdo denunciado (fórum e eventos), além dos de resolver/descartar. */
function acoesDoConteudo(d) {
  const lista = [];
  const botao = (rotulo, classes, aoClicar) => {
    const b = el('button', `botao ${classes} botao--pequeno`, rotulo);
    b.type = 'button';
    b.addEventListener('click', aoClicar);
    return b;
  };
  const executar = async (promessa) => {
    try {
      await promessa();
      carregar();
    } catch (erro) {
      avisar($aviso, erro.message);
    }
  };
  const a = d.alvo;
  if (!a) return lista;

  if (d.alvo_tipo === 'topico' || d.alvo_tipo === 'resposta') {
    const rota = d.alvo_tipo === 'topico' ? 'topicos' : 'respostas';
    const idTopico = d.alvo_tipo === 'topico' ? d.alvo_id : a.topicoId;
    const ver = el('a', 'botao botao--secundario botao--pequeno', 'Abrir no fórum');
    ver.href = `/forum/topico/?id=${idTopico}`;
    ver.target = '_blank';
    ver.rel = 'noopener';
    lista.push(ver);
    if (!a.oculto) {
      lista.push(botao('Ocultar conteúdo', 'botao--perigo', () => executar(() => api(`/admin/forum/${rota}/${d.alvo_id}/moderar`, { method: 'POST', body: JSON.stringify({ acao: 'ocultar' }) }))));
    }
  }
  if (d.alvo_tipo === 'evento') {
    lista.push(botao('Apagar evento', 'botao--perigo', () => {
      if (confirm(`Apagar o evento "${a.nome}"?`)) executar(() => api(`/admin/eventos/${d.alvo_id}`, { method: 'DELETE' }));
    }));
  }
  if (a.autorId && !a.autorSuspenso) {
    lista.push(botao('Suspender autor', 'botao--perigo', () => {
      if (!confirm(`Suspender a conta de "${a.autorNome}"? Ela é desconectada na hora.`)) return;
      executar(() => api(`/admin/usuarios/${a.autorId}/suspender`, { method: 'POST', body: JSON.stringify({ motivo: `Denúncia #${d.id}: ${d.motivo_rotulo}` }) }));
    }));
  }
  return lista;
}

function cartaoDenuncia(d) {
  const cartao = el('article', 'cartao p--4 flex flex--col gap--2', '');

  const topo = el('div', 'flex items--center gap--2 flex--wrap', '');
  topo.append(el('span', 'selo selo--perigo', d.motivo_rotulo));
  topo.append(el('span', 'weight--semibold', nomeDoAlvo(d)));
  cartao.append(topo);

  if (d.detalhe) cartao.append(el('p', 'text--sm', d.detalhe));
  cartao.append(el(
    'span',
    'text--xs text--muted',
    `Enviada por ${d.autor_nome ?? 'conta removida'}${d.autor_email ? ` (${d.autor_email})` : ''} em ${dataBr(d.criado_em)}`,
  ));

  if (d.status !== 'aberta') {
    cartao.append(el('span', 'text--xs text--muted', `${d.status === 'resolvida' ? 'Resolvida' : 'Descartada'}${d.nota_admin ? `: ${d.nota_admin}` : ''}`));
    return cartao;
  }

  const acoes = el('div', 'flex flex--wrap gap--2', '');

  const btnResolver = el('button', 'botao botao--primario botao--pequeno', 'Resolver');
  btnResolver.type = 'button';
  btnResolver.addEventListener('click', () => resolver(d.id, 'resolvida'));
  acoes.append(btnResolver);

  const btnDescartar = el('button', 'botao botao--secundario botao--pequeno', 'Descartar');
  btnDescartar.type = 'button';
  btnDescartar.addEventListener('click', () => resolver(d.id, 'descartada'));
  acoes.append(btnDescartar);

  if (d.alvo_tipo === 'usuario' && d.alvo && !d.alvo.suspenso) {
    const btnSusp = el('button', 'botao botao--perigo botao--pequeno', 'Suspender conta');
    btnSusp.type = 'button';
    btnSusp.addEventListener('click', async () => {
      if (!confirm(`Suspender a conta de "${d.alvo.nome}"? Ela é desconectada na hora.`)) return;
      try {
        await api(`/admin/usuarios/${d.alvo_id}/suspender`, { method: 'POST', body: JSON.stringify({ motivo: `Denúncia #${d.id}: ${d.motivo_rotulo}` }) });
        carregar();
      } catch (erro) {
        avisar($aviso, erro.message);
      }
    });
    acoes.append(btnSusp);
  }

  acoesDoConteudo(d).forEach((b) => acoes.append(b));
  cartao.append(acoes);
  return cartao;
}

async function carregar() {
  try {
    const { denuncias } = await api('/admin/denuncias?status=aberta');
    limpar($lista);
    avisar($aviso, null);
    if (!denuncias.length) {
      avisar($aviso, 'Nenhuma denúncia em aberto.', 'info');
      return;
    }
    denuncias.forEach((d) => $lista.append(cartaoDenuncia(d)));
  } catch (erro) {
    avisar($aviso, erro.status === 403 ? 'Só administradores têm acesso a esta página.' : erro.message);
  }
}

prepararCabecalho();
carregar();
