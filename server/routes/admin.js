const { Router } = require('express');
const db = require('../db');

function createAdminRouter() {
  const router = Router();

  // ─── CATEGORIAS ───
  router.get('/categorias', (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/categorias', (req, res) => {
    try {
      const { nombre, color } = req.body;
      if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
      const r = db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run(nombre, color || '#6B7280');
      res.status(201).json(db.prepare('SELECT * FROM categorias WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/categorias/:id', (req, res) => {
    try {
      const { nombre, color, activo } = req.body;
      db.prepare('UPDATE categorias SET nombre=?, color=?, activo=? WHERE id=?')
        .run(nombre, color, activo ?? 1, req.params.id);
      res.json(db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── PRODUCTOS ───
  router.get('/productos', (req, res) => {
    try {
      const { categoria_id, activo } = req.query;
      let sql = `SELECT p.*, c.nombre as categoria_nombre, c.color as categoria_color
                 FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id`;
      const wheres = [];
      const params = [];
      if (categoria_id) { wheres.push('p.categoria_id = ?'); params.push(categoria_id); }
      if (activo !== undefined) { wheres.push('p.activo = ?'); params.push(activo); }
      if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
      sql += ' ORDER BY p.nombre';
      res.json(db.prepare(sql).all(...params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/productos/completo', (req, res) => {
    try {
      const productos = db.prepare(`
        SELECT p.*, c.nombre as categoria_nombre, c.color as categoria_color
        FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
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
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/productos', (req, res) => {
    try {
      const { nombre, descripcion, precio, categoria_id, para_llevar } = req.body;
      if (!nombre || precio == null) return res.status(400).json({ error: 'nombre y precio requeridos' });
      const r = db.prepare('INSERT INTO productos (nombre, descripcion, precio, categoria_id, para_llevar) VALUES (?,?,?,?,?)')
        .run(nombre, descripcion || '', precio, categoria_id || null, para_llevar ? 1 : 0);
      res.status(201).json(db.prepare('SELECT * FROM productos WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/productos/:id', (req, res) => {
    try {
      const { nombre, descripcion, precio, categoria_id, activo, para_llevar } = req.body;
      db.prepare('UPDATE productos SET nombre=?, descripcion=?, precio=?, categoria_id=?, activo=?, para_llevar=? WHERE id=?')
        .run(nombre, descripcion || '', precio, categoria_id || null, activo ?? 1, para_llevar ? 1 : 0, req.params.id);
      res.json(db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── VARIANTES ───
  router.get('/productos/:id/variantes', (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM variantes WHERE producto_id = ? ORDER BY precio_adicional').all(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/variantes', (req, res) => {
    try {
      const { producto_id, nombre, precio_adicional } = req.body;
      if (!producto_id || !nombre) return res.status(400).json({ error: 'producto_id y nombre requeridos' });
      const r = db.prepare('INSERT INTO variantes (producto_id, nombre, precio_adicional) VALUES (?,?,?)')
        .run(producto_id, nombre, precio_adicional || 0);
      res.status(201).json(db.prepare('SELECT * FROM variantes WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/variantes/:id', (req, res) => {
    try {
      const { nombre, precio_adicional, activo } = req.body;
      db.prepare('UPDATE variantes SET nombre=?, precio_adicional=?, activo=? WHERE id=?')
        .run(nombre, precio_adicional || 0, activo ?? 1, req.params.id);
      res.json(db.prepare('SELECT * FROM variantes WHERE id = ?').get(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/variantes/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM variantes WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── MODIFICADORES ───
  router.get('/productos/:id/modificadores', (req, res) => {
    try {
      const mods = db.prepare('SELECT * FROM modificadores WHERE producto_id = ? AND activo = 1').all(req.params.id);
      for (const m of mods) {
        m.opciones = db.prepare('SELECT * FROM opciones_mod WHERE modificador_id = ? AND activo = 1').all(m.id);
      }
      res.json(mods);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/modificadores', (req, res) => {
    try {
      const { producto_id, nombre, tipo, requerido, max_opciones } = req.body;
      if (!producto_id || !nombre) return res.status(400).json({ error: 'producto_id y nombre requeridos' });
      const r = db.prepare('INSERT INTO modificadores (producto_id, nombre, tipo, requerido, max_opciones) VALUES (?,?,?,?,?)')
        .run(producto_id, nombre, tipo || 'select', requerido ? 1 : 0, max_opciones || 1);
      res.status(201).json(db.prepare('SELECT * FROM modificadores WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/modificadores/:id', (req, res) => {
    try {
      const { nombre, tipo, requerido, max_opciones, activo } = req.body;
      db.prepare('UPDATE modificadores SET nombre=?, tipo=?, requerido=?, max_opciones=?, activo=? WHERE id=?')
        .run(nombre, tipo || 'select', requerido ? 1 : 0, max_opciones || 1, activo ?? 1, req.params.id);
      res.json(db.prepare('SELECT * FROM modificadores WHERE id = ?').get(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/modificadores/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM opciones_mod WHERE modificador_id = ?').run(req.params.id);
      db.prepare('DELETE FROM modificadores WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── OPCIONES MOD ───
  router.post('/opciones-mod', (req, res) => {
    try {
      const { modificador_id, nombre, precio_adicional } = req.body;
      if (!modificador_id || !nombre) return res.status(400).json({ error: 'modificador_id y nombre requeridos' });
      const r = db.prepare('INSERT INTO opciones_mod (modificador_id, nombre, precio_adicional) VALUES (?,?,?)')
        .run(modificador_id, nombre, precio_adicional || 0);
      res.status(201).json(db.prepare('SELECT * FROM opciones_mod WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/opciones-mod/:id', (req, res) => {
    try {
      const { nombre, precio_adicional, activo } = req.body;
      db.prepare('UPDATE opciones_mod SET nombre=?, precio_adicional=?, activo=? WHERE id=?')
        .run(nombre, precio_adicional || 0, activo ?? 1, req.params.id);
      res.json(db.prepare('SELECT * FROM opciones_mod WHERE id = ?').get(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/opciones-mod/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM opciones_mod WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── AGREGADOS ───
  router.get('/productos/:id/agregados', (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM agregados WHERE producto_id = ? AND activo = 1').all(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/agregados', (req, res) => {
    try {
      const { producto_id, nombre, precio, maximo } = req.body;
      if (!producto_id || !nombre || precio == null) return res.status(400).json({ error: 'producto_id, nombre y precio requeridos' });
      const r = db.prepare('INSERT INTO agregados (producto_id, nombre, precio, maximo) VALUES (?,?,?,?)')
        .run(producto_id, nombre, precio, maximo || 5);
      res.status(201).json(db.prepare('SELECT * FROM agregados WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/agregados/:id', (req, res) => {
    try {
      const { nombre, precio, maximo, activo } = req.body;
      db.prepare('UPDATE agregados SET nombre=?, precio=?, maximo=?, activo=? WHERE id=?')
        .run(nombre, precio, maximo || 5, activo ?? 1, req.params.id);
      res.json(db.prepare('SELECT * FROM agregados WHERE id = ?').get(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/agregados/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM agregados WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── PEDIDOS (admin) ───
  router.get('/pedidos/reporte', (req, res) => {
    try {
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];
      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre,
          (SELECT COUNT(*) FROM pedido_items WHERE pedido_id = p.id) as total_items
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        WHERE date(p.created_at) = ?
        ORDER BY p.created_at DESC
      `).all(hoy);
      const totalVentas = pedidos.filter(p => p.estado === 'CERRADO').reduce((s, p) => s + p.total, 0);
      res.json({ pedidos, totalVentas, cantidad: pedidos.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/pedidos/reporte/detalle', (req, res) => {
    try {
      const items = db.prepare(`
        SELECT pi.producto_nombre, SUM(pi.cantidad) as total_vendido,
               SUM(pi.cantidad * (pi.precio_unitario + pi.precio_adicional)) as total_ingresos
        FROM pedido_items pi
        JOIN pedidos p ON p.id = pi.pedido_id
        WHERE p.estado = 'CERRADO' AND date(p.created_at) = date('now')
        GROUP BY pi.producto_nombre ORDER BY total_vendido DESC
      `).all();
      res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = createAdminRouter;
