const { Router } = require('express');
const db = require('../db');

function createProductosRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      res.json(db.prepare(`
        SELECT p.*, c.nombre as categoria, c.color as categoria_color
        FROM productos p
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = 1
        ORDER BY c.nombre, p.nombre
      `).all());
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

  router.post('/', (req, res) => {
    const { nombre, precio, categoria_id } = req.body;
    if (!nombre || precio == null) {
      return res.status(400).json({ error: 'nombre y precio son requeridos' });
    }
    try {
      const result = db.prepare('INSERT INTO productos (nombre, precio, categoria_id) VALUES (?, ?, ?)')
        .run(nombre, precio, categoria_id || null);
      const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(producto);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    const { nombre, precio, categoria_id } = req.body;
    try {
      db.prepare('UPDATE productos SET nombre = ?, precio = ?, categoria_id = ? WHERE id = ?')
        .run(nombre, precio, categoria_id || null, req.params.id);
      res.json(db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id));
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
