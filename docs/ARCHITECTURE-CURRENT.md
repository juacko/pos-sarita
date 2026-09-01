# ARCHITECTURE-CURRENT.md
**POS Sarita — Mapa de Arquitectura Actual**
**Fecha de baseline:** 2026-09-01
**Commit de referencia:** 3f86a87 (feat: control de stock diario)
**Rama:** `feature/rediseno-ui`

> Documento de solo lectura generado como baseline pre-refactor. NO modificar.

---

## 1. Arbol de Carpetas

```
pos-sarita/
├── .git/
├── .gitignore                       # node_modules/, data/*.db*, prints/, .env
├── CAJA                             # [OBSOLETO] Buffer ESC/POS de prueba
├── COCINA2                          # [OBSOLETO] Buffer ESC/POS de prueba
├── ESTRATEGIA-DISENO.md             # Documento de diseno UI previo
├── IMPROVEMENTS_SUMMARY.md          # Resumen de mejoras anteriores
├── data/
│   ├── pos.db                       # [CRITICO] Base de datos SQLite principal (196 KB)
│   ├── pos.db-wal                   # [CRITICO] WAL journal (~1.8 MB, datos en vuelo)
│   └── pos.db-shm                   # WAL shared memory (32 KB)
├── database.sqlite                  # [OBSOLETO] Archivo vacio (0 bytes)
├── docs/                            # [NUEVO] Documentacion de baseline
├── node_modules/                    # Dependencias npm (ignoradas en git)
├── package.json                     # Dependencias y scripts
├── package-lock.json                # Lockfile npm
├── printers-config.json             # Configuracion de impresoras (JSON en disco)
├── public/
│   ├── admin.html                   # [CRITICO] Vista Admin — 166 KB (2424L script inline)
│   ├── barra.html                   # Vista Barra — 27 KB
│   ├── cocina.html                  # Vista Cocina — 29 KB
│   ├── impresoras.html              # Vista config impresoras — 12 KB
│   ├── index.html                   # [CRITICO] Vista POS principal — 50 KB
│   ├── mesero.html                  # [CRITICO] Vista Mesero — 119 KB (1780L inline)
│   ├── css/
│   │   ├── style.css                # CSS global — 28 KB
│   │   └── style.css.bak            # [OBSOLETO] Backup CSS anterior
│   ├── img/                         # Imagenes (no trackeadas en git)
│   └── js/
│       ├── login.js                 # Login con PIN — 2.6 KB
│       ├── mesas.js                 # [CRITICO] Grid mesas, filtros — 35 KB
│       ├── modal-utils.js           # confirm/prompt/toast — 7.8 KB
│       ├── pos.js                   # [CRITICO] POS completo — 112 KB (2842L)
│       └── socket-client.js         # Cliente Socket.IO — 1 KB
├── server/
│   ├── db.js                        # [CRITICO] Schema + migraciones + seed — 22 KB
│   ├── index.js                     # Bootstrap Express + Socket.IO — 4 KB
│   ├── metodos-pago.js              # Metodos de pago — 2.6 KB
│   ├── printers.js                  # [CRITICO] ESC/POS + impresion — 35 KB
│   ├── rawprint.ps1                 # Script PowerShell impresion raw — 2.5 KB
│   ├── seed-carta.js                # Seed manual de carta — 19 KB
│   ├── table-lock.js                # Lock in-memory de mesas — 1 KB
│   └── routes/
│       ├── admin.js                 # [CRITICO] 47 endpoints admin — 72 KB
│       ├── mesas.js                 # [CRITICO] 17 endpoints mesas — 25 KB
│       ├── pedidos.js               # [CRITICO] 25 endpoints pedidos — 60 KB
│       ├── productos.js             # 6 endpoints productos — 7 KB
│       └── usuarios.js              # 2 endpoints auth — 0.8 KB
├── test-start.js                    # [OBSOLETO] Script ad-hoc inicio — 67 B
├── test.js                          # [OBSOLETO] Script prueba print — 334 B
└── test2.js                         # [OBSOLETO] Script prueba print — 325 B
```

---

## 2. Arquitectura General

**Patron:** Monolito de 2 capas — Fat Route Handlers

```
Browser (Vanilla JS — MPA multi-pagina)
      | HTTP REST + WebSocket (Socket.IO)
      v
Express.js (index.js)
      | Router registration
      |-- /api/mesas        --> routes/mesas.js
      |-- /api/pedidos      --> routes/pedidos.js
      |-- /api/productos    --> routes/productos.js
      |-- /api/usuarios     --> routes/usuarios.js
      |-- /api/admin        --> routes/admin.js
      |-- /api/printers/*   --> printers.js (endpoints inline en index.js)
      |-- static            --> public/
                |
                v
        better-sqlite3 (sincrono)
                |
                v
          data/pos.db (WAL mode)
```

Cada route handler actua como: Controller + Service + Repository + Socket Emitter + Print Caller

---

## 3. Mapa de Dependencias Backend

