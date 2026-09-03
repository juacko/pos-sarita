const fs = require('fs');
const path = require('path');

const adminJsPath = path.join(__dirname, 'server/routes/admin.js');
let adminJs = fs.readFileSync(adminJsPath, 'utf8');

// I will extract logic directly from admin.js into AdminCajaRepository, AdminPedidoRepository, AdminCajaController, AdminPedidoController, AdminReporteController, etc.
// But writing a perfect parser is hard. Instead I will output complete files directly.

const adminReporteRepo = `
const defaultDb = require('../db');

class AdminReporteRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }
  
  getHoraCorte() {
    const fila = this.db.prepare("SELECT valor FROM configuracion WHERE clave = 'hora_corte'").get();
    if (!fila) return '23:00';
    try {
      const v = JSON.parse(fila.valor);
      if (/^\\d{2}:\\d{2}$/.test(v)) return v;
    } catch (e) {}
    return '23:00';
  }

  getRangoOperativo(fecha) {
    const corte = this.getHoraCorte();
    const [hh, mm] = corte.split(':').map(Number);
    const inicio = this.db.prepare(
      "SELECT datetime(?, '-1 day', ?, ?) as t"
    ).get(fecha, \`+\${hh} hours\`, \`+\${mm} minutes\`).t;
    const fin = this.db.prepare(
      "SELECT datetime(?, ?, ?) as t"
    ).get(fecha, \`+\${hh} hours\`, \`+\${mm} minutes\`).t;
    return { inicio, fin, corte };
  }

  obtenerSesionActivaOId(sesion_id) {
    return sesion_id
      ? this.db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(sesion_id)
      : this.db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
  }

  getNow() {
    return this.db.prepare("SELECT datetime('now') as t").get().t;
  }

  obtenerReportePedidos(inicio, fin) {
    const pedidos = this.db.prepare(\`
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
    \`).all(inicio, fin, inicio, fin);
    
    const cancelados = this.db.prepare(\`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CANCELADO' AND created_at >= ? AND created_at < ?
    \`).get(inicio, fin);
    
    return { pedidos, cancelados };
  }

  obtenerDetalleReportePedidos(inicio, fin) {
    return this.db.prepare(\`
      SELECT pi.producto_nombre, SUM(pi.cantidad) as total_vendido,
             SUM(pi.cantidad * (pi.precio_unitario + pi.precio_adicional)) as total_ingresos
      FROM pedido_items pi
      JOIN pedidos p ON p.id = pi.pedido_id
      WHERE p.estado = 'CERRADO' AND pi.estado != 'CANCELADO'
        AND EXISTS (
          SELECT 1 FROM pagos pg WHERE pg.pedido_id = p.id AND pg.created_at >= ? AND pg.created_at < ?
        )
      GROUP BY pi.producto_nombre ORDER BY total_vendido DESC
    \`).all(inicio, fin);
  }
}
module.exports = new AdminReporteRepository();
`;

