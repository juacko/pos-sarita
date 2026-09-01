# DATABASE-CURRENT.md
**POS Sarita — Mapa de Base de Datos Actual**
**Fecha de baseline:** 2026-09-01
**Archivo:** data/pos.db
**Motor:** SQLite 3 (via better-sqlite3)
**Modo journal:** WAL (Write-Ahead Logging)
**Pragma:** foreign_keys = ON

---

## Estado del archivo

| Archivo | Tamano | Fecha modificacion |
|---|---|---|
| pos.db | 196 KB | 2026-08-18 |
| pos.db-wal | 1838 KB | 2026-08-21 (datos en vuelo) |
| pos.db-shm | 32 KB | 2026-08-20 |

> IMPORTANTE: El WAL contiene transacciones no consolidadas. NUNCA copiar pos.db sin tambien copiar pos.db-wal y pos.db-shm, o primero hacer checkpoint.

---

## Tablas (19 total)

### 1. usuarios
**Proposito:** Autenticacion y roles de operadores

| Columna | Tipo | Constraint |
|---|---|---|
| id | INTEGER PK | AUTOINCREMENT |
| nombre | TEXT | NOT NULL |
| rol | TEXT | CHECK IN ('admin','mesero','cajero','cocina') |
| pin | TEXT | NOT NULL (PLAINTEXT — deuda de seguridad) |
| activo | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

Seed por defecto: Admin/1234, Mesero 1/1111, Caja/2222, Cocina/3333

---

### 2. areas
**Proposito:** Agrupacion de mesas (Salon, Delivery, Para Llevar)

| Columna | Tipo | Constraint |
|---|---|---|
| id | INTEGER PK | AUTOINCREMENT |
| nombre | TEXT | NOT NULL |
| tipo | TEXT | CHECK IN ('SALON','DELIVERY','PARA_LLEVAR') |
| orden | INTEGER | DEFAULT 0 |
| activo | INTEGER | DEFAULT 1 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

Seed: Salon Principal, Terraza, Delivery, Para Llevar

---

### 3. mesas
**Proposito:** Mesas fisicas y virtuales del restaurante

| Columna | Tipo | Constraint |
|---|---|---|
| id | INTEGER PK | AUTOINCREMENT |
| numero | INTEGER | UNIQUE NOT NULL |
| nombre | TEXT | |
| capacidad | INTEGER | DEFAULT 4 |
| area_id | INTEGER | FK areas(id) |
| es_virtual | INTEGER | DEFAULT 0 (Delivery/PL son virtuales) |
| estado | TEXT | CHECK IN ('LIBRE','OCUPADO','RESERVADO','CERRANDO','INACTIVO') |
| mesero_id | INTEGER | FK usuarios(id) |
| mesero_nombre | TEXT | Desnormalizado — historico |
| pedido_activo_id | INTEGER | FK logica (no FK real en schema) |
| ocupado_desde | DATETIME | |
| version | INTEGER | DEFAULT 1 (optimistic locking) |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP |

Notas: pedido_activo_id es una FK logica (no definida como FOREIGN KEY en schema por flexibilidad)

---

### 4. categorias
**Proposito:** Categorias del menu

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| nombre | TEXT | NOT NULL |
| color | TEXT | Hex color para UI |
| activo | INTEGER | DEFAULT 1 |
| created_at | DATETIME | |
| destino | TEXT | DEFAULT 'cocina' (cocina/barra) — migrado |

---

### 5. productos
**Proposito:** Carta del restaurante

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| nombre | TEXT | NOT NULL |
| descripcion | TEXT | |
| precio | REAL | NOT NULL |
| categoria_id | INTEGER | FK categorias(id) |
| para_llevar | INTEGER | DEFAULT 0 |
| destino_override | TEXT | NULL/cocina/barra — migrado |
| controlar_stock | INTEGER | DEFAULT 0 |
| stock_actual | INTEGER | DEFAULT 0 |
| stock_minimo | INTEGER | DEFAULT 3 |
| activo | INTEGER | DEFAULT 1 |
| created_at | DATETIME | |

---

### 6. variantes
**Proposito:** Presentaciones de un producto (talla, portion)

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| producto_id | INTEGER | FK productos(id) |
| nombre | TEXT | NOT NULL |
| precio_adicional | REAL | DEFAULT 0 |
| activo | INTEGER | DEFAULT 1 |

---

### 7. modificadores
**Proposito:** Grupos de opciones personalizables por producto

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| producto_id | INTEGER | FK productos(id) |
| nombre | TEXT | NOT NULL |
| tipo | TEXT | CHECK IN ('select','multi','text') |
| requerido | INTEGER | DEFAULT 0 |
| max_opciones | INTEGER | DEFAULT 1 |
| activo | INTEGER | DEFAULT 1 |
| depende_variante_id | INTEGER | NULL — visibilidad condicional (migrado) |