```
index.js
  requires: express, http, socket.io, cors, path
  requires: ./db
  requires: ./routes/mesas    (inyecta io)
  requires: ./routes/pedidos  (inyecta io)
  requires: ./routes/productos (inyecta io)
  requires: ./routes/usuarios
  requires: ./routes/admin    (inyecta io)
  requires: ./printers

routes/pedidos.js
  requires: ../db
  requires: ../printers  -> printComanda, printTicket, printTicketDividido, printPrecuenta
  requires: ../metodos-pago -> esMetodoValido
  [recibe io como parametro]

routes/admin.js
  requires: ../db
  requires: ../printers  -> printCorteCaja, printResumenMovimientos
  [recibe io como parametro]

routes/mesas.js
  requires: ../db
  requires: ../table-lock -> acquireTableLock, releaseTableLock
  [recibe io como parametro]

routes/productos.js
  requires: ../db
  [recibe io como parametro]

routes/usuarios.js
  requires: ../db

printers.js
  requires: path, fs, child_process.execSync
  requires: ./metodos-pago -> textoDeMetodo
  [lee printers-config.json en disco]
  [ejecuta rawprint.ps1 via execSync]

metodos-pago.js
  requires: ./db

table-lock.js
  [sin dependencias — Map en memoria]

db.js
  requires: better-sqlite3, path, fs
  [crea schema al iniciar si no existe]
  [ejecuta migraciones inline al arrancar]
  [crea seed inicial si tablas vacias]
  exports: db singleton
```

---

## 4. Mapa de Dependencias Frontend

```
index.html (POS principal)
  <script src> js/socket-client.js
  <script src> js/login.js
  <script src> js/modal-utils.js
  <script src> js/mesas.js
  <script src> js/pos.js
  <script src> socket.io (servida por Express)

mesero.html
  <script src> js/socket-client.js
  <script src> js/login.js
  <script src> js/modal-utils.js
  <script> [INLINE ~1780 lineas] <- vista mesero completa

admin.html
  <script src> js/socket-client.js
  <script src> js/login.js
  <script src> js/modal-utils.js
  <script> [INLINE ~2424 lineas] <- admin completo

cocina.html / barra.html
  <script> [INLINE] <- KDS vistas

impresoras.html
  <script> [INLINE] <- config impresoras
```

---

## 5. Frontend -> Endpoints API (principales)

```
index.html / pos.js
  GET  /api/productos/categorias
  GET  /api/productos
  GET  /api/mesas
  GET  /api/mesas/:id
  POST /api/mesas/:id/tomar
  POST /api/mesas/:id/liberar
  POST /api/pedidos
  POST /api/pedidos/:id/items
  GET  /api/pedidos/:id
  POST /api/pedidos/:id/pagar
  POST /api/pedidos/:id/pagar-dividido
  POST /api/pedidos/:id/reimprimir
  POST /api/pedidos/:id/precuenta
  POST /api/pedidos/:id/descuento
  DELETE /api/pedidos/:id/descuento/:descId
  POST /api/pedidos/:id/mover
  POST /api/pedidos/:id/unir
  DELETE /api/pedidos/:id/items/:itemId
  PATCH /api/pedidos/:id/items/:itemId
  POST /api/admin/pedidos/:id/anular
  POST /api/admin/pedidos/:id/eliminar
  GET  /api/admin/pedidos/pagados
  POST /api/admin/pedidos/:id/pagos
  DELETE /api/admin/pedidos/:id/pagos/:pagoId
  PATCH /api/admin/pedidos/:id/pagos/:pagoId
  GET  /api/admin/caja/sesion-actual
  GET  /api/configuracion/modal_pago

admin.html (inline)
  GET/POST/PATCH/DELETE /api/admin/categorias[/:id]
  GET/POST/PUT/DELETE /api/admin/productos[/:id]
  GET/POST /api/admin/caja/abrir, /cerrar, /sesion-actual
  GET /api/admin/caja/bloqueantes
  GET/POST/DELETE /api/admin/caja/movimientos[/:id]
  GET /api/admin/caja/sesiones
  POST /api/admin/caja/corte-x/imprimir, /corte-z/imprimir
  GET /api/admin/pedidos/reporte, /anulables
  GET/POST/PATCH/DELETE /api/mesas/areas[/:id]
  GET/POST/PATCH /api/mesas[/:id]
  GET/POST /api/printers/config, /detect, /test/:name

cocina.html / barra.html (inline)
  GET /api/pedidos/cocina, /barra
  GET /api/pedidos/cocina/historial, /barra/historial
  PATCH /api/pedidos/:id/items/estado
  PATCH /api/pedidos/items/:itemId/estado
```

---

## 6. Clasificacion de Criticidad

| Archivo | Criticidad | Motivo |
|---|---|---|
| server/db.js | P0-CRITICO | Schema, migraciones, seed |
| server/routes/pedidos.js | P0-CRITICO | Flujo de venta y cobro |
| server/routes/admin.js | P0-CRITICO | Caja, anulaciones |
| server/routes/mesas.js | P0-CRITICO | Estado de mesas |
| server/index.js | P0-CRITICO | Bootstrap servidor |
| server/printers.js | P0-CRITICO | Impresion operativa |
| public/js/pos.js | P0-CRITICO | POS frontend |
| public/js/mesas.js | P0-CRITICO | Grid en tiempo real |
| data/pos.db | P0-CRITICO | BD produccion |
| data/pos.db-wal | P0-CRITICO | Datos en vuelo WAL |
| server/routes/productos.js | P1-ALTO | CRUD menu y stock |
| server/metodos-pago.js | P1-ALTO | Metodos de pago |
| server/table-lock.js | P1-ALTO | Locks de mesas |
| public/js/socket-client.js | P1-ALTO | Tiempo real |
| printers-config.json | P1-ALTO | Config persistida |
| server/rawprint.ps1 | P1-ALTO | Print Windows |
| public/admin.html | P1-ALTO | Panel admin |
| public/mesero.html | P1-ALTO | Vista mesero |
| server/routes/usuarios.js | P2-MEDIO | Auth basica |
| CAJA, COCINA2 | OBSOLETO | Buffers de prueba |
| test.js, test2.js, test-start.js | OBSOLETO | Scripts ad-hoc |
| database.sqlite | OBSOLETO | Archivo vacio 0 bytes |
| public/css/style.css.bak | OBSOLETO | Backup CSS |

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
