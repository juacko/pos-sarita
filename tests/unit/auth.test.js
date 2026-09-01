import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { generarTokenSesion, destruirSesion, requireAuth, requireRole } from '../../server/middleware/auth';

describe('Auth Middleware', () => {
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
  });

  it('generarTokenSesion debe insertar un token válido en la base de datos', () => {
    const token = generarTokenSesion(1, 24, testDb);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const row = testDb.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
    expect(row).toBeDefined();
    expect(row.usuario_id).toBe(1);
  });

  it('destruirSesion debe eliminar el token de la base de datos', () => {
    const token = generarTokenSesion(1, 24, testDb);
    destruirSesion(token, testDb);

    const row = testDb.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
    expect(row).toBeUndefined();
  });

  it('requireAuth debe pasar con token de sesión válido', () => {
    const token = generarTokenSesion(1, 24, testDb);
    const middleware = requireAuth(testDb);

    const req = { headers: { 'x-session-token': token } };
    let nextCalled = false;
    const res = {};

    middleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(req.usuario).toEqual({ id: 1, nombre: 'Admin', rol: 'admin' });
  });

  it('requireAuth debe rechazar con 401 si el token es inválido o no existe', () => {
    const middleware = requireAuth(testDb);

    const req = { headers: { 'x-session-token': 'token-invalido' } };
    let statusCode = null;
    let responseBody = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };

    middleware(req, res, () => {});

    expect(statusCode).toBe(401);
    expect(responseBody.code).toBe('UNAUTHORIZED');
  });

  it('requireRole debe permitir usuarios con el rol correcto', () => {
    const roleMiddleware = requireRole('admin', 'cajero');

    const req = { usuario: { id: 1, nombre: 'Admin', rol: 'admin' } };
    let nextCalled = false;
    const res = {};

    roleMiddleware(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });

  it('requireRole debe rechazar con 403 si el rol no tiene permisos', () => {
    const roleMiddleware = requireRole('admin', 'cajero');

    const req = { usuario: { id: 2, nombre: 'Mesero 1', rol: 'mesero' } };
    let statusCode = null;
    let responseBody = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; }
        };
      }
    };

    roleMiddleware(req, res, () => {});

    expect(statusCode).toBe(403);
    expect(responseBody.code).toBe('FORBIDDEN');
  });
});
