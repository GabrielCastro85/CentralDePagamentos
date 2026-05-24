-- Central de Pagamentos - schema remoto para Supabase/PostgreSQL
-- Execute este SQL no Supabase antes de ativar a sincronização.

create extension if not exists "pgcrypto";

create table if not exists public.sync_devices (
  id uuid primary key,
  name text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.empresas (
  id uuid primary key,
  apelido text not null,
  razao_social text,
  cnpj text,
  banco text,
  agencia text,
  conta text,
  ativo boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id uuid
);

create table if not exists public.clientes (
  id uuid primary key,
  nome_curto text not null,
  razao_social text,
  grupo_whatsapp text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id uuid
);

create table if not exists public.operacoes (
  id uuid primary key,
  codigo text,
  data date not null,
  cliente_id uuid references public.clientes(id),
  empresa_id uuid references public.empresas(id),
  valor_recebido numeric(14,2) not null default 0,
  status text not null,
  observacao text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id uuid
);

create table if not exists public.pagamentos (
  id uuid primary key,
  operacao_id uuid references public.operacoes(id),
  data date not null,
  favorecido text not null,
  documento text,
  tipo_pagamento text not null default 'PIX',
  chave_pix text,
  banco text,
  agencia text,
  tipo_conta text not null default 'NAO_INFORMADO',
  conta text,
  digito text,
  valor numeric(14,2) not null default 0,
  pago boolean not null default false,
  comprovante_enviado boolean not null default false,
  observacao text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id uuid
);

create table if not exists public.audit_logs (
  id uuid primary key,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  device_id uuid
);

create index if not exists idx_empresas_updated_at on public.empresas(updated_at);
create index if not exists idx_clientes_updated_at on public.clientes(updated_at);
create index if not exists idx_operacoes_updated_at on public.operacoes(updated_at);
create index if not exists idx_pagamentos_updated_at on public.pagamentos(updated_at);
create index if not exists idx_audit_logs_updated_at on public.audit_logs(updated_at);

-- Para protótipo interno com anon key, habilite RLS e crie políticas amplas.
-- Em produção, troque por autenticação por usuário/empresa.
alter table public.empresas enable row level security;
alter table public.clientes enable row level security;
alter table public.operacoes enable row level security;
alter table public.pagamentos enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_devices enable row level security;

create policy "internal sync read empresas" on public.empresas for select using (true);
create policy "internal sync write empresas" on public.empresas for all using (true) with check (true);
create policy "internal sync read clientes" on public.clientes for select using (true);
create policy "internal sync write clientes" on public.clientes for all using (true) with check (true);
create policy "internal sync read operacoes" on public.operacoes for select using (true);
create policy "internal sync write operacoes" on public.operacoes for all using (true) with check (true);
create policy "internal sync read pagamentos" on public.pagamentos for select using (true);
create policy "internal sync write pagamentos" on public.pagamentos for all using (true) with check (true);
create policy "internal sync read audit_logs" on public.audit_logs for select using (true);
create policy "internal sync write audit_logs" on public.audit_logs for all using (true) with check (true);
create policy "internal sync read devices" on public.sync_devices for select using (true);
create policy "internal sync write devices" on public.sync_devices for all using (true) with check (true);
