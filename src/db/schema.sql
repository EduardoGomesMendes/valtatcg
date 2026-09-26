CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  -- Sem NOT NULL: contas de antes deste campo existir ficam com usuario NULL
  -- (múltiplos NULL não conflitam com UNIQUE no SQLite) e continuam
  -- entrando só pelo e-mail, até decidirem cadastrar um.
  usuario TEXT,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  admin INTEGER NOT NULL DEFAULT 0,
  -- teste | ativa | vencida | cancelada (ver src/assinaturas/assinaturas.repo.js)
  assinatura_status TEXT NOT NULL DEFAULT 'teste',
  teste_termina_em TEXT,
  assinatura_expira_em TEXT,
  documento TEXT,
  email_cobranca TEXT,
  asaas_cliente_id TEXT,
  asaas_assinatura_id TEXT,
  -- O arquivo em si fica em data/avatares/<id> (fora do banco, fora do Git);
  -- estas colunas só dizem se existe e com qual Content-Type servi-lo.
  avatar_mime TEXT,
  avatar_atualizado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_uso TEXT,
  expira_em TEXT NOT NULL
);

-- Cache local das cartas consultadas na pokemontcg.io. `id` é o id da carta
-- na API (ex.: "swsh4-25") — não é um id local nosso, de propósito: assim
-- não precisamos de uma tabela de mapeamento para referenciar a carta em
-- colecao_item e preco_historico.
CREATE TABLE IF NOT EXISTS carta_cache (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  set_id TEXT,
  set_nome TEXT,
  numero TEXT,
  raridade TEXT,
  imagem_pequena TEXT,
  imagem_grande TEXT,
  preco_mercado_usd REAL,
  preco_atualizado_em TEXT,
  dados_json TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS colecao_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  carta_id TEXT NOT NULL REFERENCES carta_cache(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  variante TEXT,
  condicao TEXT,
  preco_pago_usd REAL,
  adquirido_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Uma linha por carta por dia: é a série usada no gráfico de evolução.
-- A pokemontcg.io não tem endpoint de histórico — este histórico é
-- construído por nós a partir do dia em que a carta entra em alguma coleção.
CREATE TABLE IF NOT EXISTS preco_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carta_id TEXT NOT NULL REFERENCES carta_cache(id),
  data TEXT NOT NULL,
  preco_mercado_usd REAL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(carta_id, data)
);

CREATE INDEX IF NOT EXISTS idx_colecao_item_usuario ON colecao_item(usuario_id);
CREATE INDEX IF NOT EXISTS idx_preco_historico_carta ON preco_historico(carta_id, data);

-- O índice único de usuarios.usuario é criado em src/db/index.js, depois da
-- migração que adiciona a coluna — criá-lo aqui quebraria um banco já em
-- produção, onde CREATE TABLE IF NOT EXISTS não adiciona coluna nenhuma e a
-- coluna "usuario" ainda não existiria na hora deste arquivo rodar.

-- Histórico legível da assinatura de cada usuário (início de teste, ativação,
-- cancelamento) — é o que a tela de admin mostra para explicar o estado atual.
CREATE TABLE IF NOT EXISTS assinatura_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,   -- teste | ativacao | cancelamento | cobranca
  descricao TEXT NOT NULL,
  valor REAL,
  ator TEXT NOT NULL DEFAULT 'sistema',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assinatura_eventos_usuario ON assinatura_eventos(usuario_id, id DESC);

-- Notificações cruas do gateway de pagamento, para auditoria e para o
-- webhook nunca aplicar o mesmo evento duas vezes (INSERT OR IGNORE + UNIQUE).
CREATE TABLE IF NOT EXISTS pagamento_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provedor TEXT NOT NULL DEFAULT 'asaas',
  evento TEXT NOT NULL,          -- PAYMENT_RECEIVED, PAYMENT_OVERDUE, ...
  acao TEXT NOT NULL,            -- pagou | atrasou | estornou
  referencia TEXT NOT NULL,      -- id da cobrança no gateway
  -- Sem FOREIGN KEY de propósito: é registro financeiro. O evento pode não
  -- casar com usuário nenhum, e apagar um usuário não pode apagar a prova
  -- de que ele pagou.
  usuario_id INTEGER,
  valor REAL,
  corpo TEXT NOT NULL,           -- JSON cru, para auditoria e reprocessamento
  recebido_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provedor, acao, referencia)
);
