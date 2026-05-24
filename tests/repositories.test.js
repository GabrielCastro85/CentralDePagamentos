import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const { runMigrations } = require('../electron/database.cjs')
const { createRepositories } = require('../electron/repositories.cjs')

function setup() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  const repo = createRepositories(db)
  const empresa = repo.saveEmpresa({ apelido: 'Conta Matriz', cnpj: '12345678000195', ativo: true })
  const cliente = repo.saveCliente({ nomeCurto: 'Cliente A', ativo: true })
  const operacao = repo.saveOperacao({
    data: '2026-05-23',
    clienteId: cliente.id,
    empresaId: empresa.id,
    valorRecebido: 1000,
    status: 'EM_ANDAMENTO',
  })
  return { repo, empresa, cliente, operacao }
}

describe('regras da Central de Pagamentos', () => {
  it('calcula saldo usando apenas pagamentos pagos', () => {
    const { repo, operacao } = setup()
    repo.savePagamento({ operacaoId: operacao.id, data: '2026-05-23', favorecido: 'Fornecedor 1', chavePix: 'fornecedor1@email.com', valor: 300, pago: true })
    repo.savePagamento({ operacaoId: operacao.id, data: '2026-05-23', favorecido: 'Fornecedor 2', chavePix: 'fornecedor2@email.com', valor: 200, pago: false })

    const updated = repo.getOperacao(operacao.id)

    expect(updated.totalPago).toBe(300)
    expect(updated.saldo).toBe(700)
    expect(updated.pagamentosPendentes).toBe(1)
  })

  it('alerta saldo negativo sem bloquear', () => {
    const { repo, operacao } = setup()
    repo.savePagamento({ operacaoId: operacao.id, data: '2026-05-23', favorecido: 'Fornecedor 1', chavePix: 'fornecedor1@email.com', valor: 1100, pago: true })

    const updated = repo.getOperacao(operacao.id)

    expect(updated.saldo).toBe(-100)
    expect(updated.alertaSaldoNegativo).toBe(true)
  })

  it('alerta possível duplicidade por favorecido, valor e documento ou chave', () => {
    const { repo, operacao } = setup()
    repo.savePagamento({ operacaoId: operacao.id, data: '2026-05-23', favorecido: 'João Café', chavePix: 'joao.cafe@email.com', valor: 150 })
    repo.savePagamento({ operacaoId: operacao.id, data: '2026-05-23', favorecido: 'João Café', chavePix: 'joao.cafe@email.com', valor: 150 })

    const pagamentos = repo.listPagamentos(operacao.id)

    expect(pagamentos.every((pagamento) => pagamento.alertaDuplicidade)).toBe(true)
  })

  it('impede comprovante enviado antes do pagamento', () => {
    const { repo, operacao } = setup()

    expect(() => repo.savePagamento({
      operacaoId: operacao.id,
      data: '2026-05-23',
      favorecido: 'Fornecedor',
      chavePix: 'fornecedor@email.com',
      valor: 50,
      pago: false,
      comprovanteEnviado: true,
    })).toThrow('comprovante')
  })

  it('remove operação concluída do dashboard operacional', () => {
    const { repo, operacao } = setup()
    repo.saveOperacao({ ...operacao, status: 'CONCLUIDA' })

    const dashboard = repo.getOperationalDashboard()

    expect(dashboard.operacoes).toHaveLength(0)
  })

  it('edita pagamento existente mesmo quando o valor vem formatado em BRL', () => {
    const { repo, operacao } = setup()
    const pagamento = repo.savePagamento({
      operacaoId: operacao.id,
      data: '2026-05-23',
      favorecido: 'Fornecedor',
      chavePix: 'fornecedor@email.com',
      valor: 2500,
      pago: true,
      comprovanteEnviado: true,
    })

    const updated = repo.savePagamento({
      ...pagamento,
      favorecido: 'Fornecedor Editado',
      valor: 'R$ 3.750,50',
      comprovanteEnviado: false,
    })

    expect(updated.favorecido).toBe('Fornecedor Editado')
    expect(updated.valor).toBe(3750.5)
    expect(updated.comprovanteEnviado).toBe(false)
    expect(repo.getOperacao(operacao.id).totalPago).toBe(3750.5)
  })

  it('registra alterações locais na fila de sincronização', () => {
    const { repo } = setup()

    const empresa = repo.saveEmpresa({ apelido: 'Conta Sync', ativo: true })
    const queue = repo.listSyncQueue({ limit: 100 })

    expect(empresa.uuid).toBeTruthy()
    expect(repo.getSyncStatus().pending).toBeGreaterThan(0)
    expect(queue.some((item) => item.entity === 'empresas' && item.entityId === empresa.id && item.action === 'CREATE')).toBe(true)
  })
})
