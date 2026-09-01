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

  CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'SALON' CHECK(tipo IN ('SALON','DELIVERY','PARA_LLEVAR')),
    orden INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL UNIQUE,
    nombre TEXT,
    capacidad INTEGER DEFAULT 4,
    area_id INTEGER,
    es_virtual INTEGER DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'LIBRE'
      CHECK(estado IN ('LIBRE','OCUPADO','RESERVADO','CERRANDO','INACTIVO')),
    mesero_id INTEGER,
    mesero_nombre TEXT,
    pedido_activo_id INTEGER,
    ocupado_desde DATETIME,
    version INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mesero_id) REFERENCES usuarios(id),
    FOREIGN KEY (area_id) REFERENCES areas(id)
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
    controlar_stock INTEGER DEFAULT 0,
    stock_actual INTEGER DEFAULT 0,
    stock_minimo INTEGER DEFAULT 3,
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
    cliente_nombre TEXT,
    cliente_telefono TEXT,
    cliente_direccion TEXT,
    hora_recogida TEXT,
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
    cantidad_pagada INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    metodo TEXT NOT NULL,
    propina REAL DEFAULT 0,
    referencia TEXT,
    notas TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS descuentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('porcentaje','monto_fijo')),
    valor REAL NOT NULL,
    motivo TEXT NOT NULL,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS vales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    monto_inicial REAL NOT NULL,
    monto_restante REAL NOT NULL,
    cliente_nombre TEXT,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS caja_sesiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    fondo_inicial REAL NOT NULL DEFAULT 0,
    efectivo_contado REAL,
    estado TEXT NOT NULL DEFAULT 'ABIERTA' CHECK(estado IN ('ABIERTA','CERRADA')),
    notas_apertura TEXT,
    notas_cierre TEXT,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    absorbe_desde DATETIME,
    closed_at DATETIME,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS caja_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK(tipo IN ('INGRESO','EGRESO')),
    concepto TEXT NOT NULL,
    monto REAL NOT NULL,
    metodo_pago TEXT NOT NULL,
    persona TEXT,
    usuario_id INTEGER,
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS pagos_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    pago_id INTEGER,
    accion TEXT NOT NULL,
    motivo TEXT,
    detalle TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (pago_id) REFERENCES pagos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
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

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
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
  if (!piCols.includes('destino_impresion')) db.exec("ALTER TABLE pedido_items ADD COLUMN destino_impresion TEXT DEFAULT 'cocina'");
  if (!piCols.includes('cantidad_pagada')) db.exec("ALTER TABLE pedido_items ADD COLUMN cantidad_pagada INTEGER DEFAULT 0");
  const pCols = db.prepare("SELECT name FROM pragma_table_info('productos')").all().map(c => c.name);
  if (!pCols.includes('descripcion')) db.exec("ALTER TABLE productos ADD COLUMN descripcion TEXT DEFAULT ''");
  if (!pCols.includes('para_llevar')) db.exec("ALTER TABLE productos ADD COLUMN para_llevar INTEGER DEFAULT 0");
  if (!pCols.includes('destino_override')) db.exec("ALTER TABLE productos ADD COLUMN destino_override TEXT DEFAULT NULL");
  if (!pCols.includes('controlar_stock')) db.exec("ALTER TABLE productos ADD COLUMN controlar_stock INTEGER DEFAULT 0");
  if (!pCols.includes('stock_actual')) db.exec("ALTER TABLE productos ADD COLUMN stock_actual INTEGER DEFAULT 0");
  if (!pCols.includes('stock_minimo')) db.exec("ALTER TABLE productos ADD COLUMN stock_minimo INTEGER DEFAULT 3");
  const cCols = db.prepare("SELECT name FROM pragma_table_info('categorias')").all().map(c => c.name);
  if (!cCols.includes('activo')) db.exec("ALTER TABLE categorias ADD COLUMN activo INTEGER DEFAULT 1");
  if (!cCols.includes('created_at')) db.exec("ALTER TABLE categorias ADD COLUMN created_at DATETIME");
  if (!cCols.includes('destino')) db.exec("ALTER TABLE categorias ADD COLUMN destino TEXT DEFAULT 'cocina'");

  const pgCols = db.prepare("SELECT name FROM pragma_table_info('pagos')").all().map(c => c.name);
  if (!pgCols.includes('propina')) db.exec("ALTER TABLE pagos ADD COLUMN propina REAL DEFAULT 0");
  if (!pgCols.includes('referencia')) db.exec("ALTER TABLE pagos ADD COLUMN referencia TEXT");
  if (!pgCols.includes('notas')) db.exec("ALTER TABLE pagos ADD COLUMN notas TEXT");
  if (!pgCols.includes('usuario_id')) db.exec("ALTER TABLE pagos ADD COLUMN usuario_id INTEGER");

  const mCols = db.prepare("SELECT name FROM pragma_table_info('mesas')").all().map(c => c.name);
  if (!mCols.includes('area_id')) db.exec("ALTER TABLE mesas ADD COLUMN area_id INTEGER");
  if (!mCols.includes('es_virtual')) db.exec("ALTER TABLE mesas ADD COLUMN es_virtual INTEGER DEFAULT 0");
  const pedCols = db.prepare("SELECT name FROM pragma_table_info('pedidos')").all().map(c => c.name);
  if (!pedCols.includes('cliente_nombre')) db.exec("ALTER TABLE pedidos ADD COLUMN cliente_nombre TEXT");
  if (!pedCols.includes('cliente_telefono')) db.exec("ALTER TABLE pedidos ADD COLUMN cliente_telefono TEXT");
  if (!pedCols.includes('cliente_direccion')) db.exec("ALTER TABLE pedidos ADD COLUMN cliente_direccion TEXT");
  if (!pedCols.includes('hora_recogida')) db.exec("ALTER TABLE pedidos ADD COLUMN hora_recogida TEXT");
  if (!pedCols.includes('motivo_cancelacion')) db.exec("ALTER TABLE pedidos ADD COLUMN motivo_cancelacion TEXT");
  if (!pedCols.includes('anulado_por')) db.exec("ALTER TABLE pedidos ADD COLUMN anulado_por INTEGER");

  const modCols = db.prepare("SELECT name FROM pragma_table_info('modificadores')").all().map(c => c.name);
  if (!modCols.includes('depende_variante_id')) db.exec("ALTER TABLE modificadores ADD COLUMN depende_variante_id INTEGER");

  const csCols = db.prepare("SELECT name FROM pragma_table_info('caja_sesiones')").all().map(c => c.name);
  if (!csCols.includes('total_ventas')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN total_ventas REAL DEFAULT 0");
  if (!csCols.includes('propinas')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN propinas REAL DEFAULT 0");
  if (!csCols.includes('efectivo_esperado')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN efectivo_esperado REAL");
  if (!csCols.includes('sobrante_faltante')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN sobrante_faltante REAL");
  if (!csCols.includes('total_pedidos')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN total_pedidos INTEGER DEFAULT 0");
  if (!csCols.includes('desglose_json')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN desglose_json TEXT");
  if (!csCols.includes('cerrada_por')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN cerrada_por INTEGER");
  if (!csCols.includes('absorbe_desde')) db.exec("ALTER TABLE caja_sesiones ADD COLUMN absorbe_desde DATETIME");
}
migrateColumns();

// ─── Migración: modificador "Tipo de pasta" dependiente de la guarnición "Pastas" ───
function migrarTipoPastaCombos() {
  const combos = db.prepare(`
    SELECT p.id FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    WHERE c.nombre = 'Combos'
  `).all();
  for (const combo of combos) {
    const varPasta = db.prepare("SELECT id FROM variantes WHERE producto_id = ? AND LOWER(nombre) = 'pastas'").get(combo.id);
    if (!varPasta) continue;

    // Modificadores tipo pasta existentes (incluye el antiguo "pasta" sin dependencia)
    const pastaMods = db.prepare(
      "SELECT id, nombre, depende_variante_id FROM modificadores WHERE producto_id = ? AND LOWER(nombre) IN ('tipo de pasta','pasta','pastas')"
    ).all(combo.id);

    // Priorizar el que ya es dependiente; si no, convertir el antiguo "pasta"
    let keep = pastaMods.find(m => m.depende_variante_id == varPasta.id);
    if (!keep && pastaMods.length) {
      db.prepare("UPDATE modificadores SET nombre = 'Tipo de pasta', tipo = 'select', requerido = 1, depende_variante_id = ? WHERE id = ?")
        .run(varPasta.id, pastaMods[0].id);
      keep = { id: pastaMods[0].id };
    }
    if (!keep) {
      const r = db.prepare("INSERT INTO modificadores (producto_id, nombre, tipo, requerido, max_opciones, depende_variante_id) VALUES (?, 'Tipo de pasta', 'select', 1, 1, ?)")
        .run(combo.id, varPasta.id);
      keep = { id: r.lastInsertRowid };
      const insOpc = db.prepare('INSERT INTO opciones_mod (modificador_id, nombre, precio_adicional) VALUES (?, ?, ?)');
      for (const [nombre, precio] of [['Pasta al Pesto', 0], ['Pasta Huancaína', 0], ['Pasta Alfredo', 0]]) {
        insOpc.run(keep.id, nombre, precio);
      }
    }
    // Eliminar duplicados (otros modificadores tipo pasta en el mismo combo)
    for (const m of pastaMods) {
      if (m.id == keep.id) continue;
      db.prepare('DELETE FROM opciones_mod WHERE modificador_id = ?').run(m.id);
      db.prepare('DELETE FROM modificadores WHERE id = ?').run(m.id);
    }
  }
}
migrarTipoPastaCombos();

// ─── Migración: quitar CHECK de método de pago (métodos editables) ───
function rebuildSinCheck(nombre, createSql) {
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(nombre);
  if (!info || !info.sql) return;
  if (!/CHECK\s*\(/i.test(info.sql)) return;
  try {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`ALTER TABLE ${nombre} RENAME TO ${nombre}_old`);
    db.exec(createSql);
    db.exec(`INSERT INTO ${nombre} SELECT * FROM ${nombre}_old`);
    db.exec(`DROP TABLE ${nombre}_old`);
    db.exec('PRAGMA foreign_keys = ON');
  } catch (e) {
    db.exec('PRAGMA foreign_keys = ON');
    throw e;
  }
}
rebuildSinCheck('pagos', `
  CREATE TABLE pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    metodo TEXT NOT NULL,
    propina REAL DEFAULT 0,
    referencia TEXT,
    notas TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )
`);
rebuildSinCheck('caja_movimientos', `
  CREATE TABLE caja_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK(tipo IN ('INGRESO','EGRESO')),
    concepto TEXT NOT NULL,
    monto REAL NOT NULL,
    metodo_pago TEXT NOT NULL,
    persona TEXT,
    usuario_id INTEGER,
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  )
`);

// Tras renombrar, SQLite reescribe las FK de otras tablas hacia <nombre>_old;
// reparar cualquier referencia colgante (p.ej. pagos_log.pago_id -> pagos_old).
function repararFksHuerfanas(nombreViejo) {
  const nombreCorrecto = nombreViejo.replace(/_old$/, '');
  const re = new RegExp(`REFERENCES\\s+"${nombreViejo}"`, 'g');
  const tablas = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL").all();
  for (const t of tablas) {
    if (!t.sql.includes(`"${nombreViejo}"`)) continue;
    const sqlNuevo = t.sql.replace(re, `REFERENCES ${nombreCorrecto}`);
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`ALTER TABLE ${t.name} RENAME TO ${t.name}_aux`);
    db.exec(sqlNuevo);
    db.exec(`INSERT INTO ${t.name} SELECT * FROM ${t.name}_aux`);
    db.exec(`DROP TABLE ${t.name}_aux`);
    db.exec('PRAGMA foreign_keys = ON');
  }
}
repararFksHuerfanas('pagos_old');

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

  // Áreas (Salón / Terraza configurables + canales Delivery / Para Llevar)
  const areaCount = db.prepare('SELECT COUNT(*) as c FROM areas').get();
  if (areaCount.c === 0) {
    const insertArea = db.prepare('INSERT INTO areas (nombre, tipo, orden) VALUES (?, ?, ?)');
    insertArea.run('Salón Principal', 'SALON', 1);
    insertArea.run('Terraza', 'SALON', 2);
    insertArea.run('Delivery', 'DELIVERY', 3);
    insertArea.run('Para Llevar', 'PARA_LLEVAR', 4);
  }

  // Asignar mesas sin área al primer Salón
  const salonArea = db.prepare("SELECT id FROM areas WHERE tipo = 'SALON' ORDER BY orden ASC LIMIT 1").get();
  if (salonArea) {
    db.prepare('UPDATE mesas SET area_id = ? WHERE area_id IS NULL AND es_virtual = 0').run(salonArea.id);
  }

  // Asegurar una mesa virtual por canal
  function ensureVirtualMesa(tipo, nombre, baseNum) {
    const area = db.prepare('SELECT id FROM areas WHERE tipo = ?').get(tipo);
    if (!area) return;
    const existe = db.prepare('SELECT id FROM mesas WHERE es_virtual = 1 AND area_id = ?').get(area.id);
    if (existe) return;
    const maxNum = db.prepare('SELECT COALESCE(MAX(numero), ?) as n FROM mesas WHERE es_virtual = 1').get(baseNum);
    db.prepare("INSERT INTO mesas (numero, nombre, estado, es_virtual, area_id) VALUES (?, ?, 'LIBRE', 1, ?)")
      .run(maxNum.n + 1, nombre, area.id);
  }
  ensureVirtualMesa('DELIVERY', 'Delivery', 899);
  ensureVirtualMesa('PARA_LLEVAR', 'Para Llevar', 949);

  const insertCat = (nombre, color) => {
    if (!db.prepare('SELECT id FROM categorias WHERE nombre = ?').get(nombre)) {
      db.prepare('INSERT INTO categorias (nombre, color) VALUES (?, ?)').run(nombre, color);
    }
  };

  function getId(table, nameCol, nameVal) {
    const r = db.prepare(`SELECT id FROM ${table} WHERE ${nameCol} = ?`).get(nameVal);
    return r ? r.id : null;
  }

  // Seed de productos desactivado — usar seed-carta.js

  const valeCount = db.prepare('SELECT COUNT(*) as c FROM vales').get();
  if (valeCount.c === 0) {
    const ins = db.prepare('INSERT INTO vales (codigo, monto_inicial, monto_restante, cliente_nombre) VALUES (?, ?, ?, ?)');
    ins.run('VALE-001', 500, 500, 'Cliente Frecuente');
    ins.run('VALE-002', 250, 250, 'Empleado Sarita');
    ins.run('VALE-TEST', 100, 100, 'Prueba');
  }

  // Configuración por defecto
  const configDefaults = {
    hora_corte: '23:00',
    modal_pago: JSON.stringify({
      mostrar_descuento: true,
      mostrar_vale: true,
      mostrar_propina: true,
      mostrar_notas: true,
      mostrar_regalo: true,
      metodos: [
        { key: 'efectivo', label: '💵', texto: 'Efectivo' },
        { key: 'tarjeta', label: '💳', texto: 'Tarjeta' },
        { key: 'transferencia', label: '📱', texto: 'Transferencia' },
        { key: 'otros', label: '📋', texto: 'Otros' }
      ]
    })
  };
  for (const [clave, valor] of Object.entries(configDefaults)) {
    db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)').run(clave, valor);
  }
});

insertInitialData();

module.exports = db;
