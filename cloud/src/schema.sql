-- =============================================
-- POS Sarita — Schema PostgreSQL (Oracle Cloud)
-- Espejo de las tablas SQLite para sincronización
-- =============================================

-- Tabla de control de sincronización
CREATE TABLE IF NOT EXISTS sync_registry (
  device_id TEXT NOT NULL,
  tabla TEXT NOT NULL,
  last_received_at TIMESTAMPTZ,
  PRIMARY KEY (device_id, tabla)
);

-- 1. usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  pin TEXT NOT NULL,
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. areas
CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'SALON',
  orden INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. mesas
CREATE TABLE IF NOT EXISTS mesas (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  numero INTEGER NOT NULL,
  nombre TEXT,
  capacidad INTEGER DEFAULT 4,
  area_id INTEGER,
  es_virtual INTEGER DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'LIBRE',
  mesero_id INTEGER,
  mesero_nombre TEXT,
  pedido_activo_id INTEGER,
  ocupado_desde TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. categorias
CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  destino TEXT DEFAULT 'cocina',
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. productos
CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  precio NUMERIC(12,2) NOT NULL,
  categoria_id INTEGER,
  para_llevar INTEGER DEFAULT 0,
  destino_override TEXT,
  controlar_stock INTEGER DEFAULT 0,
  stock_actual INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 3,
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. variantes
CREATE TABLE IF NOT EXISTS variantes (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  producto_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  precio_adicional NUMERIC(12,2) DEFAULT 0,
  activo INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. modificadores
CREATE TABLE IF NOT EXISTS modificadores (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  producto_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'select',
  requerido INTEGER DEFAULT 0,
  max_opciones INTEGER DEFAULT 1,
  activo INTEGER DEFAULT 1,
  depende_variante_id INTEGER,
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. opciones_mod
CREATE TABLE IF NOT EXISTS opciones_mod (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  modificador_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  precio_adicional NUMERIC(12,2) DEFAULT 0,
  activo INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. agregados
CREATE TABLE IF NOT EXISTS agregados (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  producto_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  precio NUMERIC(12,2) NOT NULL,
  maximo INTEGER DEFAULT 5,
  activo INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  mesa_id INTEGER NOT NULL,
  mesa_numero INTEGER NOT NULL,
  mesero_id INTEGER,
  mesero_nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'ABIERTO',
  total NUMERIC(12,2) DEFAULT 0,
  nota TEXT,
  cliente_nombre TEXT,
  cliente_telefono TEXT,
  cliente_direccion TEXT,
  hora_recogida TEXT,
  motivo_cancelacion TEXT,
  anulado_por INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. pedido_items
CREATE TABLE IF NOT EXISTS pedido_items (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  pedido_id INTEGER NOT NULL,
  producto_id INTEGER,
  producto_nombre TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL,
  precio_adicional NUMERIC(12,2) DEFAULT 0,
  notas TEXT,
  variante_id INTEGER,
  variante_nombre TEXT,
  modificadores_json TEXT DEFAULT '[]',
  agregados_json TEXT DEFAULT '[]',
  detalle TEXT DEFAULT '',
  estado TEXT DEFAULT 'PENDIENTE',
  cantidad_pagada INTEGER DEFAULT 0,
  destino_impresion TEXT DEFAULT 'cocina',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. pagos
CREATE TABLE IF NOT EXISTS pagos (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  pedido_id INTEGER NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  metodo TEXT NOT NULL,
  propina NUMERIC(12,2) DEFAULT 0,
  referencia TEXT,
  notas TEXT,
  usuario_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. descuentos
CREATE TABLE IF NOT EXISTS descuentos (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  pedido_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  motivo TEXT NOT NULL,
  usuario_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. vales
CREATE TABLE IF NOT EXISTS vales (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  codigo TEXT UNIQUE NOT NULL,
  monto_inicial NUMERIC(12,2) NOT NULL,
  monto_restante NUMERIC(12,2) NOT NULL,
  cliente_nombre TEXT,
  activo INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. caja_sesiones
CREATE TABLE IF NOT EXISTS caja_sesiones (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  usuario_id INTEGER NOT NULL,
  fondo_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  efectivo_contado NUMERIC(12,2),
  estado TEXT NOT NULL DEFAULT 'ABIERTA',
  notas_apertura TEXT,
  notas_cierre TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  absorbe_desde TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  total_ventas NUMERIC(12,2) DEFAULT 0,
  propinas NUMERIC(12,2) DEFAULT 0,
  efectivo_esperado NUMERIC(12,2),
  sobrante_faltante NUMERIC(12,2),
  total_pedidos INTEGER DEFAULT 0,
  desglose_json TEXT,
  cerrada_por INTEGER,
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. caja_movimientos
CREATE TABLE IF NOT EXISTS caja_movimientos (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL,
  concepto TEXT NOT NULL,
  monto NUMERIC(12,2) NOT NULL,
  metodo_pago TEXT NOT NULL,
  persona TEXT,
  usuario_id INTEGER,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. pagos_log
CREATE TABLE IF NOT EXISTS pagos_log (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  pedido_id INTEGER NOT NULL,
  pago_id INTEGER,
  accion TEXT NOT NULL,
  motivo TEXT,
  detalle TEXT,
  usuario_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. logs_mesas
CREATE TABLE IF NOT EXISTS logs_mesas (
  id SERIAL PRIMARY KEY,
  uuid TEXT UNIQUE NOT NULL,
  mesa_id INTEGER NOT NULL,
  accion TEXT NOT NULL,
  mesero_id INTEGER,
  detalle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced',
  synced_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. configuracion
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  uuid TEXT UNIQUE,
  valor TEXT NOT NULL,
  updated_at TIMESTAMPTZ,
  source_device TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para sincronización
CREATE INDEX IF NOT EXISTS idx_pedidos_uuid ON pedidos(uuid);
CREATE INDEX IF NOT EXISTS idx_pedido_items_uuid ON pedido_items(uuid);
CREATE INDEX IF NOT EXISTS idx_pagos_uuid ON pagos(uuid);
CREATE INDEX IF NOT EXISTS idx_productos_uuid ON productos(uuid);
CREATE INDEX IF NOT EXISTS idx_pedidos_received ON pedidos(received_at);
CREATE INDEX IF NOT EXISTS idx_productos_received ON productos(received_at);
