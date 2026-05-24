# Release Checklist — Central de Pagamentos

> Para desenvolvedores. Execute antes de publicar uma nova versão.

---

## 1. Código

- [ ] Todos os testes passando: `npm test` (63 testes do parser)
- [ ] Sem erros no console de desenvolvimento (`npm run dev`)
- [ ] Sem warnings críticos do React ou Electron
- [ ] Branch `main` atualizada, sem commits pendentes para merge
- [ ] `package.json` com a versão atualizada (ex.: `"version": "1.2.0"`)

---

## 2. Configurações de build

- [ ] `vite.config.js` tem `base: './'` (obrigatório para Electron file://)
- [ ] Ícone do app existe em `build-assets/app-icon.ico` e `build-assets/app-icon.png`
- [ ] `electron-builder.json` (ou seção `build` no `package.json`) com configurações corretas
- [ ] `productName` configurado corretamente (ex.: "Central de Pagamentos")

---

## 3. Build e empacotamento

```bash
# 1. Compilar o React
npm run build

# 2. Gerar instalador fora do OneDrive
npx electron-builder --win nsis --config.directories.output="C:\Temp\central-build"
```

- [ ] `npm run build` terminou sem erros
- [ ] `dist/renderer/index.html` usa caminhos relativos (`./assets/...`, não `/assets/...`)
- [ ] electron-builder terminou sem erros
- [ ] Instalador gerado em `C:\Temp\central-build\` (ou pasta equivalente fora do OneDrive)

---

## 4. Teste do instalador

- [ ] Instalar em uma máquina limpa (ou desinstalar versão anterior antes)
- [ ] App abre sem tela preta
- [ ] App abre sem erros no log (`%APPDATA%\central-de-pagamentos\logs\app.log`)
- [ ] Criar uma operação de teste → funciona?
- [ ] Importar lista do WhatsApp → funciona?
- [ ] Marcar pagamento como pago → status da operação atualiza?
- [ ] Backup automático criado em `%APPDATA%\central-de-pagamentos\backups\`?
- [ ] Backup manual (exportar JSON) → funciona?
- [ ] Restaurar backup → funciona?

---

## 5. Verificação de regressão

- [ ] Dashboard operacional carrega?
- [ ] Histórico com filtros funciona?
- [ ] Configurações salvas persistem após reiniciar o app?
- [ ] Navegação entre todas as abas funciona (Operacional, Histórico, Operações, Empresas, Clientes, Backup, Sincronização, Diagnóstico, Configurações)?
- [ ] Botão "Reabrir operação" aparece em operações concluídas?
- [ ] Busca nas tabelas filtra corretamente?

---

## 6. Documentação

- [ ] `README.md` atualizado com a nova versão e mudanças relevantes
- [ ] `MANUAL_USUARIO.md` reflete novas funcionalidades (se houver)
- [ ] `RELEASE_CHECKLIST.md` este arquivo está atualizado

---

## 7. Publicação

- [ ] Arquivo `.exe` renomeado com a versão: `Central-de-Pagamentos-Setup-1.2.0.exe`
- [ ] Arquivo copiado para o local de distribuição (pasta compartilhada, servidor, etc.)
- [ ] Se usar feed de atualização automática: `update-feed.json` atualizado com nova versão e URL de download
- [ ] Usuários notificados da nova versão

---

## Notas de build

**Por que não usar `npm run dist`?**
O script `dist` usa o caminho padrão de saída, que costuma ficar dentro do projeto no OneDrive. O OneDrive bloqueia o arquivo `app.asar` durante o empacotamento, causando erro. Use sempre a flag `--config.directories.output` apontando para fora do OneDrive.

**Por que `base: './'` no Vite?**
Sem essa configuração, o Vite gera caminhos absolutos (`/assets/...`) no `index.html`. O Electron carrega a interface via protocolo `file://`, que não entende caminhos absolutos — resulta em tela preta. O `base: './'` gera caminhos relativos (`./assets/...`) que funcionam corretamente.
