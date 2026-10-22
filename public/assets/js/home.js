// Quem já está logado vê o atalho para a coleção em vez de "Entrar".
try {
  const resposta = await fetch('/api/estado', { credentials: 'same-origin' });
  const estado = await resposta.json();
  if (estado.autenticado) {
    document.getElementById('topo-entrar').classList.add('hidden');
    document.getElementById('topo-colecao').classList.remove('hidden');
    const cta = document.getElementById('cta-principal');
    cta.href = '/colecao/';
    cta.textContent = 'Ir para minha coleção';
  }
} catch {
  // sem API, a página continua valendo como vitrine.
}
