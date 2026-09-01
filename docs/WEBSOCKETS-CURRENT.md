# WEBSOCKETS-CURRENT.md
**POS Sarita — Inventario de WebSockets y KDS en Tiempo Real**
**Fecha de baseline:** 2026-09-01

---

## 1. Arquitectura WebSocket

- **Libreria:** Socket.IO 4.8.0
- **Servidor:** Instanciado en `server/index.js` sobre el servidor HTTP nativo de Node.js.
- **Inyeccion:** La instancia `io` se pasa como parametro a las funciones fabricas de routers (`createMesasRouter(io)`, `createPedidosRouter(io)`, `createAdminRouter(io)`).
- **Clientes:** `public/js/socket-client.js` en POS/Mesero, y bloques `<script>` inline en `cocina.html`, `barra.html`, `admin.html`.

---

## 2. Eventos Emitidos por el Servidor

| Evento | Emitido desde | Cuando ocurre | Payload |
|---|---|---|---|
| `mesa:updated` | `routes/mesas.js`, `routes/pedidos.js`, `routes/admin.js` | Cambio de estado de mesa, toma, liberacion, cambio de area, o anulacion | Objeto `mesa` completo |
| `pedido:nuevo` | `routes/pedidos.js:300` | Se crea un nuevo pedido | `{ pedido, items }` |
| `pedido:actualizado` | `routes/pedidos.js`, `routes/admin.js` | Se agregan items, cambia estado de pedido o anula | Objeto `pedido` actualizado |
| `pedido:items_updated` | `routes/pedidos.js:428,470,499` | Modificacion, division o eliminacion de item | `{ pedidoId }` |
| `item:actualizado` | `routes/pedidos.js` (PATCH estado item) | Cambio de estado de item individual (en cocina/barra) | Objeto `item` |
| `stock:actualizado` | `routes/productos.js`, `routes/pedidos.js`, `routes/admin.js` | Cambio de stock actual o minimo de producto | `{ producto_id, controlar_stock, stock_actual, stock_minimo }` |
| `caja:updated` | `routes/admin.js:1152,1205` | Apertura o cierre de caja | `{ estado: 'ABIERTA'|'CERRADA', sesion_id }` |

---

## 3. Eventos Escuchados por el Servidor

| Evento | Handler en index.js | Accion |
|---|---|---|
| `join:mesa` | `socket.join('mesa:' + mesaId)` | Une el socket a la sala especifica de la mesa |
| `leave:mesa` | `socket.leave('mesa:' + mesaId)` | Remueve el socket de la sala |
| `connection` | Logging | Registra conexion de cliente |
| `disconnect` | Logging | Registra desconexion |

---

## 4. Reaccion en los Clientes (KDS / POS)

### POS / Mesero (`public/js/socket-client.js`):
- `mesa:updated` → Llama a `loadMesas()` global para refrescar el mapa de mesas.
- `stock:actualizado` → Actualiza el array en memoria `productos[]` y re-renderiza la lista si la vista POS esta activa.

### Cocina (`public/cocina.html`):
- Escucha `pedido:nuevo`, `pedido:actualizado`, `item:actualizado`.
- Recarga o actualiza las tarjetas de comanda en pantalla KDS sin recargar la pagina.

### Barra (`public/barra.html`):
- Mismo comportamiento que cocina, filtrado para items cuyo `destino_impresion` es `barra`.

---

## 5. Riesgos y Observaciones de Concurrencia WebSocket

1. **Broadcast Global:** La mayoria de emisiones usan `io.emit()` a TODOS los clientes conectados indiscriminadamente.
2. **Sin Autenticacion:** No hay handshake ni comprobacion de token al conectar el socket.
3. **Dependencia de Funciones Globales:** `socket-client.js` asume que `loadMesas()` y `renderProductos()` existen en el scope global `window`.

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
