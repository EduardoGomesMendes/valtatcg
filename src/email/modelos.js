const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const primeiroNome = (nome) => String(nome ?? '').trim().split(/\s+/)[0] || 'tudo bem';

/** Primeiro e-mail do cadastro: prova que o endereço é da pessoa e leva ao passo de criar a senha. */
export function emailConfirmacaoDeCadastro({ nome, link, validadeHoras }) {
  const nomeCurto = primeiroNome(nome);
  const assunto = 'Confirme seu e-mail para criar sua conta no ValtaTCG';
  const texto = [
    `Olá, ${nomeCurto}!`,
    '',
    'Recebemos o seu cadastro no ValtaTCG. Falta só um passo: confirmar este e-mail e criar a sua senha.',
    '',
    'Abra este endereço:',
    link,
    '',
    `O link vale por ${validadeHoras} horas e só pode ser usado uma vez.`,
    '',
    'Se não foi você que fez o cadastro, ignore este e-mail: nenhuma conta será criada.',
    '',
    'ValtaTCG · desenvolvido por omva',
  ].join('\n');
  const html = `<p>Olá, ${esc(nomeCurto)}!</p>
<p>Recebemos o seu cadastro no ValtaTCG. Falta só um passo: confirmar este e-mail e criar a sua senha.</p>
<p><a href="${esc(link)}"><strong>Confirmar e-mail e criar senha</strong></a></p>
<p>O link vale por ${validadeHoras} horas e só pode ser usado uma vez.</p>
<p>Se não foi você que fez o cadastro, ignore este e-mail: nenhuma conta será criada.</p>
<p>ValtaTCG · desenvolvido por omva</p>`;
  return { assunto, texto, html };
}

/** Alguém tentou se cadastrar com um e-mail que já tem conta: a resposta na tela é igual, e o aviso vai para o dono do e-mail. */
export function emailJaTemCadastro({ nome, linkEntrar }) {
  const nomeCurto = primeiroNome(nome);
  const assunto = 'Este e-mail já tem conta no ValtaTCG';
  const texto = [
    `Olá, ${nomeCurto}!`,
    '',
    'Alguém tentou criar uma conta no ValtaTCG com este e-mail, mas ele já tem cadastro.',
    '',
    'Para entrar, use:',
    linkEntrar,
    '',
    'Se foi você e esqueceu a senha, fale com o suporte. Se não foi você, ignore este e-mail.',
    '',
    'ValtaTCG · desenvolvido por omva',
  ].join('\n');
  const html = `<p>Olá, ${esc(nomeCurto)}!</p>
<p>Alguém tentou criar uma conta no ValtaTCG com este e-mail, mas ele <strong>já tem cadastro</strong>.</p>
<p><a href="${esc(linkEntrar)}">Entrar no ValtaTCG</a></p>
<p>Se foi você e esqueceu a senha, fale com o suporte. Se não foi você, ignore este e-mail.</p>
<p>ValtaTCG · desenvolvido por omva</p>`;
  return { assunto, texto, html };
}

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

const dataHoraBr = (iso) => new Date(`${String(iso).replace(' ', 'T')}Z`)
  .toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Aviso ao administrador: loja nova (ou alterada) esperando decisão dentro do prazo prometido. */
export function emailLojaParaRevisar({ nomeDaLoja, cidade, uf, prazoEm, link, alteracao }) {
  const assunto = `${alteracao ? 'Loja alterada' : 'Nova loja'} para aprovar: ${nomeDaLoja}`;
  const prazo = dataHoraBr(prazoEm);
  const linhas = [
    `${alteracao ? 'A loja alterou o cadastro e voltou para análise' : 'Uma loja se cadastrou no ValtaTCG'}: ${nomeDaLoja} (${cidade} · ${uf}).`,
    '',
    `Prometemos a resposta até ${prazo}. Abra a fila de lojas para aprovar ou recusar:`,
    link,
  ];
  const html = `<p>${esc(linhas[0])}</p>
<p>Prometemos a resposta até <strong>${esc(prazo)}</strong>. <a href="${esc(link)}">Abrir a fila de lojas</a>.</p>`;
  return { assunto, texto: linhas.join('\n'), html };
}

/** Aviso ao dono da loja: a decisão do administrador e o próximo passo. */
export function emailDecisaoDaLoja({ nomeDaLoja, aprovada, motivo, preco, link }) {
  const reais = Number(preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const assunto = aprovada ? `Sua loja ${nomeDaLoja} foi aprovada no ValtaTCG` : `Sobre o cadastro da loja ${nomeDaLoja} no ValtaTCG`;
  const linhas = aprovada
    ? [
      `A loja ${nomeDaLoja} foi aprovada.`,
      '',
      preco > 0
        ? `Para aparecer no diretório, com sua logo e o link do seu site, ative a mensalidade de ${reais} em: ${link}`
        : `Acompanhe a situação da loja em: ${link}`,
    ]
    : [
      `O cadastro da loja ${nomeDaLoja} não foi aprovado.`,
      motivo ? `Motivo: ${motivo}` : '',
      '',
      `Detalhes em: ${link}`,
    ];
  const html = linhas.map((l) => (l ? `<p>${esc(l)}</p>` : '')).join('\n');
  return { assunto, texto: linhas.join('\n'), html };
}
