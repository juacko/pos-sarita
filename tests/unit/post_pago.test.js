import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';

describe('Funcionalidad Acciones Post-Pago (Unit Tests)', () => {
  let app;
  let testDb;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre TEXT, rol TEXT, pin TEXT, activo INTEGER DEFAULT 1);
      CREATE TABLE sesiones (token TEXT PRIMARY KEY, usuario_id INTEGER, created_at DATETIME, expires_at DATETIME);
      CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, updated_at DATETIME);
    `);

    testDb.prepare("INSERT INTO usuarios (id, nombre, rol, pin) VALUES (1, 'Admin', 'admin', '1234')").run();

    app = express();
    app.use(express.json());

    app.get('/api/configuracion/:clave', (req, res) => {
      try {
        const fila = testDb.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(req.params.clave);
        if (!fila) return res.json(null);
        try { res.json(JSON.parse(fila.valor)); } catch { res.json(fila.valor); }
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    app.put('/api/admin/configuracion/:clave', (req, res) => {
      try {
        const { clave } = req.params;
        const { valor } = req.body;
        let valorStr = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
        testDb.prepare(`
          INSERT INTO configuracion (clave, valor, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = datetime('now')
        `).run(clave, valorStr);
        res.json({ ok: true, clave });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });
  });

  it('PUT /api/admin/configuracion/post_pago guarda las preferencias de post-pago', async () => {
    const postPagoConfig = {
      liberar_mesa: 'preguntar',
      imprimir_ticket: 'preguntar',
      ticket_marcado_defecto: false
    };

    const resPut = await request(app)
      .put('/api/admin/configuracion/post_pago')
      .set('x-user-id', '1')
      .send({ valor: postPagoConfig });

    expect(resPut.status).toBe(200);
    expect(resPut.body.ok).toBe(true);

    const resGet = await request(app).get('/api/configuracion/post_pago');
    expect(resGet.status).toBe(200);
    expect(resGet.body.liberar_mesa).toBe('preguntar');
    expect(resGet.body.ticket_marcado_defecto).toBe(false);
  });
});
