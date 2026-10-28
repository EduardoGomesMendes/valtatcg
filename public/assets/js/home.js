import { el, mostrarLinkDoForum } from './api.js';

// Quem já está logado vê o atalho para a coleção em vez de "Entrar" — e é só ele que vê o fórum.
// Nada do fórum vai no HTML: para visitante, a página nem sabe que ele existe.
try {
  const resposta = await fetch('/api/estado', { credentials: 'same-origin' });
  const estado = await resposta.json();
  if (estado.autenticado) {
    document.getElementById('topo-entrar').classList.add('hidden');
    document.getElementById('topo-colecao').classList.remove('hidden');
    const cta = document.getElementById('cta-principal');
    cta.href = '/colecao/';
    cta.textContent = 'Ir para minha coleção';

    mostrarLinkDoForum();
    document.querySelector('.home--selos')?.append(el('span', 'home--selo', 'Fórum'));

    const cartao = el('div', 'cartao home--passo flex flex--col', '');
    cartao.append(el('h3', 'text--md weight--semibold', 'Fórum dos colecionadores'));
    cartao.append(el('p', 'text--sm text--muted', 'Tire dúvidas, compare preços e troque dicas sobre cartas com outras pessoas. Para quem tem conta, sem custo.'));
    const entrar = el('a', 'botao botao--secundario botao--pequeno self--start', 'Entrar no fórum');
    entrar.href = '/forum/';
    cartao.append(entrar);
    document.getElementById('grade-recursos')?.append(cartao);
  }
} catch {
  // sem API, a página continua valendo como vitrine.
}
