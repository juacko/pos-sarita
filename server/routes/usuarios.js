const { Router } = require('express');
const db = require('../db');
const { generarTokenSesion, destruirSesion } = require('../middleware/auth');

function createUsuariosRouter() {
  const router = Router();

  router.post('/login', (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN requerido' });

    const usuario = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE pin = ? AND activo = 1').get(pin);
    if (!usuario) return res.status(401).json({ error: 'PIN incorrecto' });

    const token = generarTokenSesion(usuario.id);

    res.json({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol
    });
  });

  router.post('/logout', (req, res) => {
    const token = req.headers['x-session-token'];
    if (token) destruirSesion(token);
    res.json({ ok: true });
  });

  router.get('/', (req, res) => {
    try {
      res.json(db.prepare('SELECT id, nombre, rol, activo FROM usuarios ORDER BY nombre').all());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createUsuariosRouter;
