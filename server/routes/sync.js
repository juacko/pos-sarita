/**
 * Rutas de sincronización — endpoints locales para controlar el SyncWorker.
 * 
 * GET  /api/sync/status    → Estado actual de la sincronización
 * POST /api/sync/now       → Forzar sincronización inmediata
 * POST /api/sync/snapshot  → Forzar descarga de snapshot completo
 */

const express = require('express');

/**
 * @param {import('../sync/SyncWorker')} syncWorker
 * @returns {express.Router}
 */
function createSyncRouter(syncWorker) {
  const router = express.Router();

  // Estado actual del worker
  router.get('/status', (req, res) => {
    if (!syncWorker) {
      return res.json({
        enabled: false,
        online: false,
        syncing: false,
        message: 'Sincronización no configurada'
      });
    }
    res.json(syncWorker.getStatus());
  });

  // Forzar sincronización inmediata
  router.post('/now', async (req, res) => {
    if (!syncWorker) {
      return res.status(400).json({ error: 'Sincronización no configurada' });
    }
    try {
      const result = await syncWorker.syncNow();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Forzar descarga de snapshot completo
  router.post('/snapshot', async (req, res) => {
    if (!syncWorker) {
      return res.status(400).json({ error: 'Sincronización no configurada' });
    }
    try {
      await syncWorker._pullSnapshot();
      res.json({ ok: true, message: 'Snapshot descargado exitosamente' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createSyncRouter;
