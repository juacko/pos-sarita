/**
 * Utilidades compartidas para sincronización.
 * Provee generación de UUID y helpers para los repositories.
 */
const crypto = require('crypto');

/**
 * Genera un UUID v4 usando crypto nativo de Node.js.
 * @returns {string} UUID v4
 */
function generateUUID() {
  return crypto.randomUUID();
}

module.exports = { generateUUID };
