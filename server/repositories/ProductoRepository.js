const defaultDb = require('../db');

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

  actualizarStock(id, stockActual, controlarStock = undefined, stockMinimo = undefined) {
    if (controlarStock !== undefined && stockMinimo !== undefined) {
      this.db.prepare('UPDATE productos SET stock_actual = ?, controlar_stock = ?, stock_minimo = ? WHERE id = ?')
        .run(stockActual, controlarStock ? 1 : 0, stockMinimo, id);
    } else {
      this.db.prepare('UPDATE productos SET stock_actual = ? WHERE id = ?').run(stockActual, id);
    }
    return this.db.prepare('SELECT id, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(id);
  }
}

module.exports = new ProductoRepository();
module.exports.ProductoRepository = ProductoRepository;
