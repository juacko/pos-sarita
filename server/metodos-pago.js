const db = require('./db');

// Método de pago: config viva en `modal_pago.metodos` (array de objetos `{key,label,texto}` o strings).
// Este módulo centraliza la lectura, normalización y validación.

const METADOS_DEF = {
  efectivo: { label: '💵', texto: 'Efectivo' },
  tarjeta: { label: '💳', texto: 'Tarjeta' },
  transferencia: { label: '📱', texto: 'Transferencia' },
  otros: { label: '📋', texto: 'Otros' },
  yape: { label: '📱', texto: 'Yape' },
  plin: { label: '📱', texto: 'Plin' },
  regalo: { label: '🎁', texto: 'Regalo' },
  vale: { label: '🎟️', texto: 'Vale' }
};

function leerConfig() {
  try {
    const fila = db.prepare("SELECT valor FROM configuracion WHERE clave = 'modal_pago'").get();
    if (!fila) return {};
    return JSON.parse(fila.valor);
  } catch (e) {
    return {};
  }
}

function normalizarMetodo(m) {
  if (typeof m === 'string') {
    const def = METADOS_DEF[m];
    return def ? { key: m, label: def.label, texto: def.texto } : { key: m, label: '📋', texto: m };
  }
  if (m && typeof m === 'object' && m.key) {
    const def = METADOS_DEF[m.key];
    return { key: m.key, label: m.label || (def && def.label) || '📋', texto: m.texto || (def && def.texto) || m.key };
  }
  return null;
}

// Config completa normalizada: metodos siempre array de objetos {key,label,texto}
function getConfig() {
  const cfg = leerConfig();
  const raw = Array.isArray(cfg.metodos) ? cfg.metodos : ['efectivo', 'tarjeta', 'transferencia', 'otros'];
  return {
    mostrar_descuento: cfg.mostrar_descuento !== false,
    mostrar_vale: cfg.mostrar_vale === true,
    mostrar_propina: cfg.mostrar_propina !== false,
    mostrar_notas: cfg.mostrar_notas !== false,
    mostrar_regalo: cfg.mostrar_regalo !== false,
    metodos: raw.map(normalizarMetodo).filter(Boolean)
  };
}

// Keys de métodos activos (los editables)
function getMetodos() {
  return getConfig().metodos.map(m => m.key);
}

// Label texto puro (sin emoji) para impresión/reportes
function textoDeMetodo(key) {
  if (METADOS_DEF[key]) return METADOS_DEF[key].texto;
  const c = getConfig();
  const m = c.metodos.find(x => x.key === key);
  return m ? m.texto : key;
}

// Valida un método de pago contra la config viva
function esMetodoValido(metodo) {
  if (!metodo) return false;
  if (metodo === 'regalo') return getConfig().mostrar_regalo;
  if (metodo === 'vale') return getConfig().mostrar_vale;
  return getMetodos().includes(metodo);
}

module.exports = { getConfig, getMetodos, textoDeMetodo, esMetodoValido, METADOS_DEF };