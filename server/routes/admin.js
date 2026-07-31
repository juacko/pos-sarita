const { Router } = require('express');
const db = require('../db');
const printers = require('../printers');

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
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre,
          (SELECT COUNT(*) FROM pedido_items WHERE pedido_id = p.id) as total_items
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE date(p.created_at) = ?
        ORDER BY p.created_at DESC
      `).all(hoy);
      const totalVentas = pedidos.filter(p => p.estado === 'CERRADO').reduce((s, p) => s + p.total, 0);
      res.json({ pedidos, totalVentas, cantidad: pedidos.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/pedidos/reporte/detalle', (req, res) => {
    try {
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];
      const items = db.prepare(`
        SELECT pi.producto_nombre, SUM(pi.cantidad) as total_vendido,
               SUM(pi.cantidad * (pi.precio_unitario + pi.precio_adicional)) as total_ingresos
        FROM pedido_items pi
        JOIN pedidos p ON p.id = pi.pedido_id
        WHERE p.estado = 'CERRADO' AND date(p.created_at) = ?
        GROUP BY pi.producto_nombre ORDER BY total_vendido DESC
      `).all(hoy);
      res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/corte-caja', (req, res) => {
    try {
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];

      const pagos = db.prepare(`
        SELECT pg.metodo, COUNT(*) as cantidad, SUM(pg.monto) as total, SUM(pg.propina) as total_propina
        FROM pagos pg
        JOIN pedidos p ON p.id = pg.pedido_id
        WHERE date(pg.created_at) = ?
        GROUP BY pg.metodo
      `).all(hoy);

      const desglose = { efectivo: { cantidad: 0, total: 0 }, tarjeta: { cantidad: 0, total: 0 }, transferencia: { cantidad: 0, total: 0 }, otros: { cantidad: 0, total: 0 }, regalo: { cantidad: 0, total: 0 }, vale: { cantidad: 0, total: 0 } };
      let totalGeneral = 0;
      let totalPropina = 0;
      for (const pg of pagos) {
        if (desglose[pg.metodo]) {
          desglose[pg.metodo] = { cantidad: pg.cantidad, total: pg.total, total_propina: pg.total_propina || 0 };
        }
        totalGeneral += pg.total;
        totalPropina += pg.total_propina || 0;
      }

      const pedidosCerrados = db.prepare(`
        SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
        FROM pedidos WHERE estado = 'CERRADO' AND date(created_at) = ?
      `).get(hoy);

      const descuentosDelDia = db.prepare(`
        SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN 0 ELSE valor END), 0) as monto_fijo,
               SUM(CASE WHEN tipo = 'porcentaje' THEN valor ELSE 0 END) as porcentaje_sum
        FROM descuentos d
        JOIN pedidos p ON p.id = d.pedido_id
        WHERE date(d.created_at) = ?
      `).get(hoy);

      const valesUsados = db.prepare(`
        SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
        FROM pagos pg
        JOIN pedidos p ON p.id = pg.pedido_id
        WHERE pg.metodo = 'vale' AND date(pg.created_at) = ?
      `).get(hoy);

      const regalos = db.prepare(`
        SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
        FROM pagos pg
        JOIN pedidos p ON p.id = pg.pedido_id
        WHERE pg.metodo = 'regalo' AND date(pg.created_at) = ?
      `).get(hoy);

      const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ? ORDER BY id DESC LIMIT 1').get('ABIERTA');

      const movimientos = db.prepare(`
        SELECT cm.*, u.nombre as usuario_nombre
        FROM caja_movimientos cm
        LEFT JOIN usuarios u ON u.id = cm.usuario_id
        WHERE date(cm.created_at) = ?
        ORDER BY cm.created_at ASC
      `).all(hoy);

      let totalIngresos = 0, totalEgresos = 0;
      const porMetodo = {};
      for (const mv of movimientos) {
        if (mv.tipo === 'INGRESO') totalIngresos += mv.monto;
        else totalEgresos += mv.monto;
        if (!porMetodo[mv.metodo_pago]) porMetodo[mv.metodo_pago] = { ingresos: 0, egresos: 0 };
        porMetodo[mv.metodo_pago][mv.tipo === 'INGRESO' ? 'ingresos' : 'egresos'] += mv.monto;
      }

      res.json({
        fecha: hoy,
        desglose,
        total_general: totalGeneral,
        total_propina: totalPropina,
        total_pedidos: pedidosCerrados.total,
        suma_pedidos: pedidosCerrados.suma,
        descuentos: descuentosDelDia,
        vales_usados: valesUsados,
        regalos: regalos,
        sesion: sesion || null,
        movimientos: movimientos,
        movimientos_totales: { ingresos: totalIngresos, egresos: totalEgresos, por_metodo: porMetodo }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/flujo', (req, res) => {
    try {
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];

      const pagos = db.prepare(`
        SELECT pg.id, pg.metodo, pg.monto, pg.propina, pg.referencia, pg.notas, pg.created_at,
               p.id as pedido_id, p.total as pedido_total, u.nombre as cajero_nombre
        FROM pagos pg
        JOIN pedidos p ON p.id = pg.pedido_id
        LEFT JOIN usuarios u ON u.id = pg.usuario_id
        WHERE date(pg.created_at) = ?
        ORDER BY pg.created_at ASC
      `).all(hoy);

      const movimientos = db.prepare(`
        SELECT cm.*, u.nombre as usuario_nombre
        FROM caja_movimientos cm
        LEFT JOIN usuarios u ON u.id = cm.usuario_id
        WHERE date(cm.created_at) = ?
        ORDER BY cm.created_at ASC
      `).all(hoy);

      const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ? ORDER BY id DESC LIMIT 1').get('ABIERTA');

      const historialCerradas = db.prepare(`
        SELECT cs.*, u.nombre as usuario_nombre
        FROM caja_sesiones cs
        LEFT JOIN usuarios u ON u.id = cs.usuario_id
        WHERE date(cs.opened_at) = ? AND cs.estado = 'CERRADA'
        ORDER BY cs.closed_at DESC
      `).all(hoy);

      const eventos = [];
      if (sesion) {
        eventos.push({ tipo: 'APERTURA', hora: sesion.opened_at, monto: sesion.fondo_inicial, persona: sesion.usuario_nombre || 'Sistema', concepto: `Fondo inicial: $${(sesion.fondo_inicial || 0).toFixed(2)}`, metodo: 'efectivo' });
      }
      for (const pg of pagos) {
        eventos.push({ tipo: 'PAGO', hora: pg.created_at, monto: pg.monto, persona: pg.cajero_nombre || 'Sistema', concepto: `Pedido #${pg.pedido_id}`, metodo: pg.metodo, propina: pg.propina || 0, referencia: pg.referencia, notas: pg.notas });
      }
      for (const mv of movimientos) {
        eventos.push({ tipo: mv.tipo, hora: mv.created_at, monto: mv.monto, persona: mv.persona || mv.usuario_nombre || 'Sistema', concepto: mv.concepto, metodo: mv.metodo_pago, notas: mv.notas });
      }

      eventos.sort((a, b) => new Date(a.hora) - new Date(b.hora));

      res.json({ eventos, sesion: sesion || null, historial_cerradas: historialCerradas });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CAJA SESIONES ───
  router.post('/caja/abrir', (req, res) => {
    try {
      const { usuario_id, fondo_inicial, notas } = req.body;
      if (!usuario_id) return res.status(400).json({ error: 'usuario_id requerido' });

      const abierta = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ?').get('ABIERTA');
      if (abierta) return res.status(409).json({ error: 'Ya hay una sesión de caja abierta', sesion: abierta });

      const result = db.prepare('INSERT INTO caja_sesiones (usuario_id, fondo_inicial, notas_apertura) VALUES (?, ?, ?)')
        .run(usuario_id, parseFloat(fondo_inicial) || 0, notas || null);

      res.status(201).json(db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(result.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/caja/cerrar', (req, res) => {
    try {
      const { efectivo_contado, notas } = req.body;
      const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ?').get('ABIERTA');
      if (!sesion) return res.status(404).json({ error: 'No hay sesión de caja abierta' });

      const fecha = new Date(sesion.opened_at).toISOString().split('T')[0];
      const efectivoPagos = db.prepare(`
        SELECT COALESCE(SUM(pg.monto), 0) as total
        FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
        WHERE pg.metodo = 'efectivo' AND date(pg.created_at) = ?
      `).get(fecha);

      const movIngresos = db.prepare(`
        SELECT COALESCE(SUM(monto), 0) as total
        FROM caja_movimientos
        WHERE tipo = 'INGRESO' AND metodo_pago = 'efectivo' AND date(created_at) = ?
      `).get(fecha);

      const movEgresos = db.prepare(`
        SELECT COALESCE(SUM(monto), 0) as total
        FROM caja_movimientos
        WHERE tipo = 'EGRESO' AND metodo_pago = 'efectivo' AND date(created_at) = ?
      `).get(fecha);

      const fondo = sesion.fondo_inicial;
      const efectivo = parseFloat(efectivo_contado) || 0;
      const pagosEfectivo = efectivoPagos.total || 0;
      const ingresosEfectivo = movIngresos.total || 0;
      const egresosEfectivo = movEgresos.total || 0;
      const efectivoEsperado = fondo + pagosEfectivo + ingresosEfectivo - egresosEfectivo;
      const sobrante_faltante = efectivo - efectivoEsperado;

      db.prepare('UPDATE caja_sesiones SET efectivo_contado = ?, notas_cierre = ?, estado = ?, closed_at = datetime(\'now\') WHERE id = ?')
        .run(efectivo, notas || null, 'CERRADA', sesion.id);

      res.json({
        ok: true,
        fondo_inicial: fondo,
        efectivo_en_pagos: pagosEfectivo,
        ingresos_efectivo: ingresosEfectivo,
        egresos_efectivo: egresosEfectivo,
        efectivo_esperado: efectivoEsperado,
        efectivo_contado: efectivo,
        sobrante_faltante: sobrante_faltante
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/sesion-actual', (req, res) => {
    try {
      const sesion = db.prepare('SELECT cs.*, u.nombre as usuario_nombre FROM caja_sesiones cs LEFT JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado = ? ORDER BY cs.id DESC LIMIT 1').get('ABIERTA');
      res.json(sesion || null);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/historial', (req, res) => {
    try {
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];
      const sesiones = db.prepare(`
        SELECT cs.*, u.nombre as usuario_nombre
        FROM caja_sesiones cs
        LEFT JOIN usuarios u ON u.id = cs.usuario_id
        WHERE date(cs.opened_at) = ?
        ORDER BY cs.opened_at DESC
      `).all(hoy);
      res.json(sesiones);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CAJA MOVIMIENTOS ───
  router.post('/caja/movimientos', (req, res) => {
    try {
      const { tipo, concepto, monto, metodo_pago, persona, usuario_id, notas } = req.body;
      if (!tipo || !['INGRESO', 'EGRESO'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido (INGRESO o EGRESO)' });
      if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'Concepto requerido' });
      if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });
      if (!metodo_pago || !['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia'].includes(metodo_pago)) {
        return res.status(400).json({ error: 'Método de pago inválido' });
      }

      const result = db.prepare(`
        INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(tipo, concepto.trim(), monto, metodo_pago, persona || null, usuario_id || null, notas || null);

      const mov = db.prepare('SELECT cm.*, u.nombre as usuario_nombre FROM caja_movimientos cm LEFT JOIN usuarios u ON u.id = cm.usuario_id WHERE cm.id = ?').get(result.lastInsertRowid);
      res.status(201).json(mov);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/movimientos', (req, res) => {
    try {
      const { fecha, tipo } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];
      let sql = `SELECT cm.*, u.nombre as usuario_nombre FROM caja_movimientos cm LEFT JOIN usuarios u ON u.id = cm.usuario_id WHERE date(cm.created_at) = ?`;
      const params = [hoy];
      if (tipo && ['INGRESO', 'EGRESO'].includes(tipo)) {
        sql += ' AND cm.tipo = ?';
        params.push(tipo);
      }
      sql += ' ORDER BY cm.created_at DESC';
      res.json(db.prepare(sql).all(...params));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/caja/movimientos/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/movimientos/imprimir', (req, res) => {
    try {
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];
      const movimientos = db.prepare(`
        SELECT cm.*, u.nombre as usuario_nombre
        FROM caja_movimientos cm
        LEFT JOIN usuarios u ON u.id = cm.usuario_id
        WHERE date(cm.created_at) = ?
        ORDER BY cm.created_at ASC
      `).all(hoy);

      let totalIngresos = 0, totalEgresos = 0;
      const porMetodo = {};
      for (const mv of movimientos) {
        if (mv.tipo === 'INGRESO') totalIngresos += mv.monto;
        else totalEgresos += mv.monto;
        if (!porMetodo[mv.metodo_pago]) porMetodo[mv.metodo_pago] = { ingresos: 0, egresos: 0 };
        porMetodo[mv.metodo_pago][mv.tipo === 'INGRESO' ? 'ingresos' : 'egresos'] += mv.monto;
      }

      const result = printers.printResumenMovimientos(hoy, movimientos, { ingresos: totalIngresos, egresos: totalEgresos, por_metodo: porMetodo });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = createAdminRouter;
