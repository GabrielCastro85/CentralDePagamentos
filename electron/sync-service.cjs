const fs = require('node:fs');
const path = require('node:path');
const { nowIso } = require('./database.cjs');

const ENTITY_ORDER = ['empresas', 'clientes', 'operacoes', 'pagamentos', 'audit_logs'];
const TABLES = {
  empresas: 'empresas',
  clientes: 'clientes',
  operacoes: 'operacoes',
  pagamentos: 'pagamentos',
  audit_logs: 'audit_logs',
};

function loadDotEnv(envPaths = []) {
  const candidates = [...envPaths, path.join(process.cwd(), '.env')].filter(Boolean);
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (!process.env[key]) process.env[key] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
  }
}

class SyncService {
  constructor(repositories, options = {}) {
    loadDotEnv(options.envPaths);
    this.repositories = repositories;
    this.running = false;
    this.lastError = '';
    this.lastState = 'idle';
  }

  getConfig() {
    return {
      url: process.env.SUPABASE_URL || '',
      key: process.env.SUPABASE_ANON_KEY || '',
    };
  }

  isConfigured() {
    const config = this.getConfig();
    return Boolean(config.url && config.key);
  }

  getStatus() {
    const local = this.repositories.getSyncStatus();
    return {
      ...local,
      configured: this.isConfigured(),
      state: this.running ? 'syncing' : this.lastState,
      lastError: this.lastError,
    };
  }

  async isOnline() {
    if (!this.isConfigured()) return false;
    try {
      await this.request('/rest/v1/sync_devices?select=id&limit=1', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }

  async syncNow() {
    if (this.running) return { ...this.getStatus(), skipped: true };
    if (!this.isConfigured()) {
      this.lastState = 'not_configured';
      this.lastError = '';
      return { ...this.getStatus(), message: 'Supabase não configurado.' };
    }

    this.running = true;
    this.lastState = 'syncing';
    this.lastError = '';
    this.repositories.logAudit?.('SYNC_START', 'sync', null, { source: 'sync' }, { skipQueue: true });
    try {
      await this.registerDevice();
      const pushed = await this.pushQueue();
      const pulled = await this.pullRemoteChanges();
      this.lastState = 'online';
      this.repositories.logAudit?.('SYNC_SUCCESS', 'sync', null, { source: 'sync', pushed, pulled }, { skipQueue: true });
      return { ...this.getStatus(), pushed, pulled };
    } catch (error) {
      this.lastState = 'error';
      this.lastError = error.message;
      this.repositories.logAudit?.('SYNC_ERROR', 'sync', null, { source: 'sync', message: error.message }, { skipQueue: true });
      return { ...this.getStatus(), error: error.message };
    } finally {
      this.running = false;
    }
  }

  async retryFailed() {
    return this.syncNow();
  }

  async pushQueue() {
    const pending = this.repositories.listSyncQueue({ limit: 200 });
    let pushed = 0;
    for (const item of pending) {
      try {
        const remotePayload = this.repositories.getRemotePayload(item.entity, item.payload);
        const currentRemote = await this.fetchRemoteById(item.entity, remotePayload.id);
        if (currentRemote && new Date(currentRemote.updated_at).getTime() > new Date(remotePayload.updated_at).getTime()) {
          this.repositories.applyRemoteRecord(item.entity, currentRemote);
          this.repositories.markSyncQueueSynced(item.id, nowIso());
          pushed += 1;
          continue;
        }
        await this.upsert(item.entity, remotePayload);
        this.repositories.markSyncQueueSynced(item.id, nowIso());
        pushed += 1;
      } catch (error) {
        this.repositories.markSyncQueueError(item.id, error.message);
      }
    }
    if (pushed > 0) this.repositories.updateSyncMetadata({ lastPushAt: nowIso() });
    return pushed;
  }

  async pullRemoteChanges() {
    const lastPullAt = this.repositories.getSyncStatus().lastPullAt;
    let pulled = 0;
    for (const entity of ENTITY_ORDER) {
      const records = await this.fetchRemote(entity, lastPullAt);
      for (const record of records) {
        const result = this.repositories.applyRemoteRecord(entity, record);
        if (result?.applied) pulled += 1;
      }
    }
    this.repositories.updateSyncMetadata({ lastPullAt: nowIso() });
    return pulled;
  }

  async registerDevice() {
    const status = this.repositories.getSyncStatus();
    await this.request('/rest/v1/sync_devices?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: status.deviceId,
        name: process.env.COMPUTERNAME || process.env.HOSTNAME || 'Windows PC',
        last_seen_at: nowIso(),
      }),
    });
  }

  async upsert(entity, payload) {
    if (!payload?.id) throw new Error(`Registro sem UUID para ${entity}.`);
    await this.request(`/rest/v1/${TABLES[entity]}?on_conflict=id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload),
    });
  }

  async fetchRemote(entity, since) {
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('order', 'updated_at.asc');
    if (since) params.set('updated_at', `gt.${since}`);
    return this.request(`/rest/v1/${TABLES[entity]}?${params.toString()}`, { method: 'GET' });
  }

  async fetchRemoteById(entity, id) {
    if (!id) return null;
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('id', `eq.${id}`);
    params.set('limit', '1');
    const records = await this.request(`/rest/v1/${TABLES[entity]}?${params.toString()}`, { method: 'GET' });
    return records?.[0] || null;
  }

  async request(endpoint, options = {}) {
    const config = this.getConfig();
    const baseUrl = config.url.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Supabase HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}

module.exports = {
  SyncService,
};
