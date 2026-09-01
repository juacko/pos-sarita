const defaultDb = require('../db');

/**
 * Repositorio de acceso a datos para Mesas y Áreas.
 */
class MesaRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerTodas() {
    return this.db.prepare(`
      SELECT m.*, a.nombre as area_nombre, a.tipo as area_tipo
      FROM mesas m
      LEFT JOIN areas a ON a.id = m.area_id
      WHERE m.estado != 'INACTIVO'
      ORDER BY a.orden, m.numero
    `).all();
  }

  obtenerPorId(id) {
    return this.db.prepare(`
      SELECT m.*, a.tipo as area_tipo, a.nombre as area_nombre
      FROM mesas m
      LEFT JOIN areas a ON a.id = m.area_id
      WHERE m.id = ?
    `).get(id);
  }

  actualizarEstado(id, estado, meseroId = null, meseroNombre = null, pedidoActivoId = null) {
    this.db.prepare(`
      UPDATE mesas
      SET estado = ?, mesero_id = ?, mesero_nombre = ?, pedido_activo_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(estado, meseroId, meseroNombre, pedidoActivoId, id);
    return this.obtenerPorId(id);
  }

  liberarMesa(id) {
    this.db.prepare(`
      UPDATE mesas
      SET estado = 'LIBRE', mesero_id = NULL, mesero_nombre = NULL, pedido_activo_id = NULL, ocupado_desde = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
    return this.obtenerPorId(id);
  }

  obtenerAreas() {
    return this.db.prepare("SELECT * FROM areas WHERE activo = 1 ORDER BY orden").all();
  }

  registrarLog(mesaId, accion, meseroId = null, detalle = '') {
    this.db.prepare(`
      INSERT INTO logs_mesas (mesa_id, accion, mesero_id, detalle)
      VALUES (?, ?, ?, ?)
    `).run(mesaId, accion, meseroId, detalle);
  }
}

module.exports = new MesaRepository();
module.exports.MesaRepository = MesaRepository;
