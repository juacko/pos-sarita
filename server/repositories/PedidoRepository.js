const defaultDb = require('../db');

/**
 * Repositorio de acceso a datos para Pedidos y PedidoItems.
 */
class PedidoRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerPorId(id) {
    const pedido = this.db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
    if (!pedido) return null;
    pedido.items = this.db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(id);
    pedido.pagos = this.db.prepare('SELECT * FROM pagos WHERE pedido_id = ?').all(id);
    pedido.descuentos = this.db.prepare('SELECT * FROM descuentos WHERE pedido_id = ?').all(id);
    return pedido;
  }

  obtenerTotal(id) {
    const pedido = this.db.prepare('SELECT total FROM pedidos WHERE id = ?').get(id);
    return pedido ? pedido.total : null;
  }

  obtenerPedidoCompletoPorId(id) {
    const pedido = this.db.prepare(`
      SELECT p.*, m.numero as mesa_numero, m.nombre as mesa_nombre
      FROM pedidos p
      JOIN mesas m ON m.id = p.mesa_id
      WHERE p.id = ?
    `).get(id);

    if (!pedido) return null;

    pedido.items = this.db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id);
    pedido.pagos = this.db.prepare(`
      SELECT pg.*, u.nombre as usuario_nombre
      FROM pagos pg
      LEFT JOIN usuarios u ON u.id = pg.usuario_id
      WHERE pg.pedido_id = ?
      ORDER BY pg.created_at
    `).all(pedido.id);
    pedido.descuentos = this.db.prepare(`
      SELECT d.*, u.nombre as usuario_nombre
      FROM descuentos d
      LEFT JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.pedido_id = ?
      ORDER BY d.created_at
    `).all(pedido.id);

    return pedido;
  }

  obtenerItemsPorPedido(pedidoId) {
    return this.db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(pedidoId);
  }

  obtenerItemsPorDestino(pedidoId, destino) {
    if (destino === 'cocina') {
      return this.db.prepare(`
        SELECT * FROM pedido_items
        WHERE pedido_id = ? AND estado != 'CANCELADO'
          AND (destino_impresion = 'cocina' OR destino_impresion = 'ambos' OR destino_impresion IS NULL)
      `).all(pedidoId);
    } else if (destino === 'barra') {
      return this.db.prepare(`
        SELECT * FROM pedido_items
        WHERE pedido_id = ? AND estado != 'CANCELADO'
          AND (destino_impresion = 'barra' OR destino_impresion = 'ambos')
      `).all(pedidoId);
    }
    return this.obtenerItemsPorPedido(pedidoId);
  }

  actualizarEstado(pedidoId, estado) {
    this.db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?").run(estado, pedidoId);
    return this.obtenerPorId(pedidoId);
  }

  actualizarEstadoItem(itemId, estado) {
    this.db.prepare('UPDATE pedido_items SET estado = ? WHERE id = ?').run(estado, itemId);
    return this.db.prepare(`
      SELECT pi.*, p.mesa_id, p.mesa_numero
      FROM pedido_items pi
      JOIN pedidos p ON p.id = pi.pedido_id
      WHERE pi.id = ?
    `).get(itemId);
  }

  actualizarEstadoItemsMasivo(pedidoId, estado, destino = null) {
    if (destino === 'cocina') {
      this.db.prepare(`
        UPDATE pedido_items SET estado = ?
        WHERE pedido_id = ? AND estado != 'CANCELADO'
          AND (destino_impresion = 'cocina' OR destino_impresion = 'ambos' OR destino_impresion IS NULL)
      `).run(estado, pedidoId);
    } else if (destino === 'barra') {
      this.db.prepare(`
        UPDATE pedido_items SET estado = ?
        WHERE pedido_id = ? AND estado != 'CANCELADO'
          AND (destino_impresion = 'barra' OR destino_impresion = 'ambos')
      `).run(estado, pedidoId);
    } else {
      this.db.prepare("UPDATE pedido_items SET estado = ? WHERE pedido_id = ? AND estado != 'CANCELADO'")
        .run(estado, pedidoId);
    }
  }

  recalcularEstadoGlobalPedido(pedidoId) {
    const allActiveItems = this.db.prepare("SELECT estado FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(pedidoId);
    if (allActiveItems.length === 0) return null;

    const allReady = allActiveItems.every(i => i.estado === 'LISTO' || i.estado === 'ENTREGADO');
    const anyCooking = allActiveItems.some(i => i.estado === 'COCINANDO');

    let nuevoEstado = null;
    if (allReady) nuevoEstado = 'LISTO';
    else if (anyCooking) nuevoEstado = 'EN_PREPARACION';

    if (nuevoEstado) {
      this.db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?").run(nuevoEstado, pedidoId);
    }
    return nuevoEstado;
  }

  obtenerTotalesDescuentos(pedidoId) {
    return this.db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN 0 ELSE valor END), 0) as fijo,
             COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN valor ELSE 0 END), 0) as pct
      FROM descuentos WHERE pedido_id = ?
    `).get(pedidoId);
  }

  obtenerTotalPagado(pedidoId) {
    return this.db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE pedido_id = ?').get(pedidoId).total;
  }

  resolverDestino(productoId) {
    if (!productoId) return 'cocina';
    const row = this.db.prepare(`
      SELECT COALESCE(NULLIF(p.destino_override, ''), NULLIF(c.destino, ''), 'cocina') AS destino_resuelto
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.id = ?
    `).get(productoId);
    return row ? row.destino_resuelto : 'cocina';
  }

  recalcularTotalPedido(pedidoId) {
    const t = this.db.prepare(`
      SELECT COALESCE(SUM(cantidad * (precio_unitario + COALESCE(precio_adicional, 0))), 0) as total
      FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'
    `).get(pedidoId).total;
    this.db.prepare("UPDATE pedidos SET total = ?, updated_at = datetime('now') WHERE id = ?").run(t, pedidoId);
    return t;
  }

  validarOrigenParaMovimiento(pedidoId) {
    const ordenOrigen = this.db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
    if (!ordenOrigen) throw { status: 404, error: 'Pedido no encontrado' };
    if (ordenOrigen.estado === 'CERRADO' || ordenOrigen.estado === 'CANCELADO') {
      throw { status: 409, error: 'El pedido ya está cerrado o cancelado' };
    }
    const conPagos = this.db.prepare('SELECT COUNT(*) as c FROM pagos WHERE pedido_id = ?').get(pedidoId).c;
    if (conPagos > 0) {
      throw { status: 409, error: 'La cuenta ya tiene pagos registrados, no se pueden mover sus productos' };
    }
    return ordenOrigen;
  }

  obtenerDestinoYCrearOrdenSiFalta(mesaDestino, origen, mesero_id) {
    let ordenDestino = null;
    const pedidoVinculado = mesaDestino.pedido_activo_id
      ? this.db.prepare('SELECT * FROM pedidos WHERE id = ?').get(mesaDestino.pedido_activo_id)
      : null;
    if (pedidoVinculado && pedidoVinculado.estado !== 'CERRADO' && pedidoVinculado.estado !== 'CANCELADO') {
      ordenDestino = pedidoVinculado;
    } else if (pedidoVinculado) {
      this.db.prepare('UPDATE mesas SET pedido_activo_id = NULL WHERE id = ?').run(mesaDestino.id);
    }

    if (!ordenDestino) {
      const mesero = mesero_id ? this.db.prepare('SELECT id, nombre FROM usuarios WHERE id = ?').get(mesero_id) : null;
      const r = this.db.prepare(`
        INSERT INTO pedidos (mesa_id, mesa_numero, mesero_id, mesero_nombre, estado, total, nota, cliente_nombre, cliente_telefono, cliente_direccion, hora_recogida)
        VALUES (?, ?, ?, ?, 'ABIERTO', 0, ?, ?, ?, ?, ?)
      `).run(
        mesaDestino.id, mesaDestino.numero || mesaDestino.nombre,
        mesero?.id || null, mesero?.nombre || null,
        origen.nota || null, origen.cliente_nombre || null, origen.cliente_telefono || null,
        origen.cliente_direccion || null, origen.hora_recogida || null
      );
      ordenDestino = this.db.prepare('SELECT * FROM pedidos WHERE id = ?').get(r.lastInsertRowid);

      if (mesaDestino.estado === 'LIBRE' || mesaDestino.estado === 'RESERVADO') {
        this.db.prepare(`
          UPDATE mesas SET estado = 'OCUPADO', mesero_id = ?, mesero_nombre = ?, pedido_activo_id = ?,
            ocupado_desde = datetime('now'), version = version + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(mesero?.id || null, mesero?.nombre || null, ordenDestino.id, mesaDestino.id);
      } else {
        this.db.prepare(`UPDATE mesas SET pedido_activo_id = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(ordenDestino.id, mesaDestino.id);
      }
    }
    const mesa = this.db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaDestino.id);
    return { ordenDestino, mesa };
  }
}

module.exports = new PedidoRepository();
module.exports.PedidoRepository = PedidoRepository;
