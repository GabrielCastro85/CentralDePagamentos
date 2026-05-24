# Central de Pagamentos

App desktop Windows para controle operacional de pagamentos em corretoras e exportadoras de café.

## O que faz

- Cria operações vinculando cliente, empresa/conta e valor recebido
- Cadastra pagamentos individualmente ou importa lista do WhatsApp
- Acompanha status de pagamento e envio de comprovante por favorecido
- Calcula saldo automaticamente (recebido − pago) e alerta saldo negativo
- Detecta duplicidades por favorecido + valor + CPF/chave
- Dashboard operacional em tempo real e histórico com filtros
- Backup automático ao abrir/fechar + exportação manual JSON e CSV
- Sincronização online via Supabase (opcional, offline-first)
- Trilha de auditoria e diagnóstico do sistema

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron 38 |
| Interface | React 19 + Vite 8 |
| Banco local | SQLite (node:sqlite / better-sqlite3 fallback) |
| Testes | Vitest 4 (63 casos) |
| Build | electron-builder 26 + NSIS |

## Como rodar em desenvolvimento

```bash
npm install
npm run dev     # Vite + Electron em paralelo
```

## Testes

```bash
npm test        # 63 testes do parser WhatsApp
```

## Como gerar o instalador Windows

```bash
npm run build   # Compila React para dist/

# Gerar .exe em pasta FORA do OneDrive (evita bloqueio do app.asar)
npx electron-builder --win nsis --config.directories.output="C:\Temp\central-build"
```

> **Nota:** Não use `npm run dist` se a pasta do projeto estiver no OneDrive —
> o OneDrive bloqueia o `app.asar` durante o empacotamento.

## Arquivos importantes

```
electron/
  main.cjs           — Processo principal (IPC, backup, sync, janela)
  repositories.cjs   — Toda lógica de banco de dados
  database.cjs       — Conexão SQLite e migrações de schema

src/
  App.jsx            — Interface React (arquivo único de UI)
  App.css            — Estilos globais
  whatsappParser.js  — Parser de listas do WhatsApp

tests/
  parser.test.js     — 63 testes do parser

vite.config.js       — base: './' obrigatório para funcionar no Electron
```

## Onde ficam os dados (produção)

| Item | Caminho |
|------|---------|
| Banco SQLite | `%APPDATA%\central-de-pagamentos\central-de-pagamentos.sqlite` |
| Backups automáticos | `%APPDATA%\central-de-pagamentos\backups\` |
| Logs | `%APPDATA%\central-de-pagamentos\logs\` |

## Documentação do usuário

| Arquivo | Conteúdo |
|---------|----------|
| `MANUAL_USUARIO.md` | Manual completo passo a passo |
| `GUIA_RAPIDO.md` | Rotina diária em formato checklist |
| `CHECKLIST_SEGURANCA.md` | O que conferir antes de pagar |
| `INSTALL_WINDOWS.md` | Instalação, atualização e migração |
| `BACKUP_RESTORE.md` | Backup manual, automático e restauração |
| `SYNC_GUIDE.md` | Como funciona a sincronização online |
| `RELEASE_CHECKLIST.md` | Checklist antes de publicar nova versão |
