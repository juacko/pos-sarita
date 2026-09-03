const defaultDb = require('../db');

class MesaRepository {
  constructor(db = defaultDb) {
    this.db = db;
  }

  obtenerMesas() {
    return this.db.prepare(`
    SELECT m.*, a.nombre as area_nombre, a.tipo as area_tipo, a.orden as area_orden,
          (SELECT COUNT(*) FROM pedidos WHERE mesa_id = m.id AND estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')) as tiene_pedido_activo,
          (SELECT total FROM pedidos WHERE id = m.pedido_activo_id) as pedido_total,
          (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = m.pedido_activo_id) as pedido_pagado,
          (SELECT MAX(pg.created_at) FROM pagos pg WHERE pg.pedido_id = m.pedido_activo_id) as pagado_desde,
          (SELECT COALESCE(SUM(CASE WHEN d.tipo = 'porcentaje' THEN (p.total * d.valor / 100) ELSE d.valor END), 0)
            FROM descuentos d JOIN pedidos p ON p.id = d.pedido_id WHERE d.pedido_id = m.pedido_activo_id) as pedido_descuento,
          CASE WHEN EXISTS (
            SELECT 1 FROM pedidos p
            WHERE p.mesa_id = m.id AND p.estado = 'CERRADO'
            AND (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) >= p.total - 0.01
            AND p.id = m.pedido_activo_id
          ) THEN 1 ELSE 0 END as pedido_pagado,
          (SELECT CASE 
            WHEN EXISTS (
              SELECT 1 FROM pedidos p
              WHERE p.id = m.pedido_activo_id AND p.estado = 'CERRADO'
              AND (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos pg WHERE pg.pedido_id = p.id) >= p.total - 0.01
            ) THEN 'PAGADO'
            ELSE m.estado
          END) as estado_ejefe,
          (CASE WHEN m.estado = 'OCUPADO' AND NOT EXISTS (
            SELECT 1 FROM pedidos p WHERE p.mesa_id = m.id AND p.estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')
          ) THEN CAST((julianday('now') - julianday(COALESCE(m.ocupado_desde, m.updated_at))) * 1440 AS INTEGER)
          ELSE NULL END) as minutos_sin_pedido
          FROM mesas m LEFT JOIN areas a ON a.id = m.area_id
          ORDER BY COALESCE(a.orden, 99), a.id, m.numero
      `).all();
  }

  obtenerAreas() {
    return this.db.prepare(`
        SELECT a.*,
          (SELECT COUNT(*) FROM mesas m WHERE m.area_id = a.id AND m.es_virtual = 0) as mesas_total,
          (SELECT COUNT(*) FROM mesas m WHERE m.area_id = a.id AND m.es_virtual = 1) as virtuales_total
        FROM areas a ORDER BY a.orden ASC
      `).all();
  }

  // Métodos de compatibilidad para tests existentes
  obtenerTodas() {
    return this.obtenerMesas();
  }

