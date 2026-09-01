const { Router } = require('express');
const usuarioController = require('../controllers/UsuarioController');

function createUsuariosRouter() {
  const router = Router();

  router.post('/login', (req, res) => usuarioController.login(req, res));
  router.post('/logout', (req, res) => usuarioController.logout(req, res));
  router.get('/', (req, res) => usuarioController.obtenerUsuarios(req, res));

  return router;
}

module.exports = createUsuariosRouter;
