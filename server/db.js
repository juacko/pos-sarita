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
    color TEXT DEFAULT '#6B7280',
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    precio REAL NOT NULL,
    categoria_id INTEGER,
    para_llevar INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS variantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio_adicional REAL DEFAULT 0,
    activo INTEGER DEFAULT 1,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );

  CREATE TABLE IF NOT EXISTS modificadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'select' CHECK(tipo IN ('select','multi','text')),
    requerido INTEGER DEFAULT 0,
    max_opciones INTEGER DEFAULT 1,
    activo INTEGER DEFAULT 1,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );

  CREATE TABLE IF NOT EXISTS opciones_mod (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modificador_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio_adicional REAL DEFAULT 0,
    activo INTEGER DEFAULT 1,
    FOREIGN KEY (modificador_id) REFERENCES modificadores(id)
  );

  CREATE TABLE IF NOT EXISTS agregados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    maximo INTEGER DEFAULT 5,
    activo INTEGER DEFAULT 1,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
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
    precio_adicional REAL DEFAULT 0,
    notas TEXT,
    variante_id INTEGER,
    variante_nombre TEXT,
    modificadores_json TEXT DEFAULT '[]',
    agregados_json TEXT DEFAULT '[]',
    detalle TEXT DEFAULT '',
    estado TEXT DEFAULT 'PENDIENTE'
      CHECK(estado IN ('PENDIENTE','COCINANDO','LISTO','ENTREGADO','CANCELADO')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    metodo TEXT NOT NULL CHECK(metodo IN ('efectivo','tarjeta','transferencia','otros')),
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

function migrateColumns() {
  const piCols = db.prepare("SELECT name FROM pragma_table_info('pedido_items')").all().map(c => c.name);
  if (!piCols.includes('precio_adicional')) db.exec("ALTER TABLE pedido_items ADD COLUMN precio_adicional REAL DEFAULT 0");
  if (!piCols.includes('variante_id')) db.exec("ALTER TABLE pedido_items ADD COLUMN variante_id INTEGER");
  if (!piCols.includes('variante_nombre')) db.exec("ALTER TABLE pedido_items ADD COLUMN variante_nombre TEXT");
  if (!piCols.includes('modificadores_json')) db.exec("ALTER TABLE pedido_items ADD COLUMN modificadores_json TEXT DEFAULT '[]'");
  if (!piCols.includes('agregados_json')) db.exec("ALTER TABLE pedido_items ADD COLUMN agregados_json TEXT DEFAULT '[]'");
  if (!piCols.includes('detalle')) db.exec("ALTER TABLE pedido_items ADD COLUMN detalle TEXT DEFAULT ''");
  const pCols = db.prepare("SELECT name FROM pragma_table_info('productos')").all().map(c => c.name);
  if (!pCols.includes('descripcion')) db.exec("ALTER TABLE productos ADD COLUMN descripcion TEXT DEFAULT ''");
  if (!pCols.includes('para_llevar')) db.exec("ALTER TABLE productos ADD COLUMN para_llevar INTEGER DEFAULT 0");
  const cCols = db.prepare("SELECT name FROM pragma_table_info('categorias')").all().map(c => c.name);
  if (!cCols.includes('activo')) db.exec("ALTER TABLE categorias ADD COLUMN activo INTEGER DEFAULT 1");
  if (!cCols.includes('created_at')) db.exec("ALTER TABLE categorias ADD COLUMN created_at DATETIME");
}
migrateColumns();

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

  const insertCat = (nombre, color) => {
    if (!db.prepare('SELECT id FROM categorias WHERE nombre = ?').get(nombre)) {
      db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run(nombre, color);
    }
  };
  insertCat('Bebidas', '#3B82F6');
  insertCat('Platillos', '#10B981');
  insertCat('Postres', '#F59E0B');
  insertCat('Botanas', '#EF4444');
  insertCat('Cafetería', '#8B5CF6');
  insertCat('Cervezas', '#F97316');

  function getId(table, nameCol, nameVal) {
    const r = db.prepare(`SELECT id FROM ${table} WHERE ${nameCol} = ?`).get(nameVal);
    return r ? r.id : null;
  }

  const prodCount = db.prepare('SELECT COUNT(*) as c FROM productos').get();
  if (prodCount.c === 0) {
    const cat = (n) => getId('categorias', 'nombre', n);
    const ins = db.prepare('INSERT INTO productos (nombre, descripcion, precio, categoria_id) VALUES (?, ?, ?, ?)');
    ins.run('Hamburguesa Clásica', 'Carne 150g, lechuga, tomate, cebolla, aderezo', 89, cat('Platillos'));
    ins.run('Hamburguesa Doble', 'Doble carne 300g, queso, tocino, lechuga, tomate', 129, cat('Platillos'));
    ins.run('Alitas BBQ', '6 piezas con salsa BBQ ahumada', 99, cat('Botanas'));
    ins.run('Papas Fritas', 'Papas crujientes con sal de mar', 49, cat('Botanas'));
    ins.run('Refresco de Cola', 'Refresco de cola 355ml', 25, cat('Bebidas'));
    ins.run('Limonada Natural', 'Limonada fresca con hierbabuena', 35, cat('Bebidas'));
    ins.run('Pay de Queso', 'Rebanada de pay de queso con caramelo', 55, cat('Postres'));
    ins.run('Brownie con Helado', 'Brownie de chocolate con helado de vainilla', 65, cat('Postres'));
    ins.run('Café Americano', 'Café americano recién hecho', 30, cat('Cafetería'));
    ins.run('Café Latte', 'Café latte con leche vaporizada', 40, cat('Cafetería'));
    ins.run('Cerveza Clara', 'Cerveza clara 355ml', 40, cat('Cervezas'));
    ins.run('Cerveza Oscura', 'Cerveza oscura artesanal 355ml', 50, cat('Cervezas'));
  }

  const varCount = db.prepare('SELECT COUNT(*) as c FROM variantes').get();
  if (varCount.c === 0) {
    const ins = db.prepare('INSERT INTO variantes (producto_id, nombre, precio_adicional) VALUES (?, ?, ?)');
    const p1 = getId('productos', 'nombre', 'Hamburguesa Clásica');
    const p2 = getId('productos', 'nombre', 'Hamburguesa Doble');
    const p5 = getId('productos', 'nombre', 'Refresco de Cola');
    const p6 = getId('productos', 'nombre', 'Limonada Natural');
    const p11 = getId('productos', 'nombre', 'Cerveza Clara');
    if (p1) { ins.run(p1, 'Sencilla', 0); ins.run(p1, 'Con Queso', 15); ins.run(p1, 'Con Tocino', 20); }
    if (p2) { ins.run(p2, 'Sencilla', 0); ins.run(p2, 'Con Queso', 15); }
    if (p5) { ins.run(p5, 'Vaso Chico', 0); ins.run(p5, 'Vaso Grande', 10); }
    if (p6) { ins.run(p6, 'Vaso Chico', 0); ins.run(p6, 'Vaso Grande', 10); }
    if (p11) { ins.run(p11, 'Botella', 0); ins.run(p11, 'Caguama', 20); }
  }

  const modCount = db.prepare('SELECT COUNT(*) as c FROM modificadores').get();
  if (modCount.c === 0) {
    const ins = db.prepare('INSERT INTO modificadores (producto_id, nombre, tipo, requerido, max_opciones) VALUES (?, ?, ?, ?, ?)');
    const p1 = getId('productos', 'nombre', 'Hamburguesa Clásica');
    const p2 = getId('productos', 'nombre', 'Hamburguesa Doble');
    const p6 = getId('productos', 'nombre', 'Limonada Natural');
    const p3 = getId('productos', 'nombre', 'Alitas BBQ');
    if (p1) { ins.run(p1, 'Término de la carne', 'select', 1, 1); ins.run(p1, 'Ingredientes extra', 'multi', 0, 3); }
    if (p2) ins.run(p2, 'Término de la carne', 'select', 1, 1);
    if (p6) ins.run(p6, 'Tipo de endulzante', 'select', 0, 1);
    if (p3) ins.run(p3, 'Tipo de salsa', 'select', 1, 1);
  }

  const opcCount = db.prepare('SELECT COUNT(*) as c FROM opciones_mod').get();
  if (opcCount.c === 0) {
    const ins = db.prepare('INSERT INTO opciones_mod (modificador_id, nombre, precio_adicional) VALUES (?, ?, ?)');
    const modTermino = db.prepare("SELECT id FROM modificadores WHERE nombre = 'Término de la carne' LIMIT 1").get();
    const modIngredientes = db.prepare("SELECT id FROM modificadores WHERE nombre = 'Ingredientes extra' LIMIT 1").get();
    const modEndulzante = db.prepare("SELECT id FROM modificadores WHERE nombre = 'Tipo de endulzante' LIMIT 1").get();
    const modSalsa = db.prepare("SELECT id FROM modificadores WHERE nombre = 'Tipo de salsa' LIMIT 1").get();
    if (modTermino) {
      ins.run(modTermino.id, 'Término medio', 0); ins.run(modTermino.id, 'Tres cuartos', 0); ins.run(modTermino.id, 'Bien cocido', 0);
    }
    if (modIngredientes) {
      ins.run(modIngredientes.id, 'Queso extra', 15); ins.run(modIngredientes.id, 'Tocino', 20);
      ins.run(modIngredientes.id, 'Aguacate', 18); ins.run(modIngredientes.id, 'Huevo', 10);
    }
    if (modEndulzante) {
      ins.run(modEndulzante.id, 'Azúcar', 0); ins.run(modEndulzante.id, 'Splenda', 0); ins.run(modEndulzante.id, 'Miel', 5);
    }
    if (modSalsa) {
      ins.run(modSalsa.id, 'BBQ', 0); ins.run(modSalsa.id, 'Buffalo', 0); ins.run(modSalsa.id, 'Mango Habanero', 0);
    }
  }

  const agrCount = db.prepare('SELECT COUNT(*) as c FROM agregados').get();
  if (agrCount.c === 0) {
    const ins = db.prepare('INSERT INTO agregados (producto_id, nombre, precio, maximo) VALUES (?, ?, ?, ?)');
    const p3 = getId('productos', 'nombre', 'Alitas BBQ');
    const p4 = getId('productos', 'nombre', 'Papas Fritas');
    const p7 = getId('productos', 'nombre', 'Pay de Queso');
    const p8 = getId('productos', 'nombre', 'Brownie con Helado');
    const p9 = getId('productos', 'nombre', 'Café Americano');
    if (p3) ins.run(p3, 'Aderezo extra', 10, 3);
    if (p4) { ins.run(p4, 'Queso derretido', 15, 2); ins.run(p4, 'Chile en polvo', 0, 2); }
    if (p7) ins.run(p7, 'Crema extra', 10, 2);
    if (p8) ins.run(p8, 'Helado extra', 20, 2);
    if (p9) ins.run(p9, 'Leche de almendras', 10, 1);
  }
});

insertInitialData();

module.exports = db;
