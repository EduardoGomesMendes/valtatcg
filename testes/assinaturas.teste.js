import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'valtatcg-teste-'));
process.env.DATA_DIR = pastaTemp;
process.env.DIAS_DE_TESTE = '7';
process.env.PRECO_MENSAL = '9.97';

const { db } = await import('../src/db/index.js');
const { criar } = await import('../src/auth/usuarios.repo.js');
const assinaturas = await import('../src/assinaturas/assinaturas.repo.js');

let falhas = 0;
function ok(nome, condicao, detalhe = '') {
  console.log(`${condicao ? '  OK  ' : ' FALHA'} ${nome}${detalhe ? ` → ${detalhe}` : ''}`);
  if (!condicao) falhas += 1;
}

console.log('\n--- assinaturas ---');

const usuario = criar({ nome: 'Dan', email: 'dan@teste.local', senha: 'Senha1234' });

// Conta recém-criada, sem iniciarTeste() chamado ainda: nasce com o DEFAULT
// da coluna ('teste') mas sem data — o resto do sistema não deveria travar.
const estadoBruto = assinaturas.estadoDoUsuario(usuario.id);
ok('sem teste_termina_em, trata como vencido (seguro por padrão)', estadoBruto.status === 'vencida' && estadoBruto.bloqueado === true);

assinaturas.iniciarTeste(usuario.id);
const emTeste = assinaturas.estadoDoUsuario(usuario.id);
ok('iniciarTeste libera por 7 dias', emTeste.status === 'teste' && emTeste.bloqueado === false && emTeste.diasRestantes === 7);

const eventos = assinaturas.listarEventos(usuario.id);
ok('início do teste vira evento no histórico', eventos.some((e) => e.tipo === 'teste'));

const ativada = assinaturas.ativar(usuario.id, { dias: 30, ator: 'teste' });
ok('ativar muda o status para ativa', ativada.status === 'ativa' && ativada.bloqueado === false);
ok('ativar dá ~30 dias', ativada.diasRestantes >= 29 && ativada.diasRestantes <= 30);

// Renovação sem perder saldo: ativar de novo soma a partir do que já restava,
// não substitui — senão renovar antes do vencimento "roubaria" dias pagos.
const renovada = assinaturas.ativar(usuario.id, { dias: 30, ator: 'teste' });
ok('renovar antes de vencer soma ao saldo (não substitui)', renovada.diasRestantes >= 58);

const cancelada = assinaturas.cancelar(usuario.id, 'pedido do cliente', 'teste');
ok('cancelar bloqueia', cancelada.status === 'cancelada' && cancelada.bloqueado === true);

// Idempotência do webhook: a mesma cobrança não pode liberar duas vezes.
const primeira = assinaturas.registrarWebhook({
  evento: 'PAYMENT_RECEIVED', acao: 'pagou', referencia: 'pay_123', usuarioId: usuario.id, valor: 9.97, corpo: { x: 1 },
});
const repetida = assinaturas.registrarWebhook({
  evento: 'PAYMENT_RECEIVED', acao: 'pagou', referencia: 'pay_123', usuarioId: usuario.id, valor: 9.97, corpo: { x: 1 },
});
ok('primeiro registro do webhook é inédito', primeira === true);
ok('mesmo evento/ação/referência não se repete', repetida === false);

ok('jaAconteceu confere o que foi gravado', assinaturas.jaAconteceu({ acao: 'pagou', referencia: 'pay_123' }) === true);
ok('jaAconteceu nega o que não aconteceu', assinaturas.jaAconteceu({ acao: 'estornou', referencia: 'pay_123' }) === false);

db.close();
try {
  fs.rmSync(pastaTemp, { recursive: true, force: true });
} catch {
  // pasta fica para trás em %TEMP% — sem impacto no resultado do teste.
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nOK — tudo passou\n');
process.exit(falhas > 0 ? 1 : 0);