  actualizarEstado(id, estado, meseroId = null, meseroNombre = null, pedidoActivoId = null) {
    this.db.prepare(`
      UPDATE mesas
      SET estado = ?, mesero_id = ?, mesero_nombre = ?, pedido_activo_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(estado, meseroId, meseroNombre, pedidoActivoId, id);
    return this.obtenerMesaPorId(id);
  }

  liberarMesa(id) {
    this.db.prepare(`
      UPDATE mesas
      SET estado = 'LIBRE', mesero_id = NULL, mesero_nombre = NULL, pedido_activo_id = NULL, ocupado_desde = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
    return this.obtenerMesaPorId(id);
  }

  getMaxOrdenArea() {
    return this.db.prepare('SELECT COALESCE(MAX(orden), 0) + 1 as n FROM areas').get().n;
  }

  crearArea(nombre, tipo, orden) {
    const r = this.db.prepare('INSERT INTO areas (nombre, tipo, orden) VALUES (?, ?, ?)').run(nombre, tipo, orden);
    return this.obtenerAreaPorId(r.lastInsertRowid);
  }

  obtenerAreaPorId(id) {
    return this.db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
  }

  contarOtrosSalonesActivos(id) {
    return this.db.prepare("SELECT COUNT(*) as c FROM areas WHERE tipo = 'SALON' AND id != ? AND activo = 1").get(id).c;
  }

  actualizarArea(id, nombre, tipo, orden, activo) {
    this.db.prepare('UPDATE areas SET nombre = ?, tipo = ?, orden = ?, activo = ? WHERE id = ?')
      .run(nombre, tipo, orden, activo, id);
    return this.obtenerAreaPorId(id);
  }

  contarOtrosSalones(id) {
    return this.db.prepare("SELECT COUNT(*) as c FROM areas WHERE tipo = 'SALON' AND id != ?").get(id).c;
  }

  reasignarMesasYEliminarArea(id) {
    const destino = this.db.prepare("SELECT id FROM areas WHERE id != ? AND tipo = 'SALON' ORDER BY orden ASC LIMIT 1").get(id);
    if (destino) {
      this.db.prepare('UPDATE mesas SET area_id = ? WHERE area_id = ?').run(destino.id, id);
    } else {
      this.db.prepare('UPDATE mesas SET area_id = NULL WHERE area_id = ?').run(id);
    }
    this.db.prepare('DELETE FROM areas WHERE id = ?').run(id);
  }

  getMaxNumeroMesaNormal() {
    return this.db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 as n FROM mesas WHERE es_virtual = 0').get().n;
  }

  existeMesaNormal(numero, excluyendoId = null) {
    if (excluyendoId) {
      return this.db.prepare('SELECT id FROM mesas WHERE numero = ? AND es_virtual = 0 AND id != ?').get(numero, excluyendoId);
    }
    return this.db.prepare('SELECT id FROM mesas WHERE numero = ? AND es_virtual = 0').get(numero);
  }

  obtenerAreaSalon(id) {
    return this.db.prepare("SELECT id FROM areas WHERE id = ? AND tipo = 'SALON'").get(id);
  }

  crearMesa(numero, nombre, capacidad, area_id, estado) {
    const r = this.db.prepare('INSERT INTO mesas (numero, nombre, capacidad, area_id, es_virtual, estado) VALUES (?, ?, ?, ?, 0, ?)')
      .run(numero, nombre, capacidad, area_id, estado);
    return this.obtenerMesaPorId(r.lastInsertRowid);
  }

  obtenerMesaPorId(id) {
    return this.db.prepare('SELECT * FROM mesas WHERE id = ?').get(id);
  }

  obtenerAreaPorTipo(tipo) {
    return this.db.prepare('SELECT id FROM areas WHERE tipo = ?').get(tipo);
  }

  getMaxNumeroMesaVirtual(base) {
    return this.db.prepare('SELECT COALESCE(MAX(numero), ?) as n FROM mesas WHERE es_virtual = 1').get(base);
  }

  crearMesaVirtual(numero, nombre, area_id) {
    const r = this.db.prepare("INSERT INTO mesas (numero, nombre, estado, es_virtual, area_id) VALUES (?, ?, 'LIBRE', 1, ?)")
      .run(numero, nombre, area_id);
    return this.obtenerMesaPorId(r.lastInsertRowid);
  }

  actualizarAreaMesa(id, area_id) {
    this.db.prepare("UPDATE mesas SET area_id = ?, updated_at = datetime('now') WHERE id = ?").run(area_id, id);
    return this.obtenerMesaPorId(id);
  }

  obtenerUsuario(id) {
    return this.db.prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ?').get(id);
  }

  obtenerUsuarioActivo(id) {
    return this.db.prepare('SELECT id, nombre, rol FROM usuarios WHERE id = ? AND activo = 1').get(id);
  }

  tienePedidoActivo(mesaId) {
    return this.db.prepare(
      "SELECT id FROM pedidos WHERE mesa_id = ? AND estado IN ('ABIERTO','EN_PREPARACION','LISTO')"
    ).get(mesaId);
  }

  contarPedidosActivos(mesaId) {
    return this.db.prepare("SELECT COUNT(*) as c FROM pedidos WHERE mesa_id = ? AND estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')").get(mesaId).c;
  }

  inactivarMesa(id) {
    this.db.prepare(`
      UPDATE mesas SET estado = 'INACTIVO', version = version + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
    return this.obtenerMesaPorId(id);
  }

  actualizarMesa(id, numero, nombre, capacidad, area_id, estado) {
    this.db.prepare("UPDATE mesas SET numero = ?, nombre = ?, capacidad = ?, area_id = ?, estado = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?")
      .run(numero, nombre, capacidad, area_id, estado, id);
    return this.obtenerMesaPorId(id);
  }

  obtenerLogs(mesaId) {
    return this.db.prepare(`
      SELECT l.*, u.nombre as mesero_nombre
      FROM logs_mesas l
      LEFT JOIN usuarios u ON u.id = l.mesero_id
      WHERE l.mesa_id = ?
      ORDER BY l.created_at DESC LIMIT 50
    `).all(mesaId);
  }

  transaction(callback) {
    return this.db.transaction(callback)();
  }

  updateMesaTomar(mesaId, version, mesero_id, mesero_nombre) {
    const info = this.db.prepare(`
      UPDATE mesas SET
        estado = 'OCUPADO',
        mesero_id = ?,
        mesero_nombre = ?,
        ocupado_desde = datetime('now'),
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ? AND version = ? AND estado IN ('LIBRE', 'RESERVADO')
    `).run(mesero_id, mesero_nombre, mesaId, version);
    return info.changes;
  }

  insertLog(mesaId, accion, mesero_id, detalle) {
    this.db.prepare(`
      INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
      VALUES (?, ?, ?, ?)
    `).run(mesaId, accion, mesero_id, detalle);
  }

  updateMesaLiberar(mesaId, version) {
    const info = this.db.prepare(`
      UPDATE mesas SET
        estado = 'LIBRE',
        mesero_id = NULL,
        mesero_nombre = NULL,
        pedido_activo_id = NULL,
        ocupado_desde = NULL,
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ? AND version = ?
    `).run(mesaId, version);
    return info.changes;
  }

  updateMesaReservar(mesaId, version, mesero_id, mesero_nombre) {
    const info = this.db.prepare(`
      UPDATE mesas SET
        estado = 'RESERVADO',
        mesero_id = ?,
        mesero_nombre = ?,
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ? AND version = ? AND estado = 'LIBRE'
    `).run(mesero_id, mesero_nombre, mesaId, version);
    return info.changes;
  }

  updateMesaTransferir(mesaId, nuevo_mesero_id, nuevo_mesero_nombre) {
    this.db.prepare(`
      UPDATE mesas SET
        mesero_id = ?,
        mesero_nombre = ?,
        version = version + 1,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(nuevo_mesero_id, nuevo_mesero_nombre, mesaId);
  }
}

module.exports = new MesaRepository();
module.exports.MesaRepository = MesaRepository;
