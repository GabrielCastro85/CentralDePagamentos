import { parseWhatsappPayments } from './whatsappParser.js'
import logoHorizontalWhite from './assets/brand/logo-horizontal-white.svg'
import logoSymbol from './assets/brand/logo-symbol.svg'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
  Banknote,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  DatabaseBackup,
  Download,
  Eye,
  FileDown,
  HelpCircle,
  History,
  Hourglass,
  Info,
  ListChecks,
  LayoutDashboard,
  Paperclip,
  Receipt,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Send,
  Trash2,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'

const api = {
  invoke(action, payload) {
    if (!window.centralApi) {
      throw new Error('Abra o app pelo Electron para acessar o banco SQLite local.')
    }
    return window.centralApi.invoke(action, payload)
  },
}

const today = new Date().toISOString().slice(0, 10)

const operationStatuses = [
  ['AGUARDANDO_LISTA', 'Aguardando lista'],
  ['EM_ANDAMENTO', 'Em andamento'],
  ['AGUARDANDO_COMPROVANTES', 'Aguardando comprovantes'],
  ['CONCLUIDA', 'Concluída'],
]

const tabs = [
  ['operacional', LayoutDashboard, 'Operacional'],
  ['historico', History, 'Histórico'],
  ['operacoes', WalletCards, 'Operações'],
  ['contas', Receipt, 'Contas a Pagar'],
  ['relatorio', BarChart2, 'Relatórios'],
  ['empresas', Building2, 'Empresas / Contas'],
  ['clientes', Users, 'Clientes'],
  ['backup', DatabaseBackup, 'Backup'],
  ['sincronizacao', RefreshCw, 'Sincronização'],
  ['diagnostico', ListChecks, 'Diagnóstico'],
  ['configuracoes', Settings, 'Configurações'],
]

const emptyEmpresa = {
  apelido: '',
  razaoSocial: '',
  cnpj: '',
  banco: '',
  agencia: '',
  conta: '',
  ativo: true,
}

const emptyCliente = {
  nomeCurto: '',
  razaoSocial: '',
  grupoWhatsapp: '',
  observacoes: '',
  ativo: true,
  destaque: false,
}

const emptyOperacao = {
  data: today,
  clienteId: '',
  empresaId: '',
  valorRecebido: '',
  status: 'AGUARDANDO_LISTA',
  observacao: '',
}

const emptyPagamento = {
  data: today,
  favorecido: '',
  documento: '',
  tipoPagamento: 'PIX',
  chavePix: '',
  banco: '',
  agencia: '',
  tipoConta: 'NAO_INFORMADO',
  conta: '',
  digito: '',
  valor: '',
  pago: false,
  comprovanteEnviado: false,
  observacao: '',
}

const emptyContaForm = {
  descricao: '',
  valor: '',
  vencimento: '',
  categoria: '',
  observacao: '',
}

