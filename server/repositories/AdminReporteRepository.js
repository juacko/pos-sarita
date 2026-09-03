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
      if (/^\d{2}:\d{2}$/.test(v)) return v;
    } catch (e) {}
    return '23:00';
  }

  getRangoOperativo(fecha) {
    const corte = this.getHoraCorte();
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
    
    return { pedidos, cancelados };
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
}
module.exports = new AdminReporteRepository();
