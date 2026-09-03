const adminPedidoRepo = require('../repositories/AdminPedidoRepository');
const adminCajaRepo = require('../repositories/AdminCajaRepository');
const pagos = require('../metodos-pago');
const stockService = require('../services/StockService');

class AdminPedidoController {
  constructor(io) {
    this.io = io;
  }

  obtenerAnulables(req, res) {
    try { res.json(adminPedidoRepo.obtenerPedidosAnulables()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  }

  anularPedido(req, res) {
    try {
      const { motivo, usuario_id } = req.body;
      if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'El motivo de anulación es requerido' });

      const uid = req.usuario?.id || usuario_id;
      const rolCheck = adminPedidoRepo.verificarRolAdminCajero(uid);
      if (rolCheck.error) return res.status(403).json({ error: 'Solo el administrador o el cajero pueden anular pedidos' });

      let affectedStockProducts = [];

      const result = adminPedidoRepo.ejecutarTransaccion(() => {
        const pedido = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CERRADO' || pedido.estado === 'CANCELADO') {
          throw { status: 409, error: `No se puede anular un pedido en estado ${pedido.estado}` };
        }

        const itemsToRestore = adminPedidoRepo.obtenerItemsActivos(pedido.id);
        affectedStockProducts = stockService.reponerStock(itemsToRestore);

        adminPedidoRepo.anularPedidoCompleto(pedido.id, motivo, uid);

        let mesaData = null;
        if (pedido.mesa_id) {
          const mesa = adminPedidoRepo.obtenerMesa(pedido.mesa_id);
          if (mesa && mesa.pedido_activo_id == pedido.id) {
            mesaData = adminPedidoRepo.liberarMesa(mesa.id, uid, `Pedido #${pedido.id} anulado: ${motivo.trim()}`);
          }
        }
        return { mesa: mesaData };
      });

      const pedidoFinal = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
      if (this.io) {
        this.io.emit('pedido:actualizado', pedidoFinal);
        if (result.mesa) this.io.emit('mesa:updated', result.mesa);
        if (affectedStockProducts.length) {
          for (const p of affectedStockProducts) {
            this.io.emit('stock:actualizado', {
              producto_id: p.id, controlar_stock: p.controlar_stock,
              stock_actual: p.stock_actual, stock_minimo: p.stock_minimo
            });
          }
        }
      }
      res.json({ ok: true, pedido: pedidoFinal, mesa: result.mesa });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  obtenerPagados(req, res) {
    try {
      const limite = Math.min(parseInt(req.query.limite) || 50, 200);
      res.json(adminPedidoRepo.obtenerPedidosPagados(limite));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  agregarPago(req, res) {
    try {
      const { metodo, monto, propina, referencia, notas, usuario_id, motivo } = req.body;
      const rolCheck = adminPedidoRepo.verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });
      if (!metodo || !pagos.esMetodoValido(metodo)) return res.status(400).json({ error: 'Método de pago inválido o deshabilitado' });
      if (monto == null || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

      const result = adminPedidoRepo.ejecutarTransaccion(() => {
        const sesion = adminCajaRepo.sesionCajaAbierta();
        if (!sesion) throw { status: 409, error: 'No hay caja abierta. Abra la caja para registrar pagos', code: 'CAJA_CERRADA' };

        const pedido = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido está cancelado' };

        const descuentoRow = adminPedidoRepo.obtenerDescuentosTotal(pedido.id);
        const totalFinal = Math.max(0, pedido.total * (1 - (descuentoRow.pct || 0) / 100) - (descuentoRow.fijo || 0));
        const pagado = adminPedidoRepo.obtenerPagado(pedido.id);
        const pendiente = Math.max(0, totalFinal - pagado);

        if (metodo === 'vale') {
          const valeRow = adminPedidoRepo.obtenerVale(referencia);
          if (!valeRow) throw { status: 404, error: 'Vale no encontrado o inactivo' };
          if (valeRow.monto_restante < monto - 0.01) throw { status: 400, error: `El vale solo tiene S/${valeRow.monto_restante.toFixed(2)} disponibles` };
          if (monto > pendiente + 0.01) throw { status: 400, error: `El monto excede el pendiente (S/${pendiente.toFixed(2)})` };
          adminPedidoRepo.actualizarValeRestante(monto, valeRow.id);
        } else {
          if (monto > pendiente + 0.01) throw { status: 400, error: `El monto (S/${monto.toFixed(2)}) excede el pendiente (S/${pendiente.toFixed(2)})` };
        }

        const propinaMonto = parseFloat(propina) || 0;
        const pagoId = adminPedidoRepo.registrarPago(pedido.id, monto, metodo, propinaMonto, referencia, notas, usuario_id);

        const pagadoTotal = pagado + monto;
        const fullyPaid = pagadoTotal >= totalFinal - 0.01;
        if (fullyPaid && pedido.estado !== 'CERRADO') {
          adminPedidoRepo.cerrarPedido(pedido.id);
        }

        adminPedidoRepo.registrarLogPago(pedido.id, pagoId, 'AGREGAR', motivo, `Pago ${metodo} S/${monto.toFixed(2)} agregado`, usuario_id);
        return { pagoId, pagadoTotal, pendiente: Math.max(0, totalFinal - pagadoTotal), fullyPaid };
      });

      const pedidoActualizado = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
      if (this.io) this.io.emit('pedido:actualizado', pedidoActualizado);
      res.json({ ok: true, pedido: pedidoActualizado, ...result });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  actualizarPago(req, res) {
    try {
      const { metodo, referencia, notas, propina, usuario_id, motivo } = req.body;
      const rolCheck = adminPedidoRepo.verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });
      if (metodo && !pagos.esMetodoValido(metodo)) return res.status(400).json({ error: 'Método de pago inválido o deshabilitado' });

      const result = adminPedidoRepo.ejecutarTransaccion(() => {
        const pedido = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        const pago = adminPedidoRepo.obtenerPago(req.params.pagoId, pedido.id);
        if (!pago) throw { status: 404, error: 'Pago no encontrado' };
        
        const sesion = adminCajaRepo.sesionCajaAbierta();
        const inicio = sesion ? (sesion.absorbe_desde || sesion.opened_at) : null;
        const now = adminCajaRepo.getNow();
        const pagoPertenece = sesion && pago.created_at >= inicio && pago.created_at <= now;
        if (!pagoPertenece) throw { status: 409, error: 'Solo se pueden modificar pagos de la caja abierta actual' };

        const nuevoMetodo = metodo || pago.metodo;
        const nuevaRef = referencia !== undefined ? referencia : pago.referencia;
        const nuevasNotas = notas !== undefined ? notas : pago.notas;
        const nuevaPropina = propina !== undefined ? (parseFloat(propina) || 0) : pago.propina;

        adminPedidoRepo.actualizarPago(nuevoMetodo, nuevaRef, nuevasNotas, nuevaPropina, pago.id);
        adminPedidoRepo.registrarLogPago(pedido.id, pago.id, 'MODIFICAR', motivo, `Método ${pago.metodo} → ${nuevoMetodo}`, usuario_id);
        return { pagoId: pago.id };
      });

      const pagoActualizado = adminPedidoRepo.obtenerPagoPorId(result.pagoId);
      res.json({ ok: true, pago: pagoActualizado });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  eliminarPago(req, res) {
    try {
      const { motivo, usuario_id } = req.body;
      if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'El motivo de la devolución es requerido' });
      const rolCheck = adminPedidoRepo.verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const result = adminPedidoRepo.ejecutarTransaccion(() => {
        const pedido = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido ya está cancelado' };
        const pago = adminPedidoRepo.obtenerPago(req.params.pagoId, pedido.id);
        if (!pago) throw { status: 404, error: 'Pago no encontrado' };
        
        const sesion = adminCajaRepo.sesionCajaAbierta();
        const inicio = sesion ? (sesion.absorbe_desde || sesion.opened_at) : null;
        const now = adminCajaRepo.getNow();
        const pagoPertenece = sesion && pago.created_at >= inicio && pago.created_at <= now;
        if (!pagoPertenece) throw { status: 409, error: 'Solo se pueden anular pagos de la caja abierta actual' };

        const todosPagos = adminPedidoRepo.obtenerTodosPagos(pedido.id);
        for (const pg of todosPagos) {
          if (pg.metodo === 'vale' && pg.referencia) {
            const valeRow = adminPedidoRepo.obtenerValePorCodigo(pg.referencia);
            if (valeRow) adminPedidoRepo.devolverVale(pg.monto, valeRow.id);
          }
          if (pg.metodo !== 'regalo') {
            adminPedidoRepo.registrarEgresoDevolucion(pedido.id, pg.metodo, pg.monto, motivo.trim(), usuario_id);
          }
          adminPedidoRepo.registrarLogPago(pedido.id, pg.id, 'QUITAR', motivo.trim(), `Devolución pago ${pg.metodo} S/${pg.monto.toFixed(2)}`, usuario_id);
        }

        adminPedidoRepo.anularPedidoCompleto(pedido.id, `Devolución: ${motivo.trim()}`, usuario_id);

        let mesa = null;
        if (pedido.mesa_id) {
          const mesaRow = adminPedidoRepo.obtenerMesa(pedido.mesa_id);
          if (mesaRow && mesaRow.pedido_activo_id == pedido.id) {
            mesa = adminPedidoRepo.liberarMesa(mesaRow.id, usuario_id, `Pedido #${pedido.id} anulado (devolución): ${motivo.trim()}`);
          }
        }
        return { mesa };
      });

      const pedidoFinal = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
      if (this.io) {
        this.io.emit('pedido:actualizado', pedidoFinal);
        if (result.mesa) this.io.emit('mesa:updated', result.mesa);
      }
      res.json({ ok: true, pedido: pedidoFinal, mesa: result.mesa, devolucion: true });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  eliminarPedido(req, res) {
    try {
      const { motivo, usuario_id } = req.body;
      if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'El motivo de la eliminación es requerido' });
      const rolCheck = adminPedidoRepo.verificarRolAdminCajero(usuario_id);
      if (rolCheck.error) return res.status(403).json({ error: rolCheck.error });

      const result = adminPedidoRepo.ejecutarTransaccion(() => {
        const pedido = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido ya está cancelado' };

        const pagosList = adminPedidoRepo.obtenerTodosPagos(pedido.id);
        let totalDevuelto = 0;
        
        const sesion = adminCajaRepo.sesionCajaAbierta();
        const inicio = sesion ? (sesion.absorbe_desde || sesion.opened_at) : null;
        const now = adminCajaRepo.getNow();

        for (const pg of pagosList) {
          const pagoPertenece = sesion && pg.created_at >= inicio && pg.created_at <= now;
          if (!pagoPertenece) throw { status: 409, error: 'Solo se pueden eliminar pedidos pagados en la caja abierta actual' };
          
          if (pg.metodo === 'vale' && pg.referencia) {
            const valeRow = adminPedidoRepo.obtenerValePorCodigo(pg.referencia);
            if (valeRow) adminPedidoRepo.devolverVale(pg.monto, valeRow.id);
          }
          if (pg.metodo !== 'regalo') totalDevuelto += pg.monto;
          adminPedidoRepo.registrarLogPago(pedido.id, pg.id, 'QUITAR', motivo.trim(), `Eliminación de pedido: devolución pago ${pg.metodo} S/${pg.monto.toFixed(2)}`, usuario_id);
        }

        if (totalDevuelto > 0) {
          adminPedidoRepo.registrarEgresoGenerico(pedido.id, totalDevuelto, usuario_id, motivo.trim());
        }

        adminPedidoRepo.anularPedidoCompleto(pedido.id, `Eliminación: ${motivo.trim()}`, usuario_id);
        adminPedidoRepo.registrarLogPago(pedido.id, null, 'ELIMINAR', motivo.trim(), `Pedido eliminado, ${pagosList.length} pago(s) devuelto(s)`, usuario_id);

        let mesa = null;
        if (pedido.mesa_id) {
          const mesaRow = adminPedidoRepo.obtenerMesa(pedido.mesa_id);
          if (mesaRow && mesaRow.pedido_activo_id == pedido.id) {
            mesa = adminPedidoRepo.liberarMesa(mesaRow.id, usuario_id, `Pedido #${pedido.id} eliminado: ${motivo.trim()}`);
          }
        }
        return { mesa };
      });

      const pedidoFinal = adminPedidoRepo.obtenerPedidoPorId(req.params.id);
      if (this.io) {
        this.io.emit('pedido:actualizado', pedidoFinal);
        if (result.mesa) this.io.emit('mesa:updated', result.mesa);
      }
      res.json({ ok: true, pedido: pedidoFinal, mesa: result.mesa, devolucion: true });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }
}

module.exports = AdminPedidoController;
