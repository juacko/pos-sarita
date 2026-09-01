import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MesaRepository } from '../../server/repositories/MesaRepository';
import { ProductoRepository } from '../../server/repositories/ProductoRepository';
import { PedidoRepository } from '../../server/repositories/PedidoRepository';
import { CajaRepository } from '../../server/repositories/CajaRepository';

describe('Capa de Repositorios (Unit Tests)', () => {
  let testDb;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT, rol TEXT, pin TEXT, activo INTEGER DEFAULT 1);
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
  });

  describe('MesaRepository', () => {
    it('debe obtener mesas con area asociada y actualizar estados', () => {
      testDb.prepare("INSERT INTO areas (id, nombre, tipo, orden) VALUES (1, 'Salón', 'SALON', 1)").run();
      testDb.prepare("INSERT INTO mesas (id, numero, nombre, area_id, estado) VALUES (1, 1, 'Mesa 1', 1, 'LIBRE')").run();

      const mesaRepo = new MesaRepository(testDb);
      const mesas = mesaRepo.obtenerTodas();

      expect(mesas).toHaveLength(1);
      expect(mesas[0].area_nombre).toBe('Salón');

      const actualizada = mesaRepo.actualizarEstado(1, 'OCUPADO', 10, 'Juan', 100);
      expect(actualizada.estado).toBe('OCUPADO');
      expect(actualizada.mesero_nombre).toBe('Juan');

      const liberada = mesaRepo.liberarMesa(1);
      expect(liberada.estado).toBe('LIBRE');
      expect(liberada.mesero_id).toBeNull();
    });
  });

  describe('ProductoRepository', () => {
    it('debe obtener productos con variantes y modificadores', () => {
      testDb.prepare("INSERT INTO categorias (id, nombre) VALUES (1, 'Comidas')").run();
      testDb.prepare("INSERT INTO productos (id, nombre, precio, categoria_id, controlar_stock, stock_actual) VALUES (1, 'Hamburguesa', 25, 1, 1, 10)").run();
      testDb.prepare("INSERT INTO variantes (id, producto_id, nombre, precio_adicional) VALUES (1, 1, 'Doble', 5)").run();

      const prodRepo = new ProductoRepository(testDb);
      const prods = prodRepo.obtenerTodos();

      expect(prods).toHaveLength(1);
      expect(prods[0].variantes).toHaveLength(1);
      expect(prods[0].variantes[0].nombre).toBe('Doble');

      const actStock = prodRepo.actualizarStock(1, 8);
      expect(actStock.stock_actual).toBe(8);
    });
  });

  describe('PedidoRepository', () => {
    it('debe obtener pedidos con items por estación y recalcular el estado global', () => {
      testDb.prepare("INSERT INTO pedidos (id, mesa_id, mesa_numero, total, estado) VALUES (1, 1, 1, 40, 'ABIERTO')").run();
      testDb.prepare("INSERT INTO pedido_items (pedido_id, producto_nombre, cantidad, precio_unitario, destino_impresion, estado) VALUES (1, 'Ramen', 1, 30, 'cocina', 'PENDIENTE')").run();
      testDb.prepare("INSERT INTO pedido_items (pedido_id, producto_nombre, cantidad, precio_unitario, destino_impresion, estado) VALUES (1, 'Café', 1, 10, 'barra', 'PENDIENTE')").run();

      const pedRepo = new PedidoRepository(testDb);

      const itemsCocina = pedRepo.obtenerItemsPorDestino(1, 'cocina');
      expect(itemsCocina).toHaveLength(1);
      expect(itemsCocina[0].producto_nombre).toBe('Ramen');

      pedRepo.actualizarEstadoItemsMasivo(1, 'LISTO', 'cocina');
      const itemsCocinaRefreshed = pedRepo.obtenerItemsPorDestino(1, 'cocina');
      expect(itemsCocinaRefreshed[0].estado).toBe('LISTO');

      // Global state should still be null (not ready) because barra item is still pending
      const nuevoEstado = pedRepo.recalcularEstadoGlobalPedido(1);
      expect(nuevoEstado).toBeNull();

      pedRepo.actualizarEstadoItemsMasivo(1, 'LISTO', 'barra');
      const nuevoEstadoFinal = pedRepo.recalcularEstadoGlobalPedido(1);
      expect(nuevoEstadoFinal).toBe('LISTO');
    });
  });

  describe('CajaRepository', () => {
    it('debe gestionar la apertura, movimiento y cierre de caja', () => {
      const cajaRepo = new CajaRepository(testDb);

      const sesionAbierta = cajaRepo.abrirSesion(1, 100, 'Inicio de turno');
      expect(sesionAbierta.estado).toBe('ABIERTA');
      expect(sesionAbierta.fondo_inicial).toBe(100);

      const activa = cajaRepo.obtenerSesionActiva();
      expect(activa.id).toBe(sesionAbierta.id);

      const mov = cajaRepo.registrarMovimiento('INGRESO', 'Venta extra', 20, 'Efectivo', 'Juan', 1);
      expect(mov.monto).toBe(20);

      const cerrada = cajaRepo.cerrarSesion(sesionAbierta.id, {
        efectivoContado: 120,
        notasCierre: 'Sin novedades',
        totalVentas: 20,
        propinas: 0,
        efectivoEsperado: 120,
        sobranteFaltante: 0,
        totalPedidos: 1,
        desgloseJson: '{}',
        cerradaPor: 1
      });

      expect(cerrada.estado).toBe('CERRADA');
    });
  });
});
