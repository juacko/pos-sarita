const defaultDb = require('../db');

/**
 * Repositorio de acceso a datos para Caja Chica, Sesiones y Movimientos.
 */
class CajaRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerSesionActiva() {
    return this.db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get() || null;
  }

  abrirSesion(usuarioId, fondoInicial = 0, notas = '') {
    const res = this.db.prepare(`
      INSERT INTO caja_sesiones (usuario_id, fondo_inicial, estado, notas_apertura, opened_at)
      VALUES (?, ?, 'ABIERTA', ?, datetime('now'))
    `).run(usuarioId, fondoInicial, notas);
    return this.db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(res.lastInsertRowid);
  }

  cerrarSesion(sesionId, datosCierre) {
    const {
      efectivoContado,
      notasCierre,
      totalVentas,
      propinas,
      efectivoEsperado,
      sobranteFaltante,
      totalPedidos,
      desgloseJson,
      cerradaPor
    } = datosCierre;

    this.db.prepare(`
      UPDATE caja_sesiones
      SET estado = 'CERRADA',
          efectivo_contado = ?,
          notas_cierre = ?,
          total_ventas = ?,
          propinas = ?,
          efectivo_esperado = ?,
          sobrante_faltante = ?,
          total_pedidos = ?,
          desglose_json = ?,
          cerrada_por = ?,
          closed_at = datetime('now')
      WHERE id = ?
    `).run(
      efectivoContado,
      notasCierre,
      totalVentas,
      propinas,
      efectivoEsperado,
      sobranteFaltante,
      totalPedidos,
      desgloseJson,
      cerradaPor,
      sesionId
    );

    return this.db.prepare('SELECT * FROM caja_sesiones WHERE id = ?').get(sesionId);
  }

  registrarMovimiento(tipo, concepto, monto, metodoPago, persona = '', usuarioId = null, notas = '') {
    const res = this.db.prepare(`
      INSERT INTO caja_movimientos (tipo, concepto, monto, metodo_pago, persona, usuario_id, notas, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(tipo, concepto, monto, metodoPago, persona, usuarioId, notas);
    return this.db.prepare('SELECT * FROM caja_movimientos WHERE id = ?').get(res.lastInsertRowid);
  }

  obtenerMovimientos() {
    return this.db.prepare('SELECT * FROM caja_movimientos ORDER BY id DESC').all();
  }
}

module.exports = new CajaRepository();
module.exports.CajaRepository = CajaRepository;
