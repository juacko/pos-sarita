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

      const nuevoStock = stock_actual != null ? Math.max(0, parseInt(stock_actual, 10) || 0) : prod.stock_actual;
      const actualizado = this.productoRepo.actualizarStock(id, nuevoStock, controlar_stock, stock_minimo);

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
}

module.exports = new ProductoController();
module.exports.ProductoController = ProductoController;
