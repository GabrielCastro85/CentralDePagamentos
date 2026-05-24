# Manual do Usuário — Central de Pagamentos

> Versão 1.0 · Uso interno

---

## O que é este app?

O **Central de Pagamentos** é um software para controlar as saídas de dinheiro realizadas pela corretora/exportadora.

**Fluxo básico:**
1. Um cliente envia um PIX para a empresa
2. Você cria uma **operação** registrando esse valor recebido
3. Você lança ou importa a lista de quem precisa receber pagamento
4. Confere, paga no banco/celular, e marca como pago no app
5. Envia os comprovantes e marca como enviados
6. Conclui a operação quando tudo estiver resolvido

---

## 1. Cadastrar empresa / conta

Empresas são as contas bancárias que a corretora usa para fazer pagamentos.

**Passos:**
1. Clique em **Empresas / Contas** no menu lateral
2. Preencha pelo menos o **Apelido** (ex.: "Conta BB Principal")
3. Preencha CNPJ, banco, agência e conta se quiser
4. Clique em **Criar**

> Você pode ter várias empresas (ex.: uma para cada banco). Use **Apelido** para identificar facilmente.

---

## 2. Cadastrar cliente

Clientes são quem manda o PIX para a corretora (fazendeiros, cooperativas, etc.).

**Passos:**
1. Clique em **Clientes** no menu lateral
2. Preencha o **Nome curto** (ex.: "João da Fazenda")
3. Preencha razão social, grupo WhatsApp e observações se quiser
4. Clique em **Criar**

---

## 3. Criar uma operação

Operação representa um recebimento de PIX e os pagamentos que saem dele.

**Passos:**
1. Clique em **Operações** no menu lateral (ou no botão "Nova operação" no canto superior direito)
2. Preencha:
   - **Data**: data do recebimento do PIX
   - **Cliente**: quem enviou o PIX
   - **Empresa/CNPJ**: qual conta recebeu
   - **Valor recebido**: o valor do PIX
3. Clique em **Nova operação**
4. O app abre automaticamente o detalhe da operação criada

> O código da operação (ex.: OP0001) é gerado automaticamente.

---

## 4. Adicionar pagamento manualmente

**Passos:**
1. Dentro da operação, clique em **Novo pagamento**
2. Preencha:
   - **Data**: data prevista/realizada do pagamento
   - **Valor**: quanto vai pagar
   - **Favorecido**: nome de quem vai receber
   - **CPF/CNPJ**: documento do favorecido
   - **Tipo**: PIX ou Conta bancária
   - **Chave PIX** ou dados bancários conforme o tipo
3. Clique em **Salvar pagamento**

---

## 5. Importar lista do WhatsApp

Quando o cliente manda a lista de pagamentos pelo WhatsApp, você pode importar de uma vez.

**Passos:**
1. No detalhe da operação, clique em **Importar lista**
2. Abra o WhatsApp no celular ou no computador
3. Copie as mensagens com a lista (selecione todas e copie)
4. Cole no campo de texto do app
5. Clique em **Detectar pagamentos**
6. Confira a pré-visualização (veja a seção 6)
7. Clique em **Importar** quando estiver tudo correto

> O app reconhece CPF, CNPJ, chave PIX, agência, conta, banco e valor automaticamente.

---

## 6. Revisar importação

Antes de importar, confira cada linha na pré-visualização:

- Linhas com o ícone ⚠ amarelo precisam de revisão (dados incompletos)
- Você pode editar qualquer campo diretamente na tabela
- Você pode remover linhas com o botão 🗑 vermelho
- O botão **Importar** só fica ativo quando todas as linhas têm favorecido e valor

**O que conferir:**
- Nome do favorecido correto?
- Chave PIX ou dados bancários corretos?
- Valor correto?
- Tipo (PIX ou Conta) correto?

---

## 7. Marcar pagamento como pago

Depois de realizar o pagamento no banco ou celular:

1. Na tabela de pagamentos, localize o favorecido
2. Clique no ✓ verde (coluna Ações) para marcar como **Pago**

