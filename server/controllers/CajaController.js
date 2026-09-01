const defaultCajaRepo = require('../repositories/CajaRepository');

class CajaController {
  constructor(cajaRepo = defaultCajaRepo) {
    this.cajaRepo = cajaRepo;
  }

  obtenerSesionActiva(req, res) {
    try {
      const sesion = this.cajaRepo.obtenerSesionActiva();
      res.json(sesion);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  abrirSesion(req, res, io) {
    const { usuario_id, fondo_inicial, notas } = req.body;
    try {
      const activa = this.cajaRepo.obtenerSesionActiva();
      if (activa) return res.status(400).json({ error: 'Ya existe una sesión de caja abierta' });

      const nueva = this.cajaRepo.abrirSesion(usuario_id || req.usuario?.id, fondo_inicial, notas);
      if (io) io.emit('caja:updated', nueva);
      res.json(nueva);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  registrarMovimiento(req, res, io) {
    const { tipo, concepto, monto, metodo_pago, persona, usuario_id, notas } = req.body;
    if (!tipo || !concepto || monto == null) {
      return res.status(400).json({ error: 'Tipo, concepto y monto son obligatorios' });
    }

    try {
      const mov = this.cajaRepo.registrarMovimiento(
        tipo,
        concepto,
        monto,
        metodo_pago || 'Efectivo',
        persona,
        usuario_id || req.usuario?.id,
        notas
      );
      if (io) io.emit('caja:updated', { movimiento: mov });
      res.json(mov);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new CajaController();
module.exports.CajaController = CajaController;
