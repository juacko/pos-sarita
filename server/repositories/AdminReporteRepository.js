const defaultDb = require('../db');

class AdminReporteRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }
  
  getHoraCorte() {
    const fila = this.db.prepare("SELECT valor FROM configuracion WHERE clave = 'hora_corte'").get();
    if (!fila || !fila.valor) return '23:59';
    let val = fila.valor;
    try {
      val = JSON.parse(fila.valor);
    } catch (e) {}
    if (typeof val === 'string' && /^\d{2}:\d{2}$/.test(val)) return val;
    return '23:59';
  }

  getRangoOperativo(fecha) {
    const corte = this.getHoraCorte();
    if (corte === '23:59' || corte === '00:00') {
      const inicio = `${fecha} 00:00:00`;
      const fin = `${fecha} 23:59:59`;
      return { inicio, fin, corte };
    }
    const [hh, mm] = corte.split(':').map(Number);
    const inicio = this.db.prepare(
      "SELECT datetime(?, '-1 day', ?, ?) as t"
    ).get(fecha, `+${hh} hours`, `+${mm} minutes`).t;
    const fin = this.db.prepare(
      "SELECT datetime(?, ?, ?) as t"
    ).get(fecha, `+${hh} hours`, `+${mm} minutes`).t;
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
    const pedidos = this.db.prepare(`
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
    
    const cancelados = this.db.prepare(`
      SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as suma
      FROM pedidos WHERE estado = 'CANCELADO' AND created_at >= ? AND created_at < ?
    `).get(inicio, fin);

    const ventasPorHora = this.db.prepare(`
      SELECT strftime('%H', pg.created_at, 'localtime') as hora,
             COUNT(DISTINCT p.id) as pedidos,
             COALESCE(SUM(pg.monto), 0) as total
      FROM pagos pg
      JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.created_at >= ? AND pg.created_at < ?
        AND p.estado != 'CANCELADO'
      GROUP BY hora
      ORDER BY hora ASC
    `).all(inicio, fin);
    
    return { pedidos, cancelados, ventasPorHora };
  }

  obtenerDetalleReportePedidos(inicio, fin) {
    return this.db.prepare(`
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
  }

  obtenerDashboard() {
    const rangoOp = this.getRangoOperativo(new Date().toISOString().split('T')[0]);
    const { inicio, fin } = rangoOp;

    const ventasHoy = this.db.prepare(`
      SELECT COALESCE(SUM(pg.monto), 0) as total,
             COALESCE(SUM(pg.propina), 0) as propina,
             COUNT(DISTINCT pg.pedido_id) as pedidos
      FROM pagos pg
      JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.created_at >= ? AND pg.created_at < ?
        AND p.estado != 'CANCELADO'
    `).get(inicio, fin);

    const desglosePagos = this.db.prepare(`
      SELECT pg.metodo, COALESCE(SUM(pg.monto), 0) as total
      FROM pagos pg
      JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.created_at >= ? AND pg.created_at < ?
        AND p.estado != 'CANCELADO'
      GROUP BY pg.metodo
    `).all(inicio, fin);

    const ventasPorHora = this.db.prepare(`
      SELECT strftime('%H', pg.created_at, 'localtime') as hora,
             COUNT(DISTINCT p.id) as pedidos,
             COALESCE(SUM(pg.monto), 0) as total
      FROM pagos pg
      JOIN pedidos p ON p.id = pg.pedido_id
      WHERE pg.created_at >= ? AND pg.created_at < ?
        AND p.estado != 'CANCELADO'
      GROUP BY hora ORDER BY hora ASC
    `).all(inicio, fin);

    const mesas = this.db.prepare("SELECT COUNT(*) as c FROM mesas WHERE estado != 'INACTIVO'").get();
    const mesasOcupadas = this.db.prepare("SELECT COUNT(*) as c FROM mesas WHERE estado = 'OCUPADO'").get();
    const caja = this.db.prepare("SELECT id, estado, opened_at, fondo_inicial FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
    
    // Mesas activas y saldo pendiente por cobrar
    const pendientesMesas = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT m.id) as mesas_con_saldo,
        COALESCE(SUM(
          MAX(0, p.total - 
            COALESCE((SELECT SUM(pg.monto) FROM pagos pg WHERE pg.pedido_id = p.id), 0) - 
            COALESCE((SELECT SUM(CASE WHEN d.tipo = 'porcentaje' THEN (p.total * d.valor / 100) ELSE d.valor END) FROM descuentos d WHERE d.pedido_id = p.id), 0)
          )
        ), 0) as total_por_cobrar
      FROM mesas m
      JOIN pedidos p ON p.id = m.pedido_activo_id
      WHERE m.estado IN ('OCUPADO', 'CERRANDO') AND p.estado != 'CANCELADO'
    `).get();

    // Top 5 productos más vendidos del día
    const topProductos = this.db.prepare(`
      SELECT pi.producto_nombre, SUM(pi.cantidad) as cantidad,
             SUM(pi.cantidad * (pi.precio_unitario + COALESCE(pi.precio_adicional, 0))) as total
      FROM pedido_items pi
      JOIN pedidos p ON p.id = pi.pedido_id
      WHERE p.created_at >= ? AND p.created_at < ? AND p.estado != 'CANCELADO' AND pi.estado != 'CANCELADO'
      GROUP BY pi.producto_nombre
      ORDER BY cantidad DESC LIMIT 5
    `).all(inicio, fin);

    // Ventas por canal (SALON, DELIVERY, PARA_LLEVAR)
    const ventasCanales = this.db.prepare(`
      SELECT COALESCE(a.tipo, 'SALON') as canal,
             COUNT(DISTINCT p.id) as pedidos,
             COALESCE(SUM(pg.monto), 0) as total
      FROM pagos pg
      JOIN pedidos p ON p.id = pg.pedido_id
      LEFT JOIN mesas m ON m.id = p.mesa_id
      LEFT JOIN areas a ON a.id = m.area_id
      WHERE pg.created_at >= ? AND pg.created_at < ? AND p.estado != 'CANCELADO'
      GROUP BY canal
    `).all(inicio, fin);

    const totalCobrado = ventasHoy.total || 0;
    const pedidosCobrados = ventasHoy.pedidos || 0;
    const totalPorCobrar = pendientesMesas.total_por_cobrar || 0;
    const mesasConSaldo = pendientesMesas.mesas_con_saldo || 0;
    const totalProyectado = totalCobrado + totalPorCobrar;
    const ticketPromedio = pedidosCobrados > 0 ? (totalCobrado / pedidosCobrados) : 0;

    const stockBajo = this.db.prepare(`
      SELECT nombre, stock_actual, stock_minimo
      FROM productos WHERE controlar_stock = 1 AND activo = 1 AND stock_actual <= stock_minimo
      ORDER BY (stock_minimo - stock_actual) DESC LIMIT 10
    `).all();

    return {
      ventas_hoy: {
        total: totalCobrado,
        propina: ventasHoy.propina || 0,
        pedidos: pedidosCobrados,
        ticket_promedio: ticketPromedio
      },
      por_cobrar: {
        total: totalPorCobrar,
        mesas: mesasConSaldo
      },
      proyeccion: {
        total: totalProyectado
      },
      desglose_pagos: desglosePagos,
      ventas_por_hora: ventasPorHora,
      ventas_canales: ventasCanales,
      top_productos: topProductos,
      mesas: { total: mesas.c, ocupadas: mesasOcupadas.c, libres: mesas.c - mesasOcupadas.c },
      caja: caja || null,
      stock_bajo: stockBajo,
      rango: { inicio, fin }
    };
  }
}
module.exports = new AdminReporteRepository();
