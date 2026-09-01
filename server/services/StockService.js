const db = require('../db');

/**
 * Servicio de gestión de Stock de productos.
 * Encapsula la lógica de verificación, descuento y reposición de stock.
 */
class StockService {
  constructor(database = db) {
    this.db = database;
  }

  /**
   * Valida disponibilidad y descuenta el stock de los productos indicados.
   * @param {Array} items - Lista de items con producto_id y cantidad
   * @returns {Array} Productos con stock actualizado
   */
  validarYDescontarStock(items) {
    const qtyPerProduct = {};
    for (const item of items || []) {
      if (!item.producto_id) continue;
      const q = item.cantidad || 1;
      qtyPerProduct[item.producto_id] = (qtyPerProduct[item.producto_id] || 0) + q;
    }

    const affectedProducts = [];
    for (const [prodIdStr, requestedQty] of Object.entries(qtyPerProduct)) {
      const prodId = parseInt(prodIdStr, 10);
      const prod = this.db.prepare('SELECT id, nombre, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(prodId);
      if (!prod) continue;

      if (prod.controlar_stock) {
        if (prod.stock_actual <= 0) {
          throw { status: 400, error: `El producto "${prod.nombre}" está AGOTADO en cocina/barra` };
        }
        if (requestedQty > prod.stock_actual) {
          throw { status: 400, error: `Stock insuficiente para "${prod.nombre}". Quedan ${prod.stock_actual} unidad(es)` };
        }

        this.db.prepare('UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?').run(requestedQty, prodId);
        const updated = this.db.prepare('SELECT id, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(prodId);
        affectedProducts.push(updated);
      }
    }
    return affectedProducts;
  }

  /**
   * Repone el stock de los productos de los items indicados (ej. cancelación/eliminación).
   * @param {Array} items - Lista de items con producto_id y cantidad
   * @returns {Array} Productos con stock actualizado
   */
  reponerStock(items) {
    const qtyPerProduct = {};
    for (const item of items || []) {
      if (!item.producto_id) continue;
      const q = item.cantidad || 1;
      qtyPerProduct[item.producto_id] = (qtyPerProduct[item.producto_id] || 0) + q;
    }

    const affectedProducts = [];
    for (const [prodIdStr, qty] of Object.entries(qtyPerProduct)) {
      const prodId = parseInt(prodIdStr, 10);
      const prod = this.db.prepare('SELECT id, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(prodId);
      if (prod && prod.controlar_stock) {
        this.db.prepare('UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?').run(qty, prodId);
        const updated = this.db.prepare('SELECT id, controlar_stock, stock_actual, stock_minimo FROM productos WHERE id = ?').get(prodId);
        affectedProducts.push(updated);
      }
    }
    return affectedProducts;
  }

  /**
   * Emite el evento de WebSocket stock:actualizado para los productos indicados.
   * @param {Array} affectedProducts - Lista de productos actualizados
   * @param {Object} io - Instancia de Socket.IO
   */
  emitirStockActualizado(affectedProducts, io) {
    if (!io || !affectedProducts || !affectedProducts.length) return;
    for (const p of affectedProducts) {
      io.emit('stock:actualizado', {
        producto_id: p.id,
        controlar_stock: p.controlar_stock,
        stock_actual: p.stock_actual,
        stock_minimo: p.stock_minimo
      });
    }
  }
}

module.exports = new StockService();
module.exports.StockService = StockService;
