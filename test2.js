const db = require('better-sqlite3')('data/pos.db');
const row = db.prepare(`SELECT p.destino_override, c.destino, COALESCE(NULLIF(p.destino_override, ''), NULLIF(c.destino, ''), 'cocina') AS destino_resuelto FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.id = 29 LIMIT 1`).get();
console.log(row);
