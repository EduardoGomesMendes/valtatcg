import { db } from '../db/index.js';
import { config } from '../config.js';

/*
  Estado da assinatura de cada usuário.

  Guardado em colunas de `usuarios` (é sempre UMA assinatura por usuário) mais
  uma tabela de eventos, para dar para reconstruir o que aconteceu: quando
  começou o teste, quando pagou, quando venceu, quem liberou na mão.

  Situações possíveis:
    teste     — dias grátis desde o cadastro, tudo liberado
    ativa     — assinatura paga e dentro da validade
    vencida   — o teste acabou ou a assinatura expirou: escrita bloqueada
    cancelada — a pessoa cancelou

  Administrador nunca é bloqueado — essa checagem é feita por quem chama
  (ver exigirAssinatura em src/api/autenticacao.js), não aqui: esta função só
  resolve o estado real da assinatura, sem conhecer o conceito de "admin".
*/

const PLANO = Object.freeze({
  chave: 'mensal',
  rotulo: 'Mensal',
  get preco() { return config.assinatura.precoMensal; },
});

export function plano() {
  return { chave: PLANO.chave, rotulo: PLANO.rotulo, preco: PLANO.preco };
}

/** Data (texto SQLite) daqui a N dias. */
function daquiADias(dias) {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function diasAte(dataTexto) {
  if (!dataTexto) return 0;
  const alvo = new Date(`${String(dataTexto).replace(' ', 'T')}Z`);
  if (Number.isNaN(alvo.getTime())) return 0;
  return Math.ceil((alvo.getTime() - Date.now()) / 86400000);
}

export function registrarEvento({ usuarioId, tipo, descricao, valor = null, ator = 'sistema' }) {
  db.prepare(
    `INSERT INTO assinatura_eventos (usuario_id, tipo, descricao, valor, ator)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(Number(usuarioId), tipo, descricao, valor, ator);
}

export function listarEventos(usuarioId, limite = 50) {
  return db.prepare(
    'SELECT * FROM assinatura_eventos WHERE usuario_id = ? ORDER BY id DESC LIMIT ?',
  ).all(Number(usuarioId), Number(limite));
}

/** Começa o teste gratuito. Chamado quando a conta é criada. */
export function iniciarTeste(usuarioId) {
  const dias = config.assinatura.diasDeTeste;
  db.prepare(
    `UPDATE usuarios
        SET assinatura_status = 'teste', teste_termina_em = datetime('now', ?)
      WHERE id = ?`,
  ).run(`+${dias} days`, Number(usuarioId));

  registrarEvento({ usuarioId, tipo: 'teste', descricao: `Teste gratuito de ${dias} dias iniciado.` });
}

/**
 * Situação atual da assinatura, já resolvida — é isto que o resto do sistema
 * consulta, em vez de interpretar colunas soltas.
 */
export function estado(usuario) {
  if (!usuario) return { status: 'vencida', bloqueado: true, motivo: 'usuário não encontrado' };

  const status = usuario.assinatura_status ?? 'teste';

  if (status === 'cancelada') {
    return { status: 'cancelada', plano: null, bloqueado: true, diasRestantes: 0, motivo: 'Assinatura cancelada.' };
  }

  if (status === 'ativa') {
    const dias = diasAte(usuario.assinatura_expira_em);
    if (dias > 0) {
      return {
        status: 'ativa',
        plano: plano(),
        bloqueado: false,
        diasRestantes: dias,
        avisar: dias <= 7,
        motivo: null,
      };
    }
    return { status: 'vencida', plano: plano(), bloqueado: true, diasRestantes: 0, motivo: 'A assinatura venceu.' };
  }

  // Em teste
  const dias = diasAte(usuario.teste_termina_em);
  if (dias > 0) {
    return { status: 'teste', plano: null, bloqueado: false, diasRestantes: dias, avisar: true, motivo: null };
  }

  return {
    status: 'vencida', plano: null, bloqueado: true, diasRestantes: 0, motivo: 'O período de teste terminou.',
  };
}

export function estadoDoUsuario(usuarioId) {
  const usuario = db.prepare(
    'SELECT id, assinatura_status, teste_termina_em, assinatura_expira_em FROM usuarios WHERE id = ?',
  ).get(Number(usuarioId));
  return estado(usuario);
}

/**
 * Ativa ou renova a assinatura por N dias.
 * `ator` registra quem liberou: o gateway de pagamento ou um admin, na mão.
 */
export function ativar(usuarioId, { dias = 30, ator = 'sistema', descricao = null } = {}) {
  // Renovação sem perder o saldo: se ainda há dias válidos, soma a partir deles.
  const atual = db.prepare('SELECT assinatura_expira_em, assinatura_status FROM usuarios WHERE id = ?')
    .get(Number(usuarioId));
  const saldo = atual?.assinatura_status === 'ativa' ? Math.max(0, diasAte(atual.assinatura_expira_em)) : 0;

  db.prepare(
    `UPDATE usuarios SET assinatura_status = 'ativa', assinatura_expira_em = datetime('now', ?) WHERE id = ?`,
  ).run(`+${saldo + dias} days`, Number(usuarioId));

  registrarEvento({
    usuarioId,
    tipo: 'ativacao',
    descricao: descricao ?? `Assinatura ativada por ${dias} dias.`,
    valor: PLANO.preco,
    ator,
  });

  return estadoDoUsuario(usuarioId);
}

export function cancelar(usuarioId, motivo = null, ator = 'humano') {
  db.prepare("UPDATE usuarios SET assinatura_status = 'cancelada' WHERE id = ?").run(Number(usuarioId));
  registrarEvento({
    usuarioId,
    tipo: 'cancelamento',
    descricao: motivo ? `Assinatura cancelada: ${motivo}` : 'Assinatura cancelada.',
    ator,
  });
  return estadoDoUsuario(usuarioId);
}

/* ------------------------------------------------------------------ */
/* Cobrança (gateway de pagamento)                                     */
/* ------------------------------------------------------------------ */

export function dadosDeCobranca(usuarioId) {
  return db.prepare(
    `SELECT id, nome, documento, email_cobranca, asaas_cliente_id, asaas_assinatura_id
       FROM usuarios WHERE id = ?`,
  ).get(Number(usuarioId)) ?? null;
}

export function salvarDadosDeCobranca(usuarioId, { documento = null, email = null } = {}) {
  db.prepare(
    `UPDATE usuarios SET documento = COALESCE(?, documento), email_cobranca = COALESCE(?, email_cobranca)
      WHERE id = ?`,
  ).run(documento, email, Number(usuarioId));
}

export function salvarIdentificadoresAsaas(usuarioId, { clienteId = null, assinaturaId = null } = {}) {
  db.prepare(
    `UPDATE usuarios SET asaas_cliente_id = COALESCE(?, asaas_cliente_id), asaas_assinatura_id = ? WHERE id = ?`,
  ).run(clienteId, assinaturaId, Number(usuarioId));
}

/** Descobre o usuário pela assinatura do gateway — plano B do webhook quando
 *  o externalReference não veio. */
export function usuarioPorAssinaturaExterna(assinaturaId) {
  if (!assinaturaId) return null;
  return db.prepare('SELECT id FROM usuarios WHERE asaas_assinatura_id = ?').get(String(assinaturaId))?.id ?? null;
}

/**
 * Guarda a notificação do gateway e diz se ela é nova.
 *
 * Devolve false quando a mesma cobrança já produziu a mesma AÇÃO antes. É o
 * que impede um pagamento de valer dois meses: o Asaas reenvia a notificação
 * até receber 200, e ainda manda PAYMENT_CONFIRMED e PAYMENT_RECEIVED para a
 * mesma cobrança — dois eventos, um pagamento só.
 */
export function registrarWebhook({ provedor = 'asaas', evento, acao, referencia, usuarioId = null, valor = null, corpo }) {
  const info = db.prepare(
    `INSERT OR IGNORE INTO pagamento_eventos (provedor, evento, acao, referencia, usuario_id, valor, corpo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    provedor,
    String(evento),
    String(acao),
    String(referencia),
    usuarioId === null ? null : Number(usuarioId),
    valor,
    typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  );

  return info.changes > 0;
}

/**
 * Diz se esta cobrança já produziu uma determinada ação antes.
 *
 * Serve para não depender da ordem de chegada das notificações: um "pagou"
 * que chegasse depois de um "estornou" da MESMA cobrança reativaria a
 * assinatura de quem já pegou o dinheiro de volta.
 */
export function jaAconteceu({ provedor = 'asaas', acao, referencia }) {
  if (!referencia) return false;
  return Boolean(db.prepare(
    'SELECT 1 FROM pagamento_eventos WHERE provedor = ? AND acao = ? AND referencia = ? LIMIT 1',
  ).get(provedor, String(acao), String(referencia)));
}

export function listarEventosDePagamento(usuarioId, limite = 20) {
  return db.prepare(
    'SELECT id, evento, acao, referencia, valor, recebido_em FROM pagamento_eventos WHERE usuario_id = ? ORDER BY id DESC LIMIT ?',
  ).all(Number(usuarioId), Number(limite));
}
