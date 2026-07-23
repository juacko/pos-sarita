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
      const { mesa_id, mesero_id, items, nota } = req.body;
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
          INSERT INTO pedidos (mesa_id, mesa_numero, mesero_id, mesero_nombre, estado, nota)
          VALUES (?, ?, ?, ?, 'ABIERTO', ?)
        `).run(mesa_id, mesa.numero || mesa.nombre, mesero_id || null, mesero?.nombre || null, nota || null);

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
      const mesaData = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesa_id);

      io.emit('pedido:nuevo', { pedido, items: itemsData });
      io.emit('mesa:updated', mesaData);

      printers.printComanda(pedido, itemsData, mesaData);

      res.status(201).json({ pedido, items: itemsData });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    }
  });

  router.get('/cocina', (req, res) => {
    try {
      const pedidos = db.prepare(`
        SELECT p.*, m.nombre as mesa_nombre
        FROM pedidos p
        JOIN mesas m ON m.id = p.mesa_id
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

  router.patch('/:id/estado', (req, res) => {
    const { estado } = req.body;
    const validStates = ['ABIERTO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CERRADO', 'CANCELADO'];

    if (!validStates.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Válidos: ${validStates.join(', ')}` });
    }

    try {
      db.transaction(() => {
        db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?")
          .run(estado, req.params.id);

        if (estado === 'CERRADO' || estado === 'CANCELADO') {
          const pedido = db.prepare('SELECT mesa_id FROM pedidos WHERE id = ?').get(req.params.id);
          if (pedido) {
            const otrosActivos = db.prepare(
              "SELECT COUNT(*) as c FROM pedidos WHERE mesa_id = ? AND id != ? AND estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')"
            ).get(pedido.mesa_id, req.params.id);

            if (otrosActivos.c === 0) {
              db.prepare("UPDATE mesas SET estado = 'LIBRE', mesero_id = NULL, mesero_nombre = NULL, pedido_activo_id = NULL, ocupado_desde = NULL, updated_at = datetime('now') WHERE id = ?")
                .run(pedido.mesa_id);
            }
          }
        }
      })();

      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(req.params.id);
      const mesaData = pedido ? db.prepare('SELECT * FROM mesas WHERE id = ?').get(pedido.mesa_id) : null;

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

  return router;
}

module.exports = createPedidosRouter;
