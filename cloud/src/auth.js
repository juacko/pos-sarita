/**
 * Middleware de autenticación para la Sync API.
 * Valida el header X-Sync-Key contra la clave configurada.
 */
function syncAuth(req, res, next) {
  const apiKey = process.env.SYNC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'SYNC_API_KEY no configurada en el servidor' });
  }

  const providedKey = req.headers['x-sync-key'];
  if (!providedKey || providedKey !== apiKey) {
    return res.status(401).json({ error: 'API key inválida o ausente' });
  }

  // Extraer device ID del header
  req.deviceId = req.headers['x-device-id'] || 'unknown';
  next();
}

module.exports = syncAuth;
