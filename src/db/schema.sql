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
  -- Idade e responsável (fase 0). nascimento NULL = conta de antes do campo existir.
  nascimento TEXT,
  responsavel_nome TEXT,
  responsavel_email TEXT,
  responsavel_status TEXT,            -- NULL (não se aplica) | pendente | confirmado
  responsavel_token_hash TEXT,
  responsavel_token_expira_em TEXT,
  responsavel_confirmado_em TEXT,
  responsavel_envios INTEGER NOT NULL DEFAULT 0,
  responsavel_envios_data TEXT,
  aceite_termos_em TEXT,
  suspenso INTEGER NOT NULL DEFAULT 0,
  motivo_suspensao TEXT,
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

-- Denúncias de usuários contra lojas (e, nas próximas fases, contra anúncios e pessoas).
CREATE TABLE IF NOT EXISTS denuncias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  alvo_tipo TEXT NOT NULL,            -- loja | usuario
  alvo_id INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  detalhe TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',   -- aberta | resolvida | descartada
  nota_admin TEXT,
  resolvida_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  resolvida_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_denuncias_status ON denuncias(status, id DESC);

-- Lojas que se anunciam no diretório. Uma por dono (por enquanto).
CREATE TABLE IF NOT EXISTS lojas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dono_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  descricao TEXT,
  uf TEXT NOT NULL,
  cidade TEXT NOT NULL,
  cidade_busca TEXT NOT NULL,         -- minúscula e sem acento, para a busca por região
  whatsapp TEXT,
  instagram TEXT,
  site TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',        -- pendente | ativa | recusada | suspensa
  motivo_status TEXT,
  assinatura_status TEXT NOT NULL DEFAULT 'inativa',   -- inativa | ativa | cancelada
  assinatura_expira_em TEXT,
  asaas_cliente_id TEXT,
  asaas_assinatura_id TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lojas_busca ON lojas(status, uf, cidade_busca);

-- Fórum: só texto. As categorias são fixas no código (src/comunidade/forum.repo.js).
-- Apagar a conta apaga os tópicos e respostas da pessoa (cascata): dado pessoal não fica sem dono.
CREATE TABLE IF NOT EXISTS forum_topicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  autor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL,
  fixado INTEGER NOT NULL DEFAULT 0,
  fechado INTEGER NOT NULL DEFAULT 0,
  oculto INTEGER NOT NULL DEFAULT 0,
  respostas INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atividade_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forum_topicos ON forum_topicos(categoria, oculto, fixado DESC, atividade_em DESC);

CREATE TABLE IF NOT EXISTS forum_respostas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topico_id INTEGER NOT NULL REFERENCES forum_topicos(id) ON DELETE CASCADE,
  autor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  corpo TEXT NOT NULL,
  oculto INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forum_respostas ON forum_respostas(topico_id, id);

-- Eventos do Brasil inteiro. A data é só o dia (sem fuso): evento passado é apagado pela limpeza diária.
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_por INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  loja_id INTEGER REFERENCES lojas(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,                  -- torneio | encontro | lancamento | feira | outro
  uf TEXT NOT NULL,
  cidade TEXT NOT NULL,
  cidade_busca TEXT NOT NULL,
  local TEXT,
  descricao TEXT,
  data_inicio TEXT NOT NULL,           -- AAAA-MM-DD
  data_fim TEXT NOT NULL,              -- AAAA-MM-DD (igual ao início quando é de um dia só)
  hora TEXT,                           -- HH:MM, opcional
  link TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | aprovado | recusado
  motivo_status TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_eventos_busca ON eventos(status, data_fim, uf);

-- Mensagens que o filtro barrou antes de publicar. É sinal para o moderador: quem insiste em pedir telefone
-- ou encontro a menores aparece aqui. O trecho é curto e apagado depois de 90 dias.
CREATE TABLE IF NOT EXISTS bloqueios_conteudo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  classe TEXT NOT NULL,
  grave INTEGER NOT NULL DEFAULT 0,
  origem TEXT NOT NULL,                -- topico | resposta | evento
  trecho TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_usuario ON bloqueios_conteudo(usuario_id, grave, criado_em);

-- Cotação dólar→real, uma por dia. Reserva quando as fontes caem e base para converter o gráfico dia a dia.
CREATE TABLE IF NOT EXISTS cambio_diario (
  data TEXT PRIMARY KEY,
  usd_brl REAL NOT NULL,
  fonte TEXT,
  buscado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
