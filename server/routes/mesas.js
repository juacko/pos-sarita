const { Router } = require('express');
const mesaController = require('../controllers/MesaController');

function createMesasRouter(io) {
  const router = Router();

  router.get('/', (req, res) => mesaController.obtenerMesas(req, res));
  
  // ─── ÁREAS ───
  router.get('/areas', (req, res) => mesaController.obtenerAreas(req, res));
  router.post('/areas', (req, res) => mesaController.crearArea(req, res));
  router.patch('/areas/:id', (req, res) => mesaController.actualizarArea(req, res));
  router.delete('/areas/:id', (req, res) => mesaController.eliminarArea(req, res));
  
  router.post('/', (req, res) => mesaController.crearMesa(req, res, io));
  router.post('/virtual', (req, res) => mesaController.crearMesaVirtual(req, res, io)); // although io wasn't explicitly used, we pass it just in case
  router.post('/:id/area', (req, res) => mesaController.cambiarAreaMesa(req, res, io));
  router.get('/:id', (req, res) => mesaController.obtenerMesa(req, res));
  
  router.post('/:id/tomar', (req, res) => mesaController.tomarMesa(req, res, io));
  router.post('/:id/liberar', (req, res) => mesaController.liberarMesa(req, res, io));
  router.post('/:id/reservar', (req, res) => mesaController.reservarMesa(req, res, io));
  router.post('/:id/cancelar-reserva', (req, res) => mesaController.cancelarReserva(req, res, io));
  router.post('/:id/transferir', (req, res) => mesaController.transferirMesa(req, res, io));
  router.post('/:id/inactivar', (req, res) => mesaController.inactivarMesa(req, res, io));
  router.patch('/:id', (req, res) => mesaController.actualizarMesa(req, res, io));
  router.get('/:id/logs', (req, res) => mesaController.obtenerLogs(req, res));

  return router;
}

module.exports = createMesasRouter;
