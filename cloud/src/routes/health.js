/**
 * GET /api/sync/health — Health check del servidor de sincronización.
 */
const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({
      ok: true,
      time: result.rows[0].time,
      service: 'pos-sarita-sync-api'
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
