# BUSINESS-FLOWS.md
**POS Sarita — Flujos de Negocio Documentados**
**Fecha de baseline:** 2026-09-01

> Flujos documentados del codigo real. NO inventados.

---

## Flujo 1: Venta en Salon (Happy Path)

```
[Mesero] selecciona mesa en grid (mesas.js → loadMesas())
    ↓
Mesa estado=LIBRE → click → abrirPOS(mesaId)
    ↓
POST /api/mesas/:id/tomar { mesero_id }
    DB: UPDATE mesas SET estado='OCUPADO'
    Socket: io.emit('mesa:updated')
    ↓
POS abierto → renderCategorias() + renderProductos()
    GET /api/productos/categorias
    GET /api/productos
    ↓
[Mesero] agrega productos al carrito (agregarItem)
    - Verifica stock local (prod.stock_actual <= 0 → bloquea)
    - Si tiene variantes/modificadores → openCustomizeModal()
    ↓
[Mesero] click "Enviar Pedido" → enviarPedido()
    POST /api/pedidos { mesa_id, mesero_id, items[], nota? }
    Servidor:
      → validarOpcionesRequeridas(items)
      → validarYDescontarStock(items) [UPDATE productos.stock_actual]
      → INSERT pedidos
      → INSERT pedido_items x N
      → UPDATE mesas SET estado='OCUPADO', pedido_activo_id=pedidoId
      → io.emit('pedido:nuevo')
      → io.emit('mesa:updated')
      → io.emit('stock:actualizado')
      → printers.printComanda() [imprime en cocina y/o barra]
    ↓
Vista pedido existente → verPedidoExistente()
    GET /api/mesas/:id
    GET /api/pedidos/:pedidoId
    Renderiza: items, pagos, botones de accion
    ↓
[Cajero/Mesero] click "Cobrar" → abrirModalCobro()
    ↓
Selecciona metodo de pago + ingresa monto
    POST /api/pedidos/:id/pagar { metodo, monto, usuario_id? }
    Servidor:
      → Verifica sesion de caja abierta
      → Calcula total con descuentos
      → INSERT pagos
      → Si pagado >= total → UPDATE pedidos SET estado='CERRADO'
      → io.emit('pedido:actualizado')
      → io.emit('mesa:updated')
      → printers.printTicket() [ticket al cliente]
    ↓
Mesa vuelve a LIBRE (pedido_activo_id=NULL)
Ticket impreso en impresora caja
```

---

## Flujo 2: Venta Para Llevar

```
[Mesero] click canal "Para Llevar" en grid de mesas
    ↓
Mesa virtual (es_virtual=1, area_tipo='PARA_LLEVAR')
    ↓
abrirClienteForm('PARA_LLEVAR', 'nuevo')
    Captura: nombre, telefono, hora_recogida
    ↓
abrirPOS(mesaVirtualId)
    [Mismo flujo de seleccion de productos]
    ↓
enviarPedido()
    POST /api/pedidos { mesa_id, mesero_id, items[], cliente_nombre, cliente_telefono, hora_recogida }
    Impresion: comanda incluye datos del cliente
    ↓
Al pagar:
    POST /api/pedidos/:id/pagar
    Si fullyPaid y mesa es_virtual:
      UPDATE mesas SET estado='LIBRE', pedido_activo_id=NULL
      → Mesa virtual reutilizable inmediatamente
```

---

## Flujo 3: Delivery

```
[Mesero] click canal "Delivery"
    ↓
Mesa virtual (es_virtual=1, area_tipo='DELIVERY')
    ↓
abrirClienteForm('DELIVERY', 'nuevo')
    Captura: nombre, telefono, direccion
    ↓
[Mismo flujo de productos y pedido]
    POST /api/pedidos con cliente_nombre, cliente_telefono, cliente_direccion
    ↓
Comanda de cocina incluye direccion de entrega
    ↓
Al pagar → misma logica
    Mesa virtual liberada al cerrar
```

---

## Flujo 4: Division de Cuenta

```
Vista pedido existente → click "Cobrar" → modal cobro
    ↓
[Cajero] elige "Dividir Cuenta"
    Opciones:
    a) Por personas: monto / N personas
    b) Por items: seleccionar items especificos a pagar
    c) Por monto: monto libre
    ↓
POST /api/pedidos/:id/pagar-dividido {
    metodo, monto, tipo_division,
    items_pagados?: [itemId, ...],
    persona?: string,
    cuota_info?: string,
    imprimir_ticket?: bool
}
    Servidor:
      → Verifica sesion caja
      → Calcula descuentos y total
      → Verifica monto no excede pendiente
      → INSERT pagos (con persona/cuota_info)
      → UPDATE pedido_items.cantidad_pagada (si por items)
      → Si suma pagos >= total → UPDATE pedidos SET estado='CERRADO'
      → Si imprimir_ticket → printers.printTicketDividido()
    ↓
Repetir hasta que pedido quede CERRADO
```

