const defaultMesaRepo = require('../repositories/MesaRepository');
const { acquireTableLock, releaseTableLock } = require('../table-lock');

class MesaController {
  constructor(mesaRepo = defaultMesaRepo) {
    this.mesaRepo = mesaRepo;
  }

  obtenerMesas(req, res) {
    try {
      const mesas = this.mesaRepo.obtenerTodas();
      res.json(mesas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerAreas(req, res) {
    try {
      const areas = this.mesaRepo.obtenerAreas();
      res.json(areas);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  tomarMesa(req, res, io) {
    const { id } = req.params;
    const { mesero_id, mesero_nombre } = req.body;

    if (!acquireTableLock(id)) {
      return res.status(409).json({ error: 'La mesa está siendo modificada por otro usuario' });
    }

    try {
      const mesa = this.mesaRepo.obtenerPorId(id);
      if (!mesa) {
        releaseTableLock(id);
        return res.status(404).json({ error: 'Mesa no encontrada' });
      }

      const actualizada = this.mesaRepo.actualizarEstado(id, 'OCUPADO', mesero_id, mesero_nombre, mesa.pedido_activo_id);
      this.mesaRepo.registrarLog(id, 'TOMAR', mesero_id, `Tomada por ${mesero_nombre || 'Mesero'}`);
      
      releaseTableLock(id);
      if (io) io.emit('mesa:updated', actualizada);
      res.json(actualizada);
    } catch (err) {
      releaseTableLock(id);
      res.status(500).json({ error: err.message });
    }
  }

  liberarMesa(req, res, io) {
    const { id } = req.params;
    const { mesero_id } = req.body;

    try {
      const liberada = this.mesaRepo.liberarMesa(id);
      this.mesaRepo.registrarLog(id, 'LIBERAR', mesero_id, 'Mesa liberada');
      releaseTableLock(id);
      if (io) io.emit('mesa:updated', liberada);
      res.json(liberada);
    } catch (err) {
      releaseTableLock(id);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new MesaController();
module.exports.MesaController = MesaController;
