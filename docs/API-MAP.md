# API-MAP.md
**POS Sarita — Mapa Completo de Endpoints API**
**Fecha de baseline:** 2026-09-01

---

## Convencion de clasificacion

- READ: Solo lectura, sin efectos secundarios
- WRITE: Modifica datos
- FINANCIAL: Afecta dinero (pagos, caja)
- STOCK: Modifica stock de productos
- AUTH: Autenticacion/sesion
- ADMIN: Requiere rol admin o cajero
- OPERATIONAL: Opera en tiempo real (KDS, estados)

---

## /api/usuarios

### POST /api/usuarios/login
- Clase: AUTH
- Handler: routes/usuarios.js
- Auth requerida: NO
- Autorizacion: Ninguna
- Request: { pin: string }
- Response: { id, nombre, rol }
- DB: SELECT usuarios WHERE pin = ?
- Efectos: Ninguno (sin token, sin sesion persistida)
- Riesgo: PIN en texto plano. Sin limite de intentos.

### GET /api/usuarios
- Clase: READ | ADMIN
- Handler: routes/usuarios.js
- Auth requerida: NO (sin middleware)
- Request: ninguno
- Response: [{ id, nombre, rol, activo }]
- DB: SELECT usuarios
- Efectos: Ninguno

---

## /api/mesas

### GET /api/mesas
- Clase: READ
- Handler: routes/mesas.js
- Auth requerida: NO
- Request: ninguno
- Response: Array de mesas con estado, area, totales de pedido activo
- DB: SELECT mesas JOIN areas + subconsultas de pedidos/pagos/descuentos
- Efectos: Ninguno

### GET /api/mesas/areas
- Clase: READ
- Handler: routes/mesas.js
- Response: Array de areas con conteo de mesas
- DB: SELECT areas

### POST /api/mesas/areas
- Clase: WRITE | ADMIN
- Request: { nombre, tipo, orden }
- Response: area creada
- DB: INSERT areas

### PATCH /api/mesas/areas/:id
- Clase: WRITE | ADMIN
- Request: { nombre?, tipo?, orden?, activo? }
- Response: area actualizada
- DB: UPDATE areas

### DELETE /api/mesas/areas/:id
- Clase: WRITE | ADMIN
- Request: ninguno
- Response: { ok: true }
- DB: DELETE areas (falla si tiene mesas)

### POST /api/mesas
- Clase: WRITE | ADMIN
- Request: { numero, nombre, capacidad, area_id }
- Response: mesa creada
- DB: INSERT mesas

### POST /api/mesas/virtual
- Clase: WRITE | ADMIN
- Request: { area_id }
- Response: mesa virtual creada
- DB: INSERT mesas (es_virtual=1)

### POST /api/mesas/:id/area
- Clase: WRITE | ADMIN
- Request: { area_id }
- Response: { ok, mesa }
- DB: UPDATE mesas
- Efectos: io.emit('mesa:updated')

### GET /api/mesas/:id
- Clase: READ
- Response: mesa con area y pedido activo
- DB: SELECT mesas JOIN areas

### POST /api/mesas/:id/tomar
- Clase: WRITE | OPERATIONAL
- Request: { mesero_id }
- Response: mesa actualizada
- DB: UPDATE mesas SET estado='OCUPADO'
- Efectos: acquireTableLock, releaseTableLock, io.emit('mesa:updated')
- Riesgo: mesero_id NO verificado contra DB

### POST /api/mesas/:id/liberar
- Clase: WRITE | OPERATIONAL
- Request: { mesero_id }
- Response: mesa actualizada
- DB: UPDATE mesas SET estado='LIBRE'
- Efectos: releaseTableLock, io.emit('mesa:updated')

### POST /api/mesas/:id/reservar
- Clase: WRITE
- Request: { mesero_id, notas? }
- Response: mesa
- DB: UPDATE mesas SET estado='RESERVADO'
- Efectos: io.emit('mesa:updated')

### POST /api/mesas/:id/cancelar-reserva
- Clase: WRITE
- DB: UPDATE mesas SET estado='LIBRE'
- Efectos: io.emit('mesa:updated')

### POST /api/mesas/:id/transferir
- Clase: WRITE | OPERATIONAL
- Request: { mesa_destino_id, mesero_id? }
- DB: UPDATE mesas origen y destino
- Efectos: io.emit x2, INSERT logs_mesas

