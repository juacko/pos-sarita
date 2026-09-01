const db = require('../db');

/**
 * Servicio de gestión de Pagos y Descuentos.
 * Encapsula la lógica financiera de cálculo de totales, descuentos, pendientes y sesiones de caja.
 */
class PagoService {
  constructor(database = db) {
    this.db = database;
  }

  /**
   * Verifica si existe una sesión de caja abierta.
   * @returns {Object|null} Objeto sesión de caja abierta o null si no hay ninguna
   */
  obtenerSesionCajaAbierta() {
    return this.db.prepare("SELECT * FROM caja_sesiones WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get() || null;
  }

  /**
   * Calcula el total de descuentos y el monto final a pagar de un pedido.
   * @param {number} pedidoId - ID del pedido
   * @returns {Object} { totalBruto, descuentoPorcentaje, descuentoFijo, totalDescuento, totalFinal }
   */
  calcularTotalConDescuentos(pedidoId) {
    const pedido = this.db.prepare('SELECT total FROM pedidos WHERE id = ?').get(pedidoId);
    if (!pedido) throw { status: 404, error: 'Pedido no encontrado' };

    const totalBruto = pedido.total || 0;
    const descuentoRow = this.db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN 0 ELSE valor END), 0) as fijo,
             COALESCE(SUM(CASE WHEN tipo = 'porcentaje' THEN valor ELSE 0 END), 0) as pct
      FROM descuentos WHERE pedido_id = ?
    `).get(pedidoId);

    const descuentoPorcentaje = descuentoRow ? descuentoRow.pct || 0 : 0;
    const descuentoFijo = descuentoRow ? descuentoRow.fijo || 0 : 0;

    const totalDescontadoPct = totalBruto * (descuentoPorcentaje / 100);
    const totalDescuento = totalDescontadoPct + descuentoFijo;
    const totalConDescuento = totalBruto - totalDescuento;
    const totalFinal = Math.max(0, totalConDescuento);

    return {
      totalBruto,
      descuentoPorcentaje,
      descuentoFijo,
      totalDescuento,
      totalFinal
    };
  }

  /**
   * Obtiene un resumen completo del estado financiero de un pedido (bruto, descuentos, final, pagado, pendiente).
   * @param {number} pedidoId - ID del pedido
   * @returns {Object} Resumen financiero del pedido
   */
  obtenerResumenPago(pedidoId) {
    const calc = this.calcularTotalConDescuentos(pedidoId);
    const pagadoAnterior = this.db.prepare('SELECT COALESCE(SUM(monto), 0) as total FROM pagos WHERE pedido_id = ?')
      .get(pedidoId).total;

    const pendiente = Math.max(0, calc.totalFinal - pagadoAnterior);
    const completado = pagadoAnterior >= calc.totalFinal - 0.01;

    return {
      ...calc,
      pagado: pagadoAnterior,
      pendiente,
      completado
    };
  }
}

module.exports = new PagoService();
module.exports.PagoService = PagoService;
