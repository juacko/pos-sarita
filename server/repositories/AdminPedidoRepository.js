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
    return this.db.prepare(`
      SELECT p.id, p.mesa_id, p.estado, p.total, p.created_at, p.cliente_nombre,
             m.nombre as mesa_nombre, m.numero as mesa_numero, m.es_virtual,
             (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.estado != 'CANCELADO') as items,
             (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) as pagado
      FROM pedidos p
      LEFT JOIN mesas m ON m.id = p.mesa_id
      WHERE p.estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')
      ORDER BY p.id DESC
    `).all();
  }

  obtenerPedidosPagados(limite) {
    return this.db.prepare(`
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
    this.db.prepare(`
      UPDATE mesas SET
        estado = 'LIBRE', mesero_id = NULL, mesero_nombre = NULL,
        pedido_activo_id = NULL, ocupado_desde = NULL, version = version + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(mesaId);
    this.db.prepare("INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle) VALUES (?, 'PEDIDO_ANULADO', ?, ?)")
      .run(mesaId, usuario_id || null, detalle);
    return this.db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
  }

  obtenerMesa(mesaId) {
    return this.db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
  }

  obtenerDescuentosTotal(pedidoId) {
    return this.db.prepare("SELECT COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN 0 ELSE valor END), 0) as fijo, SUM(CASE WHEN tipo = 'porcentaje' THEN valor ELSE 0 END) as pct FROM descuentos WHERE pedido_id = ?").get(pedidoId);
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
    this.db.prepare(`
      INSERT INTO pagos_log (pedido_id, pago_id, accion, motivo, detalle, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(pedido_id, pago_id || null, accion, motivo || null, detalle || null, usuario_id || null);
  }

  obtenerPago(pagoId, pedidoId) {
    return this.db.prepare('SELECT * FROM pagos WHERE id = ? AND pedido_id = ?').get(pagoId, pedidoId);
  }
  
  obtenerPagoPorId(pagoId) {
    return this.db.prepare('SELECT * FROM pagos WHERE id = ?').get(pagoId);
  }

  actualizarPago(nuevoMetodo, nuevaRef, nuevasNotas, nuevaPropina, pagoId) {
    this.db.prepare(`
      UPDATE pagos SET metodo = ?, referencia = ?, notas = ?, propina = ?
      WHERE id = ?
    `).run(nuevoMetodo, nuevaRef, nuevasNotas, nuevaPropina, pagoId);
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
    this.db.prepare(`
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

  registrarEgresoGenerico(pedidoId, totalDevuelto, usuario_id, motivo) {
    this.db.prepare(`
      INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas)
      VALUES ('EGRESO', ?, ?, 'efectivo', ?, ?, ?)
    `).run(`Eliminación Pedido #${pedidoId}`, totalDevuelto, null, usuario_id || null, `Eliminación: ${motivo}`);
  }
}

module.exports = new AdminPedidoRepository();
