const { Router } = require('express');
const db = require('../db');
const { acquireTableLock, releaseTableLock } = require('../table-lock');

function createMesasRouter(io) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const mesas = db.prepare(`
    SELECT m.*, a.nombre as area_nombre, a.tipo as area_tipo, a.orden as area_orden,
          (SELECT COUNT(*) FROM pedidos WHERE mesa_id = m.id AND estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')) as tiene_pedido_activo,
          CASE WHEN EXISTS (
            SELECT 1 FROM pedidos p
            WHERE p.mesa_id = m.id AND p.estado = 'CERRADO'
            AND (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) >= p.total - 0.01
            AND p.id = m.pedido_activo_id
          ) THEN 1 ELSE 0 END as pedido_pagado,
          (SELECT CASE 
            WHEN EXISTS (
              SELECT 1 FROM pedidos p
              WHERE p.mesa_id = m.id AND p.estado = 'CERRADO'
              AND (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) >= p.total - 0.01
            ) THEN 'PAGADO'
            ELSE m.estado
          END) as estado_ejefe
          FROM mesas m LEFT JOIN areas a ON a.id = m.area_id
          ORDER BY COALESCE(a.orden, 99), a.id, m.numero
      `).all();
      res.json(mesas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── ÁREAS ───
  router.get('/areas', (req, res) => {
    try {
      const areas = db.prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM mesas m WHERE m.area_id = a.id AND m.es_virtual = 0) as mesas_total,
          (SELECT COUNT(*) FROM mesas m WHERE m.area_id = a.id AND m.es_virtual = 1) as virtuales_total
        FROM areas a ORDER BY a.orden ASC
      `).all();
      res.json(areas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/areas', (req, res) => {
    try {
      const { nombre, tipo, orden } = req.body;
      const tiposValidos = ['SALON', 'DELIVERY', 'PARA_LLEVAR'];
      if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Nombre del área es requerido' });
      if (!tiposValidos.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });

      const ordenF = orden != null ? orden : db.prepare('SELECT COALESCE(MAX(orden), 0) + 1 as n FROM areas').get().n;
      const r = db.prepare('INSERT INTO areas (nombre, tipo, orden) VALUES (?, ?, ?)').run(nombre.trim(), tipo, ordenF);
      res.status(201).json(db.prepare('SELECT * FROM areas WHERE id = ?').get(r.lastInsertRowid));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/areas/:id', (req, res) => {
    try {
      const { nombre, tipo, orden, activo } = req.body;
      const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(req.params.id);
      if (!area) return res.status(404).json({ error: 'Área no encontrada' });

      const tiposValidos = ['SALON', 'DELIVERY', 'PARA_LLEVAR'];
      if (nombre !== undefined && !nombre.trim()) return res.status(400).json({ error: 'Nombre del área es requerido' });
      if (tipo !== undefined && !tiposValidos.includes(tipo)) return res.status(400).json({ error: 'Tipo inválido' });
      if (activo !== undefined && area.tipo === 'SALON' && !activo) {
        const otrosSalones = db.prepare("SELECT COUNT(*) as c FROM areas WHERE tipo = 'SALON' AND id != ? AND activo = 1").get(area.id).c;
        if (otrosSalones === 0) return res.status(409).json({ error: 'Debe existir al menos un área de Salón activa' });
      }

      db.prepare('UPDATE areas SET nombre = ?, tipo = ?, orden = ?, activo = ? WHERE id = ?')
        .run(
          nombre?.trim() || area.nombre,
          tipo || area.tipo,
          orden != null ? orden : area.orden,
          activo !== undefined ? (activo ? 1 : 0) : area.activo,
          area.id
        );
      res.json(db.prepare('SELECT * FROM areas WHERE id = ?').get(area.id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/areas/:id', (req, res) => {
    try {
      const area = db.prepare('SELECT * FROM areas WHERE id = ?').get(req.params.id);
      if (!area) return res.status(404).json({ error: 'Área no encontrada' });

      const otrosSalones = db.prepare("SELECT COUNT(*) as c FROM areas WHERE tipo = 'SALON' AND id != ?").get(area.id).c;
      if (area.tipo === 'SALON' && otrosSalones === 0) {
        return res.status(409).json({ error: 'Debe existir al menos un área de Salón' });
      }

      // Reasignar mesas a otro salón
      const destino = db.prepare("SELECT id FROM areas WHERE id != ? AND tipo = 'SALON' ORDER BY orden ASC LIMIT 1").get(area.id);
      if (destino) {
        db.prepare('UPDATE mesas SET area_id = ? WHERE area_id = ?').run(destino.id, area.id);
      } else {
        db.prepare('UPDATE mesas SET area_id = NULL WHERE area_id = ?').run(area.id);
      }

      db.prepare('DELETE FROM areas WHERE id = ?').run(area.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/virtual', (req, res) => {
    try {
      const { tipo } = req.body;
      if (!['DELIVERY', 'PARA_LLEVAR'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido (DELIVERY o PARA_LLEVAR)' });
      }
      const area = db.prepare('SELECT id FROM areas WHERE tipo = ?').get(tipo);
      if (!area) return res.status(404).json({ error: `No existe área de tipo ${tipo}` });

      const base = tipo === 'DELIVERY' ? 899 : 949;
      const maxNum = db.prepare('SELECT COALESCE(MAX(numero), ?) as n FROM mesas WHERE es_virtual = 1').get(base);
      const nombre = tipo === 'DELIVERY' ? 'Delivery' : 'Para Llevar';
      const r = db.prepare("INSERT INTO mesas (numero, nombre, estado, es_virtual, area_id) VALUES (?, ?, 'LIBRE', 1, ?)")
        .run(maxNum.n + 1, nombre, area.id);
      res.status(201).json(db.prepare('SELECT * FROM mesas WHERE id = ?').get(r.lastInsertRowid));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/area', (req, res) => {
    try {
      const { area_id } = req.body;
      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(req.params.id);
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
      if (mesa.es_virtual) return res.status(409).json({ error: 'Las mesas virtuales no cambian de área' });

      const area = db.prepare("SELECT * FROM areas WHERE id = ? AND tipo = 'SALON'").get(area_id);
      if (!area) return res.status(400).json({ error: 'Área de salón inválida' });

      db.prepare('UPDATE mesas SET area_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(area_id, mesa.id);
      const mesaUpdated = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesa.id);
      io.emit('mesa:updated', mesaUpdated);
      res.json(mesaUpdated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(req.params.id);
      if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
      res.json(mesa);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/tomar', (req, res) => {
    const mesaId = parseInt(req.params.id);
    const { mesero_id } = req.body;

    if (!mesero_id) {
      return res.status(400).json({ error: 'mesero_id es requerido' });
    }

    const mesero = db.prepare('SELECT id, nombre FROM usuarios WHERE id = ? AND activo = 1').get(mesero_id);
    if (!mesero) {
      return res.status(400).json({ error: 'Mesero no encontrado o inactivo' });
    }

    const lockAcquired = acquireTableLock(mesaId, mesero_id)
      .catch(e => e);

    if (lockAcquired instanceof Error) {
      const err = lockAcquired;
      return res.status(409).json({
        error: err.error,
        code: err.code
      });
    }

    try {
      const result = db.transaction(() => {
        const mesa = db.prepare('SELECT estado, version FROM mesas WHERE id = ?').get(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };
        if (mesa.estado !== 'LIBRE') {
          throw { status: 409, error: `Mesa en estado ${mesa.estado}`, code: 'NOT_AVAILABLE' };
        }

        const info = db.prepare(`
          UPDATE mesas SET
            estado = 'OCUPADO',
            mesero_id = ?,
            mesero_nombre = ?,
            ocupado_desde = datetime('now'),
            version = version + 1,
            updated_at = datetime('now')
          WHERE id = ? AND version = ? AND estado = 'LIBRE'
        `).run(mesero_id, mesero.nombre, mesaId, mesa.version);

        if (info.changes === 0) {
          throw { status: 409, error: 'Conflicto: mesa fue modificada por otro usuario', code: 'VERSION_CONFLICT' };
        }

        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'TOMADA', ?, ?)
        `).run(mesaId, mesero_id, `Mesa tomada por ${mesero.nombre}`);

        return db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
      })();

      io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    } finally {
      releaseTableLock(mesaId);
    }
  });

  router.post('/:id/liberar', (req, res) => {
    const mesaId = parseInt(req.params.id);
    const { mesero_id } = req.body;

    if (!mesero_id) return res.status(400).json({ error: 'mesero_id es requerido' });

    const lockAcquired = acquireTableLock(mesaId, mesero_id)
      .catch(e => e);
    if (lockAcquired instanceof Error) {
      const err = lockAcquired;
      return res.status(409).json({ error: err.error, code: err.code });
    }

    try {
      const result = db.transaction(() => {
        const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };

        if (mesa.mesero_id !== mesero_id) {
          const usuario = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(mesero_id);
          if (!usuario || usuario.rol !== 'admin') {
            throw { status: 403, error: 'Solo el mesero asignado o un admin pueden liberar esta mesa' };
          }
        }

        if (mesa.estado !== 'OCUPADO' && mesa.estado !== 'CERRANDO') {
          throw { status: 409, error: `No se puede liberar una mesa en estado ${mesa.estado}` };
        }

        const pedidoActivo = db.prepare(
          "SELECT id FROM pedidos WHERE mesa_id = ? AND estado IN ('ABIERTO','EN_PREPARACION','LISTO')"
        ).get(mesaId);
        if (pedidoActivo) {
          throw { status: 409, error: 'Hay un pedido activo. Cierre el pedido antes de liberar la mesa' };
        }

        const info = db.prepare(`
          UPDATE mesas SET
            estado = 'LIBRE',
            mesero_id = NULL,
            mesero_nombre = NULL,
            pedido_activo_id = NULL,
            ocupado_desde = NULL,
            version = version + 1,
            updated_at = datetime('now')
          WHERE id = ? AND version = ?
        `).run(mesaId, mesa.version);

        if (info.changes === 0) {
          throw { status: 409, error: 'Conflicto de versión', code: 'VERSION_CONFLICT' };
        }

        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'LIBERADA', ?, 'Mesa liberada')
        `).run(mesaId, mesero_id);

        return db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
      })();

      io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    } finally {
      releaseTableLock(mesaId);
    }
  });

  router.post('/:id/reservar', (req, res) => {
    const mesaId = parseInt(req.params.id);
    const { mesero_id, cliente_nombre, hora } = req.body;

    if (!mesero_id || !cliente_nombre) {
      return res.status(400).json({ error: 'mesero_id y cliente_nombre son requeridos' });
    }

    const lockAcquired = acquireTableLock(mesaId, mesero_id)
      .catch(e => e);
    if (lockAcquired instanceof Error) {
      return res.status(409).json({ error: lockAcquired.error, code: lockAcquired.code });
    }

    try {
      const result = db.transaction(() => {
        const mesa = db.prepare('SELECT estado, version FROM mesas WHERE id = ?').get(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };
        if (mesa.estado !== 'LIBRE') {
          throw { status: 409, error: `Mesa en estado ${mesa.estado}`, code: 'NOT_AVAILABLE' };
        }

        const mesero = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(mesero_id);
        const info = db.prepare(`
          UPDATE mesas SET
            estado = 'RESERVADO',
            mesero_id = ?,
            mesero_nombre = ?,
            version = version + 1,
            updated_at = datetime('now')
          WHERE id = ? AND version = ? AND estado = 'LIBRE'
        `).run(mesero_id, mesero?.nombre || '', mesaId, mesa.version);

        if (info.changes === 0) {
          throw { status: 409, error: 'Conflicto de versión', code: 'VERSION_CONFLICT' };
        }

        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'RESERVADA', ?, ?)
        `).run(mesaId, mesero_id, `Reservada para ${cliente_nombre} a las ${hora || 'N/A'}`);

        return db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
      })();

      io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message, code: err.code });
    } finally {
      releaseTableLock(mesaId);
    }
  });

  router.post('/:id/transferir', (req, res) => {
    const mesaId = parseInt(req.params.id);
    const { mesero_id, nuevo_mesero_id } = req.body;

    if (!mesero_id || !nuevo_mesero_id) {
      return res.status(400).json({ error: 'mesero_id y nuevo_mesero_id son requeridos' });
    }

    const nuevoMesero = db.prepare('SELECT id, nombre FROM usuarios WHERE id = ? AND activo = 1').get(nuevo_mesero_id);
    if (!nuevoMesero) {
      return res.status(400).json({ error: 'Nuevo mesero no encontrado o inactivo' });
    }

    const lockAcquired = acquireTableLock(mesaId, mesero_id)
      .catch(e => e);
    if (lockAcquired instanceof Error) {
      return res.status(409).json({ error: lockAcquired.error, code: lockAcquired.code });
    }

    try {
      const result = db.transaction(() => {
        const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
        if (!mesa) throw { status: 404, error: 'Mesa no existe' };

        const usuario = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(mesero_id);
        if (mesa.mesero_id !== mesero_id && (!usuario || usuario.rol !== 'admin')) {
          throw { status: 403, error: 'No autorizado para transferir esta mesa' };
        }

        db.prepare(`
          UPDATE mesas SET
            mesero_id = ?,
            mesero_nombre = ?,
            version = version + 1,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(nuevo_mesero_id, nuevoMesero.nombre, mesaId);

        db.prepare(`
          INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
          VALUES (?, 'TRANSFERIDA', ?, ?)
        `).run(mesaId, mesero_id, `Transferida a ${nuevoMesero.nombre}`);

        return db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
      })();

      io.emit('mesa:updated', result);
      res.json(result);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ error: err.error || err.message });
    } finally {
      releaseTableLock(mesaId);
    }
  });

  router.post('/:id/inactivar', (req, res) => {
    const mesaId = parseInt(req.params.id);
    const { mesero_id } = req.body;

    const usuario = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(mesero_id);
    if (!usuario || usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden inactivar mesas' });
    }

    try {
      db.prepare(`
        UPDATE mesas SET estado = 'INACTIVO', version = version + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(mesaId);

      const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
      io.emit('mesa:updated', mesa);
      res.json(mesa);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/logs', (req, res) => {
    try {
      const logs = db.prepare(`
        SELECT l.*, u.nombre as mesero_nombre
        FROM logs_mesas l
        LEFT JOIN usuarios u ON u.id = l.mesero_id
        WHERE l.mesa_id = ?
        ORDER BY l.created_at DESC LIMIT 50
      `).all(req.params.id);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createMesasRouter;
