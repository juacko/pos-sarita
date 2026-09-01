# CRITICAL-OPERATIONS.md
**POS Sarita — Operaciones Criticas del Sistema**
**Fecha de baseline:** 2026-09-01

Clasificacion:
- P0: Critico — error = perdida de dinero o datos irrecuperable
- P1: Alto — error = inconsistencia operativa grave
- P2: Medio — error = molestia operativa, recuperable
- P3: Bajo — error = cosmético o sin impacto operativo

---

## Operaciones P0 — Criticas

### 1. Registrar Pago (pagar / pagar-dividido)
- Archivo: server/routes/pedidos.js (lineas ~887-1200)
- Endpoint: POST /api/pedidos/:id/pagar, POST /api/pedidos/:id/pagar-dividido
- Tablas afectadas: pagos (INSERT), pedidos (UPDATE estado), vales (UPDATE monto_restante), pedido_items (UPDATE cantidad_pagada)
- Transaccion: SI (db.transaction)
- Verifica caja abierta: SI
- Calcula cambio: SI (solo efectivo)
- Riesgo: monto en REAL (float) — posibles errores de precision en descuentos
- Riesgo: usuario_id del body sin middleware de autenticacion
- Riesgo: duplicacion de logica de descuentos (4 lugares en codigo)

### 2. Abrir Caja
- Archivo: server/routes/admin.js (linea ~1127)
- Endpoint: POST /api/admin/caja/abrir
- Tablas: caja_sesiones (INSERT)
- Transaccion: NO (operacion simple)
- Verifica rol: SI (verificarRolAdminCajero via usuario_id del body)
- Verifica no hay otra abierta: SI
- Riesgo: usuario_id del body — cualquier cliente puede impersonar admin

### 3. Cerrar Caja
- Archivo: server/routes/admin.js (linea ~1157)
- Endpoint: POST /api/admin/caja/cerrar
- Tablas: caja_sesiones (UPDATE)
- Transaccion: NO
- Verifica rol: SI
- Verifica bloqueantes: SI (mesas con cobros pendientes)
- Calcula desglose: SI (via getDesglosePagos con query dinamica)
- Riesgo: usuario_id del body
- Riesgo: query dinamica en getDesglosePagos/getMovimientosTotales

### 4. Crear Pedido
- Archivo: server/routes/pedidos.js (linea ~210)
- Endpoint: POST /api/pedidos
- Tablas: pedidos (INSERT), pedido_items (INSERT x N), mesas (UPDATE), productos (UPDATE stock)
- Transaccion: SI (db.transaction)
- Valida: opciones requeridas, stock disponible, no pedido activo duplicado
- Riesgo: si falla el commit la transaccion revierte, pero printers.printComanda() ya puede haber sido llamada fuera de la transaccion

### 5. Anular Pedido
- Archivo: server/routes/admin.js (linea ~744)
- Endpoint: POST /api/admin/pedidos/:id/anular
- Tablas: pedidos (UPDATE), pedido_items (UPDATE), mesas (UPDATE), productos (UPDATE stock)
- Transaccion: SI (db.transaction)
- Verifica rol: SI (usuario_id del body)
- Repone stock: SI
- Riesgo: logica de reposicion de stock duplicada vs routes/pedidos.js

### 6. Eliminar Pedido Pagado
- Archivo: server/routes/admin.js
- Endpoint: POST /api/admin/pedidos/:id/eliminar
- Efecto: anula el pedido, registra EGRESO en caja por el total
- Tablas: pagos (DELETE), pedidos (UPDATE), pedido_items (UPDATE), caja_movimientos (INSERT), mesas (UPDATE)
- Transaccion: SI
- Riesgo: operacion muy destructiva — no hay soft delete, el pago se elimina fisicamente

---

## Operaciones P1 — Alta Prioridad

### 7. Validar y Descontar Stock al agregar items
- Archivo: server/routes/pedidos.js (lineas ~25-65)
- Funcion: validarYDescontarStock(items) — helper interno
- Tablas: productos (UPDATE stock_actual -= cantidad)
- Transaccion: depende del contexto (parte de transaccion padre)
- Riesgo: logica duplicada con anulacion en admin.js

