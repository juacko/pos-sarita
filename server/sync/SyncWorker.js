/**
 * SyncWorker — Sincronización en background entre SQLite local y Oracle Cloud.
 * 
 * Responsabilidades:
 * - Push: Sube registros con sync_status='pending' a Oracle Cloud
 * - Pull: Descarga registros modificados de Oracle Cloud
 * - Snapshot: Descarga/sube la BD completa (para setup inicial)
 * - Monitoreo: Emite estado de conexión por Socket.IO
 * 
 * No bloquea la operación del POS. Todo es asíncrono y tolerante a fallos de red.
 */

const syncConfig = require('./config');

class SyncWorker {
  /**
   * @param {Object} db - Instancia de better-sqlite3
   * @param {Object} io - Instancia de Socket.IO (puede ser null en tests)
   */
  constructor(db, io = null) {
    this.db = db;
    this.io = io;
    this.config = syncConfig;
    this.intervalId = null;
    this.syncing = false;
    this.online = false;
    this.lastSync = null;
    this.lastError = null;
    this.consecutiveErrors = 0;
  }

  // ─── Control ──────────────────────────────────────────────

  /**
   * Arranca el loop de sincronización periódica.
   */
  start() {
    if (!this.config.enabled) {
      console.log('[SYNC] Sincronización deshabilitada (SYNC_ENABLED != true)');
      return;
    }

    if (!this.config.serverUrl) {
      console.log('[SYNC] Sincronización deshabilitada (SYNC_SERVER_URL vacío)');
      return;
    }

    console.log(`[SYNC] Worker iniciado — device: ${this.config.deviceId}, server: ${this.config.serverUrl}, intervalo: ${this.config.intervalMs}ms`);

    // Primera sincronización al arrancar (con delay de 5s para no bloquear el startup)
    setTimeout(() => this._runSyncCycle(), 5000);

    // Loop periódico
    this.intervalId = setInterval(() => this._runSyncCycle(), this.config.intervalMs);
  }

  /**
   * Detiene el loop de sincronización.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[SYNC] Worker detenido');
    }
  }

  /**
   * Fuerza una sincronización inmediata (para uso desde la API).
   * @returns {Promise<Object>} Resultado del ciclo de sync
   */
  async syncNow() {
    if (this.syncing) {
      return { ok: false, reason: 'Sincronización en progreso' };
    }
    return this._runSyncCycle();
  }

