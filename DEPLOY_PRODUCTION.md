# Deploy em Produção — Central de Pagamentos

> Guia completo para build, release, Supabase e distribuição.

---

## Visão geral

| Componente | Tecnologia | Status |
|-----------|-----------|--------|
| App desktop | Electron 38 + React 19 + SQLite | ✅ Pronto |
| Auto-update | electron-updater + GitHub Releases | ✅ Configurar owner/repo |
| Sincronização | Supabase (offline-first) | ✅ Configurar URL/key |
| Persistência | `%APPDATA%\central-de-pagamentos\` | ✅ Garantido |
| Backup automático | JSON em userData/backups/ | ✅ Ativo por padrão |

---

## PASSO 1 — Configurar GitHub Releases (auto-update)

### 1.1 Criar repositório GitHub

1. Acesse [github.com/new](https://github.com/new)
2. Crie o repositório (pode ser privado)
3. Anote o **username** e o **nome do repo**

### 1.2 Configurar package.json

Abra `package.json` e edite a seção `build.publish`:

```json
"publish": {
  "provider": "github",
  "owner": "SEU_USUARIO_GITHUB",
  "repo": "central-de-pagamentos",
  "releaseType": "release"
}
```

Substitua `SEU_USUARIO_GITHUB` pelo seu username real.

### 1.3 Criar Personal Access Token (PAT)

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Gerar novo token com escopo: **repo** (acesso completo)
3. Copie o token (começa com `ghp_...`)
4. **Nunca commite esse token**

### 1.4 Configurar token no ambiente de build

No Windows (PowerShell), antes de rodar o release:

```powershell
$env:GH_TOKEN = "ghp_seu_token_aqui"
```

Ou adicione ao seu perfil do PowerShell para persistir.

---

## PASSO 2 — Configurar Supabase (sincronização)

### 2.1 Criar projeto Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Crie um novo projeto (região mais próxima: South America)
3. Anote a senha do banco — guarde em local seguro

### 2.2 Executar o schema

1. No painel Supabase → **SQL Editor**
2. Cole o conteúdo de `supabase/schema.sql`
3. Clique em **Run** — todas as tabelas serão criadas

### 2.3 Obter credenciais

No painel Supabase → **Settings → API**:

- **Project URL**: `https://xxxxxxxxxxx.supabase.co`
- **anon/public key**: `eyJhbGci...`

### 2.4 Configurar em produção

Crie o arquivo `.env` em `%APPDATA%\central-de-pagamentos\.env`:

```
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

O app lê esse arquivo automaticamente ao iniciar.

> **Alternativa**: coloque o `.env` na pasta `resources/` do instalador (ao lado do `app.asar`).

---

## PASSO 3 — Gerar build de produção

### 3.1 Pré-requisitos

```
node >= 22
npm >= 10
Git
```

### 3.2 Build local (sem publicar — teste)

```powershell
# Fora do OneDrive (evita bloqueio do app.asar)
npm run dist:local
# Instalador gerado em: C:\Temp\central-build\
```

### 3.3 Build e publicar no GitHub Releases

```powershell
# Configurar token (uma vez por sessão)
$env:GH_TOKEN = "ghp_seu_token_aqui"

# Gerar e publicar
npm run release
```

O comando:
1. Limpa a pasta de build
2. Gera os ícones Windows
3. Compila o React (Vite)
4. Empacota com electron-builder
5. Publica no GitHub Releases como draft
6. Gera `latest.yml` (usado pelo auto-updater)

### 3.4 Publicar o release

1. Acesse o GitHub → Releases
2. O release aparece como **Draft**
3. Edite a descrição e clique em **Publish release**

Após publicado, o auto-updater dos clientes detectará a nova versão.

---

## PASSO 4 — Distribuição inicial

### Primeira instalação nos PCs

1. Baixe o `.exe` do GitHub Releases
2. Execute no PC do usuário
3. Windows Defender pode bloquear — clique **Mais informações → Executar assim mesmo**
4. Siga o instalador (Next → Install → Finish)
5. Configure o `.env` em `%APPDATA%\central-de-pagamentos\.env` (se usar Supabase)

### Dados persistem em

```
%APPDATA%\central-de-pagamentos\
  central-de-pagamentos.sqlite   ← banco principal
  backups\                       ← backups automáticos
  logs\app.log                   ← logs do sistema
  exports\                       ← exportações
  .env                           ← credenciais Supabase (se usar)
