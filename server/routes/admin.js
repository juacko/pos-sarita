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
  router.get('/configuracion', requireRole('admin', 'cajero'), ConfigController.obtenerConfiguracion.bind(ConfigController));
  router.put('/configuracion/:clave', requireRole('admin'), ConfigController.actualizarConfiguracion.bind(ConfigController));

  // ─── CATEGORIAS ───
  router.get('/categorias', requireRole('admin', 'cajero'), CategoriaController.obtenerCategorias.bind(CategoriaController));
  router.post('/categorias', requireRole('admin'), CategoriaController.crearCategoria.bind(CategoriaController));
  router.put('/categorias/:id', requireRole('admin'), CategoriaController.actualizarCategoria.bind(CategoriaController));

  // ─── PRODUCTOS ───
  router.get('/productos', requireRole('admin', 'cajero'), adminProductoCtrl.obtenerProductos.bind(adminProductoCtrl));
  router.get('/productos/completo', requireRole('admin', 'cajero'), adminProductoCtrl.obtenerProductosCompletos.bind(adminProductoCtrl));
  router.post('/productos', requireRole('admin'), adminProductoCtrl.crearProducto.bind(adminProductoCtrl));
  router.put('/productos/:id', requireRole('admin'), adminProductoCtrl.actualizarProducto.bind(adminProductoCtrl));

  // ─── VARIANTES ───
  router.get('/productos/:id/variantes', requireRole('admin', 'cajero'), adminProductoCtrl.obtenerVariantes.bind(adminProductoCtrl));
  router.post('/variantes', requireRole('admin'), adminProductoCtrl.crearVariante.bind(adminProductoCtrl));
  router.put('/variantes/:id', requireRole('admin'), adminProductoCtrl.actualizarVariante.bind(adminProductoCtrl));
  router.delete('/variantes/:id', requireRole('admin'), adminProductoCtrl.eliminarVariante.bind(adminProductoCtrl));

  // ─── MODIFICADORES ───
  router.get('/productos/:id/modificadores', requireRole('admin', 'cajero'), adminProductoCtrl.obtenerModificadores.bind(adminProductoCtrl));
  router.post('/modificadores', requireRole('admin'), adminProductoCtrl.crearModificador.bind(adminProductoCtrl));
  router.put('/modificadores/:id', requireRole('admin'), adminProductoCtrl.actualizarModificador.bind(adminProductoCtrl));
  router.delete('/modificadores/:id', requireRole('admin'), adminProductoCtrl.eliminarModificador.bind(adminProductoCtrl));

  // ─── OPCIONES MOD ───
  router.post('/opciones-mod', requireRole('admin'), adminProductoCtrl.crearOpcionMod.bind(adminProductoCtrl));
  router.put('/opciones-mod/:id', requireRole('admin'), adminProductoCtrl.actualizarOpcionMod.bind(adminProductoCtrl));
  router.delete('/opciones-mod/:id', requireRole('admin'), adminProductoCtrl.eliminarOpcionMod.bind(adminProductoCtrl));

  // ─── AGREGADOS ───
  router.get('/productos/:id/agregados', requireRole('admin', 'cajero'), adminProductoCtrl.obtenerAgregados.bind(adminProductoCtrl));
  router.post('/agregados', requireRole('admin'), adminProductoCtrl.crearAgregado.bind(adminProductoCtrl));
  router.put('/agregados/:id', requireRole('admin'), adminProductoCtrl.actualizarAgregado.bind(adminProductoCtrl));
  router.delete('/agregados/:id', requireRole('admin'), adminProductoCtrl.eliminarAgregado.bind(adminProductoCtrl));

  // ─── DASHBOARD ───
  router.get('/dashboard', requireRole('admin', 'cajero'), AdminReporteController.obtenerDashboard.bind(AdminReporteController));

  // ─── REPORTES DE PEDIDOS ───
  router.get('/pedidos/reporte', requireRole('admin', 'cajero'), AdminReporteController.obtenerReporte.bind(AdminReporteController));
  router.get('/pedidos/reporte/detalle', requireRole('admin', 'cajero'), AdminReporteController.obtenerDetalleReporte.bind(AdminReporteController));

  // ─── CAJA GENERAL ───
  router.get('/corte-caja', requireRole('admin', 'cajero'), adminCajaCtrl.obtenerCorteCaja.bind(adminCajaCtrl));
  router.get('/caja/flujo', requireRole('admin', 'cajero'), adminCajaCtrl.obtenerFlujoCaja.bind(adminCajaCtrl));
  router.get('/caja/bloqueantes', requireRole('admin', 'cajero'), adminCajaCtrl.obtenerBloqueantes.bind(adminCajaCtrl));
  router.get('/caja/sesion-actual', requireRole('admin', 'cajero'), adminCajaCtrl.obtenerSesionActual.bind(adminCajaCtrl));

  // ─── SESIONES DE CAJA ───
  router.post('/caja/abrir', requireRole('admin', 'cajero'), adminCajaCtrl.abrirCaja.bind(adminCajaCtrl));
  router.post('/caja/cerrar', requireRole('admin', 'cajero'), adminCajaCtrl.cerrarCaja.bind(adminCajaCtrl));
  
  router.post('/caja/corte-x/imprimir', requireRole('admin', 'cajero'), adminCajaCtrl.imprimirCorteX.bind(adminCajaCtrl));
  router.post('/caja/corte-z/imprimir', requireRole('admin', 'cajero'), adminCajaCtrl.imprimirCorteZ.bind(adminCajaCtrl));

  // ─── MOVIMIENTOS CAJA ───
  router.get('/caja/movimientos', requireRole('admin', 'cajero'), adminCajaCtrl.obtenerMovimientos.bind(adminCajaCtrl));
  router.post('/caja/movimientos', requireRole('admin', 'cajero'), adminCajaCtrl.crearMovimiento.bind(adminCajaCtrl));
  router.delete('/caja/movimientos/:id', requireRole('admin', 'cajero'), adminCajaCtrl.eliminarMovimiento.bind(adminCajaCtrl));
  router.get('/caja/movimientos/imprimir', requireRole('admin', 'cajero'), adminCajaCtrl.imprimirMovimientos.bind(adminCajaCtrl));

  // ─── HISTORIAL DE CAJA ───
  router.get('/caja/sesiones', requireRole('admin', 'cajero'), adminCajaCtrl.obtenerSesionesCerradas.bind(adminCajaCtrl));
  router.get('/caja/sesiones/:id', requireRole('admin', 'cajero'), adminCajaCtrl.obtenerSesionCerradaId.bind(adminCajaCtrl));

  // ─── PEDIDOS ADMIN Y PAGOS ───
  router.get('/pedidos/anulables', requireRole('admin', 'cajero'), adminPedidoCtrl.obtenerAnulables.bind(adminPedidoCtrl));
  router.post('/pedidos/:id/anular', requireRole('admin', 'cajero'), adminPedidoCtrl.anularPedido.bind(adminPedidoCtrl));
  router.get('/pedidos/pagados', requireRole('admin', 'cajero'), adminPedidoCtrl.obtenerPagados.bind(adminPedidoCtrl));
  router.post('/pedidos/:id/pagos', requireRole('admin', 'cajero'), adminPedidoCtrl.agregarPago.bind(adminPedidoCtrl));
  router.patch('/pedidos/:id/pagos/:pagoId', requireRole('admin', 'cajero'), adminPedidoCtrl.actualizarPago.bind(adminPedidoCtrl));
  router.delete('/pedidos/:id/pagos/:pagoId', requireRole('admin', 'cajero'), adminPedidoCtrl.eliminarPago.bind(adminPedidoCtrl));
  router.post('/pedidos/:id/eliminar', requireRole('admin'), adminPedidoCtrl.eliminarPedido.bind(adminPedidoCtrl));

  return router;
}

module.exports = createAdminRouter;