  /**
   * Retorna el estado actual del worker.
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      online: this.online,
      syncing: this.syncing,
      lastSync: this.lastSync,
      lastError: this.lastError,
      deviceId: this.config.deviceId,
      serverUrl: this.config.serverUrl,
      pendingCount: this._countPending()
    };
  }

  // ─── Ciclo principal ──────────────────────────────────────

  async _runSyncCycle() {
    if (this.syncing) return { ok: false, reason: 'already_syncing' };

    this.syncing = true;
    this._emitStatus('syncing');

    const result = { pushed: 0, pulled: 0, errors: [] };

    try {
      // 1. Verificar conectividad
      const connected = await this._checkConnection();
      if (!connected) {
        this.online = false;
        this._emitStatus('offline');
        this.syncing = false;
        return { ok: false, reason: 'offline' };
      }

      this.online = true;
      this.consecutiveErrors = 0;

      // 2. ¿Es la primera vez? (sin registros sync_meta → hacer snapshot)
      const needsSnapshot = this._needsInitialSnapshot();
      if (needsSnapshot === 'pull') {
        console.log('[SYNC] BD local vacía — descargando snapshot de Oracle...');
        await this._pullSnapshot();
        this.lastSync = new Date().toISOString();
        this._emitStatus('complete');
        this.syncing = false;
        return { ok: true, action: 'snapshot_pull' };
      }
      if (needsSnapshot === 'push') {
        console.log('[SYNC] Oracle vacío — subiendo snapshot local...');
        await this._pushSnapshot();
        this.lastSync = new Date().toISOString();
        this._emitStatus('complete');
        this.syncing = false;
        return { ok: true, action: 'snapshot_push' };
      }

      // 3. Push: subir transacciones pendientes
      for (const tabla of this.config.pushTables) {
        try {
          const count = await this._pushTable(tabla);
          result.pushed += count;
        } catch (err) {
          result.errors.push({ tabla, action: 'push', error: err.message });
          console.error(`[SYNC] Error push ${tabla}:`, err.message);
        }
      }

      // 4. Push catálogo (cambios locales de catálogo)
      for (const tabla of this.config.catalogTables) {
        try {
          const count = await this._pushCatalogTable(tabla);
          result.pushed += count;
        } catch (err) {
          result.errors.push({ tabla, action: 'push_catalog', error: err.message });
          console.error(`[SYNC] Error push catalog ${tabla}:`, err.message);
        }
      }

      // 5. Pull catálogo (cambios desde Oracle)
      for (const tabla of this.config.catalogTables) {
        try {
          const count = await this._pullTable(tabla);
          result.pulled += count;
        } catch (err) {
          result.errors.push({ tabla, action: 'pull', error: err.message });
          console.error(`[SYNC] Error pull ${tabla}:`, err.message);
        }
      }

      this.lastSync = new Date().toISOString();
      this.lastError = result.errors.length > 0 ? result.errors[0].error : null;

      if (result.pushed > 0 || result.pulled > 0) {
        console.log(`[SYNC] Ciclo completo — pushed: ${result.pushed}, pulled: ${result.pulled}, errors: ${result.errors.length}`);
      }

      this._emitStatus('complete', result);
      return { ok: true, ...result };

    } catch (err) {
      this.consecutiveErrors++;
      this.lastError = err.message;
      console.error('[SYNC] Error en ciclo de sync:', err.message);
      this._emitStatus('error', { message: err.message });
      return { ok: false, error: err.message };
    } finally {
      this.syncing = false;
    }
  }

  // ─── Push (Local → Oracle) ────────────────────────────────

  /**
   * Sube registros transaccionales pendientes de una tabla.
   */
  async _pushTable(tabla) {
    const rows = this.db.prepare(
      `SELECT * FROM ${tabla} WHERE sync_status = 'pending' ORDER BY id ASC LIMIT ?`
    ).all(this.config.batchSize);

    if (rows.length === 0) return 0;

    const response = await this._fetch('/api/sync/push', {
      method: 'POST',
      body: {
        tabla,
        deviceId: this.config.deviceId,
        rows
      }
    });

    if (response.ok) {
      // Marcar como sincronizados
      const uuids = rows.map(r => r.uuid).filter(Boolean);
      if (uuids.length > 0) {
        this._markSynced(tabla, uuids);
      }
    }

    return rows.length;
  }

  /**
   * Sube registros de catálogo que no tienen uuid sincronizado.
   * Para catálogo usamos updated_at para detectar cambios.
   */
  async _pushCatalogTable(tabla) {
    const lastPush = this._getLastPush(tabla);
    
    let rows;
    if (tabla === 'configuracion') {
      rows = lastPush
        ? this.db.prepare(`SELECT * FROM ${tabla} WHERE updated_at > ?`).all(lastPush)
        : this.db.prepare(`SELECT * FROM ${tabla}`).all();
    } else {
      rows = lastPush
        ? this.db.prepare(`SELECT * FROM ${tabla} WHERE updated_at > ? OR updated_at IS NULL`).all(lastPush)
        : this.db.prepare(`SELECT * FROM ${tabla}`).all();
    }

    if (rows.length === 0) return 0;

    const response = await this._fetch('/api/sync/push', {
      method: 'POST',
      body: {
        tabla,
        deviceId: this.config.deviceId,
        rows,
        isCatalog: true
      }
    });

    if (response.ok) {
      this._updateLastPush(tabla);
    }

    return rows.length;
  }

  /**
   * Marca registros como sincronizados en la BD local.
   */
  _markSynced(tabla, uuids) {
    const now = new Date().toISOString();
    const placeholders = uuids.map(() => '?').join(',');
    this.db.prepare(
      `UPDATE ${tabla} SET sync_status = 'synced', synced_at = ? WHERE uuid IN (${placeholders})`
    ).run(now, ...uuids);
  }

  // ─── Pull (Oracle → Local) ────────────────────────────────