```

> **Esses dados NÃO são apagados ao desinstalar ou atualizar.**

---

## PASSO 5 — Fluxo de release (versões futuras)

```
1. Edite código
2. Suba a versão em package.json (ex.: 1.0.0 → 1.0.1)
3. Atualize RELEASE_CHECKLIST.md
4. Execute:
      $env:GH_TOKEN = "ghp_..."
      npm run release
5. Publique o draft no GitHub
6. Usuários recebem notificação ao clicar em "Buscar atualizações"
7. Download automático → "Reiniciar e instalar"
```

### Scripts disponíveis

| Script | O que faz |
|--------|-----------|
| `npm run dev` | Inicia em modo desenvolvimento |
| `npm run build` | Compila o React |
| `npm run dist:local` | Gera instalador local (C:\Temp\central-build) |
| `npm run dist` | Gera instalador na pasta dist/ |
| `npm run release` | Build + publica no GitHub Releases |
| `npm test` | Executa os 64 testes |

---

## PASSO 6 — Auto-update: como funciona

```
Usuário clica "Buscar atualizações"
    ↓
electron-updater consulta GitHub Releases
    ↓
Compara latest.yml com versão instalada
    ↓
[Sem atualização] → "Você está na versão mais recente"
[Com atualização] → Botão "Baixar v1.0.1" aparece
    ↓
Usuário clica "Baixar"
    ↓
Download em segundo plano (barra de progresso)
    ↓
"Reiniciar e instalar" aparece
    ↓
App fecha → instalador NSIS executa → app abre na nova versão
```

> Dados em `%APPDATA%` são preservados durante o update.

---

## PASSO 7 — Teste de instalação limpa

Em um PC novo ou VM:

1. Instalar o `.exe`
2. Abrir o app
3. Criar empresa, cliente, operação, pagamento
4. Fechar o app
5. Reabrir o app
6. Confirmar que os dados persistem
7. Ir em **Backup** e verificar que há um backup automático

---

## PASSO 8 — Teste de update

1. Instalar v1.0.0
2. Criar dados de teste
3. Publicar v1.0.1 no GitHub
4. No app instalado: **Configurações → Buscar atualizações**
5. Confirmar que v1.0.1 é detectada
6. Baixar e instalar
7. Confirmar que os dados de teste persistem após o update

---

## PASSO 9 — Teste de sincronização (dois PCs)

**PC 1:**
1. Configurar `.env` com Supabase
2. Abrir app e criar dados
3. Aguardar sync (3 min) ou clicar **Sincronizar agora**
4. Confirmar status "Online" na sidebar

**PC 2:**
1. Instalar app e configurar mesmo `.env` (mesmo Supabase)
2. Abrir app
3. Aguardar pull automático
4. Confirmar que os dados do PC 1 aparecem

---

## Rollback

Se uma versão com bug for publicada:

1. Acesse GitHub Releases
2. Faça o download do `.exe` da versão anterior
3. Execute no PC afetado (o instalador NSIS substitui a versão atual)
4. Os dados em `%APPDATA%` são preservados

> Ou use o backup automático: **Backup → Restaurar** o backup anterior ao problema.

---

## Auditoria de riscos de produção

| Risco | Mitigação |
|-------|-----------|
| Perda de dados | Backup automático (a cada abertura/fechamento) + Supabase sync |
| PC com falha | Restaurar backup manual ou via sync |
| Update quebra app | Rollback com instalador anterior; dados preservados |
| SmartScreen bloqueia | Normal — app sem assinatura de código; clicar "Mais informações" |
| Supabase fora do ar | App funciona 100% offline; sync enfileira e tenta depois |
| OneDrive bloqueia build | Usar `npm run dist:local` (saída fora do OneDrive) |