---

### 8. opciones_mod
**Proposito:** Opciones dentro de un modificador

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| modificador_id | INTEGER | FK modificadores(id) |
| nombre | TEXT | NOT NULL |
| precio_adicional | REAL | DEFAULT 0 |
| activo | INTEGER | DEFAULT 1 |

---

### 9. agregados
**Proposito:** Extras opcionales con cantidad variable

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| producto_id | INTEGER | FK productos(id) |
| nombre | TEXT | NOT NULL |
| precio | REAL | NOT NULL |
| maximo | INTEGER | DEFAULT 5 |
| activo | INTEGER | DEFAULT 1 |

---

### 10. pedidos
**Proposito:** Ordenes de venta

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| mesa_id | INTEGER | FK mesas(id) NOT NULL |
| mesa_numero | INTEGER | Desnormalizado (historico) |
| mesero_id | INTEGER | FK usuarios(id) |
| mesero_nombre | TEXT | Desnormalizado (historico) |
| estado | TEXT | CHECK IN ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO','CERRADO','CANCELADO') |
| total | REAL | DEFAULT 0 (calculado del lado servidor) |
| nota | TEXT | Nota general del pedido |
| cliente_nombre | TEXT | Para delivery/para llevar |
| cliente_telefono | TEXT | |
| cliente_direccion | TEXT | Solo delivery |
| hora_recogida | TEXT | Para llevar |
| motivo_cancelacion | TEXT | Migrado |
| anulado_por | INTEGER | FK usuarios(id) — migrado |
| created_at | DATETIME | |
| updated_at | DATETIME | |

---

### 11. pedido_items
**Proposito:** Items individuales de un pedido

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| pedido_id | INTEGER | FK pedidos(id) NOT NULL |
| producto_id | INTEGER | NULL (items libres sin producto) |
| producto_nombre | TEXT | Desnormalizado (historico) NOT NULL |
| cantidad | INTEGER | DEFAULT 1 |
| precio_unitario | REAL | NOT NULL |
| precio_adicional | REAL | DEFAULT 0 (variante + modificadores) |
| notas | TEXT | Instrucciones especiales |
| variante_id | INTEGER | Migrado |
| variante_nombre | TEXT | Desnormalizado |
| modificadores_json | TEXT | JSON array de modificadores seleccionados |
| agregados_json | TEXT | JSON array de agregados |
| detalle | TEXT | Texto de resumen de opciones |
| estado | TEXT | CHECK IN ('PENDIENTE','COCINANDO','LISTO','ENTREGADO','CANCELADO') |
| cantidad_pagada | INTEGER | DEFAULT 0 (division de cuenta) |
| destino_impresion | TEXT | 'cocina' o 'barra' — migrado |
| created_at | DATETIME | |

---

### 12. pagos
**Proposito:** Pagos registrados por pedido

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| pedido_id | INTEGER | FK pedidos(id) NOT NULL |
| monto | REAL | NOT NULL |
| metodo | TEXT | NOT NULL (sin CHECK — tabla reconstruida) |
| propina | REAL | DEFAULT 0 |
| referencia | TEXT | Codigo de vale, referencia de transferencia |
| notas | TEXT | |
| usuario_id | INTEGER | FK usuarios(id) — migrado |
| created_at | DATETIME | |

Nota: La tabla fue reconstruida via rebuildSinCheck() para eliminar CHECK IN de metodo (permite metodos dinamicos)

---

### 13. descuentos
**Proposito:** Descuentos aplicados a pedidos

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| pedido_id | INTEGER | FK pedidos(id) NOT NULL |
| tipo | TEXT | CHECK IN ('porcentaje','monto_fijo') |
| valor | REAL | NOT NULL |
| motivo | TEXT | NOT NULL |
| usuario_id | INTEGER | FK usuarios(id) |
| created_at | DATETIME | |

---

### 14. vales
**Proposito:** Vales de pago prepagados

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| codigo | TEXT | UNIQUE NOT NULL |
| monto_inicial | REAL | NOT NULL |
| monto_restante | REAL | NOT NULL |
| cliente_nombre | TEXT | |
| activo | INTEGER | DEFAULT 1 |
| created_at | DATETIME | |

---

