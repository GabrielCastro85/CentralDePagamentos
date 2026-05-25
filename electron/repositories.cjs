const { nowIso } = require('./database.cjs');
const { randomUUID } = require('node:crypto');

const OPERATION_STATUSES = [
  'AGUARDANDO_LISTA',
  'EM_ANDAMENTO',
  'AGUARDANDO_COMPROVANTES',
  'CONCLUIDA',
];

function boolToInt(value) {
  return value ? 1 : 0;
}

function toBool(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      row[key] = Boolean(row[key]);
    }
  }
  return row;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeMoney(value) {
  const number = parseMoney(value);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function parseMoney(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '').replace(/[^\d,.]/g, '');
  if (!text) return 0;

  const hasDecimalComma = /,\d{1,2}$/.test(text);
  const hasDecimalDot = /\.\d{1,2}$/.test(text) && !text.includes(',');

  if (hasDecimalComma) {
    return Number(text.replace(/\./g, '').replace(',', '.'));
  }

  if (hasDecimalDot) {
    return Number(text.replace(/,/g, ''));
  }

  return Number(text.replace(/\D/g, ''));
}

function required(value, message) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(message);
  }
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (size) => {
    const digits = cpf.slice(0, size);
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) sum += Number(digits[i]) * (size + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base, weights) => {
    const sum = base.split('').reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const digit1 = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digit2 = calc(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digit1 === Number(cnpj[12]) && digit2 === Number(cnpj[13]);
}

function isValidCpfOrCnpj(value) {
  const number = onlyDigits(value);
  if (!number) return true;
  if (number.length === 11) return isValidCpf(number);
  if (number.length === 14) return isValidCnpj(number);
  return false;
}

function isValidPixKey(value) {
  const key = String(value || '').trim();
  if (!key) return false;
  const numeric = onlyDigits(key);
  // Aceita qualquer número com 11 dígitos (CPF) ou 14 dígitos (CNPJ), sem exigir dígito verificador,
  // pois chaves PIX podem ser CPFs/CNPJs que não passam na validação aritmética mas são aceitos pelo BCB.
  if (numeric.length === 11) return true;
  if (numeric.length === 14) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return true;
  if (/^\+?\d{10,13}$/.test(numeric)) return true;
  if (/^[a-z0-9-]{25,80}$/i.test(key)) return true;
  return false;
}

function createRepositories(db) {
  let suppressSyncQueue = false;

  const syncEntities = {
    empresas: 'empresas',
    clientes: 'clientes',
    operacoes: 'operacoes',
    pagamentos: 'pagamentos',
    audit_logs: 'audit_logs',
  };

  function getDeviceId() {
    let row = db.prepare("SELECT value FROM sync_metadata WHERE key = 'deviceId'").get();
    if (!row?.value) {
      const deviceId = randomUUID();
      db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)').run('deviceId', deviceId);
      row = { value: deviceId };
    }
    return row.value;
  }

  function getMetadata(key) {
    return db.prepare('SELECT value FROM sync_metadata WHERE key = ?').get(key)?.value || '';
  }

  function setMetadata(key, value) {
    db.prepare('INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)').run(key, String(value || ''));
  }

  function syncDefaults(input = {}) {
    return {
      uuid: input.uuid || randomUUID(),
      syncStatus: input.syncStatus || 'PENDING',
      lastSyncedAt: input.lastSyncedAt || null,
      deviceId: input.deviceId || getDeviceId(),
      deletedAt: input.deletedAt || null,
    };
  }

  function getRaw(table, id) {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  }

  function getRawByUuid(table, uuid) {
    return db.prepare(`SELECT * FROM ${table} WHERE uuid = ?`).get(uuid);
  }

  function enqueueSync(entity, entityId, action, payload) {
    if (suppressSyncQueue) return;
    db.prepare(`
      INSERT INTO sync_queue (entity, entityId, action, payload, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(entity, entityId, action, JSON.stringify(payload), nowIso());
  }

  function logAudit(action, entity, entityId, details = {}, { skipQueue = false } = {}) {
    if (suppressSyncQueue) return;
    const timestamp = nowIso();
    const payload = {
      uuid: randomUUID(),
      action,
      entity,
      entityId,
      details: JSON.stringify(details),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      syncStatus: skipQueue ? 'SYNCED' : 'PENDING',
      lastSyncedAt: skipQueue ? timestamp : null,
      deviceId: getDeviceId(),
    };
    const result = db.prepare(`
      INSERT INTO audit_logs (uuid, action, entity, entityId, details, createdAt, updatedAt, deletedAt, syncStatus, lastSyncedAt, deviceId)
      VALUES (@uuid, @action, @entity, @entityId, @details, @createdAt, @updatedAt, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId)
    `).run(payload);
    if (!skipQueue) {
      enqueueSync('audit_logs', result.lastInsertRowid, 'CREATE', { ...payload, id: result.lastInsertRowid });
    }
  }

  function listAuditLogs({ limit = 100, query = '' } = {}) {
    const hasQuery = String(query || '').trim();
    const sql = `
      SELECT * FROM audit_logs
      ${hasQuery ? 'WHERE action LIKE @query OR entity LIKE @query OR details LIKE @query' : ''}
      ORDER BY createdAt DESC, id DESC
      LIMIT @limit
    `;
    const params = { limit: Number(limit) || 100 };
    if (hasQuery) params.query = `%${hasQuery}%`;
    return db.prepare(sql).all(params).map((row) => ({
      ...row,
      details: safeJson(row.details),
    }));
  }

  function markEntitySyncStatus(entity, entityId, status, lastSyncedAt = null) {
    const table = syncEntities[entity];
    if (!table) return;
    db.prepare(`UPDATE ${table} SET syncStatus = ?, lastSyncedAt = COALESCE(?, lastSyncedAt) WHERE id = ?`).run(status, lastSyncedAt, entityId);
  }

  function listEmpresas({ activeOnly = false } = {}) {
    const clauses = ['deletedAt IS NULL'];
    if (activeOnly) clauses.push('ativo = 1');
    const sql = `SELECT * FROM empresas WHERE ${clauses.join(' AND ')} ORDER BY apelido`;
    return db.prepare(sql).all().map((row) => toBool(row, ['ativo', 'destaque']));
  }

  function saveEmpresa(input) {
    required(input.apelido, 'Informe o apelido da empresa/conta.');
    if (input.cnpj && !isValidCnpj(input.cnpj)) {
      throw new Error('CNPJ da empresa inválido. Confira os números informados.');
    }
    const payload = {
      apelido: input.apelido.trim(),
      razaoSocial: input.razaoSocial?.trim() || '',
      cnpj: input.cnpj?.trim() || '',
      banco: input.banco?.trim() || '',
      agencia: input.agencia?.trim() || '',
      conta: input.conta?.trim() || '',
      ativo: boolToInt(input.ativo !== false),
      destaque: boolToInt(input.destaque || false),
      updatedAt: nowIso(),
      ...syncDefaults(input),
    };

    if (input.id) {
      db.prepare(`
        UPDATE empresas
        SET apelido=@apelido, razaoSocial=@razaoSocial, cnpj=@cnpj, banco=@banco,
            agencia=@agencia, conta=@conta, ativo=@ativo, destaque=@destaque, updatedAt=@updatedAt,
            uuid=COALESCE(uuid, @uuid), syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt,
            deviceId=@deviceId, deletedAt=@deletedAt
        WHERE id=@id
      `).run({ ...payload, id: input.id });
      const saved = getRaw('empresas', input.id);
      enqueueSync('empresas', input.id, 'UPDATE', saved);
      logAudit('UPDATE', 'empresas', input.id, { uuid: saved.uuid });
      return toBool(saved, ['ativo', 'destaque']);
    }

    const createdAt = nowIso();
    const result = db.prepare(`
      INSERT INTO empresas (
        apelido, razaoSocial, cnpj, banco, agencia, conta, ativo, destaque, createdAt, updatedAt,
        uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
      )
      VALUES (
        @apelido, @razaoSocial, @cnpj, @banco, @agencia, @conta, @ativo, @destaque, @createdAt, @updatedAt,
        @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
      )
    `).run({ ...payload, createdAt });
    const saved = getRaw('empresas', result.lastInsertRowid);
    enqueueSync('empresas', result.lastInsertRowid, 'CREATE', saved);
    logAudit('CREATE', 'empresas', result.lastInsertRowid, { uuid: saved.uuid });
    return toBool(saved, ['ativo', 'destaque']);
  }

  function getEmpresa(id) {
    const row = db.prepare('SELECT * FROM empresas WHERE id = ? AND deletedAt IS NULL').get(id);
    return row ? toBool(row, ['ativo']) : null;
  }

  function deleteEmpresa(id) {
    const current = getRaw('empresas', id);
    if (!current) return 0;
    const deletedAt = nowIso();
    const changes = db.prepare("UPDATE empresas SET deletedAt = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?").run(deletedAt, deletedAt, id).changes;
    const saved = getRaw('empresas', id);
    enqueueSync('empresas', id, 'DELETE', saved);
    logAudit('DELETE', 'empresas', id, { uuid: saved.uuid });
    return changes;
  }

  function listClientes({ activeOnly = false } = {}) {
    const clauses = ['deletedAt IS NULL'];
    if (activeOnly) clauses.push('ativo = 1');
    const sql = `SELECT * FROM clientes WHERE ${clauses.join(' AND ')} ORDER BY nomeCurto`;
    return db.prepare(sql).all().map((row) => toBool(row, ['ativo', 'destaque']));
  }

  function saveCliente(input) {
    required(input.nomeCurto, 'Informe o nome curto do cliente.');
    const payload = {
      nomeCurto: input.nomeCurto.trim(),
      razaoSocial: input.razaoSocial?.trim() || '',
      grupoWhatsapp: input.grupoWhatsapp?.trim() || '',
      observacoes: input.observacoes?.trim() || '',
      ativo: boolToInt(input.ativo !== false),
      destaque: boolToInt(input.destaque || false),
      updatedAt: nowIso(),
      ...syncDefaults(input),
    };

    if (input.id) {
      db.prepare(`
        UPDATE clientes
        SET nomeCurto=@nomeCurto, razaoSocial=@razaoSocial, grupoWhatsapp=@grupoWhatsapp,
            observacoes=@observacoes, ativo=@ativo, destaque=@destaque, updatedAt=@updatedAt,
            uuid=COALESCE(uuid, @uuid), syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt,
            deviceId=@deviceId, deletedAt=@deletedAt
        WHERE id=@id
      `).run({ ...payload, id: input.id });
      const saved = getRaw('clientes', input.id);
      enqueueSync('clientes', input.id, 'UPDATE', saved);
      logAudit('UPDATE', 'clientes', input.id, { uuid: saved.uuid });
      return toBool(saved, ['ativo', 'destaque']);
    }

    const createdAt = nowIso();
    const result = db.prepare(`
      INSERT INTO clientes (
        nomeCurto, razaoSocial, grupoWhatsapp, observacoes, ativo, destaque, createdAt, updatedAt,
        uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
      )
      VALUES (
        @nomeCurto, @razaoSocial, @grupoWhatsapp, @observacoes, @ativo, @destaque, @createdAt, @updatedAt,
        @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
      )
    `).run({ ...payload, createdAt });
    const saved = getRaw('clientes', result.lastInsertRowid);
    enqueueSync('clientes', result.lastInsertRowid, 'CREATE', saved);
    logAudit('CREATE', 'clientes', result.lastInsertRowid, { uuid: saved.uuid });
    return toBool(saved, ['ativo', 'destaque']);
  }

  function getCliente(id) {
    const row = db.prepare('SELECT * FROM clientes WHERE id = ? AND deletedAt IS NULL').get(id);
    return row ? toBool(row, ['ativo']) : null;
  }

  function deleteCliente(id) {
    const current = getRaw('clientes', id);
    if (!current) return 0;
    const deletedAt = nowIso();
    const changes = db.prepare("UPDATE clientes SET deletedAt = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?").run(deletedAt, deletedAt, id).changes;
    const saved = getRaw('clientes', id);
    enqueueSync('clientes', id, 'DELETE', saved);
    logAudit('DELETE', 'clientes', id, { uuid: saved.uuid });
    return changes;
  }

  function saveOperacao(input) {
    required(input.data, 'Informe a data da operação.');
    required(input.clienteId, 'Selecione um cliente.');
    required(input.empresaId, 'Selecione uma empresa/conta.');
    if (normalizeMoney(input.valorRecebido) <= 0) {
      throw new Error('Informe um valor recebido maior que zero.');
    }
    if (!OPERATION_STATUSES.includes(input.status)) {
      throw new Error('Status de operação inválido.');
    }

    const payload = {
      data: input.data,
      clienteId: Number(input.clienteId),
      empresaId: Number(input.empresaId),
      valorRecebido: normalizeMoney(input.valorRecebido),
      status: input.status,
      observacao: input.observacao?.trim() || '',
      updatedAt: nowIso(),
      ...syncDefaults(input),
    };

    if (input.id) {
      const before = getRaw('operacoes', input.id);
      db.prepare(`
        UPDATE operacoes
        SET data=@data, clienteId=@clienteId, empresaId=@empresaId, valorRecebido=@valorRecebido,
            status=@status, observacao=@observacao, updatedAt=@updatedAt,
            uuid=COALESCE(uuid, @uuid), syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt,
            deviceId=@deviceId, deletedAt=@deletedAt
        WHERE id=@id
      `).run({ ...payload, id: input.id });
      const saved = getOperacao(input.id);
      enqueueSync('operacoes', input.id, 'UPDATE', getRaw('operacoes', input.id));
      const raw = getRaw('operacoes', input.id);
      const action = before?.status !== 'CONCLUIDA' && payload.status === 'CONCLUIDA'
        ? 'CONCLUDE'
        : before?.status === 'CONCLUIDA' && payload.status !== 'CONCLUIDA'
          ? 'REOPEN'
          : 'UPDATE';
      logAudit(action, 'operacoes', input.id, { uuid: raw.uuid, statusAnterior: before?.status, statusNovo: payload.status });
      return saved;
    }

    const createdAt = nowIso();
    const result = db.prepare(`
      INSERT INTO operacoes (
        data, clienteId, empresaId, valorRecebido, status, observacao, createdAt, updatedAt,
        uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
      )
      VALUES (
        @data, @clienteId, @empresaId, @valorRecebido, @status, @observacao, @createdAt, @updatedAt,
        @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
      )
    `).run({ ...payload, createdAt });
    const id = result.lastInsertRowid;
    db.prepare('UPDATE operacoes SET codigo = ? WHERE id = ?').run(`OP${String(id).padStart(4, '0')}`, id);
    const saved = getOperacao(id);
    enqueueSync('operacoes', id, 'CREATE', getRaw('operacoes', id));
    logAudit('CREATE', 'operacoes', id, { uuid: getRaw('operacoes', id).uuid });
    return saved;
  }

  function deleteOperacao(id) {
    const current = getRaw('operacoes', id);
    if (!current) return 0;
    const deletedAt = nowIso();
    const pagamentos = db.prepare('SELECT id FROM pagamentos WHERE operacaoId = ? AND deletedAt IS NULL').all(id);
    const changes = db.prepare("UPDATE operacoes SET deletedAt = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?").run(deletedAt, deletedAt, id).changes;
    const saved = getRaw('operacoes', id);
    enqueueSync('operacoes', id, 'DELETE', saved);
    logAudit('DELETE', 'operacoes', id, { uuid: saved.uuid });
    for (const pagamento of pagamentos) {
      db.prepare("UPDATE pagamentos SET deletedAt = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?").run(deletedAt, deletedAt, pagamento.id);
      const savedPagamento = getRaw('pagamentos', pagamento.id);
      enqueueSync('pagamentos', pagamento.id, 'DELETE', savedPagamento);
      logAudit('DELETE', 'pagamentos', pagamento.id, { uuid: savedPagamento.uuid, operacaoUuid: saved.uuid });
    }
    return changes;
  }

  function getOperacao(id) {
    const row = db.prepare(operationSelectSql('WHERE o.id = ? AND o.deletedAt IS NULL')).get(id);
    return row ? decorateOperation(row) : null;
  }

  function listOperacoes(filters = {}) {
    const clauses = [];
    const params = {};

    clauses.push('o.deletedAt IS NULL');
    if (filters.openOnly) clauses.push("o.status != 'CONCLUIDA'");
    if (filters.startDate) {
      clauses.push('o.data >= @startDate');
      params.startDate = filters.startDate;
    }
    if (filters.endDate) {
      clauses.push('o.data <= @endDate');
      params.endDate = filters.endDate;
    }
    if (filters.clienteId) {
      clauses.push('o.clienteId = @clienteId');
      params.clienteId = Number(filters.clienteId);
    }
    if (filters.empresaId) {
      clauses.push('o.empresaId = @empresaId');
      params.empresaId = Number(filters.empresaId);
    }
    if (filters.status) {
      clauses.push('o.status = @status');
      params.status = filters.status;
    }
    if (filters.query) {
      clauses.push("(o.codigo LIKE @query OR c.nomeCurto LIKE @query OR e.apelido LIKE @query OR o.observacao LIKE @query)");
      params.query = `%${filters.query}%`;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return db.prepare(operationSelectSql(where)).all(params).map(decorateOperation);
  }

  function operationSelectSql(where) {
    return `
      SELECT
        o.*,
        c.nomeCurto AS clienteNome,
        c.destaque AS clienteDestaque,
        e.apelido AS empresaApelido,
        e.cnpj AS empresaCnpj,
        COALESCE(SUM(CASE WHEN p.pago = 1 THEN p.valor ELSE 0 END), 0) AS totalPago,
        COALESCE(SUM(CASE WHEN p.pago = 0 THEN 1 ELSE 0 END), 0) AS pagamentosPendentes,
        COALESCE(SUM(CASE WHEN p.pago = 1 AND p.comprovanteEnviado = 0 THEN 1 ELSE 0 END), 0) AS comprovantesPendentes,
        COUNT(p.id) AS quantidadePagamentos
      FROM operacoes o
      JOIN clientes c ON c.id = o.clienteId
      JOIN empresas e ON e.id = o.empresaId
      LEFT JOIN pagamentos p ON p.operacaoId = o.id AND p.deletedAt IS NULL
      ${where}
      GROUP BY o.id
      ORDER BY o.data DESC, o.id DESC
    `;
  }

  function decorateOperation(row) {
    const totalPago = normalizeMoney(row.totalPago);
    const saldo = normalizeMoney(row.valorRecebido - totalPago);
    return {
      ...row,
      valorRecebido: normalizeMoney(row.valorRecebido),
      totalPago,
      saldo,
      alertaSaldoNegativo: saldo < 0,
      clienteDestaque: Boolean(row.clienteDestaque),
      pagamentosPendentes: Number(row.pagamentosPendentes || 0),
      comprovantesPendentes: Number(row.comprovantesPendentes || 0),
      quantidadePagamentos: Number(row.quantidadePagamentos || 0),
    };
  }

  function listPagamentos(operacaoId) {
    const rows = db.prepare('SELECT * FROM pagamentos WHERE operacaoId = ? AND deletedAt IS NULL ORDER BY data DESC, id DESC').all(operacaoId);
    const duplicateKeys = getDuplicateKeys(operacaoId);
    return rows.map((row) => decoratePayment(row, duplicateKeys));
  }

  function getPagamento(id) {
    const row = db.prepare('SELECT * FROM pagamentos WHERE id = ? AND deletedAt IS NULL').get(id);
    if (!row) return null;
    return decoratePayment(row, getDuplicateKeys(row.operacaoId));
  }

  function savePagamento(input) {
    required(input.operacaoId, 'Operação não informada.');
    required(input.data, 'Informe a data do pagamento.');
    required(input.favorecido, 'Informe o favorecido.');
    const tipoPagamento = input.tipoPagamento || 'PIX';
    // _import: true pula validações de formato (CPF/CNPJ e chave PIX) para importações
    // O usuário já revisou os dados na pré-visualização.
    const skipFormatValidation = Boolean(input._import);
    const valor = normalizeMoney(input.valor);
    if (valor <= 0) {
      throw new Error('Informe um valor de pagamento maior que zero.');
    }
    if (!skipFormatValidation && input.documento && !isValidCpfOrCnpj(input.documento)) {
      throw new Error('CPF/CNPJ do favorecido inválido. Confira os números informados.');
    }
    if (tipoPagamento === 'PIX') {
      required(input.chavePix, 'Informe a chave PIX.');
      if (!skipFormatValidation && !isValidPixKey(input.chavePix)) {
        throw new Error('Chave PIX inválida. Use CPF, CNPJ, e-mail, telefone ou chave aleatória válida.');
      }
    }
    if (tipoPagamento === 'CONTA_BANCARIA') {
      required(input.banco, 'Informe o banco do favorecido.');
      required(input.agencia, 'Informe a agência do favorecido.');
      required(input.conta, 'Informe a conta do favorecido.');
    }
    const pago = boolToInt(input.pago);
    const comprovanteEnviado = boolToInt(input.comprovanteEnviado);
    if (!pago && comprovanteEnviado) {
      throw new Error('O comprovante só pode ser marcado depois que o pagamento estiver pago.');
    }

    const payload = {
      operacaoId: Number(input.operacaoId),
      data: input.data,
      favorecido: input.favorecido.trim(),
      documento: input.documento?.trim() || '',
      tipoPagamento,
      chavePix: input.chavePix?.trim() || '',
      banco: input.banco?.trim() || '',
      agencia: input.agencia?.trim() || '',
      tipoConta: input.tipoConta || 'NAO_INFORMADO',
      conta: input.conta?.trim() || '',
      digito: input.digito?.trim() || '',
      valor,
      pago,
      comprovanteEnviado,
      observacao: input.observacao?.trim() || '',
      updatedAt: nowIso(),
      ...syncDefaults(input),
    };

    return db.transaction(() => {
      if (input.id) {
        db.prepare(`
          UPDATE pagamentos
          SET operacaoId=@operacaoId, data=@data, favorecido=@favorecido, documento=@documento, tipoPagamento=@tipoPagamento,
              chavePix=@chavePix, banco=@banco, agencia=@agencia, tipoConta=@tipoConta, conta=@conta,
              digito=@digito, valor=@valor, pago=@pago, comprovanteEnviado=@comprovanteEnviado,
              observacao=@observacao, updatedAt=@updatedAt,
              uuid=COALESCE(uuid, @uuid), syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt,
              deviceId=@deviceId, deletedAt=@deletedAt
          WHERE id=@id
        `).run({ ...payload, id: input.id });
        syncOperacaoStatus(payload.operacaoId);
        const saved = getPagamento(input.id);
        enqueueSync('pagamentos', input.id, 'UPDATE', getRaw('pagamentos', input.id));
        logAudit('UPDATE', 'pagamentos', input.id, { uuid: getRaw('pagamentos', input.id).uuid });
        return saved;
      }

      const createdAt = nowIso();
      const result = db.prepare(`
        INSERT INTO pagamentos (
          operacaoId, data, favorecido, documento, tipoPagamento, chavePix, banco, agencia, tipoConta,
          conta, digito, valor, pago, comprovanteEnviado, observacao, createdAt, updatedAt,
          uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
        ) VALUES (
          @operacaoId, @data, @favorecido, @documento, @tipoPagamento, @chavePix, @banco, @agencia, @tipoConta,
          @conta, @digito, @valor, @pago, @comprovanteEnviado, @observacao, @createdAt, @updatedAt,
          @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
        )
      `).run({ ...payload, createdAt });
      syncOperacaoStatus(payload.operacaoId);
      const saved = getPagamento(result.lastInsertRowid);
      enqueueSync('pagamentos', result.lastInsertRowid, 'CREATE', getRaw('pagamentos', result.lastInsertRowid));
      logAudit(input.sourcePaymentId ? 'DUPLICATE' : 'CREATE', 'pagamentos', result.lastInsertRowid, {
        uuid: getRaw('pagamentos', result.lastInsertRowid).uuid,
        sourcePaymentId: input.sourcePaymentId || null,
      });
      return saved;
    })();
  }

  function updatePagamentoFlags({ id, pago, comprovanteEnviado }) {
    const current = getPagamento(id);
    if (!current) throw new Error('Pagamento não encontrado.');
    const nextPago = pago === undefined ? current.pago : Boolean(pago);
    const nextComprovante = comprovanteEnviado === undefined ? current.comprovanteEnviado : Boolean(comprovanteEnviado);
    if (!nextPago && nextComprovante) {
      throw new Error('O comprovante só pode ser marcado depois que o pagamento estiver pago.');
    }
    return db.transaction(() => {
      db.prepare("UPDATE pagamentos SET pago = ?, comprovanteEnviado = ?, updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?").run(
        boolToInt(nextPago),
        boolToInt(nextComprovante),
        nowIso(),
        id,
      );
      syncOperacaoStatus(current.operacaoId);
      const saved = getPagamento(id);
      enqueueSync('pagamentos', id, 'UPDATE', getRaw('pagamentos', id));
      let action = 'UPDATE_FLAGS';
      if (!current.pago && nextPago) action = 'MARK_PAID';
      if (current.pago && !nextPago) action = 'UNMARK_PAID';
      if (!current.comprovanteEnviado && nextComprovante) action = 'MARK_COMPROVANTE';
      if (current.comprovanteEnviado && !nextComprovante) action = 'UNMARK_COMPROVANTE';
      logAudit(action, 'pagamentos', id, { uuid: getRaw('pagamentos', id).uuid, pago: nextPago, comprovanteEnviado: nextComprovante });
      return saved;
    })();
  }

  function deletePagamento(id) {
    const current = getRaw('pagamentos', id);
    if (!current) return 0;
    return db.transaction(() => {
      const deletedAt = nowIso();
      const changes = db.prepare("UPDATE pagamentos SET deletedAt = ?, syncStatus = 'PENDING', updatedAt = ? WHERE id = ?").run(deletedAt, deletedAt, id).changes;
      syncOperacaoStatus(current.operacaoId);
      const saved = getRaw('pagamentos', id);
      enqueueSync('pagamentos', id, 'DELETE', saved);
      logAudit('DELETE', 'pagamentos', id, { uuid: saved.uuid, favorecido: current.favorecido, valor: current.valor });
      return changes;
    })();
  }

  function syncOperacaoStatus(id, { enqueue = true, syncStatus = 'PENDING' } = {}) {
    const stats = db.prepare(`
      SELECT
        COUNT(id) AS total,
        SUM(CASE WHEN pago = 0 THEN 1 ELSE 0 END) AS pendentes,
        SUM(CASE WHEN pago = 1 AND comprovanteEnviado = 0 THEN 1 ELSE 0 END) AS comprovantesFaltando
      FROM pagamentos WHERE operacaoId = ? AND deletedAt IS NULL
    `).get(id);

    let status;
    if (!stats || stats.total === 0) {
      status = 'AGUARDANDO_LISTA';
    } else if (stats.pendentes > 0) {
      status = 'EM_ANDAMENTO';
    } else if (stats.comprovantesFaltando > 0) {
      status = 'AGUARDANDO_COMPROVANTES';
    } else {
      status = 'CONCLUIDA';
    }

    const updatedAt = nowIso();
    db.prepare('UPDATE operacoes SET status = ?, updatedAt = ?, syncStatus = ? WHERE id = ?').run(status, updatedAt, syncStatus, id);
    const raw = getRaw('operacoes', id);
    if (enqueue && raw) enqueueSync('operacoes', id, 'UPDATE', raw);
  }

  // ─── Contas a Pagar ──────────────────────────────────────────────────────────
  function listContas({ incluirPagas = true } = {}) {
    const sql = incluirPagas
      ? `SELECT * FROM contas WHERE deletedAt IS NULL ORDER BY CASE WHEN pago=0 THEN 0 ELSE 1 END, vencimento ASC, id DESC`
      : `SELECT * FROM contas WHERE deletedAt IS NULL AND pago=0 ORDER BY vencimento ASC, id DESC`;
    return db.prepare(sql).all();
  }

  function saveConta(input) {
    const now = nowIso();
    const deviceId = getDeviceId();
    if (input.id) {
      db.prepare(`
        UPDATE contas SET descricao=@descricao, valor=@valor, vencimento=@vencimento,
          categoria=@categoria, observacao=@observacao, updatedAt=@updatedAt
        WHERE id=@id
      `).run({ descricao: input.descricao, valor: Number(input.valor) || 0, vencimento: input.vencimento || null, categoria: input.categoria || '', observacao: input.observacao || '', updatedAt: now, id: input.id });
      return db.prepare('SELECT * FROM contas WHERE id = ?').get(input.id);
    }
    const result = db.prepare(`
      INSERT INTO contas (uuid, descricao, valor, vencimento, pago, pagoEm, comprovantePath, categoria, observacao, createdAt, updatedAt, deviceId)
      VALUES (@uuid, @descricao, @valor, @vencimento, 0, NULL, NULL, @categoria, @observacao, @createdAt, @updatedAt, @deviceId)
    `).run({ uuid: randomUUID(), descricao: input.descricao || '', valor: Number(input.valor) || 0, vencimento: input.vencimento || null, categoria: input.categoria || '', observacao: input.observacao || '', createdAt: now, updatedAt: now, deviceId });
    return db.prepare('SELECT * FROM contas WHERE id = ?').get(result.lastInsertRowid);
  }

  function deleteConta(id) {
    const now = nowIso();
    return db.prepare('UPDATE contas SET deletedAt=?, updatedAt=? WHERE id=?').run(now, now, id).changes;
  }

  function pagarConta(id, pago) {
    const now = nowIso();
    return db.prepare('UPDATE contas SET pago=?, pagoEm=?, updatedAt=? WHERE id=?').run(pago ? 1 : 0, pago ? now : null, now, id).changes;
  }

  function salvarComprovanteConta(id, comprovantePath) {
    return db.prepare('UPDATE contas SET comprovantePath=?, updatedAt=? WHERE id=?').run(comprovantePath, nowIso(), id).changes;
  }

  function getContasVencendoHoje() {
    const today = nowIso().slice(0, 10);
    return db.prepare("SELECT * FROM contas WHERE deletedAt IS NULL AND pago=0 AND vencimento=?").all(today);
  }

  function reopenOperacao(id) {
    db.prepare("UPDATE operacoes SET status = 'EM_ANDAMENTO', updatedAt = ?, syncStatus = 'PENDING' WHERE id = ?").run(nowIso(), id);
    const saved = getOperacao(id);
    enqueueSync('operacoes', id, 'UPDATE', getRaw('operacoes', id));
    logAudit('REOPEN', 'operacoes', id, { uuid: getRaw('operacoes', id).uuid });
    return saved;
  }

  function duplicateKey(row) {
    return [
      normalizeText(row.favorecido),
      normalizeMoney(row.valor).toFixed(2),
      normalizeText(row.documento || row.chavePix),
    ].join('|');
  }

  function getDuplicateKeys(operacaoId) {
    const rows = db.prepare('SELECT favorecido, valor, documento, chavePix FROM pagamentos WHERE operacaoId = ? AND deletedAt IS NULL').all(operacaoId);
    const counts = new Map();
    for (const row of rows) {
      const key = duplicateKey(row);
      if (!key.endsWith('|')) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function decoratePayment(row, duplicateKeys) {
    toBool(row, ['pago', 'comprovanteEnviado']);
    return {
      ...row,
      valor: normalizeMoney(row.valor),
      alertaDuplicidade: (duplicateKeys.get(duplicateKey(row)) || 0) > 1,
    };
  }

  function getOperationalDashboard() {
    const operacoes = listOperacoes({ openOnly: true });
    const cards = operacoes.reduce(
      (acc, op) => {
        acc.recebidoEmAberto += op.valorRecebido;
        acc.pagoEmAberto += op.totalPago;
        acc.saldoSobResponsabilidade += op.saldo;
        acc.operacoesAbertas += 1;
        acc.pagamentosPendentes += op.pagamentosPendentes;
        acc.comprovantesPendentes += op.comprovantesPendentes;
        return acc;
      },
      {
        recebidoEmAberto: 0,
        pagoEmAberto: 0,
        saldoSobResponsabilidade: 0,
        operacoesAbertas: 0,
        pagamentosPendentes: 0,
        comprovantesPendentes: 0,
      },
    );
    return { cards: roundCards(cards), operacoes };
  }

  function getHistoricalDashboard(filters = {}) {
    const operacoes = listOperacoes(filters);
    const payments = db.prepare(`
      SELECT p.*, o.clienteId, o.empresaId
      FROM pagamentos p
      JOIN operacoes o ON o.id = p.operacaoId
      WHERE p.deletedAt IS NULL AND o.deletedAt IS NULL
    `).all();

    const scopedIds = new Set(operacoes.map((op) => op.id));
    const scopedPayments = payments.filter((payment) => scopedIds.has(payment.operacaoId));
    const cards = roundCards({
      totalRecebido: operacoes.reduce((sum, op) => sum + op.valorRecebido, 0),
      totalPago: operacoes.reduce((sum, op) => sum + op.totalPago, 0),
      sobraTotal: operacoes.reduce((sum, op) => sum + op.saldo, 0),
      quantidadeOperacoes: operacoes.length,
      quantidadePagamentos: scopedPayments.length,
    });

    return {
      cards,
      porCliente: summarize(operacoes, 'clienteId', 'clienteNome'),
      porEmpresa: summarize(operacoes, 'empresaId', 'empresaApelido', 'empresaCnpj'),
      operacoes,
    };
  }

  function summarize(operacoes, idKey, labelKey, extraKey) {
    const map = new Map();
    for (const op of operacoes) {
      const id = op[idKey];
      if (!map.has(id)) {
        map.set(id, {
          id,
          nome: op[labelKey],
          extra: extraKey ? op[extraKey] : '',
          totalRecebido: 0,
          totalPago: 0,
          sobra: 0,
          quantidadeOperacoes: 0,
        });
      }
      const item = map.get(id);
      item.totalRecebido += op.valorRecebido;
      item.totalPago += op.totalPago;
      item.sobra += op.saldo;
      item.quantidadeOperacoes += 1;
    }
    return Array.from(map.values()).map(roundCards);
  }

  function roundCards(obj) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, typeof value === 'number' ? normalizeMoney(value) : value]),
    );
  }

  function getConfig() {
    const rows = db.prepare('SELECT chave, valor FROM configuracoes').all();
    return Object.fromEntries(rows.map(({ chave, valor }) => [chave, valor]));
  }

  function setConfig(input) {
    const stmt = db.prepare('INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)');
    for (const [chave, valor] of Object.entries(input)) {
      stmt.run(chave, String(valor));
    }
    return getConfig();
  }

  function exportBackup() {
    return {
      version: 1,
      exportedAt: nowIso(),
      empresas: db.prepare('SELECT * FROM empresas ORDER BY id').all(),
      clientes: db.prepare('SELECT * FROM clientes ORDER BY id').all(),
      operacoes: db.prepare('SELECT * FROM operacoes ORDER BY id').all(),
      pagamentos: db.prepare('SELECT * FROM pagamentos ORDER BY id').all(),
    };
  }

  function importBackup(data) {
    if (!data || !Array.isArray(data.empresas) || !Array.isArray(data.clientes)) {
      throw new Error('Arquivo de backup inválido.');
    }

    suppressSyncQueue = true;
    try {
      db.transaction(() => {
      db.exec('DELETE FROM pagamentos; DELETE FROM operacoes; DELETE FROM clientes; DELETE FROM empresas;');
      for (const empresa of data.empresas) {
        const row = withSyncBackupDefaults(empresa);
        db.prepare(`
          INSERT INTO empresas (
            id, apelido, razaoSocial, cnpj, banco, agencia, conta, ativo, createdAt, updatedAt,
            uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
          )
          VALUES (
            @id, @apelido, @razaoSocial, @cnpj, @banco, @agencia, @conta, @ativo, @createdAt, @updatedAt,
            @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
          )
        `).run(row);
      }
      for (const cliente of data.clientes) {
        const row = withSyncBackupDefaults(cliente);
        db.prepare(`
          INSERT INTO clientes (
            id, nomeCurto, razaoSocial, grupoWhatsapp, observacoes, ativo, createdAt, updatedAt,
            uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
          )
          VALUES (
            @id, @nomeCurto, @razaoSocial, @grupoWhatsapp, @observacoes, @ativo, @createdAt, @updatedAt,
            @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
          )
        `).run(row);
      }
      for (const operacao of data.operacoes || []) {
        const row = withSyncBackupDefaults(operacao);
        db.prepare(`
          INSERT INTO operacoes (
            id, codigo, data, clienteId, empresaId, valorRecebido, status, observacao, createdAt, updatedAt,
            uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
          )
          VALUES (
            @id, @codigo, @data, @clienteId, @empresaId, @valorRecebido, @status, @observacao, @createdAt, @updatedAt,
            @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
          )
        `).run(row);
      }
      for (const pagamento of data.pagamentos || []) {
        const row = withSyncBackupDefaults(pagamento);
        db.prepare(`
          INSERT INTO pagamentos (
            id, operacaoId, data, favorecido, documento, tipoPagamento, chavePix, banco, agencia, tipoConta,
            conta, digito, valor, pago, comprovanteEnviado, observacao, createdAt, updatedAt,
            uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
          ) VALUES (
            @id, @operacaoId, @data, @favorecido, @documento, @tipoPagamento, @chavePix, @banco, @agencia, @tipoConta,
            @conta, @digito, @valor, @pago, @comprovanteEnviado, @observacao, @createdAt, @updatedAt,
            @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
          )
        `).run(row);
      }
      })();
    } finally {
      suppressSyncQueue = false;
    }

    return true;
  }

  function withSyncBackupDefaults(row) {
    return {
      ...row,
      uuid: row.uuid || randomUUID(),
      deletedAt: row.deletedAt || null,
      syncStatus: row.syncStatus || 'PENDING',
      lastSyncedAt: row.lastSyncedAt || null,
      deviceId: row.deviceId || getDeviceId(),
    };
  }

  function exportCsv() {
    const rows = db.prepare(`
      SELECT
        o.codigo AS operacao,
        o.data AS dataOperacao,
        c.nomeCurto AS cliente,
        e.apelido AS empresa,
        e.cnpj AS cnpjEmpresa,
        o.valorRecebido,
        o.status,
        p.data AS dataPagamento,
        p.favorecido,
        p.documento,
        p.tipoPagamento,
        p.chavePix,
        p.banco,
        p.agencia,
        p.conta,
        p.digito,
        p.valor AS valorPagamento,
        p.pago,
        p.comprovanteEnviado
      FROM operacoes o
      JOIN clientes c ON c.id = o.clienteId
      JOIN empresas e ON e.id = o.empresaId
      LEFT JOIN pagamentos p ON p.operacaoId = o.id AND p.deletedAt IS NULL
      WHERE o.deletedAt IS NULL
      ORDER BY o.data DESC, o.id DESC, p.id DESC
    `).all();
    const headers = Object.keys(rows[0] || {
      operacao: '',
      dataOperacao: '',
      cliente: '',
      empresa: '',
      cnpjEmpresa: '',
      valorRecebido: '',
      status: '',
      dataPagamento: '',
      favorecido: '',
      documento: '',
      tipoPagamento: '',
      chavePix: '',
      banco: '',
      agencia: '',
      conta: '',
      digito: '',
      valorPagamento: '',
      pago: '',
      comprovanteEnviado: '',
    });
    return [headers.join(';'), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(';'))].join('\n');
  }

  function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  function getSyncStatus() {
    const pending = db.prepare('SELECT COUNT(*) AS count FROM sync_queue WHERE syncedAt IS NULL').get().count;
    const errors = db.prepare("SELECT COUNT(*) AS count FROM sync_queue WHERE syncedAt IS NULL AND error IS NOT NULL AND error != ''").get().count;
    return {
      deviceId: getDeviceId(),
      pending,
      errors,
      lastPullAt: getMetadata('lastPullAt'),
      lastPushAt: getMetadata('lastPushAt'),
    };
  }

  function listSyncQueue({ limit = 50 } = {}) {
    return db.prepare(`
      SELECT * FROM sync_queue
      WHERE syncedAt IS NULL
      ORDER BY createdAt ASC, id ASC
      LIMIT ?
    `).all(limit).map((item) => ({ ...item, payload: JSON.parse(item.payload) }));
  }

  function markSyncQueueSynced(id, syncedAt = nowIso()) {
    const item = db.prepare('SELECT entity, entityId FROM sync_queue WHERE id = ?').get(id);
    db.prepare('UPDATE sync_queue SET syncedAt = ?, error = NULL WHERE id = ?').run(syncedAt, id);
    if (item) markEntitySyncStatus(item.entity, item.entityId, 'SYNCED', syncedAt);
  }

  function markSyncQueueError(id, error) {
    const message = String(error || 'Erro desconhecido').slice(0, 800);
    const item = db.prepare('SELECT entity, entityId FROM sync_queue WHERE id = ?').get(id);
    db.prepare('UPDATE sync_queue SET attempts = attempts + 1, error = ? WHERE id = ?').run(message, id);
    if (item) markEntitySyncStatus(item.entity, item.entityId, 'ERROR');
  }

  function updateSyncMetadata(values) {
    for (const [key, value] of Object.entries(values)) setMetadata(key, value);
    return getSyncStatus();
  }

  function getRemotePayload(entity, localRow) {
    return localToRemote(entity, localRow);
  }

  function applyRemoteRecord(entity, remoteRecord) {
    const table = syncEntities[entity];
    if (!table || !remoteRecord?.id) return null;
    const localPayload = remoteToLocal(entity, remoteRecord);
    const current = getRawByUuid(table, localPayload.uuid);

    suppressSyncQueue = true;
    try {
      if (current && new Date(current.updatedAt).getTime() > new Date(localPayload.updatedAt).getTime()) {
        return { applied: false, reason: 'local_newer', local: current };
      }

      if (entity === 'empresas') return upsertRemoteEmpresa(localPayload, current);
      if (entity === 'clientes') return upsertRemoteCliente(localPayload, current);
      if (entity === 'operacoes') return upsertRemoteOperacao(localPayload, current);
      if (entity === 'pagamentos') return upsertRemotePagamento(localPayload, current);
      if (entity === 'audit_logs') return upsertRemoteAuditLog(localPayload, current);
      return null;
    } finally {
      suppressSyncQueue = false;
    }
  }

  // node:sqlite rejeita params extras não presentes na SQL. Esta função filtra o objeto
  // mantendo apenas as chaves que aparecem como @chave na query.
  function sqlParams(sql, obj) {
    const used = new Set((sql.match(/@(\w+)/g) || []).map((p) => p.slice(1)));
    return Object.fromEntries(Object.entries(obj).filter(([k]) => used.has(k)));
  }

  function upsertRemoteEmpresa(row, current) {
    const payload = { ...row, syncStatus: 'SYNCED', lastSyncedAt: nowIso() };
    if (current) {
      const sql = `
        UPDATE empresas SET apelido=@apelido, razaoSocial=@razaoSocial, cnpj=@cnpj, banco=@banco,
          agencia=@agencia, conta=@conta, ativo=@ativo, createdAt=@createdAt, updatedAt=@updatedAt,
          deletedAt=@deletedAt, syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt, deviceId=@deviceId
        WHERE id=@id
      `;
      db.prepare(sql).run(sqlParams(sql, { ...payload, id: current.id }));
      return { applied: true, id: current.id };
    }
    const sql = `
      INSERT INTO empresas (apelido, razaoSocial, cnpj, banco, agencia, conta, ativo, createdAt, updatedAt, uuid, deletedAt, syncStatus, lastSyncedAt, deviceId)
      VALUES (@apelido, @razaoSocial, @cnpj, @banco, @agencia, @conta, @ativo, @createdAt, @updatedAt, @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId)
    `;
    const result = db.prepare(sql).run(sqlParams(sql, payload));
    return { applied: true, id: result.lastInsertRowid };
  }

  function upsertRemoteCliente(row, current) {
    const payload = { ...row, syncStatus: 'SYNCED', lastSyncedAt: nowIso() };
    if (current) {
      const sql = `
        UPDATE clientes SET nomeCurto=@nomeCurto, razaoSocial=@razaoSocial, grupoWhatsapp=@grupoWhatsapp,
          observacoes=@observacoes, ativo=@ativo, createdAt=@createdAt, updatedAt=@updatedAt,
          deletedAt=@deletedAt, syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt, deviceId=@deviceId
        WHERE id=@id
      `;
      db.prepare(sql).run(sqlParams(sql, { ...payload, id: current.id }));
      return { applied: true, id: current.id };
    }
    const sql = `
      INSERT INTO clientes (nomeCurto, razaoSocial, grupoWhatsapp, observacoes, ativo, createdAt, updatedAt, uuid, deletedAt, syncStatus, lastSyncedAt, deviceId)
      VALUES (@nomeCurto, @razaoSocial, @grupoWhatsapp, @observacoes, @ativo, @createdAt, @updatedAt, @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId)
    `;
    const result = db.prepare(sql).run(sqlParams(sql, payload));
    return { applied: true, id: result.lastInsertRowid };
  }

  function upsertRemoteOperacao(row, current) {
    const cliente = getRawByUuid('clientes', row.clienteUuid);
    const empresa = getRawByUuid('empresas', row.empresaUuid);
    if (!cliente || !empresa) return { applied: false, reason: 'missing_relation' };
    const payload = { ...row, clienteId: cliente.id, empresaId: empresa.id, syncStatus: 'SYNCED', lastSyncedAt: nowIso() };
    if (current) {
      const sql = `
        UPDATE operacoes SET codigo=@codigo, data=@data, clienteId=@clienteId, empresaId=@empresaId,
          valorRecebido=@valorRecebido, status=@status, observacao=@observacao, createdAt=@createdAt,
          updatedAt=@updatedAt, deletedAt=@deletedAt, syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt, deviceId=@deviceId
        WHERE id=@id
      `;
      db.prepare(sql).run(sqlParams(sql, { ...payload, id: current.id }));
      return { applied: true, id: current.id };
    }
    const sql = `
      INSERT INTO operacoes (codigo, data, clienteId, empresaId, valorRecebido, status, observacao, createdAt, updatedAt, uuid, deletedAt, syncStatus, lastSyncedAt, deviceId)
      VALUES (@codigo, @data, @clienteId, @empresaId, @valorRecebido, @status, @observacao, @createdAt, @updatedAt, @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId)
    `;
    const result = db.prepare(sql).run(sqlParams(sql, payload));
    return { applied: true, id: result.lastInsertRowid };
  }

  function upsertRemotePagamento(row, current) {
    const operacao = getRawByUuid('operacoes', row.operacaoUuid);
    if (!operacao) return { applied: false, reason: 'missing_relation' };
    const payload = { ...row, operacaoId: operacao.id, syncStatus: 'SYNCED', lastSyncedAt: nowIso() };
    if (current) {
      const sql = `
        UPDATE pagamentos SET operacaoId=@operacaoId, data=@data, favorecido=@favorecido, documento=@documento,
          tipoPagamento=@tipoPagamento, chavePix=@chavePix, banco=@banco, agencia=@agencia, tipoConta=@tipoConta,
          conta=@conta, digito=@digito, valor=@valor, pago=@pago, comprovanteEnviado=@comprovanteEnviado,
          observacao=@observacao, createdAt=@createdAt, updatedAt=@updatedAt, deletedAt=@deletedAt,
          syncStatus=@syncStatus, lastSyncedAt=@lastSyncedAt, deviceId=@deviceId
        WHERE id=@id
      `;
      db.prepare(sql).run(sqlParams(sql, { ...payload, id: current.id }));
      syncOperacaoStatus(payload.operacaoId, { enqueue: false, syncStatus: 'SYNCED' });
      return { applied: true, id: current.id };
    }
    const sql = `
      INSERT INTO pagamentos (
        operacaoId, data, favorecido, documento, tipoPagamento, chavePix, banco, agencia, tipoConta, conta, digito,
        valor, pago, comprovanteEnviado, observacao, createdAt, updatedAt, uuid, deletedAt, syncStatus, lastSyncedAt, deviceId
      )
      VALUES (
        @operacaoId, @data, @favorecido, @documento, @tipoPagamento, @chavePix, @banco, @agencia, @tipoConta, @conta, @digito,
        @valor, @pago, @comprovanteEnviado, @observacao, @createdAt, @updatedAt, @uuid, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId
      )
    `;
    const result = db.prepare(sql).run(sqlParams(sql, payload));
    syncOperacaoStatus(payload.operacaoId, { enqueue: false, syncStatus: 'SYNCED' });
    return { applied: true, id: result.lastInsertRowid };
  }

  function upsertRemoteAuditLog(row, current) {
    const payload = { ...row, syncStatus: 'SYNCED', lastSyncedAt: nowIso() };
    if (current) {
      const sql = `
        UPDATE audit_logs SET action=@action, entity=@entity, entityId=@entityId, details=@details,
          createdAt=@createdAt, updatedAt=@updatedAt, deletedAt=@deletedAt, syncStatus=@syncStatus,
          lastSyncedAt=@lastSyncedAt, deviceId=@deviceId
        WHERE id=@id
      `;
      db.prepare(sql).run(sqlParams(sql, { ...payload, id: current.id }));
      return { applied: true, id: current.id };
    }
    const sql = `
      INSERT INTO audit_logs (uuid, action, entity, entityId, details, createdAt, updatedAt, deletedAt, syncStatus, lastSyncedAt, deviceId)
      VALUES (@uuid, @action, @entity, @entityId, @details, @createdAt, @updatedAt, @deletedAt, @syncStatus, @lastSyncedAt, @deviceId)
    `;
    const result = db.prepare(sql).run(sqlParams(sql, payload));
    return { applied: true, id: result.lastInsertRowid };
  }

  function remoteToLocal(entity, record) {
    const base = {
      uuid: record.id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at || null,
      deviceId: record.device_id || '',
    };
    if (entity === 'empresas') {
      return {
        ...base,
        apelido: record.apelido || '',
        razaoSocial: record.razao_social || '',
        cnpj: record.cnpj || '',
        banco: record.banco || '',
        agencia: record.agencia || '',
        conta: record.conta || '',
        ativo: boolToInt(record.ativo !== false),
      };
    }
    if (entity === 'clientes') {
      return {
        ...base,
        nomeCurto: record.nome_curto || '',
        razaoSocial: record.razao_social || '',
        grupoWhatsapp: record.grupo_whatsapp || '',
        observacoes: record.observacoes || '',
        ativo: boolToInt(record.ativo !== false),
      };
    }
    if (entity === 'operacoes') {
      return {
        ...base,
        codigo: record.codigo || '',
        data: record.data,
        clienteUuid: record.cliente_id,
        empresaUuid: record.empresa_id,
        valorRecebido: normalizeMoney(record.valor_recebido),
        status: record.status,
        observacao: record.observacao || '',
      };
    }
    if (entity === 'pagamentos') {
      return {
        ...base,
        operacaoUuid: record.operacao_id,
        data: record.data,
        favorecido: record.favorecido || '',
        documento: record.documento || '',
        tipoPagamento: record.tipo_pagamento || 'PIX',
        chavePix: record.chave_pix || '',
        banco: record.banco || '',
        agencia: record.agencia || '',
        tipoConta: record.tipo_conta || 'NAO_INFORMADO',
        conta: record.conta || '',
        digito: record.digito || '',
        valor: normalizeMoney(record.valor),
        pago: boolToInt(record.pago),
        comprovanteEnviado: boolToInt(record.comprovante_enviado),
        observacao: record.observacao || '',
      };
    }
    return {
      ...base,
      action: record.action || '',
      entity: record.entity || '',
      entityId: null,
      details: JSON.stringify(record.details || {}),
    };
  }

  function localToRemote(entity, row) {
    const base = {
      id: row.uuid,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      deleted_at: row.deletedAt || null,
      device_id: row.deviceId || getDeviceId(),
    };
    if (entity === 'empresas') {
      return {
        ...base,
        apelido: row.apelido || '',
        razao_social: row.razaoSocial || '',
        cnpj: row.cnpj || '',
        banco: row.banco || '',
        agencia: row.agencia || '',
        conta: row.conta || '',
        ativo: Boolean(row.ativo),
      };
    }
    if (entity === 'clientes') {
      return {
        ...base,
        nome_curto: row.nomeCurto || '',
        razao_social: row.razaoSocial || '',
        grupo_whatsapp: row.grupoWhatsapp || '',
        observacoes: row.observacoes || '',
        ativo: Boolean(row.ativo),
      };
    }
    if (entity === 'operacoes') {
      const cliente = getRaw('clientes', row.clienteId);
      const empresa = getRaw('empresas', row.empresaId);
      return {
        ...base,
        codigo: row.codigo || '',
        data: row.data,
        cliente_id: cliente?.uuid || null,
        empresa_id: empresa?.uuid || null,
        valor_recebido: normalizeMoney(row.valorRecebido),
        status: row.status,
        observacao: row.observacao || '',
      };
    }
    if (entity === 'pagamentos') {
      const operacao = getRaw('operacoes', row.operacaoId);
      return {
        ...base,
        operacao_id: operacao?.uuid || null,
        data: row.data,
        favorecido: row.favorecido || '',
        documento: row.documento || '',
        tipo_pagamento: row.tipoPagamento || 'PIX',
        chave_pix: row.chavePix || '',
        banco: row.banco || '',
        agencia: row.agencia || '',
        tipo_conta: row.tipoConta || 'NAO_INFORMADO',
        conta: row.conta || '',
        digito: row.digito || '',
        valor: normalizeMoney(row.valor),
        pago: Boolean(row.pago),
        comprovante_enviado: Boolean(row.comprovanteEnviado),
        observacao: row.observacao || '',
      };
    }
    return {
      ...base,
      action: row.action || '',
      entity: row.entity || '',
      entity_id: safeJson(row.details).uuid || null,
      details: safeJson(row.details),
    };
  }

  function safeJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return {
    applyRemoteRecord,
    deleteConta,
    deleteCliente,
    deleteEmpresa,
    deleteOperacao,
    deletePagamento,
    exportBackup,
    exportCsv,
    getConfig,
    getHistoricalDashboard,
    getOperationalDashboard,
    getOperacao,
    getContasVencendoHoje,
    getRemotePayload,
    getSyncStatus,
    importBackup,
    listContas,
    listClientes,
    listEmpresas,
    listOperacoes,
    listPagamentos,
    listAuditLogs,
    logAudit,
    listSyncQueue,
    markSyncQueueError,
    markSyncQueueSynced,
    pagarConta,
    reopenOperacao,
    saveConta,
    salvarComprovanteConta,
    saveCliente,
    saveEmpresa,
    saveOperacao,
    savePagamento,
    setConfig,
    updateSyncMetadata,
    updatePagamentoFlags,
  };
}

module.exports = {
  OPERATION_STATUSES,
  createRepositories,
  normalizeMoney,
};
