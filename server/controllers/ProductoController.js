const defaultProductoRepo = require('../repositories/ProductoRepository');

class ProductoController {
  constructor(productoRepo = defaultProductoRepo) {
    this.productoRepo = productoRepo;
  }

  obtenerProductos(req, res) {
    try {
      const productos = this.productoRepo.obtenerTodos();
      res.json(productos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerCategorias(req, res) {
    try {
      const categorias = this.productoRepo.obtenerCategorias();
      res.json(categorias);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarStock(req, res, io) {
    const { id } = req.params;
    const { stock_actual, controlar_stock, stock_minimo } = req.body;

    try {
      const prod = this.productoRepo.obtenerPorId(id);
      if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

      const nuevoStock = stock_actual !== undefined && stock_actual !== null ? Math.max(0, parseInt(stock_actual, 10) || 0) : prod.stock_actual;
      const nuevoControlarStock = controlar_stock !== undefined ? controlar_stock : prod.controlar_stock;
      const nuevoStockMinimo = stock_minimo !== undefined ? stock_minimo : prod.stock_minimo;

      console.log('DEBUG PATCH STOCK:', { id, reqBody: req.body, nuevoStock, nuevoControlarStock, nuevoStockMinimo });

      const actualizado = this.productoRepo.actualizarStock(id, nuevoStock, nuevoControlarStock, nuevoStockMinimo);

      if (io) {
        io.emit('stock:actualizado', {
          producto_id: actualizado.id,
          controlar_stock: actualizado.controlar_stock,
          stock_actual: actualizado.stock_actual,
          stock_minimo: actualizado.stock_minimo
        });
      }

      res.json(actualizado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  crearProducto(req, res) {
    const { nombre, precio, categoria_id, controlar_stock, stock_actual, stock_minimo } = req.body;
    if (!nombre || precio == null) {
      return res.status(400).json({ error: 'nombre y precio son requeridos' });
    }
    try {
      const producto = this.productoRepo.crear(
        nombre,
        precio,
        categoria_id,
        controlar_stock,
        Math.max(0, parseInt(stock_actual, 10) || 0),
        Math.max(0, parseInt(stock_minimo, 10) || 3)
      );
      res.status(201).json(producto);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarProducto(req, res, io) {
    const { nombre, precio, categoria_id, controlar_stock, stock_actual, stock_minimo } = req.body;
    try {
      const act = this.productoRepo.actualizar(
        req.params.id,
        nombre,
        precio,
        categoria_id,
        controlar_stock,
        stock_actual,
        stock_minimo
      );
      if (io) {
        io.emit('stock:actualizado', {
          producto_id: act.id,
          controlar_stock: act.controlar_stock,
          stock_actual: act.stock_actual,
          stock_minimo: act.stock_minimo
        });
      }
      res.json(act);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  eliminarProducto(req, res) {
    try {
      this.productoRepo.eliminar(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  actualizarStockBatch(req, res, io) {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items debe ser un array' });

    try {
      const results = this.productoRepo.actualizarStockBatch(items);
      if (io) {
        for (const act of results) {
          io.emit('stock:actualizado', {
            producto_id: act.id,
            controlar_stock: act.controlar_stock,
            stock_actual: act.stock_actual,
            stock_minimo: act.stock_minimo
          });
        }
      }
      res.json({ ok: true, actualizados: results.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new ProductoController();
module.exports.ProductoController = ProductoController;
