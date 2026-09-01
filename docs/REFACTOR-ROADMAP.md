# REFACTOR-ROADMAP.md
**POS Sarita — Roadmap de Reestructuración Arquitectónica**
**Fecha de baseline:** 2026-09-01
**Estado actual:** FASE 0 EN PROCESO

---

```text
┌────────────────────────────────────────────────────────┐
│                        FASE 0                          │
│         Baseline, Backup y Documentacion               │
│                     (COMPLETADO)                       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        FASE 1                          │
│             Extraccion de Servicios Puros              │
│       StockService, PagoService, CajaService           │
│        + Tests de Caracterizacion (Vitest)             │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        FASE 2                          │
│                 Seguridad y Autenticacion              │
│         Session Tokens + Middleware requireAuth         │
│           Hasheo de PINs con bcrypt/argon2             │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        FASE 3                          │
│               Extraccion de JS Inline                  │
│       Mover scripts inline de mesero.html/admin.html   │
│             a modulos externos navegables              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        FASE 4                          │
│                Capa de Repositorios (DB)               │
│       Desacoplar SQL de los Controllers/Routes          │
│            PedidoRepository, MesaRepository            │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                        FASE 5                          │
│              Monolito Modular Completo                 │
│         Eventos desacoplados (SocketEmitter)           │
│             Modulo de impresion con cola               │
└────────────────────────────────────────────────────────┘
```

---

## Detalle de Fases Post-Fase 0

### FASE 1 — Servicios y Tests de Caracterización
- Crear `tests/` con Vitest y Supertest.
- Extraer `server/services/StockService.js` (unificar descontar/reponer stock).
- Extraer `server/services/PagoService.js` (unificar calculo de descuentos).
- Extraer `server/services/CajaService.js` (unificar desglose de pagos y cierres).
- Añadir tests unitarios que aseguren que los calculos financieros no cambien.

### FASE 2 — Seguridad
- Crear middleware `server/middleware/auth.js` (`requireAuth`, `requireRole`).
- Implementar tabla de sesiones y tokens en login (`POST /api/usuarios/login`).
- Reemplazar `req.body.usuario_id` en los 44+ endpoints por `req.usuario.id` extraido del token.
- Hashear PINs en base de datos.

### FASE 3 — Extracción de Frontend Inline
- Mover los ~1780L de `<script>` inline de `mesero.html` a `public/js/mesero-app.js`.
- Mover los ~2424L de `<script>` inline de `admin.html` a `public/js/admin-app.js`.
- Modularizar `public/js/pos.js` (2842L) en submódulos (carrito, cobro, vista pedido).

### FASE 4 — Repositorios y Desacoplamiento de Datos
- Crear `server/repositories/` (`PedidoRepo`, `MesaRepo`, `ProductoRepo`, `CajaRepo`).
- Migrar queries SQL directas fuera de los archivos de rutas.
- Extraer `schema.sql` y formalizar migraciones versionadas.

### FASE 5 — Infraestructura y Eventos
- Centralizar `io.emit()` en `server/events/socketEmitter.js`.
- Crear cola de impresion simple con reintentos para evitar perdida de comandas.

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
