const defaultPedidoRepo = require('../repositories/PedidoRepository');

class PedidoController {
  constructor(pedidoRepo = defaultPedidoRepo) {
    this.pedidoRepo = pedidoRepo;
  }

  obtenerPedido(req, res) {
    try {
      const pedido = this.pedidoRepo.obtenerPorId(req.params.id);
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      res.json(pedido);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarEstadoItemsMasivo(req, res, io) {
    const { id } = req.params;
    const { estado, destino, destino_impresion } = req.body;
    const validStates = ['PENDIENTE', 'COCINANDO', 'LISTO', 'ENTREGADO', 'CANCELADO'];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    try {
      const pedido = this.pedidoRepo.obtenerPorId(id);
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      const targetDestino = destino || destino_impresion;
      this.pedidoRepo.actualizarEstadoItemsMasivo(id, estado, targetDestino);
      this.pedidoRepo.recalcularEstadoGlobalPedido(id);

      const pedidoActualizado = this.pedidoRepo.obtenerPorId(id);
      const items = this.pedidoRepo.obtenerItemsPorPedido(id);

      if (io) {
        io.emit('pedido:actualizado', pedidoActualizado);
        io.emit('item:actualizado', { pedido_id: Number(id) });
      }

      res.json({ ok: true, items, pedido: pedidoActualizado });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarEstadoItem(req, res, io) {
    const { idItem } = req.params;
    const { estado } = req.body;
    const validStates = ['PENDIENTE', 'COCINANDO', 'LISTO', 'ENTREGADO', 'CANCELADO'];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    try {
      const item = this.pedidoRepo.actualizarEstadoItem(idItem, estado);
      if (item) {
        this.pedidoRepo.recalcularEstadoGlobalPedido(item.pedido_id);
        const pedidoActualizado = this.pedidoRepo.obtenerPorId(item.pedido_id);

        if (io) {
          io.emit('pedido:actualizado', pedidoActualizado);
          io.emit('item:actualizado', item);
        }
      }

      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new PedidoController();
module.exports.PedidoController = PedidoController;
