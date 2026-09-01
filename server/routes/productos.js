const { Router } = require('express');
const db = require('../db');
const productoRepo = require('../repositories/ProductoRepository');
const productoController = require('../controllers/ProductoController');

function createProductosRouter(io) {
  const router = Router();

  router.get('/', (req, res) => productoController.obtenerProductos(req, res));
  router.get('/categorias', (req, res) => productoController.obtenerCategorias(req, res));
  router.patch('/:id/stock', (req, res) => productoController.actualizarStock(req, res, io));

  // Ajuste batch de stock rápido (para modal de cocina/caja)
  router.post('/stock-batch', (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items debe ser un array' });

    try {
      const results = [];
      const updateStmt = db.prepare(`
        UPDATE productos 
        SET stock_actual = ?,
            controlar_stock = COALESCE(?, controlar_stock),
            stock_minimo = COALESCE(?, stock_minimo)
        WHERE id = ?
      `);

      const getStmt = db.prepare('SELECT * FROM productos WHERE id = ?');

      db.transaction(() => {
        for (const item of items) {
          if (!item.id) continue;
          const sActual = Math.max(0, parseInt(item.stock_actual, 10) || 0);
          const cStock = item.controlar_stock != null ? (item.controlar_stock ? 1 : 0) : null;
          const sMin = item.stock_minimo != null ? (Math.max(0, parseInt(item.stock_minimo, 10) || 0)) : null;

          updateStmt.run(sActual, cStock, sMin, item.id);
          const act = getStmt.get(item.id);
          if (act) {
            results.push(act);
            if (io) {
              io.emit('stock:actualizado', {
                producto_id: act.id,
                controlar_stock: act.controlar_stock,
                stock_actual: act.stock_actual,
                stock_minimo: act.stock_minimo
              });
            }
          }
        }
      })();

      res.json({ ok: true, actualizados: results.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', (req, res) => {
    const { nombre, precio, categoria_id, controlar_stock, stock_actual, stock_minimo } = req.body;
    if (!nombre || precio == null) {
      return res.status(400).json({ error: 'nombre y precio son requeridos' });
    }
    try {
      const result = db.prepare(`
        INSERT INTO productos (nombre, precio, categoria_id, controlar_stock, stock_actual, stock_minimo) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        nombre,
        precio,
        categoria_id || null,
        controlar_stock ? 1 : 0,
        Math.max(0, parseInt(stock_actual, 10) || 0),
        Math.max(0, parseInt(stock_minimo, 10) || 3)
      );
      const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(producto);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    const { nombre, precio, categoria_id, controlar_stock, stock_actual, stock_minimo } = req.body;
    try {
      db.prepare(`
        UPDATE productos 
        SET nombre = ?, precio = ?, categoria_id = ?, 
            controlar_stock = COALESCE(?, controlar_stock), 
            stock_actual = COALESCE(?, stock_actual), 
            stock_minimo = COALESCE(?, stock_minimo) 
        WHERE id = ?
      `).run(
        nombre,
        precio,
        categoria_id || null,
        controlar_stock != null ? (controlar_stock ? 1 : 0) : null,
        stock_actual != null ? Math.max(0, parseInt(stock_actual, 10) || 0) : null,
        stock_minimo != null ? Math.max(0, parseInt(stock_minimo, 10) || 3) : null,
        req.params.id
      );
      const act = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
      if (io) {
        io.emit('stock:actualizado', {
          producto_id: act.id,
          controlar_stock: act.controlar_stock,
          stock_actual: act.stock_actual,
          stock_minimo: act.stock_minimo
        });
      }
      res.json(act);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createProductosRouter;
