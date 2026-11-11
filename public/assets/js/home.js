import { el, mostrarLinkDoForum } from './api.js';

/*
  Painel do mercado: aberto a qualquer visitante. Tudo entra por textContent (nome de carta nunca vira HTML) e some
  inteiro se a API não responder ou não houver nada para mostrar: a home vale como vitrine sem ele.
*/
const ABAS = [
  { chave: 'emAlta', rotulo: 'Em alta', explica: 'Cartas raras cujo preço médio dos últimos 7 dias ficou acima do dos últimos 30 dias, no Cardmarket (mercado europeu). Só entram cartas com preço médio acima de € 3, para o painel não mostrar oscilação de centavos.' },
  { chave: 'emQueda', rotulo: 'Em queda', explica: 'Cartas raras cujo preço médio dos últimos 7 dias ficou abaixo do dos últimos 30 dias, no Cardmarket (mercado europeu). Só entram cartas com preço médio acima de € 3.' },
  { chave: 'maisValiosas', rotulo: 'Mais valiosas', explica: 'As cartas de maior preço de mercado no TCGplayer entre as cartas raras das coleções modernas que acompanhamos.' },
  { chave: 'maisAdicionadas', rotulo: 'Mais adicionadas', explica: 'As cartas que mais colecionadores diferentes cadastraram no ValtaTCG nos últimos 7 dias.' },
];

function dinheiro(valor, moeda) {
  if (typeof valor !== 'number') return 'sem preço';
  return valor.toLocaleString(moeda === 'BRL' ? 'pt-BR' : 'en-US', { style: 'currency', currency: moeda });
}

function cartaoDoPainel(carta, moeda, aba) {
  const cartao = el('article', 'cartao painel--carta flex flex--col', '');
  if (carta.imagem) {
    const img = document.createElement('img');
    img.src = carta.imagem;
    img.alt = carta.nome;
    img.loading = 'lazy';
    img.className = 'imagem--carta';
    cartao.append(img);
  }
  cartao.append(el('span', 'text--sm weight--semibold carta--nome', carta.nome));
  cartao.append(el('span', 'text--xs text--muted carta--meta', [carta.colecao, carta.numero ? '#' + carta.numero : null].filter(Boolean).join(' · ')));
  cartao.append(el('span', 'text--md weight--semibold', dinheiro(carta.preco, moeda)));
  if (aba === 'maisAdicionadas') {
    cartao.append(el('span', 'text--xs text--muted', carta.pessoas + ' colecionadores'));
  } else if (typeof carta.variacaoPct === 'number') {
    const sinal = carta.variacaoPct > 0 ? '+' : carta.variacaoPct < 0 ? '−' : '';
    const classe = carta.variacaoPct > 0 ? 'text--success' : carta.variacaoPct < 0 ? 'text--danger' : 'text--muted';
    const linha = el('span', 'text--sm painel--variacao ' + classe, sinal + Math.abs(carta.variacaoPct).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%');
    linha.title = 'Preço médio de 7 dias contra o de 30 dias';
    cartao.append(linha);
  }
  return cartao;
}

async function carregarPainelDoMercado() {
  try {
    const resposta = await fetch('/api/mercado/painel');
    if (!resposta.ok) return;
    const dados = await resposta.json();
    const abas = ABAS.filter((a) => Array.isArray(dados[a.chave]) && dados[a.chave].length > 0);
    if (!abas.length) return;

    const $secao = document.getElementById('painel-mercado');
    const $abas = document.getElementById('painel-abas');
    const $lista = document.getElementById('painel-lista');
    const botoes = new Map();

    const mostrar = (aba) => {
      botoes.forEach((botao, chave) => {
        botao.classList.toggle('botao--primario', chave === aba.chave);
        botao.classList.toggle('botao--secundario', chave !== aba.chave);
      });
      document.getElementById('painel-explica').textContent = aba.explica;
      while ($lista.firstChild) $lista.removeChild($lista.firstChild);
      dados[aba.chave].forEach((c) => $lista.append(cartaoDoPainel(c, dados.moeda, aba.chave)));
    };

    for (const aba of abas) {
      const botao = el('button', 'botao botao--secundario botao--pequeno', aba.rotulo);
      botao.type = 'button';
      botao.addEventListener('click', () => mostrar(aba));
      botoes.set(aba.chave, botao);
      $abas.append(botao);
    }

    const quando = dados.atualizadoEm ? new Date(String(dados.atualizadoEm).replace(' ', 'T') + 'Z') : null;
    const data = quando && !Number.isNaN(quando.getTime()) ? quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
    document.getElementById('painel-nota').textContent = 'Preços do Cardmarket e do TCGplayer, via TCGdex, consultados todo dia' + (data ? ' (última consulta: ' + data + ')' : '') + '. São movimentos de mercado, não recomendação de compra ou venda.';

    mostrar(abas[0]);
    $secao.classList.remove('hidden');
  } catch {
    // sem o painel a página segue normal.
  }
}
carregarPainelDoMercado();


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
