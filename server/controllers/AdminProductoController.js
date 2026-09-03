const adminProductoRepo = require('../repositories/AdminProductoRepository');

class AdminProductoController {
  constructor(io) {
    this.io = io;
  }

  obtenerProductos(req, res) {
    try {
      res.json(adminProductoRepo.obtenerProductos(req.query.categoria_id, req.query.activo));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerProductosCompletos(req, res) {
    try {
      res.json(adminProductoRepo.obtenerProductosCompletos());
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  crearProducto(req, res) {
    try {
      const { nombre, descripcion, precio, categoria_id, para_llevar, destino_override, controlar_stock, stock_actual, stock_minimo } = req.body;
      if (!nombre || precio == null) return res.status(400).json({ error: 'nombre y precio requeridos' });
      const nuevo = adminProductoRepo.crearProducto(nombre, descripcion, precio, categoria_id, para_llevar, destino_override, controlar_stock, stock_actual, stock_minimo);
      res.status(201).json(nuevo);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  actualizarProducto(req, res) {
    try {
      const existing = adminProductoRepo.obtenerProductoPorId(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

      const nombre = req.body.nombre !== undefined ? req.body.nombre : existing.nombre;
      const descripcion = req.body.descripcion !== undefined ? req.body.descripcion : existing.descripcion;
      const precio = req.body.precio !== undefined ? req.body.precio : existing.precio;
      const categoria_id = req.body.categoria_id !== undefined ? req.body.categoria_id : existing.categoria_id;
      const activo = req.body.activo !== undefined ? (req.body.activo ? 1 : 0) : existing.activo;
      const para_llevar = req.body.para_llevar !== undefined ? (req.body.para_llevar ? 1 : 0) : existing.para_llevar;
      const destino_override = req.body.destino_override !== undefined ? (req.body.destino_override || null) : existing.destino_override;
      const controlar_stock = req.body.controlar_stock !== undefined ? (req.body.controlar_stock ? 1 : 0) : existing.controlar_stock;
      const stock_actual = req.body.stock_actual !== undefined ? Math.max(0, parseInt(req.body.stock_actual, 10) || 0) : existing.stock_actual;
      const stock_minimo = req.body.stock_minimo !== undefined ? Math.max(0, parseInt(req.body.stock_minimo, 10) || 0) : existing.stock_minimo;

      const act = adminProductoRepo.actualizarProducto(req.params.id, nombre, descripcion, precio, categoria_id, activo, para_llevar, destino_override, controlar_stock, stock_actual, stock_minimo);

      if (this.io) {
        this.io.emit('stock:actualizado', {
          producto_id: act.id,
          controlar_stock: act.controlar_stock,
          stock_actual: act.stock_actual,
          stock_minimo: act.stock_minimo
        });
      }
      res.json(act);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerVariantes(req, res) {
    try { res.json(adminProductoRepo.obtenerVariantes(req.params.id)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  }

  crearVariante(req, res) {
    try {
      const { producto_id, nombre, precio_adicional } = req.body;
      if (!producto_id || !nombre) return res.status(400).json({ error: 'producto_id y nombre requeridos' });
      res.status(201).json(adminProductoRepo.crearVariante(producto_id, nombre, precio_adicional));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  actualizarVariante(req, res) {
    try {
      const { nombre, precio_adicional, activo } = req.body;
      res.json(adminProductoRepo.actualizarVariante(req.params.id, nombre, precio_adicional, activo));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  eliminarVariante(req, res) {
    try {
      adminProductoRepo.eliminarVariante(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerModificadores(req, res) {
    try { res.json(adminProductoRepo.obtenerModificadores(req.params.id)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  }

  crearModificador(req, res) {
    try {
      const { producto_id, nombre, tipo, requerido, max_opciones, depende_variante_id } = req.body;
      if (!producto_id || !nombre) return res.status(400).json({ error: 'producto_id y nombre requeridos' });
      res.status(201).json(adminProductoRepo.crearModificador(producto_id, nombre, tipo, requerido, max_opciones, depende_variante_id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  actualizarModificador(req, res) {
    try {
      const { nombre, tipo, requerido, max_opciones, activo, depende_variante_id } = req.body;
      res.json(adminProductoRepo.actualizarModificador(req.params.id, nombre, tipo, requerido, max_opciones, activo, depende_variante_id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  eliminarModificador(req, res) {
    try {
      adminProductoRepo.eliminarModificador(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  crearOpcionMod(req, res) {
    try {
      const { modificador_id, nombre, precio_adicional } = req.body;
      if (!modificador_id || !nombre) return res.status(400).json({ error: 'modificador_id y nombre requeridos' });
      res.status(201).json(adminProductoRepo.crearOpcionMod(modificador_id, nombre, precio_adicional));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  actualizarOpcionMod(req, res) {
    try {
      const { nombre, precio_adicional, activo } = req.body;
      res.json(adminProductoRepo.actualizarOpcionMod(req.params.id, nombre, precio_adicional, activo));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  eliminarOpcionMod(req, res) {
    try {
      adminProductoRepo.eliminarOpcionMod(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  obtenerAgregados(req, res) {
    try { res.json(adminProductoRepo.obtenerAgregados(req.params.id)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  }

  crearAgregado(req, res) {
    try {
      const { producto_id, nombre, precio, maximo } = req.body;
      if (!producto_id || !nombre || precio == null) return res.status(400).json({ error: 'producto_id, nombre y precio requeridos' });
      res.status(201).json(adminProductoRepo.crearAgregado(producto_id, nombre, precio, maximo));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  actualizarAgregado(req, res) {
    try {
      const { nombre, precio, maximo, activo } = req.body;
      res.json(adminProductoRepo.actualizarAgregado(req.params.id, nombre, precio, maximo, activo));
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  eliminarAgregado(req, res) {
    try {
      adminProductoRepo.eliminarAgregado(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
}

module.exports = AdminProductoController;
