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
}

module.exports = new PedidoRepository();
module.exports.PedidoRepository = PedidoRepository;
