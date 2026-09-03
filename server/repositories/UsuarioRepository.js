const defaultDb = require('../db');

class UsuarioRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerPorPin(pin) {
    return this.db.prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE pin = ? AND activo = 1').get(pin);
  }

  obtenerActivos() {
    return this.db.prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE activo = 1').all();
  }
}

module.exports = new UsuarioRepository();
module.exports.UsuarioRepository = UsuarioRepository;
