const { Router } = require('express');
const db = require('../db');
const printers = require('../printers');

function createAdminRouter() {
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

  // ─── HELPERS CAJA ───
  function desgloseVacio() {
    return {
      efectivo: { cantidad: 0, total: 0, total_propina: 0 },
      tarjeta: { cantidad: 0, total: 0, total_propina: 0 },
      transferencia: { cantidad: 0, total: 0, total_propina: 0 },
      yape: { cantidad: 0, total: 0, total_propina: 0 },
      plin: { cantidad: 0, total: 0, total_propina: 0 },
      otros: { cantidad: 0, total: 0, total_propina: 0 },
      regalo: { cantidad: 0, total: 0, total_propina: 0 },
      vale: { cantidad: 0, total: 0, total_propina: 0 }
    };
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
      if (desglose[f.metodo]) {
        desglose[f.metodo] = { cantidad: f.cantidad, total: f.total, total_propina: f.total_propina };
      }
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

  router.get('/corte-caja', (req, res) => {
    try {
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];

      const { desglose, totalGeneral, totalPropina } = getDesglosePagos('date(pg.created_at) = ?', [hoy]);
      const { movs, totales } = getMovimientosTotales('date(created_at) = ?', [hoy]);
      const metricas = getMetricasDia(hoy);
      const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ? ORDER BY id DESC LIMIT 1').get('ABIERTA');

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

      const { movs, totales } = getMovimientosTotales('date(created_at) = ?', [hoy]);
      const { desglose, totalGeneral, totalPropina } = getDesglosePagos('date(pg.created_at) = ?', [hoy]);
      const metricas = getMetricasDia(hoy);

      const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ? ORDER BY id DESC LIMIT 1').get('ABIERTA');

      const historialCerradas = db.prepare(`
        SELECT cs.*, u.nombre as usuario_nombre
        FROM caja_sesiones cs
        LEFT JOIN usuarios u ON u.id = cs.usuario_id
        WHERE date(cs.opened_at) = ? AND cs.estado = 'CERRADA'
        ORDER BY cs.closed_at DESC
      `).all(hoy);

      let efectivoEsperado = null;
      let pagosSesionEfectivo = 0;
      if (sesion) {
        const pe = db.prepare(`
          SELECT COALESCE(SUM(pg.monto), 0) as t FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
          WHERE pg.metodo = 'efectivo' AND pg.created_at >= ? AND pg.created_at <= datetime('now')
        `).get(sesion.opened_at);
        const mi = db.prepare(`
          SELECT COALESCE(SUM(monto), 0) as t FROM caja_movimientos
          WHERE tipo = 'INGRESO' AND metodo_pago = 'efectivo' AND created_at >= ? AND created_at <= datetime('now')
        `).get(sesion.opened_at);
        const me = db.prepare(`
          SELECT COALESCE(SUM(monto), 0) as t FROM caja_movimientos
          WHERE tipo = 'EGRESO' AND metodo_pago = 'efectivo' AND created_at >= ? AND created_at <= datetime('now')
        `).get(sesion.opened_at);
        pagosSesionEfectivo = pe.t || 0;
        efectivoEsperado = (sesion.fondo_inicial || 0) + pagosSesionEfectivo + (mi.t || 0) - (me.t || 0);
      }

      const propinaPorMetodo = {};
      for (const [k, v] of Object.entries(desglose)) {
        if (v.total_propina > 0) propinaPorMetodo[k] = v.total_propina;
      }

      const eventos = [];
      if (sesion) {
        eventos.push({ tipo: 'APERTURA', hora: sesion.opened_at, monto: sesion.fondo_inicial, persona: sesion.usuario_nombre || 'Sistema', concepto: `Fondo inicial: $${(sesion.fondo_inicial || 0).toFixed(2)}`, metodo: 'efectivo' });
      }
      for (const pg of pagos) {
        eventos.push({ tipo: 'PAGO', hora: pg.created_at, monto: pg.monto, persona: pg.cajero_nombre || 'Sistema', concepto: `Pedido #${pg.pedido_id} (Total: $${(pg.pedido_total || 0).toFixed(2)})`, metodo: pg.metodo, propina: pg.propina || 0, referencia: pg.referencia, notas: pg.notas });
      }
      for (const mv of movs) {
        eventos.push({ tipo: mv.tipo, hora: mv.created_at, monto: mv.monto, persona: mv.persona || 'Sistema', concepto: mv.concepto, metodo: mv.metodo_pago, notas: mv.notas });
      }
      for (const cs of historialCerradas) {
        eventos.push({ tipo: 'CIERRE', hora: cs.closed_at, monto: 0, persona: cs.usuario_nombre || 'Sistema', concepto: `Cierre de caja — Esperado: $${(cs.efectivo_esperado || 0).toFixed(2)} | Contado: $${(cs.efectivo_contado || 0).toFixed(2)}`, metodo: 'efectivo', sobrante: cs.sobrante_faltante });
      }

      eventos.sort((a, b) => new Date(a.hora) - new Date(b.hora));

      let saldo = sesion ? (sesion.fondo_inicial || 0) : 0;
      for (const ev of eventos) {
        if (ev.tipo === 'EGRESO') saldo -= ev.monto;
        else if (ev.tipo === 'PAGO' || ev.tipo === 'INGRESO' || ev.tipo === 'APERTURA') saldo += ev.monto;
        ev.saldo = saldo;
      }

      res.json({
        fecha: hoy,
        eventos,
        sesion: sesion || null,
        historial_cerradas: historialCerradas,
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
      const { efectivo_contado, notas, usuario_id } = req.body;
      const sesion = db.prepare('SELECT * FROM caja_sesiones WHERE estado = ?').get('ABIERTA');
      if (!sesion) return res.status(404).json({ error: 'No hay sesión de caja abierta' });

      const now = db.prepare("SELECT datetime('now') as t").get().t;

      const { desglose, totalGeneral, totalPropina } = getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [sesion.opened_at, now]);
      const { totales } = getMovimientosTotales('created_at >= ? AND created_at <= ?', [sesion.opened_at, now]);
      const pedidos = db.prepare(`
        SELECT COUNT(*) as c FROM pedidos WHERE estado = 'CERRADO' AND created_at >= ? AND created_at <= ?
      `).get(sesion.opened_at, now);

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

  router.get('/caja/sesion-actual', (req, res) => {
    try {
      const sesion = db.prepare('SELECT cs.*, u.nombre as usuario_nombre FROM caja_sesiones cs LEFT JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado = ? ORDER BY cs.id DESC LIMIT 1').get('ABIERTA');
      if (!sesion) return res.json(null);

      const now = db.prepare("SELECT datetime('now') as t").get().t;
      const { desglose, totalGeneral, totalPropina } = getDesglosePagos('pg.created_at >= ? AND pg.created_at <= ?', [sesion.opened_at, now]);
      const { movs, totales } = getMovimientosTotales('created_at >= ? AND created_at <= ?', [sesion.opened_at, now]);
      const pedidos = db.prepare(`
        SELECT COUNT(*) as c FROM pedidos WHERE estado = 'CERRADO' AND created_at >= ? AND created_at <= ?
      `).get(sesion.opened_at, now);

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
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];
      const movs = db.prepare(`
        SELECT cm.*, u.nombre as usuario_nombre
        FROM caja_movimientos cm
        LEFT JOIN usuarios u ON u.id = cm.usuario_id
        WHERE date(cm.created_at) = ?
        ORDER BY cm.created_at DESC
      `).all(hoy);
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
      if (!['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia'].includes(metodo_pago)) {
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
      const { fecha } = req.query;
      const hoy = fecha || new Date().toISOString().split('T')[0];
      const { movs, totales } = getMovimientosTotales('date(created_at) = ?', [hoy]);
      printers.printResumenMovimientos(hoy, movs, totales);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = createAdminRouter;