# FUNCTIONAL-BASELINE.md
**POS Sarita — Checklist de Caracterizacion Funcional**
**Fecha de baseline:** 2026-09-01

> Documento de verificacion funcional. Toda refactorizacion debe mantener el 100% de los items marcados como [x].

---

## 1. AUTENTICACION Y ROLES
- [x] Login con PIN numerico (`POST /api/usuarios/login`)
- [x] Soporte de 4 roles: Admin, Mesero, Cajero, Cocina
- [x] Cierre de sesion en cliente

## 2. MESAS Y SALONES
- [x] Visualizacion de mapa/grid de mesas en tiempo real (`GET /api/mesas`)
- [x] Filtro de mesas por Area (Salon Principal, Terraza, etc.)
- [x] Estados visuales de mesa: LIBRE, OCUPADO, RESERVADO, INACTIVO
- [x] Tomar mesa (asignar mesero y cambiar estado a OCUPADO)
- [x] Liberar mesa manualmente
- [x] Reservar mesa y cancelar reserva
- [x] Mover productos de una mesa a otra (`POST /api/pedidos/:id/mover`)
- [x] Unir dos mesas en una sola cuenta (`POST /api/pedidos/:id/unir`)
- [x] Mesas virtuales automaticas para canales Delivery y Para Llevar
- [x] Liberacion automatica de mesa virtual tras cobro completo

## 3. PEDIDOS Y POS
- [x] Creacion de pedido nuevo con items
- [x] Busqueda de productos por texto
- [x] Filtro de productos por categoria
- [x] Agregar items con Variantes (tallas/presentaciones con precio adicional)
- [x] Agregar items con Modificadores (seleccion unica, multiple o texto)
- [x] Modificadores condicionales dependientes de variante (ej. Tipo de pasta)
- [x] Agregar items con Agregados/Extras (cantidad configurable)
- [x] Agregar notas/instrucciones especiales por item o por pedido general
- [x] Agregar items a un pedido ya existente en mesa
- [x] Dividir un item en dos filas (`/split`)
- [x] Modificar precio adicional o cantidad de un item en pedido abierto
- [x] Eliminar item de un pedido abierto (con reposicion automatica de stock)

## 4. CANALES DE VENTA (DELIVERY / PARA LLEVAR)
- [x] Formulario modal de datos de cliente (Nombre, Telefono)
- [x] Captura de Direccion para Delivery
- [x] Captura de Hora de Recogida para Para Llevar
- [x] Edicion de datos de cliente en pedido existente

## 5. CONTROL DE STOCK DIARIO
- [x] Control de stock por producto (`controlar_stock = 1`)
- [x] Descuento automatico de stock al enviar pedido a cocina
- [x] Reposicion automatica de stock al eliminar item o anular pedido
- [x] Badge visual "🚫 AGOTADO" y bloqueo de seleccion si `stock_actual <= 0`
- [x] Badge visual "⚠️ Quedan X" si `stock_actual <= stock_minimo`
- [x] Actualizacion masiva/batch de stock en Panel Admin
- [x] Actualizacion en tiempo real en vista mesero via WebSocket (`stock:actualizado`)

## 6. PAGOS Y COBRO
- [x] Modal de cobro con calculo automatico de total y pendiente
- [x] Cobro en Efectivo con calculo de cambio/vuelto
- [x] Cobro con Tarjeta, Transferencia, Yape, Plin, Regalo
- [x] Cobro con Vales prepagados (descuento de saldo del vale)
- [x] Aplicacion de Descuentos (Porcentaje % o Monto Fijo S/) con motivo obligatorio
- [x] Cobro Dividido por Personas (monto igual por cuota)
- [x] Cobro Dividido por Items (seleccion de items especificos a pagar)
- [x] Cobro Dividido por Monto libre
- [x] Registro de Propinas por metodo de pago
- [x] Cierre automatico de pedido (`estado = 'CERRADO'`) cuando pagado >= total

## 7. CAJA CHICA Y SESIONES
- [x] Verificar si hay caja abierta antes de permitir cobros
- [x] Apertura de caja con fondo inicial y notas
- [x] Registro de Ingresos y Egresos manuales de caja
- [x] Verificacion de mesas bloqueantes (impedir cierre si hay cuentas abiertas)
- [x] Cierre de caja (Corte Z) con conteo de efectivo y calculo de sobrante/faltante
- [x] Impresion de Reporte Corte X / Z
- [x] Absorcion automatica de pagos no liquidados desde el ultimo cierre

## 8. ADMINISTRACION Y ANULACIONES
- [x] Anulacion de pedidos abiertos con motivo obligatorio y rol admin/cajero
- [x] Anulacion/Devolucion de pagos en pedidos cerrados (con registro de EGRESO en caja)
- [x] Historial de pedidos pagados y anulados
- [x] CRUD de Productos, Categorias, Variantes, Modificadores y Agregados
- [x] CRUD de Areas y Mesas
- [x] Reportes de ventas por rango de fecha

## 9. KDS Y TIEMPO REAL
- [x] KDS Cocina (`public/cocina.html`) actualizable via Socket.IO
- [x] KDS Barra (`public/barra.html`) actualizable via Socket.IO
- [x] Cambio de estado de items (PENDIENTE → COCINANDO → LISTO → ENTREGADO)

## 10. IMPRESION ESC/POS
- [x] Impresion de Comanda de Cocina / Barra al enviar pedido
- [x] Impresion de Pre-cuenta (no valida como comprobante)
- [x] Impresion de Ticket de Venta al cobrar
- [x] Impresion de Ticket Dividido por persona
- [x] Reimpresion de Ticket de pedidos cerrados
- [x] Impresion de Corte de Caja X y Z
- [x] Deteccion automatica de impresoras Windows via PowerShell
- [x] Fallback automatico a archivo `.txt` en `prints/` si falla la impresora

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
