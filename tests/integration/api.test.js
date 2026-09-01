import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { StockService } from '../../server/services/StockService';
import { PagoService } from '../../server/services/PagoService';

describe('Integration API Tests', () => {
  let app;
  let testDb;

  beforeEach(() => {
    // Setup isolated test DB in memory
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT, rol TEXT, pin TEXT, activo INTEGER DEFAULT 1);
      CREATE TABLE areas (id INTEGER PRIMARY KEY, nombre TEXT, tipo TEXT, orden INTEGER, activo INTEGER);
      CREATE TABLE mesas (id INTEGER PRIMARY KEY, numero INTEGER UNIQUE, nombre TEXT, capacidad INTEGER, area_id INTEGER, es_virtual INTEGER DEFAULT 0, estado TEXT DEFAULT 'LIBRE', mesero_id INTEGER, mesero_nombre TEXT, pedido_activo_id INTEGER, ocupado_desde DATETIME, version INTEGER DEFAULT 1, updated_at DATETIME);
      CREATE TABLE categorias (id INTEGER PRIMARY KEY, nombre TEXT, color TEXT, activo INTEGER DEFAULT 1, created_at DATETIME);
      CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, descripcion TEXT, precio REAL NOT NULL, categoria_id INTEGER, para_llevar INTEGER DEFAULT 0, controlar_stock INTEGER DEFAULT 0, stock_actual INTEGER DEFAULT 0, stock_minimo INTEGER DEFAULT 3, activo INTEGER DEFAULT 1, created_at DATETIME);
      CREATE TABLE pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, mesa_id INTEGER NOT NULL, mesa_numero INTEGER NOT NULL, mesero_id INTEGER, mesero_nombre TEXT, estado TEXT DEFAULT 'ABIERTO', total REAL DEFAULT 0, nota TEXT, cliente_nombre TEXT, cliente_telefono TEXT, cliente_direccion TEXT, hora_recogida TEXT, motivo_cancelacion TEXT, anulado_por INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE pedido_items (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, producto_id INTEGER, producto_nombre TEXT NOT NULL, cantidad INTEGER DEFAULT 1, precio_unitario REAL NOT NULL, precio_adicional REAL DEFAULT 0, notas TEXT, variante_id INTEGER, variante_nombre TEXT, modificadores_json TEXT DEFAULT '[]', agregados_json TEXT DEFAULT '[]', detalle TEXT DEFAULT '', estado TEXT DEFAULT 'PENDIENTE', cantidad_pagada INTEGER DEFAULT 0, destino_impresion TEXT DEFAULT 'cocina', created_at DATETIME);
      CREATE TABLE pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, monto REAL NOT NULL, metodo TEXT NOT NULL, propina REAL DEFAULT 0, referencia TEXT, notas TEXT, usuario_id INTEGER, created_at DATETIME);
      CREATE TABLE descuentos (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, tipo TEXT NOT NULL, valor REAL NOT NULL, motivo TEXT NOT NULL, usuario_id INTEGER, created_at DATETIME);
      CREATE TABLE caja_sesiones (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, fondo_inicial REAL DEFAULT 0, efectivo_contado REAL, estado TEXT DEFAULT 'ABIERTA', notas_apertura TEXT, notas_cierre TEXT, opened_at DATETIME, absorbe_desde DATETIME, closed_at DATETIME);
      CREATE TABLE logs_mesas (id INTEGER PRIMARY KEY AUTOINCREMENT, mesa_id INTEGER NOT NULL, accion TEXT NOT NULL, mesero_id INTEGER, detalle TEXT, created_at DATETIME);
      CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, updated_at DATETIME);
    `);

    testDb.prepare("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (1, 'Admin', 'admin', '1234')").run();
    testDb.prepare("INSERT INTO mesas (id, numero, nombre, estado) VALUES (1, 1, 'Mesa 1', 'LIBRE')").run();
    testDb.prepare("INSERT INTO productos (id, nombre, precio, controlar_stock, stock_actual) VALUES (10, 'Hamburguesa', 20, 1, 5)").run();

    const stockSvc = new StockService(testDb);
    const pagoSvc = new PagoService(testDb);

    // Build minimal Express app
    app = express();
    app.use(express.json());

    app.post('/api/test/descontar-stock', (req, res) => {
      try {
        const affected = stockSvc.validarYDescontarStock(req.body.items);
        res.json({ ok: true, affected });
      } catch (err) {
        res.status(err.status || 500).json({ error: err.error || err.message });
      }
    });

    app.post('/api/test/reponer-stock', (req, res) => {
      try {
        const affected = stockSvc.reponerStock(req.body.items);
        res.json({ ok: true, affected });
      } catch (err) {
        res.status(err.status || 500).json({ error: err.error || err.message });
      }
    });

    app.get('/api/test/resumen-pago/:id', (req, res) => {
      try {
        const resumen = pagoSvc.obtenerResumenPago(req.params.id);
        res.json(resumen);
      } catch (err) {
        res.status(err.status || 500).json({ error: err.error || err.message });
      }
    });

    app.patch('/api/test/pedidos/:id/items/estado', (req, res) => {
      const { estado, destino } = req.body;
      if (destino === 'cocina') {
        testDb.prepare(`
          UPDATE pedido_items SET estado = ?
          WHERE pedido_id = ? AND estado != 'CANCELADO'
            AND (destino_impresion = 'cocina' OR destino_impresion = 'ambos' OR destino_impresion IS NULL)
        `).run(estado, req.params.id);
      } else if (destino === 'barra') {
        testDb.prepare(`
          UPDATE pedido_items SET estado = ?
          WHERE pedido_id = ? AND estado != 'CANCELADO'
            AND (destino_impresion = 'barra' OR destino_impresion = 'ambos')
        `).run(estado, req.params.id);
      }

      const allActiveItems = testDb.prepare("SELECT estado FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(req.params.id);
      if (allActiveItems.length > 0) {
        const allReady = allActiveItems.every(i => i.estado === 'LISTO' || i.estado === 'ENTREGADO');
        if (allReady) {
          testDb.prepare("UPDATE pedidos SET estado = 'LISTO' WHERE id = ?").run(req.params.id);
        }
      }

      const items = testDb.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(req.params.id);
      const pedido = testDb.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      res.json({ ok: true, items, pedido });
    });
  });

  it('POST /api/test/descontar-stock descuenta stock vía HTTP', async () => {
    const res = await request(app)
      .post('/api/test/descontar-stock')
      .send({ items: [{ producto_id: 10, cantidad: 2 }] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.affected[0].stock_actual).toBe(3);
  });

  it('POST /api/test/reponer-stock repone stock vía HTTP', async () => {
    const res = await request(app)
      .post('/api/test/reponer-stock')
      .send({ items: [{ producto_id: 10, cantidad: 3 }] });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.affected[0].stock_actual).toBe(8);
  });

  it('GET /api/test/resumen-pago/:id calcula resumen financiero vía HTTP', async () => {
    testDb.prepare("INSERT INTO pedidos (id, mesa_id, mesa_numero, total) VALUES (1, 1, 1, 50)").run();
    testDb.prepare("INSERT INTO descuentos (pedido_id, tipo, valor, motivo) VALUES (1, 'porcentaje', 20, 'Descuento cliente')").run();

    const res = await request(app).get('/api/test/resumen-pago/1');

    expect(res.status).toBe(200);
    expect(res.body.totalBruto).toBe(50);
    expect(res.body.totalFinal).toBe(40);
    expect(res.body.pendiente).toBe(40);
  });

  it('PATCH /api/test/pedidos/:id/items/estado no afecta a barra cuando cocina marca listo', async () => {
    testDb.prepare("INSERT INTO pedidos (id, mesa_id, mesa_numero, total, estado) VALUES (1, 1, 1, 40, 'ABIERTO')").run();
    testDb.prepare("INSERT INTO pedido_items (pedido_id, producto_nombre, cantidad, precio_unitario, destino_impresion, estado) VALUES (1, 'Ramen', 1, 30, 'cocina', 'PENDIENTE')").run();
    testDb.prepare("INSERT INTO pedido_items (pedido_id, producto_nombre, cantidad, precio_unitario, destino_impresion, estado) VALUES (1, 'Café', 1, 10, 'barra', 'PENDIENTE')").run();

    const res = await request(app)
      .patch('/api/test/pedidos/1/items/estado')
      .send({ estado: 'LISTO', destino: 'cocina' });

    expect(res.status).toBe(200);

    const items = testDb.prepare('SELECT producto_nombre, destino_impresion, estado FROM pedido_items WHERE pedido_id = 1').all();
    const ramen = items.find(i => i.producto_nombre === 'Ramen');
    const cafe = items.find(i => i.producto_nombre === 'Café');

    expect(ramen.estado).toBe('LISTO');
    expect(cafe.estado).toBe('PENDIENTE');

    const pedido = testDb.prepare('SELECT estado FROM pedidos WHERE id = 1').get();
    expect(pedido.estado).toBe('ABIERTO'); // Order overall is NOT ready until cafe is also ready
  });
});
