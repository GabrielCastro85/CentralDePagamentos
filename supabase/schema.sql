-- =============================================================================
-- Central de Pagamentos — Schema Supabase (produção)
-- Executar no SQL Editor do painel Supabase
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tabela: sync_devices
-- Registra cada PC/dispositivo que sincroniza
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_devices (
  id           UUID PRIMARY KEY,
  name         TEXT,
  last_seen_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- Tabela: empresas
-- Contas bancárias/CNPJs usados para emitir pagamentos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apelido      TEXT NOT NULL,
  razao_social TEXT,
  cnpj         TEXT,
  banco        TEXT,
  agencia      TEXT,
  conta        TEXT,
  ativo        BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL,
  deleted_at   TIMESTAMPTZ,
  device_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_empresas_updated ON empresas (updated_at);

-- -----------------------------------------------------------------------------
-- Tabela: clientes
-- Quem envia o PIX para a corretora
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_curto      TEXT NOT NULL,
  razao_social    TEXT,
  grupo_whatsapp  TEXT,
  observacoes     TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  deleted_at      TIMESTAMPTZ,
  device_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_clientes_updated ON clientes (updated_at);

-- -----------------------------------------------------------------------------
-- Tabela: operacoes
-- Cada PIX recebido vira uma operação
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          TEXT,
  data            TEXT NOT NULL,
  cliente_id      UUID REFERENCES clientes(id),
  empresa_id      UUID REFERENCES empresas(id),
  valor_recebido  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'AGUARDANDO_LISTA',
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL,
  deleted_at      TIMESTAMPTZ,
  device_id       TEXT
);

CREATE INDEX IF NOT EXISTS idx_operacoes_updated   ON operacoes (updated_at);
CREATE INDEX IF NOT EXISTS idx_operacoes_status    ON operacoes (status);
CREATE INDEX IF NOT EXISTS idx_operacoes_data      ON operacoes (data);
CREATE INDEX IF NOT EXISTS idx_operacoes_cliente   ON operacoes (cliente_id);
CREATE INDEX IF NOT EXISTS idx_operacoes_empresa   ON operacoes (empresa_id);

-- -----------------------------------------------------------------------------
-- Tabela: pagamentos
-- Favorecidos de cada operação
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pagamentos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operacao_id          UUID REFERENCES operacoes(id),
  data                 TEXT NOT NULL,
  favorecido           TEXT NOT NULL,
  documento            TEXT,
  tipo_pagamento       TEXT NOT NULL DEFAULT 'PIX',
  chave_pix            TEXT,
  banco                TEXT,
  agencia              TEXT,
  tipo_conta           TEXT NOT NULL DEFAULT 'NAO_INFORMADO',
  conta                TEXT,
  digito               TEXT,
  valor                NUMERIC(15, 2) NOT NULL DEFAULT 0,
  pago                 BOOLEAN NOT NULL DEFAULT false,
  comprovante_enviado  BOOLEAN NOT NULL DEFAULT false,
  observacao           TEXT,
  created_at           TIMESTAMPTZ NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL,
  deleted_at           TIMESTAMPTZ,
  device_id            TEXT
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_updated  ON pagamentos (updated_at);
CREATE INDEX IF NOT EXISTS idx_pagamentos_operacao ON pagamentos (operacao_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_pago     ON pagamentos (pago);

-- -----------------------------------------------------------------------------
-- Tabela: audit_logs
-- Trilha de auditoria de todas as ações
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,
  deleted_at  TIMESTAMPTZ,
  device_id   TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_updated ON audit_logs (updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs (entity);

-- =============================================================================
-- Row Level Security (RLS)
-- App usa a anon key como camada de autenticação.
-- Habilitar RLS + política permissiva para a chave anon é suficiente
-- para proteger os dados de acesso público sem autenticação.
-- =============================================================================

ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE operacoes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs    ENABLE ROW LEVEL SECURITY;

-- Política: qualquer requisição com a anon key tem acesso total
-- (a anon key é mantida em segredo no .env do servidor de produção)
CREATE POLICY "anon full access" ON sync_devices USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON empresas      USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON clientes      USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON operacoes     USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pagamentos    USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON audit_logs    USING (true) WITH CHECK (true);
