import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
const SyncWorker = require('../../server/sync/SyncWorker');

describe('SyncWorker', () => {
  let testDb;
  let worker;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE sync_meta (
        tabla TEXT PRIMARY KEY,
        last_push_at DATETIME,
        last_pull_at DATETIME,
        last_push_id INTEGER DEFAULT 0
      );

      CREATE TABLE pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE,
        total REAL DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        synced_at DATETIME
      );

      CREATE TABLE categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE,
        nombre TEXT NOT NULL,
        color TEXT DEFAULT '#6B7280',
        activo INTEGER DEFAULT 1,
        updated_at DATETIME
      );
    `);

    worker = new SyncWorker(testDb, null);
    // Forzar valores de prueba
    worker.config = {
      enabled: true,
      serverUrl: 'http://test-server:4000',
      apiKey: 'test-key',
      deviceId: 'test-device',
      intervalMs: 60000,
      batchSize: 50,
      timeoutMs: 1000,
      pushTables: ['pedidos'],
      catalogTables: ['categorias'],
      allTables: ['pedidos', 'categorias']
    };
  });

  afterEach(() => {
    worker.stop();
    vi.restoreAllMocks();
  });

  it('debe contar correctamente los registros pendientes de sincronización', () => {
    testDb.prepare("INSERT INTO pedidos (uuid, total, sync_status) VALUES ('p-1', 50, 'pending')").run();
    testDb.prepare("INSERT INTO pedidos (uuid, total, sync_status) VALUES ('p-2', 30, 'pending')").run();
    testDb.prepare("INSERT INTO pedidos (uuid, total, sync_status) VALUES ('p-3', 20, 'synced')").run();

    expect(worker._countPending()).toBe(2);
  });

  it('debe marcar como sincronizados los registros especificados', () => {
    testDb.prepare("INSERT INTO pedidos (uuid, total, sync_status) VALUES ('p-1', 50, 'pending')").run();
    testDb.prepare("INSERT INTO pedidos (uuid, total, sync_status) VALUES ('p-2', 30, 'pending')").run();

    worker._markSynced('pedidos', ['p-1']);

    const p1 = testDb.prepare("SELECT sync_status, synced_at FROM pedidos WHERE uuid = 'p-1'").get();
    const p2 = testDb.prepare("SELECT sync_status FROM pedidos WHERE uuid = 'p-2'").get();

    expect(p1.sync_status).toBe('synced');
    expect(p1.synced_at).toBeTruthy();
    expect(p2.sync_status).toBe('pending');
  });

  it('debe realizar upsert local de registros descargados desde el cloud', () => {
    // 1. Insertar nuevo registro proveniente del cloud
    worker._upsertLocal('categorias', [
      { uuid: 'cat-cloud-1', nombre: 'Bebidas Calientes', color: '#ff0000' }
    ]);

    let row = testDb.prepare("SELECT * FROM categorias WHERE uuid = 'cat-cloud-1'").get();
    expect(row).toBeTruthy();
    expect(row.nombre).toBe('Bebidas Calientes');

    // 2. Actualizar registro existente si ya existe el uuid
    worker._upsertLocal('categorias', [
      { uuid: 'cat-cloud-1', nombre: 'Cafetería & Infusiones', color: '#00ff00' }
    ]);

    row = testDb.prepare("SELECT * FROM categorias WHERE uuid = 'cat-cloud-1'").get();
    expect(row.nombre).toBe('Cafetería & Infusiones');
    expect(row.color).toBe('#00ff00');
  });

  it('debe reportar estado offline cuando el healthcheck falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await worker._runSyncCycle();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('offline');
    expect(worker.online).toBe(false);
  });

  it('debe ejecutar push de transacciones exitosamente cuando hay conectividad', async () => {
    testDb.prepare("INSERT INTO pedidos (uuid, total, sync_status) VALUES ('p-100', 45, 'pending')").run();
    testDb.prepare("INSERT INTO sync_meta (tabla, last_push_at, last_pull_at) VALUES ('pedidos', datetime('now'), datetime('now'))").run();
    testDb.prepare("INSERT INTO sync_meta (tabla, last_push_at, last_pull_at) VALUES ('categorias', datetime('now'), datetime('now'))").run();

    // Mock de fetch para simular éxito
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url.includes('/health')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
      }
      if (url.includes('/push')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, processed: 1 }) });
      }
      if (url.includes('/pull')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, data: { rows: [] } }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));

    const result = await worker.syncNow();
    expect(result.ok).toBe(true);
    expect(result.pushed).toBe(1);

    const pedido = testDb.prepare("SELECT sync_status FROM pedidos WHERE uuid = 'p-100'").get();
    expect(pedido.sync_status).toBe('synced');
  });
});
