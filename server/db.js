const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'pos.db');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('admin','mesero','cajero','cocina')),
    pin TEXT NOT NULL,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL UNIQUE,
    nombre TEXT,
    capacidad INTEGER DEFAULT 4,
    estado TEXT NOT NULL DEFAULT 'LIBRE'
      CHECK(estado IN ('LIBRE','OCUPADO','RESERVADO','CERRANDO','INACTIVO')),
    mesero_id INTEGER,
    mesero_nombre TEXT,
    pedido_activo_id INTEGER,
    ocupado_desde DATETIME,
    version INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mesero_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280'
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    categoria_id INTEGER,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa_id INTEGER NOT NULL,
    mesa_numero INTEGER NOT NULL,
    mesero_id INTEGER,
    mesero_nombre TEXT,
    estado TEXT NOT NULL DEFAULT 'ABIERTO'
      CHECK(estado IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO','CERRADO','CANCELADO')),
    total REAL DEFAULT 0,
    nota TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id),
    FOREIGN KEY (mesero_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    producto_id INTEGER,
    producto_nombre TEXT NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unitario REAL NOT NULL,
    notas TEXT,
    estado TEXT DEFAULT 'PENDIENTE'
      CHECK(estado IN ('PENDIENTE','COCINANDO','LISTO','ENTREGADO','CANCELADO')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );

  CREATE TABLE IF NOT EXISTS logs_mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa_id INTEGER NOT NULL,
    accion TEXT NOT NULL,
    mesero_id INTEGER,
    detalle TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mesa_id) REFERENCES mesas(id)
  );
`);

const insertInitialData = db.transaction(() => {
  const count = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
  if (count.c === 0) {
    db.prepare('INSERT INTO usuarios (nombre, rol, pin) VALUES (?, ?, ?)').run('Admin', 'admin', '1234');
    db.prepare('INSERT INTO usuarios (nombre, rol, pin) VALUES (?, ?, ?)').run('Mesero 1', 'mesero', '1111');
    db.prepare('INSERT INTO usuarios (nombre, rol, pin) VALUES (?, ?, ?)').run('Caja', 'cajero', '2222');
    db.prepare('INSERT INTO usuarios (nombre, rol, pin) VALUES (?, ?, ?)').run('Cocina', 'cocina', '3333');
  }

  const mesaCount = db.prepare('SELECT COUNT(*) as c FROM mesas').get();
  if (mesaCount.c === 0) {
    const insert = db.prepare('INSERT INTO mesas (numero, nombre, capacidad) VALUES (?, ?, ?)');
    const mesas = [
      [1, 'Mesa 1', 2], [2, 'Mesa 2', 4], [3, 'Mesa 3', 4],
      [4, 'Mesa 4', 6], [5, 'Mesa 5', 2], [6, 'Mesa 6', 4],
      [7, 'Mesa 7', 4], [8, 'Mesa 8', 6], [9, 'Mesa 9', 2],
      [10, 'Mesa 10', 4], [11, 'Mesa 11', 4], [12, 'Mesa 12', 6]
    ];
    for (const m of mesas) insert.run(...m);
  }

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
  if (catCount.c === 0) {
    db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run('Bebidas', '#3B82F6');
    db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run('Platillos', '#10B981');
    db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run('Postres', '#F59E0B');
    db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run('Botanas', '#EF4444');
  }
});

insertInitialData();

module.exports = db;