### POST /api/mesas/:id/inactivar
- Clase: WRITE | ADMIN
- DB: UPDATE mesas SET estado='INACTIVO'
- Efectos: io.emit('mesa:updated')

### PATCH /api/mesas/:id
- Clase: WRITE | ADMIN
- Request: { nombre?, capacidad?, numero? }
- DB: UPDATE mesas

### GET /api/mesas/:id/logs
- Clase: READ | ADMIN
- Response: Array de logs_mesas
- DB: SELECT logs_mesas

---

## /api/pedidos

### GET /api/pedidos
- Clase: READ
- Query params: estado?, mesa_id?
- DB: SELECT pedidos JOIN mesas

### POST /api/pedidos
- Clase: WRITE | STOCK | FINANCIAL
- Request: { mesa_id, mesero_id?, items[], nota?, cliente_nombre?, cliente_telefono?, cliente_direccion?, hora_recogida? }
- DB: INSERT pedidos, INSERT pedido_items x N, UPDATE mesas, UPDATE productos (stock)
- Efectos: io.emit('pedido:nuevo'), io.emit('mesa:updated'), io.emit('stock:actualizado'), printers.printComanda()
- Riesgo: mesero_id NO verificado; stock descontado en transaccion

### POST /api/pedidos/:id/items
- Clase: WRITE | STOCK
- Request: { items[], nota? }
- DB: INSERT pedido_items, UPDATE pedidos.total, UPDATE productos (stock)
- Efectos: io.emit('pedido:actualizado'), printers.printComanda()

### PATCH /api/pedidos/:id/items/:itemId
- Clase: WRITE
- Request: { precio_adicional?, cantidad?, usuario_id? }
- DB: UPDATE pedido_items, UPDATE pedidos.total
- Efectos: io.emit('mesa:updated'), io.emit('pedido:items_updated')

### POST /api/pedidos/:id/items/:itemId/split
- Clase: WRITE
- Request: { splitCantidad, usuario_id? }
- DB: UPDATE pedido_items (reduce cantidad), INSERT pedido_items (nuevo)
- Efectos: io.emit('mesa:updated'), io.emit('pedido:items_updated')

### DELETE /api/pedidos/:id/items/:itemId
- Clase: WRITE | STOCK
- DB: DELETE pedido_items, UPDATE pedidos.total, UPDATE productos (reponer stock)
- Efectos: io.emit('mesa:updated'), io.emit('pedido:items_updated'), io.emit('stock:actualizado')

### POST /api/pedidos/:id/mover
- Clase: WRITE | OPERATIONAL
- Request: { item_ids[], mesa_destino_id, mesero_id? }
- DB: UPDATE pedido_items, INSERT pedidos (si no existe), UPDATE mesas, INSERT logs_mesas x2
- Efectos: io.emit x4, printers.printComanda()

### POST /api/pedidos/:id/unir
- Clase: WRITE | OPERATIONAL
- Request: { mesa_destino_id, mesero_id? }
- DB: UPDATE pedido_items, UPDATE pedidos, UPDATE mesas, INSERT logs_mesas
- Efectos: io.emit x4

### GET /api/pedidos/cocina
- Clase: READ | OPERATIONAL
- Response: pedidos activos con items de destino=cocina
- DB: SELECT pedidos + pedido_items WHERE destino_impresion = 'cocina'

### GET /api/pedidos/cocina/historial
- Clase: READ | OPERATIONAL
- Response: pedidos cerrados recientes

### GET /api/pedidos/barra
- Clase: READ | OPERATIONAL
- Response: pedidos activos con items de destino=barra

### GET /api/pedidos/barra/historial
- Clase: READ | OPERATIONAL

### GET /api/pedidos/vales/buscar
- Clase: READ
- Query: codigo
- DB: SELECT vales

### GET /api/pedidos/activos
- Clase: READ
- Response: pedidos en estados activos

### PATCH /api/pedidos/:id/cliente
- Clase: WRITE
- Request: { cliente_nombre?, cliente_telefono?, cliente_direccion?, hora_recogida? }
- DB: UPDATE pedidos

### GET /api/pedidos/:id
- Clase: READ
- Response: pedido con items, pagos, descuentos
- DB: SELECT pedidos + pedido_items + pagos + descuentos

