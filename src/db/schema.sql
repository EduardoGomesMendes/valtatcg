CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  admin INTEGER NOT NULL DEFAULT 0,
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