function App() {
  const [activeTab, setActiveTab] = useState('operacional')
  const [state, setState] = useState({
    empresas: [],
    clientes: [],
    operacoes: [],
    operacional: null,
    historico: null,
  })
  const [selectedOperationId, setSelectedOperationId] = useState(null)
  const [pagamentos, setPagamentos] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [historicalFilters, setHistoricalFilters] = useState({})
  const [loading, setLoading] = useState(true)
  const [config, setConfigState] = useState({ nomeEmpresa: 'Central de Pagamentos', diasAlertaComprovante: '3', backupAutomatico: '1', updateFeedUrl: '' })
  const [lastBackup, setLastBackup] = useState(null)
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', pending: 0, errors: 0, configured: false })
  const [syncQueue, setSyncQueue] = useState([])
  const [diagnostics, setDiagnostics] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [helpOpen, setHelpOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('...')
  const [updateState, setUpdateState] = useState(null)
  const [contas, setContas] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [novaOpModalTrigger, setNovaOpModalTrigger] = useState(0)

  async function loadContas() {
    try {
      const data = await api.invoke('contas:list', { incluirPagas: true })
      setContas(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadAll(filters = historicalFilters) {
    setLoading(true)
    try {
      const [empresas, clientes, operacoes, operacional, historico] = await Promise.all([
        api.invoke('empresas:list'),
        api.invoke('clientes:list'),
        api.invoke('operacoes:list'),
        api.invoke('dashboard:operacional'),
        api.invoke('dashboard:historico', filters),
      ])
      setState({ empresas, clientes, operacoes, operacional, historico })
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadPagamentos(operacaoId = selectedOperationId) {
    if (!operacaoId) {
      setPagamentos([])
      return
    }
    setPagamentos(await api.invoke('pagamentos:list', { operacaoId }))
  }

  async function loadLastBackup() {
    try {
      const backups = await api.invoke('backup:list')
      setLastBackup(backups[0] || null)
    } catch {
      setLastBackup(null)
    }
  }

  async function loadSyncStatus() {
    try {
      const [status, queue] = await Promise.all([
        api.invoke('sync:status'),
        api.invoke('sync:queue'),
      ])
      setSyncStatus(status)
      setSyncQueue(queue)
    } catch {
      setSyncStatus((current) => ({ ...current, state: 'error', lastError: 'Não foi possível carregar o status da sincronização.' }))
    }
  }

  async function loadDiagnostics() {
    try {
      const [status, audit] = await Promise.all([
        api.invoke('diagnostics:status'),
        api.invoke('audit:list', { limit: 100 }),
      ])
      setDiagnostics(status)
      setAuditLogs(audit)
    } catch (err) {
      setError(err.message)
    }
  }

  async function refreshAfterChange() {
    await loadAll()
    await loadPagamentos()
    await loadLastBackup()
    await loadSyncStatus()
  }

  useEffect(() => {
    loadAll()
    loadLastBackup()
    loadSyncStatus()
    loadContas()
    api.invoke('config:get').then(setConfigState).catch(() => {})
    api.invoke('app:version').then(setAppVersion).catch(() => {})
    const timer = setInterval(loadSyncStatus, 30_000)
    // Escuta eventos push do auto-updater (electron-updater)
    const cleanupUpdater = window.centralApi?.onUpdaterEvent?.((event) => setUpdateState(event))
    return () => {
      clearInterval(timer)
      cleanupUpdater?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleGlobalError() {
      setError('Erro inesperado na interface. A ação foi interrompida com segurança.')
    }
    function handleRejection(event) {
      setError(event.reason?.message || 'Erro inesperado na interface. A ação foi interrompida com segurança.')
    }
    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  useEffect(() => {
    loadPagamentos(selectedOperationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOperationId])

  useEffect(() => {
    if (activeTab === 'diagnostico') loadDiagnostics()
    if (activeTab === 'contas') loadContas()
  }, [activeTab])

  const selectedOperation = useMemo(
    () => state.operacoes.find((op) => op.id === selectedOperationId),
    [state.operacoes, selectedOperationId],
  )

  async function runAction(fn, successMessage) {
    try {
      await fn()
      setMessage(successMessage)
      setError('')
      await refreshAfterChange()
    } catch (err) {
      setError(err.message)
    }
  }

  function requestConfirm(config) {
    setModal(config)
  }

  async function syncNow() {
    setSyncStatus((current) => ({ ...current, state: 'syncing' }))
    const result = await api.invoke('sync:now')
    setSyncStatus(result)
    await loadSyncStatus()
    await refreshAfterChange()
  }

  return (
    <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <aside className={`sidebar${sidebarOpen ? '' : ' collapsed'}`}>
        <div className="sidebar-top">
          <div className="brand">
            <img src={logoSymbol} alt="" className="brand-symbol" />
            <div className="brand-text">
              <strong>Central de Pagamentos</strong>
              <span>Corretora / Exportadora de café</span>
            </div>
          </div>
          <button
            className="sidebar-collapse-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        <nav className="nav-list">
          {tabs.map(([id, Icon, label]) => (
            <button
              key={id}
              className={activeTab === id ? 'active' : ''}
              onClick={() => setActiveTab(id)}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon size={18} />
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>

        {sidebarOpen ? (
          <div className="sidebar-footer">
            <div className="sync-status">
              <span className={`status-dot ${syncTone(syncStatus)}`}></span>
              <div>
                <strong>Dados</strong>
                <span>{syncLabel(syncStatus)}</span>
              </div>
            </div>
            <div className="sidebar-meta">
              <span>Local: <strong>Banco de dados local</strong></span>
              <span>Último backup: <strong>{lastBackup ? formatDateTime(new Date(lastBackup.createdAt)) : '—'}</strong></span>
              <span>Pendências: <strong>{syncStatus.pending || 0}</strong></span>
              <button className="sidebar-sync-button" onClick={syncNow} disabled={syncStatus.state === 'syncing'}>
                <RefreshCw size={14} />Sincronizar agora
              </button>
            </div>
          </div>
        ) : (
          <div className="sidebar-footer-mini">
            <span
              className={`status-dot ${syncTone(syncStatus)}`}
              title={`Dados: ${syncLabel(syncStatus)}${syncStatus.pending ? ` (${syncStatus.pending} pendência${syncStatus.pending > 1 ? 's' : ''})` : ''}`}
            />
          </div>
        )}
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Controle interno</span>
            <h1>{pageTitle(activeTab)}</h1>
            <p>{pageSubtitle(activeTab)}</p>
          </div>
          <div className="top-actions">
            <div className="date-pill">
              <Calendar size={16} />
              <span>{formatDateTime(new Date())}</span>
              <RefreshCw size={15} />
            </div>
            <button className="ghost icon-only" title="Ajuda" onClick={() => setHelpOpen(true)}>
              <HelpCircle size={18} />
            </button>
            <button className="primary" onClick={() => { setActiveTab('operacoes'); setNovaOpModalTrigger((t) => t + 1) }}>
              <Plus size={16} /> Nova operação
            </button>
          </div>
        </header>

        {message && <Toast type="success" text={message} onClose={() => setMessage('')} />}
        {error && <Toast type="danger" text={error} onClose={() => setError('')} />}
        {loading && <div className="loading">Carregando dados...</div>}

        {activeTab === 'operacional' && (
          <OperationalDashboard
            data={state.operacional}
            onOpen={setSelectedOperationId}
            goOperations={() => setActiveTab('operacoes')}
            goHistorico={() => setActiveTab('historico')}
            contasHoje={contas.filter((c) => !c.pago && c.vencimento === today)}
            contasVencidas={contas.filter((c) => !c.pago && c.vencimento && c.vencimento < today)}
            goContas={() => setActiveTab('contas')}
          />
        )}
        {activeTab === 'historico' && (
          <HistoricalDashboard
            data={state.historico}
            filters={historicalFilters}
            setFilters={setHistoricalFilters}
            empresas={state.empresas}
            clientes={state.clientes}
            onApply={() => loadAll(historicalFilters)}
            runAction={runAction}
            onOpen={(id) => { setSelectedOperationId(id); setActiveTab('operacoes') }}
          />
        )}
        {activeTab === 'empresas' && <EmpresasPage empresas={state.empresas} runAction={runAction} requestConfirm={requestConfirm} />}
        {activeTab === 'clientes' && <ClientesPage clientes={state.clientes} runAction={runAction} requestConfirm={requestConfirm} />}
        {activeTab === 'contas' && <ContasPage contas={contas} onRefresh={loadContas} runAction={runAction} requestConfirm={requestConfirm} />}
        {activeTab === 'relatorio' && <RelatorioPage clientes={state.clientes} />}
        {activeTab === 'operacoes' && (
          <OperacoesPage
            empresas={state.empresas}
            clientes={state.clientes}
            operacoes={state.operacoes}
            selectedOperation={selectedOperation}
            selectedOperationId={selectedOperationId}
            setSelectedOperationId={setSelectedOperationId}
            pagamentos={pagamentos}
            runAction={runAction}
            requestConfirm={requestConfirm}
            novaOpModalTrigger={novaOpModalTrigger}
          />
        )}
        {activeTab === 'backup' && <BackupPage runAction={runAction} requestConfirm={requestConfirm} />}
        {activeTab === 'sincronizacao' && <SyncPage status={syncStatus} queue={syncQueue} onSync={syncNow} onRefresh={loadSyncStatus} />}
        {activeTab === 'diagnostico' && <DiagnosticsPage diagnostics={diagnostics} auditLogs={auditLogs} onRefresh={loadDiagnostics} runAction={runAction} />}
        {activeTab === 'configuracoes' && (
          <ConfigPage
            config={config}
            onSave={async (next) => {
              await runAction(async () => { const saved = await api.invoke('config:set', next); setConfigState(saved) }, 'Configurações salvas.')
            }}
            updateState={updateState}
            setUpdateState={setUpdateState}
          />
        )}

        <footer className="app-footer">
          <span>Central de Pagamentos</span>
          <span>Versão {appVersion}</span>
          <span>Todos os direitos reservados</span>
        </footer>
      </main>

      {modal && <ConfirmModal modal={modal} onClose={() => setModal(null)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

function OperationalDashboard({ data, onOpen, goOperations, goHistorico, contasHoje = [], contasVencidas = [], goContas }) {
  const cards = data?.cards || {}
  const operacoes = data?.operacoes || []
  const [search, setSearch] = useState('')
  const filtered = search
    ? operacoes.filter((op) =>
        [op.codigo, op.clienteNome, op.empresaApelido].some((v) =>
          String(v || '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : operacoes

  const totalContasHoje = contasHoje.reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalContasVencidas = contasVencidas.reduce((s, c) => s + Number(c.valor || 0), 0)

  return (
    <section className="stack">
      <div className="card-grid six">
        <Metric icon={WalletCards} tone="teal" title="Recebido em aberto" value={brl(cards.recebidoEmAberto)} subtext={`${cards.operacoesAbertas || 0} operação`} />
        <Metric icon={CheckCircle2} tone="green" title="Pago em abertas" value={brl(cards.pagoEmAberto)} subtext={`${cards.operacoesAbertas || 0} operação`} />
        <Metric icon={BadgeDollarSign} tone="strong" title="Saldo sob responsabilidade" value={brl(cards.saldoSobResponsabilidade)} subtext="Valor ainda sob controle" />
        <Metric icon={Banknote} tone="blue" title="Operações abertas" value={cards.operacoesAbertas || 0} subtext={`de ${Math.max(cards.operacoesAbertas || 0, 1)} total`} />
        <Metric icon={Hourglass} tone="yellow" title="Pagamentos pendentes" value={cards.pagamentosPendentes || 0} subtext="Aguardando execução" />
        <Metric icon={Paperclip} tone="purple" title="Comprovantes pendentes" value={cards.comprovantesPendentes || 0} subtext="Aguardando envio" />
      </div>

      {(contasVencidas.length > 0 || contasHoje.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contasVencidas.length > 0 && (
            <div className="panel" style={{ borderColor: 'rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.06)', padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AlertTriangle size={20} style={{ color: '#f87171', flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#fecaca', display: 'block', fontSize: 14 }}>
                      {contasVencidas.length === 1 ? '1 conta em atraso' : `${contasVencidas.length} contas em atraso`}
                      {' '}— {brl(totalContasVencidas)}
                    </strong>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {contasVencidas.map((c) => c.descricao).slice(0, 3).join(' · ')}
                      {contasVencidas.length > 3 ? ` · +${contasVencidas.length - 3} mais` : ''}
                    </span>
                  </div>
                </div>
                <button onClick={goContas} style={{ flexShrink: 0 }}>
                  <Receipt size={16} />Ver contas
                </button>
              </div>
            </div>
          )}
          {contasHoje.length > 0 && (
            <div className="panel" style={{ borderColor: 'rgba(250,204,21,0.42)', background: 'rgba(250,204,21,0.05)', padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Bell size={20} style={{ color: 'var(--yellow)', flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#fde68a', display: 'block', fontSize: 14 }}>
                      {contasHoje.length === 1 ? '1 conta vence hoje' : `${contasHoje.length} contas vencem hoje`}
                      {' '}— {brl(totalContasHoje)}
                    </strong>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {contasHoje.map((c) => c.descricao).slice(0, 3).join(' · ')}
                      {contasHoje.length > 3 ? ` · +${contasHoje.length - 3} mais` : ''}
                    </span>
                  </div>
                </div>
                <button onClick={goContas} style={{ flexShrink: 0 }}>
                  <Receipt size={16} />Ver contas
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Panel
        title="Operações abertas"
        action={<TableToolbar placeholder="Buscar operação..." search={search} onSearch={setSearch} />}
      >
        <OperationsTable operacoes={filtered} onOpen={onOpen} goOperations={goOperations} compactActions />
      </Panel>

      <OperationalInsights operacoes={operacoes} cards={cards} onGoHistorico={goHistorico} onGoOperacoes={goOperations} />
    </section>
  )
}

function HistoricalDashboard({ data, filters, setFilters, empresas, clientes, onApply, runAction, onOpen }) {
  const cards = data?.cards || {}
  return (
    <section className="stack">
      <Panel title="Filtros" action={<button onClick={() => runAction(() => api.invoke('reports:csv'), 'Relatório CSV exportado.')}><FileDown size={16} />Exportar relatório</button>}>
        <div className="form-grid six">
          <Input label="Período inicial" type="date" value={filters.startDate || ''} onChange={(startDate) => setFilters({ ...filters, startDate })} />
          <Input label="Período final" type="date" value={filters.endDate || ''} onChange={(endDate) => setFilters({ ...filters, endDate })} />
          <Select label="Cliente" value={filters.clienteId || ''} onChange={(clienteId) => setFilters({ ...filters, clienteId })} options={clientes.map((c) => [c.id, c.nomeCurto])} />
          <Select label="Empresa" value={filters.empresaId || ''} onChange={(empresaId) => setFilters({ ...filters, empresaId })} options={empresas.map((e) => [e.id, e.apelido])} />
          <Select label="Status" value={filters.status || ''} onChange={(status) => setFilters({ ...filters, status })} options={operationStatuses} />
          <Input label="Buscar" value={filters.query || ''} onChange={(query) => setFilters({ ...filters, query })} placeholder="Buscar por código, cliente..." />
        </div>
        <div className="filter-actions">
          <button className="primary" onClick={onApply}><Check size={16} />Aplicar filtros</button>
          <button className="ghost" onClick={() => setFilters({})}>Limpar</button>
        </div>
      </Panel>

      <div className="card-grid five">
        <Metric icon={WalletCards} tone="teal" title="Total recebido" value={brl(cards.totalRecebido)} subtext="No período filtrado" />
        <Metric icon={CheckCircle2} tone="green" title="Total pago" value={brl(cards.totalPago)} subtext="Pagamentos pagos" />
        <Metric icon={BadgeDollarSign} tone="strong" title="Sobra total" value={brl(cards.sobraTotal)} subtext="Diferença acumulada" />
        <Metric icon={Banknote} tone="blue" title="Operações" value={cards.quantidadeOperacoes || 0} subtext="Registros encontrados" />
        <Metric icon={Paperclip} tone="purple" title="Pagamentos" value={cards.quantidadePagamentos || 0} subtext="Itens lançados" />
      </div>

      <div className="split">
        <SummaryTable title="Resumo por cliente" rows={data?.porCliente || []} />
        <SummaryTable title="Resumo por empresa/CNPJ" rows={data?.porEmpresa || []} />
      </div>

      <Panel title="Lista de operações">
        <OperationsTable operacoes={data?.operacoes || []} onOpen={onOpen} />
      </Panel>
    </section>
  )
}

function EmpresasPage({ empresas, runAction, requestConfirm }) {
  const [form, setForm] = useState(emptyEmpresa)
  const editing = Boolean(form.id)

  async function submit(event) {
    event.preventDefault()
    await runAction(async () => {
      await api.invoke('empresas:save', form)
      setForm(emptyEmpresa)
    }, editing ? 'Empresa atualizada.' : 'Empresa criada.')
  }

  return (
    <CrudPanel
      title={editing ? 'Editar empresa / conta' : 'Nova empresa / conta'}
      form={
        <form onSubmit={submit} className="stack">
          <div className="form-grid three">
            <Input label="Apelido" value={form.apelido} onChange={(apelido) => setForm({ ...form, apelido })} required />
            <Input label="Razão social" value={form.razaoSocial} onChange={(razaoSocial) => setForm({ ...form, razaoSocial })} />
            <Input label="CNPJ" value={formatCpfCnpj(form.cnpj)} onChange={(cnpj) => setForm({ ...form, cnpj })} />
            <Input label="Banco" value={form.banco} onChange={(banco) => setForm({ ...form, banco })} />
            <Input label="Agência" value={form.agencia} onChange={(agencia) => setForm({ ...form, agencia })} />
            <Input label="Conta" value={form.conta} onChange={(conta) => setForm({ ...form, conta })} />
          </div>
          <Toggle label="Ativo" checked={form.ativo} onChange={(ativo) => setForm({ ...form, ativo })} />
          <FormActions editing={editing} onCancel={() => setForm(emptyEmpresa)} />
        </form>
      }
      table={
        <table>
          <thead><tr><th>Apelido</th><th>Razão social</th><th>CNPJ</th><th>Banco</th><th>Agência</th><th>Conta</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {empresas.length === 0 && (
              <tr><td colSpan="8"><EmptyState title="Nenhuma empresa cadastrada." text="Crie uma empresa ou conta para começar a registrar operações." /></td></tr>
            )}
            {empresas.map((empresa) => (
              <tr key={empresa.id}>
                <td>{empresa.apelido}</td>
                <td>{empresa.razaoSocial}</td>
                <td>{formatCpfCnpj(empresa.cnpj)}</td>
                <td>{empresa.banco}</td>
                <td>{empresa.agencia}</td>
                <td>{empresa.conta}</td>
                <td><StatusBadge label={empresa.ativo ? 'Ativo' : 'Inativo'} tone={empresa.ativo ? 'ok' : 'neutral'} /></td>
                <td className="table-actions">
                  <button className="icon-button" title="Editar" onClick={() => setForm(empresa)}><Pencil size={16} /></button>
                  <button className="icon-button danger" title="Excluir" onClick={() => requestConfirm({
                    tone: 'danger',
                    title: `Excluir ${empresa.apelido}?`,
                    text: 'Esta ação não pode ser desfeita. Confirme apenas se esta empresa não será mais utilizada.',
                    confirmLabel: 'Excluir empresa',
                    onConfirm: () => runAction(() => api.invoke('empresas:delete', { id: empresa.id }), 'Empresa excluída.'),
                  })}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}

function ClientesPage({ clientes, runAction, requestConfirm }) {
  const [form, setForm] = useState(emptyCliente)
  const editing = Boolean(form.id)

  async function submit(event) {
    event.preventDefault()
    await runAction(async () => {
      await api.invoke('clientes:save', form)
      setForm(emptyCliente)
    }, editing ? 'Cliente atualizado.' : 'Cliente criado.')
  }

  return (
    <CrudPanel
      title={editing ? 'Editar cliente' : 'Novo cliente'}
      form={
        <form onSubmit={submit} className="stack">
          <div className="form-grid two">
            <Input label="Nome curto" value={form.nomeCurto} onChange={(nomeCurto) => setForm({ ...form, nomeCurto })} required />
            <Input label="Razão social" value={form.razaoSocial} onChange={(razaoSocial) => setForm({ ...form, razaoSocial })} />
            <Input label="Grupo WhatsApp" value={form.grupoWhatsapp} onChange={(grupoWhatsapp) => setForm({ ...form, grupoWhatsapp })} />
            <Input label="Observações" value={form.observacoes} onChange={(observacoes) => setForm({ ...form, observacoes })} />
          </div>
          <div className="toggle-row">
            <Toggle label="Ativo" checked={form.ativo} onChange={(ativo) => setForm({ ...form, ativo })} />
            <Toggle label="⭐ Destacar transações deste cliente" checked={form.destaque} onChange={(destaque) => setForm({ ...form, destaque })} />
          </div>
          <FormActions editing={editing} onCancel={() => setForm(emptyCliente)} />
        </form>
      }
      table={
        <table>
          <thead><tr><th>Nome curto</th><th>Razão social</th><th>Grupo WhatsApp</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {clientes.length === 0 && (
              <tr><td colSpan="5"><EmptyState title="Nenhum cliente cadastrado." text="Cadastre clientes para criar operações vinculadas." /></td></tr>
            )}
            {clientes.map((cliente) => (
              <tr key={cliente.id} style={cliente.destaque ? { background: 'linear-gradient(90deg, rgba(250,204,21,0.10) 0%, transparent 100%)', borderLeft: '3px solid #eab308' } : {}}>
                <td>{cliente.nomeCurto}{cliente.destaque && <span title="Transações destacadas" style={{ marginLeft: 6 }}>⭐</span>}</td>
                <td>{cliente.razaoSocial}</td>
                <td>{cliente.grupoWhatsapp}</td>
                <td><StatusBadge label={cliente.ativo ? 'Ativo' : 'Inativo'} tone={cliente.ativo ? 'ok' : 'neutral'} /></td>
                <td className="table-actions">
                  <button className="icon-button" title="Editar" onClick={() => setForm(cliente)}><Pencil size={16} /></button>
                  <button className="icon-button danger" title="Excluir" onClick={() => requestConfirm({
                    tone: 'danger',
                    title: `Excluir ${cliente.nomeCurto}?`,
                    text: 'Esta ação não pode ser desfeita. Confirme apenas se este cliente não será mais utilizado.',
                    confirmLabel: 'Excluir cliente',
                    onConfirm: () => runAction(() => api.invoke('clientes:delete', { id: cliente.id }), 'Cliente excluído.'),
                  })}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    />
  )
}

function OperacoesPage({ empresas, clientes, operacoes, selectedOperation, selectedOperationId, setSelectedOperationId, pagamentos, runAction, requestConfirm, novaOpModalTrigger }) {
  const [form, setForm] = useState(emptyOperacao)
  const [newOpModal, setNewOpModal] = useState(false)
  const [paymentModal, setPaymentModal] = useState(null)
  const [importModal, setImportModal] = useState(null)
  const editing = Boolean(form.id)

  useEffect(() => {
    if (novaOpModalTrigger > 0) {
      setForm(emptyOperacao)
      setNewOpModal(true)
    }
  }, [novaOpModalTrigger])

  async function submitOperation(event) {
    event.preventDefault()
    await runAction(async () => {
      const saved = await api.invoke('operacoes:save', form)
      setForm(emptyOperacao)
      setNewOpModal(false)
      setSelectedOperationId(saved.id)
    }, editing ? 'Operação atualizada.' : 'Operação criada.')
  }

  async function concludeOperation(op) {
    requestConfirm({
      tone: 'success',
      title: `Concluir operação ${op.codigo}`,
      text: 'Ao concluir esta operação, ela será movida para o histórico. Confira o resumo antes de confirmar.',
      confirmLabel: 'Confirmar conclusão',
      summary: [
        ['Valor recebido', brl(op.valorRecebido)],
        ['Total pago', brl(op.totalPago)],
        ['Saldo final', brl(op.saldo)],
        ['Pagamentos pendentes', op.pagamentosPendentes],
        ['Comprovantes pendentes', op.comprovantesPendentes],
      ],
      onConfirm: () => runAction(() => api.invoke('operacoes:save', { ...op, status: 'CONCLUIDA' }), 'Operação concluída.'),
    })
  }

  async function reopenOperation(op) {
    requestConfirm({
      tone: 'success',
      title: `Reabrir operação ${op.codigo}?`,
      text: 'A operação voltará para Em andamento e poderá ser editada normalmente.',
      confirmLabel: 'Reabrir operação',
      onConfirm: () => runAction(() => api.invoke('operacoes:reopen', { id: op.id }), 'Operação reaberta.'),
    })
  }

  async function savePayment(paymentForm) {
    if (!selectedOperationId) return
    const duplicate = findSimilarPayment(paymentForm, pagamentos)
    if (duplicate) {
      requestConfirm({
        tone: 'warn',
        title: 'Pagamento muito parecido já existe',
        text: 'Encontramos um pagamento semelhante nesta operação. A duplicidade não será bloqueada, mas precisa de confirmação.',
        confirmLabel: 'Salvar mesmo assim',
        summary: [
          ['Favorecido existente', duplicate.favorecido],
          ['Valor existente', brl(duplicate.valor)],
          ['Documento/chave', duplicate.documento || duplicate.chavePix || '—'],
        ],
        onConfirm: () => persistPayment(paymentForm),
      })
      return
    }
    await persistPayment(paymentForm)
  }

  async function persistPayment(paymentForm) {
    await runAction(async () => {
      await api.invoke('pagamentos:save', { ...paymentForm, operacaoId: selectedOperationId })
      setPaymentModal(null)
    }, paymentForm.id ? 'Pagamento atualizado.' : 'Pagamento criado.')
  }

  function openPaymentModal(payment = null) {
    setPaymentModal(payment ? { ...payment } : { ...emptyPagamento })
  }

  function duplicatePayment(payment) {
    const copy = { ...payment }
    delete copy.id
    delete copy.createdAt
    delete copy.updatedAt
    delete copy.alertaDuplicidade
    setPaymentModal({ ...copy, sourcePaymentId: payment.id, favorecido: `${payment.favorecido} (cópia)` })
  }

  function openImportModal() {
    setImportModal({ text: '', rows: [] })
  }

  async function importPayments(rows) {
    if (!selectedOperationId || rows.length === 0) return
    const total = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0)
    const reviewCount = rows.filter((row) => row._needsReview).length
    requestConfirm({
      tone: reviewCount ? 'warn' : 'success',
      title: 'Confirmar importação da lista?',
      text: reviewCount
        ? 'Existem itens marcados para revisão. Confira a prévia antes de confirmar a importação.'
        : 'A prévia foi revisada. Confirme para lançar os pagamentos nesta operação.',
      confirmLabel: 'Confirmar importação',
      summary: [
        ['Quantidade', rows.length],
        ['Total financeiro', brl(total)],
        ['Itens para revisão', reviewCount],
      ],
      onConfirm: () => runAction(async () => {
        const erros = []
        let salvos = 0
        for (const row of rows) {
          try {
            await api.invoke('pagamentos:save', {
              ...emptyPagamento,
              ...row,
              operacaoId: selectedOperationId,
              _import: true,
            })
            salvos++
          } catch (err) {
            erros.push(`${row.favorecido}: ${err.message}`)
          }
        }
        setImportModal(null)
        if (salvos === 0) throw new Error(`Nenhum pagamento importado. ${erros[0] || 'Erro desconhecido.'}`)
        if (erros.length > 0) throw new Error(`${salvos} importado(s), ${erros.length} com erro: ${erros.join(' | ')}`)
      }, `${rows.length} pagamento${rows.length > 1 ? 's' : ''} importado${rows.length > 1 ? 's' : ''}.`),
    })
  }

  if (selectedOperation) {
    return (
      <>
        <OperationDetail
          operacao={selectedOperation}
          pagamentos={pagamentos}
          onBack={() => setSelectedOperationId(null)}
          onNewPayment={() => openPaymentModal()}
          onImportList={openImportModal}
          onEditPayment={openPaymentModal}
          onDuplicatePayment={duplicatePayment}
          runAction={runAction}
          requestConfirm={requestConfirm}
          concludeOperation={concludeOperation}
          reopenOperation={reopenOperation}
        />
        {paymentModal && (
          <PaymentModal
            payment={paymentModal}
            onChange={setPaymentModal}
            onClose={() => setPaymentModal(null)}
            onSave={savePayment}
          />
        )}
        {importModal && (
          <ImportListModal
            state={importModal}
            onChange={setImportModal}
            onClose={() => setImportModal(null)}
            onConfirm={importPayments}
          />
        )}
        {newOpModal && (
          <NovaOperacaoModal
            form={form}
            onChange={setForm}
            empresas={empresas}
            clientes={clientes}
            editing={editing}
            onClose={() => { setNewOpModal(false); setForm(emptyOperacao) }}
            onSave={submitOperation}
          />
        )}
      </>
    )
  }

  return (
    <section className="stack">
      <Panel
        title="Operações"
        action={
          <button className="primary" onClick={() => { setForm(emptyOperacao); setNewOpModal(true) }}>
            <Plus size={16} />Nova operação
          </button>
        }
      >
        <OperationsTable
          operacoes={operacoes}
          onOpen={(id) => setSelectedOperationId(id)}
          extraActions={(op) => (
            <>
              <button className="icon-button" title="Visualizar" onClick={() => setSelectedOperationId(op.id)}><Eye size={16} /></button>
              <button className="icon-button" title="Editar" onClick={() => { setForm(op); setNewOpModal(true) }}><Pencil size={16} /></button>
              {op.status !== 'CONCLUIDA' && <button className="success" onClick={() => concludeOperation(op)}><Check size={15} />Concluir operação</button>}
              {op.status === 'CONCLUIDA' && <button className="ghost" onClick={() => reopenOperation(op)}><RotateCcw size={15} />Reabrir</button>}
              <button className="icon-button danger" title="Excluir" onClick={() => requestConfirm({
                tone: 'danger',
                title: `Excluir operação ${op.codigo}?`,
                text: 'Esta ação também remove os pagamentos vinculados e não pode ser desfeita.',
                confirmLabel: 'Excluir operação',
                onConfirm: () => runAction(() => api.invoke('operacoes:delete', { id: op.id }), 'Operação excluída.'),
              })}><Trash2 size={15} /></button>
            </>
          )}
        />
      </Panel>

      {newOpModal && (
        <NovaOperacaoModal
          form={form}
          onChange={setForm}
          empresas={empresas}
          clientes={clientes}
          editing={editing}
          onClose={() => { setNewOpModal(false); setForm(emptyOperacao) }}
          onSave={submitOperation}
        />
      )}
    </section>
  )
}

function NovaOperacaoModal({ form, onChange, empresas, clientes, editing, onClose, onSave }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card payment-modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-heading">
          <span className="modal-icon"><WalletCards size={24} /></span>
          <div>
            <h2>{editing ? 'Editar operação' : 'Nova operação'}</h2>
            <p>{editing ? 'Atualize os dados desta operação.' : 'Preencha os dados para registrar uma nova operação.'}</p>
          </div>
        </div>
        <form onSubmit={onSave} className="payment-modal-form">
          <div className="form-grid two">
            <Input label="Data" type="date" value={form.data} onChange={(data) => onChange({ ...form, data })} required />
            <Select
              label="Cliente"
              value={form.clienteId}
              onChange={(clienteId) => onChange({ ...form, clienteId })}
              options={clientes.filter((c) => c.ativo).map((c) => [c.id, c.nomeCurto])}
              required
            />
            <Select
              label="Empresa / CNPJ"
              value={form.empresaId}
              onChange={(empresaId) => onChange({ ...form, empresaId })}
              options={empresas.filter((e) => e.ativo).map((e) => [e.id, `${e.apelido}${e.cnpj ? ` — ${formatCpfCnpj(e.cnpj)}` : ''}`])}
              required
            />
            <CurrencyInput label="Valor recebido" value={form.valorRecebido} onChange={(valorRecebido) => onChange({ ...form, valorRecebido })} required />
            {editing && (
              <Select label="Status" value={form.status} onChange={(status) => onChange({ ...form, status })} options={operationStatuses} />
            )}
          </div>
          <Input label="Observação" value={form.observacao || ''} onChange={(observacao) => onChange({ ...form, observacao })} />
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
            <button className="primary" type="submit">
              <Save size={16} />{editing ? 'Salvar operação' : 'Criar operação'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function OperationDetail({ operacao, pagamentos, onBack, onNewPayment, onImportList, onEditPayment, onDuplicatePayment, runAction, requestConfirm, concludeOperation, reopenOperation }) {
  const [search, setSearch] = useState('')
  const alerts = operationAlerts(operacao, pagamentos)
  const filteredPagamentos = search
    ? pagamentos.filter((p) =>
        [p.favorecido, p.documento, p.chavePix, p.banco].some((v) =>
          String(v || '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : pagamentos
  return (
    <section className="stack">
      <div className="detail-hero">
        <button className="text-action" onClick={onBack}><ArrowLeft size={16} />Voltar para operações</button>
        <div className="detail-header">
          <div>
            <span className="eyebrow">Controle interno</span>
            <h1>Operação {operacao.codigo}</h1>
            <p>{operacao.clienteNome} • {operacao.empresaApelido} • {formatDate(operacao.data)}</p>
          </div>
          <div className="detail-actions">
            <StatusBadge label={statusLabel(operacao.status)} tone={statusTone(operacao.status)} />
            <button onClick={onNewPayment}><Plus size={16} />Novo pagamento</button>
            {operacao.status !== 'CONCLUIDA' && <button className="primary" onClick={() => concludeOperation(operacao)}><Check size={16} />Concluir operação</button>}
            {operacao.status === 'CONCLUIDA' && <button className="ghost" onClick={() => reopenOperation(operacao)}><RotateCcw size={16} />Reabrir operação</button>}
          </div>
        </div>
        <div className="detail-meta-grid">
          <InfoTile label="Cliente" value={operacao.clienteNome} />
          <InfoTile label="Empresa" value={operacao.empresaApelido} />
          <InfoTile label="CNPJ" value={formatCpfCnpj(operacao.empresaCnpj)} />
          <InfoTile label="Status" value={statusLabel(operacao.status)} />
        </div>
        {operacao.clienteDestaque && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(250,204,21,0.12)', border: '1px solid #eab308', color: '#a16207', fontWeight: 600, fontSize: 13 }}>
            ⭐ Operação do cliente destacado: {operacao.clienteNome}
          </div>
        )}
        {alerts.length > 0 && (
          <div className="detail-alert-strip">
            {alerts.map((alert) => <Alert key={alert} label={alert} tone="warn" />)}
          </div>
        )}
      </div>

      <div className="card-grid five">
        <Metric icon={WalletCards} tone="teal" title="Valor recebido" value={brl(operacao.valorRecebido)} subtext="PIX recebido" />
        <Metric icon={CheckCircle2} tone="green" title="Total pago" value={brl(operacao.totalPago)} subtext="Pagamentos pagos" />
        <Metric icon={BadgeDollarSign} tone={operacao.saldo < 0 ? 'yellow' : 'strong'} title="Saldo restante" value={brl(operacao.saldo)} subtext="Recebido - pago" />
        <Metric icon={Hourglass} tone="yellow" title="Pagamentos pendentes" value={operacao.pagamentosPendentes} subtext="Ainda não pagos" />
        <Metric icon={Paperclip} tone="purple" title="Comprovantes pendentes" value={operacao.comprovantesPendentes} subtext="Pagos sem comprovante" />
      </div>

      <Panel title="Pagamentos desta operação" action={<PaymentsToolbar onNewPayment={onNewPayment} onImportList={onImportList} search={search} onSearch={setSearch} />}>
        <PaymentsTable
          pagamentos={filteredPagamentos}
          onEditPayment={onEditPayment}
          onDuplicatePayment={onDuplicatePayment}
          runAction={runAction}
          requestConfirm={requestConfirm}
        />
        <div className="detail-totals">
          <span>Total pago: <strong>{brl(operacao.totalPago)}</strong></span>
          <span>Saldo restante: <strong className={operacao.saldo < 0 ? 'negative' : 'teal-text'}>{brl(operacao.saldo)}</strong></span>
        </div>
      </Panel>
    </section>
  )
}

function PaymentsToolbar({ onNewPayment, onImportList, search, onSearch }) {
  return (
    <div className="table-toolbar">
      <button className="primary" onClick={onNewPayment}><Plus size={16} />Novo pagamento</button>
      <button className="ghost" onClick={onImportList}><Upload size={16} />Importar lista</button>
      <label className="search-box">
        <Search size={16} />
        <input placeholder="Buscar pagamento..." value={search || ''} onChange={(e) => onSearch?.(e.target.value)} />
      </label>
    </div>
  )
}

function PaymentsTable({ pagamentos, onEditPayment, onDuplicatePayment, runAction, requestConfirm }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Favorecido</th><th>CPF/CNPJ</th><th>Tipo</th><th>Chave PIX / Conta</th><th>Banco</th><th className="money">Valor</th><th>Pago</th><th>Comprovante</th><th>Observação</th><th>Ações</th></tr></thead>
        <tbody>
          {pagamentos.length === 0 && (
            <tr>
              <td colSpan="10"><EmptyState title="Nenhum pagamento lançado" text="Use o botão Novo pagamento para registrar o primeiro favorecido desta operação." /></td>
            </tr>
          )}
          {pagamentos.map((pagamento) => (
            <tr key={pagamento.id}>
              <td>{pagamento.favorecido}</td>
              <td>{formatCpfCnpj(pagamento.documento)}</td>
              <td><StatusBadge label={pagamento.tipoPagamento === 'PIX' ? 'PIX' : 'Conta'} tone="info" /></td>
              <td>{paymentDestination(pagamento)}</td>
              <td>{pagamento.banco}</td>
              <td className="money teal-text">{brl(pagamento.valor)}</td>
              <td><StatusBadge label={pagamento.pago ? 'Pago' : 'Pendente'} tone={pagamento.pago ? 'ok' : 'warn'} /></td>
              <td><StatusBadge label={pagamento.comprovanteEnviado ? 'Enviado' : 'Pendente'} tone={pagamento.comprovanteEnviado ? 'ok' : 'purple'} /></td>
              <td>{pagamento.observacao}</td>
              <td className="table-actions">
                <button className="icon-button" title="Visualizar" onClick={() => onEditPayment(pagamento)}><Eye size={16} /></button>
                <button className="icon-button" title="Editar" onClick={() => onEditPayment(pagamento)}><Pencil size={16} /></button>
                <button className="icon-button" title="Duplicar" onClick={() => onDuplicatePayment(pagamento)}><Copy size={16} /></button>
                {!pagamento.pago && <button className="icon-button success" title="Marcar pago" onClick={() => runAction(() => api.invoke('pagamentos:flags', { id: pagamento.id, pago: true }), 'Pagamento marcado como pago.')}><Check size={15} /></button>}
                {pagamento.pago && !pagamento.comprovanteEnviado && <button className="icon-button" title="Comprovante enviado" onClick={() => runAction(() => api.invoke('pagamentos:flags', { id: pagamento.id, comprovanteEnviado: true }), 'Comprovante marcado como enviado.')}><Send size={15} /></button>}
                <button className="icon-button danger" title="Excluir" onClick={() => requestConfirm({
                  tone: 'danger',
                  title: `Excluir pagamento de ${pagamento.favorecido}?`,
                  text: 'Esta ação não pode ser desfeita e altera o saldo exibido na operação.',
                  confirmLabel: 'Excluir pagamento',
                  onConfirm: () => runAction(() => api.invoke('pagamentos:delete', { id: pagamento.id }), 'Pagamento excluído.'),
                })}><Trash2 size={15} /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ImportListModal({ state, onChange, onClose, onConfirm }) {
  const rows = state.rows || []
  const validRows = rows.filter((row) => row.favorecido && Number(row.valor) > 0)
  const reviewRows = rows.filter((row) => row._needsReview)
  const previewTotal = rows.reduce((sum, row) => sum + Number(row.valor || 0), 0)

  function updateText(text) {
    onChange({ ...state, text })
  }

  function detectRows() {
    onChange({ ...state, rows: parseWhatsappPayments(state.text) })
  }

  function updateRow(id, field, value) {
    onChange({
      ...state,
      rows: rows.map((row) => (row.importId === id ? { ...row, [field]: value } : row)),
    })
  }

  function removeRow(id) {
    onChange({ ...state, rows: rows.filter((row) => row.importId !== id) })
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card import-modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-heading">
          <span className="modal-icon"><Upload size={24} /></span>
          <div>
            <h2>Importar lista do WhatsApp</h2>
            <p>Cole a lista recebida, confira a prévia e importe os pagamentos para esta operação.</p>
          </div>
        </div>

        <div className="import-grid">
          <label className="field import-text">
            <span>Texto recebido</span>
            <textarea
              placeholder={'Ex:\nSERGIO CORREA MAIA\nPIX 04749598640\nVALOR 2500\n\nGERALDO MAGELI RIVA\nAG 142\nCC 6204747\nCPF 02288069767\nVALOR 17400\nBANESTES'}
              value={state.text}
              onChange={(event) => updateText(event.target.value)}
            />
          </label>
          <div className="import-help">
            <strong>O parser identifica</strong>
            <span>Nome, PIX, CPF/CNPJ, agência, conta, banco e valor.</span>
            <span>Texto bagunçado é aceito, mas confira a prévia antes de importar.</span>
            <button className="primary" type="button" onClick={detectRows}><Search size={16} />Detectar pagamentos</button>
          </div>
        </div>

        <div className="import-preview">
          <div className="import-preview-head">
            <strong>Pré-visualização</strong>
            <span>{rows.length} linha{rows.length === 1 ? '' : 's'} detectada{rows.length === 1 ? '' : 's'} • {brl(previewTotal)}</span>
          </div>
          {rows.length > 0 && (
            <div className="import-summary">
              <InfoTile label="Detectados" value={rows.length} />
              <InfoTile label="Total" value={brl(previewTotal)} />
              <InfoTile label="Para revisar" value={reviewRows.length} warn={reviewRows.length > 0} />
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Favorecido</th>
                  <th>CPF/CNPJ</th>
                  <th>Tipo</th>
                  <th>Chave / Conta</th>
                  <th>Banco</th>
                  <th className="money">Valor</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan="7"><EmptyState title="Nenhum pagamento detectado" text="Cole a lista e clique em Detectar pagamentos para gerar a prévia." /></td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.importId} className={row._needsReview ? 'row-needs-review' : ''}>
                    <td><input className="compact-input" value={row.favorecido} onChange={(event) => updateRow(row.importId, 'favorecido', event.target.value)} /></td>
                    <td><input className="compact-input" value={formatCpfCnpj(row.documento)} onChange={(event) => updateRow(row.importId, 'documento', event.target.value)} /></td>
                    <td>
                      <select className="compact-input" value={row.tipoPagamento} onChange={(event) => updateRow(row.importId, 'tipoPagamento', event.target.value)}>
                        <option value="PIX">PIX</option>
                        <option value="CONTA_BANCARIA">Conta</option>
                      </select>
                    </td>
                    <td>
                      {row.tipoPagamento === 'PIX' ? (
                        <input className="compact-input" value={row.chavePix} onChange={(event) => updateRow(row.importId, 'chavePix', event.target.value)} />
                      ) : (
                        <input className="compact-input" value={accountPreview(row)} onChange={(event) => updateRow(row.importId, 'conta', event.target.value)} />
                      )}
                    </td>
                    <td><input className="compact-input" value={row.banco} onChange={(event) => updateRow(row.importId, 'banco', event.target.value)} /></td>
                    <td><CurrencyInput label="" value={row.valor} onChange={(valor) => updateRow(row.importId, 'valor', valor)} /></td>
                    <td className="table-actions">
                      {row._needsReview && (
                        <span className="review-badge" title={(row._reviewReasons || []).join(' • ')}>
                          <AlertTriangle size={14} />
                        </span>
                      )}
                      <button className="icon-button danger" type="button" title="Remover" onClick={() => removeRow(row.importId)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && validRows.length !== rows.length && (
            <Alert label="Algumas linhas precisam de favorecido e valor antes de importar." tone="warn" />
          )}
        </div>

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={validRows.length === 0 || validRows.length !== rows.length} onClick={() => onConfirm(rows)}>
            <Upload size={16} />Importar {validRows.length || ''}
          </button>
        </div>
      </section>
    </div>
  )
}

function PaymentModal({ payment, onChange, onClose, onSave }) {
  const [formError, setFormError] = useState('')

  function update(field, value) {
    setFormError('')
    onChange({ ...payment, [field]: value })
  }

  function submit(event) {
    event.preventDefault()
    onSave(payment)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card payment-modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-heading">
          <span className="modal-icon"><WalletCards size={24} /></span>
          <div>
            <h2>{payment.id ? 'Editar pagamento' : 'Novo pagamento'}</h2>
            <p>Preencha os dados do favorecido e acompanhe pagamento e comprovante.</p>
          </div>
        </div>

        <form onSubmit={submit} className="payment-modal-form">
          <div className="form-grid two">
            <Input label="Data" type="date" value={payment.data} onChange={(data) => update('data', data)} required />
            <CurrencyInput label="Valor" value={payment.valor} onChange={(valor) => update('valor', valor)} required />
            <Input label="Favorecido" value={payment.favorecido} onChange={(favorecido) => update('favorecido', favorecido)} required />
            <Input label="CPF/CNPJ" value={formatCpfCnpj(payment.documento)} onChange={(documento) => update('documento', documento)} />
            <Select label="Tipo pagamento" value={payment.tipoPagamento} onChange={(tipoPagamento) => update('tipoPagamento', tipoPagamento)} options={[['PIX', 'PIX'], ['CONTA_BANCARIA', 'Conta bancária']]} />
            {payment.tipoPagamento === 'PIX' && <Input label="Chave PIX" value={payment.chavePix} onChange={(chavePix) => update('chavePix', chavePix)} />}
            {payment.tipoPagamento === 'CONTA_BANCARIA' && (
              <>
                <Input label="Banco" value={payment.banco} onChange={(banco) => update('banco', banco)} />
                <Input label="Agência" value={payment.agencia} onChange={(agencia) => update('agencia', agencia)} />
                <Select label="Tipo de conta" value={payment.tipoConta} onChange={(tipoConta) => update('tipoConta', tipoConta)} options={[['CORRENTE', 'Corrente'], ['POUPANCA', 'Poupança'], ['NAO_INFORMADO', 'Não informado']]} />
                <Input label="Conta" value={payment.conta} onChange={(conta) => update('conta', conta)} />
                <Input label="Dígito" value={payment.digito} onChange={(digito) => update('digito', digito)} />
              </>
            )}
          </div>
          <Input label="Observação" value={payment.observacao} onChange={(observacao) => update('observacao', observacao)} />
          <div className="toggle-row">
            <Toggle label="Pago" checked={payment.pago} onChange={(pago) => onChange({ ...payment, pago, comprovanteEnviado: pago ? payment.comprovanteEnviado : false })} />
            <Toggle label="Comprovante enviado" checked={payment.comprovanteEnviado} onChange={(comprovanteEnviado) => {
              if (!payment.pago && comprovanteEnviado) {
                setFormError('Marque o pagamento como pago antes de registrar o envio do comprovante.')
                return
              }
              update('comprovanteEnviado', comprovanteEnviado)
            }} />
          </div>
          {formError && <Alert label={formError} tone="warn" />}
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
            <button className="primary" type="submit"><Save size={16} />Salvar pagamento</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function InfoTile({ label, value, warn = false }) {
  return (
    <div className={`info-tile ${warn ? 'warn' : ''}`}>
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  )
}

function operationAlerts(operacao, pagamentos) {
  const alerts = []
  if (operacao.alertaSaldoNegativo) alerts.push('Saldo negativo')
  if (operacao.pagamentosPendentes > 0) alerts.push('Pagamentos pendentes')
  if (operacao.comprovantesPendentes > 0) alerts.push('Comprovantes faltando')
  if (pagamentos.some((pagamento) => pagamento.alertaDuplicidade)) alerts.push('Possível duplicidade')
  return alerts
}

function paymentDestination(payment) {
  if (payment.tipoPagamento === 'PIX') return payment.chavePix || '—'
  const parts = [
    payment.agencia ? `Ag ${payment.agencia}` : '',
    payment.conta ? `Conta ${payment.conta}${payment.digito ? `-${payment.digito}` : ''}` : '',
  ].filter(Boolean)
  return parts.join(' • ') || '—'
}

function accountPreview(payment) {
  return [
    payment.agencia ? `Ag ${payment.agencia}` : '',
    payment.conta ? `Conta ${payment.conta}${payment.digito ? `-${payment.digito}` : ''}` : '',
  ].filter(Boolean).join(' • ')
}


function ContasPage({ contas, onRefresh, runAction, requestConfirm }) {
  const [form, setForm] = useState(emptyContaForm)
  const [showModal, setShowModal] = useState(false)
  const [filterPago, setFilterPago] = useState('pendentes')
  const [search, setSearch] = useState('')
  const editing = Boolean(form.id)

  const todayStr = new Date().toISOString().slice(0, 10)

  const filtered = contas.filter((c) => {
    if (filterPago === 'pendentes' && c.pago) return false
    if (filterPago === 'pagas' && !c.pago) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.descricao?.toLowerCase().includes(q) && !c.categoria?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalPendente = contas.filter((c) => !c.pago).reduce((s, c) => s + Number(c.valor || 0), 0)
  const totalPago     = contas.filter((c) =>  c.pago).reduce((s, c) => s + Number(c.valor || 0), 0)
  const vencendoHoje  = contas.filter((c) => !c.pago && c.vencimento === todayStr).length

  function openAdd() {
    setForm({ ...emptyContaForm })
    setShowModal(true)
  }

  function openEdit(conta) {
    setForm({ ...conta })
    setShowModal(true)
  }

  async function submit(event) {
    event.preventDefault()
    await runAction(async () => {
      await api.invoke('contas:save', form)
      setShowModal(false)
      setForm(emptyContaForm)
      await onRefresh()
    }, editing ? 'Conta atualizada.' : 'Conta criada.')
  }

  async function handlePagar(conta) {
    await runAction(async () => {
      await api.invoke('contas:pagar', { id: conta.id, pago: !conta.pago })
      await onRefresh()
    }, conta.pago ? 'Conta desmarcada como paga.' : 'Conta marcada como paga.')
  }

  async function handleComprovante(conta) {
    try {
      const result = await api.invoke('contas:comprovante:salvar', { id: conta.id })
      if (!result?.canceled) await onRefresh()
    } catch { /* usuário cancelou */ }
  }

  async function handleAbrirComprovante(conta) {
    await api.invoke('contas:comprovante:abrir', { path: conta.comprovantePath })
  }

  return (
    <section className="stack">
      <div className="card-grid three">
        <Metric icon={Receipt}       tone="yellow" title="Contas pendentes" value={brl(totalPendente)} subtext={`${contas.filter((c) => !c.pago).length} conta(s)`} />
        <Metric icon={CheckCircle2}  tone="green"  title="Contas pagas"     value={brl(totalPago)}     subtext={`${contas.filter((c) =>  c.pago).length} conta(s)`} />
        <Metric icon={AlertTriangle} tone={vencendoHoje > 0 ? 'yellow' : 'neutral'} title="Vencem hoje" value={vencendoHoje} subtext={vencendoHoje > 0 ? 'Atenção!' : 'Nenhuma hoje'} />
      </div>

      <Panel
        title="Contas a Pagar"
        action={
          <div className="table-toolbar">
            <button className="primary" onClick={openAdd}><Plus size={16} />Nova conta</button>
            <select
              className="compact-input"
              value={filterPago}
              onChange={(e) => setFilterPago(e.target.value)}
            >
              <option value="todas">Todas</option>
              <option value="pendentes">Pendentes</option>
              <option value="pagas">Pagas</option>
            </select>
            <label className="search-box">
              <Search size={16} />
              <input placeholder="Buscar conta..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Categoria</th>
                <th className="money">Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Pago em</th>
                <th>Comprovante</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="8"><EmptyState title="Nenhuma conta encontrada" text="Adicione contas para controlar seus vencimentos e pagamentos." /></td></tr>
              )}
              {filtered.map((conta) => {
                const isVencida = !conta.pago && conta.vencimento && conta.vencimento < todayStr
                const isHoje    = !conta.pago && conta.vencimento === todayStr
                return (
                  <tr key={conta.id} className={isVencida ? 'row-needs-review' : ''}>
                    <td>
                      {conta.descricao}
                      {isVencida && <AlertTriangle size={13} title="Vencida"    style={{ color: 'var(--danger)', marginLeft: 6, verticalAlign: 'middle' }} />}
                      {isHoje    && <AlertTriangle size={13} title="Vence hoje" style={{ color: 'var(--yellow)', marginLeft: 6, verticalAlign: 'middle' }} />}
                    </td>
                    <td>{conta.categoria || '—'}</td>
                    <td className="money teal-text">{brl(conta.valor)}</td>
                    <td>{formatDate(conta.vencimento)}</td>
                    <td>
                      <StatusBadge
                        label={conta.pago ? 'Pago' : isVencida ? 'Vencida' : 'Pendente'}
                        tone={conta.pago ? 'ok' : isVencida ? 'danger' : 'warn'}
                      />
                    </td>
                    <td>{conta.pagoEm ? formatDate(conta.pagoEm) : '—'}</td>
                    <td>
                      {conta.comprovantePath
                        ? <button className="icon-button" title="Abrir comprovante" onClick={() => handleAbrirComprovante(conta)}><Paperclip size={15} /></button>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                    <td className="table-actions">
                      <button className="icon-button" title="Editar" onClick={() => openEdit(conta)}><Pencil size={16} /></button>
                      <button
                        className={`icon-button ${conta.pago ? '' : 'success'}`}
                        title={conta.pago ? 'Desmarcar pago' : 'Marcar como pago'}
                        onClick={() => handlePagar(conta)}
                      >
                        {conta.pago ? <RotateCcw size={15} /> : <Check size={15} />}
                      </button>
                      <button className="icon-button" title="Anexar comprovante" onClick={() => handleComprovante(conta)}>
                        <Paperclip size={15} />
                      </button>
                      <button className="icon-button danger" title="Excluir" onClick={() => requestConfirm({
                        tone: 'danger',
                        title: `Excluir "${conta.descricao}"?`,
                        text: 'Esta ação não pode ser desfeita.',
                        confirmLabel: 'Excluir conta',
                        onConfirm: () => runAction(async () => { await api.invoke('contas:delete', { id: conta.id }); await onRefresh() }, 'Conta excluída.'),
                      })}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {showModal && (
        <ContaModal
          form={form}
          onChange={setForm}
          onClose={() => { setShowModal(false); setForm(emptyContaForm) }}
          onSave={submit}
        />
      )}
    </section>
  )
}

function ContaModal({ form, onChange, onClose, onSave }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-heading">
          <span className="modal-icon"><Receipt size={24} /></span>
          <div>
            <h2>{form.id ? 'Editar conta' : 'Nova conta a pagar'}</h2>
            <p>Registre a despesa com vencimento e acompanhe o pagamento.</p>
          </div>
        </div>
        <form onSubmit={onSave} className="stack">
          <div className="form-grid two">
            <Input label="Descrição" value={form.descricao} onChange={(descricao) => onChange({ ...form, descricao })} required />
            <CurrencyInput label="Valor" value={form.valor} onChange={(valor) => onChange({ ...form, valor })} />
            <Input label="Vencimento" type="date" value={form.vencimento || ''} onChange={(vencimento) => onChange({ ...form, vencimento })} />
            <Input label="Categoria" value={form.categoria || ''} onChange={(categoria) => onChange({ ...form, categoria })} placeholder="Ex: Aluguel, Energia, Água..." />
          </div>
          <Input label="Observação" value={form.observacao || ''} onChange={(observacao) => onChange({ ...form, observacao })} />
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
            <button className="primary" type="submit"><Save size={16} />{form.id ? 'Salvar conta' : 'Criar conta'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function BackupPage({ runAction, requestConfirm }) {
  const [backups, setBackups] = useState([])

  async function loadBackups() {
    try {
      const list = await api.invoke('backup:list')
      setBackups(list)
    } catch { setBackups([]) }
  }

  useEffect(() => { loadBackups() }, [])

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <section className="stack">
      <Panel title="Backup e exportações">
        <div className="brand-strip">
          <img src={logoHorizontalWhite} alt="Central de Pagamentos" />
          <span>Dados locais protegidos para a rotina financeira.</span>
        </div>
        <div className="backup-grid">
          <ActionCard icon={Download} tone="teal" title="Exportar backup JSON" text="Gera um arquivo completo com empresas, clientes, operações e pagamentos." action="Exportar" onClick={() => runAction(() => api.invoke('backup:export'), 'Backup exportado.')} />
          <ActionCard icon={Upload} tone="teal" title="Importar backup JSON" text="Substitui os dados locais pelo conteúdo do backup selecionado." action="Importar" onClick={() => requestConfirm({
            tone: 'danger',
            title: 'Importar backup JSON?',
            text: 'Importar um backup substitui os dados atuais. Continue apenas se tiver certeza do arquivo selecionado.',
            confirmLabel: 'Importar backup',
            onConfirm: () => runAction(() => api.invoke('backup:import'), 'Backup importado.'),
          })} />
          <ActionCard icon={FileDown} tone="blue" title="Exportar relatório CSV" text="Gera relatório das operações e pagamentos para análise externa." action="Exportar" onClick={() => runAction(() => api.invoke('reports:csv'), 'Relatório CSV exportado.')} />
          <ActionCard icon={RotateCcw} tone="purple" title="Backups automáticos" text="Backups são gerados automaticamente ao abrir e fechar o aplicativo." action="Automático" disabled />
        </div>
      </Panel>

      <Panel title="Backups automáticos" action={<button className="ghost" onClick={loadBackups}><RefreshCw size={16} />Atualizar</button>}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Arquivo</th><th>Data</th><th>Tamanho</th><th>Ações</th></tr></thead>
            <tbody>
              {backups.length === 0 && (
                <tr><td colSpan="4"><EmptyState title="Nenhum backup encontrado" text="Os backups automáticos aparecerão aqui após abrir e fechar o aplicativo." /></td></tr>
              )}
              {backups.map((b) => (
                <tr key={b.filePath}>
                  <td>{b.name}</td>
                  <td>{formatDateTime(new Date(b.createdAt))}</td>
                  <td>{formatFileSize(b.size)}</td>
                  <td className="table-actions">
                    <button className="icon-button" title="Restaurar" onClick={() => requestConfirm({
                      tone: 'danger',
                      title: 'Restaurar este backup?',
                      text: 'Os dados atuais serão substituídos pelo conteúdo do backup selecionado. Esta ação não pode ser desfeita.',
                      confirmLabel: 'Restaurar backup',
                      onConfirm: () => runAction(async () => { await api.invoke('backup:restore', { filePath: b.filePath }); await loadBackups() }, 'Backup restaurado.'),
                    })}><RotateCcw size={15} /></button>
                    <button className="icon-button danger" title="Excluir" onClick={() => requestConfirm({
                      tone: 'danger',
                      title: 'Excluir este backup?',
                      text: `O arquivo ${b.name} será excluído permanentemente.`,
                      confirmLabel: 'Excluir backup',
                      onConfirm: () => runAction(async () => { await api.invoke('backup:delete', { filePath: b.filePath }); await loadBackups() }, 'Backup excluído.'),
                    })}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  )
}

function ConfigPage({ config, onSave, updateState, setUpdateState }) {
  const [form, setForm] = useState({ ...config })

  useEffect(() => { setForm({ ...config }) }, [config])

  function submit(event) {
    event.preventDefault()
    onSave(form)
  }

  async function checkUpdates() {
    setUpdateState({ status: 'checking' })
    try {
      const result = await api.invoke('updates:check')
      // dev_mode ou error são retornados diretamente; os demais chegam via push
      if (result.status === 'dev_mode' || result.status === 'error') {
        setUpdateState(result)
      }
    } catch (err) {
      setUpdateState({ status: 'error', message: err.message })
    }
  }

  async function downloadUpdate() {
    setUpdateState((prev) => ({ ...prev, status: 'downloading', percent: 0 }))
    await api.invoke('updates:download')
  }

  async function installUpdate() {
    await api.invoke('updates:install')
  }

  const isChecking    = updateState?.status === 'checking'
  const isDownloading = updateState?.status === 'downloading'
  const canCheck      = !isChecking && !isDownloading && updateState?.status !== 'downloaded'

  return (
    <section className="stack">
      <Panel title="Configurações gerais">
        <form onSubmit={submit} className="stack">
          <div className="form-grid two">
            <Input label="Nome da empresa" value={form.nomeEmpresa || ''} onChange={(nomeEmpresa) => setForm({ ...form, nomeEmpresa })} />
            <Input label="Dias para alerta de comprovante" type="number" value={form.diasAlertaComprovante || '3'} onChange={(diasAlertaComprovante) => setForm({ ...form, diasAlertaComprovante })} />
          </div>
          <Toggle label="Backup automático ao abrir e fechar o app" checked={form.backupAutomatico === '1'} onChange={(v) => setForm({ ...form, backupAutomatico: v ? '1' : '0' })} />
          <FormActions editing={false} label="Salvar configurações" />
        </form>
      </Panel>

      <Panel title="Atualizações do app">
        <div className="update-card">
          <div>
            <h2>Buscar atualizações</h2>
            <p>Verifica se há uma versão mais recente disponível e baixa automaticamente quando confirmado.</p>
          </div>

          <div className="update-actions">
            {canCheck && (
              <button className="primary" type="button" onClick={checkUpdates}>
                <RefreshCw size={16} />Buscar atualizações
              </button>
            )}
            {isChecking && (
              <button className="primary" type="button" disabled>
                <RefreshCw size={16} />Verificando...
              </button>
            )}
            {updateState?.status === 'available' && (
              <button className="primary" type="button" onClick={downloadUpdate}>
                <Download size={16} />Baixar v{updateState.version}
              </button>
            )}
            {isDownloading && (
              <button className="primary" type="button" disabled>
                <Download size={16} />Baixando... {updateState.percent ?? 0}%
              </button>
            )}
            {updateState?.status === 'downloaded' && (
              <button className="success" type="button" onClick={installUpdate}>
                <Check size={16} />Reiniciar e instalar v{updateState.version}
              </button>
            )}
          </div>

          {/* Barra de progresso do download */}
          {isDownloading && (
            <div className="update-progress">
              <div className="update-progress-bar" style={{ width: `${updateState.percent ?? 0}%` }} />
            </div>
          )}

          {/* Resultado / estado */}
          {updateState && (
            <div className={`update-result ${updateState.status}`}>
              {updateState.status === 'checking'     && <strong>Verificando atualizações...</strong>}
              {updateState.status === 'up_to_date'   && <strong>Você já está na versão mais recente.</strong>}
              {updateState.status === 'available'    && (<><strong>Nova versão disponível: v{updateState.version}</strong>{updateState.releaseNotes && <p>{updateState.releaseNotes}</p>}</>)}
              {updateState.status === 'downloading'  && <strong>Baixando atualização... {updateState.percent ?? 0}%</strong>}
              {updateState.status === 'downloaded'   && <strong>Download concluído. Clique em "Reiniciar e instalar" para aplicar.</strong>}
              {updateState.status === 'dev_mode'     && <strong>Modo desenvolvimento — atualização automática indisponível.</strong>}
              {updateState.status === 'error'        && <strong>Erro: {updateState.message}</strong>}
              {updateState.publishedAt               && <span>Publicada em: {formatDate(updateState.publishedAt)}</span>}
            </div>
          )}
        </div>
      </Panel>
    </section>
  )
}

function SyncPage({ status, queue, onSync, onRefresh }) {
  return (
    <section className="stack">
      <Panel title="Sincronização online/offline" action={<button className="primary" onClick={onSync} disabled={status.state === 'syncing'}><RefreshCw size={16} />Sincronizar agora</button>}>
        <div className="sync-overview">
          <InfoTile label="Estado" value={syncLabel(status)} />
          <InfoTile label="Pendências" value={status.pending || 0} />
          <InfoTile label="Erros" value={status.errors || 0} />
          <InfoTile label="Último envio" value={status.lastPushAt ? formatDateTime(new Date(status.lastPushAt)) : '—'} />
          <InfoTile label="Última busca" value={status.lastPullAt ? formatDateTime(new Date(status.lastPullAt)) : '—'} />
          <InfoTile label="Dispositivo" value={status.deviceId || '—'} />
        </div>
        {!status.configured && (
          <div className="update-result not_configured">
            <strong>Supabase ainda não configurado.</strong>
            <span>O app continua funcionando offline. Configure `SUPABASE_URL` e `SUPABASE_ANON_KEY` para ativar a sincronização online.</span>
          </div>
        )}
        {status.lastError && (
          <div className="update-result error">
            <strong>Último erro de sincronização</strong>
            <span>{status.lastError}</span>
          </div>
        )}
      </Panel>

      <Panel title="Fila local de sincronização" action={<button className="ghost" onClick={onRefresh}><RefreshCw size={16} />Atualizar</button>}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Entidade</th><th>Ação</th><th>Criado em</th><th>Tentativas</th><th>Erro</th></tr></thead>
            <tbody>
              {queue.length === 0 && (
                <tr><td colSpan="5"><EmptyState title="Nenhuma pendência de sincronização" text="Alterações locais aparecerão aqui quando ainda não tiverem sido enviadas ao Supabase." /></td></tr>
              )}
              {queue.map((item) => (
                <tr key={item.id}>
                  <td>{entityLabel(item.entity)}</td>
                  <td><StatusBadge label={item.action} tone={item.error ? 'danger' : 'info'} /></td>
                  <td>{formatDateTime(new Date(item.createdAt))}</td>
                  <td>{item.attempts}</td>
                  <td>{item.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  )
}

function DiagnosticsPage({ diagnostics, auditLogs, onRefresh, runAction }) {
  const items = diagnostics ? [
    ['Banco local', diagnostics.database?.ok, diagnostics.database?.path],
    ['Backups', diagnostics.backups?.ok, `${diagnostics.backups?.count || 0} arquivo(s)`],
    ['Logs', diagnostics.logs?.ok, diagnostics.logs?.path],
    ['Exportações', diagnostics.exports?.ok, diagnostics.exports?.path],
    ['Sincronização', diagnostics.sync?.configured && diagnostics.sync?.state !== 'error', syncLabel(diagnostics.sync)],
    ['Atualização', diagnostics.update?.configured, diagnostics.update?.configured ? 'Configurado' : 'Não configurado'],
  ] : []

  return (
    <section className="stack">
      <Panel title="Saúde do sistema" action={<button className="ghost" onClick={onRefresh}><RefreshCw size={16} />Atualizar</button>}>
        <div className="health-grid">
          {items.map(([label, ok, text]) => (
            <div className={`health-card ${ok ? 'ok' : 'warn'}`} key={label}>
              <span className={`status-dot ${ok ? 'online' : 'pending'}`}></span>
              <div>
                <strong>{label}</strong>
                <small>{text || '—'}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="row-actions">
          <button className="primary" onClick={() => runAction(() => api.invoke('diagnostics:export'), 'Diagnóstico exportado.')}><Download size={16} />Exportar diagnóstico</button>
          <button className="ghost" onClick={() => runAction(() => api.invoke('diagnostics:openLogs'), 'Pasta de logs aberta.')}><FileDown size={16} />Abrir pasta logs</button>
        </div>
      </Panel>

      <Panel title="Trilha de auditoria">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Ação</th><th>Entidade</th><th>Origem</th><th>Detalhes</th></tr></thead>
            <tbody>
              {auditLogs.length === 0 && (
                <tr><td colSpan="5"><EmptyState title="Nenhum evento encontrado" text="As ações operacionais aparecerão aqui conforme o sistema for usado." /></td></tr>
              )}
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(new Date(log.createdAt))}</td>
                  <td><StatusBadge label={auditActionLabel(log.action)} tone={auditTone(log.action)} /></td>
                  <td>{entityLabel(log.entity)}</td>
                  <td>{log.details?.source || 'UI'}</td>
                  <td>{auditDetails(log.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  )
}

function OperationsTable({ operacoes, onOpen, goOperations, extraActions }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Código</th><th>Cliente</th><th>Empresa</th><th className="money">Recebido</th><th className="money">Pago</th><th className="money">Saldo</th><th>Status</th><th>Alertas</th><th>Ações</th></tr></thead>
        <tbody>
          {operacoes.length === 0 && (
            <tr>
              <td colSpan="9"><EmptyState title="Nenhuma operação encontrada" text="Crie uma nova operação ou ajuste os filtros para visualizar registros." /></td>
            </tr>
          )}
          {operacoes.map((op) => (
            <tr key={op.id} style={op.clienteDestaque ? { background: 'linear-gradient(90deg, rgba(250,204,21,0.10) 0%, transparent 60%)', borderLeft: '3px solid #eab308' } : {}}>
              <td><button className="link-button" onClick={() => { onOpen?.(op.id); goOperations?.() }}>{op.codigo}</button></td>
              <td>{op.clienteNome}{op.clienteDestaque && <span title="Cliente destacado" style={{ marginLeft: 5 }}>⭐</span>}</td>
              <td>{op.empresaApelido}</td>
              <td className="money teal-text">{brl(op.valorRecebido)}</td>
              <td className="money green-text">{brl(op.totalPago)}</td>
              <td className={`money ${op.saldo < 0 ? 'negative' : 'yellow-text'}`}>{brl(op.saldo)}</td>
              <td><StatusBadge label={statusLabel(op.status)} tone={statusTone(op.status)} /></td>
              <td>
                {op.alertaSaldoNegativo && <span className="alert-dot danger"></span>}
                {!op.alertaSaldoNegativo && op.comprovantesPendentes > 0 && <span className="alert-dot warn"></span>}
                {!op.alertaSaldoNegativo && op.comprovantesPendentes === 0 && <span className="alert-dot ok"></span>}
              </td>
              <td className="table-actions">
                {extraActions?.(op) || (
                  <>
                    <button className="icon-button" title="Visualizar" onClick={() => { onOpen?.(op.id); goOperations?.() }}><Eye size={16} /></button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {operacoes.length > 0 && <div className="table-footer"><span>Mostrando {operacoes.length} de {operacoes.length} operação</span></div>}
    </div>
  )
}

function SummaryTable({ title, rows }) {
  return (
    <Panel title={title}>
      <table>
        <thead><tr><th>Nome</th><th>Recebido</th><th>Pago</th><th>Sobra</th><th>Operações</th></tr></thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan="5"><EmptyState title="Sem dados no período" text="Os totais aparecem aqui quando houver operações para os filtros selecionados." /></td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.nome}<small>{row.extra}</small></td>
              <td>{brl(row.totalRecebido)}</td>
              <td>{brl(row.totalPago)}</td>
              <td>{brl(row.sobra)}</td>
              <td>{row.quantidadeOperacoes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function CrudPanel({ title, form, table }) {
  return (
    <section className="stack">
      <Panel title={title}>{form}</Panel>
      <Panel title="Registros">{table}</Panel>
    </section>
  )
}

function Panel({ title, action, children }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Metric({ title, value, subtext, icon: Icon, tone = 'neutral', accent, warn }) {
  return (
    <div className={`metric ${tone} ${accent ? 'accent' : ''} ${warn ? 'warn' : ''}`}>
      {Icon && <div className="metric-icon"><Icon size={24} /></div>}
      <span>{title}</span>
      <strong>{value}</strong>
      {subtext && <small>{subtext}</small>}
    </div>
  )
}

function OperationalInsights({ operacoes, cards, onGoHistorico, onGoOperacoes }) {
  const recebido = Number(cards.recebidoEmAberto || 0)
  const pago = Number(cards.pagoEmAberto || 0)
  const saldo = Number(cards.saldoSobResponsabilidade || 0)
  const paidPercent = recebido > 0 ? Math.min(100, (pago / recebido) * 100) : 0
  const balancePercent = recebido > 0 ? Math.max(0, (saldo / recebido) * 100) : 0
  const statusCounts = countStatuses(operacoes)

  return (
    <div className="insight-grid">
      <section className="insight-card">
        <h2>Resumo financeiro</h2>
        <div className="donut-row">
          <div className="donut financial" style={{ '--pct': `${paidPercent}%` }}>
            <div>
              <span>Saldo</span>
              <strong>{brl(saldo)}</strong>
              <small>{balancePercent.toFixed(2).replace('.', ',')}%</small>
            </div>
          </div>
          <div className="legend-list">
            <Legend color="green" label="Pago" value={`${paidPercent.toFixed(2).replace('.', ',')}%`} />
            <Legend color="teal" label="Saldo" value={`${balancePercent.toFixed(2).replace('.', ',')}%`} />
          </div>
        </div>
        <button className="text-action" onClick={onGoHistorico}>Ver detalhes no histórico <ArrowRight size={15} /></button>
      </section>

      <section className="insight-card">
        <h2>Status das operações</h2>
        <div className="donut-row">
          <div className="donut status-donut">
            <div>
              <strong>{operacoes.length}</strong>
              <span>Total</span>
            </div>
          </div>
          <div className="legend-list">
            <Legend color="yellow" label="Em andamento" value={`${statusCounts.EM_ANDAMENTO || 0} (${percent(statusCounts.EM_ANDAMENTO, operacoes.length)})`} />
            <Legend color="blue" label="Aguardando lista" value={`${statusCounts.AGUARDANDO_LISTA || 0} (${percent(statusCounts.AGUARDANDO_LISTA, operacoes.length)})`} />
            <Legend color="purple" label="Aguardando comprovantes" value={`${statusCounts.AGUARDANDO_COMPROVANTES || 0} (${percent(statusCounts.AGUARDANDO_COMPROVANTES, operacoes.length)})`} />
          </div>
        </div>
        <button className="text-action" onClick={onGoOperacoes}>Ver todas operações <ArrowRight size={15} /></button>
      </section>

      <section className="insight-card alerts-card">
        <div className="panel-title-row">
          <h2>Alertas</h2>
          <Bell size={18} />
        </div>
        <AlertItem icon={CheckCircle2} tone="ok" title="Tudo certo!" text={cards.pagamentosPendentes ? 'Existem pagamentos pendentes para acompanhar.' : 'Não há alertas críticos no momento.'} />
        <AlertItem icon={Info} tone="info" title="Mantenha os comprovantes em dia" text="Comprovantes enviados fortalecem o controle e a conciliação." />
        <AlertItem icon={Info} tone="info" title="Dica" text="Use os filtros no histórico para análises por período, cliente ou empresa." />
      </section>
    </div>
  )
}

function TableToolbar({ placeholder, search, onSearch }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input placeholder={placeholder} value={search || ''} onChange={(e) => onSearch?.(e.target.value)} />
    </label>
  )
}

function Legend({ color, label, value }) {
  return (
    <div className="legend-item">
      <span className={`legend-dot ${color}`}></span>
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
    </div>
  )
}

function AlertItem({ icon: Icon, tone, title, text }) {
  return (
    <div className={`alert-item ${tone}`}>
      <Icon size={22} />
      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  )
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  )
}

function ActionCard({ icon: Icon, title, text, onClick, tone = 'teal', action, disabled }) {
  return (
    <button className={`action-card ${tone}`} onClick={onClick} disabled={disabled}>
      <Icon size={22} />
      <strong>{title}</strong>
      <span>{text}</span>
      {action && <em>{action}</em>}
    </button>
  )
}

function Input({ label, value, onChange, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  )
}

function CurrencyInput({ label, value, onChange, required }) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!focused) {
      setDraft(value === undefined || value === null || value === '' ? '' : brl(value))
    }
  }, [focused, value])

  function handleFocus() {
    setFocused(true)
    setDraft(value === undefined || value === null || value === '' ? '' : plainMoney(value))
  }

  function handleChange(nextValue) {
    setDraft(nextValue)
    onChange(parseMoneyInput(nextValue))
  }

  function handleBlur() {
    setFocused(false)
    setDraft(value === undefined || value === null || value === '' ? '' : brl(parseMoneyInput(draft)))
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        placeholder="R$ 0,00"
        required={required}
        value={focused ? draft : draft || ''}
        onBlur={handleBlur}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={handleFocus}
      />
    </label>
  )
}

function Select({ label, value, onChange, options, required }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={required}>
        <option value="">Selecione</option>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function FormActions({ editing, onCancel, label }) {
  return (
    <div className="row-actions">
      <button className="primary" type="submit"><Save size={16} />{label || (editing ? 'Salvar' : 'Criar')}</button>
      {editing && <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>}
    </div>
  )
}

function StatusBadge({ label, tone = 'neutral' }) {
  return <span className={`status ${tone}`}>{label}</span>
}

function Alert({ label, tone = 'danger' }) {
  return <span className={`alert ${tone}`}><AlertTriangle size={14} />{label}</span>
}

function Toast({ type, text, onClose }) {
  return <button className={`toast ${type}`} onClick={onClose}>{text}</button>
}

function ConfirmModal({ modal, onClose }) {
  async function confirm() {
    await modal.onConfirm?.()
    onClose()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className={`modal-card ${modal.tone || ''}`}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-heading">
          <span className="modal-icon">{modal.tone === 'danger' ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}</span>
          <div>
            <h2>{modal.title}</h2>
            <p>{modal.text}</p>
          </div>
        </div>
        {modal.summary && (
          <div className="modal-summary">
            {modal.summary.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cancelar</button>
          <button className={modal.tone === 'danger' ? 'danger' : 'primary'} onClick={confirm}>
            {modal.tone === 'danger' && <Trash2 size={16} />}
            {modal.tone !== 'danger' && <Check size={16} />}
            {modal.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  )
}

// ─── Relatórios ──────────────────────────────────────────────────────────────

const PERIODO_PRESETS = [
  ['hoje', 'Hoje'],
  ['semana', 'Esta semana'],
  ['mes', 'Este mês'],
  ['mespassado', 'Mês passado'],
  ['custom', 'Personalizado'],
]

function computeRelPeriodo(tipo) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const todayStr = fmt(now)
  switch (tipo) {
    case 'hoje': return { inicio: todayStr, fim: todayStr }
    case 'semana': {
      const dow = now.getDay() || 7
      const mon = new Date(now)
      mon.setDate(now.getDate() - dow + 1)
      return { inicio: fmt(mon), fim: todayStr }
    }
    case 'mes': {
      const y = now.getFullYear(), m = now.getMonth()
      return { inicio: `${y}-${pad(m + 1)}-01`, fim: todayStr }
    }
    case 'mespassado': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { inicio: fmt(prev), fim: fmt(last) }
    }
    default: return { inicio: '', fim: '' }
  }
}

function buildRelatorioHTML(rows, { dataInicio, dataFim, clienteNome }) {
  const brlFmt = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtD = (d) => d ? d.slice(0, 10).split('-').reverse().join('/') : '-'
  const statusLbl = (s) => ({ AGUARDANDO_LISTA: 'Aguardando', EM_ANDAMENTO: 'Em andamento', AGUARDANDO_COMPROVANTES: 'Ag. comp.', CONCLUIDA: 'Concluída' }[s] || s || '')
  const periodoLabel = dataInicio && dataFim ? `${fmtD(dataInicio)} a ${fmtD(dataFim)}` : 'Todos os registros'
  const totalValor = rows.reduce((s, r) => s + r.valor, 0)
  const pagos = rows.filter((r) => r.pago)
  const pendentes = rows.filter((r) => !r.pago)

  const tableRows = rows.map((r) => `
    <tr>
      <td>${fmtD(r.data)}</td>
      <td>${r.operacao || '-'}</td>
      <td>${r.cliente || '-'}</td>
      <td>${r.empresa || '-'}</td>
      <td>${r.favorecido || '-'}</td>
      <td>${r.documento || '-'}</td>
      <td>${r.tipoPagamento === 'PIX' ? 'PIX' : 'Conta'}</td>
      <td>${r.tipoPagamento === 'PIX' ? (r.chavePix || '-') : (r.agencia ? `Ag ${r.agencia} • C ${r.conta}${r.digito ? '-' + r.digito : ''}` : '-')}</td>
      <td class="amt">${brlFmt(r.valor)}</td>
      <td class="${r.pago ? 'ok' : 'warn'}">${r.pago ? '✓ Pago' : '⏳ Pendente'}</td>
      <td class="${r.comprovanteEnviado ? 'ok' : 'warn'}">${r.comprovanteEnviado ? '✓ Enviado' : '⏳ Pendente'}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Movimentações</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff;padding:20px}
.hdr{border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start}
.hdr-title{font-size:18px;font-weight:700;color:#0f172a}
.hdr-sub{font-size:11px;color:#64748b;margin-top:3px}
.gen{font-size:10px;color:#94a3b8;text-align:right}
.summ{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px}
.card .lbl{font-size:9px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:.5px}
.card .val{font-size:16px;font-weight:700;color:#0f172a;margin-top:2px}
.card .sub{font-size:9px;color:#94a3b8;margin-top:1px}
.green .val{color:#16a34a}.amber .val{color:#d97706}
table{width:100%;border-collapse:collapse}
thead th{background:#0f172a;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;text-align:left;white-space:nowrap}
tbody td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tbody tr:nth-child(even) td{background:#f8fafc}
.amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.ok{color:#16a34a;font-weight:600}.warn{color:#d97706;font-weight:600}
.ftr{margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between}
@media print{body{padding:10px}}
</style></head><body>
<div class="hdr">
  <div>
    <div class="hdr-title">Relatório de Movimentações</div>
    <div class="hdr-sub">Período: ${periodoLabel}${clienteNome ? ' &nbsp;•&nbsp; Cliente: ' + clienteNome : ''} &nbsp;•&nbsp; ${rows.length} pagamento${rows.length !== 1 ? 's' : ''}</div>
  </div>
  <div class="gen">Gerado em<br>${new Date().toLocaleString('pt-BR')}</div>
</div>
<div class="summ">
  <div class="card"><div class="lbl">Total de pagamentos</div><div class="val">${rows.length}</div><div class="sub">${pagos.length} pagos • ${pendentes.length} pendentes</div></div>
  <div class="card green"><div class="lbl">Total pago</div><div class="val">${brlFmt(pagos.reduce((s, r) => s + r.valor, 0))}</div><div class="sub">${pagos.length} pagamento${pagos.length !== 1 ? 's' : ''}</div></div>
  <div class="card amber"><div class="lbl">Pendente</div><div class="val">${brlFmt(pendentes.reduce((s, r) => s + r.valor, 0))}</div><div class="sub">${pendentes.length} pagamento${pendentes.length !== 1 ? 's' : ''}</div></div>
  <div class="card"><div class="lbl">Total geral</div><div class="val">${brlFmt(totalValor)}</div></div>
</div>
<table>
<thead><tr><th>Data</th><th>Operação</th><th>Cliente</th><th>Empresa</th><th>Favorecido</th><th>CPF/CNPJ</th><th>Tipo</th><th>Chave PIX / Conta</th><th>Valor</th><th>Pago</th><th>Comprovante</th></tr></thead>
<tbody>${tableRows}</tbody>
</table>
<div class="ftr"><span>Central de Pagamentos — Documento de uso interno</span><span>Total geral: ${brlFmt(totalValor)}</span></div>
</body></html>`
}

function RelatorioPage({ clientes }) {
  const { inicio: mesInicio, fim: mesFim } = computeRelPeriodo('mes')
  const [periodo, setPeriodo] = useState('mes')
  const [dataInicio, setDataInicio] = useState(mesInicio)
  const [dataFim, setDataFim] = useState(mesFim)
  const [clienteIdFiltro, setClienteIdFiltro] = useState('')
  const [statusPago, setStatusPago] = useState('')
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [exportando, setExportando] = useState('')

  async function doBuscar(di, df, cId, sp) {
    setCarregando(true)
    try {
      const result = await api.invoke('relatorio:gerar', {
        dataInicio: di || null,
        dataFim: df || null,
        clienteId: cId ? Number(cId) : null,
        pago: sp === 'pago' ? true : sp === 'pendente' ? false : null,
      })
      setDados(result)
    } catch { /* erros mostrados pelo toast global */ } finally {
      setCarregando(false)
    }
  }

  function aplicarPreset(tipo) {
    setPeriodo(tipo)
    if (tipo === 'custom') return
    const { inicio, fim } = computeRelPeriodo(tipo)
    setDataInicio(inicio)
    setDataFim(fim)
    doBuscar(inicio, fim, clienteIdFiltro, statusPago)
  }

  function buscarCustom() {
    doBuscar(dataInicio, dataFim, clienteIdFiltro, statusPago)
  }

  function onChangeCliente(v) {
    setClienteIdFiltro(v)
    if (periodo !== 'custom' || (dataInicio && dataFim)) {
      doBuscar(dataInicio, dataFim, v, statusPago)
    }
  }

  function onChangeStatus(v) {
    setStatusPago(v)
    if (periodo !== 'custom' || (dataInicio && dataFim)) {
      doBuscar(dataInicio, dataFim, clienteIdFiltro, v)
    }
  }

  // Load on mount with default period (este mês)
  useEffect(() => { doBuscar(mesInicio, mesFim, '', '') }, [])

  const resumo = useMemo(() => {
    if (!dados) return { total: 0, totalValor: 0, pagosVal: 0, pagosCount: 0, pendentesVal: 0, pendentesCount: 0 }
    const pagos = dados.filter((r) => r.pago)
    const pendentes = dados.filter((r) => !r.pago)
    return {
      total: dados.length,
      totalValor: dados.reduce((s, r) => s + r.valor, 0),
      pagosVal: pagos.reduce((s, r) => s + r.valor, 0),
      pagosCount: pagos.length,
      pendentesVal: pendentes.reduce((s, r) => s + r.valor, 0),
      pendentesCount: pendentes.length,
    }
  }, [dados])

  async function exportarCSV() {
    setExportando('csv')
    try {
      await api.invoke('relatorio:exportarCSV', {
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        clienteId: clienteIdFiltro ? Number(clienteIdFiltro) : null,
        pago: statusPago === 'pago' ? true : statusPago === 'pendente' ? false : null,
      })
    } finally { setExportando('') }
  }

  async function exportarPDF() {
    if (!dados?.length) return
    setExportando('pdf')
    try {
      const clienteNome = clientes.find((c) => String(c.id) === String(clienteIdFiltro))?.nomeCurto
      const html = buildRelatorioHTML(dados, { dataInicio, dataFim, clienteNome })
      const stamp = dataInicio && dataFim ? `${dataInicio}_${dataFim}` : new Date().toISOString().slice(0, 10)
      await api.invoke('relatorio:exportarPDF', { html, filename: `relatorio-${stamp}.pdf` })
    } finally { setExportando('') }
  }

  const exportActions = (
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="ghost" onClick={exportarCSV} disabled={!dados?.length || !!exportando}>
        <Download size={16} />{exportando === 'csv' ? 'Exportando…' : 'CSV / Excel'}
      </button>
      <button className="primary" onClick={exportarPDF} disabled={!dados?.length || !!exportando}>
        <FileDown size={16} />{exportando === 'pdf' ? 'Gerando PDF…' : 'Exportar PDF'}
      </button>
    </div>
  )

  return (
    <section className="stack">
      {/* ─── Filtros ─── */}
      <Panel title="Filtros" action={exportActions}>
        <div className="relatorio-filters">
          <div className="relatorio-presets">
            {PERIODO_PRESETS.map(([k, label]) => (
              <button key={k} className={periodo === k ? 'primary' : 'ghost'} onClick={() => aplicarPreset(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="relatorio-inputs">
            <Input label="Data início" type="date" value={dataInicio} onChange={setDataInicio} />
            <Input label="Data fim" type="date" value={dataFim} onChange={setDataFim} />
            <Select
              label="Cliente"
              value={clienteIdFiltro}
              onChange={onChangeCliente}
              options={[['', 'Todos os clientes'], ...clientes.filter((c) => c.ativo).map((c) => [c.id, c.nomeCurto])]}
            />
            <Select
              label="Status"
              value={statusPago}
              onChange={onChangeStatus}
              options={[['', 'Todos'], ['pago', 'Pagos'], ['pendente', 'Pendentes']]}
            />
            {periodo === 'custom' && (
              <button className="primary" style={{ alignSelf: 'flex-end' }} onClick={buscarCustom}>
                <Search size={16} /> Buscar
              </button>
            )}
          </div>
        </div>
      </Panel>

      {/* ─── Resumo ─── */}
      {dados !== null && (
        <div className="card-grid four">
          <Metric icon={ListChecks} tone="teal" title="Pagamentos" value={resumo.total}
            subtext={`${resumo.pagosCount} pago${resumo.pagosCount !== 1 ? 's' : ''} • ${resumo.pendentesCount} pendente${resumo.pendentesCount !== 1 ? 's' : ''}`} />
          <Metric icon={CheckCircle2} tone="green" title="Total pago" value={brl(resumo.pagosVal)}
            subtext={`${resumo.pagosCount} pagamento${resumo.pagosCount !== 1 ? 's' : ''}`} />
          <Metric icon={Hourglass} tone="yellow" title="Pendente" value={brl(resumo.pendentesVal)}
            subtext={`${resumo.pendentesCount} pagamento${resumo.pendentesCount !== 1 ? 's' : ''}`} />
          <Metric icon={WalletCards} tone="strong" title="Total geral" value={brl(resumo.totalValor)}
            subtext="Soma do período" />
        </div>
      )}

      {/* ─── Tabela ─── */}
      <Panel
        title={dados !== null ? `${dados.length} pagamento${dados.length !== 1 ? 's' : ''} encontrado${dados.length !== 1 ? 's' : ''}` : 'Resultados'}
        action={exportActions}
      >
        {carregando && <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>Carregando…</div>}
        {!carregando && dados !== null && dados.length === 0 && (
          <EmptyState title="Nenhum pagamento encontrado" text="Tente ajustar o período ou os filtros." />
        )}
        {!carregando && dados?.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Operação</th>
                  <th>Cliente</th>
                  <th>Empresa</th>
                  <th>Favorecido</th>
                  <th>Tipo</th>
                  <th>Chave PIX / Conta</th>
                  <th className="money">Valor</th>
                  <th>Pago</th>
                  <th>Comprovante</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((r) => (
                  <tr key={r.pagamentoId}>
                    <td>{formatDate(r.data)}</td>
                    <td><code style={{ fontSize: 11 }}>{r.operacao}</code></td>
                    <td>{r.cliente}</td>
                    <td>{r.empresa}</td>
                    <td>{r.favorecido}</td>
                    <td><StatusBadge label={r.tipoPagamento === 'PIX' ? 'PIX' : 'Conta'} tone="info" /></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {r.tipoPagamento === 'PIX'
                        ? r.chavePix
                        : r.agencia ? `Ag ${r.agencia} • C ${r.conta}${r.digito ? '-' + r.digito : ''}` : '-'}
                    </td>
                    <td className="money teal-text"><strong>{brl(r.valor)}</strong></td>
                    <td><StatusBadge label={r.pago ? 'Pago' : 'Pendente'} tone={r.pago ? 'ok' : 'warn'} /></td>
                    <td><StatusBadge label={r.comprovanteEnviado ? 'Enviado' : 'Pendente'} tone={r.comprovanteEnviado ? 'ok' : 'purple'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  )
}

function pageTitle(page) {
  const titles = {
    operacional: 'Operacional',
    historico: 'Histórico',
    operacoes: 'Operações',
    contas: 'Contas a Pagar',
    relatorio: 'Relatórios',
    empresas: 'Empresas / Contas',
    clientes: 'Clientes',
    backup: 'Backup e Exportações',
    sincronizacao: 'Sincronização',
    diagnostico: 'Diagnóstico',
    configuracoes: 'Configurações',
  }
  return titles[page] || page
}

function pageSubtitle(page) {
  const subtitles = {
    operacional: 'Acompanhe suas operações em tempo real',
    historico: 'Analise operações concluídas e movimentações históricas.',
    operacoes: 'Gerencie entradas financeiras e acompanhe o status das operações.',
    contas: 'Gerencie despesas, boletos e contas fixas com alerta de vencimento.',
    relatorio: 'Filtre e exporte movimentações por período, cliente ou status.',
    empresas: 'Gerencie contas bancárias e CNPJs utilizados nas operações.',
    clientes: 'Cadastre e gerencie clientes atendidos.',
    backup: 'Proteja seus dados e exporte relatórios operacionais.',
    sincronizacao: 'Acompanhe pendências locais e sincronize com o Supabase.',
    diagnostico: 'Acompanhe saúde do sistema, logs e trilha de auditoria.',
    configuracoes: 'Personalize o comportamento do sistema.',
  }
  return subtitles[page] || ''
}

function syncLabel(status = {}) {
  if (!status.configured) return 'Offline local'
  if (status.state === 'syncing') return 'Sincronizando'
  if (status.state === 'error' || status.errors > 0) return 'Erro'
  if (status.pending > 0) return `${status.pending} pendência${status.pending > 1 ? 's' : ''}`
  return 'Online'
}

function syncTone(status = {}) {
  if (status.state === 'syncing') return 'syncing'
  if (!status.configured) return 'offline'
  if (status.state === 'error' || status.errors > 0) return 'error'
  if (status.pending > 0) return 'pending'
  return 'online'
}

function entityLabel(entity) {
  const labels = {
    empresas: 'Empresas',
    clientes: 'Clientes',
    operacoes: 'Operações',
    pagamentos: 'Pagamentos',
    audit_logs: 'Auditoria',
    backup: 'Backup',
    reports: 'Relatórios',
    sync: 'Sincronização',
  }
  return labels[entity] || entity
}

function auditActionLabel(action) {
  const labels = {
    CREATE: 'Criado',
    UPDATE: 'Atualizado',
    DELETE: 'Excluído',
    CONCLUDE: 'Concluído',
    REOPEN: 'Reaberto',
    DUPLICATE: 'Duplicado',
    UPDATE_FLAGS: 'Status pagamento',
    MARK_PAID: 'Marcado pago',
    UNMARK_PAID: 'Desmarcado pago',
    MARK_COMPROVANTE: 'Comprovante',
    UNMARK_COMPROVANTE: 'Sem comprovante',
    EXPORT: 'Exportação',
    IMPORT: 'Importação',
    EXPORT_CSV: 'Relatório CSV',
    EXPORT_DIAGNOSTICS: 'Diagnóstico',
    SYNC_START: 'Sync iniciado',
    SYNC_SUCCESS: 'Sync concluído',
    SYNC_ERROR: 'Erro de sync',
  }
  return labels[action] || action
}

function auditTone(action) {
  if (String(action).includes('ERROR') || action === 'DELETE') return 'danger'
  if (String(action).includes('SUCCESS') || action === 'CREATE') return 'ok'
  if (String(action).includes('EXPORT') || String(action).includes('IMPORT')) return 'info'
  if (String(action).includes('SYNC')) return 'purple'
  return 'warn'
}

function auditDetails(details = {}) {
  if (!details || typeof details !== 'object') return '—'
  const parts = []
  if (details.message) parts.push(details.message)
  if (details.uuid) parts.push(`uuid ${String(details.uuid).slice(0, 8)}`)
  if (details.pago !== undefined) parts.push(`pago: ${details.pago ? 'sim' : 'não'}`)
  if (details.comprovanteEnviado !== undefined) parts.push(`comprovante: ${details.comprovanteEnviado ? 'sim' : 'não'}`)
  if (details.pushed !== undefined) parts.push(`enviados: ${details.pushed}`)
  if (details.pulled !== undefined) parts.push(`baixados: ${details.pulled}`)
  return parts.join(' • ') || '—'
}

function statusLabel(status) {
  return operationStatuses.find(([id]) => id === status)?.[1] || status
}

function statusTone(status) {
  const tones = {
    AGUARDANDO_LISTA: 'info',
    EM_ANDAMENTO: 'warn',
    AGUARDANDO_COMPROVANTES: 'purple',
    CONCLUIDA: 'ok',
  }
  return tones[status] || 'neutral'
}

function countStatuses(operacoes) {
  return operacoes.reduce((acc, op) => {
    acc[op.status] = (acc[op.status] || 0) + 1
    return acc
  }, {})
}

function percent(value = 0, total = 0) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function brl(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function parseMoneyInput(value) {
  const text = String(value || '').replace(/[^\d,.]/g, '')
  if (!text) return ''
  const hasDecimalComma = /,\d{1,2}$/.test(text)
  const hasDecimalDot = /\.\d{1,2}$/.test(text) && !text.includes(',')

  if (hasDecimalComma) {
    return Number(text.replace(/\./g, '').replace(',', '.')) || 0
  }

  if (hasDecimalDot) {
    return Number(text.replace(/,/g, '')) || 0
  }

  return Number(text.replace(/\D/g, '')) || 0
}

function plainMoney(value) {
  const number = Number(value || 0)
  return Number.isInteger(number) ? String(number) : String(number).replace('.', ',')
}

function digits(value) {
  return String(value || '').replace(/\D/g, '')
}

function formatCpfCnpj(value) {
  const onlyDigits = digits(value)
  if (onlyDigits.length === 11) {
    return onlyDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (onlyDigits.length === 14) {
    return onlyDigits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return value || ''
}

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function findSimilarPayment(candidate, payments = []) {
  const candidateName = normalizeComparableText(candidate.favorecido)
  const candidateValue = Number(parseMoneyInput(candidate.valor) || 0).toFixed(2)
  const candidateDocument = digits(candidate.documento)
  const candidatePix = normalizeComparableText(candidate.chavePix)

  if (!candidateName || Number(candidateValue) <= 0) return null

  return payments.find((payment) => {
    if (candidate.id && payment.id === candidate.id) return false
    const sameName = normalizeComparableText(payment.favorecido) === candidateName
    const sameValue = Number(payment.valor || 0).toFixed(2) === candidateValue
    const sameDocument = candidateDocument && digits(payment.documento) === candidateDocument
    const samePix = candidatePix && normalizeComparableText(payment.chavePix) === candidatePix
    return sameValue && ((sameName && sameDocument) || samePix)
  }) || null
}

function HelpModal({ onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-card help-modal-card">
        <button className="modal-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="modal-heading">
          <span className="modal-icon"><HelpCircle size={24} /></span>
          <div>
            <h2>Guia rápido</h2>
            <p>Fluxo básico do dia a dia — consulte o Manual do Usuário para detalhes.</p>
          </div>
        </div>

        <div className="help-body">
          <div className="help-section">
            <h3>Fluxo básico</h3>
            <ol className="help-steps">
              <li><strong>Criar operação</strong> — Cliente envia PIX → registre em <em>Operações → Nova operação</em></li>
              <li><strong>Lançar pagamentos</strong> — Cole a lista do WhatsApp em <em>Importar lista</em>, ou adicione um a um</li>
              <li><strong>Revisar</strong> — Confira nome, chave PIX/conta e valor de cada favorecido</li>
              <li><strong>Pagar</strong> — Execute o pagamento no banco/celular, depois marque ✓ no app</li>
              <li><strong>Comprovante</strong> — Envie o comprovante e marque ✉ no app</li>
              <li><strong>Concluir</strong> — Com tudo pago e comprovantes enviados, clique <em>Concluir operação</em></li>
            </ol>
          </div>

          <div className="help-section">
            <h3>Status de operação</h3>
            <table className="help-table">
              <tbody>
                <tr><td><StatusBadge label="Aguardando lista" tone="info" /></td><td>Operação criada, sem pagamentos ainda</td></tr>
                <tr><td><StatusBadge label="Em andamento" tone="warn" /></td><td>Há pagamentos ainda não pagos</td></tr>
                <tr><td><StatusBadge label="Aguardando comprovantes" tone="purple" /></td><td>Todos pagos, mas faltam comprovantes</td></tr>
                <tr><td><StatusBadge label="Concluída" tone="ok" /></td><td>Tudo pago e comprovantes enviados</td></tr>
              </tbody>
            </table>
          </div>

          <div className="help-section">
            <h3>Alertas</h3>
            <table className="help-table">
              <tbody>
                <tr><td><Alert label="Saldo negativo" tone="danger" /></td><td>Total pago ultrapassou o valor recebido</td></tr>
                <tr><td><Alert label="Pagamentos pendentes" tone="warn" /></td><td>Ainda há favorecidos a pagar</td></tr>
                <tr><td><Alert label="Comprovantes faltando" tone="warn" /></td><td>Pagamentos sem comprovante enviado</td></tr>
                <tr><td><Alert label="Possível duplicidade" tone="warn" /></td><td>Dois pagamentos idênticos detectados</td></tr>
              </tbody>
            </table>
          </div>

          <div className="help-section">
            <h3>Atalhos úteis</h3>
            <table className="help-table">
              <tbody>
                <tr><td>Nova operação</td><td>Botão azul <em>"Nova operação"</em> no canto superior direito</td></tr>
                <tr><td>Abrir detalhe</td><td>Clique no código (ex.: OP0001) na tabela</td></tr>
                <tr><td>Buscar operação</td><td>Campo de pesquisa na tela Operações</td></tr>
                <tr><td>Backup manual</td><td>Aba Backup → Exportar backup JSON</td></tr>
                <tr><td>Reabrir operação</td><td>Detalhe da operação → botão Reabrir</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}><Check size={16} />Entendido</button>
        </div>
      </section>
    </div>
  )
}

export default App