const adminCajaRepo = \`
const defaultDb = require('../db');
const pagos = require('../metodos-pago');

class AdminCajaRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  getNow() { return this.db.prepare("SELECT datetime('now') as t").get().t; }

  sesionCajaAbierta() {
    return this.db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
  }

  sesionCajaCerradaUltima() {
    return this.db.prepare("SELECT MAX(closed_at) as t FROM caja_sesiones WHERE estado = 'CERRADA'").get().t;
  }

  sesionCajaMinimos() {
    const pagoMin = this.db.prepare('SELECT MIN(created_at) as t FROM pagos').get().t;
    const movMin = this.db.prepare('SELECT MIN(created_at) as t FROM caja_movimientos').get().t;
    return { pagoMin, movMin };
  }

  abrirSesionCaja(usuario_id, fondo_inicial, notas, absorbe_desde) {
    const result = this.db.prepare('INSERT INTO caja_sesiones (usuario_id, fondo_inicial, notas_apertura, absorbe_desde) VALUES (?, ?, ?, ?)')
      .run(usuario_id, parseFloat(fondo_inicial) || 0, notas || null, absorbe_desde);
    return this.db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(result.lastInsertRowid);
  }

  cerrarSesionCaja(sesion_id, efectivo, notas, now, totalGeneral, totalPropina, efectivoEsperado, sobranteFaltante, pedidosC, desglose, usuario_id) {
    this.db.prepare(\\\`
      UPDATE caja_sesiones SET
        efectivo_contado = ?, notas_cierre = ?, estado = 'CERRADA', closed_at = ?,
        total_ventas = ?, propinas = ?, efectivo_esperado = ?, sobrante_faltante = ?,
        total_pedidos = ?, desglose_json = ?, cerrada_por = ?
      WHERE id = ?
    \\\`).run(efectivo, notas || null, now, totalGeneral, totalPropina, efectivoEsperado, sobranteFaltante, pedidosC, JSON.stringify(desglose), usuario_id || null, sesion_id);
  }

  obtenerSesionConUsuarios(estado = 'ABIERTA') {
    return this.db.prepare('SELECT cs.*, u.nombre as usuario_nombre FROM caja_sesiones cs LEFT JOIN usuarios u ON u.id = cs.usuario_id WHERE cs.estado = ? ORDER BY cs.id DESC LIMIT 1').get(estado);
  }

  obtenerSesionPorId(id) {
    return this.db.prepare(\\\`
      SELECT cs.*, u.nombre as usuario_nombre, cu.nombre as cerrado_por_nombre
      FROM caja_sesiones cs
      LEFT JOIN usuarios u ON u.id = cs.usuario_id
      LEFT JOIN usuarios cu ON cu.id = cs.cerrada_por
      WHERE cs.id = ?
    \\\`).get(id);
  }

  obtenerSesionCerradaReciente() {
    return this.db.prepare(\\\`
      SELECT cs.*, u.nombre as usuario_nombre, cu.nombre as cerrado_por_nombre
      FROM caja_sesiones cs
      LEFT JOIN usuarios u ON u.id = cs.usuario_id
      LEFT JOIN usuarios cu ON cu.id = cs.cerrada_por
      WHERE cs.estado = 'CERRADA'
      ORDER BY cs.id DESC LIMIT 1
    \\\`).get();
  }

  obtenerTodasSesionesCerradas() {
    return this.db.prepare(\\\`
      SELECT cs.*, u.nombre as usuario_nombre, cu.nombre as cerrado_por_nombre
      FROM caja_sesiones cs
      LEFT JOIN usuarios u ON u.id = cs.usuario_id
      LEFT JOIN usuarios cu ON cu.id = cs.cerrada_por
      WHERE cs.estado = 'CERRADA'
      ORDER BY cs.closed_at DESC
    \\\`).all();
  }

  obtenerPagosSesionRango(inicio, fin) {
    return this.db.prepare(\\\`
      SELECT pg.id, pg.metodo, pg.monto, pg.propina, pg.referencia, pg.notas, pg.created_at,
             p.id as pedido_id, p.total as pedido_total, u.nombre as cajero_nombre
      FROM pagos pg
      JOIN pedidos p ON p.id = pg.pedido_id
      LEFT JOIN usuarios u ON u.id = pg.usuario_id
      WHERE pg.created_at >= ? AND pg.created_at <= ?
      ORDER BY pg.created_at ASC
    \\\`).all(inicio, fin);
  }

  obtenerMovimientosSesionRango(inicio, fin) {
    return this.db.prepare(\\\`
      SELECT cm.*, u.nombre as usuario_nombre FROM caja_movimientos cm
      LEFT JOIN usuarios u ON u.id = cm.usuario_id
      WHERE cm.created_at >= ? AND cm.created_at <= ?
      ORDER BY cm.created_at ASC
    \\\`).all(inicio, fin);
  }

  obtenerSumaPagosMetodo(metodo, inicio, fin) {
    return this.db.prepare(\\\`
      SELECT COALESCE(SUM(pg.monto), 0) as t FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = ? AND pg.created_at >= ? AND pg.created_at <= ?
    \\\`).get(metodo, inicio, fin);
  }

  obtenerSumaMovimientos(tipo, metodo, inicio, fin) {
    return this.db.prepare(\\\`
      SELECT COALESCE(SUM(monto), 0) as t FROM caja_movimientos
      WHERE tipo = ? AND metodo_pago = ? AND created_at >= ? AND created_at <= ?
    \\\`).get(tipo, metodo, inicio, fin);
  }

  getDesglosePagos(where, params) {
    const filas = this.db.prepare(\\\`
      SELECT pg.metodo, COUNT(*) as cantidad, COALESCE(SUM(pg.monto), 0) as total, COALESCE(SUM(pg.propina), 0) as total_propina
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE \\\${where}
      GROUP BY pg.metodo
    \\\`).all(...params);
    
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
    const desglose = base;
    
    let totalGeneral = 0, totalPropina = 0;
    for (const f of filas) {
      if (!desglose[f.metodo]) desglose[f.metodo] = { cantidad: 0, total: 0, total_propina: 0 };
      desglose[f.metodo] = { cantidad: f.cantidad, total: f.total, total_propina: f.total_propina };
      totalGeneral += f.total;
      totalPropina += f.total_propina;
    }
    return { desglose, totalGeneral, totalPropina };
  }

  getMovimientosTotales(where, params) {
    const movs = this.db.prepare(\\\`SELECT * FROM caja_movimientos WHERE \\\${where} ORDER BY created_at ASC\\\`).all(...params);
    let ingresos = 0, egresos = 0;
    const porMetodo = {};
    for (const mv of movs) {
      if (mv.tipo === 'INGRESO') ingresos += mv.monto; else egresos += mv.monto;
      if (!porMetodo[mv.metodo_pago]) porMetodo[mv.metodo_pago] = { ingresos: 0, egresos: 0 };
      porMetodo[mv.metodo_pago][mv.tipo === 'INGRESO' ? 'ingresos' : 'egresos'] += mv.monto;
    }
    return { movs, totales: { ingresos, egresos, por_metodo: porMetodo } };
  }

  getMetricasDia(fecha) {
    const pedidosCerrados = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CERRADO' AND date(created_at) = ?
    \\\`).get(fecha);
    const cancelados = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CANCELADO' AND date(created_at) = ?
    \\\`).get(fecha);
    const descuentosDelDia = this.db.prepare(\\\`
      SELECT COUNT(*) as total,
             COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN (p.total * d.valor / 100) ELSE d.valor END), 0) as monto_estimado
      FROM descuentos d JOIN pedidos p ON p.id = d.pedido_id
      WHERE date(d.created_at) = ?
    \\\`).get(fecha);
    const valesUsados = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'vale' AND date(pg.created_at) = ?
    \\\`).get(fecha);
    const regalos = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'regalo' AND date(pg.created_at) = ?
    \\\`).get(fecha);
    const topProductos = this.db.prepare(\\\`
      SELECT pi.producto_nombre as nombre, SUM(pi.cantidad) as cantidad,
             SUM(pi.cantidad * (pi.precio_unitario + pi.precio_adicional)) as total
      FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id
      WHERE p.estado = 'CERRADO' AND date(p.created_at) = ? AND pi.estado != 'CANCELADO'
      GROUP BY pi.producto_nombre ORDER BY cantidad DESC, total DESC LIMIT 5
    \\\`).all(fecha);
    const ventasPorHora = this.db.prepare(\\\`
      SELECT strftime('%H', pg.created_at) as hora, COUNT(*) as cantidad, COALESCE(SUM(pg.monto), 0) as total
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE date(pg.created_at) = ?
      GROUP BY hora ORDER BY hora
    \\\`).all(fecha);
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

  getMetricasSesion(inicio, fin) {
    const pedidosCerrados = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CERRADO' AND created_at >= ? AND created_at <= ?
    \\\`).get(inicio, fin);
    const cancelados = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CANCELADO' AND created_at >= ? AND created_at <= ?
    \\\`).get(inicio, fin);
    const descuentosSesion = this.db.prepare(\\\`
      SELECT COUNT(*) as total,
             COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN (p.total * d.valor / 100) ELSE d.valor END), 0) as monto_estimado
      FROM descuentos d JOIN pedidos p ON p.id = d.pedido_id
      WHERE d.created_at >= ? AND d.created_at <= ?
    \\\`).get(inicio, fin);
    const valesUsados = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'vale' AND pg.created_at >= ? AND pg.created_at <= ?
    \\\`).get(inicio, fin);
    const regalos = this.db.prepare(\\\`
      SELECT COUNT(*) as total, COALESCE(SUM(pg.monto), 0) as suma
      FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.metodo = 'regalo' AND pg.created_at >= ? AND pg.created_at <= ?
    \\\`).get(inicio, fin);
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

  getMesasBloqueantes() {
    const mesas = this.db.prepare(\\\`
      SELECT m.id, m.numero, m.nombre, m.estado, m.pedido_activo_id, m.mesero_id, u.nombre as mesero_nombre
      FROM mesas m
      LEFT JOIN usuarios u ON u.id = m.mesero_id
      WHERE m.estado IN ('OCUPADO', 'CERRANDO', 'RESERVADO')
      ORDER BY m.numero
    \\\`).all();

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
      const row = this.db.prepare(\\\`
        SELECT p.total,
          (SELECT COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN 0 ELSE valor END), 0) FROM descuentos WHERE pedido_id = p.id) as fijo,
          (SELECT COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN valor ELSE 0 END), 0) FROM descuentos WHERE pedido_id = p.id) as pct,
          (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE pedido_id = p.id) as pagado
        FROM pedidos p WHERE p.id = ?
      \\\`).get(m.pedido_activo_id);
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

  ejecutarTransaccion(fn) {
    return this.db.transaction(fn)();
  }

  registrarMovimiento(tipo, concepto, monto, metodo_pago, persona, usuario_id, notas) {
    const r = this.db.prepare(\\\`
      INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    \\\`).run(tipo, concepto, monto, metodo_pago, persona || null, usuario_id || null, notas || null);
    return this.db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(r.lastInsertRowid);
  }

  eliminarMovimiento(id) {
    const r = this.db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(id);
    return r.changes > 0;
  }
}
module.exports = new AdminCajaRepository();
\`;

const adminPedidoRepo = \`
const defaultDb = require('../db');

class AdminPedidoRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  verificarRolAdminCajero(uid) {
    const usuario = this.db.prepare('SELECT id, rol FROM usuarios WHERE id = ?').get(uid);
    if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'cajero')) {
      return { error: 'Solo el administrador o el cajero pueden realizar esta acción' };
    }
    return { ok: true, rol: usuario.rol, id: usuario.id };
  }

  obtenerPedidosAnulables() {
    return this.db.prepare(\\\`
      SELECT p.id, p.mesa_id, p.estado, p.total, p.created_at, p.cliente_nombre,
             m.nombre as mesa_nombre, m.numero as mesa_numero, m.es_virtual,
             (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.estado != 'CANCELADO') as items,
             (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) as pagado
      FROM pedidos p
      LEFT JOIN mesas m ON m.id = p.mesa_id
      WHERE p.estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')
      ORDER BY p.id DESC
    \\\`).all();
  }

  obtenerPedidosPagados(limite) {
    return this.db.prepare(\\\`
      SELECT p.id, p.mesa_id, p.estado, p.total, p.created_at, p.cliente_nombre, p.motivo_cancelacion,
             m.nombre as mesa_nombre, m.numero as mesa_numero, m.es_virtual,
             (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) as pagado,
             (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.estado != 'CANCELADO') as items
      FROM pedidos p
      LEFT JOIN mesas m ON m.id = p.mesa_id
      WHERE p.estado IN ('CERRADO','CANCELADO')
      ORDER BY p.id DESC
      LIMIT ?
    \\\`).all(limite);
  }

  ejecutarTransaccion(fn) {
    return this.db.transaction(fn)();
  }

  obtenerPedidoPorId(id) {
    return this.db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  }

  obtenerItemsActivos(pedidoId) {
    return this.db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(pedidoId);
  }

  anularPedidoCompleto(pedidoId, motivo, usuario_id) {
    this.db.prepare("UPDATE pedidos SET estado = 'CANCELADO', motivo_cancelacion = ?, anulado_por = ?, updated_at = datetime('now') WHERE id = ?")
      .run(motivo.trim(), usuario_id || null, pedidoId);
    this.db.prepare("UPDATE pedido_items SET estado = 'CANCELADO' WHERE pedido_id = ?").run(pedidoId);
  }

  liberarMesa(mesaId, usuario_id, detalle) {
    this.db.prepare(\\\`
      UPDATE mesas SET
        estado = 'LIBRE', mesero_id = NULL, mesero_nombre = NULL,
        pedido_activo_id = NULL, ocupado_desde = NULL, version = version + 1, updated_at = datetime('now')
      WHERE id = ?
    \\\`).run(mesaId);
    this.db.prepare("INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle) VALUES (?, 'PEDIDO_ANULADO', ?, ?)")
      .run(mesaId, usuario_id || null, detalle);
    return this.db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
  }

  obtenerMesa(mesaId) {
    return this.db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
  }

  obtenerDescuentosTotal(pedidoId) {
    return this.db.prepare('SELECT COALESCE(SUM(CASE WHEN tipo = \\'porcentaje\\' THEN 0 ELSE valor END), 0) as fijo, SUM(CASE WHEN tipo = \\'porcentaje\\' THEN valor ELSE 0 END) as pct FROM descuentos WHERE pedido_id = ?').get(pedidoId);
  }

  obtenerPagado(pedidoId) {
    return this.db.prepare('SELECT COALESCE(SUM(monto), 0) as t FROM pagos WHERE pedido_id = ?').get(pedidoId).t;
  }

  obtenerVale(codigo) {
    return this.db.prepare('SELECT * FROM vales WHERE codigo = ? AND activo = 1').get(codigo);
  }

  actualizarValeRestante(montoRestar, valeId) {
    this.db.prepare('UPDATE vales SET monto_restante = monto_restante - ? WHERE id = ?').run(montoRestar, valeId);
  }

  registrarPago(pedidoId, monto, metodo, propinaMonto, referencia, notas, usuario_id) {
    const r = this.db.prepare('INSERT INTO pagos (pedido_id, monto, metodo, propina, referencia, notas, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(pedidoId, monto, metodo, propinaMonto, referencia || null, notas || null, usuario_id || null);
    return r.lastInsertRowid;
  }

  cerrarPedido(pedidoId) {
    this.db.prepare("UPDATE pedidos SET estado = 'CERRADO', updated_at = datetime('now') WHERE id = ?").run(pedidoId);
  }

  registrarLogPago(pedido_id, pago_id, accion, motivo, detalle, usuario_id) {
    this.db.prepare(\\\`
      INSERT INTO pagos_log (pedido_id, pago_id, accion, motivo, detalle, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?)
    \\\`).run(pedido_id, pago_id || null, accion, motivo || null, detalle || null, usuario_id || null);
  }

  obtenerPago(pagoId, pedidoId) {
    return this.db.prepare('SELECT * FROM pagos WHERE id = ? AND pedido_id = ?').get(pagoId, pedidoId);
  }
  
  obtenerPagoPorId(pagoId) {
    return this.db.prepare('SELECT * FROM pagos WHERE id = ?').get(pagoId);
  }

  actualizarPago(nuevoMetodo, nuevaRef, nuevasNotas, nuevaPropina, pagoId) {
    this.db.prepare(\\\`
      UPDATE pagos SET metodo = ?, referencia = ?, notas = ?, propina = ?
      WHERE id = ?
    \\\`).run(nuevoMetodo, nuevaRef, nuevasNotas, nuevaPropina, pagoId);
  }

  obtenerTodosPagos(pedidoId) {
    return this.db.prepare('SELECT * FROM pagos WHERE pedido_id = ?').all(pedidoId);
  }
  
  obtenerValePorCodigo(codigo) {
    return this.db.prepare('SELECT * FROM vales WHERE codigo = ?').get(codigo);
  }
  
  devolverVale(monto, valeId) {
    this.db.prepare('UPDATE vales SET monto_restante = monto_restante + ? WHERE id = ?').run(monto, valeId);
  }

  registrarEgresoDevolucion(pedidoId, metodoPago, monto, motivo, usuario_id) {
    const metodo = ['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia'].includes(metodoPago) ? metodoPago : 'otros';
    this.db.prepare(\\\`
      INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
      VALUES ('EGRESO', ?, ?, ?, ?, ?, ?)
    \\\`).run(
      \\\`Devolución Pedido #\${pedidoId}\\\`,
      monto,
      metodo,
      null,
      usuario_id || null,
      motivo ? \\\`Devolución: \${motivo}\\\` : null
    );
  }

  registrarEgresoGenerico(pedidoId, totalDevuelto, usuario_id, motivo) {
    this.db.prepare(\\\`
      INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
      VALUES ('EGRESO', ?, ?, 'efectivo', ?, ?, ?)
    \\\`).run(\\\`Eliminación Pedido #\${pedidoId}\\\`, totalDevuelto, null, usuario_id || null, \\\`Eliminación: \${motivo}\\\`);
  }
}

module.exports = new AdminPedidoRepository();
\`;

fs.writeFileSync(path.join(__dirname, 'server/repositories/AdminReporteRepository.js'), adminReporteRepo);
fs.writeFileSync(path.join(__dirname, 'server/repositories/AdminCajaRepository.js'), adminCajaRepo);
fs.writeFileSync(path.join(__dirname, 'server/repositories/AdminPedidoRepository.js'), adminPedidoRepo);
