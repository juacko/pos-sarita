const defaultDb = require('../db');
const cajaRepoDef = require('../repositories/CajaRepository');
const pedidoRepoDef = require('../repositories/PedidoRepository');

/**
 * Servicio de gestión de Pagos y Descuentos.
 * Encapsula la lógica financiera de cálculo de totales, descuentos, pendientes y sesiones de caja.
 */
class PagoService {
  constructor(database = defaultDb, cajaRepo = null, pedidoRepo = null) {
    this.db = database;
    if (cajaRepo) {
      this.cajaRepo = cajaRepo;
    } else {
      const { CajaRepository } = require('../repositories/CajaRepository');
      this.cajaRepo = new CajaRepository(database);
    }
    
    if (pedidoRepo) {
      this.pedidoRepo = pedidoRepo;
    } else {
      const { PedidoRepository } = require('../repositories/PedidoRepository');
      this.pedidoRepo = new PedidoRepository(database);
    }
  }

  /**
   * Verifica si existe una sesión de caja abierta.
   * @returns {Object|null} Objeto sesión de caja abierta o null si no hay ninguna
   */
  obtenerSesionCajaAbierta() {
    return this.cajaRepo.obtenerSesionActiva();
  }

  /**
   * Calcula el total de descuentos y el monto final a pagar de un pedido.
   * @param {number} pedidoId - ID del pedido
   * @returns {Object} { totalBruto, descuentoPorcentaje, descuentoFijo, totalDescuento, totalFinal }
   */
  calcularTotalConDescuentos(pedidoId) {
    const totalBruto = this.pedidoRepo.obtenerTotal(pedidoId);
    if (totalBruto === null) throw { status: 404, error: 'Pedido no encontrado' };
    const descuentoRow = this.pedidoRepo.obtenerTotalesDescuentos(pedidoId);

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
    const pagadoAnterior = this.pedidoRepo.obtenerTotalPagado(pedidoId);

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
