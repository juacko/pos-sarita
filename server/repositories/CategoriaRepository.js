const defaultDb = require('../db');

class CategoriaRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerTodas() {
    return this.db.prepare('SELECT * FROM categorias ORDER BY nombre').all();
  }

  obtenerPorId(id) {
    return this.db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  }

  crear(nombre, color, destino) {
    const r = this.db.prepare('INSERT INTO categorias (nombre, color, destino) VALUES (?, ?, ?)').run(nombre, color || '#6B7280', destino || 'cocina');
    return this.obtenerPorId(r.lastInsertRowid);
  }

  actualizar(id, nombre, color, activo, destino) {
    this.db.prepare('UPDATE categorias SET nombre=?, color=?, activo=?, destino=? WHERE id=?')
      .run(nombre, color, activo, destino, id);
    return this.obtenerPorId(id);
  }
}

module.exports = new CategoriaRepository();
module.exports.CategoriaRepository = CategoriaRepository;
