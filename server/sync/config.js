/**
 * Configuración del módulo de sincronización con Oracle Cloud.
 * Lee valores de variables de entorno (.env).
 */
module.exports = {
  /** Habilitar/deshabilitar sincronización */
  enabled: process.env.SYNC_ENABLED === 'true',

  /** URL base del servidor de sincronización (ej: https://129.151.xxx.xxx:4000) */
  serverUrl: (process.env.SYNC_SERVER_URL || '').replace(/\/+$/, ''),

  /** Clave de autenticación compartida */
  apiKey: process.env.SYNC_API_KEY || '',

  /** Identificador único de esta PC/terminal */
  deviceId: process.env.SYNC_DEVICE_ID || 'unknown',

  /** Intervalo de sincronización en ms (default: 60s) */
  intervalMs: parseInt(process.env.SYNC_INTERVAL_MS, 10) || 60000,

  /** Registros por lote en push/pull */
  batchSize: 100,

  /** Timeout de red en ms */
  timeoutMs: 10000,

  /** Tablas transaccionales (push: local → cloud) */
  pushTables: [
    'pedidos',
    'pedido_items',
    'pagos',
    'descuentos',
    'caja_sesiones',
    'caja_movimientos',
    'pagos_log',
    'logs_mesas'
  ],

  /** Tablas de catálogo (pull: cloud → local, push: local → cloud) */
  catalogTables: [
    'usuarios',
    'areas',
    'mesas',
    'categorias',
    'productos',
    'variantes',
    'modificadores',
    'opciones_mod',
    'agregados',
    'vales',
    'configuracion'
  ],

  /** Todas las tablas sincronizables */
  get allTables() {
    return [...this.pushTables, ...this.catalogTables];
  }
};
