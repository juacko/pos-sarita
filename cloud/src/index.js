/**
 * Entry point del Servidor de Sincronización en Oracle Cloud (Sync API).
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authMiddleware = require('./auth');
const healthRoutes = require('./routes/health');
const pushRoutes = require('./routes/push');
const pullRoutes = require('./routes/pull');
const snapshotRoutes = require('./routes/snapshot');

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json({ limit: '50mb' }));

// Health check público (para validación de ping y estado del contenedor)
app.use('/api/sync/health', healthRoutes);

// Rutas protegidas con API Key
app.use('/api/sync/push', authMiddleware, pushRoutes);
app.use('/api/sync/pull', authMiddleware, pullRoutes);
app.use('/api/sync/snapshot', authMiddleware, snapshotRoutes);

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  console.error('[CLOUD API ERROR]', err);
  res.status(500).json({ error: err.message || 'Error interno del servidor de sincronización' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ORACLE CLOUD SYNC API] Servidor activo escuchando en el puerto ${PORT}`);
});
