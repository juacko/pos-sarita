const { Router } = require('express');
const db = require('../db');
const printers = require('../printers');

function createAdminRouter(io) {
  const router = Router();

  // ─── CONFIGURACION ───
  router.get('/configuracion', (req, res) => {
    try {
      const filas = db.prepare('SELECT clave, valor FROM configuracion ORDER BY clave').all();
      const out = {};
      for (const f of filas) {
        try { out[f.clave] = JSON.parse(f.valor); } catch { out[f.clave] = f.valor; }
      }
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/configuracion/:clave', (req, res) => {
    try {
      const { clave } = req.params;
      const { valor } = req.body;
      if (valor === undefined) return res.status(400).json({ error: 'valor requerido' });
      let valorStr = valor;
      if (typeof valor === 'object') valorStr = JSON.stringify(valor);
      else {
        try { JSON.parse(valor); valorStr = JSON.stringify(JSON.parse(valor)); } catch { /* texto plano */ }
      }
      db.prepare(`
        INSERT INTO configuracion (clave, valor, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = datetime('now')
      `).run(clave, valorStr);
      res.json({ ok: true, clave });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CATEGORIAS ───
  router.get('/categorias', (req, res) => {
    try {
      res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/categorias', (req, res) => {
    try {
      const { nombre, color, destino } = req.body;
      if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
      const r = db.prepare('INSERT INTO categorias (nombre, color, destino) VALUES (?, ?, ?)').run(nombre, color || '#6B7280', destino || 'cocina');
      res.status(201).json(db.prepare('SELECT * FROM categorias WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/categorias/:id', (req, res) => {
    try {
      const { nombre, color, activo, destino } = req.body;
      db.prepare('UPDATE categorias SET nombre=?, color=?, activo=?, destino=? WHERE id=?')
        .run(nombre, color, activo ?? 1, destino || 'cocina', req.params.id);
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
      const { nombre, descripcion, precio, categoria_id, para_llevar, destino_override } = req.body;
      if (!nombre || precio == null) return res.status(400).json({ error: 'nombre y precio requeridos' });
      const r = db.prepare('INSERT INTO productos (nombre, descripcion, precio, categoria_id, para_llevar, destino_override) VALUES (?,?,?,?,?,?)')
        .run(nombre, descripcion || '', precio, categoria_id || null, para_llevar ? 1 : 0, destino_override || null);
      res.status(201).json(db.prepare('SELECT * FROM productos WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/productos/:id', (req, res) => {
    try {
      const { nombre, descripcion, precio, categoria_id, activo, para_llevar, destino_override } = req.body;
      db.prepare('UPDATE productos SET nombre=?, descripcion=?, precio=?, categoria_id=?, activo=?, para_llevar=?, destino_override=? WHERE id=?')
        .run(nombre, descripcion || '', precio, categoria_id || null, activo ?? 1, para_llevar ? 1 : 0, destino_override || null, req.params.id);
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
      const { producto_id, nombre, tipo, requerido, max_opciones, depende_variante_id } = req.body;
      if (!producto_id || !nombre) return res.status(400).json({ error: 'producto_id y nombre requeridos' });
      const r = db.prepare('INSERT INTO modificadores (producto_id, nombre, tipo, requerido, max_opciones, depende_variante_id) VALUES (?,?,?,?,?,?)')
        .run(producto_id, nombre, tipo || 'select', requerido ? 1 : 0, max_opciones || 1, depende_variante_id || null);
      res.status(201).json(db.prepare('SELECT * FROM modificadores WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/modificadores/:id', (req, res) => {
    try {
      const { nombre, tipo, requerido, max_opciones, activo, depende_variante_id } = req.body;
      db.prepare('UPDATE modificadores SET nombre=?, tipo=?, requerido=?, max_opciones=?, activo=?, depende_variante_id=? WHERE id=?')
        .run(nombre, tipo || 'select', requerido ? 1 : 0, max_opciones || 1, activo ?? 1, depende_variante_id || null, req.params.id);
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
  function getHoraCorte() {
    const fila = db.prepare("SELECT valor FROM configuracion WHERE clave = 'hora_corte'").get();
    if (!fila) return '23:00';
    try {
      const v = JSON.parse(fila.valor);
      if (/^\d{2}:\d{2}$/.test(v)) return v;
    } catch (e) {}
    return '23:00';
  }

  // Rango operativo de un día: desde (fecha-1 horaCorte) hasta (fecha horaCorte)
  function getRangoOperativo(fecha) {
    const corte = getHoraCorte();
    const [hh, mm] = corte.split(':').map(Number);
    const inicio = db.prepare(
      "SELECT datetime(?, '-1 day', ?, ?) as t"
    ).get(fecha, `+${hh} hours`, `+${mm} minutes`).t;
    const fin = db.prepare(
      "SELECT datetime(?, ?, ?) as t"
    ).get(fecha, `+${hh} hours`, `+${mm} minutes`).t;
    return { inicio, fin, corte };
  }

  router.get('/pedidos/reporte', (req, res) => {
    try {
      const { fecha, rango, sesion_id } = req.query;
      let inicio, fin, corte = null, fuenteRango = 'dia';
      if (rango === 'sesion' || sesion_id) {
        const sesion = sesion_id
          ? db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(sesion_id)
          : db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
        if (!sesion) return res.status(404).json({ error: 'Sesión de caja no encontrada' });
        inicio = sesion.absorbe_desde || sesion.opened_at;
        fin = sesion.estado === 'ABIERTA'
          ? db.prepare("SELECT datetime('now') as t").get().t
          : sesion.closed_at;
        corte = getHoraCorte();
        fuenteRango = 'sesion';
      } else {
        const hoy = fecha || new Date().toISOString().split('T')[0];
        const rangoOp = getRangoOperativo(hoy);
        inicio = rangoOp.inicio;
        fin = rangoOp.fin;
        corte = rangoOp.corte;
      }
      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre,
          (SELECT COUNT(*) FROM pedido_items WHERE pedido_id = p.id) as total_items,
          (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id AND pg.created_at >= ? AND pg.created_at < ?) as total_pagado_periodo
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE EXISTS (
          SELECT 1 FROM pagos pg WHERE pg.pedido_id = p.id AND pg.created_at >= ? AND pg.created_at < ?
        )
        ORDER BY p.created_at DESC
      `).all(inicio, fin, inicio, fin);
      const desglosePagos = getDesglosePagos(
        "pg.created_at >= ? AND pg.created_at < ? AND p.estado != 'CANCELADO'",
        [inicio, fin]
      );
      const cancelados = db.prepare(`
        SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
        FROM pedidos WHERE estado = 'CANCELADO' AND created_at >= ? AND created_at < ?
      `).get(inicio, fin);
      res.json({
        pedidos,
        totalVentas: desglosePagos.totalGeneral,
        totalPropina: desglosePagos.totalPropina,
        cantidad: pedidos.length,
        desglose: desglosePagos.desglose,
        cancelados,
        rango: { inicio, fin, corte, fuente: fuenteRango }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/pedidos/reporte/detalle', (req, res) => {
    try {
      const { fecha, rango, sesion_id } = req.query;
      let inicio, fin;
      if (rango === 'sesion' || sesion_id) {
        const sesion = sesion_id
          ? db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(sesion_id)
          : db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
        if (!sesion) return res.status(404).json({ error: 'Sesión de caja no encontrada' });
        inicio = sesion.absorbe_desde || sesion.opened_at;
        fin = sesion.estado === 'ABIERTA'
          ? db.prepare("SELECT datetime('now') as t").get().t
          : sesion.closed_at;
      } else {
        const hoy = fecha || new Date().toISOString().split('T')[0];
        const rangoOp = getRangoOperativo(hoy);
        inicio = rangoOp.inicio;
        fin = rangoOp.fin;
      }
      const items = db.prepare(`
        SELECT pi.producto_nombre, SUM(pi.cantidad) as total_vendido,
               SUM(pi.cantidad * (pi.precio_unitario + pi.precio_adicional)) as total_ingresos
        FROM pedido_items pi
        JOIN pedidos p ON p.id = pi.pedido_id
        WHERE p.estado = 'CERRADO' AND pi.estado != 'CANCELADO'
          AND EXISTS (
            SELECT 1 FROM pagos pg WHERE pg.pedido_id = p.id AND pg.created_at >= ? AND pg.created_at < ?
          )
        GROUP BY pi.producto_nombre ORDER BY total_vendido DESC
      `).all(inicio, fin);
      res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── HELPERS CAJA ───
  const pagos = require('../metodos-pago');

  function desgloseVacio() {
    const base = {
      efectivo: { cantidad: 0, total: 0, total_propina: 0 },
      tarjeta: { cantidad: 0, total: 0, total_propina: 0 },
      transferencia: { cantidad: 0, total: 0, total_propina: 0 },
      yape: { cantidad: 0, total: 0, total_propina: 0 },
      plin: { cantidad: 0, total: 0, total_propina: 0 },
      otros: { cantidad: 0, total: 0, total_propina: 0 },
      regalo: { cantidad: 0, total: 0, total_propina: 0 },
      vale: { cantidad: 0, total: 0, total_propina: 0 }
    };
    for (const key of pagos.getMetodos()) {
      if (!base[key]) base[key] = { cantidad: 0, total: 0, total_propina: 0 };
    }
    return base;
  }

  function getDesglosePagos(where, params) {
    const filas = db.prepare(`
      SELECT pg.metodo, COUNT(*) as cantidad, COALESCE(SUM(pg.monto), 0) as total, COALESCE(SUM(pg.propina), 0) as total_propina
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE ${where}
      GROUP BY pg.metodo
    `).all(...params);
    const desglose = desgloseVacio();
    let totalGeneral = 0, totalPropina = 0;
    for (const f of filas) {
      if (!desglose[f.metodo]) desglose[f.metodo] = { cantidad: 0, total: 0, total_propina: 0 };
      desglose[f.metodo] = { cantidad: f.cantidad, total: f.total, total_propina: f.total_propina };
      totalGeneral += f.total;
      totalPropina += f.total_propina;
    }
    return { desglose, totalGeneral, totalPropina };
  }

  function getMovimientosTotales(where, params) {
    const movs = db.prepare(`SELECT * FROM caja_movimientos WHERE ${where} ORDER BY created_at ASC`).all(...params);
    let ingresos = 0, egresos = 0;
    const porMetodo = {};
    for (const mv of movs) {
      if (mv.tipo === 'INGRESO') ingresos += mv.monto; else egresos += mv.monto;
      if (!porMetodo[mv.metodo_pago]) porMetodo[mv.metodo_pago] = { ingresos: 0, egresos: 0 };
      porMetodo[mv.metodo_pago][mv.tipo === 'INGRESO' ? 'ingresos' : 'egresos'] += mv.monto;
    }
    return { movs, totales: { ingresos, egresos, por_metodo: porMetodo } };
  }

  function getMetricasDia(fecha) {
    const pedidosCerrados = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CERRADO' AND date(created_at) = ?
    `).get(fecha);
    const cancelados = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CANCELADO' AND date(created_at) = ?
    `).get(fecha);
    const descuentosDelDia = db.prepare(`
      SELECT COUNT(*) as total,
             COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN (p.total * d.valor / 100) ELSE d.valor END), 0) as monto_estimado
      FROM descuentos d JOIN pedidos p ON p.id = d.pedido_id
      WHERE date(d.created_at) = ?
    `).get(fecha);
    const valesUsados = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'vale' AND date(pg.created_at) = ?
    `).get(fecha);
    const regalos = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'regalo' AND date(pg.created_at) = ?
    `).get(fecha);
    const topProductos = db.prepare(`
      SELECT pi.producto_nombre as nombre, SUM(pi.cantidad) as cantidad,
             SUM(pi.cantidad * (pi.precio_unitario + pi.precio_adicional)) as total
      FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id
      WHERE p.estado = 'CERRADO' AND date(p.created_at) = ? AND pi.estado != 'CANCELADO'
      GROUP BY pi.producto_nombre ORDER BY cantidad DESC, total DESC LIMIT 5
    `).all(fecha);
    const ventasPorHora = db.prepare(`
      SELECT strftime('%H', pg.created_at) as hora, COUNT(*) as cantidad, COALESCE(SUM(pg.monto), 0) as total
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE date(pg.created_at) = ?
      GROUP BY hora ORDER BY hora
    `).all(fecha);
    return {
      total_pedidos: pedidosCerrados.total,
      suma_pedidos: pedidosCerrados.suma,
      ticket_promedio: pedidosCerrados.total > 0 ? pedidosCerrados.suma / pedidosCerrados.total : 0,
      cancelados,
      descuentos: descuentosDelDia,
      vales_usados: valesUsados,
      regalos: regalos,
      top_productos: topProductos,
      ventas_por_hora: ventasPorHora
    };
  }

  function getMetricasSesion(inicio, fin) {
    const pedidosCerrados = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CERRADO' AND created_at >= ? AND created_at <= ?
    `).get(inicio, fin);
    const cancelados = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CANCELADO' AND created_at >= ? AND created_at <= ?
    `).get(inicio, fin);
    const descuentosSesion = db.prepare(`
      SELECT COUNT(*) as total,
             COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN (p.total * d.valor / 100) ELSE d.valor END), 0) as monto_estimado
      FROM descuentos d JOIN pedidos p ON p.id = d.pedido_id
      WHERE d.created_at >= ? AND d.created_at <= ?
    `).get(inicio, fin);
    const valesUsados = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'vale' AND pg.created_at >= ? AND pg.created_at <= ?
    `).get(inicio, fin);
    const regalos = db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'regalo' AND pg.created_at >= ? AND pg.created_at <= ?
    `).get(inicio, fin);
    return {
      total_pedidos: pedidosCerrados.total,
      suma_pedidos: pedidosCerrados.suma,
      ticket_promedio: pedidosCerrados.total > 0 ? pedidosCerrados.suma / pedidosCerrados.total : 0,
      cancelados,
      descuentos: descuentosSesion,
      vales_usados: valesUsados,
      regalos: regalos
    };
  }

  router.get('/corte-caja', (req, res) => {
    try {
      const hoy = new Date().toISOString().split('T')[0];
      const sesion = db.prepare('SELECT cs.*, u.nombre as usuario_nombre FROM caja_sesiones cs LEFT JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado = ? ORDER BY cs.id DESC LIMIT 1').get('ABIERTA');
      const now = db.prepare("SELECT datetime('now') as t").get().t;

      let desglose, totalGeneral, totalPropina, movs, totales, metricas;
      if (sesion) {
        const inicio = inicioSesion(sesion);
        const dp = getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
        desglose = dp.desglose; totalGeneral = dp.totalGeneral; totalPropina = dp.totalPropina;
        const mt = getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
        movs = mt.movs; totales = mt.totales;
        metricas = getMetricasSesion(inicio, now);
      } else {
        const dp = getDesglosePagos('date(pg.created_at) = ?', [hoy]);
        desglose = dp.desglose; totalGeneral = dp.totalGeneral; totalPropina = dp.totalPropina;
        const mt = getMovimientosTotales('date(created_at) = ?', [hoy]);
        movs = mt.movs; totales = mt.totales;
        metricas = getMetricasDia(hoy);
      }

      const propinaPorMetodo = {};
      for (const [k, v] of Object.entries(desglose)) {
        if (v.total_propina > 0) propinaPorMetodo[k] = v.total_propina;
      }

      res.json({
        fecha: hoy,
        desglose,
        total_general: totalGeneral,
        total_propina: totalPropina,
        propina_por_metodo: propinaPorMetodo,
        sesion: sesion || null,
        movimientos: movs,
        movimientos_totales: totales,
        ...metricas
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/flujo', (req, res) => {
    try {
      const sesion = db.prepare('SELECT cs.*, u.nombre as usuario_nombre FROM caja_sesiones cs LEFT JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado = ? ORDER BY cs.id DESC LIMIT 1').get('ABIERTA');

      if (!sesion) {
        return res.json({
          sesion: null,
          eventos: [],
          desglose: desgloseVacio(),
          total_general: 0,
          total_propina: 0,
          propina_por_metodo: {},
          movimientos_totales: { ingresos: 0, egresos: 0, por_metodo: {} },
          efectivo_esperado: null,
          pagos_sesion_efectivo: 0,
          total_pedidos: 0,
          ticket_promedio: 0,
          cancelados: { total: 0 },
          descuentos: { total: 0, monto_estimado: 0 },
          vales_usados: { total: 0, suma: 0 },
          regalos: { total: 0, suma: 0 }
        });
      }

      const now = db.prepare("SELECT datetime('now') as t").get().t;
      const inicio = inicioSesion(sesion);

      const pagos = db.prepare(`
        SELECT pg.id, pg.metodo, pg.monto, pg.propina, pg.referencia, pg.notas, pg.created_at,
               p.id as pedido_id, p.total as pedido_total, u.nombre as cajero_nombre
        FROM pagos pg
        JOIN pedidos p ON p.id = pg.pedido_id
        LEFT JOIN usuarios u ON u.id = pg.usuario_id
        WHERE pg.created_at >= ? AND pg.created_at <= ?
        ORDER BY pg.created_at ASC
      `).all(inicio, now);

      const { movs, totales } = getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      const { desglose, totalGeneral, totalPropina } = getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
      const metricas = getMetricasSesion(inicio, now);

      const pe = db.prepare(`
        SELECT COALESCE(SUM(pg.monto), 0) as t FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
        WHERE pg.metodo = 'efectivo' AND pg.created_at >= ? AND pg.created_at <= ?
      `).get(inicio, now);
      const mi = db.prepare(`
        SELECT COALESCE(SUM(monto), 0) as t FROM caja_movimientos
        WHERE tipo = 'INGRESO' AND metodo_pago = 'efectivo' AND created_at >= ? AND created_at <= ?
      `).get(inicio, now);
      const me = db.prepare(`
        SELECT COALESCE(SUM(monto), 0) as t FROM caja_movimientos
        WHERE tipo = 'EGRESO' AND metodo_pago = 'efectivo' AND created_at >= ? AND created_at <= ?
      `).get(inicio, now);
      const pagosSesionEfectivo = pe.t || 0;
      const efectivoEsperado = (sesion.fondo_inicial || 0) + pagosSesionEfectivo + (mi.t || 0) - (me.t || 0);

      const propinaPorMetodo = {};
      for (const [k, v] of Object.entries(desglose)) {
        if (v.total_propina > 0) propinaPorMetodo[k] = v.total_propina;
      }

      const eventos = [];
      eventos.push({ tipo: 'APERTURA', hora: sesion.opened_at, monto: sesion.fondo_inicial, persona: sesion.usuario_nombre || 'Sistema', concepto: `Fondo inicial: S/${(sesion.fondo_inicial || 0).toFixed(2)}`, metodo: 'efectivo' });
      for (const pg of pagos) {
        eventos.push({ tipo: 'PAGO', hora: pg.created_at, monto: pg.monto, persona: pg.cajero_nombre || 'Sistema', concepto: `Pedido #${pg.pedido_id} (Total: S/${(pg.pedido_total || 0).toFixed(2)})`, metodo: pg.metodo, propina: pg.propina || 0, referencia: pg.referencia, notas: pg.notas });
      }
      for (const mv of movs) {
        eventos.push({ tipo: mv.tipo, hora: mv.created_at, monto: mv.monto, persona: mv.persona || 'Sistema', concepto: mv.concepto, metodo: mv.metodo_pago, notas: mv.notas });
      }
      eventos.sort((a, b) => new Date(a.hora) - new Date(b.hora));

      let saldo = sesion.fondo_inicial || 0;
      for (const ev of eventos) {
        if (ev.tipo === 'EGRESO') saldo -= ev.monto;
        else if (ev.tipo === 'PAGO' || ev.tipo === 'INGRESO' || ev.tipo === 'APERTURA') saldo += ev.monto;
        ev.saldo = saldo;
      }

      res.json({
        sesion,
        eventos,
        desglose,
        total_general: totalGeneral,
        total_propina: totalPropina,
        propina_por_metodo: propinaPorMetodo,
        movimientos_totales: totales,
        efectivo_esperado: efectivoEsperado,
        pagos_sesion_efectivo: pagosSesionEfectivo,
        ...metricas
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── CAJA SESIONES ───
  function inicioSesion(sesion) {
    return sesion.absorbe_desde || sesion.opened_at;
  }

  function getMesasBloqueantes() {
    const mesas = db.prepare(`
      SELECT m.id, m.numero, m.nombre, m.estado, m.pedido_activo_id, m.mesero_id, u.nombre as mesero_nombre
      FROM mesas m
      LEFT JOIN usuarios u ON u.id = m.mesero_id
      WHERE m.estado IN ('OCUPADO', 'CERRANDO', 'RESERVADO')
      ORDER BY m.numero
    `).all();

    const bloqueantes = [];
    for (const m of mesas) {
      if (m.estado === 'RESERVADO' && !m.pedido_activo_id) {
        bloqueantes.push({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, tipo: 'RESERVA', pendiente: null, mesero_nombre: m.mesero_nombre });
        continue;
      }
      if (!m.pedido_activo_id) {
        bloqueantes.push({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, tipo: 'LIBERAR', pendiente: 0, mesero_nombre: m.mesero_nombre });
        continue;
      }
      const row = db.prepare(`
        SELECT p.total,
          (SELECT COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN 0 ELSE valor END), 0) FROM descuentos WHERE pedido_id = p.id) as fijo,
          (SELECT COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN valor ELSE 0 END), 0) FROM descuentos WHERE pedido_id = p.id) as pct,
          (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE pedido_id = p.id) as pagado
        FROM pedidos p WHERE p.id = ?
      `).get(m.pedido_activo_id);
      if (!row) {
        bloqueantes.push({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, tipo: 'LIBERAR', pendiente: 0, mesero_nombre: m.mesero_nombre });
        continue;
      }
      const totalFinal = Math.max(0, row.total * (1 - (row.pct || 0) / 100) - (row.fijo || 0));
      const pendiente = Math.max(0, totalFinal - (row.pagado || 0));
      if (pendiente > 0.01) {
        if (m.estado === 'RESERVADO') {
          bloqueantes.push({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, tipo: 'COBRAR', reservada: true, pendiente, mesero_nombre: m.mesero_nombre });
        } else {
          bloqueantes.push({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, tipo: 'COBRAR', pendiente, mesero_nombre: m.mesero_nombre });
        }
      } else {
        if (m.estado === 'RESERVADO') {
          bloqueantes.push({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, tipo: 'RESERVA', pedido_pagado: true, pendiente: 0, mesero_nombre: m.mesero_nombre });
        } else {
          bloqueantes.push({ id: m.id, numero: m.numero, nombre: m.nombre, estado: m.estado, tipo: 'LIBERAR', pendiente: 0, mesero_nombre: m.mesero_nombre });
        }
      }
    }
    return bloqueantes;
  }

  // ─── ANULACIÓN DE PEDIDOS ───
  router.get('/pedidos/anulables', (req, res) => {
    try {
      const pedidos = db.prepare(`
        SELECT p.id, p.mesa_id, p.estado, p.total, p.created_at, p.cliente_nombre,
               m.nombre as mesa_nombre, m.numero as mesa_numero, m.es_virtual,
               (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.estado != 'CANCELADO') as items,
               (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) as pagado
        FROM pedidos p
        LEFT JOIN mesas m ON m.id = p.mesa_id
        WHERE p.estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')
        ORDER BY p.id DESC
      `).all();
      res.json(pedidos);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/pedidos/:id/anular', (req, res) => {
    try {
      const { motivo, usuario_id } = req.body;
      if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'El motivo de anulación es requerido' });
      }

      if (!usuario_id) {
        return res.status(403).json({ error: 'Solo el administrador o el cajero pueden anular pedidos' });
      }
      const usuario = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(usuario_id);
      if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'cajero')) {
        return res.status(403).json({ error: 'Solo el administrador o el cajero pueden anular pedidos' });
      }

      const result = db.transaction(() => {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CERRADO' || pedido.estado === 'CANCELADO') {
          throw { status: 409, error: `No se puede anular un pedido en estado ${pedido.estado}` };
        }

        db.prepare("UPDATE pedidos SET estado = 'CANCELADO', motivo_cancelacion = ?, anulado_por = ?, updated_at = datetime('now') WHERE id = ?")
          .run(motivo.trim(), usuario_id || null, pedido.id);
        db.prepare("UPDATE pedido_items SET estado = 'CANCELADO' WHERE pedido_id = ?").run(pedido.id);

        let mesaData = null;
        if (pedido.mesa_id) {
          const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(pedido.mesa_id);
          if (mesa && mesa.pedido_activo_id == pedido.id) {
            db.prepare(`
              UPDATE mesas SET
                estado = 'LIBRE',
                mesero_id = NULL,
                mesero_nombre = NULL,
                pedido_activo_id = NULL,
                ocupado_desde = NULL,
                version = version + 1,
                updated_at = datetime('now')
              WHERE id = ?
            `).run(mesa.id);

            db.prepare("INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle) VALUES (?, 'PEDIDO_ANULADO', ?, ?)")
              .run(mesa.id, usuario_id || null, `Pedido #${pedido.id} anulado: ${motivo.trim()}`);
            mesaData = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesa.id);
          }
        }

        return { mesa: mesaData };
      })();

      const pedidoFinal = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      io.emit('pedido:actualizado', pedidoFinal);
      if (result.mesa) io.emit('mesa:updated', result.mesa);

      res.json({ ok: true, pedido: pedidoFinal, mesa: result.mesa });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  // ─── GESTIÓN DE PEDIDOS PAGADOS ───
  function verificarRolAdminCajero(usuario_id) {
    if (!usuario_id) return { error: 'Solo el administrador o el cajero pueden realizar esta acción' };
    const usuario = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(usuario_id);
    if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'cajero')) {
      return { error: 'Solo el administrador o el cajero pueden realizar esta acción' };
    }
    return { ok: true, rol: usuario.rol };
  }

  function sesionCajaAbierta() {
    return db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
  }

  function pagoPerteneceSesion(pago) {
    const sesion = sesionCajaAbierta();
    if (!sesion) return false;
    const inicio = inicioSesion(sesion);
    const now = db.prepare("SELECT datetime('now') as t").get().t;
    return pago.created_at >= inicio && pago.created_at <= now;
  }

  function registrarLogPago(pedido_id, pago_id, accion, motivo, detalle, usuario_id) {
    db.prepare(`
      INSERT INTO pagos_log (pedido_id, pago_id, accion, motivo, detalle, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(pedido_id, pago_id || null, accion, motivo || null, detalle || null, usuario_id || null);
  }

  function registrarEgresoDevolucion(pedidoId, metodoPago, monto, motivo, usuario_id) {
    const metodo = ['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia'].includes(metodoPago) ? metodoPago : 'otros';
    db.prepare(`
      INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
      VALUES ('EGRESO', ?, ?, ?, ?, ?, ?)
    `).run(
      `Devolución Pedido #${pedidoId}`,
      monto,
      metodo,
      null,
      usuario_id || null,
      motivo ? `Devolución: ${motivo}` : null
    );
  }

  function liberarMesaDePedido(pedido, usuario_id, detalle) {
    let mesaData = null;
    if (pedido.mesa_id) {
      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(pedido.mesa_id);
      if (mesa && mesa.pedido_activo_id == pedido.id) {
        db.prepare(`
          UPDATE mesas SET
            estado = 'LIBRE',
            mesero_id = NULL,
            mesero_nombre = NULL,
            pedido_activo_id = NULL,
            ocupado_desde = NULL,
            version = version + 1,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(mesa.id);
        db.prepare("INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle) VALUES (?, 'PEDIDO_ANULADO', ?, ?)")
          .run(mesa.id, usuario_id || null, detalle);
        mesaData = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesa.id);
      }
    }
    return mesaData;
  }

  // Historial de pedidos pagados/anulados (para vista "Pagados")
  router.get('/pedidos/pagados', (req, res) => {
    try {
      const limite = Math.min(parseInt(req.query.limite) || 50, 200);
      const pedidos = db.prepare(`
        SELECT p.id, p.mesa_id, p.estado, p.total, p.created_at, p.cliente_nombre, p.motivo_cancelacion,
               m.nombre as mesa_nombre, m.numero as mesa_numero, m.es_virtual,
               (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) as pagado,
               (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.estado != 'CANCELADO') as items
        FROM pedidos p
        LEFT JOIN mesas m ON m.id = p.mesa_id
        WHERE p.estado IN ('CERRADO','CANCELADO')
        ORDER BY p.id DESC
        LIMIT ?
      `).all(limite);
      res.json(pedidos);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Agregar pago a un pedido (dentro de la sesión de caja actual)
  router.post('/pedidos/:id/pagos', (req, res) => {
    try {
      const { metodo, monto, propina, referencia, notas, usuario_id, motivo } = req.body;
      const rolCheck = verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });
      if (!metodo || !pagos.esMetodoValido(metodo)) {
        return res.status(400).json({ error: 'Método de pago inválido o deshabilitado' });
      }
      if (monto == null || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

      const result = db.transaction(() => {
        const sesion = sesionCajaAbierta();
        if (!sesion) throw { status: 409, error: 'No hay caja abierta. Abra la caja para registrar pagos', code: 'CAJA_CERRADA' };

        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido está cancelado' };

        const descuentoRow = db.prepare('SELECT COALESCE(SUM(CASE WHEN tipo = \'porcentaje\' THEN 0 ELSE valor END), 0) as fijo, SUM(CASE WHEN tipo = \'porcentaje\' THEN valor ELSE 0 END) as pct FROM descuentos WHERE pedido_id = ?').get(pedido.id);
        const totalFinal = Math.max(0, pedido.total * (1 - (descuentoRow.pct || 0) / 100) - (descuentoRow.fijo || 0));
        const pagado = db.prepare('SELECT COALESCE(SUM(monto), 0) as t FROM pagos WHERE pedido_id = ?').get(pedido.id).t;
        const pendiente = Math.max(0, totalFinal - pagado);

        if (metodo === 'vale') {
          const valeRow = db.prepare('SELECT * FROM vales WHERE codigo = ? AND activo = 1').get(referencia);
          if (!valeRow) throw { status: 404, error: 'Vale no encontrado o inactivo' };
          if (valeRow.monto_restante < monto - 0.01) throw { status: 400, error: `El vale solo tiene S/${valeRow.monto_restante.toFixed(2)} disponibles` };
          if (monto > pendiente + 0.01) throw { status: 400, error: `El monto excede el pendiente (S/${pendiente.toFixed(2)})` };
          db.prepare('UPDATE vales SET monto_restante = monto_restante - ? WHERE id = ?').run(monto, valeRow.id);
        } else {
          if (monto > pendiente + 0.01) throw { status: 400, error: `El monto (S/${monto.toFixed(2)}) excede el pendiente (S/${pendiente.toFixed(2)})` };
        }

        const propinaMonto = parseFloat(propina) || 0;
        const r = db.prepare('INSERT INTO pagos (pedido_id, monto, metodo, propina, referencia, notas, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(pedido.id, monto, metodo, propinaMonto, referencia || null, notas || null, usuario_id || null);

        const pagadoTotal = pagado + monto;
        const fullyPaid = pagadoTotal >= totalFinal - 0.01;
        if (fullyPaid && pedido.estado !== 'CERRADO') {
          db.prepare("UPDATE pedidos SET estado = 'CERRADO', updated_at = datetime('now') WHERE id = ?").run(pedido.id);
        }

        registrarLogPago(pedido.id, r.lastInsertRowid, 'AGREGAR', motivo, `Pago ${metodo} S/${monto.toFixed(2)} agregado`, usuario_id);
        return { pagoId: r.lastInsertRowid, pagadoTotal, pendiente: Math.max(0, totalFinal - pagadoTotal), fullyPaid };
      })();

      const pedidoActualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      io.emit('pedido:actualizado', pedidoActualizado);
      res.json({ ok: true, pedido: pedidoActualizado, ...result });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  // Cambiar método/referencia de un pago existente
  router.patch('/pedidos/:id/pagos/:pagoId', (req, res) => {
    try {
      const { metodo, referencia, notas, propina, usuario_id, motivo } = req.body;
      const rolCheck = verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });
      if (metodo && !pagos.esMetodoValido(metodo)) return res.status(400).json({ error: 'Método de pago inválido o deshabilitado' });

      const result = db.transaction(() => {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND pedido_id = ?').get(req.params.pagoId, pedido.id);
        if (!pago) throw { status: 404, error: 'Pago no encontrado' };
        if (!pagoPerteneceSesion(pago)) {
          throw { status: 409, error: 'Solo se pueden modificar pagos de la caja abierta actual' };
        }

        const nuevoMetodo = metodo || pago.metodo;
        const nuevaRef = referencia !== undefined ? referencia : pago.referencia;
        const nuevasNotas = notas !== undefined ? notas : pago.notas;
        const nuevaPropina = propina !== undefined ? (parseFloat(propina) || 0) : pago.propina;

        db.prepare(`
          UPDATE pagos SET metodo = ?, referencia = ?, notas = ?, propina = ?
          WHERE id = ?
        `).run(nuevoMetodo, nuevaRef, nuevasNotas, nuevaPropina, pago.id);

        registrarLogPago(pedido.id, pago.id, 'MODIFICAR', motivo, `Método ${pago.metodo} → ${nuevoMetodo}`, usuario_id);
        return { pagoId: pago.id };
      })();

      const pagoActualizado = db.prepare('SELECT * FROM pagos WHERE id = ?').get(result.pagoId);
      res.json({ ok: true, pago: pagoActualizado });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  // Quitar un pago = devolución. Anula el pedido, genera EGRESO y libera la mesa.
  router.delete('/pedidos/:id/pagos/:pagoId', (req, res) => {
    try {
      const { motivo, usuario_id } = req.body;
      if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'El motivo de la devolución es requerido' });
      }
      const rolCheck = verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const result = db.transaction(() => {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido ya está cancelado' };
        const pago = db.prepare('SELECT * FROM pagos WHERE id = ? AND pedido_id = ?').get(req.params.pagoId, pedido.id);
        if (!pago) throw { status: 404, error: 'Pago no encontrado' };
        if (!pagoPerteneceSesion(pago)) {
          throw { status: 409, error: 'Solo se pueden anular pagos de la caja abierta actual' };
        }

        // Reversión completa: devolver todos los pagos del pedido (el pedido se anula)
        const todosPagos = db.prepare('SELECT * FROM pagos WHERE pedido_id = ?').all(pedido.id);
        for (const pg of todosPagos) {
          if (pg.metodo === 'vale' && pg.referencia) {
            const valeRow = db.prepare('SELECT * FROM vales WHERE codigo = ?').get(pg.referencia);
            if (valeRow) {
              db.prepare('UPDATE vales SET monto_restante = monto_restante + ? WHERE id = ?')
                .run(pg.monto, valeRow.id);
            }
          }
          if (pg.metodo !== 'regalo') {
            registrarEgresoDevolucion(pedido.id, pg.metodo, pg.monto, motivo.trim(), usuario_id);
          }
          registrarLogPago(pedido.id, pg.id, 'QUITAR', motivo.trim(), `Devolución pago ${pg.metodo} S/${pg.monto.toFixed(2)}`, usuario_id);
        }

        db.prepare("UPDATE pedidos SET estado = 'CANCELADO', motivo_cancelacion = ?, anulado_por = ?, updated_at = datetime('now') WHERE id = ?")
          .run(`Devolución: ${motivo.trim()}`, usuario_id || null, pedido.id);
        db.prepare("UPDATE pedido_items SET estado = 'CANCELADO' WHERE pedido_id = ?").run(pedido.id);

        const mesa = liberarMesaDePedido(pedido, usuario_id, `Pedido #${pedido.id} anulado (devolución): ${motivo.trim()}`);
        return { mesa };
      })();

      const pedidoFinal = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      io.emit('pedido:actualizado', pedidoFinal);
      if (result.mesa) io.emit('mesa:updated', result.mesa);
      res.json({ ok: true, pedido: pedidoFinal, mesa: result.mesa, devolucion: true });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  // Eliminar pedido pagado = CANCELADO + EGRESO por el total cobrado
  router.post('/pedidos/:id/eliminar', (req, res) => {
    try {
      const { motivo, usuario_id } = req.body;
      if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'El motivo de la eliminación es requerido' });
      }
      const rolCheck = verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const result = db.transaction(() => {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido ya está cancelado' };

        const pagos = db.prepare('SELECT * FROM pagos WHERE pedido_id = ?').all(pedido.id);
        let totalDevuelto = 0;
        for (const pg of pagos) {
          if (!pagoPerteneceSesion(pg)) {
            throw { status: 409, error: 'Solo se pueden eliminar pedidos pagados en la caja abierta actual' };
          }
          if (pg.metodo === 'vale' && pg.referencia) {
            const valeRow = db.prepare('SELECT * FROM vales WHERE codigo = ?').get(pg.referencia);
            if (valeRow) {
              db.prepare('UPDATE vales SET monto_restante = monto_restante + ? WHERE id = ?').run(pg.monto, valeRow.id);
            }
          }
          if (pg.metodo !== 'regalo') totalDevuelto += pg.monto;
          registrarLogPago(pedido.id, pg.id, 'QUITAR', motivo.trim(), `Eliminación de pedido: devolución pago ${pg.metodo} S/${pg.monto.toFixed(2)}`, usuario_id);
        }
        if (totalDevuelto > 0) {
          db.prepare(`
            INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
            VALUES ('EGRESO', ?, ?, 'efectivo', ?, ?, ?)
          `).run(`Eliminación Pedido #${pedido.id}`, totalDevuelto, null, usuario_id || null, `Eliminación: ${motivo.trim()}`);
        }

        db.prepare("UPDATE pedidos SET estado = 'CANCELADO', motivo_cancelacion = ?, anulado_por = ?, updated_at = datetime('now') WHERE id = ?")
          .run(`Eliminación: ${motivo.trim()}`, usuario_id || null, pedido.id);
        db.prepare("UPDATE pedido_items SET estado = 'CANCELADO' WHERE pedido_id = ?").run(pedido.id);
        registrarLogPago(pedido.id, null, 'ELIMINAR', motivo.trim(), `Pedido eliminado, ${pagos.length} pago(s) devuelto(s)`, usuario_id);

        const mesa = liberarMesaDePedido(pedido, usuario_id, `Pedido #${pedido.id} eliminado: ${motivo.trim()}`);
        return { mesa };
      })();

      const pedidoFinal = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      io.emit('pedido:actualizado', pedidoFinal);
      if (result.mesa) io.emit('mesa:updated', result.mesa);
      res.json({ ok: true, pedido: pedidoFinal, mesa: result.mesa, devolucion: true });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  router.post('/caja/abrir', (req, res) => {
    try {
      const { usuario_id, fondo_inicial, notas } = req.body;
      if (!usuario_id) return res.status(400).json({ error: 'usuario_id requerido' });

      const rolCheck = verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const abierta = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ?').get('ABIERTA');
      if (abierta) return res.status(409).json({ error: 'Ya hay una sesión de caja abierta', sesion: abierta });

      // Absorción: los pagos no imputados a ninguna caja (desde la última caja cerrada)
      // quedan asignados a esta nueva sesión.
      const ultimaCerrada = db.prepare("SELECT MAX(closed_at) as t FROM caja_sesiones WHERE estado = 'CERRADA'").get().t;
      let absorbe_desde = ultimaCerrada || null;
      if (!absorbe_desde) {
        const pagoMin = db.prepare('SELECT MIN(created_at) as t FROM pagos').get().t;
        const movMin = db.prepare('SELECT MIN(created_at) as t FROM caja_movimientos').get().t;
        absorbe_desde = pagoMin || movMin || null;
      }

      const result = db.prepare('INSERT INTO caja_sesiones (usuario_id, fondo_inicial, notas_apertura, absorbe_desde) VALUES (?, ?, ?, ?)')
        .run(usuario_id, parseFloat(fondo_inicial) || 0, notas || null, absorbe_desde);

      res.status(201).json(db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(result.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/caja/cerrar', (req, res) => {
    try {
      const { efectivo_contado, notas, usuario_id } = req.body;
      if (!usuario_id) return res.status(400).json({ error: 'usuario_id requerido' });
      const rolCheck = verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ? ORDER BY id DESC LIMIT 1').get('ABIERTA');
      if (!sesion) return res.status(404).json({ error: 'No hay sesión de caja abierta' });

      const bloqueantes = getMesasBloqueantes();
      if (bloqueantes.length > 0) {
        return res.status(409).json({
          error: 'No se puede cerrar la caja: hay mesas sin liberar o con cobro pendiente',
          mesas: bloqueantes
        });
      }

      const now = db.prepare("SELECT datetime('now') as t").get().t;

      const inicio = inicioSesion(sesion);
      const { desglose, totalGeneral, totalPropina } = getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
      const { totales } = getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      const pedidos = db.prepare(`
        SELECT COUNT(*) as c FROM pedidos WHERE estado = 'CERRADO' AND created_at >= ? AND created_at <= ?
      `).get(inicio, now);

      const fondo = sesion.fondo_inicial || 0;
      const efectivo = parseFloat(efectivo_contado) || 0;
      const pagosEfectivo = desglose.efectivo?.total || 0;
      const ingresosEfectivo = totales.por_metodo.efectivo?.ingresos || 0;
      const egresosEfectivo = totales.por_metodo.efectivo?.egresos || 0;
      const efectivoEsperado = fondo + pagosEfectivo + ingresosEfectivo - egresosEfectivo;
      const sobranteFaltante = efectivo - efectivoEsperado;

      db.prepare(`
        UPDATE caja_sesiones SET
          efectivo_contado = ?, notas_cierre = ?, estado = 'CERRADA', closed_at = ?,
          total_ventas = ?, propinas = ?, efectivo_esperado = ?, sobrante_faltante = ?,
          total_pedidos = ?, desglose_json = ?, cerrada_por = ?
        WHERE id = ?
      `).run(efectivo, notas || null, now, totalGeneral, totalPropina, efectivoEsperado, sobranteFaltante, pedidos.c, JSON.stringify(desglose), usuario_id || null, sesion.id);

      const propinaPorMetodo = {};
      for (const [k, v] of Object.entries(desglose)) {
        if (v.total_propina > 0) propinaPorMetodo[k] = v.total_propina;
      }

      res.json({
        ok: true,
        sesion_id: sesion.id,
        fondo_inicial: fondo,
        total_ventas: totalGeneral,
        total_pedidos: pedidos.c,
        propinas: totalPropina,
        propina_por_metodo: propinaPorMetodo,
        desglose,
        pagos_efectivo: pagosEfectivo,
        ingresos_efectivo: ingresosEfectivo,
        egresos_efectivo: egresosEfectivo,
        efectivo_esperado: efectivoEsperado,
        efectivo_contado: efectivo,
        sobrante_faltante: sobranteFaltante
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/bloqueantes', (req, res) => {
    try {
      res.json({ mesas: getMesasBloqueantes() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/sesion-actual', (req, res) => {
    try {
      const sesion = db.prepare('SELECT cs.*, u.nombre as usuario_nombre FROM caja_sesiones cs LEFT JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado = ? ORDER BY cs.id DESC LIMIT 1').get('ABIERTA');
      if (!sesion) return res.json(null);

      const now = db.prepare("SELECT datetime('now') as t").get().t;
      const inicio = inicioSesion(sesion);
      const { desglose, totalGeneral, totalPropina } = getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [inicio, now]);
      const { movs, totales } = getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      const pedidos = db.prepare(`
        SELECT COUNT(*) as c FROM pedidos WHERE estado = 'CERRADO' AND created_at >= ? AND created_at <= ?
      `).get(inicio, now);

      const pagosEfectivo = desglose.efectivo?.total || 0;
      const efectivoEsperado = (sesion.fondo_inicial || 0) + pagosEfectivo
        + (totales.por_metodo.efectivo?.ingresos || 0) - (totales.por_metodo.efectivo?.egresos || 0);

      res.json({
        ...sesion,
        total_ventas: totalGeneral,
        propinas: totalPropina,
        total_pedidos: pedidos.c,
        desglose,
        movimientos_totales: totales,
        movimientos: movs,
        pagos_efectivo: pagosEfectivo,
        efectivo_esperado: efectivoEsperado
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── MOVIMIENTOS DE CAJA ───
  router.get('/caja/movimientos', (req, res) => {
    try {
      const sesion = db.prepare("SELECT estado FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
      if (!sesion) return res.json([]);
      const now = db.prepare("SELECT datetime('now') as t").get().t;
      const inicio = db.prepare(`
        SELECT COALESCE(absorbe_desde, opened_at) as t FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1
      `).get().t;
      const movs = db.prepare(`
        SELECT cm.*, u.nombre as usuario_nombre
        FROM caja_movimientos cm
        LEFT JOIN usuarios u ON u.id = cm.usuario_id
        WHERE cm.created_at >= ? AND cm.created_at <= ?
        ORDER BY cm.created_at DESC
      `).all(inicio, now);
      res.json(movs);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/caja/movimientos', (req, res) => {
    try {
      const { tipo, concepto, monto, metodo_pago, persona, usuario_id, notas } = req.body;
      if (!['INGRESO', 'EGRESO'].includes(tipo)) return res.status(400).json({ error: 'tipo debe ser INGRESO o EGRESO' });
      if (!concepto || !concepto.trim()) return res.status(400).json({ error: 'concepto requerido' });
      const montoF = parseFloat(monto);
      if (!montoF || montoF <= 0) return res.status(400).json({ error: 'monto inválido' });
      const metodosCaja = ['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia', ...pagos.getMetodos()];
      if (!metodo_pago || !metodosCaja.includes(metodo_pago)) {
        return res.status(400).json({ error: 'metodo_pago inválido' });
      }
      const r = db.prepare(`
        INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(tipo, concepto.trim(), montoF, metodo_pago, persona || null, usuario_id || null, notas || null);
      res.status(201).json(db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/caja/movimientos/:id', (req, res) => {
    try {
      const r = db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(req.params.id);
      if (r.changes === 0) return res.status(404).json({ error: 'Movimiento no encontrado' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/movimientos/imprimir', (req, res) => {
    try {
      const sesion = db.prepare("SELECT id FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
      if (!sesion) return res.json({ ok: true });
      const now = db.prepare("SELECT datetime('now') as t").get().t;
      const inicio = db.prepare(`
        SELECT COALESCE(absorbe_desde, opened_at) as t FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1
      `).get().t;
      const { movs, totales } = getMovimientosTotales('created_at >= ? AND created_at <= ?', [inicio, now]);
      printers.printResumenMovimientos(now, movs, totales);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── SESIONES DE CAJA CERRADAS (historial para reportes) ───
  router.get('/caja/sesiones', (req, res) => {
    try {
      const sesiones = db.prepare(`
        SELECT cs.*, u.nombre as usuario_nombre, cu.nombre as cerrado_por_nombre
        FROM caja_sesiones cs
        LEFT JOIN usuarios u ON u.id = cs.usuario_id
        LEFT JOIN usuarios cu ON cu.id = cs.cerrada_por
        WHERE cs.estado = 'CERRADA'
        ORDER BY cs.closed_at DESC
      `).all();
      for (const s of sesiones) {
        try { s.desglose = s.desglose_json ? JSON.parse(s.desglose_json) : null; } catch { s.desglose = null; }
      }
      res.json(sesiones);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/caja/sesiones/:id', (req, res) => {
    try {
      const sesion = db.prepare(`
        SELECT cs.*, u.nombre as usuario_nombre, cu.nombre as cerrado_por_nombre
        FROM caja_sesiones cs
        LEFT JOIN usuarios u ON u.id = cs.usuario_id
        LEFT JOIN usuarios cu ON cu.id = cs.cerrada_por
        WHERE cs.id = ?
      `).get(req.params.id);
      if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });

      const inicio = inicioSesion(sesion);
      const fin = sesion.closed_at || db.prepare("SELECT datetime('now') as t").get().t;

      const pagos = db.prepare(`
        SELECT pg.id, pg.metodo, pg.monto, pg.propina, pg.referencia, pg.notas, pg.created_at,
               p.id as pedido_id, u.nombre as cajero_nombre
        FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
        LEFT JOIN usuarios u ON u.id = pg.usuario_id
        WHERE pg.created_at >= ? AND pg.created_at <= ?
        ORDER BY pg.created_at ASC
      `).all(inicio, fin);

      const movimientos = db.prepare(`
        SELECT cm.*, u.nombre as usuario_nombre FROM caja_movimientos cm
        LEFT JOIN usuarios u ON u.id = cm.usuario_id
        WHERE cm.created_at >= ? AND cm.created_at <= ?
        ORDER BY cm.created_at ASC
      `).all(inicio, fin);

      let desglose = null;
      if (sesion.desglose_json) {
        try { desglose = JSON.parse(sesion.desglose_json); } catch { desglose = null; }
      }
      if (!desglose) {
        const d = db.prepare(`
          SELECT pg.metodo, COUNT(*) as cantidad, COALESCE(SUM(pg.monto), 0) as total, COALESCE(SUM(pg.propina), 0) as total_propina
          FROM pagos pg WHERE pg.created_at >= ? AND pg.created_at <= ? GROUP BY pg.metodo
        `).all(inicio, fin);
        desglose = desgloseVacio();
        for (const f of d) { if (!desglose[f.metodo]) desglose[f.metodo] = { cantidad: 0, total: 0, total_propina: 0 }; desglose[f.metodo] = { cantidad: f.cantidad, total: f.total, total_propina: f.total_propina }; }
      }

      res.json({ sesion, pagos, movimientos, desglose });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = createAdminRouter;