  /**
   * Descarga registros de catálogo modificados después de last_pull_at.
   */
  async _pullTable(tabla) {
    const lastPull = this._getLastPull(tabla);
    const params = new URLSearchParams({ tabla });
    if (lastPull) params.set('since', lastPull);

    const response = await this._fetch(`/api/sync/pull?${params}`);

    if (!response.ok || !response.data || !response.data.rows) return 0;

    const rows = response.data.rows;
    if (rows.length === 0) return 0;

    // Upsert en SQLite local
    this._upsertLocal(tabla, rows);
    this._updateLastPull(tabla);

    return rows.length;
  }

  /**
   * INSERT OR REPLACE en SQLite con datos de Oracle.
   * Usa uuid como clave de deduplicación.
   */
  _upsertLocal(tabla, rows) {
    if (rows.length === 0) return;

    const upsert = this.db.transaction((rows) => {
      for (const row of rows) {
        // Verificar si ya existe por uuid
        const pkCol = tabla === 'configuracion' ? 'clave' : 'id';
        const existing = this.db.prepare(
          `SELECT ${pkCol} FROM ${tabla} WHERE uuid = ?`
        ).get(row.uuid);

        if (existing) {
          // UPDATE: construir SET dinámicamente (sin tocar id ni uuid)
          const updateCols = Object.keys(row).filter(k => k !== pkCol && k !== 'uuid');
          if (updateCols.length === 0) continue;
          const setClause = updateCols.map(c => `${c} = ?`).join(', ');
          const values = updateCols.map(c => row[c]);
          this.db.prepare(
            `UPDATE ${tabla} SET ${setClause} WHERE uuid = ?`
          ).run(...values, row.uuid);
        } else {
          // INSERT: incluir todas las columnas excepto id (se auto-genera)
          const insertCols = Object.keys(row).filter(k => k !== 'id');
          const placeholders = insertCols.map(() => '?').join(', ');
          const values = insertCols.map(c => row[c]);
          this.db.prepare(
            `INSERT INTO ${tabla} (${insertCols.join(', ')}) VALUES (${placeholders})`
          ).run(...values);
        }
      }
    });

    upsert(rows);
  }

  // ─── Snapshot ─────────────────────────────────────────────

  /**
   * Descarga TODA la BD de Oracle Cloud (para setup inicial de PC nueva).
   */
  async _pullSnapshot() {
    const response = await this._fetch('/api/sync/snapshot');
    if (!response.ok || !response.data) {
      throw new Error('Error descargando snapshot: ' + (response.error || 'respuesta vacía'));
    }

    const snapshot = response.data;

    // Insertar datos tabla por tabla, respetando orden de dependencias (FK)
    const orderedTables = [
      'configuracion', 'usuarios', 'areas', 'categorias',
      'mesas', 'productos', 'variantes', 'modificadores', 'opciones_mod',
      'agregados', 'vales',
      'pedidos', 'pedido_items', 'pagos', 'descuentos',
      'caja_sesiones', 'caja_movimientos', 'pagos_log', 'logs_mesas'
    ];

    const insertSnapshot = this.db.transaction(() => {
      for (const tabla of orderedTables) {
        if (!snapshot[tabla] || snapshot[tabla].length === 0) continue;
        this._upsertLocal(tabla, snapshot[tabla]);
        console.log(`[SYNC] Snapshot: ${snapshot[tabla].length} registros insertados en ${tabla}`);
      }

      // Inicializar sync_meta para todas las tablas
      const now = new Date().toISOString();
      for (const tabla of this.config.allTables) {
        this.db.prepare(
          'INSERT OR REPLACE INTO sync_meta (tabla, last_pull_at, last_push_at) VALUES (?, ?, ?)'
        ).run(tabla, now, now);
      }
    });

    insertSnapshot();
    console.log('[SYNC] Snapshot descargado e insertado exitosamente');
  }

