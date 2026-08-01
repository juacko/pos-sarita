const { Router } = require('express');
const db = require('../db');
const printers = require('../printers');

function createPedidosRouter(io) {
  const router = Router();

  router.get('/', (req, res) => {
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
  });

  router.post('/', (req, res) => {
    try {
      const { mesa_id, mesero_id, items, nota, cliente_nombre, cliente_telefono, cliente_direccion, hora_recogida } = req.body;
      if (!mesa_id || !items || !items.length) {
        return res.status(400).json({ error: 'mesa_id e items son requeridos' });
      }

      const pedido = db.transaction(() => {
        const mesa = db.prepare('SELECT numero, nombre, estado FROM mesas WHERE id = ?').get(mesa_id);
        if (!mesa) throw { status: 404, error: 'Mesa no encontrada' };

        const mesero = mesero_id
          ? db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(mesero_id)
          : null;

        const result = db.prepare(`
          INSERT INTO pedidos (mesa_id, mesa_numero, mesero_id, mesero_nombre, estado, nota, cliente_nombre, cliente_telefono, cliente_direccion, hora_recogida)
          VALUES (?, ?, ?, ?, 'ABIERTO', ?, ?, ?, ?, ?)
        `).run(mesa_id, mesa.numero || mesa.nombre, mesero_id || null, mesero?.nombre || null, nota || null,
          cliente_nombre || null, cliente_telefono || null, cliente_direccion || null, hora_recogida || null);

        const pedidoId = result.lastInsertRowid;
        let total = 0;

        const insertItem = db.prepare(`
          INSERT INTO pedido_items (pedido_id, producto_id, producto_nombre, cantidad, precio_unitario,
            precio_adicional, notas, variante_id, variante_nombre, modificadores_json, agregados_json, detalle)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of items) {
          const precioBase = item.precio || 0;
          const precioAdic = item.precio_adicional || 0;
          insertItem.run(
            pedidoId, item.producto_id || null, item.nombre, item.cantidad, precioBase,
            precioAdic, item.notas || null,
            item.variante_id || null, item.variante_nombre || null,
            JSON.stringify(item.modificadores || []),
            JSON.stringify(item.agregados || []),
            item.detalle || ''
          );
          total += item.cantidad * (precioBase + precioAdic);
        }

        db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(total, pedidoId);

        if (mesa.estado === 'LIBRE') {
          db.prepare(`
            UPDATE mesas SET estado = 'OCUPADO', pedido_activo_id = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(pedidoId, mesa_id);
        } else {
          db.prepare('UPDATE mesas SET pedido_activo_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .run(pedidoId, mesa_id);
        }

        return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
      })();

      const itemsData = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id);
      const mesaData = db.prepare(`
        SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
      `).get(mesa_id);

      io.emit('pedido:nuevo', { pedido, items: itemsData });
      io.emit('mesa:updated', mesaData);

      printers.printComanda(pedido, itemsData, mesaData);

      res.status(201).json({ pedido, items: itemsData });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  router.post('/:id/items', (req, res) => {
    try {
      const { items, nota } = req.body;
      if (!items || !items.length) {
        return res.status(400).json({ error: 'items son requeridos' });
      }

      const result = db.transaction(() => {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido está cancelado' };

        const mesa = db.prepare(`
          SELECT m.*, a.tipo as area_tipo FROM mesas m LEFT JOIN areas a ON a.id = m.area_id WHERE m.id = ?
        `).get(pedido.mesa_id);

        const insertItem = db.prepare(`
          INSERT INTO pedido_items (pedido_id, producto_id, producto_nombre, cantidad, precio_unitario,
            precio_adicional, notas, variante_id, variante_nombre, modificadores_json, agregados_json, detalle)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let total = 0;
        for (const item of items) {
          const precioBase = item.precio || 0;
          const precioAdic = item.precio_adicional || 0;
          insertItem.run(
            req.params.id, item.producto_id || null, item.nombre, item.cantidad, precioBase,
            precioAdic, item.notas || null,
            item.variante_id || null, item.variante_nombre || null,
            JSON.stringify(item.modificadores || []),
            JSON.stringify(item.agregados || []),
            item.detalle || ''
          );
          total += item.cantidad * (precioBase + precioAdic);
        }

        db.prepare('UPDATE pedidos SET total = total + ?, updated_at = datetime(\'now\') WHERE id = ?').run(total, req.params.id);

        const itemsData = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(req.params.id);
        const pedidoActualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);

        if (nota) {
          db.prepare('UPDATE pedidos SET nota = ? WHERE id = ?').run(nota, req.params.id);
        }

        io.emit('pedido:actualizado', pedidoActualizado);

        printers.printComanda(pedidoActualizado, itemsData, mesa);

        return { pedido: pedidoActualizado, items: itemsData };
      })();

      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  router.get('/cocina', (req, res) => {
    try {
      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre, a.tipo as area_tipo, a.nombre as area_nombre
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        LEFT JOIN areas a ON a.id = m.area_id
        WHERE p.estado IN ('ABIERTO', 'EN_PREPARACION')
        ORDER BY p.created_at ASC
      `).all();

      for (const pedido of pedidos) {
        pedido.items = db.prepare(`
          SELECT * FROM pedido_items WHERE pedido_id = ? AND estado != 'CANCELADO'
        `).all(pedido.id);
      }

      res.json(pedidos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/vales/buscar', (req, res) => {
    try {
      const { codigo } = req.query;
      if (!codigo) return res.status(400).json({ error: 'Código requerido' });
      const vale = db.prepare('SELECT * FROM vales WHERE codigo = ? AND activo = 1').get(codigo);
      if (!vale) return res.status(404).json({ error: 'Vale no encontrado o inactivo' });
      res.json(vale);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/activos', (req, res) => {
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
  });

  router.patch('/:id/cliente', (req, res) => {
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
  });

  router.get('/:id', (req, res) => {
    try {
      const pedido = db.prepare(`
        SELECT p.*, m.numero as mesa_numero, m.nombre as mesa_nombre
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
        WHERE p.id = ?
      `).get(req.params.id);

      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

      pedido.items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedido.id);
      pedido.pagos = db.prepare(`
        SELECT pg.*, u.nombre as usuario_nombre
        FROM pagos pg
        LEFT JOIN usuarios u ON u.id = pg.usuario_id
        WHERE pg.pedido_id = ?
        ORDER BY pg.created_at
      `).all(pedido.id);
      pedido.descuentos = db.prepare(`
        SELECT d.*, u.nombre as usuario_nombre
        FROM descuentos d
        LEFT JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.pedido_id = ?
        ORDER BY d.created_at
      `).all(pedido.id);

      res.json(pedido);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/pagar', (req, res) => {
    try {
      const { metodo, monto, usuario_id, referencia, notas, propina } = req.body;
      const metodosValidos = ['efectivo', 'tarjeta', 'transferencia', 'otros', 'regalo', 'vale'];

      if (!metodo || !metodosValidos.includes(metodo)) {
        return res.status(400).json({ error: 'Método de pago inválido' });
      }
      if (metodo !== 'regalo' && (monto == null || monto <= 0)) {
        return res.status(400).json({ error: 'Monto inválido' });
      }

      const result = db.transaction(() => {
        const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
        if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };
        if (pedido.estado === 'CERRADO') throw { status: 409, error: 'El pedido ya está cerrado' };
        if (pedido.estado === 'CANCELADO') throw { status: 409, error: 'El pedido está cancelado' };

        const descuentoRow = db.prepare('SELECT COALESCE(SUM(CASE WHEN tipo = \'porcentaje\' THEN 0 ELSE valor END), 0) as fijo, SUM(CASE WHEN tipo = \'porcentaje\' THEN valor ELSE 0 END) as pct FROM descuentos WHERE pedido_id = ?').get(req.params.id);
        const descuentoPorcentaje = descuentoRow.pct || 0;
        const descuentoFijo = descuentoRow.fijo || 0;
        const totalBruto = pedido.total;
        const totalConDescuento = totalBruto * (1 - descuentoPorcentaje / 100) - descuentoFijo;
        const totalFinal = Math.max(0, totalConDescuento);

        const pagadoAnterior = db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE pedido_id = ?')
          .get(req.params.id).total;
        const pendiente = totalFinal - pagadoAnterior;

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
          if (monto > pendiente + 0.01) throw { status: 400, error: `El monto ($${monto.toFixed(2)}) excede el pendiente ($${pendiente.toFixed(2)})` };
          const valeRow = db.prepare('SELECT * FROM vales WHERE codigo = ? AND activo = 1').get(referencia);
          if (!valeRow) throw { status: 404, error: 'Vale no encontrado o inactivo' };
          if (valeRow.monto_restante < monto - 0.01) throw { status: 400, error: `El vale solo tiene $${valeRow.monto_restante.toFixed(2)} disponibles` };

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
          throw { status: 400, error: `El monto ($${monto.toFixed(2)}) excede el pendiente ($${pendiente.toFixed(2)})` };
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

      // Si el pedido quedó pagado sobre una mesa virtual, liberarla para reutilizarla
      if (result.fullyPaid && mesaData?.es_virtual && mesaData.pedido_activo_id == pedidoActualizado.id) {
        db.prepare("UPDATE mesas SET estado = 'LIBRE', pedido_activo_id = NULL, updated_at = datetime('now') WHERE id = ?")
          .run(mesaData.id);
        mesaData.estado = 'LIBRE';
        mesaData.pedido_activo_id = null;
      }

      const pago = db.prepare('SELECT * FROM pagos WHERE pedido_id = ? ORDER BY id DESC LIMIT 1').get(req.params.id);

      io.emit('pedido:actualizado', pedidoActualizado);
      io.emit('mesa:updated', mesaData);

      if (result.fullyPaid) {
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
  });

  router.patch('/:id/estado', (req, res) => {
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
  });

  router.patch('/items/:idItem/estado', (req, res) => {
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

      io.emit('item:actualizado', item);
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/reimprimir', (req, res) => {
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
  });

  router.post('/:id/precuenta', (req, res) => {
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
  });

  router.post('/:id/descuento', (req, res) => {
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

      res.json({ ok: true, descuentos });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  router.delete('/:id/descuento/:descId', (req, res) => {
    try {
      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (pedido.estado === 'CERRADO') return res.status(409).json({ error: 'El pedido ya está cerrado' });

      db.prepare('DELETE FROM descuentos WHERE id = ? AND pedido_id = ?').run(req.params.descId, req.params.id);
      io.emit('pedido:actualizado', db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createPedidosRouter;
