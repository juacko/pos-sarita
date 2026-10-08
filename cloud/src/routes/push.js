/**
 * POST /api/sync/push — Recibe un lote de registros de un POS local.
 * 
 * Body: { tabla: string, deviceId: string, rows: Object[], isCatalog?: boolean }
 * 
 * Usa UPSERT (INSERT ON CONFLICT uuid DO UPDATE) para evitar duplicados.
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Tablas permitidas para push
const ALLOWED_TABLES = [
  'pedidos', 'pedido_items', 'pagos', 'descuentos',
  'caja_sesiones', 'caja_movimientos', 'pagos_log', 'logs_mesas',
  'usuarios', 'areas', 'mesas', 'categorias', 'productos',
  'variantes', 'modificadores', 'opciones_mod', 'agregados',
  'vales', 'configuracion'
];

// Columnas que NO se deben insertar desde el POS (se gestionan en el cloud)
const EXCLUDE_COLS = ['received_at', 'source_device'];

router.post('/', async (req, res) => {
  const { tabla, rows, deviceId } = req.body;

  if (!tabla || !rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Se requiere tabla y rows (array no vacío)' });
  }

  if (!ALLOWED_TABLES.includes(tabla)) {
    return res.status(400).json({ error: `Tabla '${tabla}' no permitida para sync` });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      if (!row.uuid) continue; // Sin uuid no se puede sincronizar

      // Filtrar columnas excluidas y 'id' (se auto-genera en PostgreSQL)
      const cols = Object.keys(row).filter(c => c !== 'id' && !EXCLUDE_COLS.includes(c));
      const values = cols.map(c => row[c]);

      // Agregar source_device y received_at
      cols.push('source_device', 'received_at');
      values.push(deviceId || req.deviceId, new Date().toISOString());

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

      // UPSERT: INSERT o UPDATE si uuid ya existe
      const updateCols = cols
        .filter(c => c !== 'uuid' && (tabla !== 'configuracion' || c !== 'clave'))
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(', ');

      const conflictCol = tabla === 'configuracion' ? 'clave' : 'uuid';

      const sql = `
        INSERT INTO ${tabla} (${cols.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateCols}
      `;

      const result = await client.query(sql, values);
      if (result.rowCount > 0) {
        // PostgreSQL no distingue fácilmente insert vs update en UPSERT,
        // contamos todo como "procesado"
        inserted += result.rowCount;
      }
    }

    // Actualizar registro de sincronización
    await client.query(`
      INSERT INTO sync_registry (device_id, tabla, last_received_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (device_id, tabla) DO UPDATE SET last_received_at = NOW()
    `, [deviceId || req.deviceId, tabla]);

    await client.query('COMMIT');

    res.json({
      ok: true,
      tabla,
      processed: inserted,
      total: rows.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[PUSH] Error en tabla ${tabla}:`, err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
