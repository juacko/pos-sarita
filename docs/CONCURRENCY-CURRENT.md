# CONCURRENCY-CURRENT.md
**POS Sarita — Mapa de Concurrencia Actual**
**Fecha de baseline:** 2026-09-01

---

## 1. Motor de base de datos: SQLite en modo WAL

SQLite en modo WAL (Write-Ahead Logging) tiene las siguientes caracteristicas relevantes:

- **Un solo escritor a la vez**: Las escrituras son serializadas por SQLite automaticamente
- **Multiples lectores concurrentes**: Las lecturas no bloquean otras lecturas
- **Lector no bloquea escritor**: Gracias a WAL, las lecturas pueden ocurrir mientras hay escrituras en vuelo
- **Transacciones atomicas**: db.transaction() garantiza atomicidad y rollback en caso de error

Configuracion actual:
```javascript
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

**Implicacion practica:** En el ambiente actual (LAN, proceso unico Node.js), la concurrencia real es manejada enteramente por SQLite + better-sqlite3 (sincrono). No hay race conditions a nivel de DB gracias al modelo sincrono de better-sqlite3.

---

## 2. Lock de Mesas (table-lock.js)

**Implementacion:** Map en memoria del proceso Node.js

```javascript
// table-lock.js
const LOCKS = new Map();   // { mesaId -> { meseroId, timestamp } }
const LOCK_TIMEOUT_MS = 10000;  // 10 segundos

acquireTableLock(tableId, meseroId)  // Promesa — rechaza si otra persona tiene el lock
releaseTableLock(tableId)            // Elimina el lock
getTableLock(tableId)                // Consulta sin modificar
```

**Donde se usa:** Solo en routes/mesas.js (operaciones de tomar/liberar/transferir/reservar)

**Problema conocido 1:** El lock NO se usa en routes/pedidos.js cuando se modifica estado de mesa. Las operaciones de pago y creacion de pedido actualizan la tabla mesas directamente sin adquirir el lock.

**Problema conocido 2:** El lock es VOLATIL. Si el proceso Node.js se reinicia (crash, deploy), todos los locks se pierden. Una operacion en vuelo durante el reinicio puede dejar la mesa en estado inconsistente.

**Problema conocido 3:** En modo cluster (PM2 con multiples workers), los locks NO se comparten entre procesos. Actualmente no es un problema porque el sistema corre en proceso unico.

---

## 3. Transacciones SQLite

Las siguientes operaciones usan db.transaction():

| Operacion | Transaccion | Tablas |
|---|---|---|
| POST /api/pedidos (crear) | SI | pedidos, pedido_items, mesas, productos |
| POST /api/pedidos/:id/items | SI | pedido_items, pedidos |
| PATCH /api/pedidos/:id/items/:itemId | SI | pedido_items, pedidos |
| POST /api/pedidos/:id/items/:itemId/split | SI | pedido_items, pedidos |
| DELETE /api/pedidos/:id/items/:itemId | SI | pedido_items, pedidos, productos |
| POST /api/pedidos/:id/mover | SI | pedido_items, pedidos, mesas, logs_mesas |
| POST /api/pedidos/:id/unir | SI | pedido_items, pedidos, mesas |
| POST /api/pedidos/:id/pagar | SI | pagos, pedidos, vales |
| POST /api/pedidos/:id/pagar-dividido | SI | pagos, pedidos, pedido_items |
| POST /api/admin/pedidos/:id/anular | SI | pedidos, pedido_items, mesas, productos |
| DELETE /api/admin/pedidos/:id/pagos/:pagoId | SI | pagos, pedidos, caja_movimientos, pagos_log, mesas |
| POST /api/productos/stock-batch | SI | productos |

Las siguientes operaciones NO usan transaccion explicita (operacion simple):
- POST /api/admin/caja/abrir (INSERT simple)
- PATCH /api/pedidos/:id/estado
- PATCH /api/pedidos/items/:itemId/estado

---

## 4. WebSockets y actualizacion en tiempo real

**Servidor:** Socket.IO 4.x integrado con Express HTTP server

**Modelo de emision:** io.emit() broadcast a TODOS los clientes conectados.

**Eventos emitidos (desde el servidor):**

| Evento | Emitido cuando | Payload |
|---|---|---|
| mesa:updated | Cambio de estado de mesa | objeto mesa completo |
| pedido:nuevo | Nuevo pedido creado | { pedido, items } |
| pedido:actualizado | Cambio en pedido | objeto pedido |
| pedido:items_updated | Items de pedido modificados | { pedidoId } |
| item:actualizado | Item individual cambia estado | objeto item |
| stock:actualizado | Stock de producto cambia | { producto_id, controlar_stock, stock_actual, stock_minimo } |
| caja:updated | Apertura/cierre de caja | { estado, sesion_id } |

**Eventos del cliente al servidor:**

| Evento | Proposito |
|---|---|
| join:mesa | Suscribirse a room de una mesa especifica |
| leave:mesa | Desuscribirse de room de una mesa |
| connect/disconnect | Gestion automatica de conexion |

**Sin autenticacion en WebSocket:** Cualquier cliente conectado puede suscribirse a cualquier evento. Los datos financieros (stock:actualizado, pedido:actualizado) son visibles para todos los clientes sin restriccion.

---

## 5. Problema: impresion fuera de transaccion

El siguiente patron existe en pedidos.js:

```javascript
const result = db.transaction(() => {
  // ... inserts y updates ...
  return datosFinales;
})();  // transaccion completada aqui

// FUERA de la transaccion:
printers.printComanda(pedido, items, mesa);  // puede fallar
io.emit('pedido:nuevo', ...);
```

Si la impresion falla (impresora apagada, error de red), la transaccion YA fue confirmada. El pedido existe en la DB pero puede no haberse impreso. Actualmente el fallback guarda el buffer en prints/ como archivo .txt.

**Riesgo:** Fallo silencioso de impresion no alerta al operador en la interfaz (solo log en consola del servidor).

---

## 6. Estado de concurrencia en produccion actual

**Escenario tipico:** 3-6 dispositivos conectados simultaneamente (POS, cocina, barra, 1-2 meseros adicionales)

**Evaluacion:** Para este nivel de concurrencia y el ambiente LAN de proceso unico, el modelo actual es suficiente y estable. SQLite WAL maneja la concurrencia de DB correctamente. El lock in-memory de mesas previene conflictos de toma de mesa.

**Punto de falla principal real:** Si dos meseros intentan tomar la misma mesa al mismo tiempo. El lock de mesas lo maneja correctamente, pero solo si ambos van a traves de /api/mesas/:id/tomar. Si uno va directamente a /api/pedidos (que no adquiere el lock), hay riesgo de condicion de carrera.

---

## 7. No implementado (futuro)

- [ ] Lock distribuido (Redis) para ambiente multi-proceso
- [ ] Queue de impresion con reintentos
- [ ] Notificacion en UI cuando falla la impresora
- [ ] Reconexion automatica con reinyeccion de estado al reconectarse socket
- [ ] Optimistic locking en frontend (campo `version` de mesas existe en DB pero no se valida en servidor)

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
