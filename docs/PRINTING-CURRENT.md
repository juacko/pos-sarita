# PRINTING-CURRENT.md
**POS Sarita — Inventario y Mapa del Sistema de Impresion**
**Fecha de baseline:** 2026-09-01

---

## 1. Arquitectura de Impresion

El sistema de impresion permite enviar comanda, tickets de venta, pre-cuentas y cortes de caja directamente a impresoras termicas de tickets (ESC/POS) conectadas al servidor mediante la cola de impresion de Windows.

```text
Solicitud HTTP (POST /api/pedidos, /api/pedidos/:id/pagar, etc.)
  ↓
Route Handler (pedidos.js / admin.js)
  ↓
printers.js (Construccion de comandos binarios ESC/POS)
  ↓
Escritura de archivo temporal binario (data/_print_*.bin)
  ↓
child_process.execSync → PowerShell script (server/rawprint.ps1)
  ↓
Windows Spooler (Win32 API RAW print via PowerShell)
  ↓
Impresora Termica (ESC/POS 80mm / 58mm)
```

---

## 2. Archivos Involucrados

| Archivo | Rol |
|---|---|
| `server/printers.js` | Modulo principal de impresion (931L). Genera bytes ESC/POS y gestiona configuracion |
| `server/rawprint.ps1` | Script de PowerShell que envia el buffer binario a la cola RAW de Windows |
| `printers-config.json` | Persistencia en disco de impresoras configuradas (Caja, Cocina, Barra) |
| `public/impresoras.html` | Interfaz visual para configurar y probar impresoras |

---

## 3. Tipos de Impresion y Destinos

El sistema soporta 3 impresoras configurables:
1. **Caja** (ticket de venta, ticket dividido, pre-cuenta, cortes de caja X/Z)
2. **Cocina** (comandas de platos destinados a cocina)
3. **Barra** (comandas de bebidas/items destinados a barra)

---

## 4. Estructura de Comandos ESC/POS (Generados en printers.js)

Los bytes ESC/POS generados manualmente incluyen:
- `ESC @` (0x1b, 0x40): Inicializar impresora
- `ESC 3 n` (0x1b, 0x33, n): Espaciado de lineas
- `ESC a n` (0x1b, 0x61, n): Alineacion (0=izq, 1=centro, 2=der)
- `GS ! n` (0x1d, 0x21, n): Tamano de fuente (1x1, 2x1, 2x2, 3x3)
- `ESC E n` (0x1b, 0x45, n): Negrita
- `ESC d n` (0x1b, 0x64, n): Avance de N lineas
- `GS V 66` (0x1d, 0x56, 0x42): Corte de papel total

---

## 5. Mecanismo de Fallback (Si la impresora falla)

Si `rawprint.ps1` falla o la impresora esta apagada/desconectada:
1. `execSync` lanza una excepcion capturada en `printRawEscPos`.
2. Se intenta eliminar el archivo binario temporal `_print_*.bin`.
3. Se crea el directorio `prints/` si no existe.
4. Se guarda el contenido del buffer en `prints/<printerName>_<timestamp>.txt`.
5. Se retorna `{ ok: false, reason: err.message }` sin interrumpir la transaccion de base de datos.

---

## 6. Configuración de Impresoras (printers-config.json)

Estructura persistida:
```json
{
  "caja": {
    "nombre": "Impresora Caja",
    "nombre_impresora": "CAJA",
    "tipo": "windows",
    "habilitada": true,
    "ancho_papel": 80
  },
  "cocina": {
    "nombre": "Impresora Cocina",
    "nombre_impresora": "COCINA",
    "tipo": "windows",
    "habilitada": true,
    "ancho_papel": 80
  },
  "barra": {
    "nombre": "Impresora Barra",
    "nombre_impresora": "BARRA",
    "tipo": "windows",
    "habilitada": true,
    "ancho_papel": 80
  }
}
```

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
