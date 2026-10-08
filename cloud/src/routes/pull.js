/**
 * GET /api/sync/pull — Envía registros modificados a un POS local.
 * 
 * Query params:
 *   tabla: nombre de la tabla
 *   since: ISO timestamp — solo registros recibidos después de esta fecha
 * 
 * Devuelve registros que fueron modificados por OTROS dispositivos
 * (excluye los que vinieron del mismo device que está pidiendo).
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

const ALLOWED_TABLES = [
  'usuarios', 'areas', 'mesas', 'categorias', 'productos',
  'variantes', 'modificadores', 'opciones_mod', 'agregados',
  'vales', 'configuracion'
];

router.get('/', async (req, res) => {
  const { tabla, since } = req.query;
  const deviceId = req.deviceId || req.headers['x-device-id'];

  if (!tabla) {
    return res.status(400).json({ error: 'Se requiere parámetro tabla' });
  }

  if (!ALLOWED_TABLES.includes(tabla)) {
    return res.status(400).json({ error: `Tabla '${tabla}' no permitida para pull` });
  }

  try {
    let sql, params;

    if (since) {
      // Registros recibidos después de 'since', excluyendo los del mismo device
      sql = `
        SELECT * FROM ${tabla}
        WHERE received_at > $1
          AND (source_device IS NULL OR source_device != $2)
        ORDER BY received_at ASC
        LIMIT 500
      `;
      params = [since, deviceId];
    } else {
      // Primera vez: enviar todo
      sql = `SELECT * FROM ${tabla} ORDER BY id ASC`;
      params = [];
    }

    const result = await pool.query(sql, params);

    res.json({
      ok: true,
      tabla,
      rows: result.rows,
      count: result.rows.length,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[PULL] Error en tabla ${tabla}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