### 8. Mover Items entre Mesas
- Archivo: server/routes/pedidos.js (linea ~507)
- Endpoint: POST /api/pedidos/:id/mover
- Tablas: pedido_items (UPDATE), pedidos (INSERT si nuevo en destino), mesas (UPDATE x2), logs_mesas (INSERT x2)
- Transaccion: SI
- Verifica: sin pagos previos en origen
- Riesgo: crea un pedido nuevo en destino dentro de una transaccion larga

### 9. Unir Mesas
- Archivo: server/routes/pedidos.js (linea ~589)
- Endpoint: POST /api/pedidos/:id/unir
- Tablas: pedido_items (UPDATE), pedidos (UPDATE/CANCELAR), mesas (UPDATE x2)
- Transaccion: SI
- Verifica: sin pagos previos en origen

### 10. Movimiento de Caja (Ingreso/Egreso manual)
- Archivo: server/routes/admin.js
- Endpoint: POST /api/admin/caja/movimientos
- Tablas: caja_movimientos (INSERT)
- Verifica caja abierta: SI
- Riesgo: usuario_id del body

### 11. Devolucion de Pago (quitar pago de pedido cerrado)
- Archivo: server/routes/admin.js
- Endpoint: DELETE /api/admin/pedidos/:id/pagos/:pagoId
- Tablas: pagos (DELETE), pedidos (UPDATE estado), caja_movimientos (INSERT EGRESO), pagos_log (INSERT), mesas (UPDATE)
- Transaccion: SI
- Riesgo: operacion de alto impacto financiero

### 12. Control de Stock Batch
- Archivo: server/routes/productos.js
- Endpoint: POST /api/productos/stock-batch
- Tablas: productos (UPDATE x N)
- Transaccion: SI
- Efectos: io.emit('stock:actualizado') x N

---

## Operaciones P2 — Prioridad Media

### 13. Agregar Items a Pedido Existente
- Endpoint: POST /api/pedidos/:id/items
- Tablas: pedido_items, pedidos.total, productos.stock_actual
- Transaccion: SI
- Riesgo: si pedido estaba LISTO/ENTREGADO, se resetea a ABIERTO

### 14. Aplicar Descuento
- Endpoint: POST /api/pedidos/:id/descuento
- Tablas: descuentos (INSERT)
- Riesgo: usuario_id del body; afecta calculo de cobro

### 15. Eliminar Item de Pedido
- Endpoint: DELETE /api/pedidos/:id/items/:itemId
- Tablas: pedido_items (DELETE), pedidos.total, productos.stock_actual
- Transaccion: SI

### 16. Cambiar Estado de Item (KDS)
- Endpoint: PATCH /api/pedidos/items/:itemId/estado
- Tablas: pedido_items (UPDATE estado)
- Efectos: io.emit('item:actualizado'), io.emit('pedido:actualizado')
- Operacion operativa critica para cocina

### 17. Tomar Mesa
- Endpoint: POST /api/mesas/:id/tomar
- Tablas: mesas (UPDATE estado, mesero_id)
- Efectos: acquireTableLock, io.emit
- Riesgo: lock en memoria (perdido si reinicia servidor)

---

## Operaciones P3 — Prioridad Baja

### 18. Reimprimir Ticket
- Endpoint: POST /api/pedidos/:id/reimprimir
- Sin cambios en DB
- Efectos: printers.printTicket()

### 19. Imprimir Pre-cuenta
- Endpoint: POST /api/pedidos/:id/precuenta
- Sin cambios en DB
- Efectos: printers.printPrecuenta()

### 20. Detectar Impresoras
- Endpoint: GET /api/printers/detect
- Sin cambios en DB
- Efectos: execSync PowerShell

### 21. Actualizar Config Impresoras
- Endpoint: POST /api/printers/config
- Sin cambios en DB
- Efectos: escribe printers-config.json en disco

---

## Resumen de Riesgos por Tabla

| Tabla | Escrituras criticas | Operaciones |
|---|---|---|
| pagos | INSERT, DELETE | pagar, pagar-dividido, devolucion |
| pedidos | UPDATE estado | pagar, anular, mover, unir |
| pedido_items | INSERT, UPDATE, DELETE | crear, agregar, eliminar, mover |
| caja_sesiones | INSERT, UPDATE | abrir-caja, cerrar-caja |
| caja_movimientos | INSERT, DELETE | egreso, devolucion |
| productos | UPDATE stock_actual | crear pedido, anular, stock-batch |
| mesas | UPDATE estado/pedido_activo_id | todas las operaciones de mesa |
| vales | UPDATE monto_restante | pago con vale |

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
