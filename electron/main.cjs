const fs = require('node:fs');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { createRepositories } = require('./repositories.cjs');
const { getDefaultDbPath, openDatabase } = require('./database.cjs');
const { SyncService } = require('./sync-service.cjs');

// ─── Auto-updater (electron-updater) ────────────────────────────────────────
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = false;       // Usuário decide quando baixar
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
} catch (err) {
  // electron-updater indisponível — atualização manual via feed JSON
}

// ─── Helpers de caminho ───────────────────────────────────────────────────────
function getWindowIconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'app-icon.ico'),
    path.join(process.resourcesPath || '', 'app-icon.png'),
    path.join(__dirname, '..', 'build-assets', 'app-icon.ico'),
    path.join(__dirname, '..', 'build-assets', 'app-icon.png'),
    path.join(__dirname, '..', 'build', 'app-icon.ico'),
    path.join(__dirname, '..', 'build', 'app-icon.png'),
  ];
  return candidates.find((c) => fs.existsSync(c));
}

function getBackupDir()  { return path.join(app.getPath('userData'), 'backups'); }
function getLogsDir()    { return path.join(app.getPath('userData'), 'logs'); }
function getExportsDir() { return path.join(app.getPath('userData'), 'exports'); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureAppDataDirs() {
  ensureDir(app.getPath('userData'));
  ensureDir(getBackupDir());
  ensureDir(getLogsDir());
  ensureDir(getExportsDir());
}

// ─── Logging estruturado ──────────────────────────────────────────────────────
function appendLog(message, error) {
  try {
    ensureDir(getLogsDir());
    const details = error ? ` ${error.stack || error.message || error}` : '';
    const line = `[${new Date().toISOString()}] ${message}${details}\n`;
    fs.appendFileSync(path.join(getLogsDir(), 'app.log'), line, 'utf8');
  } catch { /* ignorar falha de log */ }
}

function readAppLogs() {
  const logPath = path.join(getLogsDir(), 'app.log');
  if (!fs.existsSync(logPath)) return '';
  return fs.readFileSync(logPath, 'utf8').slice(-80_000);
}

// ─── Backup automático ────────────────────────────────────────────────────────
function autoBackup() {
  try {
    if (repositories?.getConfig?.().backupAutomatico === '0') return;
    const dir = ensureDir(getBackupDir());
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');
    const filePath = path.join(dir, `backup-${stamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(repositories.exportBackup(), null, 2), 'utf8');
    pruneOldBackups(dir, 30);
    appendLog(`Backup automático: ${path.basename(filePath)}`);
  } catch (err) {
    appendLog('Auto-backup error:', err);
  }
}

function pruneOldBackups(dir, maxCount) {
  try {
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const file of files.slice(maxCount)) {
      fs.unlinkSync(path.join(dir, file.name));
    }
  } catch { /* ignorar */ }
}

// ─── Diagnósticos ────────────────────────────────────────────────────────────
function getDiagnostics() {
  const dbPath = getDefaultDbPath(app);
  return {
    database: { ok: fs.existsSync(dbPath), path: dbPath },
    backups: {
      ok: fs.existsSync(getBackupDir()),
      path: getBackupDir(),
      count: fs.existsSync(getBackupDir())
        ? fs.readdirSync(getBackupDir()).filter((f) => f.endsWith('.json')).length
        : 0,
    },
    logs:    { ok: fs.existsSync(getLogsDir()),    path: getLogsDir() },
    exports: { ok: fs.existsSync(getExportsDir()), path: getExportsDir() },
    sync:    syncService?.getStatus?.() || { configured: false },
    update:  {
      configured: Boolean(autoUpdater),
    },
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  };
}

async function exportDiagnostics() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar diagnóstico',
    defaultPath: path.join(getExportsDir(), `diagnostico-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const payload = {
    exportedAt: new Date().toISOString(),
    diagnostics: getDiagnostics(),
    logs: readAppLogs(),
    audit: repositories?.listAuditLogs?.({ limit: 200 }) || [],
  };
  fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
  repositories?.logAudit?.('EXPORT_DIAGNOSTICS', 'diagnostics', null, { source: 'UI' });
  return { canceled: false, filePath: result.filePath };
}

// ─── Auto-updater: eventos → renderer ────────────────────────────────────────
function sendUpdaterEvent(event) {
  if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('updater:event', event);
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;

  autoUpdater.logger = {
    info:  (msg) => appendLog(`[updater] ${msg}`),
    warn:  (msg) => appendLog(`[updater] WARN ${msg}`),
    error: (msg) => appendLog(`[updater] ERROR ${msg}`),
    debug: () => {},
  };

  autoUpdater.on('checking-for-update', () => {
    appendLog('Auto-update: verificando...');
    sendUpdaterEvent({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    appendLog(`Auto-update: disponível v${info.version}`);
    sendUpdaterEvent({
      status: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
      publishedAt: info.releaseDate || '',
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    appendLog(`Auto-update: em dia v${info.version}`);
    sendUpdaterEvent({ status: 'up_to_date', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdaterEvent({
      status: 'downloading',
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    appendLog(`Auto-update: download concluído v${info.version}`);
    sendUpdaterEvent({ status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    appendLog('Auto-update error:', err);
    sendUpdaterEvent({ status: 'error', message: err.message });
  });
}

// ─── Janela principal ─────────────────────────────────────────────────────────
let mainWindow;
let repositories;
let syncService;
let syncTimer;

if (process.platform === 'win32') {
  app.setAppUserModelId('com.centralpagamentos.app');
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

process.on('uncaughtException', (err) => {
  appendLog('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  appendLog('Unhandled rejection:', reason);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Central de Pagamentos',
    backgroundColor: '#0B1220',
    autoHideMenuBar: true,
    ...(getWindowIconPath() ? { icon: getWindowIconPath() } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appendLog(`Renderer process gone: ${details.reason}`, new Error(`exitCode=${details.exitCode}`));
  });

  mainWindow.webContents.on('unresponsive', () => {
    appendLog('Renderer unresponsive');
  });

  const startUrl = process.env.ELECTRON_START_URL;
  if (startUrl) {
    mainWindow.loadURL(startUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'build', 'renderer', 'index.html'));
  }
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
function registerIpc() {
  const actions = {
    // Empresas
    'empresas:list':   (p) => repositories.listEmpresas(p),
    'empresas:save':   (p) => repositories.saveEmpresa(p),
    'empresas:delete': (p) => repositories.deleteEmpresa(p.id),

    // Clientes
    'clientes:list':   (p) => repositories.listClientes(p),
    'clientes:save':   (p) => repositories.saveCliente(p),
    'clientes:delete': (p) => repositories.deleteCliente(p.id),

    // Operações
    'operacoes:list':   (p) => repositories.listOperacoes(p),
    'operacoes:get':    (p) => repositories.getOperacao(p.id),
    'operacoes:save':   (p) => repositories.saveOperacao(p),
    'operacoes:delete': (p) => repositories.deleteOperacao(p.id),
    'operacoes:reopen': (p) => repositories.reopenOperacao(p.id),

    // Pagamentos
    'pagamentos:list':   (p) => repositories.listPagamentos(p.operacaoId),
    'pagamentos:save':   (p) => repositories.savePagamento(p),
    'pagamentos:flags':  (p) => repositories.updatePagamentoFlags(p),
    'pagamentos:delete': (p) => repositories.deletePagamento(p.id),

    // Dashboards
    'dashboard:operacional': () => repositories.getOperationalDashboard(),
    'dashboard:historico':   (p) => repositories.getHistoricalDashboard(p),

    // Configurações
    'config:get': () => repositories.getConfig(),
    'config:set': (p) => repositories.setConfig(p),

    // Backup
    'backup:list': () => {
      const dir = ensureDir(getBackupDir());
      return fs.readdirSync(dir)
        .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
        .map((f) => {
          const stat = fs.statSync(path.join(dir, f));
          return { name: f, filePath: path.join(dir, f), size: stat.size, createdAt: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    'backup:restore': async (p) => {
      const content = fs.readFileSync(p.filePath, 'utf8');
      repositories.importBackup(JSON.parse(content));
      appendLog(`Backup restaurado: ${path.basename(p.filePath)}`);
      return { ok: true };
    },
    'backup:delete': (p) => {
      fs.unlinkSync(p.filePath);
      return { ok: true };
    },
    'backup:export': async () => {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar backup',
        defaultPath: path.join(getExportsDir(), `central-pagamentos-backup-${new Date().toISOString().slice(0, 10)}.json`),
        filters: [{ name: 'Backup JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      fs.writeFileSync(result.filePath, JSON.stringify(repositories.exportBackup(), null, 2), 'utf8');
      repositories.logAudit('EXPORT', 'backup', null, { source: 'UI' });
      appendLog(`Backup exportado: ${result.filePath}`);
      return { canceled: false, filePath: result.filePath };
    },
    'backup:import': async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Importar backup',
        properties: ['openFile'],
        filters: [{ name: 'Backup JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      repositories.importBackup(JSON.parse(content));
      repositories.logAudit('IMPORT', 'backup', null, { source: 'UI' });
      appendLog(`Backup importado: ${result.filePaths[0]}`);
      return { canceled: false, filePath: result.filePaths[0] };
    },

    // Relatórios
    'reports:csv': async () => {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar relatório CSV',
        defaultPath: path.join(getExportsDir(), `relatorio-${new Date().toISOString().slice(0, 10)}.csv`),
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      fs.writeFileSync(result.filePath, repositories.exportCsv(), 'utf8');
      repositories.logAudit('EXPORT_CSV', 'reports', null, { source: 'UI' });
      return { canceled: false, filePath: result.filePath };
    },

    // ─── Auto-updater ────────────────────────────────────────────────────────
    'updates:check': async () => {
      if (!app.isPackaged) {
        return { status: 'dev_mode', message: 'Auto-update não funciona em modo desenvolvimento.' };
      }
      if (!autoUpdater) {
        return { status: 'error', message: 'Módulo de atualização não disponível.' };
      }
      // Resultado chega via push events (updater:event)
      autoUpdater.checkForUpdates().catch((err) => {
        appendLog('updates:check error:', err);
        sendUpdaterEvent({ status: 'error', message: err.message });
      });
      return { status: 'checking' };
    },
    'updates:download': async () => {
      if (!autoUpdater) return { ok: false, message: 'Módulo de atualização não disponível.' };
      autoUpdater.downloadUpdate().catch((err) => {
        appendLog('updates:download error:', err);
        sendUpdaterEvent({ status: 'error', message: err.message });
      });
      return { ok: true };
    },
    'updates:install': () => {
      if (!autoUpdater) return { ok: false };
      appendLog('Auto-update: iniciando instalação...');
      // false = não silencioso (mostra instalador), true = reinicia após instalar
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    },

    // Sincronização
    'sync:status': () => syncService.getStatus(),
    'sync:queue':  () => repositories.listSyncQueue({ limit: 100 }),
    'sync:now':    () => syncService.syncNow(),
    'sync:retry':  () => syncService.retryFailed(),

    // Info do app
    'app:version': () => app.getVersion(),

    // Auditoria & Diagnóstico
    'audit:list':           (p) => repositories.listAuditLogs(p),
    'diagnostics:status':   () => getDiagnostics(),
    'diagnostics:logs':     () => readAppLogs(),
    'diagnostics:export':   async () => exportDiagnostics(),
    'diagnostics:openLogs': async () => { await shell.openPath(getLogsDir()); return { ok: true }; },
  };

  ipcMain.handle('central:invoke', async (_event, action, payload = {}) => {
    if (!actions[action]) throw new Error(`Ação não permitida: ${action}`);
    try {
      return await actions[action](payload);
    } catch (err) {
      appendLog(`IPC error [${action}]:`, err);
      throw err;
    }
  });
}

// ─── Ciclo de vida ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  try {
    ensureAppDataDirs();
    appendLog(`App iniciado v${app.getVersion()} — isPackaged=${app.isPackaged}`);

    const db = openDatabase(getDefaultDbPath(app));
    repositories = createRepositories(db);

    syncService = new SyncService(repositories, {
      envPaths: [
        path.join(app.getPath('userData'), '.env'),
        path.join(process.resourcesPath || '', '.env'),
      ],
    });

    setupAutoUpdater();
    registerIpc();
    autoBackup();
    createWindow();

    appendLog('Janela criada, iniciando sync...');
    syncService.syncNow().catch((err) => appendLog('Sync startup error:', err));

    syncTimer = setInterval(() => {
      syncService.syncNow().catch((err) => appendLog('Sync timer error:', err));
    }, 3 * 60 * 1000);

  } catch (err) {
    appendLog('Startup error:', err);
    dialog.showErrorBox('Erro ao iniciar Central de Pagamentos', err.message);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('before-quit', () => {
  appendLog('App encerrando...');
  if (syncTimer) clearInterval(syncTimer);
  autoBackup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
