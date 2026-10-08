require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const createMesasRouter = require('./routes/mesas');
const createPedidosRouter = require('./routes/pedidos');
const createProductosRouter = require('./routes/productos');
const createUsuariosRouter = require('./routes/usuarios');
const createAdminRouter = require('./routes/admin');
const printers = require('./printers');
const configRepo = require('./repositories/ConfigRepository');
const errorHandler = require('./middleware/errorHandler');
const SyncWorker = require('./sync/SyncWorker');
const syncConfig = require('./sync/config');
const createSyncRouter = require('./routes/sync');

const app = express();

// Cargar certificados SSL si existen
let sslOptions = null;
const sslKeyPath = path.join(__dirname, '..', 'ssl', 'server.key');
const sslCertPath = path.join(__dirname, '..', 'ssl', 'server.cert');
if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
  try {
    sslOptions = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath)
    };
  } catch (err) {
    console.error('[SSL] Error cargando certificados:', err.message);
  }
}

const httpServer = http.createServer(app);
const httpsServer = sslOptions ? https.createServer(sslOptions, app) : null;

const io = new Server({
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }
});
io.attach(httpServer);
if (httpsServer) {
  io.attach(httpsServer);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const { requireAuth } = require('./middleware/auth');

app.use('/api/mesas', requireAuth(), createMesasRouter(io));
app.use('/api/pedidos', requireAuth(), createPedidosRouter(io));
app.use('/api/productos', requireAuth(), createProductosRouter(io));
app.use('/api/usuarios', createUsuariosRouter());
app.use('/api/admin', requireAuth(), createAdminRouter(io));

// ─── Sincronización con Oracle Cloud ───
let syncWorker = null;
if (syncConfig.enabled) {
  syncWorker = new SyncWorker(db, io);
}
app.use('/api/sync', requireAuth(), createSyncRouter(syncWorker));

app.get('/api/printers/config', requireAuth(), (req, res) => {
  res.json(printers.getConfig());
});

app.get('/api/configuracion/:clave', requireAuth(), (req, res) => {
  const fila = configRepo.obtenerPorClave(req.params.clave);
  if (!fila) return res.status(404).json({ error: 'Clave no encontrada' });
  try { res.json(JSON.parse(fila.valor)); } catch { res.json(fila.valor); }
});

app.post('/api/printers/config', requireAuth(), (req, res) => {
  res.json(printers.updateConfig(req.body));
});

app.post('/api/printers/test/:printerName', requireAuth(), (req, res) => {
  const result = printers.testPrinter(req.params.printerName);
  if (result && !result.ok && result.reason !== 'paperless') {
    const motivo = result.reason === 'disabled' ? 'Impresora deshabilitada en configuración' : result.reason;
    io.emit('printer:error', { impresora: req.params.printerName, motivo });
  }
  res.json(result);
});

app.post('/api/printers/simular-error', requireAuth(), (req, res) => {
  const { impresora = 'cocina', motivo = 'Prueba de alerta: Error de conexión' } = req.body || {};
  io.emit('printer:error', { impresora, motivo });
  res.json({ ok: true, mensaje: `Alerta emitida para ${impresora}` });
});

app.get('/api/printers/detect', requireAuth(), (req, res) => {
  try {
    const detected = printers.detectPrinters();
    res.json(detected);
  } catch (err) {
    console.error('[DETECT ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// Middleware centralizado de errores para todas las rutas de la API
app.use(errorHandler);

io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  socket.on('join:mesa', (mesaId) => {
    socket.join(`mesa:${mesaId}`);
  });

  socket.on('leave:mesa', (mesaId) => {
    socket.leave(`mesa:${mesaId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

const interfaces = require('os').networkInterfaces();
let ip = 'localhost';
for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      // Priorizar interfaz wifi/lan local 192.168.*
      if (iface.address.startsWith('192.168.18.') || iface.address.startsWith('192.168.')) {
        ip = iface.address;
        break;
      }
      if (ip === 'localhost') ip = iface.address;
    }
  }
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[HTTP] Servidor HTTP activo en http://localhost:${PORT} y http://${ip}:${PORT}`);
  // Iniciar sincronización después de que el servidor esté escuchando
  if (syncWorker) syncWorker.start();
});

if (httpsServer) {
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                POS SARITA - MODO SEGURO HTTPS                ║
╠══════════════════════════════════════════════════════════════╣
║  🔒 HTTPS (PWA Instalable sin barra de direcciones):         ║
║     Red local:   https://${ip}:${HTTPS_PORT}/mesero.html           ║
║     Local:       https://localhost:${HTTPS_PORT}/mesero.html       ║
║                                                              ║
║  🌐 HTTP (Estándar):                                         ║
║     Red local:   http://${ip}:${PORT}/                             ║
║     Local:       http://localhost:${PORT}/                         ║
╠══════════════════════════════════════════════════════════════╣
║  📱 Para instalar PWA en celular:                            ║
║     1. Entra a: https://${ip}:${HTTPS_PORT}/mesero.html            ║
║     2. Si sale aviso de certificado, dale "Avanzado" ➔       ║
║        "Continuar a ${ip} (sitio no seguro)".                 ║
║     3. Menú (3 puntos) ➔ "Instalar aplicación".              ║
║     ¡Listo! Se abre como app nativa 100% sin barra de URL.  ║
╚══════════════════════════════════════════════════════════════╝
`);
  });
} else {
  console.log(`[AVISO] No se encontraron certificados SSL en /ssl. Solo HTTP habilitado.`);
}
