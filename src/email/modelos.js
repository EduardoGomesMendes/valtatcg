const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** E-mail que o responsável recebe para autorizar a conta de um menor. */
export function emailConfirmacaoResponsavel({ responsavelNome, nomeDoMenor, link, validadeHoras }) {
  const dias = Math.max(1, Math.round(validadeHoras / 24));
  const assunto = `Confirme o cadastro de ${nomeDoMenor} no ValtaTCG`;

  const texto = [
    `Olá, ${responsavelNome}.`,
    '',
    `${nomeDoMenor} criou uma conta no ValtaTCG (plataforma para guardar a coleção de cartas Pokémon e acompanhar o valor delas) e informou você como responsável.`,
    '',
    'Para liberar o uso da conta, confirme que você é o responsável e autoriza:',
    link,
    '',
    `O link vale por ${dias} dias. Se você não reconhece este cadastro, ignore este e-mail: nada será liberado.`,
    '',
    'Menores de 18 anos não vendem, não compram, não dão lances e não trocam mensagens no ValtaTCG.',
    '',
    'ValtaTCG · desenvolvido por omva',
  ].join('\n');

  const html = `<p>Olá, ${esc(responsavelNome)}.</p>
<p><strong>${esc(nomeDoMenor)}</strong> criou uma conta no ValtaTCG (plataforma para guardar a coleção de cartas Pokémon e acompanhar o valor delas) e informou você como responsável.</p>
<p>Para liberar o uso da conta, confirme que você é o responsável e autoriza:</p>
<p><a href="${esc(link)}">Confirmar como responsável</a></p>
<p>O link vale por ${dias} dias. Se você não reconhece este cadastro, ignore este e-mail: nada será liberado.</p>
<p>Menores de 18 anos não vendem, não compram, não dão lances e não trocam mensagens no ValtaTCG.</p>
<p>ValtaTCG · desenvolvido por omva</p>`;

  return { assunto, texto, html };
}
