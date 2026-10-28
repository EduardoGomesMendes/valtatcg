import nodemailer from 'nodemailer';
import { config } from '../src/config.js';

/*
  Confere o e-mail do servidor sem subir o sistema: lê o .env, tenta entrar no SMTP e manda um e-mail de teste.
  Uso (na pasta do projeto, no servidor ou no PC):  node scripts/testar-email.mjs seu@email.com
  Nunca imprime a senha. O diagnóstico separa "não achei o servidor" de "usuário ou senha recusados".
*/

const destino = process.argv[2];
const { modo, host, porta, seguro, usuario, senha, remetente } = config.email;
const mascarar = (e) => String(e).replace(/^(.)[^@]*(@.*)$/, '$1***$2');

console.log(`modo: ${modo}`);
console.log(`servidor: ${host || '(vazio)'}:${porta} ${seguro ? '(SSL)' : '(STARTTLS)'}`);
console.log(`usuário: ${usuario ? mascarar(usuario) : '(vazio)'} · senha: ${senha ? 'preenchida' : '(vazia)'}`);
console.log(`remetente: ${remetente || '(vazio)'}`);
console.log(`endereço dos links: ${config.urlPublica}`);

const faltando = [
  !host && 'SMTP_HOST', !usuario && 'SMTP_USER', !senha && 'SMTP_PASS', !remetente && 'EMAIL_REMETENTE',
].filter(Boolean);
if (modo !== 'smtp' || faltando.length) {
  console.error(`\nNão está pronto para enviar de verdade. ${modo !== 'smtp' ? `EMAIL_MODO é "${modo}" (precisa ser smtp, ou ficar vazio com SMTP_HOST preenchido). ` : ''}${faltando.length ? `Faltam no .env: ${faltando.join(', ')}.` : ''}`);
  process.exit(1);
}
if (!destino || !destino.includes('@')) {
  console.error('\nInforme para onde mandar o teste:  node scripts/testar-email.mjs seu@email.com');
  process.exit(1);
}

const transporte = nodemailer.createTransport({
  host, port: porta, secure: seguro, auth: { user: usuario, pass: senha },
  connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
});

try {
  await transporte.verify();
  console.log('\n✔ Servidor encontrado e login aceito.');
} catch (erro) {
  const dica = erro.code === 'EAUTH' ? 'usuário ou senha recusados (confira SMTP_USER e SMTP_PASS)'
    : ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET'].includes(erro.code) ? 'não consegui falar com o servidor (confira SMTP_HOST, SMTP_PORT e SMTP_SEGURO; algumas hospedagens bloqueiam a porta de saída)'
      : erro.message;
  console.error(`\n✖ Falhou antes de enviar: ${erro.code ?? ''} ${dica}`);
  process.exit(1);
}

try {
  const r = await transporte.sendMail({
    from: remetente,
    to: destino,
    subject: 'Teste de e-mail do ValtaTCG',
    text: 'Se você recebeu esta mensagem, o e-mail do ValtaTCG está funcionando.\n\nValtaTCG · desenvolvido por omva',
  });
  console.log(`✔ Enviado para ${mascarar(destino)} (id ${r.messageId}).`);
  console.log('Agora confira a caixa de entrada E o spam. Se caiu no spam, falta SPF/DKIM do domínio do remetente.');
} catch (erro) {
  console.error(`✖ O servidor aceitou o login mas recusou o envio: ${erro.code ?? ''} ${erro.message}`);
  process.exit(1);
}