### POST /api/pedidos/:id/pagar
- Clase: FINANCIAL | WRITE
- Request: { metodo, monto, usuario_id?, referencia?, notas?, propina? }
- DB: SELECT caja_sesiones, INSERT pagos, UPDATE pedidos.estado, UPDATE vales (si vale)
- Efectos: io.emit('pedido:actualizado'), io.emit('mesa:updated'), printers.printTicket()
- Riesgo: usuario_id NO verificado; monto en float

### POST /api/pedidos/:id/pagar-dividido
- Clase: FINANCIAL | WRITE
- Request: { metodo, monto, monto_recibido?, usuario_id?, referencia?, propina?, tipo_division, items_pagados?, persona?, cuota_info?, imprimir_ticket? }
- DB: INSERT pagos, UPDATE pedidos.estado, UPDATE pedido_items.cantidad_pagada
- Efectos: io.emit, printers.printTicketDividido()
- Riesgo: mismos que pagar

### PATCH /api/pedidos/:id/estado
- Clase: WRITE | OPERATIONAL
- Request: { estado }
- DB: UPDATE pedidos.estado
- Efectos: io.emit('pedido:actualizado')

### PATCH /api/pedidos/:id/items/estado
- Clase: WRITE | OPERATIONAL (KDS)
- Request: { estado, item_ids? }
- DB: UPDATE pedido_items.estado
- Efectos: io.emit('pedido:actualizado')

### PATCH /api/pedidos/items/:idItem/estado
- Clase: WRITE | OPERATIONAL (KDS)
- Request: { estado }
- DB: UPDATE pedido_items.estado
- Efectos: io.emit('item:actualizado'), io.emit('pedido:actualizado')

### POST /api/pedidos/:id/reimprimir
- Clase: OPERATIONAL
- DB: SELECT pedidos + items + mesa
- Efectos: printers.printTicket()

### POST /api/pedidos/:id/precuenta
- Clase: OPERATIONAL
- DB: SELECT pedidos + items
- Efectos: printers.printPrecuenta()

### POST /api/pedidos/:id/descuento
- Clase: FINANCIAL | WRITE | ADMIN
- Request: { tipo, valor, motivo, usuario_id }
- DB: INSERT descuentos
- Riesgo: usuario_id del body sin middleware

### DELETE /api/pedidos/:id/descuento/:descId
- Clase: FINANCIAL | WRITE | ADMIN
- Request: { usuario_id }
- DB: DELETE descuentos

---

## /api/productos

### GET /api/productos
- Clase: READ
- Response: productos con variantes, modificadores, agregados, stock
- DB: SELECT productos + relaciones

### GET /api/productos/categorias
- Clase: READ
- Response: categorias activas

### PATCH /api/productos/:id/stock
- Clase: STOCK | WRITE
- Request: { stock_actual, controlar_stock?, stock_minimo? }
- DB: UPDATE productos
- Efectos: io.emit('stock:actualizado')

### POST /api/productos/stock-batch
- Clase: STOCK | WRITE
- Request: { updates: [{ id, stock_actual, controlar_stock?, stock_minimo? }] }
- DB: UPDATE productos x N (transaccion)
- Efectos: io.emit('stock:actualizado') x N

### POST /api/productos
- Clase: WRITE | ADMIN
- Request: { nombre, precio, categoria_id, ... }
- DB: INSERT productos

### PUT /api/productos/:id
- Clase: WRITE | ADMIN
- DB: UPDATE productos

### DELETE /api/productos/:id
- Clase: WRITE | ADMIN
- DB: UPDATE productos SET activo=0 (soft delete)

---

## /api/admin

### GET /api/admin/configuracion
- Clase: READ | ADMIN
- DB: SELECT configuracion

### PATCH /api/admin/configuracion
- Clase: WRITE | ADMIN
- DB: UPSERT configuracion

### GET /api/admin/categorias
- Clase: READ | ADMIN
- DB: SELECT categorias + conteo productos

### POST /api/admin/categorias
- Clase: WRITE | ADMIN
- DB: INSERT categorias

### PATCH /api/admin/categorias/:id
- Clase: WRITE | ADMIN
- DB: UPDATE categorias

### DELETE /api/admin/categorias/:id
- Clase: WRITE | ADMIN
- DB: UPDATE categorias SET activo=0

### GET /api/admin/productos
- Clase: READ | ADMIN
- Response: productos con variantes, modificadores, agregados

