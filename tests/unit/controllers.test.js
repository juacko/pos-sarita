import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MesaController } from '../../server/controllers/MesaController';
import { ProductoController } from '../../server/controllers/ProductoController';
import { PedidoController } from '../../server/controllers/PedidoController';
import { CajaController } from '../../server/controllers/CajaController';
import { UsuarioController } from '../../server/controllers/UsuarioController';
import { MesaRepository } from '../../server/repositories/MesaRepository';
import { ProductoRepository } from '../../server/repositories/ProductoRepository';
import { PedidoRepository } from '../../server/repositories/PedidoRepository';
import { CajaRepository } from '../../server/repositories/CajaRepository';

describe('Capa de Controladores (Unit Tests)', () => {
  let testDb;
  let mockRes;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT, rol TEXT, pin TEXT, activo INTEGER DEFAULT 1);
      CREATE TABLE sesiones (token TEXT PRIMARY KEY, usuario_id INTEGER, created_at DATETIME, expires_at DATETIME);
      CREATE TABLE areas (id INTEGER PRIMARY KEY, nombre TEXT, tipo TEXT, orden INTEGER DEFAULT 0, activo INTEGER DEFAULT 1);
      CREATE TABLE mesas (id INTEGER PRIMARY KEY, numero INTEGER UNIQUE, nombre TEXT, capacidad INTEGER, area_id INTEGER, es_virtual INTEGER DEFAULT 0, estado TEXT DEFAULT 'LIBRE', mesero_id INTEGER, mesero_nombre TEXT, pedido_activo_id INTEGER, ocupado_desde DATETIME, version INTEGER DEFAULT 1, updated_at DATETIME);
      CREATE TABLE categorias (id INTEGER PRIMARY KEY, nombre TEXT, color TEXT, activo INTEGER DEFAULT 1, created_at DATETIME);
      CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, descripcion TEXT, precio REAL NOT NULL, categoria_id INTEGER, para_llevar INTEGER DEFAULT 0, controlar_stock INTEGER DEFAULT 0, stock_actual INTEGER DEFAULT 0, stock_minimo INTEGER DEFAULT 3, activo INTEGER DEFAULT 1, created_at DATETIME);
      CREATE TABLE variantes (id INTEGER PRIMARY KEY, producto_id INTEGER, nombre TEXT, precio_adicional REAL DEFAULT 0, activo INTEGER DEFAULT 1);
      CREATE TABLE modificadores (id INTEGER PRIMARY KEY, producto_id INTEGER, nombre TEXT, tipo TEXT, requerido INTEGER DEFAULT 0, max_opciones INTEGER DEFAULT 1, activo INTEGER DEFAULT 1);
      CREATE TABLE opciones_mod (id INTEGER PRIMARY KEY, modificador_id INTEGER, nombre TEXT, precio_adicional REAL DEFAULT 0, activo INTEGER DEFAULT 1);
      CREATE TABLE agregados (id INTEGER PRIMARY KEY, producto_id INTEGER, nombre TEXT, precio REAL NOT NULL, maximo INTEGER DEFAULT 5, activo INTEGER DEFAULT 1);
      CREATE TABLE pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, mesa_id INTEGER NOT NULL, mesa_numero INTEGER NOT NULL, mesero_id INTEGER, mesero_nombre TEXT, estado TEXT DEFAULT 'ABIERTO', total REAL DEFAULT 0, nota TEXT, cliente_nombre TEXT, cliente_telefono TEXT, cliente_direccion TEXT, hora_recogida TEXT, motivo_cancelacion TEXT, anulado_por INTEGER, created_at DATETIME, updated_at DATETIME);
      CREATE TABLE pedido_items (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, producto_id INTEGER, producto_nombre TEXT NOT NULL, cantidad INTEGER DEFAULT 1, precio_unitario REAL NOT NULL, precio_adicional REAL DEFAULT 0, notas TEXT, variante_id INTEGER, variante_nombre TEXT, modificadores_json TEXT DEFAULT '[]', agregados_json TEXT DEFAULT '[]', detalle TEXT DEFAULT '', estado TEXT DEFAULT 'PENDIENTE', cantidad_pagada INTEGER DEFAULT 0, destino_impresion TEXT DEFAULT 'cocina', created_at DATETIME);
      CREATE TABLE pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, monto REAL NOT NULL, metodo TEXT NOT NULL, propina REAL DEFAULT 0, referencia TEXT, notas TEXT, usuario_id INTEGER, created_at DATETIME);
      CREATE TABLE descuentos (id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER NOT NULL, tipo TEXT NOT NULL, valor REAL NOT NULL, motivo TEXT NOT NULL, usuario_id INTEGER, created_at DATETIME);
      CREATE TABLE caja_sesiones (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, fondo_inicial REAL DEFAULT 0, efectivo_contado REAL, estado TEXT DEFAULT 'ABIERTA', notas_apertura TEXT, notas_cierre TEXT, opened_at DATETIME, closed_at DATETIME, total_ventas REAL, propinas REAL, efectivo_esperado REAL, sobrante_faltante REAL, total_pedidos INTEGER, desglose_json TEXT, cerrada_por INTEGER);
      CREATE TABLE caja_movimientos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, concepto TEXT NOT NULL, monto REAL NOT NULL, metodo_pago TEXT NOT NULL, persona TEXT, usuario_id INTEGER, notas TEXT, created_at DATETIME);
      CREATE TABLE logs_mesas (id INTEGER PRIMARY KEY AUTOINCREMENT, mesa_id INTEGER NOT NULL, accion TEXT NOT NULL, mesero_id INTEGER, detalle TEXT, created_at DATETIME);
    `);

    testDb.prepare("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (1, 'Admin', 'admin', '1234')").run();

    mockRes = () => {
      const res = {};
      res.statusCode = 200;
      res.body = null;
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (data) => { res.body = data; return res; };
      return res;
    };
  });

  describe('UsuarioController', () => {
    it('login retorna token con PIN valido', () => {
      const controller = new UsuarioController(testDb);
      const req = { body: { pin: '1234' } };
      const res = mockRes();

      controller.login(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.nombre).toBe('Admin');
      expect(res.body.token).toBeDefined();
    });

    it('login retorna 401 con PIN invalido', () => {
      const controller = new UsuarioController(testDb);
      const req = { body: { pin: '9999' } };
      const res = mockRes();

      controller.login(req, res);

      expect(res.statusCode).toBe(401);
    });
  });

  describe('MesaController', () => {
    it('tomarMesa actualiza estado a OCUPADO', () => {
      testDb.prepare("INSERT INTO mesas (id, numero, nombre, estado) VALUES (1, 1, 'Mesa 1', 'LIBRE')").run();
      const mesaRepo = new MesaRepository(testDb);
      const controller = new MesaController(mesaRepo);

      const req = { params: { id: 1 }, body: { mesero_id: 1, mesero_nombre: 'Admin' } };
      const res = mockRes();

      controller.tomarMesa(req, res, null);

      expect(res.statusCode).toBe(200);
      expect(res.body.estado).toBe('OCUPADO');
    });
  });

  describe('ProductoController', () => {
    it('actualizarStock modifica stock correctamente', () => {
      testDb.prepare("INSERT INTO productos (id, nombre, precio, stock_actual) VALUES (1, 'Ramen', 25, 10)").run();
      const prodRepo = new ProductoRepository(testDb);
      const controller = new ProductoController(prodRepo);

      const req = { params: { id: 1 }, body: { stock_actual: 5 } };
      const res = mockRes();

      controller.actualizarStock(req, res, null);

      expect(res.statusCode).toBe(200);
      expect(res.body.stock_actual).toBe(5);
    });
  });

  describe('PedidoController', () => {
    it('actualizarEstadoItemsMasivo actualiza items por estación', () => {
      testDb.prepare("INSERT INTO pedidos (id, mesa_id, mesa_numero, estado) VALUES (1, 1, 1, 'ABIERTO')").run();
      testDb.prepare("INSERT INTO pedido_items (pedido_id, producto_nombre, cantidad, precio_unitario, destino_impresion, estado) VALUES (1, 'Ramen', 1, 30, 'cocina', 'PENDIENTE')").run();

      const pedRepo = new PedidoRepository(testDb);
      const controller = new PedidoController(pedRepo);

      const req = { params: { id: 1 }, body: { estado: 'LISTO', destino: 'cocina' } };
      const res = mockRes();

      controller.actualizarEstadoItemsMasivo(req, res, null);

      expect(res.statusCode).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.pedido.estado).toBe('LISTO');
    });
  });

  describe('CajaController', () => {
    it('abrirSesion abre nueva sesion de caja', () => {
      const cajaRepo = new CajaRepository(testDb);
      const controller = new CajaController(cajaRepo);

      const req = { body: { usuario_id: 1, fondo_inicial: 100, notas: 'Apertura' } };
      const res = mockRes();

      controller.abrirSesion(req, res, null);

      expect(res.statusCode).toBe(200);
      expect(res.body.estado).toBe('ABIERTA');
      expect(res.body.fondo_inicial).toBe(100);
    });
  });
});
