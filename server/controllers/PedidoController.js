const defaultPedidoRepo = require('../repositories/PedidoRepository');
const db = require('../db');
const printers = require('../printers');
const pagos = require('../metodos-pago');
const stockService = require('../services/StockService');
const pagoService = require('../services/PagoService');

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
    const { estado, destino, destino_impresion, item_ids } = req.body;
    const validStates = ['PENDIENTE', 'COCINANDO', 'LISTO', 'ENTREGADO', 'CANCELADO'];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    try {
      const pedido = this.pedidoRepo.obtenerPorId(id);
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      const targetDestino = destino || destino_impresion;
      this.pedidoRepo.actualizarEstadoItemsMasivo(id, estado, targetDestino, item_ids);
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

  // ---- HELPERS CONTROL DE STOCK ----
  validarYDescontarStock(items) {
    return stockService.validarYDescontarStock(items);
  }

  reponerStock(items) {
    return stockService.reponerStock(items);
  }

  emitirStockActualizado(affectedProducts, io) {
    return stockService.emitirStockActualizado(affectedProducts, io);
  }

  // Valida que los modificadores requeridos (visibles según la variante elegida) tengan selección
  validarOpcionesRequeridas(items) {
    for (const item of items || []) {
      if (!item.producto_id) continue;
      const mods = db.prepare('SELECT * FROM modificadores WHERE producto_id = ? AND activo = 1').all(item.producto_id);
      for (const m of mods) {
        if (!m.requerido) continue;
        const visible = !m.depende_variante_id || (item.variante_id && item.variante_id == m.depende_variante_id);
        if (!visible) continue;
        const selMod = (item.modificadores || []).find(x => x.id == m.id);
        const tiene = m.tipo === 'text'
          ? !!(selMod?.seleccion?.length && String(selMod.seleccion[0]?.nombre || '').trim())
          : !!(selMod?.seleccion?.length);
        if (!tiene) {
          return `El producto "${item.nombre}" requiere seleccionar: ${m.nombre}`;
        }
      }
    }
    return null;
  }

  emitPedidoYMesa(pedidoId, mesaId, io) {
    if (pedidoId) io.emit('pedido:actualizado', db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId));
    if (mesaId) {
      const m = db.prepare(`
        SELECT m.*, a.tipo as area_tipo, a.nombre as area_nombre
        FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
      `).get(mesaId);
      io.emit('mesa:updated', m);
      return m;
    }
    return null;
  }

  obtenerPedidos(req, res) {
    try {
      const { estado, mesa_id } = req.query;
      let sql = `
        SELECT p.*, m.numero as mesa_numero, m.nombre as mesa_nombre
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
      `;
      const wheres = [];
      const params = [];

      if (estado) {
        wheres.push('p.estado = ?');
        params.push(estado);
      }
      if (mesa_id) {
        wheres.push('p.mesa_id = ?');
        params.push(mesa_id);
      }

      if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
      sql += ' ORDER BY p.created_at DESC';

      res.json(db.prepare(sql).all(...params));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  crearPedido(req, res, io) {
    try {
      const { mesa_id, mesero_id, items, nota, cliente_nombre, cliente_telefono, cliente_direccion, hora_recogida } = req.body;
      if (!mesa_id || !items || !items.length) {
        return res.status(400).json({ error: 'mesa_id e items son requeridos' });
      }
      const errorOpciones = this.validarOpcionesRequeridas(items);
      if (errorOpciones) return res.status(400).json({ error: errorOpciones });

      let affectedStockProducts = [];

      const pedido = db.transaction(() => {
        const mesa = db.prepare('SELECT numero, nombre, estado, pedido_activo_id FROM mesas WHERE id = ?').get(mesa_id);
        if (!mesa) throw { status: 404, error: 'Mesa no encontrada' };

        const pedidoActivo = db.prepare(
          "SELECT id FROM pedidos WHERE mesa_id = ? AND estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')"
        ).get(mesa_id);
        if (pedidoActivo) {
          throw { status: 409, error: `La mesa ya tiene un pedido activo (#${pedidoActivo.id}). Usa ese pedido o anúlalo antes de crear otro` };
        }

        affectedStockProducts = this.validarYDescontarStock(items);

        const mesero = mesero_id ? db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(mesero_id) : null;

        const result = db.prepare(`
          INSERT INTO pedidos (mesa_id, mesa_numero, mesero_id, mesero_nombre, estado, nota, cliente_nombre, cliente_telefono, cliente_direccion, hora_recogida)
          VALUES (?, ?, ?, ?, 'ABIERTO', ?, ?, ?, ?, ?)
        `).run(mesa_id, mesa.numero || mesa.nombre, mesero_id || null, mesero?.nombre || null, nota || null,
          cliente_nombre || null, cliente_telefono || null, cliente_direccion || null, hora_recogida || null);

        const pedidoId = result.lastInsertRowid;
        let total = 0;

        const insertItem = db.prepare(`
          INSERT INTO pedido_items (pedido_id, producto_id, producto_nombre, cantidad, precio_unitario,
            precio_adicional, notas, variante_id, variante_nombre, modificadores_json, agregados_json, detalle, destino_impresion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          const precioBase = item.precio || 0;
          const precioAdic = item.precio_adicional || 0;
          const destino = this.pedidoRepo.resolverDestino(item.producto_id || null);
          insertItem.run(
            pedidoId, item.producto_id || null, item.nombre, item.cantidad, precioBase,
            precioAdic, item.notas || null,
            item.variante_id || null, item.variante_nombre || null,
            JSON.stringify(item.modificadores || []),
            JSON.stringify(item.agregados || []),
            item.detalle || '', destino
          );
          total += item.cantidad * (precioBase + precioAdic);
        }

        db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(total, pedidoId);

        if (mesa.estado === 'LIBRE' || mesa.estado === 'RESERVADO') {
          db.prepare(`
            UPDATE mesas SET estado = 'OCUPADO', mesero_id = ?, mesero_nombre = ?, pedido_activo_id = ?, ocupado_desde = datetime('now'), updated_at = datetime('now') WHERE id = ?
          `).run(mesero_id || null, mesero?.nombre || null, pedidoId, mesa_id);
        } else {
          const previo = db.prepare('SELECT estado FROM pedidos WHERE id = ?').get(mesa.pedido_activo_id);
          const retomar = previo && previo.estado === 'CERRADO';
          db.prepare(`UPDATE mesas SET pedido_activo_id = ?, ${retomar ? 'ocupado_desde = datetime(\'now\'), ' : ''}updated_at = datetime('now') WHERE id = ?`)
            .run(pedidoId, mesa_id);
        }

        return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
      })();

      const itemsData = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id);
      const mesaData = db.prepare(`
        SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
      `).get(mesa_id);

      io.emit('pedido:nuevo', { pedido, items: itemsData });
      io.emit('kds:ring_bell');
      io.emit('mesa:updated', mesaData);
      this.emitirStockActualizado(affectedStockProducts, io);

      printers.printComanda(pedido, itemsData, mesaData);

      res.status(201).json({ pedido, items: itemsData });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  agregarItems(req, res, io) {
    try {
      const { items, nota } = req.body;
      if (!items || !items.length) {
        return res.status(400).json({ error: 'items son requeridos' });
      }
      const errorOpciones = this.validarOpcionesRequeridas(items);
      if (errorOpciones) return res.status(400).json({ error: errorOpciones });

      let affectedStockProducts = [];

      const result = db.transaction(() => {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido está cancelado' };

        const mesa = db.prepare(`
          SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
        `).get(pedido.mesa_id);

        affectedStockProducts = this.validarYDescontarStock(items);

        const insertItem = db.prepare(`
          INSERT INTO pedido_items (pedido_id, producto_id, producto_nombre, cantidad, precio_unitario,
            precio_adicional, notas, variante_id, variante_nombre, modificadores_json, agregados_json, detalle, destino_impresion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let total = 0;
        const insertedItemIds = [];
        for (const item of items) {
          const precioBase = item.precio || 0;
          const precioAdic = item.precio_adicional || 0;
          const destino = this.pedidoRepo.resolverDestino(item.producto_id || null);
          const insRes = insertItem.run(
            req.params.id, item.producto_id || null, item.nombre, item.cantidad, precioBase,
            precioAdic, item.notas || null,
            item.variante_id || null, item.variante_nombre || null,
            JSON.stringify(item.modificadores || []),
            JSON.stringify(item.agregados || []),
            item.detalle || '', destino
          );
          insertedItemIds.push(insRes.lastInsertRowid);
          total += item.cantidad * (precioBase + precioAdic);
        }

        db.prepare('UPDATE pedidos SET total = total + ?, updated_at = datetime(\'now\') WHERE id = ?').run(total, req.params.id);

        const estadoPrevio = db.prepare('SELECT estado FROM pedidos WHERE id = ?').get(req.params.id);
        if (estadoPrevio && (estadoPrevio.estado === 'LISTO' || estadoPrevio.estado === 'ENTREGADO')) {
          db.prepare("UPDATE pedidos SET estado = 'ABIERTO', updated_at = datetime('now') WHERE id = ?")
            .run(req.params.id);
        }

        const itemsData = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(req.params.id);
        const pedidoActualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);

        if (nota) {
          db.prepare('UPDATE pedidos SET nota = ? WHERE id = ?').run(nota, req.params.id);
        }

        const nuevosItems = itemsData.filter(i => insertedItemIds.includes(i.id));

        io.emit('pedido:actualizado', pedidoActualizado);
        if (nuevosItems.length > 0) io.emit('kds:ring_bell');

        printers.printComanda(pedidoActualizado, nuevosItems.length ? nuevosItems : itemsData, mesa);

        return { pedido: pedidoActualizado, items: itemsData };
      })();

      this.emitirStockActualizado(affectedStockProducts, io);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  actualizarItem(req, res, io) {
    try {
      const { precio_adicional, cantidad, usuario_id } = req.body;
      const result = db.transaction(() => {
        const item = db.prepare('SELECT * FROM pedido_items WHERE id = ? AND pedido_id = ?').get(req.params.itemId, req.params.id);
        if (!item) throw { status: 404, error: 'Item no encontrado en el pedido' };
        
        let updates = [];
        let params = [];
        if (precio_adicional !== undefined) {
          updates.push('precio_adicional = ?');
          params.push(parseFloat(precio_adicional) || 0);
        }
        if (cantidad !== undefined) {
          const nuevaCantidad = parseInt(cantidad, 10);
          if (isNaN(nuevaCantidad) || nuevaCantidad <= 0) {
             throw { status: 400, error: 'Cantidad inválida' };
          }
          updates.push('cantidad = ?');
          params.push(nuevaCantidad);
        }
        if (updates.length > 0) {
          params.push(req.params.itemId);
          db.prepare(`UPDATE pedido_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
          this.pedidoRepo.recalcularTotalPedido(req.params.id);
        }
        
        return { message: 'Item actualizado correctamente' };
      })();
      
      const pedidoInfo = db.prepare('SELECT mesa_id FROM pedidos WHERE id = ?').get(req.params.id);
      if (pedidoInfo) {
        const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(pedidoInfo.mesa_id);
        io.emit('mesa:updated', mesa);
        io.emit('pedido:items_updated', { pedidoId: req.params.id });
      }
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.error || err.message });
    }
  }

  dividirItem(req, res, io) {
    try {
      const { splitCantidad, usuario_id } = req.body;
      const result = db.transaction(() => {
        const item = db.prepare('SELECT * FROM pedido_items WHERE id = ? AND pedido_id = ?').get(req.params.itemId, req.params.id);
        if (!item) throw { status: 404, error: 'Item no encontrado' };
        
        const qSeparar = parseInt(splitCantidad, 10);
        if (isNaN(qSeparar) || qSeparar <= 0 || qSeparar >= item.cantidad) {
          throw { status: 400, error: 'Cantidad a separar inválida' };
        }
        
        const nuevaCantidadOri = item.cantidad - qSeparar;
        db.prepare('UPDATE pedido_items SET cantidad = ? WHERE id = ?').run(nuevaCantidadOri, req.params.itemId);
        
        db.prepare(`
          INSERT INTO pedido_items 
          (pedido_id, producto_id, producto_nombre, variante_id, variante_nombre, cantidad, precio_unitario, precio_adicional, notas, detalle, destino_impresion, estado, modificadores_json, agregados_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          item.pedido_id, item.producto_id, item.producto_nombre, item.variante_id, item.variante_nombre,
          qSeparar, item.precio_unitario, item.precio_adicional, item.notas, item.detalle, item.destino_impresion, item.estado, item.modificadores_json, item.agregados_json
        );
        
        this.pedidoRepo.recalcularTotalPedido(req.params.id);
        return { message: 'Item dividido correctamente' };
      })();
      
      const pedidoInfo = db.prepare('SELECT mesa_id FROM pedidos WHERE id = ?').get(req.params.id);
      if (pedidoInfo) {
        const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(pedidoInfo.mesa_id);
        io.emit('mesa:updated', mesa);
        io.emit('pedido:items_updated', { pedidoId: req.params.id });
      }
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  eliminarItem(req, res, io) {
    try {
      let affectedStockProducts = [];
      const result = db.transaction(() => {
        const item = db.prepare('SELECT * FROM pedido_items WHERE id = ? AND pedido_id = ?').get(req.params.itemId, req.params.id);
        if (!item) throw { status: 404, error: 'Item no encontrado' };
        
        affectedStockProducts = this.reponerStock([item]);
        db.prepare('DELETE FROM pedido_items WHERE id = ?').run(req.params.itemId);
        this.pedidoRepo.recalcularTotalPedido(req.params.id);
        
        return { message: 'Item eliminado correctamente' };
      })();
      
      this.emitirStockActualizado(affectedStockProducts, io);

      const pedidoInfo = db.prepare('SELECT mesa_id FROM pedidos WHERE id = ?').get(req.params.id);
      if (pedidoInfo) {
        const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(pedidoInfo.mesa_id);
        io.emit('mesa:updated', mesa);
        io.emit('pedido:items_updated', { pedidoId: req.params.id });
      }
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.error || err.message });
    }
  }

  moverItems(req, res, io) {
    try {
      const { item_ids, mesa_destino_id, mesero_id } = req.body;
      if (!mesa_destino_id) return res.status(400).json({ error: 'mesa_destino_id es requerido' });
      if (!Array.isArray(item_ids) || !item_ids.length) {
        return res.status(400).json({ error: 'item_ids son requeridos' });
      }

      const result = db.transaction(() => {
        const ordenOrigen = this.pedidoRepo.validarOrigenParaMovimiento(req.params.id);
        const mesaOrigen = db.prepare('SELECT * FROM mesas WHERE id = ?').get(ordenOrigen.mesa_id);

        if (parseInt(mesa_destino_id) === ordenOrigen.mesa_id) {
          throw { status: 409, error: 'La mesa destino es la misma' };
        }
        const mesaDestinoRaw = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesa_destino_id);
        if (!mesaDestinoRaw) throw { status: 404, error: 'Mesa destino no encontrada' };
        if (mesaDestinoRaw.es_virtual) throw { status: 409, error: 'No se puede mover a una mesa virtual (Delivery/Para llevar)' };
        if (mesaDestinoRaw.estado === 'INACTIVO') throw { status: 409, error: 'La mesa destino está inactiva' };

        const itemsAMover = db.prepare(
          `SELECT * FROM pedido_items WHERE pedido_id = ? AND id IN (${item_ids.map(() => '?').join(',')}) AND estado != 'CANCELADO'`
        ).all(req.params.id, ...item_ids);
        if (!itemsAMover.length) throw { status: 400, error: 'No hay productos válidos para mover' };

        const { ordenDestino, mesa: mesaDestino } = this.pedidoRepo.obtenerDestinoYCrearOrdenSiFalta(mesaDestinoRaw, ordenOrigen, mesero_id);

        const updateItem = db.prepare('UPDATE pedido_items SET pedido_id = ? WHERE id = ?');
        for (const it of itemsAMover) updateItem.run(ordenDestino.id, it.id);

        this.pedidoRepo.recalcularTotalPedido(ordenOrigen.id);
        this.pedidoRepo.recalcularTotalPedido(ordenDestino.id);

        let ordenOrigenFinal = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(ordenOrigen.id);
        let pedidoCancelado = false;
        const itemsRestantes = db.prepare("SELECT COUNT(*) as c FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").get(ordenOrigen.id).c;
        if (itemsRestantes === 0) {
          db.prepare("UPDATE pedidos SET estado = 'CANCELADO', updated_at = datetime('now') WHERE id = ?").run(ordenOrigen.id);
          ordenOrigenFinal = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(ordenOrigen.id);
          pedidoCancelado = true;
          if (mesaOrigen.pedido_activo_id == ordenOrigen.id) {
            db.prepare(`UPDATE mesas SET pedido_activo_id = NULL, version = version + 1, updated_at = datetime('now') WHERE id = ?`)
              .run(mesaOrigen.id);
          }
        }

        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'ITEMS_MOVIDOS', ?, ?)
        `).run(mesaOrigen.id, mesero_id || null, `${itemsAMover.length} producto(s) movidos a Mesa ${mesaDestino.nombre || mesaDestino.numero}`);
        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'ITEMS_RECIBIDOS', ?, ?)
        `).run(mesaDestino.id, mesero_id || null, `${itemsAMover.length} producto(s) recibidos de Mesa ${mesaOrigen.nombre || mesaOrigen.numero}`);

        this.emitPedidoYMesa(ordenOrigen.id, mesaOrigen.id, io);
        this.emitPedidoYMesa(ordenDestino.id, mesaDestino.id, io);

        const itemsDestino = db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(ordenDestino.id);
        const mesaDestinoFull = db.prepare(`
          SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
        `).get(mesaDestino.id);
        if (itemsDestino.length) printers.printComanda(ordenDestino, itemsDestino, mesaDestinoFull);

        return {
          ok: true,
          pedido_origen: ordenOrigenFinal,
          pedido_destino: ordenDestino,
          mesa_origen: db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaOrigen.id),
          mesa_destino: mesaDestinoFull,
          pedido_cancelado: pedidoCancelado,
          items_movidos: itemsAMover.length
        };
      })();

      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  unirPedidos(req, res, io) {
    try {
      const { mesa_destino_id, mesero_id } = req.body;
      if (!mesa_destino_id) return res.status(400).json({ error: 'mesa_destino_id es requerido' });

      const result = db.transaction(() => {
        const ordenOrigen = this.pedidoRepo.validarOrigenParaMovimiento(req.params.id);
        const mesaOrigen = db.prepare('SELECT * FROM mesas WHERE id = ?').get(ordenOrigen.mesa_id);

        if (parseInt(mesa_destino_id) === ordenOrigen.mesa_id) {
          throw { status: 409, error: 'La mesa destino es la misma' };
        }
        const mesaDestinoRaw = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesa_destino_id);
        if (!mesaDestinoRaw) throw { status: 404, error: 'Mesa destino no encontrada' };
        if (mesaDestinoRaw.es_virtual) throw { status: 409, error: 'No se puede unir a una mesa virtual' };
        if (mesaDestinoRaw.estado === 'INACTIVO') throw { status: 409, error: 'La mesa destino está inactiva' };

        const itemsAMover = db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(ordenOrigen.id);
        if (!itemsAMover.length) throw { status: 400, error: 'El pedido origen no tiene productos para unir' };

        const { ordenDestino, mesa: mesaDestino } = this.pedidoRepo.obtenerDestinoYCrearOrdenSiFalta(mesaDestinoRaw, ordenOrigen, mesero_id);

        const updateItem = db.prepare('UPDATE pedido_items SET pedido_id = ? WHERE id = ?');
        for (const it of itemsAMover) updateItem.run(ordenDestino.id, it.id);

        this.pedidoRepo.recalcularTotalPedido(ordenOrigen.id);
        this.pedidoRepo.recalcularTotalPedido(ordenDestino.id);

        db.prepare("UPDATE pedidos SET estado = 'CANCELADO', updated_at = datetime('now') WHERE id = ?").run(ordenOrigen.id);
        const pedidoOrigenFinal = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(ordenOrigen.id);

        const otrosActivos = db.prepare(
          "SELECT COUNT(*) as c FROM pedidos WHERE mesa_id = ? AND estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')"
        ).get(mesaOrigen.id).c;
        if (otrosActivos === 0) {
          db.prepare(`
            UPDATE mesas SET estado = 'LIBRE', mesero_id = NULL, mesero_nombre = NULL,
              pedido_activo_id = NULL, ocupado_desde = NULL, version = version + 1, updated_at = datetime('now')
            WHERE id = ?
          `).run(mesaOrigen.id);
        } else {
          if (mesaOrigen.pedido_activo_id == ordenOrigen.id) {
            db.prepare(`UPDATE mesas SET pedido_activo_id = NULL, version = version + 1, updated_at = datetime('now') WHERE id = ?`)
              .run(mesaOrigen.id);
          }
        }

        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'MESA_UNIDA', ?, ?)
        `).run(mesaOrigen.id, mesero_id || null, `Orden unida a Mesa ${mesaDestino.nombre || mesaDestino.numero}`);
        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'PEDIDO_UNIDO', ?, ?)
        `).run(mesaDestino.id, mesero_id || null, `Recibió ${itemsAMover.length} producto(s) de Mesa ${mesaOrigen.nombre || mesaOrigen.numero}`);

        this.emitPedidoYMesa(ordenOrigen.id, mesaOrigen.id, io);
        this.emitPedidoYMesa(ordenDestino.id, mesaDestino.id, io);

        const itemsDestino = db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(ordenDestino.id);
        const mesaDestinoFull = db.prepare(`
          SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
        `).get(mesaDestino.id);
        if (itemsDestino.length) printers.printComanda(ordenDestino, itemsDestino, mesaDestinoFull);

        return {
          ok: true,
          pedido_origen: pedidoOrigenFinal,
          pedido_destino: ordenDestino,
          mesa_origen: db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaOrigen.id),
          mesa_destino: mesaDestinoFull,
          items_unidos: itemsAMover.length
        };
      })();

      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  obtenerPedidosCocina(req, res) {
    try {
      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.estado IN ('ABIERTO', 'EN_PREPARACION', 'LISTO', 'CERRADO')
        ORDER BY p.created_at ASC
      `).all();

      const resultado = [];
      for (const pedido of pedidos) {
        pedido.items = db.prepare(`
          SELECT * FROM pedido_items
          WHERE pedido_id = ? AND estado != 'CANCELADO'
            AND (destino_impresion = 'cocina' OR destino_impresion = 'ambos' OR destino_impresion IS NULL)
        `).all(pedido.id);
        const tieneItemsPendientes = pedido.items.some(i => i.estado !== 'LISTO' && i.estado !== 'ENTREGADO');
        if (pedido.items.length > 0 && tieneItemsPendientes) resultado.push(pedido);
      }

      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerHistorialCocina(req, res) {
    try {
      const { fecha } = req.query;
      const d = fecha ? new Date(fecha + 'T00:00:00') : new Date();
      const ini = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' 00:00:00';
      const fin = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' 23:59:59';

      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre,
               (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.estado != 'CANCELADO'
                  AND (pi.destino_impresion = 'cocina' OR pi.destino_impresion = 'ambos' OR pi.destino_impresion IS NULL)) as total_items
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.created_at >= ? AND p.created_at <= ?
        ORDER BY p.updated_at DESC
      `).all(ini, fin);

      const resultado = [];
      for (const pedido of pedidos) {
        pedido.items = db.prepare(`
          SELECT * FROM pedido_items
          WHERE pedido_id = ? AND estado != 'CANCELADO'
            AND (destino_impresion = 'cocina' OR destino_impresion = 'ambos' OR destino_impresion IS NULL)
        `).all(pedido.id);
        
        if (pedido.items.length === 0) continue;
        const todosListos = pedido.items.every(i => i.estado === 'LISTO' || i.estado === 'ENTREGADO');
        if (todosListos) resultado.push(pedido);
      }

      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerPedidosBarra(req, res) {
    try {
      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.estado IN ('ABIERTO', 'EN_PREPARACION', 'LISTO', 'CERRADO')
        ORDER BY p.created_at ASC
      `).all();

      const resultado = [];
      for (const pedido of pedidos) {
        pedido.items = db.prepare(`
          SELECT * FROM pedido_items
          WHERE pedido_id = ? AND estado != 'CANCELADO'
            AND (destino_impresion = 'barra' OR destino_impresion = 'ambos')
        `).all(pedido.id);
        const tieneItemsPendientes = pedido.items.some(i => i.estado !== 'LISTO' && i.estado !== 'ENTREGADO');
        if (pedido.items.length > 0 && tieneItemsPendientes) resultado.push(pedido);
      }

      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerHistorialBarra(req, res) {
    try {
      const { fecha } = req.query;
      const d = fecha ? new Date(fecha + 'T00:00:00') : new Date();
      const ini = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' 00:00:00';
      const fin = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' 23:59:59';

      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre,
               (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id AND pi.estado != 'CANCELADO'
                  AND (pi.destino_impresion = 'barra' OR pi.destino_impresion = 'ambos')) as total_items
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.created_at >= ? AND p.created_at <= ?
        ORDER BY p.updated_at DESC
      `).all(ini, fin);

      const resultado = [];
      for (const pedido of pedidos) {
        pedido.items = db.prepare(`
          SELECT * FROM pedido_items
          WHERE pedido_id = ? AND estado != 'CANCELADO'
            AND (destino_impresion = 'barra' OR destino_impresion = 'ambos')
        `).all(pedido.id);

        if (pedido.items.length === 0) continue;
        const todosListos = pedido.items.every(i => i.estado === 'LISTO' || i.estado === 'ENTREGADO');
        if (todosListos) resultado.push(pedido);
      }

      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  buscarVale(req, res) {
    try {
      const { codigo } = req.query;
      if (!codigo) return res.status(400).json({ error: 'Código requerido' });
      const vale = db.prepare('SELECT * FROM vales WHERE codigo = ? AND activo = 1').get(codigo);
      if (!vale) return res.status(404).json({ error: 'Vale no encontrado o inactivo' });
      res.json(vale);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerPedidosActivos(req, res) {
    try {
      const { tipo } = req.query;
      let sql = `
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')
      `;
      const params = [];
      if (tipo) {
        sql += ' AND a.tipo = ?';
        params.push(tipo);
      }
      sql += ' ORDER BY p.created_at DESC';
      const pedidos = db.prepare(sql).all(...params);
      for (const pedido of pedidos) {
        pedido.items = db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(pedido.id);
      }
      res.json(pedidos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarCliente(req, res, io) {
    try {
      const { cliente_nombre, cliente_telefono, cliente_direccion, hora_recogida } = req.body;
      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (pedido.estado === 'CERRADO' || pedido.estado === 'CANCELADO') {
        return res.status(409).json({ error: 'El pedido ya está cerrado' });
      }

      db.prepare('UPDATE pedidos SET cliente_nombre = ?, cliente_telefono = ?, cliente_direccion = ?, hora_recogida = ? WHERE id = ?')
        .run(cliente_nombre != null ? cliente_nombre : pedido.cliente_nombre,
             cliente_telefono != null ? cliente_telefono : pedido.cliente_telefono,
             cliente_direccion != null ? cliente_direccion : pedido.cliente_direccion,
             hora_recogida != null ? hora_recogida : pedido.hora_recogida,
             pedido.id);

      const updated = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
      io.emit('pedido:actualizado', updated);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerPedidoPorId(req, res) {
    try {
      const pedido = this.pedidoRepo.obtenerPedidoCompletoPorId(req.params.id);
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      // Calculate totals using PagoService (the single source of truth)
      const pagoService = require('../services/PagoService');
      pedido.resumen_pago = pagoService.obtenerResumenPago(pedido.id);

      res.json(pedido);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  pagarPedido(req, res, io) {
    try {
      const { metodo, monto, usuario_id, referencia, notas, propina, imprimir_ticket = false } = req.body;
      if (!metodo || !pagos.esMetodoValido(metodo)) {
        return res.status(400).json({ error: 'Método de pago inválido o no habilitado' });
      }

      if (metodo !== 'regalo' && (monto == null || monto <= 0)) {
        return res.status(400).json({ error: 'Monto inválido' });
      }

      const result = db.transaction(() => {
        const sesionCaja = db.prepare("SELECT id FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
        if (!sesionCaja) {
          throw { status: 409, error: 'No hay caja abierta para cobrar. Abra la caja antes de registrar el pago', code: 'CAJA_CERRADA' };
        }

        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CERRADO') throw { status: 409, error: 'El pedido ya está cerrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido está cancelado' };

        const resumen = pagoService.obtenerResumenPago(req.params.id);
        const totalFinal = resumen.totalFinal;
        const pagadoAnterior = resumen.pagado;
        const pendiente = resumen.pendiente;
        if (metodo === 'regalo') {
          const pagoMonto = pendiente;
          db.prepare('INSERT INTO pagos (pedido_id, monto, metodo, propina, referencia, notas, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(req.params.id, pagoMonto, 'regalo', 0, referencia || null, notas || 'Regalo/Obsequio', usuario_id || null);
          const pagadoTotal = pagadoAnterior + pagoMonto;
          const fullyPaid = pagadoTotal >= totalFinal - 0.01;
          if (fullyPaid) {
            db.prepare("UPDATE pedidos SET estado = 'CERRADO', updated_at = datetime('now') WHERE id = ?")
              .run(req.params.id);
          }
          return { pedido, cambio: 0, pagadoTotal, pendiente: Math.max(0, totalFinal - pagadoTotal), fullyPaid };
        }

        if (metodo === 'vale') {
          if (monto > pendiente + 0.01) throw { status: 400, error: `El monto (S/${monto.toFixed(2)}) excede el pendiente (S/${pendiente.toFixed(2)})` };
          const valeRow = db.prepare('SELECT * FROM vales WHERE codigo = ? AND activo = 1').get(referencia);
          if (!valeRow) throw { status: 404, error: 'Vale no encontrado o inactivo' };
          if (valeRow.monto_restante < monto - 0.01) throw { status: 400, error: `El vale solo tiene S/${valeRow.monto_restante.toFixed(2)} disponibles` };

          db.prepare('UPDATE vales SET monto_restante = monto_restante - ? WHERE id = ?').run(monto, valeRow.id);
          db.prepare('INSERT INTO pagos (pedido_id, monto, metodo, propina, referencia, notas, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(req.params.id, monto, 'vale', 0, referencia, notas || `Vale ${referencia}`, usuario_id || null);
          const pagadoTotal = pagadoAnterior + monto;
          const fullyPaid = pagadoTotal >= totalFinal - 0.01;
          if (fullyPaid) {
            db.prepare("UPDATE pedidos SET estado = 'CERRADO', updated_at = datetime('now') WHERE id = ?")
              .run(req.params.id);
          }
          return { pedido, cambio: 0, pagadoTotal, pendiente: Math.max(0, totalFinal - pagadoTotal), fullyPaid };
        }

        if (monto > pendiente + 0.01) {
          throw { status: 400, error: `El monto (S/${monto.toFixed(2)}) excede el pendiente (S/${pendiente.toFixed(2)})` };
        }

        const propinaMonto = parseFloat(propina) || 0;
        db.prepare('INSERT INTO pagos (pedido_id, monto, metodo, propina, referencia, notas, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(req.params.id, monto, metodo, propinaMonto, referencia || null, notas || null, usuario_id || null);

        const pagadoTotal = pagadoAnterior + monto;
        const cambio = metodo === 'efectivo' ? Math.max(0, monto - pendiente) : 0;
        const fullyPaid = pagadoTotal >= totalFinal - 0.01;

        if (fullyPaid) {
          db.prepare("UPDATE pedidos SET estado = 'CERRADO', updated_at = datetime('now') WHERE id = ?")
            .run(req.params.id);
        }

        return { pedido, cambio, pagadoTotal, pendiente: Math.max(0, totalFinal - pagadoTotal), fullyPaid };
      })();

      const pedidoActualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      const mesaData = db.prepare(`
        SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
      `).get(pedidoActualizado.mesa_id);

      if (result.fullyPaid && mesaData?.es_virtual && mesaData.pedido_activo_id == pedidoActualizado.id) {
        db.prepare("UPDATE mesas SET estado = 'LIBRE', pedido_activo_id = NULL, updated_at = datetime('now') WHERE id = ?")
          .run(mesaData.id);
        mesaData.estado = 'LIBRE';
        mesaData.pedido_activo_id = null;
      }

      const pago = db.prepare('SELECT * FROM pagos WHERE pedido_id = ? ORDER BY id DESC LIMIT 1').get(req.params.id);

      io.emit('pedido:actualizado', pedidoActualizado);
      io.emit('mesa:updated', mesaData);

      if (result.fullyPaid && imprimir_ticket) {
        const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(req.params.id);
        printers.printTicket(pedidoActualizado, items, mesaData);
      }

      res.json({
        pedido: pedidoActualizado,
        pago,
        cambio: result.cambio,
        pagado_total: result.pagadoTotal,
        pendiente: result.pendiente,
        completado: result.fullyPaid
      });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  pagarPedidoDividido(req, res, io) {
    try {
      const {
        metodo,
        monto,
        monto_recibido,
        usuario_id,
        referencia,
        propina,
        tipo_division,
        items_pagados,
        persona,
        cuota_info,
        imprimir_ticket = true
      } = req.body;

      if (!metodo || !pagos.esMetodoValido(metodo)) {
        return res.status(400).json({ error: 'Método de pago inválido o no habilitado' });
      }

      const montoNum = parseFloat(monto);
      if (isNaN(montoNum) || montoNum <= 0) {
        return res.status(400).json({ error: 'Monto inválido' });
      }

      const result = db.transaction(() => {
        const sesionCaja = db.prepare("SELECT id FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
        if (!sesionCaja) {
          throw { status: 409, error: 'No hay caja abierta para cobrar. Abra la caja antes de registrar el pago', code: 'CAJA_CERRADA' };
        }

        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CERRADO') throw { status: 409, error: 'El pedido ya está cerrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido está cancelado' };

        const resumen = pagoService.obtenerResumenPago(req.params.id);
        const totalFinal = resumen.totalFinal;
        const pagadoAnterior = resumen.pagado;
        const pendiente = resumen.pendiente;
        if (montoNum > pendiente + 0.05) {
          throw { status: 400, error: `El monto (S/${montoNum.toFixed(2)}) excede el saldo pendiente (S/${pendiente.toFixed(2)})` };
        }

        let notasPago = '';
        if (tipo_division === 'items' && Array.isArray(items_pagados) && items_pagados.length > 0) {
          const descItems = items_pagados.map(i => `${i.cantidad || 1}x ${i.producto_nombre}`).join(', ');
          notasPago = `Pago dividido (${persona ? persona + ': ' : ''}${descItems})`;

          const updateItemPagado = db.prepare('UPDATE pedido_items SET cantidad_pagada = cantidad_pagada + ? WHERE id = ? AND pedido_id = ?');
          for (const it of items_pagados) {
            const curItem = db.prepare('SELECT id, cantidad, COALESCE(cantidad_pagada, 0) as cantidad_pagada FROM pedido_items WHERE id = ? AND pedido_id = ?').get(it.id, req.params.id);
            if (curItem) {
              const cantDisponible = curItem.cantidad - curItem.cantidad_pagada;
              if (cantDisponible <= 0) {
                throw { status: 400, error: `El producto "${it.producto_nombre || 'Seleccionado'}" ya ha sido pagado en su totalidad` };
              }
              const cantAPagar = Math.min(it.cantidad || 1, cantDisponible);
              updateItemPagado.run(cantAPagar, curItem.id, req.params.id);
            }
          }
        } else if (tipo_division === 'partes') {
          notasPago = `Pago dividido (${cuota_info || 'Parte'}${persona ? ' - ' + persona : ''})`;
        } else {
          notasPago = `Pago dividido ${persona ? 'por ' + persona : ''}`;
        }

        const propinaMonto = parseFloat(propina) || 0;
        db.prepare('INSERT INTO pagos (pedido_id, monto, metodo, propina, referencia, notas, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(req.params.id, montoNum, metodo, propinaMonto, referencia || null, notasPago, usuario_id || null);

        const pagadoTotal = pagadoAnterior + montoNum;
        const fullyPaid = pagadoTotal >= totalFinal - 0.01;
        const nuevoPendiente = Math.max(0, totalFinal - pagadoTotal);

        const recibido = parseFloat(monto_recibido) || montoNum;
        const cambio = metodo === 'efectivo' && recibido > montoNum ? Math.max(0, recibido - montoNum) : 0;

        if (fullyPaid) {
          db.prepare("UPDATE pedidos SET estado = 'CERRADO', updated_at = datetime('now') WHERE id = ?")
            .run(req.params.id);
        }

        return {
          pedido,
          cambio,
          pagadoTotal,
          pendiente: nuevoPendiente,
          fullyPaid,
          totalFinal
        };
      })();

      const pedidoActualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      const mesaData = db.prepare(`
        SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
      `).get(pedidoActualizado.mesa_id);

      if (result.fullyPaid && mesaData?.es_virtual && mesaData.pedido_activo_id == pedidoActualizado.id) {
        db.prepare("UPDATE mesas SET estado = 'LIBRE', pedido_activo_id = NULL, updated_at = datetime('now') WHERE id = ?")
          .run(mesaData.id);
        mesaData.estado = 'LIBRE';
        mesaData.pedido_activo_id = null;
      }

      const pago = db.prepare('SELECT * FROM pagos WHERE pedido_id = ? ORDER BY id DESC LIMIT 1').get(req.params.id);

      io.emit('pedido:actualizado', pedidoActualizado);
      io.emit('mesa:updated', mesaData);
      io.emit('caja:updated');

      if (imprimir_ticket) {
        const pagoInfo = {
          metodo,
          monto: montoNum,
          referencia: referencia || null,
          cambio: result.cambio
        };
        const infoDividido = {
          persona: persona || null,
          cuotaInfo: cuota_info || (tipo_division === 'partes' ? 'Cuota individual' : null),
          totalMesa: result.totalFinal,
          saldoPendiente: result.pendiente
        };
        printers.printTicketDividido(pedidoActualizado, items_pagados || [], pagoInfo, mesaData, infoDividido);
      }

      res.json({
        ok: true,
        pedido: pedidoActualizado,
        pago,
        cambio: result.cambio,
        pagado_total: result.pagadoTotal,
        pendiente: result.pendiente,
        completado: result.fullyPaid
      });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    }
  }

  actualizarEstadoPedido(req, res, io) {
    const { estado } = req.body;
    const validStates = ['ABIERTO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CERRADO', 'CANCELADO'];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Válidos: ${validStates.join(', ')}` });
    }

    try {
      db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?")
        .run(estado, req.params.id);

      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      const mesaData = pedido ? db.prepare(`
        SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
      `).get(pedido.mesa_id) : null;

      io.emit('pedido:actualizado', pedido);
      if (mesaData) io.emit('mesa:updated', mesaData);

      res.json(pedido);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarEstadoItemUnico(req, res, io) {
    const { estado } = req.body;
    const validStates = ['PENDIENTE', 'COCINANDO', 'LISTO', 'ENTREGADO', 'CANCELADO'];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    try {
      db.prepare('UPDATE pedido_items SET estado = ? WHERE id = ?')
        .run(estado, req.params.idItem);

      const item = db.prepare(`
        SELECT pi.*, p.mesa_id, p.mesa_numero
        FROM pedido_items pi
        JOIN pedidos p ON p.id = pi.pedido_id
        WHERE pi.id = ?
      `).get(req.params.idItem);

      if (item) {
        const allActiveItems = db.prepare("SELECT estado FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(item.pedido_id);
        if (allActiveItems.length > 0) {
          const allReady = allActiveItems.every(i => i.estado === 'LISTO' || i.estado === 'ENTREGADO');
          const anyCooking = allActiveItems.some(i => i.estado === 'COCINANDO');

          let nuevoEstadoPedido = null;
          if (allReady) nuevoEstadoPedido = 'LISTO';
          else if (anyCooking) nuevoEstadoPedido = 'EN_PREPARACION';

          if (nuevoEstadoPedido) {
            db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?").run(nuevoEstadoPedido, item.pedido_id);
          }
        }

        const pedidoActualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(item.pedido_id);
        const mesaData = pedidoActualizado ? db.prepare(`
          SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
        `).get(pedidoActualizado.mesa_id) : null;

        io.emit('pedido:actualizado', pedidoActualizado);
        if (mesaData) io.emit('mesa:updated', mesaData);
      }

      io.emit('item:actualizado', item);
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  reimprimirTicket(req, res) {
    try {
      const pedido = db.prepare(`
        SELECT p.*, m.numero as mesa_numero, m.nombre as mesa_nombre, a.tipo as area_tipo
        FROM pedidos p JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.id = ?
      `).get(req.params.id);

      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id);
      pedido.descuentos = db.prepare('SELECT * FROM descuentos WHERE pedido_id = ?').all(pedido.id);
      pedido.pagos = db.prepare('SELECT * FROM pagos WHERE pedido_id = ?').all(pedido.id);
      const result = printers.printTicket(pedido, items, { numero: pedido.mesa_numero, nombre: pedido.mesa_nombre, area_tipo: pedido.area_tipo });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  imprimirPrecuenta(req, res) {
    try {
      const pedido = db.prepare(`
        SELECT p.*, m.numero as mesa_numero, m.nombre as mesa_nombre, a.tipo as area_tipo
        FROM pedidos p JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.id = ?
      `).get(req.params.id);

      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      const items = db.prepare("SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'").all(pedido.id);
      pedido.descuentos = db.prepare('SELECT * FROM descuentos WHERE pedido_id = ?').all(pedido.id);

      const result = printers.printPrecuenta(pedido, items, { numero: pedido.mesa_numero, nombre: pedido.mesa_nombre, area_tipo: pedido.area_tipo });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  agregarDescuento(req, res, io) {
    try {
      const { tipo, valor, motivo, usuario_id } = req.body;
      if (!tipo || !['porcentaje', 'monto_fijo'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido (porcentaje o monto_fijo)' });
      }
      if (valor == null || valor <= 0) {
        return res.status(400).json({ error: 'Valor inválido' });
      }
      if (!motivo || !motivo.trim()) {
        return res.status(400).json({ error: 'Motivo del descuento es requerido' });
      }
      if (tipo === 'porcentaje' && valor > 100) {
        return res.status(400).json({ error: 'El porcentaje no puede ser mayor a 100' });
      }

      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
      if (pedido.estado === 'CERRADO') throw { status: 409, error: 'El pedido ya está cerrado' };

      db.prepare('INSERT INTO descuentos (pedido_id, tipo, valor, motivo, usuario_id) VALUES (?, ?, ?, ?, ?)')
        .run(req.params.id, tipo, valor, motivo.trim(), usuario_id || null);

      const descuentos = db.prepare('SELECT * FROM descuentos WHERE pedido_id = ?').all(req.params.id);
      io.emit('pedido:actualizado', db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id));

      const resumen_pago = pagoService.obtenerResumenPago(req.params.id);
      res.json({ ok: true, descuentos, resumen_pago });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  }

  eliminarDescuento(req, res, io) {
    try {
      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (pedido.estado === 'CERRADO') return res.status(409).json({ error: 'El pedido ya está cerrado' });

      db.prepare('DELETE FROM descuentos WHERE id = ? AND pedido_id = ?').run(req.params.descId, req.params.id);
      io.emit('pedido:actualizado', db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id));
      
      const descuentos = db.prepare('SELECT * FROM descuentos WHERE pedido_id = ?').all(req.params.id);
      const resumen_pago = pagoService.obtenerResumenPago(req.params.id);
      res.json({ ok: true, descuentos, resumen_pago });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new PedidoController();
module.exports.PedidoController = PedidoController;