### 15. caja_sesiones
**Proposito:** Sesiones de apertura/cierre de caja

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| usuario_id | INTEGER | FK usuarios(id) NOT NULL |
| fondo_inicial | REAL | DEFAULT 0 |
| efectivo_contado | REAL | Al cierre |
| estado | TEXT | CHECK IN ('ABIERTA','CERRADA') |
| notas_apertura | TEXT | |
| notas_cierre | TEXT | |
| opened_at | DATETIME | |
| absorbe_desde | DATETIME | Pagos anteriores a absorber — migrado |
| closed_at | DATETIME | |
| total_ventas | REAL | Calculado al cierre — migrado |
| propinas | REAL | Migrado |
| efectivo_esperado | REAL | Migrado |
| sobrante_faltante | REAL | Migrado |
| total_pedidos | INTEGER | Migrado |
| desglose_json | TEXT | JSON del desglose por metodo — migrado |
| cerrada_por | INTEGER | FK usuarios — migrado |

---

### 16. caja_movimientos
**Proposito:** Ingresos y egresos manuales de caja

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| tipo | TEXT | CHECK IN ('INGRESO','EGRESO') |
| concepto | TEXT | NOT NULL |
| monto | REAL | NOT NULL |
| metodo_pago | TEXT | NOT NULL (reconstruida sin CHECK) |
| persona | TEXT | |
| usuario_id | INTEGER | FK usuarios(id) |
| notas | TEXT | |
| created_at | DATETIME | |

---

### 17. pagos_log
**Proposito:** Auditoria de cambios en pagos

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| pedido_id | INTEGER | FK pedidos(id) NOT NULL |
| pago_id | INTEGER | FK pagos(id) — nullable |
| accion | TEXT | NOT NULL (CAMBIO_METODO, ELIMINACION, etc.) |
| motivo | TEXT | |
| detalle | TEXT | |
| usuario_id | INTEGER | FK usuarios(id) |
| created_at | DATETIME | |

---

### 18. logs_mesas
**Proposito:** Historial de acciones en mesas

| Columna | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| mesa_id | INTEGER | FK mesas(id) NOT NULL |
| accion | TEXT | NOT NULL (TOMAR, LIBERAR, PEDIDO_ANULADO, ITEMS_MOVIDOS, etc.) |
| mesero_id | INTEGER | |
| detalle | TEXT | |
| created_at | DATETIME | |

---

### 19. configuracion
**Proposito:** Configuracion clave-valor del sistema

| Columna | Tipo | Notas |
|---|---|---|
| clave | TEXT PK | |
| valor | TEXT | NOT NULL (JSON serializado) |
| updated_at | DATETIME | |

Claves conocidas:
- `hora_corte`: string HH:MM
- `modal_pago`: JSON con metodos habilitados y opciones de UI

---

## Relaciones principales

```
areas (1) ----> (N) mesas
usuarios (1) --> (N) pedidos (mesero)
usuarios (1) --> (N) pagos (cajero)
usuarios (1) --> (N) caja_sesiones
usuarios (1) --> (N) descuentos
categorias (1) -> (N) productos
productos (1) --> (N) variantes
productos (1) --> (N) modificadores
productos (1) --> (N) agregados
modificadores (1) -> (N) opciones_mod
mesas (1) -------> (N) pedidos
pedidos (1) -----> (N) pedido_items
pedidos (1) -----> (N) pagos
pedidos (1) -----> (N) descuentos
pedidos (1) -----> (N) pagos_log
mesas (1) -------> (N) logs_mesas
vales (1) -------> (N) pagos (via referencia)
```

---

## Migraciones (sistema inline en db.js)

No existe un sistema de versioning de migraciones. Las migraciones se aplican al inicio via:
- `migrateColumns()` — ALTER TABLE ADD COLUMN IF NOT EXISTS para columnas nuevas
- `migrarTipoPastaCombos()` — Migracion de datos especifica del negocio
- `rebuildSinCheck()` — Reconstruccion de tablas para eliminar CHECKs
- `repararFksHuerfanas()` — Reparacion de FKs post-rebuild

Todas se ejecutan cada vez que arranca el servidor. Son idempotentes.

---

## Indices

No hay indices definidos explicitamente en el schema.
SQLite crea indices automaticos en PK y columnas UNIQUE.

---

## Triggers

No hay triggers definidos.

---

## Seeds

Datos iniciales insertados si las tablas estan vacias:
- 4 usuarios (Admin, Mesero 1, Caja, Cocina)
- 12 mesas fisicas (Mesa 1 a Mesa 12)
- 4 areas (Salon Principal, Terraza, Delivery, Para Llevar)
- 2 mesas virtuales (Delivery, Para Llevar)
- 3 vales de prueba (VALE-001, VALE-002, VALE-TEST)
- Configuracion por defecto (hora_corte, modal_pago)

Productos: seed separado via seed-carta.js (no arranca automaticamente)

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
