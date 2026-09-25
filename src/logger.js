const niveis = { debug: 10, info: 20, warn: 30, error: 40 };
const nivelAtual = niveis[process.env.LOG_LEVEL || 'info'] ?? niveis.info;

function hora() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

function escrever(nivel, prefixo, args) {
  if (niveis[nivel] < nivelAtual) return;
  const destino = nivel === 'error' || nivel === 'warn' ? console.error : console.log;
  destino(`${hora()} ${prefixo}`, ...args);
}

export function criarLog(escopo) {
  return {
    debug: (...a) => escrever('debug', `· [${escopo}]`, a),
    info: (...a) => escrever('info', `→ [${escopo}]`, a),
    warn: (...a) => escrever('warn', `! [${escopo}]`, a),
    error: (...a) => escrever('error', `✖ [${escopo}]`, a),
  };
}
