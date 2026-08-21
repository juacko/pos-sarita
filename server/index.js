const express = require('express');
const http = require('http');
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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/mesas', createMesasRouter(io));
app.use('/api/pedidos', createPedidosRouter(io));
app.use('/api/productos', createProductosRouter(io));
app.use('/api/usuarios', createUsuariosRouter());
app.use('/api/admin', createAdminRouter(io));

app.get('/api/printers/config', (req, res) => {
  res.json(printers.getConfig());
});

app.get('/api/configuracion/:clave', (req, res) => {
  const fila = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(req.params.clave);
  if (!fila) return res.status(404).json({ error: 'Clave no encontrada' });
  try { res.json(JSON.parse(fila.valor)); } catch { res.json(fila.valor); }
});

app.post('/api/printers/config', (req, res) => {
  res.json(printers.updateConfig(req.body));
});

app.post('/api/printers/test/:printerName', (req, res) => {
  const result = printers.testPrinter(req.params.printerName);
  res.json(result);
});

app.get('/api/printers/detect', (req, res) => {
  try {
    const detected = printers.detectPrinters();
    res.json(detected);
  } catch (err) {
    console.error('[DETECT ERROR]', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

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

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = require('os').networkInterfaces();
  let ip = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ip = iface.address;
        break;
      }
    }
    if (ip !== 'localhost') break;
  }

  console.log(`
╔══════════════════════════════════════════╗
║      POS SARITA - RESTAURANTE           ║
║──────────────────────────────────────────║
║  Servidor corriendo en:                 ║
║  Local:   http://localhost:${PORT}        ║
║  Red:     http://${ip}:${PORT}            ║
║──────────────────────────────────────────║
║  Accesos rápidos:                       ║
║  POS:     http://${ip}:${PORT}/           ║
║  Cocina:  http://${ip}:${PORT}/cocina.html ║
║  Barra:   http://${ip}:${PORT}/barra.html  ║
║──────────────────────────────────────────║
║  PINs por defecto:                      ║
║  Admin: 1234  |  Mesero: 1111           ║
║  Caja:  2222  |  Cocina/Barra: 3333     ║
╚══════════════════════════════════════════╝
`);
});
