const crypto = require('crypto');
const defaultDb = require('../db');

/**
 * Middleware y utilidades de Autenticación y Autorización por Tokens de Sesión.
 */

/**
 * Genera y almacena un nuevo token de sesión para un usuario.
 * @param {number} usuarioId - ID del usuario
 * @param {number} duracionHoras - Horas de validez (por defecto 24h)
 * @param {Object} db - Instancia SQLite (por defecto singleton db)
 * @returns {string} Token de sesión (UUID v4)
 */
function generarTokenSesion(usuarioId, duracionHoras = 24, db = defaultDb) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + duracionHoras * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19);

  db.prepare(`
    INSERT INTO sesiones (token, usuario_id, expires_at)
    VALUES (?, ?, ?)
  `).run(token, usuarioId, expiresAt);

  return token;
}

/**
 * Elimina un token de sesión (logout).
 * @param {string} token - Token de sesión a invalidar
 * @param {Object} db - Instancia SQLite
 */
function destruirSesion(token, db = defaultDb) {
  if (!token) return;
  db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

/**
 * Middleware para exigir autenticación vía header x-session-token.
 * Mantiene un fallback progresivo con req.body.usuario_id para clientes sin migrar.
 * @param {Object} db - Instancia SQLite
 */
function requireAuth(db = defaultDb) {
  return (req, res, next) => {
    try {
      const headerToken = req.headers['x-session-token'] || (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);

      if (headerToken) {
        const sesion = db.prepare(`
          SELECT s.token, s.usuario_id, u.nombre, u.rol, u.activo
          FROM sesiones s
          JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token = ? AND s.expires_at > datetime('now') AND u.activo = 1
        `).get(headerToken);

        if (!sesion) {
          return res.status(401).json({ error: 'Sesión expirada o inválida. Inicia sesión nuevamente.', code: 'UNAUTHORIZED' });
        }

        req.usuario = {
          id: sesion.usuario_id,
          nombre: sesion.nombre,
          rol: sesion.rol
        };
        return next();
      }

      // Fallback de compatibilidad progresiva si el cliente envía usuario_id en body o query
      const fallbackUserId = req.body?.usuario_id || req.query?.usuario_id;
      if (fallbackUserId) {
        const usuario = db.prepare('SELECT id, nombre, rol, activo FROM usuarios WHERE id = ? AND activo = 1').get(fallbackUserId);
        if (usuario) {
          req.usuario = {
            id: usuario.id,
            nombre: usuario.nombre,
            rol: usuario.rol
          };
          return next();
        }
      }

      return res.status(401).json({ error: 'Autenticación requerida. Ingresa tu PIN.', code: 'UNAUTHORIZED' });
    } catch (err) {
      res.status(500).json({ error: 'Error en la verificación de autenticación: ' + err.message });
    }
  };
}

/**
 * Middleware para restringir acceso por roles autorizados.
 * @param {...string} rolesPermitidos - Lista de roles (ej. 'admin', 'cajero')
 */
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'Autenticación requerida.', code: 'UNAUTHORIZED' });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol (${rolesPermitidos.join(' o ')}) para esta acción. Tu rol actual es (${req.usuario.rol}).`,
        code: 'FORBIDDEN'
      });
    }

    next();
  };
}

module.exports = {
  generarTokenSesion,
  destruirSesion,
  requireAuth,
  requireRole
};
