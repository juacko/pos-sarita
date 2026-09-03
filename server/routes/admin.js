const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const ConfigController = require('../controllers/ConfigController');
const CategoriaController = require('../controllers/CategoriaController');
const AdminProductoController = require('../controllers/AdminProductoController');
const AdminReporteController = require('../controllers/AdminReporteController');
const AdminCajaController = require('../controllers/AdminCajaController');
const AdminPedidoController = require('../controllers/AdminPedidoController');

function createAdminRouter(io) {
  const router = Router();

  const adminProductoCtrl = new AdminProductoController(io);
  const adminCajaCtrl = new AdminCajaController(io);
  const adminPedidoCtrl = new AdminPedidoController(io);

  // ─── CONFIGURACION ───
  router.get('/configuracion', ConfigController.obtenerConfiguracion.bind(ConfigController));
  router.put('/configuracion/:clave', ConfigController.actualizarConfiguracion.bind(ConfigController));

  // ─── CATEGORIAS ───
  router.get('/categorias', CategoriaController.obtenerCategorias.bind(CategoriaController));
  router.post('/categorias', CategoriaController.crearCategoria.bind(CategoriaController));
  router.put('/categorias/:id', CategoriaController.actualizarCategoria.bind(CategoriaController));

  // ─── PRODUCTOS ───
  router.get('/productos', adminProductoCtrl.obtenerProductos.bind(adminProductoCtrl));
  router.get('/productos/completo', adminProductoCtrl.obtenerProductosCompletos.bind(adminProductoCtrl));
  router.post('/productos', adminProductoCtrl.crearProducto.bind(adminProductoCtrl));
  router.put('/productos/:id', adminProductoCtrl.actualizarProducto.bind(adminProductoCtrl));

  // ─── VARIANTES ───
  router.get('/productos/:id/variantes', adminProductoCtrl.obtenerVariantes.bind(adminProductoCtrl));
  router.post('/variantes', adminProductoCtrl.crearVariante.bind(adminProductoCtrl));
  router.put('/variantes/:id', adminProductoCtrl.actualizarVariante.bind(adminProductoCtrl));
  router.delete('/variantes/:id', adminProductoCtrl.eliminarVariante.bind(adminProductoCtrl));

  // ─── MODIFICADORES ───
  router.get('/productos/:id/modificadores', adminProductoCtrl.obtenerModificadores.bind(adminProductoCtrl));
  router.post('/modificadores', adminProductoCtrl.crearModificador.bind(adminProductoCtrl));
  router.put('/modificadores/:id', adminProductoCtrl.actualizarModificador.bind(adminProductoCtrl));
  router.delete('/modificadores/:id', adminProductoCtrl.eliminarModificador.bind(adminProductoCtrl));

  // ─── OPCIONES MOD ───
  router.post('/opciones-mod', adminProductoCtrl.crearOpcionMod.bind(adminProductoCtrl));
  router.put('/opciones-mod/:id', adminProductoCtrl.actualizarOpcionMod.bind(adminProductoCtrl));
  router.delete('/opciones-mod/:id', adminProductoCtrl.eliminarOpcionMod.bind(adminProductoCtrl));

  // ─── AGREGADOS ───
  router.get('/productos/:id/agregados', adminProductoCtrl.obtenerAgregados.bind(adminProductoCtrl));
  router.post('/agregados', adminProductoCtrl.crearAgregado.bind(adminProductoCtrl));
  router.put('/agregados/:id', adminProductoCtrl.actualizarAgregado.bind(adminProductoCtrl));
  router.delete('/agregados/:id', adminProductoCtrl.eliminarAgregado.bind(adminProductoCtrl));

  // ─── REPORTES DE PEDIDOS ───
  router.get('/pedidos/reporte', AdminReporteController.obtenerReporte.bind(AdminReporteController));
  router.get('/pedidos/reporte/detalle', AdminReporteController.obtenerDetalleReporte.bind(AdminReporteController));

  // ─── CAJA GENERAL ───
  router.get('/corte-caja', adminCajaCtrl.obtenerCorteCaja.bind(adminCajaCtrl));
  router.get('/caja/flujo', adminCajaCtrl.obtenerFlujoCaja.bind(adminCajaCtrl));
  router.get('/caja/bloqueantes', adminCajaCtrl.obtenerBloqueantes.bind(adminCajaCtrl));
  router.get('/caja/sesion-actual', adminCajaCtrl.obtenerSesionActual.bind(adminCajaCtrl));

  // ─── SESIONES DE CAJA ───
  router.post('/caja/abrir', adminCajaCtrl.abrirCaja.bind(adminCajaCtrl));
  router.post('/caja/cerrar', adminCajaCtrl.cerrarCaja.bind(adminCajaCtrl));
  
  router.post('/caja/corte-x/imprimir', adminCajaCtrl.imprimirCorteX.bind(adminCajaCtrl));
  router.post('/caja/corte-z/imprimir', adminCajaCtrl.imprimirCorteZ.bind(adminCajaCtrl));

  // ─── MOVIMIENTOS CAJA ───
  router.get('/caja/movimientos', adminCajaCtrl.obtenerMovimientos.bind(adminCajaCtrl));
  router.post('/caja/movimientos', adminCajaCtrl.crearMovimiento.bind(adminCajaCtrl));
  router.delete('/caja/movimientos/:id', adminCajaCtrl.eliminarMovimiento.bind(adminCajaCtrl));
  router.get('/caja/movimientos/imprimir', adminCajaCtrl.imprimirMovimientos.bind(adminCajaCtrl));

  // ─── HISTORIAL DE CAJA ───
  router.get('/caja/sesiones', adminCajaCtrl.obtenerSesionesCerradas.bind(adminCajaCtrl));
  router.get('/caja/sesiones/:id', adminCajaCtrl.obtenerSesionCerradaId.bind(adminCajaCtrl));

  // ─── PEDIDOS ADMIN Y PAGOS ───
  router.get('/pedidos/anulables', adminPedidoCtrl.obtenerAnulables.bind(adminPedidoCtrl));
  router.post('/pedidos/:id/anular', adminPedidoCtrl.anularPedido.bind(adminPedidoCtrl));
  router.get('/pedidos/pagados', adminPedidoCtrl.obtenerPagados.bind(adminPedidoCtrl));
  router.post('/pedidos/:id/pagos', adminPedidoCtrl.agregarPago.bind(adminPedidoCtrl));
  router.patch('/pedidos/:id/pagos/:pagoId', adminPedidoCtrl.actualizarPago.bind(adminPedidoCtrl));
  router.delete('/pedidos/:id/pagos/:pagoId', adminPedidoCtrl.eliminarPago.bind(adminPedidoCtrl));
  router.post('/pedidos/:id/eliminar', adminPedidoCtrl.eliminarPedido.bind(adminPedidoCtrl));

  return router;
}

module.exports = createAdminRouter;