### POST /api/admin/productos
- Clase: WRITE | ADMIN
- DB: INSERT productos (con variantes, modificadores, agregados en transaccion)

### PUT /api/admin/productos/:id
- Clase: WRITE | ADMIN
- DB: UPDATE productos + variantes + modificadores (transaccion)

### DELETE /api/admin/productos/:id
- Clase: WRITE | ADMIN
- DB: soft delete

### GET /api/admin/pedidos/reporte
- Clase: READ | ADMIN
- Query: fecha_inicio?, fecha_fin?, estado?
- DB: SELECT pedidos con filtros dinamicos

### POST /api/admin/pedidos/:id/anular
- Clase: FINANCIAL | WRITE | ADMIN
- Request: { motivo, usuario_id }
- DB: UPDATE pedidos.estado='CANCELADO', UPDATE pedido_items.estado='CANCELADO', UPDATE mesas, UPDATE productos (reponer stock)
- Efectos: io.emit('pedido:actualizado'), io.emit('mesa:updated'), io.emit('stock:actualizado')
- Riesgo: usuario_id verificado contra DB pero viene del body

### GET /api/admin/pedidos/pagados
- Clase: READ | ADMIN
- Response: pedidos cerrados recientes

### POST /api/admin/pedidos/:id/pagos
- Clase: FINANCIAL | WRITE | ADMIN
- Request: { metodo, monto, motivo?, usuario_id }
- DB: INSERT pagos, INSERT pagos_log, UPDATE pedidos
- Riesgo: usuario_id del body

### DELETE /api/admin/pedidos/:id/pagos/:pagoId
- Clase: FINANCIAL | WRITE | ADMIN
- Efecto: anula pedido, registra EGRESO en caja
- DB: DELETE pagos, UPDATE pedidos, INSERT caja_movimientos, INSERT pagos_log
- Riesgo: usuario_id del body

### PATCH /api/admin/pedidos/:id/pagos/:pagoId
- Clase: FINANCIAL | WRITE | ADMIN
- Cambia metodo de pago de un pago existente
- DB: UPDATE pagos, INSERT pagos_log

### POST /api/admin/pedidos/:id/eliminar
- Clase: FINANCIAL | WRITE | ADMIN
- Elimina pedido pagado, registra devoluciones
- DB: DELETE/UPDATE multiples tablas
- Riesgo: usuario_id del body

### POST /api/admin/caja/abrir
- Clase: FINANCIAL | WRITE | ADMIN
- Request: { usuario_id, fondo_inicial, notas? }
- DB: INSERT caja_sesiones
- Efectos: io.emit('caja:updated')
- Riesgo: usuario_id del body

### POST /api/admin/caja/cerrar
- Clase: FINANCIAL | WRITE | ADMIN
- Request: { efectivo_contado, notas?, usuario_id }
- DB: UPDATE caja_sesiones SET estado='CERRADA'
- Efectos: io.emit('caja:updated')
- Riesgo: usuario_id del body

### GET /api/admin/caja/bloqueantes
- Clase: READ | ADMIN
- Response: mesas que impiden el cierre de caja

### GET /api/admin/caja/sesion-actual
- Clase: READ | ADMIN
- Response: sesion activa con desglose de pagos y movimientos

### POST /api/admin/caja/corte-x/imprimir
### POST /api/admin/caja/corte-z/imprimir
- Clase: OPERATIONAL | ADMIN
- Efectos: printers.printCorteCaja()

### GET /api/admin/caja/movimientos
### POST /api/admin/caja/movimientos
### DELETE /api/admin/caja/movimientos/:id
### GET /api/admin/caja/sesiones
- Clase: FINANCIAL | WRITE | READ | ADMIN

---

## /api/printers (en index.js)

### GET /api/printers/config
- Clase: READ | ADMIN
- Response: configuracion actual de impresoras

### POST /api/printers/config
- Clase: WRITE | ADMIN
- Request: { caja?, cocina?, barra? }
- Efectos: escribe printers-config.json en disco

### POST /api/printers/test/:printerName
- Clase: OPERATIONAL | ADMIN
- Efectos: imprime ticket de prueba

### GET /api/printers/detect
- Clase: READ | ADMIN
- Efectos: ejecuta PowerShell para detectar impresoras Windows

### GET /api/configuracion/:clave
- Clase: READ
- DB: SELECT configuracion WHERE clave = ?
- Nota: Sin auth

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
