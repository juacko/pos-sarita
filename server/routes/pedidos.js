const { Router } = require('express');
const pedidoController = require('../controllers/PedidoController');

function createPedidosRouter(io) {
  const router = Router();

  router.get('/', (req, res) => pedidoController.obtenerPedidos(req, res));
  router.post('/', (req, res) => pedidoController.crearPedido(req, res, io));
  router.post('/:id/items', (req, res) => pedidoController.agregarItems(req, res, io));

  router.patch('/:id/items/estado', (req, res) => pedidoController.actualizarEstadoItemsMasivo(req, res, io));
  router.patch('/:id/items/:itemId', (req, res) => pedidoController.actualizarItem(req, res, io));
  router.post('/:id/items/:itemId/split', (req, res) => pedidoController.dividirItem(req, res, io));
  router.delete('/:id/items/:itemId', (req, res) => pedidoController.eliminarItem(req, res, io));
  router.post('/:id/mover', (req, res) => pedidoController.moverItems(req, res, io));
  router.post('/:id/unir', (req, res) => pedidoController.unirPedidos(req, res, io));

  // ─── COCINA ───
  router.get('/cocina', (req, res) => pedidoController.obtenerPedidosCocina(req, res));
  router.get('/cocina/historial', (req, res) => pedidoController.obtenerHistorialCocina(req, res));

  // ─── BARRA ───
  router.get('/barra', (req, res) => pedidoController.obtenerPedidosBarra(req, res));
  router.get('/barra/historial', (req, res) => pedidoController.obtenerHistorialBarra(req, res));

  router.get('/vales/buscar', (req, res) => pedidoController.buscarVale(req, res));
  router.get('/activos', (req, res) => pedidoController.obtenerPedidosActivos(req, res));
  
  router.patch('/:id/cliente', (req, res) => pedidoController.actualizarCliente(req, res, io));
  router.get('/:id', (req, res) => pedidoController.obtenerPedidoPorId(req, res));
  
  router.post('/:id/pagar', (req, res) => pedidoController.pagarPedido(req, res, io));
  router.post('/:id/pagar-dividido', (req, res) => pedidoController.pagarPedidoDividido(req, res, io));
  
  router.patch('/:id/estado', (req, res) => pedidoController.actualizarEstadoPedido(req, res, io));
  router.patch('/items/:idItem/estado', (req, res) => pedidoController.actualizarEstadoItemUnico(req, res, io));
  
  router.post('/:id/reimprimir', (req, res) => pedidoController.reimprimirTicket(req, res));
  router.post('/:id/precuenta', (req, res) => pedidoController.imprimirPrecuenta(req, res));
  
  router.post('/:id/descuento', (req, res) => pedidoController.agregarDescuento(req, res, io));
  router.delete('/:id/descuento/:descId', (req, res) => pedidoController.eliminarDescuento(req, res, io));

  return router;
}

module.exports = createPedidosRouter;
