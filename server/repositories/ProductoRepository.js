const defaultDb = require('../db');
const { generateUUID } = require('../sync/utils');

/**
 * Repositorio de acceso a datos para Productos, Categorías y Personalizaciones.
 */
class ProductoRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerCategorias() {
    return this.db.prepare('SELECT * FROM categorias WHERE activo = 1 ORDER BY id').all();
  }

  obtenerTodos() {
    const productos = this.db.prepare('SELECT * FROM productos WHERE activo = 1 ORDER BY nombre').all();
    for (const p of productos) {
      p.variantes = this.db.prepare('SELECT * FROM variantes WHERE producto_id = ? AND activo = 1').all(p.id);
      p.modificadores = this.db.prepare('SELECT * FROM modificadores WHERE producto_id = ? AND activo = 1').all(p.id);
      for (const m of p.modificadores) {
        m.opciones = this.db.prepare('SELECT * FROM opciones_mod WHERE modificador_id = ? AND activo = 1').all(m.id);
      }
      p.agregados = this.db.prepare('SELECT * FROM agregados WHERE producto_id = ? AND activo = 1').all(p.id);
    }
    return productos;
  }

  obtenerPorId(id) {
    const p = this.db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
    if (!p) return null;
    p.variantes = this.db.prepare('SELECT * FROM variantes WHERE producto_id = ? AND activo = 1').all(p.id);
    p.modificadores = this.db.prepare('SELECT * FROM modificadores WHERE producto_id = ? AND activo = 1').all(p.id);
    for (const m of p.modificadores) {
      m.opciones = this.db.prepare('SELECT * FROM opciones_mod WHERE modificador_id = ? AND activo = 1').all(m.id);
    }
    p.agregados = this.db.prepare('SELECT * FROM agregados WHERE producto_id = ? AND activo = 1').all(p.id);
    return p;
  }

  obtenerBasico(id) {
    return this.db.prepare('SELECT id, nombre, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(id);
  }

  actualizarStock(id, stockActual, controlarStock = undefined, stockMinimo = undefined) {
    if (controlarStock !== undefined && stockMinimo !== undefined) {
      this.db.prepare('UPDATE productos SET stock_actual = ?, controlar_stock = ?, stock_minimo = ? WHERE id = ?')
        .run(stockActual, controlarStock ? 1 : 0, stockMinimo, id);
    } else {
      this.db.prepare('UPDATE productos SET stock_actual = ? WHERE id = ?').run(stockActual, id);
    }
    return this.db.prepare('SELECT id, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(id);
  }

  incrementarStock(id, cantidad) {
    this.db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?').run(cantidad, id);
    return this.db.prepare('SELECT id, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(id);
  }

  crear(nombre, precio, categoriaId = null, controlarStock = 0, stockActual = 0, stockMinimo = 3) {
    const res = this.db.prepare(`
      INSERT INTO productos (nombre, precio, categoria_id, controlar_stock, stock_actual, stock_minimo, uuid) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nombre, precio, categoriaId, controlarStock ? 1 : 0, stockActual, stockMinimo, generateUUID());
    return this.obtenerPorId(res.lastInsertRowid);
  }

  actualizar(id, nombre, precio, categoriaId, controlarStock, stockActual, stockMinimo) {
    this.db.prepare(`
      UPDATE productos 
      SET nombre = ?, precio = ?, categoria_id = ?, 
          controlar_stock = COALESCE(?, controlar_stock), 
          stock_actual = COALESCE(?, stock_actual), 
          stock_minimo = COALESCE(?, stock_minimo) 
      WHERE id = ?
    `).run(
      nombre,
      precio,
      categoriaId || null,
      controlarStock != null ? (controlarStock ? 1 : 0) : null,
      stockActual != null ? Math.max(0, parseInt(stockActual, 10) || 0) : null,
      stockMinimo != null ? Math.max(0, parseInt(stockMinimo, 10) || 3) : null,
      id
    );
    return this.obtenerPorId(id);
  }

  eliminar(id) {
    this.db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(id);
    return { ok: true };
  }

  actualizarStockBatch(items) {
    const results = [];
    const updateStmt = this.db.prepare(`
      UPDATE productos 
      SET stock_actual = ?,
          controlar_stock = COALESCE(?, controlar_stock),
          stock_minimo = COALESCE(?, stock_minimo)
      WHERE id = ?
    `);
    const getStmt = this.db.prepare('SELECT * FROM productos WHERE id = ?');

    this.db.transaction(() => {
      for (const item of items) {
        if (!item.id) continue;
        const sActual = Math.max(0, parseInt(item.stock_actual, 10) || 0);
        const cStock = item.controlar_stock != null ? (item.controlar_stock ? 1 : 0) : null;
        const sMin = item.stock_minimo != null ? Math.max(0, parseInt(item.stock_minimo, 10) || 0) : null;

        updateStmt.run(sActual, cStock, sMin, item.id);
        const act = getStmt.get(item.id);
        if (act) results.push(act);
      }
    })();

    return results;
  }
}

module.exports = new ProductoRepository();
module.exports.ProductoRepository = ProductoRepository;
