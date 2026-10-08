const { Router } = require('express');
const productoController = require('../controllers/ProductoController');

function createProductosRouter(io) {
  const router = Router();

  router.get('/', (req, res) => productoController.obtenerProductos(req, res));
  router.get('/categorias', (req, res) => productoController.obtenerCategorias(req, res));
  router.patch('/:id/stock', (req, res) => productoController.actualizarStock(req, res, io));
  router.post('/stock-batch', (req, res) => productoController.actualizarStockBatch(req, res, io));

  router.post('/', (req, res) => productoController.crearProducto(req, res));
  router.put('/:id', (req, res) => productoController.actualizarProducto(req, res, io));
  router.delete('/:id', (req, res) => productoController.eliminarProducto(req, res));

  return router;
}

module.exports = createProductosRouter;

