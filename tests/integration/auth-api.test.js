import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { generarTokenSesion, requireAuth, requireRole } from '../../server/middleware/auth';

describe('Auth & Role API Integration Tests', () => {
  let app;
  let testDb;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        rol TEXT NOT NULL,
        pin TEXT NOT NULL,
        activo INTEGER DEFAULT 1
      );

      CREATE TABLE sesiones (
        token TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );
    `);

    testDb.prepare("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (1, 'Admin', 'admin', '1234')").run();
    testDb.prepare("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (2, 'Mesero 1', 'mesero', '1111')").run();

    app = express();
    app.use(express.json());

    // Public login route
    app.post('/api/usuarios/login', (req, res) => {
      const { pin } = req.body;
      const usuario = testDb.prepare('SELECT id, nombre, rol FROM usuarios WHERE pin = ? AND activo = 1').get(pin);
      if (!usuario) return res.status(401).json({ error: 'PIN incorrecto' });

      const token = generarTokenSesion(usuario.id, 24, testDb);
      res.json({ token, usuario });
    });

    // Protected route (any authenticated user)
    app.get('/api/protegido', requireAuth(testDb), (req, res) => {
      res.json({ ok: true, usuario: req.usuario });
    });

    // Admin only route
    app.post('/api/admin/sensible', requireAuth(testDb), requireRole('admin', 'cajero'), (req, res) => {
      res.json({ ok: true, mensaje: 'Acción ejecutada por admin/cajero', ejecutadoPor: req.usuario.nombre });
    });
  });

  it('POST /api/usuarios/login emite un token de sesión válido', async () => {
    const res = await request(app)
      .post('/api/usuarios/login')
      .send({ pin: '1234' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.rol).toBe('admin');
  });

  it('GET /api/protegido rechaza peticiones sin token con 401 Unauthorized', async () => {
    const res = await request(app).get('/api/protegido');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/protegido permite el acceso cuando se envía x-session-token', async () => {
    const loginRes = await request(app).post('/api/usuarios/login').send({ pin: '1111' });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/protegido')
      .set('x-session-token', token);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.usuario.nombre).toBe('Mesero 1');
  });

  it('POST /api/admin/sensible rechaza al mesero con 403 Forbidden', async () => {
    const loginRes = await request(app).post('/api/usuarios/login').send({ pin: '1111' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/api/admin/sensible')
      .set('x-session-token', token)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('POST /api/admin/sensible permite el acceso al admin', async () => {
    const loginRes = await request(app).post('/api/usuarios/login').send({ pin: '1234' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/api/admin/sensible')
      .set('x-session-token', token)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ejecutadoPor).toBe('Admin');
  });
});
