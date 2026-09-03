const { generarTokenSesion, destruirSesion } = require('../middleware/auth');
const defaultDb = require('../db');

class UsuarioController {
  constructor(database = defaultDb, repository = null) {
    this.db = database;
    if (repository) {
      this.repo = repository;
    } else {
      const { UsuarioRepository } = require('../repositories/UsuarioRepository');
      this.repo = new UsuarioRepository(database);
    }
  }

  login(req, res) {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN es requerido' });

    try {
      const usuario = this.repo.obtenerPorPin(pin);
      if (!usuario) {
        return res.status(401).json({ error: 'PIN incorrecto o usuario inactivo' });
      }

      // Pass this.db to generarTokenSesion so tests using testDb work properly
      const token = generarTokenSesion(usuario.id, 24, this.db);
      res.json({
        id: usuario.id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        token
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  logout(req, res) {
    try {
      const token = req.headers['x-session-token'];
      if (token) {
        destruirSesion(token, this.db);
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  obtenerUsuarios(req, res) {
    try {
      const usuarios = this.repo.obtenerActivos();
      res.json(usuarios);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new UsuarioController();
module.exports.UsuarioController = UsuarioController;
