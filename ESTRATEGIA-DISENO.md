# Estrategia: Sistema de Diseño por Tokens (alternativa a Astryx)

Fecha: 2026-08-07
Estado: BORRADOR para evaluar (no se ha tocado código)

## 1. Contexto

El proyecto `pos-sarita` es un POS de restaurante en red local:

- Backend: Node + Express + Socket.io + SQLite (`better-sqlite3`).
- Frontend: HTML en `public/` (index, admin, mesero, cocina, impresoras) con JS vanilla.
- UI: un único `public/css/style.css` (821 líneas) con tokens básicos en `:root`.

Se evaluó usar **Astryx** (https://astryx.atmeta.com): librería de componentes de
**React 19** que exige reescribir las 5 pantallas a React, agregar build/bundler y
reprocesar los estilos en cascade layers. Para un POS de trabajo en producción es un
**cambio demasiado grande**.

Esta estrategia propone una vía alternativa: **tomar una guía de diseño simple (MD)
y convertirla en un sistema de tokens CSS aplicado sobre el stack existente**, sin
reescribir nada ni cambiar la arquitectura.

## 2. Decisión central

Una guía de diseño se reduce a un conjunto finito de variables: color, tipografía,
espaciado, radios, sombras y motion. Si esas decisiones se expresan como **CSS
custom properties en `:root`**, todo el CSS puede pasarse a usar esas variables y el
resultado visual cambia sin tocar el HTML ni el JS.

El proyecto ya usa este mismo patrón (variables `--green`, `--shadow`, `--radius`).
La estrategia consiste en **ampliar y ordenar ese token-set con la guía de diseño**,
no en reescribir el sistema visual.

## 3. Anatomía del token-set propuesto

Seis familias de tokens, cada una en su sección comentada:

| Familia | Tokens | Cuándo existe hoy |
|---|---|---|
| Color | `--color-{success,danger,warning,info}`, `--color-bg`, `--color-surface`, `--color-text`, `--color-border` | Existen `--green/--red/--yellow/--blue` con hover |
| Tipografía | `--font-family`, `--font-size-xs..xl`, `--font-weight-*` | Hardcodeado (body 16px, h1 1.25rem) |
| Espaciado | `--space-1..xl` (base 4px) | Hardcodeado (12px 24px, 8px…) |
| Radio | `--radius-sm`, `--radius` (base), `--radius-lg`, `--radius-full` | Solo existe `--radius: 8px` |
| Elevación | `--shadow-sm`, `--shadow`, `--shadow-lg`, `--shadow-xl` | Ya existen `--shadow` y `--shadow-lg` |
| Motion | `--dur-fast`, `--ease-out` | Transiciones hardcodeadas |

Nota: se mantiene todo dentro del mismo `:root` de `style.css` por simplicidad. Si
en el futuro hay múltiples hojas, se puede dividir en `tokens.css` sin afectar markup.

## 4. Fases sugeridas (con estimaciones)

Fase 1 — Evaluar la guía (0.5 h)
- Leer el MD del usuario: paleta, escalas tipográficas/espaciado/radio, reglas de
  componentes clave (botón, tarjeta, modal, tabla).
- Producir el mapeo "guía → tokens" (tabla corta con valor y variable).

Fase 2 — Definir `tokens` (1.5 h)
- Ampliar `:root` con las 6 familias completadas.
- Compatibilidad con los tokens actuales: conservar alias (p. ej. `--green` → `var(--color-success)`).
- No cambiar aún los usos.

Fase 3 — Reemplazo global (3–6 h)
- Sustituir valores hardcodeados por variables **solo 1:1 idéntico** (mismo valor),
  para no alterar el diseño en este paso.
- Los cambios visuales reales van en la Fase 5.

Fase 4 — Reglas de componentes (4–6 h)
- Estandarizar por componente (`.btn`, `.card`, `.modal`, `.form input`, `.tab`,
  `.toast`) usando tokens, nunca colores fijos.
- Ya existen clases compartidas; es pulido, no reestructuración.

Fase 5 — Look nuevo según la guía (opcional)
- Migrar paleta, radios, escala tipográfica y sombras **solo a nivel de token**:
  el resultado es una sola edición de `:root`.

## 5. Por qué es la mejor alternativa para este proyecto

- **Sin cambios de arquitectura**: no React, no bundler, no cascade layers.
- **No rompe comportamiento**: caja, corte 23:00, pagos con método editable,
  impresión y socket.io quedan intactos.
- **Gradual y reversible**: cada fase es independiente; se aplica por pantalla y se
  prueba en cada paso.
- **Cambio de look casi instantáneo**: si el MD trae una paleta concreta, cambiar
  el valor de los tokens de `:root` actualiza toda la UI.
- **Toca lo que Astryx da en superficie** (tokens, cohesión visual) sin la factura
  de React.

## 6. Cuándo NO conviene (y cuándo sí Astryx)

Conviene seguir con tokens-vanilla si:
- Solo se busca consistencia visual de bajo riesgo.
- Las personas mantienen y corrigen JS vanilla sin build.

Conviene evaluar la ruta React/Astryx si:
- Se quiere accesibilidad avanzada ya resuelta por componentes (modales
  enfocables, combos, listbox, etc.).
- El proyecto tiene plan de migrar a React en el futuro.
- Existe alguien manteniendo React en el equipo.

Regla práctica: **tokens + CSS vanilla** si el objetivo es consistencia visual con
riesgo bajo; **Astryx** solo si la decisión tecnológica ya es "mover a React".

## 7. Checklist de evaluación (MD "Elegant & Fun" recibido y evaluado)

- [x] **Paleta → tokens**: el MD reutiliza EXACTAMENTE los mismos hex que ya usa
      el proyecto para estados (success #10b981, danger #ef4444, warning #f59e0b,
      info #3b82f6) y los light-tints ya existen hardcodeados en `.badge-*`
      (#d1fae5, #fee2e2, #fef3c7, #dbeafe). Cambios: agregar indigo primary
      (#4f46e5, hoy el primario es azul #3b82f6), neutros slate más suaves
      (bg #f8fafc, text #0f172a, border #e2e8f0) y tokens glass.
- [x] **Tipografía → tokens**: Inter (cuerpo) + Outfit (títulos/marca). Un `<link>`
      a Google Fonts + 2 reglas en `style.css`; hoy es Segoe UI / system-ui.
- [x] **Espaciado y radio**: radios más generosos (botones 16px, tarjetas 14px,
      badges pill 20px). Base actual 8px → subir a 10-14px por token.
- [x] **Elevación y motion**: sombras ya tokenizadas (`--shadow`, `--shadow-lg`);
      el MD las redefine un poco más suaves (misma estructura). Motion ya usa
      transiciones; estandarizar en `--dur-fast`/`--ease-out`.
- [x] **Componentes del MD → clases actuales**: cobertura ~90%. `.btn-primary/
      btn-success/btn-danger` ya existen (nombres coinciden), `.badge-*` ≡
      `status-badge`/`amount-badge`, tarjetas ≡ `.mesa-card`/`.canal-card`,
      modales y toast ya existen. No falta estructura.
- [x] **Hardcodeos que exceden la guía**: menores (pinpad #E5E7EB, scrollbar
      #D1D5DB, degradados de `.canal-card`) → se mapean a grises slate o se dejan.
- [x] **Conclusión**: el MD cubre ≥80% (≈90%) de la superficie visual sin cambios
      de estructura → **conviene la vía tokens con este MD**, descartando Astryx.

### Veredicto del análisis

| Criterio | MD "Elegant & Fun" (tokens) | Astryx (React) |
|---|---|---|
| Cambio de arquitectura | Ninguno | Rewrite a React 19 + bundler |
| Riesgo sobre caja/pagos/impresión | Nulo | Alto |
| Esfuerzo total | ~6–10 h en 5 fases | Semanas + QA |
| Resultado visual | Indigo + Outfit + glass, premium | Según tema, también premium |
| Accesibilidad de componentes | Manual (ya aceptable) | Avanzada incluida |
| Ajuste con el código actual | Nombres de clase ya coinciden | Todo nuevo |

Conclusión: aplicar la guía por fases sobre el stack actual. El look nuevo se logra
casi por completo cambiando valores de `:root` + tipografías + radios.

## 8. Docs de referencia

- Guía "Elegant & Fun" del usuario (recibida 2026-08-07) → fuente de verdad de
  paleta/escalas; evaluada en la sección 7.
- Manual de CSS custom properties (MDN).

## 9. Nota de trabajo

Nada de esto implica tocar `server/**`, la lógica de pagos/caja/editables implementada
recientemente, ni los archivos JS de las pantallas. Es una estrategia de **capa de
presentación** únicamente.