const defaultDb = require('../db');
const { generarTokenSesion, destruirSesion } = require('../middleware/auth');

class UsuarioController {
  constructor(database = defaultDb) {
    this.db = database;
  }

  login(req, res) {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN es requerido' });

    try {
      const usuario = this.db.prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE pin = ? AND activo = 1').get(pin);
      if (!usuario) {
        return res.status(401).json({ error: 'PIN incorrecto o usuario inactivo' });
      }

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
      const usuarios = this.db.prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE activo = 1').all();
      res.json(usuarios);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new UsuarioController();
module.exports.UsuarioController = UsuarioController;
