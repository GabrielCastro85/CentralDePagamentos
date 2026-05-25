const path = require('node:path');
const { randomUUID } = require('node:crypto');

function nowIso() {
  return new Date().toISOString();
}

function openDatabase(filePath) {
  const db = createSqliteDatabase(filePath);
  setPragma(db, 'journal_mode = WAL');
  setPragma(db, 'foreign_keys = ON');
  ensureTransactionHelper(db);
  runMigrations(db);
  return db;
}

function createSqliteDatabase(filePath) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(filePath);
  } catch {
    const Database = require('better-sqlite3');
    return new Database(filePath);
  }
}

function setPragma(db, pragma) {
  if (typeof db.pragma === 'function') {
    db.pragma(pragma);
    return;
  }
  db.exec(`PRAGMA ${pragma}`);
}

function ensureTransactionHelper(db) {
  if (typeof db.transaction === 'function') return;
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
}

function getDefaultDbPath(app) {
  return path.join(app.getPath('userData'), 'central-de-pagamentos.sqlite');
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    );
  `);

  const applied = db
    .prepare('SELECT name FROM migrations')
    .all()
    .map((row) => row.name);

  if (!applied.includes('001_initial_schema')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE empresas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          apelido TEXT NOT NULL,
          razaoSocial TEXT,
          cnpj TEXT,
          banco TEXT,
          agencia TEXT,
          conta TEXT,
          ativo INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nomeCurto TEXT NOT NULL,
          razaoSocial TEXT,
          grupoWhatsapp TEXT,
          observacoes TEXT,
          ativo INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );

        CREATE TABLE operacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE,
          data TEXT NOT NULL,
          clienteId INTEGER NOT NULL,
          empresaId INTEGER NOT NULL,
          valorRecebido REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'AGUARDANDO_LISTA',
          observacao TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (clienteId) REFERENCES clientes(id),
          FOREIGN KEY (empresaId) REFERENCES empresas(id)
        );

        CREATE TABLE pagamentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operacaoId INTEGER NOT NULL,
          data TEXT NOT NULL,
          favorecido TEXT NOT NULL,
          documento TEXT,
          tipoPagamento TEXT NOT NULL DEFAULT 'PIX',
          chavePix TEXT,
          banco TEXT,
          agencia TEXT,
          tipoConta TEXT NOT NULL DEFAULT 'NAO_INFORMADO',
          conta TEXT,
          digito TEXT,
          valor REAL NOT NULL DEFAULT 0,
          pago INTEGER NOT NULL DEFAULT 0,
          comprovanteEnviado INTEGER NOT NULL DEFAULT 0,
          observacao TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (operacaoId) REFERENCES operacoes(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_operacoes_status ON operacoes(status);
        CREATE INDEX idx_operacoes_data ON operacoes(data);
        CREATE INDEX idx_pagamentos_operacao ON pagamentos(operacaoId);
      `);
      db.prepare('INSERT INTO migrations (id, name, appliedAt) VALUES (?, ?, ?)').run(
        1,
        '001_initial_schema',
        nowIso(),
      );
    })();
  }

  if (!applied.includes('002_settings')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE configuracoes (
          chave TEXT PRIMARY KEY,
          valor TEXT NOT NULL
        );
        INSERT INTO configuracoes (chave, valor) VALUES
          ('nomeEmpresa', 'Central de Pagamentos'),
          ('diasAlertaComprovante', '3'),
          ('backupAutomatico', '1');
      `);
      db.prepare('INSERT INTO migrations (id, name, appliedAt) VALUES (?, ?, ?)').run(
        2,
        '002_settings',
        nowIso(),
      );
    })();
  }

  if (!applied.includes('004_contas')) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS contas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT UNIQUE,
          descricao TEXT NOT NULL,
          valor REAL DEFAULT 0,
          vencimento TEXT,
          pago INTEGER NOT NULL DEFAULT 0,
          pagoEm TEXT,
          comprovantePath TEXT,
          categoria TEXT DEFAULT '',
          observacao TEXT DEFAULT '',
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          deletedAt TEXT,
          deviceId TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_contas_vencimento ON contas(vencimento);
        CREATE INDEX IF NOT EXISTS idx_contas_pago ON contas(pago);
      `);
      db.prepare('INSERT INTO migrations (id, name, appliedAt) VALUES (?, ?, ?)').run(4, '004_contas', nowIso());
    })();
  }

  if (!applied.includes('005_empresa_destaque')) {
    db.transaction(() => {
      addColumnIfMissing(db, 'empresas', 'destaque', 'INTEGER NOT NULL DEFAULT 0');
      db.prepare('INSERT INTO migrations (id, name, appliedAt) VALUES (?, ?, ?)').run(5, '005_empresa_destaque', nowIso());
    })();
  }

  if (!applied.includes('006_cliente_destaque')) {
    db.transaction(() => {
      addColumnIfMissing(db, 'clientes', 'destaque', 'INTEGER NOT NULL DEFAULT 0');
      db.prepare('INSERT INTO migrations (id, name, appliedAt) VALUES (?, ?, ?)').run(6, '006_cliente_destaque', nowIso());
    })();
  }

  if (!applied.includes('003_offline_sync')) {
    db.transaction(() => {
      for (const table of ['empresas', 'clientes', 'operacoes', 'pagamentos']) {
        addColumnIfMissing(db, table, 'uuid', 'TEXT');
        addColumnIfMissing(db, table, 'deletedAt', 'TEXT');
        addColumnIfMissing(db, table, 'syncStatus', "TEXT NOT NULL DEFAULT 'PENDING'");
        addColumnIfMissing(db, table, 'lastSyncedAt', 'TEXT');
        addColumnIfMissing(db, table, 'deviceId', 'TEXT');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity TEXT NOT NULL,
          entityId INTEGER NOT NULL,
          action TEXT NOT NULL,
          payload TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          syncedAt TEXT,
          error TEXT,
          attempts INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_sync_queue_pending ON sync_queue (syncedAt, createdAt);

        CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          entityId INTEGER,
          details TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          deletedAt TEXT,
          syncStatus TEXT NOT NULL DEFAULT 'PENDING',
          lastSyncedAt TEXT,
          deviceId TEXT
        );
      `);

      ensureSyncMetadata(db);
      backfillSyncColumns(db);

      db.prepare('INSERT INTO migrations (id, name, appliedAt) VALUES (?, ?, ?)').run(
        3,
        '003_offline_sync',
        nowIso(),
      );
    })();
  }
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function addColumnIfMissing(db, table, column, definition) {
  if (!tableColumns(db, table).includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function ensureSyncMetadata(db) {
  const deviceId = db.prepare("SELECT value FROM sync_metadata WHERE key = 'deviceId'").get()?.value;
  if (!deviceId) {
    db.prepare('INSERT INTO sync_metadata (key, value) VALUES (?, ?)').run('deviceId', randomUUID());
  }
  for (const key of ['lastPullAt', 'lastPushAt']) {
    const current = db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(key);
    if (!current) db.prepare('INSERT INTO sync_metadata (key, value) VALUES (?, ?)').run(key, '');
  }
}

function backfillSyncColumns(db) {
  const deviceId = db.prepare("SELECT value FROM sync_metadata WHERE key = 'deviceId'").get()?.value || randomUUID();
  for (const table of ['empresas', 'clientes', 'operacoes', 'pagamentos']) {
    const rows = db.prepare(`SELECT id FROM ${table} WHERE uuid IS NULL OR uuid = ''`).all();
    const stmt = db.prepare(`UPDATE ${table} SET uuid = ?, syncStatus = COALESCE(syncStatus, 'PENDING'), deviceId = COALESCE(deviceId, ?) WHERE id = ?`);
    for (const row of rows) stmt.run(randomUUID(), deviceId, row.id);
    db.prepare(`UPDATE ${table} SET syncStatus = 'PENDING' WHERE syncStatus IS NULL OR syncStatus = ''`).run();
    db.prepare(`UPDATE ${table} SET deviceId = ? WHERE deviceId IS NULL OR deviceId = ''`).run(deviceId);
  }
}

module.exports = {
  getDefaultDbPath,
  ensureTransactionHelper,
  nowIso,
  openDatabase,
  runMigrations,
};
