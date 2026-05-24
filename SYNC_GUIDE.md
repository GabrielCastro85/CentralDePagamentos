# Guia de Sincronização — Central de Pagamentos

---

## Como funciona

O app funciona **offline por padrão** — todos os dados ficam no banco SQLite local.

Se você configurar o Supabase (banco de dados na nuvem), o app sincroniza automaticamente:
- A cada 3 minutos enquanto estiver aberto
- Ao iniciar o app

Isso permite usar o app em mais de um computador com os dados sempre atualizados.

---

## Status de sincronização

| Status | Ícone | Significado |
|--------|-------|-------------|
| **Não configurado** | — | Supabase não foi configurado; app funciona só localmente |
| **Idle** | ✅ | Sincronização em dia, aguardando próximo ciclo |
| **Sincronizando** | 🔄 | Enviando dados para a nuvem |
| **Erro** | 🔴 | Falha ao sincronizar — dados locais estão seguros |
| **Offline** | 📵 | Sem conexão com a internet |

> Mesmo com erro de sync, **os dados locais estão seguros**. O app tentará novamente no próximo ciclo.

---

## Configurar o Supabase (passo a passo)

### 1. Criar conta no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita
2. Crie um novo projeto
3. Anote a **URL do projeto** e a **chave anon/public** (em Settings → API)

### 2. Criar as tabelas no Supabase

No painel do Supabase, abra o **SQL Editor** e execute o script de criação de tabelas (solicite ao suporte técnico).

### 3. Configurar no app

Crie um arquivo `.env` na pasta de recursos do app com o conteúdo:

```
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-aqui
```

A localização do arquivo `.env` depende de como o app foi instalado — consulte o suporte técnico.

### 4. Verificar

1. Abra o app
2. Vá em **Sincronização** no menu lateral
3. O status deve mudar de "Não configurado" para "Idle" ou "Sincronizando"

---

## Usar em dois computadores

1. Configure o Supabase nos dois computadores (mesmo projeto, mesmas chaves)
2. Abra o app no computador A → dados sobem para a nuvem
3. Abra o app no computador B → dados descem da nuvem
4. Ambos ficam sempre atualizados

> Se os dois estiverem abertos ao mesmo tempo, a sincronização ocorre automaticamente a cada 3 minutos.

---

## Forçar sincronização manual

1. Vá em **Sincronização** no menu lateral
2. Clique em **Sincronizar agora**

---

## Ver fila de sincronização

A fila mostra os registros que ainda não foram enviados para a nuvem (ex.: durante uso offline).

1. Vá em **Sincronização** no menu lateral
2. A tabela de fila mostra o que está pendente

Se houver itens com erro:
- Clique em **Tentar novamente** para reenviar
- Se o erro persistir, verifique a conexão e as credenciais do Supabase

---

## Plano gratuito do Supabase

O plano gratuito é suficiente para uso interno de pequena/média escala:
- 500 MB de armazenamento de banco de dados
- 2 GB de largura de banda por mês
- Projetos ficam pausados após 1 semana sem atividade (reativam ao acessar)

Para uso intenso, considere um plano pago no Supabase.

---

## Sem Supabase — funcionamento local

Se não configurar o Supabase:
- O app funciona normalmente 100% offline
- Os dados ficam só no banco SQLite local
- Use backup manual + migração por arquivo JSON para trocar de computador
- Veja: `BACKUP_RESTORE.md`
