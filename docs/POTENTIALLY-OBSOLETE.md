# POTENTIALLY-OBSOLETE.md
**POS Sarita — Detección de Código y Archivos Potencialmente Obsoletos**
**Fecha de baseline:** 2026-09-01

> 🚨 IMPORTANTE: NO ELIMINAR NINGÚN ARCHIVO DE ESTA LISTA TODAVÍA.
> Este documento sirve únicamente para inventariar y clasificar candidatos a limpieza en fases posteriores.

---

| Archivo | Motivo de sospecha | Dónde se referencia | Nivel de confianza | Recomendación |
|---|---|---|---|---|
| `CAJA` (en raíz) | Archivo binario con buffer ESC/POS de prueba de 367 bytes | Ninguna parte del codigo del servidor | 🔴 99% Obsoleto | Eliminar en Fase 0/1 post-backup |
| `COCINA2` (en raíz) | Archivo binario con buffer ESC/POS de prueba de 252 bytes | Ninguna parte del codigo del servidor | 🔴 99% Obsoleto | Eliminar en Fase 0/1 post-backup |
| `test.js` (en raíz) | Script ad-hoc de 334 bytes para probar impresion raw | Ninguna parte del proyecto | 🔴 99% Obsoleto | Mover a `scratch/` o eliminar |
| `test2.js` (en raíz) | Script ad-hoc de 325 bytes para probar impresion raw | Ninguna parte del proyecto | 🔴 99% Obsoleto | Mover a `scratch/` o eliminar |
| `test-start.js` (en raíz) | Script de 67 bytes con `require('./server/index.js')` | Ninguna parte del proyecto | 🔴 99% Obsoleto | Eliminar |
| `database.sqlite` (en raíz) | Archivo vacio de 0 bytes. La BD real se ubica en `data/pos.db` | Ninguna parte (db.js apunta a `data/pos.db`) | 🔴 100% Obsoleto | Eliminar |
| `public/css/style.css.bak` | Copia de respaldo antigua del archivo CSS (18.5 KB) | Ninguna parte en HTML | 🔴 100% Obsoleto | Eliminar |
| `server/seed-carta.js` | Script de seed manual (19.2 KB) para restaurar carta por defecto | Manualmente via CLI cuando se desea resetear productos | 🟡 Conservar | Mantener como script utilitario de CLI |

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
