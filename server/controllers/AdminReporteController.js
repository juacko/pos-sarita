const adminReporteRepo = require('../repositories/AdminReporteRepository');
const adminCajaRepo = require('../repositories/AdminCajaRepository');

class AdminReporteController {
  obtenerReporte(req, res) {
    try {
      const { fecha, rango, sesion_id } = req.query;
      let inicio, fin, corte = null, fuenteRango = 'dia';
      
      if (rango === 'sesion' || sesion_id) {
        const sesion = adminReporteRepo.obtenerSesionActivaOId(sesion_id);
        if (!sesion) return res.status(404).json({ error: 'Sesión de caja no encontrada' });
        inicio = sesion.absorbe_desde || sesion.opened_at;
        fin = sesion.estado === 'ABIERTA' ? adminReporteRepo.getNow() : sesion.closed_at;
        corte = adminReporteRepo.getHoraCorte();
        fuenteRango = 'sesion';
      } else {
        const hoy = fecha || new Date().toISOString().split('T')[0];
        const rangoOp = adminReporteRepo.getRangoOperativo(hoy);
        inicio = rangoOp.inicio;
        fin = rangoOp.fin;
        corte = rangoOp.corte;
      }
      
      const reporte = adminReporteRepo.obtenerReportePedidos(inicio, fin);
      const desglosePagos = adminCajaRepo.getDesglosePagos(
        "pg.created_at >= ? AND pg.created_at < ? AND p.estado != 'CANCELADO'",
        [inicio, fin]
      );
      
      res.json({
        pedidos: reporte.pedidos,
        totalVentas: desglosePagos.totalGeneral,
        totalPropina: desglosePagos.totalPropina,
        cantidad: reporte.pedidos.length,
        desglose: desglosePagos.desglose,
        cancelados: reporte.cancelados,
        rango: { inicio, fin, corte, fuente: fuenteRango }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerDetalleReporte(req, res) {
    try {
      const { fecha, rango, sesion_id } = req.query;
      let inicio, fin;
      
      if (rango === 'sesion' || sesion_id) {
        const sesion = adminReporteRepo.obtenerSesionActivaOId(sesion_id);
        if (!sesion) return res.status(404).json({ error: 'Sesión de caja no encontrada' });
        inicio = sesion.absorbe_desde || sesion.opened_at;
        fin = sesion.estado === 'ABIERTA' ? adminReporteRepo.getNow() : sesion.closed_at;
      } else {
        const hoy = fecha || new Date().toISOString().split('T')[0];
        const rangoOp = adminReporteRepo.getRangoOperativo(hoy);
        inicio = rangoOp.inicio;
        fin = rangoOp.fin;
      }
      
      res.json(adminReporteRepo.obtenerDetalleReportePedidos(inicio, fin));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
}

module.exports = new AdminReporteController();