---

## Flujo 5: Cierre de Caja (Corte Z)

```
[Admin/Cajero] Panel Admin → seccion Caja
    ↓
GET /api/admin/caja/sesion-actual
    Muestra: desglose por metodo, movimientos, efectivo esperado
    ↓
GET /api/admin/caja/bloqueantes
    Verifica: mesas OCUPADO con pagos pendientes
    Si hay bloqueantes → no puede cerrar
    ↓
[Cajero] cuenta efectivo fisico → ingresa monto_contado
    ↓
POST /api/admin/caja/cerrar { efectivo_contado, usuario_id, notas? }
    Servidor:
      → verificarRolAdminCajero(usuario_id)  ← usuario_id del body
      → getMesasBloqueantes() → si hay → 409
      → getDesglosePagos() [query dinamica de pagos]
      → getMovimientosTotales() [query dinamica de movimientos]
      → UPDATE caja_sesiones SET estado='CERRADA', desglose_json, sobrante_faltante
      → io.emit('caja:updated')
    ↓
POST /api/admin/caja/corte-z/imprimir
    printers.printCorteCaja() → ticket de corte en impresora caja
    ↓
Nueva sesion se abre con POST /api/admin/caja/abrir
```

---

## Flujo 6: Mover Items entre Mesas

```
Vista pedido existente → click "Mover Mesa"
    ↓
Modal seleccion mesa destino
Seleccion de items a mover
    ↓
POST /api/pedidos/:id/mover { item_ids[], mesa_destino_id, mesero_id? }
    Servidor:
      → validarOrigenParaMovimiento: verifica sin pagos previos
      → Verifica mesa destino existe y no es virtual
      → obtenerDestinoYCrearOrdenSiFalta:
          Si destino tiene pedido activo → usar ese
          Si no → INSERT pedidos en destino
      → UPDATE pedido_items SET pedido_id = destinoId
      → recalcularTotalPedido(origen), recalcularTotalPedido(destino)
      → Si origen queda sin items → UPDATE pedidos SET estado='CANCELADO'
      → INSERT logs_mesas (ITEMS_MOVIDOS en origen, ITEMS_RECIBIDOS en destino)
      → io.emit x4 (pedidos y mesas de origen y destino)
      → printers.printComanda() para destino
```

---

## Flujo 7: Anulacion de Pedido

```
Vista pedido existente → boton "Anular" (solo admin/cajero)
    ↓
Modal: ingreso de motivo
    ↓
POST /api/admin/pedidos/:id/anular { motivo, usuario_id }
    Servidor:
      → Verifica usuario_id tiene rol admin/cajero
      → Reponer stock de items activos
        UPDATE productos SET stock_actual = stock_actual + cantidad
      → UPDATE pedidos SET estado='CANCELADO', motivo_cancelacion
      → UPDATE pedido_items SET estado='CANCELADO'
      → Si mesa tiene este pedido activo:
          UPDATE mesas SET estado='LIBRE', pedido_activo_id=NULL
          INSERT logs_mesas
      → io.emit('pedido:actualizado')
      → io.emit('mesa:updated')
      → io.emit('stock:actualizado')
```

---

## Flujo 8: Control de Stock Diario

```
[Cocina/Admin] avisa stock restante de un producto
    ↓
[Admin] Panel Admin → Stock → actualizar producto
    PATCH /api/productos/:id/stock { stock_actual, controlar_stock, stock_minimo }
    o
    POST /api/productos/stock-batch { updates: [...] }
    ↓
    UPDATE productos SET stock_actual, controlar_stock, stock_minimo
    io.emit('stock:actualizado')
    ↓
[Mesero] en socket-client.js recibe 'stock:actualizado'
    Actualiza array productos[]
    Llama renderProductos()
    ↓
Producto con stock=0 → boton AGOTADO (no clickeable)
Producto con stock <= stock_minimo → badge ALERTA
    ↓
Al agregar item al pedido:
    agregarItem() verifica stock local
    Si agotado → showToast de error
    Si stock en carrito >= stock_actual → showToast warning
```

---

*Fase 0 — PRE-REFACTOR BASELINE — 2026-09-01*