Ou abra o pagamento e marque o toggle **Pago**.

> O saldo da operação é recalculado automaticamente.

---

## 8. Marcar comprovante enviado

Depois de enviar o comprovante para o favorecido:

1. Com o pagamento marcado como Pago, clique no ✉ (ícone de envio)
2. O comprovante fica marcado como **Enviado**

> Só é possível marcar o comprovante como enviado depois que o pagamento estiver pago.

---

## 9. Concluir operação

Quando todos os pagamentos foram feitos e os comprovantes enviados:

1. No detalhe da operação, clique em **Concluir operação**
2. Confira o resumo (valor recebido, total pago, saldo, pendências)
3. Clique em **Confirmar conclusão**

> A operação sai do Dashboard Operacional e vai para o Histórico.

---

## 10. Reabrir operação

Se uma operação foi concluída por engano:

1. Vá em **Operações** ou no detalhe da operação
2. Clique em **Reabrir**
3. Confirme

> A operação volta para **Em andamento** e pode ser editada normalmente.

---

## 11. Consultar histórico

O Histórico mostra todas as operações, incluindo as concluídas.

**Como filtrar:**
1. Clique em **Histórico** no menu lateral
2. Use os filtros: período, cliente, empresa, status
3. Clique em **Aplicar filtros**
4. Para voltar ao estado original, clique em **Limpar**

Você também pode exportar o relatório em CSV clicando em **Exportar relatório**.

---

## 12. Exportar backup

Backup salva todos os dados em um arquivo JSON que pode ser restaurado.

**Backup manual:**
1. Clique em **Backup** no menu lateral
2. Clique em **Exportar backup JSON**
3. Escolha onde salvar o arquivo

**Backup automático:**
O app gera um backup automaticamente toda vez que é aberto e fechado.
Os backups automáticos ficam em:
```
%APPDATA%\central-de-pagamentos\backups\
```

---

## 13. Restaurar backup

1. Clique em **Backup** no menu lateral
2. Para restaurar um backup automático: localize na tabela e clique em **Restaurar** (seta circular)
3. Para restaurar um arquivo externo: clique em **Importar backup JSON** e escolha o arquivo

> ⚠ Restaurar um backup substitui **todos os dados atuais**. Só faça isso se necessário.

---

## 14. Sincronização

A sincronização permite usar o app em mais de um computador.

O app funciona **offline** mesmo sem sincronização. Se você configurar o Supabase (nas Configurações), os dados são enviados automaticamente quando há conexão.

Veja mais detalhes no arquivo `SYNC_GUIDE.md`.

---

## 15. O que fazer se der erro

### App mostra mensagem de erro vermelha
- Leia a mensagem e corrija o que for pedido
- Se não entender, anote a mensagem e entre em contato com suporte

### App abre mas fica tela preta
- Feche o app e abra novamente
- Se persistir, reinstale a versão mais recente

### Dados sumiram
- Verifique se o backup automático está ativo
- Acesse **Backup** e restaure o backup mais recente

### Importação do WhatsApp detectou erros
- Revise as linhas marcadas com ⚠
- Edite manualmente os campos incorretos
- Se não conseguir corrigir, remova a linha e cadastre manualmente

---

## Referência rápida — Status de operação

| Status | Significado |
|--------|------------|
| Aguardando lista | Operação criada, sem pagamentos ainda |
| Em andamento | Há pagamentos ainda não pagos |
| Aguardando comprovantes | Todos pagos, mas faltam comprovantes |
| Concluída | Tudo pago e comprovantes enviados |

## Referência rápida — Alertas

| Alerta | O que fazer |
|--------|-------------|
| 🔴 Saldo negativo | O total pago ultrapassou o valor recebido |
| 🟡 Pagamentos pendentes | Ainda há favorecidos a pagar |
| 🟡 Comprovantes faltando | Pagamentos sem comprovante enviado |
| 🟡 Possível duplicidade | Dois pagamentos idênticos detectados |
