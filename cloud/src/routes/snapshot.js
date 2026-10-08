/**
 * GET/POST /api/sync/snapshot — Dump completo de la base de datos para setup o recuperación inicial.
 * 
 * GET: Devuelve todas las filas de todas las tablas sincronizables.
 * POST: Recibe un dump completo y lo inserta en PostgreSQL.
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Orden de dependencias (para no romper FK en caso de inserción)
const TABLES_ORDER = [
  'configuracion', 'usuarios', 'areas', 'categorias',
  'mesas', 'productos', 'variantes', 'modificadores', 'opciones_mod',
  'agregados', 'vales',
  'pedidos', 'pedido_items', 'pagos', 'descuentos',
  'caja_sesiones', 'caja_movimientos', 'pagos_log', 'logs_mesas'
];

// GET /api/sync/snapshot — Descargar dump completo
router.get('/', async (req, res) => {
  try {
    const snapshot = {};

    for (const tabla of TABLES_ORDER) {
      const result = await pool.query(`SELECT * FROM ${tabla} ORDER BY id ASC`);
      snapshot[tabla] = result.rows;
    }

    res.json(snapshot);
  } catch (err) {
    console.error('[SNAPSHOT GET] Error generando dump:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/snapshot — Subir dump completo inicial
router.post('/', async (req, res) => {
  const { deviceId, snapshot } = req.body;

  if (!snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ error: 'Se requiere objeto snapshot' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const EXCLUDE_COLS = ['received_at', 'source_device'];
    let totalInserted = 0;

    for (const tabla of TABLES_ORDER) {
      const rows = snapshot[tabla];
      if (!rows || !Array.isArray(rows) || rows.length === 0) continue;

      for (const row of rows) {
        if (!row.uuid && tabla !== 'configuracion') continue;

        const cols = Object.keys(row).filter(c => c !== 'id' && !EXCLUDE_COLS.includes(c));
        const values = cols.map(c => row[c]);

        cols.push('source_device', 'received_at');
        values.push(deviceId || req.deviceId, new Date().toISOString());

        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const conflictCol = tabla === 'configuracion' ? 'clave' : 'uuid';

        const updateCols = cols
          .filter(c => c !== 'uuid' && (tabla !== 'configuracion' || c !== 'clave'))
          .map(c => `${c} = EXCLUDED.${c}`)
          .join(', ');

        const sql = `
          INSERT INTO ${tabla} (${cols.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateCols}
        `;

        await client.query(sql, values);
        totalInserted++;
      }
    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      message: 'Snapshot importado correctamente',
      totalInserted
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[SNAPSHOT POST] Error importando dump:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