  /**
   * Sube TODA la BD local a Oracle Cloud (para setup inicial del servidor).
   */
  async _pushSnapshot() {
    const snapshot = {};

    for (const tabla of this.config.allTables) {
      snapshot[tabla] = this.db.prepare(`SELECT * FROM ${tabla}`).all();
    }

    const response = await this._fetch('/api/sync/snapshot', {
      method: 'POST',
      body: {
        deviceId: this.config.deviceId,
        snapshot
      }
    });

    if (!response.ok) {
      throw new Error('Error subiendo snapshot: ' + (response.error || 'respuesta inválida'));
    }

    // Marcar todo como sincronizado
    const now = new Date().toISOString();
    for (const tabla of this.config.pushTables) {
      this.db.prepare(
        `UPDATE ${tabla} SET sync_status = 'synced', synced_at = ? WHERE sync_status = 'pending'`
      ).run(now);
    }

    // Inicializar sync_meta
    for (const tabla of this.config.allTables) {
      this.db.prepare(
        'INSERT OR REPLACE INTO sync_meta (tabla, last_push_at, last_pull_at) VALUES (?, ?, ?)'
      ).run(tabla, now, now);
    }

    console.log('[SYNC] Snapshot subido exitosamente');
  }

  // ─── Conectividad ─────────────────────────────────────────

  /**
   * Verifica la conexión con el servidor de Oracle Cloud.
   */
  async _checkConnection() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.config.serverUrl}/api/sync/health`, {
        method: 'GET',
        headers: { 'X-Sync-Key': this.config.apiKey },
        signal: controller.signal
      });

      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Detecta si se necesita un snapshot inicial.
   * @returns {'pull' | 'push' | false}
   */
  _needsInitialSnapshot() {
    const metaCount = this.db.prepare('SELECT COUNT(*) as c FROM sync_meta').get().c;
    if (metaCount > 0) return false;

    // ¿Hay datos locales?
    const localCount = this.db.prepare('SELECT COUNT(*) as c FROM pedidos').get().c;
    
    if (localCount > 0) {
      // Hay datos locales pero no se ha sincronizado nunca → push snapshot
      return 'push';
    } else {
      // BD local vacía → intentar pull snapshot
      return 'pull';
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Wrapper para fetch con autenticación y manejo de errores.
   */
  async _fetch(path, options = {}) {
    const url = `${this.config.serverUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const fetchOptions = {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Key': this.config.apiKey,
          'X-Device-Id': this.config.deviceId
        },
        signal: controller.signal
      };

      if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const res = await fetch(url, fetchOptions);
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
      }

      const data = await res.json().catch(() => null);
      return { ok: true, data };
    } catch (err) {
      clearTimeout(timeout);
      return { ok: false, error: err.name === 'AbortError' ? 'Timeout' : err.message };
    }
  }

  _countPending() {
    let total = 0;
    for (const tabla of this.config.pushTables) {
      try {
        const count = this.db.prepare(
          `SELECT COUNT(*) as c FROM ${tabla} WHERE sync_status = 'pending'`
        ).get().c;
        total += count;
      } catch { /* tabla puede no existir aún */ }
    }
    return total;
  }

  _getLastPush(tabla) {
    const row = this.db.prepare('SELECT last_push_at FROM sync_meta WHERE tabla = ?').get(tabla);
    return row ? row.last_push_at : null;
  }

  _getLastPull(tabla) {
    const row = this.db.prepare('SELECT last_pull_at FROM sync_meta WHERE tabla = ?').get(tabla);
    return row ? row.last_pull_at : null;
  }

  _updateLastPush(tabla) {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO sync_meta (tabla, last_push_at) VALUES (?, ?) ON CONFLICT(tabla) DO UPDATE SET last_push_at = ?'
    ).run(tabla, now, now);
  }

  _updateLastPull(tabla) {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO sync_meta (tabla, last_pull_at) VALUES (?, ?) ON CONFLICT(tabla) DO UPDATE SET last_pull_at = ?'
    ).run(tabla, now, now);
  }

  /**
   * Emite estado de sync por Socket.IO al frontend.
   */
  _emitStatus(status, data = null) {
    if (!this.io) return;
    this.io.emit('sync:status', {
      status,
      online: this.online,
      syncing: this.syncing,
      lastSync: this.lastSync,
      pending: this._countPending(),
      deviceId: this.config.deviceId,
      ...(data || {})
    });
  }
}

module.exports = SyncWorker;
