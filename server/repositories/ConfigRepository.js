const defaultDb = require('../db');
const { generateUUID } = require('../sync/utils');

class ConfigRepository {
  constructor(database = defaultDb) {
    this.db = database;
  }

  obtenerTodas() {
    return this.db.prepare('SELECT clave, valor FROM configuracion ORDER BY clave').all();
  }

  obtenerPorClave(clave) {
    return this.db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  }

  actualizar(clave, valorStr) {
    this.db.prepare(`
      INSERT INTO configuracion (clave, valor, updated_at, uuid) VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = datetime('now')
    `).run(clave, valorStr, generateUUID());
  }
}

module.exports = new ConfigRepository();
module.exports.ConfigRepository = ConfigRepository;
