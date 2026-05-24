# Checklist de Segurança — Central de Pagamentos

> Use este checklist para evitar pagamentos errados ou duplicados.

---

## ANTES DE IMPORTAR A LISTA

- [ ] A lista veio do canal/contato certo do cliente?
- [ ] O valor total da lista bate com o PIX recebido?
- [ ] Não há mensagens antigas ou duplicadas na seleção copiada?

---

## APÓS IMPORTAR — REVISAR CADA LINHA

Para cada pagamento na pré-visualização:

- [ ] **Nome do favorecido** está correto e completo?
- [ ] **CPF/CNPJ** bate com o nome?
- [ ] **Chave PIX** é o tipo certo (CPF, CNPJ, celular, e-mail, aleatória)?
- [ ] Se for conta bancária: banco, agência e conta conferidos?
- [ ] **Valor** está correto? Não há vírgula ou ponto errado?
- [ ] Nenhuma linha duplicada (mesmo nome + mesmo valor)?

> Linhas com ⚠ amarelo têm dado faltando — não importe até corrigir.

---

## ANTES DE PAGAR (no banco ou celular)

Para cada favorecido:

- [ ] Nome na tela do banco bate com o favorecido no app?
- [ ] Valor na tela do banco bate com o valor no app?
- [ ] Chave PIX / conta bancária correta?
- [ ] Você está pagando para a pessoa certa, não para um homônimo?

---

## ANTES DE CONCLUIR A OPERAÇÃO

- [ ] Todos os pagamentos estão marcados como **Pago**?
- [ ] Todos os comprovantes estão marcados como **Enviado**?
- [ ] O saldo da operação está em R$ 0,00 ou positivo?
- [ ] Não há alertas 🔴 ou 🟡 pendentes?
- [ ] O cliente foi informado de que os pagamentos foram realizados?

---

## SINAIS DE ALERTA — O que fazer

| Alerta | Causa provável | O que fazer |
|--------|---------------|-------------|
| 🔴 Saldo negativo | Total pago > valor recebido | Revise os valores antes de pagar |
| 🟡 Possível duplicidade | Dois pagamentos iguais | Confirme com o cliente antes de pagar |
| 🟡 Comprovantes faltando | Comprovante não enviado | Envie e marque no app |
| ⚠ Linha na importação | Dado faltando ou inválido | Edite ou remova e cadastre manualmente |

---

## DICAS GERAIS

- **Nunca pague com saldo negativo** — confira o resumo da operação antes de iniciar os pagamentos
- **Se tiver dúvida sobre um favorecido**, pause e confirme com o cliente antes de pagar
- **Pagamento errado?** Entre em contato com o banco imediatamente — o app registra o histórico mas não reverte pagamentos bancários
- **Faça um backup manual antes de operações grandes**: Backup → Exportar backup JSON
