const { Router } = require('express');
const db = require('../db');

function createProductosRouter(io) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const productos = db.prepare(`
        SELECT p.*, c.nombre as categoria, c.color as categoria_color
        FROM productos p
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = 1
        ORDER BY c.nombre, p.nombre
      `).all();
      for (const p of productos) {
        p.variantes = db.prepare('SELECT * FROM variantes WHERE producto_id = ? AND activo = 1 ORDER BY precio_adicional').all(p.id);
        p.modificadores = db.prepare('SELECT * FROM modificadores WHERE producto_id = ? AND activo = 1').all(p.id);
        for (const m of p.modificadores) {
          m.opciones = db.prepare('SELECT * FROM opciones_mod WHERE modificador_id = ? AND activo = 1').all(m.id);
        }
        p.agregados = db.prepare('SELECT * FROM agregados WHERE producto_id = ? AND activo = 1').all(p.id);
      }
      res.json(productos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/categorias', (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ajuste rápido de stock de un solo producto
  router.patch('/:id/stock', (req, res) => {
    const { stock_actual, controlar_stock, stock_minimo } = req.body;
    try {
      const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
      if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

      let updates = [];
      let params = [];

      if (stock_actual != null) {
        updates.push('stock_actual = ?');
        params.push(Math.max(0, parseInt(stock_actual, 10) || 0));
      }
      if (controlar_stock != null) {
        updates.push('controlar_stock = ?');
        params.push(controlar_stock ? 1 : 0);
      }
      if (stock_minimo != null) {
        updates.push('stock_minimo = ?');
        params.push(Math.max(0, parseInt(stock_minimo, 10) || 0));
      }

      if (updates.length > 0) {
        params.push(req.params.id);
        db.prepare(`UPDATE productos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      const actualizado = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
      if (io) {
        io.emit('stock:actualizado', {
          producto_id: actualizado.id,
          controlar_stock: actualizado.controlar_stock,
          stock_actual: actualizado.stock_actual,
          stock_minimo: actualizado.stock_minimo
        });
      }
      res.json(actualizado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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
