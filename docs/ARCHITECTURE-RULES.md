# ARCHITECTURE-RULES.md
**POS Sarita — Reglas Arquitectónicas Provisionales**
**Fecha de baseline:** 2026-09-01

---

## 1. Flujo de Control Permitido

```text
HTTP Request
  ↓
Routes / Controllers (Validación de entrada, manejo de HTTP req/res)
  ↓
Services (Lógica de negocio pura, reglas de dominio, transacciones)
  ↓
Repositories (Consultas SQL, acceso a SQLite)
  ↓
Database (better-sqlite3 / pos.db)
```

---

## 2. Reglas de Inviolabilidad ("NO PERMITIDO")

### ❌ Controller / Route → SQL directo
- **No permitido:** Las rutas Express no deben ejecutar `db.prepare(...)` directamente en las handlers de HTTP.
- **Permitido provisionalmente (Fase 0):** En la arquitectura heredada actual. Debe eliminarse progresivamente en las Fases 1-4.

### ❌ Domain / Services → Express HTTP (req/res)
- **No permitido:** Las funciones de servicio NO deben recibir `req` o `res`, ni conocer status codes HTTP (400, 404, 500).
- Los servicios devuelven datos puros o lanzan errores con código de dominio.

### ❌ Domain / Services → DOM / Browser APIs
- **No permitido:** Ningún módulo del servidor Node.js debe depender de conceptos de navegador o HTML.

### ❌ Business Logic → PowerShell / Spooler
- **No permitido:** La lógica de negocio (totales, cuentas, stock) NO debe acoplarse al script de impresión PowerShell. La impresión es un efecto secundario asíncrono o desacoplado.

### ❌ Frontend → Modificación directa de Totales
- **No permitido:** El cliente JS NO debe calcular el precio final pagado de un pedido de forma independiente y enviarlo como verdad absoluta. El servidor SIEMPRE recalcula los totales, descuentos y pendientes antes de registrar un pago.

---

## 3. Principios de Mantenimiento de la Arquitectura Target

1. **Idempotencia en servicios:** Las operaciones financieras deben ser seguras contra reintentos.
2. **Desacoplamiento de eventos:** La emision de WebSockets (`io.emit`) debe ocurrir a traves de una capa de eventos o helper dedicado, no desperdigado en medio de las transacciones de BD.
3. **Manejo centralizado de errores:** Los errores deben capturarse en un middleware de Express centralizado en lugar de bloques `try/catch` repetitivos en cada endpoint.

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
