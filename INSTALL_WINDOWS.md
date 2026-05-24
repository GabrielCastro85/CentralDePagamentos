# Instalação no Windows — Central de Pagamentos

---

## Instalação (primeira vez)

1. Baixe o arquivo `Central-de-Pagamentos-Setup-x.x.x.exe`
2. Clique duas vezes no instalador
3. Se o Windows Defender bloquear: clique em **Mais informações** → **Executar assim mesmo**
4. Siga o assistente de instalação (Next → Install → Finish)
5. O app abre automaticamente após a instalação
6. Um ícone é criado na Área de Trabalho e no Menu Iniciar

> O app não precisa de internet para funcionar — funciona 100% offline.

---

## Onde ficam os dados

Todos os dados ficam em:

```
%APPDATA%\central-de-pagamentos\
```

Para abrir essa pasta, pressione **Win + R**, cole o caminho acima e tecle Enter.

| Item | Caminho |
|------|---------|
| Banco de dados | `%APPDATA%\central-de-pagamentos\central-de-pagamentos.sqlite` |
| Backups automáticos | `%APPDATA%\central-de-pagamentos\backups\` |
| Logs de erros | `%APPDATA%\central-de-pagamentos\logs\` |
| Exportações | `%APPDATA%\central-de-pagamentos\exports\` |

> Não mova ou renomeie esses arquivos enquanto o app estiver aberto.

---

## Atualizar para uma nova versão

1. Baixe o novo instalador
2. **Feche o app** antes de instalar
3. Execute o instalador — ele substitui a versão anterior automaticamente
4. Seus dados são preservados (ficam em `%APPDATA%`, separados do app)

> Recomendado: faça um backup manual antes de atualizar.
> No app: **Backup → Exportar backup JSON**

---

## Migrar para outro computador

### No computador antigo:

1. Abra o app
2. Vá em **Backup → Exportar backup JSON**
3. Salve o arquivo em um pendrive ou pasta compartilhada
4. Feche o app

### No computador novo:

1. Instale o app normalmente (veja seção "Instalação")
2. Abra o app
3. Vá em **Backup → Importar backup JSON**
4. Selecione o arquivo exportado do computador antigo
5. Confirme a restauração

> Restaurar um backup substitui todos os dados do computador novo. Faça isso antes de criar qualquer dado novo.

---

## Usar em mais de um computador ao mesmo tempo

Para compartilhar dados entre computadores em tempo real, configure a **Sincronização via Supabase**.

Veja o guia: `SYNC_GUIDE.md`

---

## Desinstalar

1. Vá em **Configurações do Windows → Aplicativos**
2. Procure "Central de Pagamentos"
3. Clique em **Desinstalar**

> Os dados em `%APPDATA%\central-de-pagamentos\` **não são apagados** na desinstalação.
> Se quiser apagar tudo, exclua essa pasta manualmente.

---

## Problemas comuns na instalação

| Problema | Solução |
|----------|---------|
| Windows bloqueou o instalador | Clique em "Mais informações" → "Executar assim mesmo" |
| App abre e fecha imediatamente | Verifique os logs em `%APPDATA%\central-de-pagamentos\logs\app.log` |
| Tela preta ao abrir | Feche e abra novamente; se persistir, reinstale |
| "Já existe uma instância em execução" | Verifique o Gerenciador de Tarefas e encerre o processo `Central de Pagamentos.exe` |
