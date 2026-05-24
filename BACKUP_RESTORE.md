# Backup e Restauração — Central de Pagamentos

---

## Como o backup funciona

O app salva **dois tipos** de backup:

| Tipo | Quando acontece | Onde fica |
|------|----------------|-----------|
| **Automático** | Ao abrir e ao fechar o app | `%APPDATA%\central-de-pagamentos\backups\` |
| **Manual** | Quando você clica em "Exportar backup JSON" | Pasta que você escolher |

Os backups automáticos ficam no formato `backup-YYYY-MM-DD-HH-mm.json`.
O app mantém os **últimos 30 backups** automáticos — os mais antigos são apagados sozinhos.

---

## Fazer backup manual

1. Clique em **Backup** no menu lateral
2. Clique em **Exportar backup JSON**
3. Escolha onde salvar o arquivo
4. Guarde em um local seguro (pendrive, nuvem, pasta compartilhada)

> Recomendado antes de: atualizar o app, migrar de computador, fazer uma operação grande.

---

## Ver os backups automáticos

1. Clique em **Backup** no menu lateral
2. A tabela mostra todos os backups automáticos com data e tamanho
3. Os mais recentes aparecem no topo

---

## Restaurar um backup automático

1. Clique em **Backup** no menu lateral
2. Na tabela, localize o backup desejado
3. Clique no ícone de seta circular (↺) na coluna Ações
4. Confirme a restauração

> Restaurar substitui **todos os dados atuais**. O app recarrega automaticamente.

---

## Restaurar um arquivo de backup externo

1. Clique em **Backup** no menu lateral
2. Clique em **Importar backup JSON**
3. Selecione o arquivo `.json` do backup
4. Confirme a restauração

---

## Apagar um backup automático antigo

1. Na tabela de backups, clique no ícone de lixeira (🗑) do backup
2. Confirme a exclusão

---

## O que o backup contém

O arquivo JSON exportado contém:
- Todas as empresas/contas cadastradas
- Todos os clientes cadastrados
- Todas as operações (abertas e concluídas)
- Todos os pagamentos e seus status
- Configurações do app

O backup **não contém** logs de auditoria nem logs de erro do sistema.

---

## Acessar a pasta de backups automáticos

Pressione **Win + R** e cole:

```
%APPDATA%\central-de-pagamentos\backups
```

---

## Desativar o backup automático

1. Vá em **Configurações** no menu lateral
2. Desmarque **Backup automático ao abrir e fechar o app**
3. Clique em **Salvar configurações**

> Não recomendado. O backup automático é a principal proteção contra perda de dados.

---

## Boas práticas

- Faça backup manual antes de atualizar o app
- Guarde pelo menos um backup em local externo (pendrive ou nuvem)
- Teste a restauração pelo menos uma vez para saber que o processo funciona
- Se usar sincronização Supabase, os dados também ficam na nuvem (redundância extra)
