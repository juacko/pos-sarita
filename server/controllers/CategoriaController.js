const categoriaRepo = require('../repositories/CategoriaRepository');

class CategoriaController {
  obtenerCategorias(req, res) {
    try {
      res.json(categoriaRepo.obtenerTodas());
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  crearCategoria(req, res) {
    try {
      const { nombre, color, destino } = req.body;
      if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
      const nueva = categoriaRepo.crear(nombre, color, destino);
      res.status(201).json(nueva);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }

  actualizarCategoria(req, res) {
    try {
      const existing = categoriaRepo.obtenerPorId(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });

      const nombre = req.body.nombre !== undefined ? req.body.nombre : existing.nombre;
      const color = req.body.color !== undefined ? req.body.color : existing.color;
      const activo = req.body.activo !== undefined ? (req.body.activo ? 1 : 0) : existing.activo;
      const destino = req.body.destino !== undefined ? (req.body.destino || 'cocina') : (existing.destino || 'cocina');

      const actualizada = categoriaRepo.actualizar(req.params.id, nombre, color, activo, destino);
      res.json(actualizada);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
}

module.exports = new CategoriaController();
