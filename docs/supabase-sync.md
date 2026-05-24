# Supabase - Configuração da sincronização

## O que o app usa

O app desktop sincroniza pelo endpoint HTTPS do Supabase:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
```

Esses dois valores ficam no `.env` local durante desenvolvimento.

## O que não deve ir no app

As conexões abaixo são para migration e administração do banco, não para distribuir no app:

```env
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

Não coloque a senha do PostgreSQL no código, no React ou em arquivo versionado.

## Aplicar o schema

Opção 1: pelo painel do Supabase

1. Acesse o projeto no Supabase.
2. Abra **SQL Editor**.
3. Cole o conteúdo de `supabase/sync_schema.sql`.
4. Execute o SQL.

Opção 2: via terminal com `psql`

```powershell
psql "$env:DIRECT_URL" -f supabase/sync_schema.sql
```

## Onde pegar a anon key

No painel do Supabase:

1. Abra **Project Settings**.
2. Vá em **API**.
3. Copie:
   - Project URL
   - anon public key

Use esses valores no `.env`.
