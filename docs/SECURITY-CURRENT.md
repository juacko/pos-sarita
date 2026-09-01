# SECURITY-CURRENT.md
**POS Sarita — Inventario de Seguridad Actual**
**Fecha de baseline:** 2026-09-01

> Documento de inventario y diagnostico. NO implementar parches todavia.

---

## 1. Estado de Autenticacion

- **Mecanismo:** PIN numerico simple enviado via `POST /api/usuarios/login`
- **Session management:** INEXISTENTE. No hay JWT, ni cookies de sesion, ni tokens Express.
- **Flujo en frontend:** El objeto usuario devuelto `{ id, nombre, rol }` se almacena en `localStorage` o variable global JS.
- **Riesgo:** El servidor confia ciegamente en el `usuario_id` que el cliente adjunta voluntariamente en el body de las peticiones HTTP.

---

## 2. Inventario del Problema: req.body.usuario_id

Se ha verificado que **44+ endpoints o controladores** dependen de `usuario_id` o `mesero_id` enviado en el cuerpo de la peticion sin validacion de token o sesion.

### Endpoints Criticos Afectados:

| Endpoint | Uso de usuario_id / mesero_id | Riesgo |
|---|---|---|
| `POST /api/admin/pedidos/:id/anular` | Verifica rol admin/cajero leyendo `usuario_id` del body | 🔴 ALTO — Impersonacion de Admin |
| `POST /api/admin/caja/abrir` | Asigna creador de sesion y verifica rol leyendo `usuario_id` del body | 🔴 ALTO — Apertura no autorizada |
| `POST /api/admin/caja/cerrar` | Asigna quien cierra y verifica rol leyendo `usuario_id` del body | 🔴 ALTO — Cierre no autorizado |
| `POST /api/admin/pedidos/:id/pagos` | Asigna quien cobra y audita operacion leyendo `usuario_id` del body | 🔴 ALTO — Alteracion de pagos |
| `DELETE /api/admin/pedidos/:id/pagos/:pagoId` | Registra devolucion de dinero con `usuario_id` del body | 🔴 ALTO — Devoluciones falsas |
| `PATCH /api/admin/pedidos/:id/pagos/:pagoId` | Modifica metodo de pago con `usuario_id` del body | 🔴 ALTO — Falsificacion de metodo |
| `POST /api/admin/pedidos/:id/eliminar` | Elimina pedido pagado registrando egreso con `usuario_id` del body | 🔴 ALTO — Fraude financiero |
| `POST /api/pedidos` | Guarda `mesero_id` en pedido | 🟡 MEDIO — Suplantacion de mesero |
| `POST /api/pedidos/:id/pagar` | Guarda `usuario_id` en pago | 🟡 MEDIO — Suplantacion de cajero |
| `POST /api/mesas/:id/tomar` | Guarda `mesero_id` en mesa | 🟡 MEDIO — Toma de mesa falsa |

**Vulnerabilidad clave:** Cualquier usuario o atacante en la red LAN que envie un JSON `{ usuario_id: 1 }` en la peticion HTTP puede ejecutar acciones administrativas.

---

## 3. Almacenamiento de Credenciales (PINs)

- **Tabla:** `usuarios`
- **Columna:** `pin` (TEXT)
- **Estado:** Texto plano.
- **Seeds iniciales:** Admin (`1234`), Mesero (`1111`), Caja (`2222`), Cocina (`3333`).
- **Riesgo:** Si un operador obtiene acceso a la base de datos `pos.db`, conoce instantaneamente los PINs de todos los usuarios del sistema.

---

## 4. Roles y Permisos

Los roles definidos en la base de datos son:
- `admin`
- `mesero`
- `cajero`
- `cocina`

### Middleware de Autorizacion Existente:
- **No existe middleware express global ni especifico.**
- La verificacion se hace inline mediante funciones helper dentro de `admin.js`:
  ```javascript
  function verificarRolAdminCajero(usuario_id) {
    if (!usuario_id) return { error: 'Solo el administrador o el cajero pueden realizar esta accion' };
    const usuario = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(usuario_id);
    if (!usuario || (usuario.rol !== 'admin' && usuario.rol !== 'cajero')) {
      return { error: 'Solo el administrador o el cajero pueden realizar esta accion' };
    }
    return { ok: true, rol: usuario.rol };
  }
  ```

---

## 5. Configuracion de CORS

En `server/index.js`:
```javascript
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] }
});
app.use(cors());
```
- **Estado:** Permite cualquier origen (`*`).
- **Evaluacion:** Aceptable temporalmente solo en entorno LAN aislado de restaurante sin acceso exterior.
- **Riesgo futuro:** Si el servidor se expone a internet, permite Cross-Origin Resource Sharing no restringido.

---

## 6. SQL Injection

- **Evaluacion General:** SEGURO.
- La inmensa mayoria de consultas usan `better-sqlite3` con parametros posicionados (`?`).
- **Excepciones analizadas:**
  1. `db.prepare("SELECT id FROM ${table} WHERE ${nameCol} = ?")` en `db.js`: Parametros de tabla/columna son cadenas fijas del sistema, no entrada de usuario.
  2. `getDesglosePagos(where, params)` y `getMovimientosTotales(where, params)` en `admin.js`: Construyen clausulas `where` concatenadas internamente con cadenas controladas por el backend (rangos de fechas). Sin embargo, es una practica a sanear en el refactoring.

---

## 7. XSS (Cross-Site Scripting)

- **Frontend:** Uso extendido de `innerHTML` concatenando strings en `pos.js`, `mesas.js`, `admin.html`, `mesero.html`.
- Existe la funcion `esc()` en `pos.js:82`, pero no se aplica de manera uniforme a todas las entradas de texto del usuario (nombres de cliente, notas de pedido, nombres de producto personalizables).
- **Riesgo:** Inyeccion de scripts si un cliente/producto se nombra maliciosamente.

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
