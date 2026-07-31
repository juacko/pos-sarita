let posMesaId = null;
let posMesaData = null;
let pedidoCliente = null;
let categorias = [];
let productos = [];
let pedidoItems = [];
let categoriaActiva = null;

async function abrirPOS(mesaId) {
  posMesaId = mesaId;
  pedidoItems = [];

  try {
    const res = await fetch(`/api/mesas/${mesaId}`);
    posMesaData = await res.json();

    document.getElementById('mesasView').style.display = 'none';
    document.getElementById('posView').style.display = 'block';
    document.getElementById('posMesaNumero').textContent = posMesaData.nombre || `Mesa ${posMesaData.numero}`;
    document.getElementById('posMesaInfo').textContent = `${posMesaData.estado} | ${posMesaData.mesero_nombre || 'Sin mesero'}`;
    renderPosClienteBar();

    await loadCategorias();
    await loadProductos();
    renderCategoriaTabs();
    renderProductos();
    renderPedidoItems();
  } catch (err) {
    showToast('Error al abrir POS', 'error');
  }
}

function renderPosClienteBar() {
  const bar = document.getElementById('posClienteBar');
  if (!bar) return;

  const isVirtual = posMesaData && posMesaData.es_virtual;
  if (!isVirtual) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'block';
  if (pedidoCliente && pedidoCliente.nombre) {
    const tipo = pedidoCliente.tipo === 'DELIVERY' ? '🛵 Delivery' : '🥡 Para Llevar';
    let txt = `${tipo} · Cliente: <strong>${esc(pedidoCliente.nombre)}</strong>`;
    if (pedidoCliente.telefono) txt += ` · 📞 ${esc(pedidoCliente.telefono)}`;
    if (pedidoCliente.direccion) txt += ` · 📍 ${esc(pedidoCliente.direccion)}`;
    if (pedidoCliente.hora) txt += ` · 🕐 ${pedidoCliente.hora}`;
    bar.innerHTML = `${txt} <button class="btn btn-outline btn-sm" style="margin-left:8px;" onclick="editarCliente()">✏️ Editar</button>`;
  } else {
    bar.innerHTML = `🧑‍🤝‍🧑 Sin datos de cliente <button class="btn btn-outline btn-sm" style="margin-left:8px;" onclick="editarCliente()">✏️ Ingresar</button>`;
  }
}

function editarCliente() {
  const tipo = posMesaData?.area_tipo === 'DELIVERY' ? 'DELIVERY' : 'PARA_LLEVAR';
  abrirClienteForm(tipo, 'editar', pedidoCliente);
}

function renderPedidoViewCliente() {
  const el = document.getElementById('pedidoViewCliente');
  if (!el || !pedidoExistente) return;
  const tipo = posMesaData?.area_tipo === 'DELIVERY' ? '🛵 Delivery' : '🥡 Para Llevar';
  let txt = `<strong>${tipo}</strong>`;
  if (pedidoExistente.cliente_nombre) txt += ` · ${esc(pedidoExistente.cliente_nombre)}`;
  if (pedidoExistente.cliente_telefono) txt += ` · 📞 ${esc(pedidoExistente.cliente_telefono)}`;
  if (pedidoExistente.cliente_direccion) txt += ` · 📍 ${esc(pedidoExistente.cliente_direccion)}`;
  if (pedidoExistente.hora_recogida) txt += ` · 🕐 ${esc(pedidoExistente.hora_recogida)}`;
  el.innerHTML = txt + ` <button class="btn btn-outline btn-sm" onclick="editarCliente()">✏️</button>`;
  el.style.display = 'block';
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showMesasView() {
  document.getElementById('posView').style.display = 'none';
  document.getElementById('mesasView').style.display = 'block';
  posMesaId = null;
  posMesaData = null;
  pedidoCliente = null;
  pedidoItems = [];
  loadMesas();
}

async function loadCategorias() {
  try {
    const res = await fetch('/api/productos/categorias');
    categorias = await res.json();
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

async function loadProductos() {
  try {
    const res = await fetch('/api/productos');
    productos = await res.json();
  } catch (err) {
    console.error('Error loading products:', err);
  }
}

function renderCategoriaTabs() {
  const container = document.getElementById('categoriaTabs');
  container.innerHTML = '';

  const allTab = document.createElement('button');
  allTab.className = `categoria-tab${!categoriaActiva ? ' active' : ''}`;
  allTab.textContent = 'Todos';
  allTab.onclick = () => { categoriaActiva = null; renderCategoriaTabs(); renderProductos(); };
  container.appendChild(allTab);

  for (const cat of categorias) {
    const tab = document.createElement('button');
    tab.className = `categoria-tab${categoriaActiva === cat.id ? ' active' : ''}`;
    tab.textContent = cat.nombre;
    tab.style.borderColor = cat.color || undefined;
    tab.onclick = () => { categoriaActiva = cat.id; renderCategoriaTabs(); renderProductos(); };
    container.appendChild(tab);
  }
}

function renderProductos() {
  const container = document.getElementById('productosGrid');
  container.innerHTML = '';

  let filtered = productos;
  if (categoriaActiva) {
    filtered = productos.filter(p => p.categoria_id === categoriaActiva);
  }

  if (filtered.length === 0) {
    container.innerHTML = '<p style="color:var(--gray);grid-column:1/-1;text-align:center;padding:40px;">Sin productos en esta categoría</p>';
    return;
  }

  for (const prod of filtered) {
    const btn = document.createElement('button');
    btn.className = 'producto-btn';
    btn.innerHTML = `${prod.nombre} <span class="precio">$${prod.precio.toFixed(2)}</span>`;
    btn.onclick = () => agregarItem(prod);
    container.appendChild(btn);
  }
}

function agregarItem(producto) {
  const hasExtras = (producto.variantes && producto.variantes.length) ||
                    (producto.modificadores && producto.modificadores.length) ||
                    (producto.agregados && producto.agregados.length);
  if (hasExtras) {
    openCustomizeModal(producto, (customized) => {
      const exist = pedidoItems.find(i =>
        i.producto_id === customized.producto_id &&
        i.variante_id === customized.variante_id &&
        JSON.stringify(i.modificadores) === JSON.stringify(customized.modificadores) &&
        JSON.stringify(i.agregados) === JSON.stringify(customized.agregados)
      );
      if (exist) { exist.cantidad++; }
      else { pedidoItems.push({ ...customized, cantidad: 1 }); }
      renderPedidoItems();
    });
  } else {
    const existing = pedidoItems.find(i => i.producto_id === producto.id && !i.notas && !i.precio_adicional);
    if (existing) {
      existing.cantidad++;
    } else {
      pedidoItems.push({
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad: 1,
        precio: producto.precio,
        precio_adicional: 0,
        variante_id: null,
        variante_nombre: null,
        modificadores: [],
        agregados: [],
        detalle: '',
        notas: ''
      });
    }
    renderPedidoItems();
  }
}

// ─── CUSTOMIZER ───
let customizeProduct = null;
let customizeCallback = null;
let selectedVariante = null;
let selectedMods = {};
let agregadoQtys = {};

function openCustomizeModal(prod, callback) {
  customizeProduct = prod;
  customizeCallback = callback;
  selectedVariante = null;
  selectedMods = {};
  agregadoQtys = {};

  document.getElementById('customizeTitle').textContent = prod.nombre;
  let html = `<p style="color:var(--gray);font-size:0.85rem;margin-bottom:12px;">Precio base: <strong>$${prod.precio.toFixed(2)}</strong></p>`;

  if (prod.variantes?.length) {
    html += '<div style="margin-bottom:12px;"><strong style="font-size:0.85rem;">Presentación:</strong>';
    prod.variantes.forEach(v => {
      html += `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.85rem;">
        <input type="radio" name="pos_variante" value='${JSON.stringify(v).replace(/'/g, "&#39;")}' onchange="selectVariante(this.value)">
        ${v.nombre} ${v.precio_adicional > 0 ? '<span style="color:var(--green);">+$' + v.precio_adicional.toFixed(2) + '</span>' : ''}
      </label>`;
    });
    html += '</div>';
  }

  if (prod.modificadores?.length) {
    prod.modificadores.forEach(m => {
      html += `<div style="margin-bottom:12px;"><strong style="font-size:0.85rem;">${m.nombre}${m.requerido ? ' <span style="color:#ef4444;">*</span>' : ''}</strong>`;
      if (m.tipo === 'text') {
        html += `<input class="form-control" style="margin-top:4px;" id="pos_mod_text_${m.id}" placeholder="Escribe...">`;
      } else {
        m.opciones.forEach(o => {
          const inputType = m.tipo === 'multi' ? 'checkbox' : 'radio';
          html += `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;">
            <input type="${inputType}" name="pos_mod_${m.id}" value="${o.id}" onchange="selectOpcion(${m.id}, this)">
            ${o.nombre} ${o.precio_adicional > 0 ? '<span style="color:var(--green);">+$' + o.precio_adicional.toFixed(2) + '</span>' : ''}
          </label>`;
        });
      }
      html += '</div>';
    });
  }

  if (prod.agregados?.length) {
    html += '<div style="margin-bottom:12px;"><strong style="font-size:0.85rem;">Agregados:</strong>';
    prod.agregados.forEach(a => {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;">
        <span style="flex:1;">${a.nombre} <span style="color:var(--green);">+$${a.precio.toFixed(2)}</span></span>
        <button class="btn btn-outline btn-sm" onclick="changeAgregado(${a.id}, -1)">−</button>
        <span id="pos_agr_qty_${a.id}">0</span>
        <button class="btn btn-outline btn-sm" onclick="changeAgregado(${a.id}, 1)">+</button>
      </div>`;
    });
    html += '</div>';
  }

  html += '<div id="customizeTotal" style="text-align:right;font-size:1.2rem;font-weight:800;color:var(--green);border-top:1px solid #e2e8f0;padding-top:8px;">Total: $' + prod.precio.toFixed(2) + '</div>';

  document.getElementById('customizeBody').innerHTML = html;
  document.getElementById('customizeModal').classList.add('active');
}

function selectVariante(jsonStr) {
  try { selectedVariante = JSON.parse(jsonStr.replace(/&#39;/g, "'")); } catch(e) { selectedVariante = JSON.parse(jsonStr); }
  updateCustomizeTotal();
}

function selectOpcion(modId, el) {
  if (el.type === 'radio') {
    const checked = document.querySelector(`input[name="pos_mod_${modId}"]:checked`);
    if (checked) {
      selectedMods[modId] = parseInt(checked.value);
    }
  } else {
    if (!selectedMods[modId]) selectedMods[modId] = [];
    const val = parseInt(el.value);
    if (el.checked) {
      if (!selectedMods[modId].includes(val)) selectedMods[modId].push(val);
    } else {
      selectedMods[modId] = selectedMods[modId].filter(v => v !== val);
    }
  }
  updateCustomizeTotal();
}

function changeAgregado(agrId, delta) {
  if (!agregadoQtys[agrId]) agregadoQtys[agrId] = 0;
  agregadoQtys[agrId] = Math.max(0, agregadoQtys[agrId] + delta);
  document.getElementById('pos_agr_qty_' + agrId).textContent = agregadoQtys[agrId];
  updateCustomizeTotal();
}

function updateCustomizeTotal() {
  const prod = customizeProduct;
  if (!prod) return;
  let adicional = 0;
  if (selectedVariante) adicional += selectedVariante.precio_adicional || 0;
  for (const modId of Object.keys(selectedMods)) {
    const mod = prod.modificadores?.find(m => m.id == modId);
    if (!mod) continue;
    const vals = Array.isArray(selectedMods[modId]) ? selectedMods[modId] : [selectedMods[modId]];
    for (const v of vals) {
      const opc = mod.opciones?.find(o => o.id == v);
      if (opc) adicional += opc.precio_adicional || 0;
    }
  }
  for (const agrId of Object.keys(agregadoQtys)) {
    const qty = agregadoQtys[agrId] || 0;
    const agr = prod.agregados?.find(a => a.id == agrId);
    if (agr && qty > 0) adicional += agr.precio * qty;
  }
  const total = prod.precio + adicional;
  document.getElementById('customizeTotal').textContent = 'Total: $' + total.toFixed(2);
}

function closeCustomizeModal() {
  document.getElementById('customizeModal').classList.remove('active');
  customizeProduct = null;
}

function confirmCustomize() {
  const prod = customizeProduct;
  if (!prod) return;

  const modificadores = prod.modificadores?.map(m => {
    const vals = selectedMods[m.id];
    let selected = [];
    if (m.tipo === 'text') {
      const txt = document.getElementById('pos_mod_text_' + m.id)?.value || '';
      if (txt) selected = [{ nombre: txt }];
    } else if (vals !== undefined) {
      const arr = Array.isArray(vals) ? vals : [vals];
      selected = arr.map(v => {
        const opc = m.opciones?.find(o => o.id == v);
        return opc ? { id: opc.id, nombre: opc.nombre, precio_adicional: opc.precio_adicional } : null;
      }).filter(Boolean);
    }
    return { id: m.id, nombre: m.nombre, seleccion: selected };
  }).filter(m => m.seleccion.length) || [];

  const agregados = Object.entries(agregadoQtys)
    .filter(([k, v]) => v > 0)
    .map(([k, v]) => {
      const a = prod.agregados?.find(x => x.id == parseInt(k));
      return a ? { id: a.id, nombre: a.nombre, precio: a.precio, cantidad: v } : null;
    }).filter(Boolean);

  let precioAdic = 0;
  if (selectedVariante) precioAdic += selectedVariante.precio_adicional || 0;
  modificadores.forEach(m => m.seleccion.forEach(s => precioAdic += s.precio_adicional || 0));
  agregados.forEach(a => precioAdic += a.precio * a.cantidad);

  const detalle = [];
  if (selectedVariante) detalle.push(selectedVariante.nombre);
  modificadores.forEach(m => {
    if (m.seleccion.length) detalle.push(m.seleccion.map(s => s.nombre).join(', '));
  });
  agregados.forEach(a => detalle.push(`${a.nombre} x${a.cantidad}`));

  const item = {
    producto_id: prod.id,
    nombre: prod.nombre,
    precio: prod.precio,
    precio_adicional: precioAdic,
    variante_id: selectedVariante?.id || null,
    variante_nombre: selectedVariante?.nombre || null,
    modificadores: modificadores,
    agregados: agregados,
    detalle: detalle.join(' · '),
    notas: ''
  };

  closeCustomizeModal();
  if (customizeCallback) customizeCallback(item);
}

function cambiarCantidad(index, delta) {
  const item = pedidoItems[index];
  if (!item) return;
  item.cantidad = Math.max(1, item.cantidad + delta);
  if (item.cantidad === 0) {
    pedidoItems.splice(index, 1);
  }
  renderPedidoItems();
}

function eliminarItem(index) {
  pedidoItems.splice(index, 1);
  renderPedidoItems();
}

function renderPedidoItems() {
  const container = document.getElementById('pedidoItems');
  const total = pedidoItems.reduce((sum, i) => sum + i.cantidad * (i.precio + (i.precio_adicional || 0)), 0);

  if (pedidoItems.length === 0) {
    container.innerHTML = '<p style="color:var(--gray);font-size:0.875rem;text-align:center;padding:40px 0;">Agrega productos al pedido</p>';
  } else {
    container.innerHTML = pedidoItems.map((item, idx) => {
      const precioUnitario = item.precio + (item.precio_adicional || 0);
      let extras = '';
      if (item.variante_nombre) extras += `<div style="font-size:0.75rem;color:var(--gray);">${item.variante_nombre}</div>`;
      if (item.modificadores?.length) {
        const mods = item.modificadores.map(m => m.seleccion.map(s => s.nombre).join(', ')).filter(Boolean).join(' · ');
        if (mods) extras += `<div style="font-size:0.75rem;color:var(--gray);">${mods}</div>`;
      }
      if (item.agregados?.length) {
        extras += `<div style="font-size:0.75rem;color:var(--gray);">${item.agregados.map(a => `${a.nombre} x${a.cantidad}`).join(' · ')}</div>`;
      }
      return `
      <div class="pedido-item">
        <div class="pedido-item-info">
          <div>
            <span class="pedido-item-qty">${item.cantidad}x</span>
            <span class="pedido-item-name">${item.nombre}</span>
          </div>
          ${extras}
          ${item.notas ? `<div class="pedido-item-notas">📝 ${item.notas}</div>` : ''}
          <div style="margin-top:4px;display:flex;gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="cambiarCantidad(${idx}, -1)">-</button>
            <button class="btn btn-outline btn-sm" onclick="cambiarCantidad(${idx}, 1)">+</button>
            <button class="btn btn-outline btn-sm" onclick="agregarNota(${idx})">📝</button>
          </div>
        </div>
        <div style="text-align:right;">
          ${item.precio_adicional > 0 ? `<div style="font-size:0.7rem;color:var(--gray);">$${item.precio.toFixed(2)} + $${item.precio_adicional.toFixed(2)}</div>` : ''}
          <div class="pedido-item-price">$${(item.cantidad * precioUnitario).toFixed(2)}</div>
          <button class="pedido-item-remove" onclick="eliminarItem(${idx})">&times;</button>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('totalPedido').textContent = `$${total.toFixed(2)}`;
}

function agregarNota(index) {
  const item = pedidoItems[index];
  if (!item) return;
  const nota = prompt('Nota para este item:', item.notas || '');
  if (nota !== null) {
    item.notas = nota;
    renderPedidoItems();
  }
}

async function enviarPedido() {
  if (!posMesaId) {
    showToast('No hay mesa seleccionada', 'warning');
    return;
  }

  const nota = document.getElementById('notaPedido').value;

  try {
    if (!posMesaData) {
      const mesaRes = await fetch(`/api/mesas/${posMesaId}`);
      posMesaData = await mesaRes.json();
    }

    let response;
    
    if (posMesaData.pedido_activo_id) {
      response = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: pedidoItems, nota: nota || null })
      });
      showToast('Items agregados al pedido', 'success');
    } else {
      response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesa_id: posMesaId,
          mesero_id: currentUser?.id || null,
          items: pedidoItems,
          nota: nota || null,
          cliente_nombre: pedidoCliente?.nombre || null,
          cliente_telefono: pedidoCliente?.telefono || null,
          cliente_direccion: (pedidoCliente?.tipo === 'DELIVERY' ? pedidoCliente?.direccion : null) || null,
          hora_recogida: (pedidoCliente?.tipo === 'PARA_LLEVAR' ? pedidoCliente?.hora : null) || null
        })
      });
      showToast('Pedido enviado a cocina', 'success');
    }

    if (response.ok) {
      pedidoItems = [];
      document.getElementById('notaPedido').value = '';
      renderPedidoItems();

      const mesaRes = await fetch(`/api/mesas/${posMesaId}`);
      posMesaData = await mesaRes.json();
    } else {
      const err = await response.json();
      showToast(err.error || 'Error al procesar pedido', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

function cancelarPedido() {
  if (pedidoItems.length === 0) {
    showMesasView();
    return;
  }
  if (confirm('¿Cancelar el pedido actual?')) {
    pedidoItems = [];
    renderPedidoItems();
    showToast('Pedido cancelado', 'warning');
  }
}

// ─── VISTA DE PEDIDO EXISTENTE ───

let pedidoExistente = null;

async function verPedidoExistente(mesaId) {
  try {
    const mesaRes = await fetch(`/api/mesas/${mesaId}`);
    posMesaData = await mesaRes.json();

    if (!posMesaData.pedido_activo_id) {
      abrirPOS(mesaId);
      return;
    }

    const res = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}`);
    if (!res.ok) throw new Error('Pedido no encontrado');
    pedidoExistente = await res.json();

    if (posMesaData.es_virtual) {
      pedidoCliente = {
        nombre: pedidoExistente.cliente_nombre || '',
        telefono: pedidoExistente.cliente_telefono || '',
        direccion: pedidoExistente.cliente_direccion || '',
        hora: pedidoExistente.hora_recogida || '',
        tipo: posMesaData.area_tipo
      };
      renderPedidoViewCliente();
    }

    document.getElementById('mesasView').style.display = 'none';
    document.getElementById('posView').style.display = 'none';
    document.getElementById('pedidoView').style.display = 'block';
    document.getElementById('pedidoViewMesaNumero').textContent = posMesaData.nombre || `Mesa ${posMesaData.numero}`;
    document.getElementById('pedidoViewInfo').textContent = `${posMesaData.estado} | ${posMesaData.mesero_nombre || 'Sin mesero'}`;
    document.getElementById('pedidoViewId').textContent = pedidoExistente.id;

    const estadoBadge = document.getElementById('pedidoViewEstado');
    estadoBadge.textContent = pedidoExistente.estado;
    estadoBadge.className = `badge badge-${pedidoExistente.estado === 'CERRADO' ? 'green' : pedidoExistente.estado === 'CANCELADO' ? 'red' : 'blue'}`;

    renderPedidoExistenteItems();
    renderPedidoExistenteResumen();
    renderPedidoExistentePagos();

    const total = pedidoExistente.items.reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
    const pagado = (pedidoExistente.pagos || []).reduce((s, p) => s + p.monto, 0);
    const isFullyPaid = pagado >= total - 0.01;
    const isCerrado = pedidoExistente.estado === 'CERRADO' || pedidoExistente.estado === 'CANCELADO';

    document.getElementById('btnCobrarPedido').style.display = (!isCerrado && !isFullyPaid) ? 'flex' : 'none';
    document.getElementById('btnReimprimirPedido').style.display = isCerrado ? 'flex' : 'none';
    document.getElementById('btnLiberarMesa').style.display = (isCerrado || isFullyPaid) ? 'flex' : 'none';
    document.getElementById('btnAgregarMas').style.display = (!isCerrado && !isFullyPaid) ? 'flex' : 'none';
  } catch (err) {
    showToast('Error al cargar pedido', 'error');
    console.error(err);
  }
}

function renderPedidoExistenteItems() {
  const container = document.getElementById('pedidoViewItems');
  if (!pedidoExistente?.items?.length) {
    container.innerHTML = '<p style="color:var(--gray);text-align:center;padding:20px;">Sin items</p>';
    return;
  }

  container.innerHTML = pedidoExistente.items.map(item => {
    const precioAdic = item.precio_adicional || 0;
    const subtotal = item.cantidad * (item.precio_unitario + precioAdic);
    let details = '';
    if (item.variante_nombre) details += `<div style="font-size:0.75rem;color:var(--gray);">Var: ${item.variante_nombre}</div>`;
    try {
      const mods = JSON.parse(item.modificadores_json || '[]');
      if (mods.length) details += `<div style="font-size:0.75rem;color:var(--gray);">Mod: ${mods.map(m => m.nombre || m).join(', ')}</div>`;
    } catch (e) {}
    try {
      const agrs = JSON.parse(item.agregados_json || '[]');
      if (agrs.length) details += `<div style="font-size:0.75rem;color:var(--gray);">Agr: ${agrs.map(a => a.nombre || a).join(', ')}</div>`;
    } catch (e) {}
    if (item.notas) details += `<div style="font-size:0.75rem;color:var(--yellow);">📝 ${item.notas}</div>`;

    return `
      <div class="pedido-item">
        <div class="pedido-item-info">
          <div>
            <span class="pedido-item-qty">${item.cantidad}x</span>
            <span class="pedido-item-name">${item.producto_nombre}</span>
          </div>
          ${details}
        </div>
        <div style="text-align:right;">
          ${precioAdic > 0 ? `<div style="font-size:0.7rem;color:var(--gray);">$${item.precio_unitario.toFixed(2)} + $${precioAdic.toFixed(2)}</div>` : ''}
          <div class="pedido-item-price">$${subtotal.toFixed(2)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPedidoExistenteResumen() {
  const container = document.getElementById('pedidoViewResumen');
  if (!pedidoExistente) return;

  const totalBruto = pedidoExistente.items.reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
  const descuentos = pedidoExistente.descuentos || [];
  let totalDescuento = 0;
  for (const d of descuentos) {
    if (d.tipo === 'porcentaje') totalDescuento += totalBruto * d.valor / 100;
    else totalDescuento += d.valor;
  }
  const total = Math.max(0, totalBruto - totalDescuento);
  const pagado = (pedidoExistente.pagos || []).reduce((s, p) => s + p.monto, 0);
  const pendiente = Math.max(0, total - pagado);

  document.getElementById('pedidoViewTotal').textContent = `$${total.toFixed(2)}`;

  const pendienteEl = document.getElementById('pedidoViewPendiente');
  if (pagado > 0 && pendiente > 0) {
    pendienteEl.style.display = 'flex';
    document.getElementById('pedidoViewPendienteMonto').textContent = `$${pendiente.toFixed(2)}`;
  } else {
    pendienteEl.style.display = 'none';
  }

  let html = `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:var(--gray);">Items:</span><span>${pedidoExistente.items.length}</span></div>`;
  html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:var(--gray);">Subtotal:</span><span>$${totalBruto.toFixed(2)}</span></div>`;
  if (totalDescuento > 0) {
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#DC2626;">Descuento:</span><span style="color:#DC2626;">-$${totalDescuento.toFixed(2)}</span></div>`;
    for (const d of descuentos) {
      const motLabel = d.tipo === 'porcentaje' ? `${d.valor}%` : `$${d.valor.toFixed(2)}`;
      html += `<div style="font-size:0.75rem;color:var(--gray);margin-bottom:4px;margin-left:12px;">${motLabel} — ${d.motivo}</div>`;
    }
  }
  if (pagado > 0) {
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:var(--gray);">Pagado:</span><span style="color:var(--green);">$${pagado.toFixed(2)}</span></div>`;
  }
  container.innerHTML = html;
}

function renderPedidoExistentePagos() {
  const container = document.getElementById('pedidoViewPagos');
  const pagos = pedidoExistente?.pagos || [];
  if (!pagos.length) {
    container.innerHTML = '';
    return;
  }

  const metodos = { efectivo: '💵', tarjeta: '💳', transferencia: '📱', otros: '📋', regalo: '🎁', vale: '🎫' };
  container.innerHTML = '<div style="font-size:0.8rem;font-weight:600;margin-bottom:4px;">Pagos realizados:</div>' +
    pagos.map(p => {
      let info = `${metodos[p.metodo] || ''} ${p.metodo}: $${p.monto.toFixed(2)}`;
      if (p.propina > 0) info += ` (+$${p.propina.toFixed(2)} propina)`;
      if (p.referencia) info += ` [${p.referencia}]`;
      if (p.usuario_nombre) info += ` — ${p.usuario_nombre}`;
      return `<div style="font-size:0.8rem;color:var(--gray);padding:4px 0;">${info}</div>`;
    }).join('');
}

function abrirPOSFromPedido() {
  if (!posMesaData) return;
  document.getElementById('pedidoView').style.display = 'none';
  pedidoItems = [];
  abrirPOS(posMesaData.id);
}

async function reimprimirPedido() {
  if (!pedidoExistente) return;
  try {
    const res = await fetch(`/api/pedidos/${pedidoExistente.id}/reimprimir`, { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Ticket reimpreso' : 'Error al reimprimir', data.ok ? 'success' : 'warning');
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

async function liberarMesaDesdePedido() {
  if (!posMesaData || !currentUser) return;
  if (!confirm('¿Liberar esta mesa? Los clientes se van.')) return;

  try {
    const res = await fetch(`/api/mesas/${posMesaData.id}/liberar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesero_id: currentUser.id })
    });

    if (res.ok) {
      showToast('Mesa liberada', 'success');
      showMesasView();
    } else {
      const err = await res.json();
      showToast(err.error || 'Error al liberar', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// ─── MODAL DE COBRO ───

let cobroMetodo = 'efectivo';
let cobroPedidoRef = null;
let cobroValeData = null;
let cobroDividirPersonas = [];

function calcularTotalCobro() {
  if (!cobroPedidoRef) return 0;
  const totalBruto = cobroPedidoRef.items.reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
  const descuentos = cobroPedidoRef.descuentos || [];
  let totalDescuento = 0;
  for (const d of descuentos) {
    if (d.tipo === 'porcentaje') totalDescuento += totalBruto * d.valor / 100;
    else totalDescuento += d.valor;
  }
  return Math.max(0, totalBruto - totalDescuento);
}

function calcularPendienteCobro() {
  const total = calcularTotalCobro();
  const pagado = (cobroPedidoRef?.pagos || []).reduce((s, p) => s + p.monto, 0);
  return Math.max(0, total - pagado);
}

function abrirModalCobro() {
  if (!pedidoExistente) return;
  cobroPedidoRef = pedidoExistente;
  cobroValeData = null;

  const totalBruto = cobroPedidoRef.items.reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
  const total = calcularTotalCobro();
  const pagado = (cobroPedidoRef.pagos || []).reduce((s, p) => s + p.monto, 0);
  const pendiente = Math.max(0, total - pagado);

  document.getElementById('cobroPedidoId').textContent = cobroPedidoRef.id;
  document.getElementById('cobroSubtotal').textContent = `$${totalBruto.toFixed(2)}`;

  const descRow = document.getElementById('cobroDescuentoRow');
  const totalDescuento = totalBruto - total;
  if (totalDescuento > 0) {
    descRow.style.display = 'flex';
    document.getElementById('cobroDescuentoMonto').textContent = `-$${totalDescuento.toFixed(2)}`;
  } else {
    descRow.style.display = 'none';
  }

  document.getElementById('cobroTotal').textContent = `$${pendiente.toFixed(2)}`;

  const pagadoInfo = document.getElementById('cobroPagadoInfo');
  if (pagado > 0) {
    pagadoInfo.style.display = 'block';
    document.getElementById('cobroPagado').textContent = pagado.toFixed(2);
    document.getElementById('cobroPendienteInfo').textContent = pendiente.toFixed(2);
  } else {
    pagadoInfo.style.display = 'none';
  }

  renderDescuentosAplicados();

  cobroMetodo = 'efectivo';
  selectMetodo('efectivo');
  document.getElementById('cobroMonto').value = pendiente.toFixed(2);
  calcularCambio();

  document.getElementById('cobroDividirCheck').checked = false;
  document.getElementById('cobroDividirFields').style.display = 'none';
  document.getElementById('cobroNumPartes').value = 2;

  document.getElementById('cobroValeCodigo').value = '';
  document.getElementById('cobroValeInfo').style.display = 'none';
  document.getElementById('cobroValeError').style.display = 'none';
  document.getElementById('cobroPropinaMonto').value = '';
  document.getElementById('cobroReferencia').value = '';
  document.getElementById('cobroNotasPago').value = '';
  document.getElementById('cobroPropinaPreview').textContent = '';

  document.getElementById('cobroModal').classList.add('active');
}

function closeCobroModal() {
  document.getElementById('cobroModal').classList.remove('active');
}

function selectMetodo(metodo) {
  cobroMetodo = metodo;
  document.querySelectorAll('.cobro-metodo').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.metodo === metodo);
    if (btn.dataset.metodo === metodo) {
      btn.style.background = 'var(--blue)';
      btn.style.color = 'white';
      btn.style.borderColor = 'var(--blue)';
    } else {
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }
  });
  calcularCambio();
}

function calcularCambio() {
  if (!cobroPedidoRef) return;
  const pendiente = calcularPendienteCobro();
  const monto = parseFloat(document.getElementById('cobroMonto').value) || 0;
  const cambio = Math.max(0, monto - pendiente);
  const el = document.getElementById('cobroCambio');
  el.textContent = `$${cambio.toFixed(2)}`;
  el.style.color = monto >= pendiente ? 'var(--green)' : 'var(--red)';
}

function toggleCobroSection(section) {
  const body = document.getElementById(`cobro${section.charAt(0).toUpperCase() + section.slice(1)}Body`);
  const toggle = document.getElementById(`cobro${section.charAt(0).toUpperCase() + section.slice(1)}Toggle`);
  if (!body) return;
  const visible = body.style.display !== 'none';
  body.style.display = visible ? 'none' : 'block';
  if (toggle) toggle.textContent = visible ? '▶' : '▼';
}

// ─── DESCUENTOS ───
async function aplicarDescuento() {
  if (!cobroPedidoRef) return;
  const tipo = document.getElementById('cobroDescTipo').value;
  const valor = parseFloat(document.getElementById('cobroDescValor').value);
  const motivo = document.getElementById('cobroDescMotivo').value;

  if (!valor || valor <= 0) return showToast('Ingresa un valor válido', 'warning');
  if (!motivo || !motivo.trim()) return showToast('El motivo es requerido', 'warning');
  if (tipo === 'porcentaje' && valor > 100) return showToast('El porcentaje no puede ser mayor a 100', 'warning');

  try {
    const res = await fetch(`/api/pedidos/${cobroPedidoRef.id}/descuento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, valor, motivo: motivo.trim(), usuario_id: currentUser?.id || null })
    });
    if (res.ok) {
      const data = await res.json();
      cobroPedidoRef.descuentos = data.descuentos;
      document.getElementById('cobroDescValor').value = '';
      document.getElementById('cobroDescMotivo').value = '';
      renderDescuentosAplicados();
      refreshCobroMontos();
      showToast('Descuento aplicado', 'success');
    } else {
      const err = await res.json();
      showToast(err.error || 'Error', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

async function eliminarDescuento(descId) {
  if (!cobroPedidoRef) return;
  try {
    const res = await fetch(`/api/pedidos/${cobroPedidoRef.id}/descuento/${descId}`, { method: 'DELETE' });
    if (res.ok) {
      cobroPedidoRef.descuentos = (cobroPedidoRef.descuentos || []).filter(d => d.id !== descId);
      renderDescuentosAplicados();
      refreshCobroMontos();
      showToast('Descuento eliminado', 'success');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

function renderDescuentosAplicados() {
  const container = document.getElementById('cobroDescuentosAplicados');
  const descuentos = cobroPedidoRef?.descuentos || [];
  if (!descuentos.length) { container.innerHTML = ''; return; }
  container.innerHTML = descuentos.map(d => {
    const val = d.tipo === 'porcentaje' ? `${d.valor}%` : `$${d.valor.toFixed(2)}`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:#FEF2F2;border-radius:6px;margin-bottom:4px;font-size:0.8rem;">
      <span>🏷️ <strong>${val}</strong> — ${d.motivo}</span>
      <button class="btn btn-outline btn-sm" style="padding:2px 6px;font-size:0.7rem;color:#DC2626;" onclick="eliminarDescuento(${d.id})">✕</button>
    </div>`;
  }).join('');
}

function refreshCobroMontos() {
  const total = calcularTotalCobro();
  const pagado = (cobroPedidoRef?.pagos || []).reduce((s, p) => s + p.monto, 0);
  const pendiente = Math.max(0, total - pagado);
  document.getElementById('cobroTotal').textContent = `$${pendiente.toFixed(2)}`;
  document.getElementById('cobroMonto').value = pendiente.toFixed(2);
  calcularCambio();
}

// ─── VALE ───
async function buscarVale() {
  const codigo = document.getElementById('cobroValeCodigo').value.trim();
  if (!codigo) return;
  try {
    const res = await fetch(`/api/pedidos/vales/buscar?codigo=${encodeURIComponent(codigo)}`);
    if (res.ok) {
      cobroValeData = await res.json();
      document.getElementById('cobroValeInfo').style.display = 'block';
      document.getElementById('cobroValeError').style.display = 'none';
      document.getElementById('cobroValeNombre').textContent = cobroValeData.cliente_nombre || 'Sin nombre';
      document.getElementById('cobroValeMonto').textContent = `$${cobroValeData.monto_restante.toFixed(2)}`;
      const pendiente = calcularPendienteCobro();
      const usar = Math.min(pendiente, cobroValeData.monto_restante);
      document.getElementById('cobroValeUsar').value = usar.toFixed(2);
    } else {
      cobroValeData = null;
      document.getElementById('cobroValeInfo').style.display = 'none';
      const err = await res.json();
      document.getElementById('cobroValeError').style.display = 'block';
      document.getElementById('cobroValeError').textContent = err.error || 'Vale no encontrado';
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

// ─── PROPINA ───
function setPropina(pct) {
  if (pct === 0) {
    document.getElementById('cobroPropinaMonto').value = '';
    document.getElementById('cobroPropinaPreview').textContent = '';
    return;
  }
  const total = calcularTotalCobro();
  const propina = total * pct / 100;
  document.getElementById('cobroPropinaMonto').value = propina.toFixed(2);
  updatePropinaPreview();
}

function updatePropinaPreview() {
  const propina = parseFloat(document.getElementById('cobroPropinaMonto').value) || 0;
  const total = calcularTotalCobro();
  document.getElementById('cobroPropinaPreview').textContent = propina > 0 ? `Propina: $${propina.toFixed(2)} (${(propina / total * 100).toFixed(1)}% del total)` : '';
}

// ─── DIVIDIR CUENTA ───
function toggleDividir() {
  const checked = document.getElementById('cobroDividirCheck').checked;
  document.getElementById('cobroDividirFields').style.display = checked ? 'block' : 'none';
  if (checked) updateDividirPreview();
}

function updateDividirFields() {
  const tipo = document.getElementById('cobroDividirTipo').value;
  document.getElementById('cobroDividirPartes').style.display = tipo === 'partes' ? 'block' : 'none';
  document.getElementById('cobroDividirMonto').style.display = tipo === 'monto' ? 'block' : 'none';
  updateDividirPreview();
}

function updateDividirPreview() {
  if (!cobroPedidoRef) return;
  const pendiente = calcularPendienteCobro();
  const tipo = document.getElementById('cobroDividirTipo').value;
  const container = document.getElementById('cobroDividirPreview');
  const personasContainer = document.getElementById('cobroDividirPersonas');

  let partes = [];

  if (tipo === 'partes') {
    const n = parseInt(document.getElementById('cobroNumPartes').value) || 2;
    const parte = pendiente / n;
    for (let i = 0; i < n; i++) {
      partes.push(i === n - 1 ? pendiente - parte * (n - 1) : Math.round(parte * 100) / 100);
    }
  } else {
    const montoParte = parseFloat(document.getElementById('cobroMontoParte').value) || 0;
    if (montoParte > 0) {
      const numPartes = Math.ceil(pendiente / montoParte);
      for (let i = 0; i < numPartes; i++) {
        partes.push(i === numPartes - 1 ? pendiente - montoParte * (numPartes - 1) : montoParte);
      }
    }
  }

  // Ensure cobroDividirPersonas array is correct length
  while (cobroDividirPersonas.length < partes.length) cobroDividirPersonas.push('efectivo');
  cobroDividirPersonas = cobroDividirPersonas.slice(0, partes.length);

  const metodos = [
    { key: 'efectivo', label: '💵' },
    { key: 'tarjeta', label: '💳' },
    { key: 'transferencia', label: '📱' }
  ];

  if (partes.length > 0) {
    personasContainer.style.display = 'block';
    personasContainer.innerHTML = '<div style="font-size:0.8rem;font-weight:600;margin-bottom:6px;">Método por persona:</div>' +
      partes.map((monto, i) => `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding:6px 8px;background:white;border:1px solid #E5E7EB;border-radius:6px;">
          <span style="font-size:0.8rem;min-width:60px;">Parte ${i + 1}:</span>
          <span style="font-weight:600;min-width:70px;">$${monto.toFixed(2)}</span>
          <div style="display:flex;gap:4px;flex:1;">
            ${metodos.map(m => `<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:0.75rem;${cobroDividirPersonas[i] === m.key ? 'background:var(--blue);color:white;border-color:var(--blue);' : ''}" onclick="setDividirPersona(${i},'${m.key}')">${m.label}</button>`).join('')}
          </div>
        </div>
      `).join('');
  } else {
    personasContainer.style.display = 'none';
  }

  if (partes.length > 0) {
    let html = '';
    for (let i = 0; i < partes.length; i++) {
      const ml = metodos.find(m => m.key === cobroDividirPersonas[i]);
      html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem;"><span>Parte ${i + 1} ${ml?.label || ''}:</span><span style="font-weight:600;">$${partes[i].toFixed(2)}</span></div>`;
    }
    container.innerHTML = html;
  } else {
    container.innerHTML = '<div style="font-size:0.8rem;color:var(--gray);text-align:center;">Configura la división</div>';
  }
}

function setDividirPersona(index, metodo) {
  cobroDividirPersonas[index] = metodo;
  updateDividirPreview();
}

// ─── REGALO ───
async function procesarRegalo() {
  if (!cobroPedidoRef) return;
  if (!confirm('¿Marcar el pendiente como regalo/obsequio?')) return;

  try {
    const res = await fetch(`/api/pedidos/${cobroPedidoRef.id}/pagar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metodo: 'regalo', monto: 0, usuario_id: currentUser?.id || null })
    });
    if (res.ok) {
      showToast('Regalo registrado', 'success');
      closeCobroModal();
      await verPedidoExistente(posMesaData.id);
      await loadMesas();
    } else {
      const err = await res.json();
      showToast(err.error || 'Error', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

// ─── PROCESAR PAGO ───
async function procesarPago() {
  if (!cobroPedidoRef) return;

  const pendiente = calcularPendienteCobro();
  const dividido = document.getElementById('cobroDividirCheck').checked;
  const propina = parseFloat(document.getElementById('cobroPropinaMonto').value) || 0;
  const referencia = document.getElementById('cobroReferencia').value.trim();
  const notas = document.getElementById('cobroNotasPago').value.trim();

  // Check if vale is being used
  const valeUsar = parseFloat(document.getElementById('cobroValeUsar').value) || 0;
  if (valeUsar > 0 && cobroValeData) {
    try {
      const res = await fetch(`/api/pedidos/${cobroPedidoRef.id}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo: 'vale',
          monto: Math.round(valeUsar * 100) / 100,
          referencia: cobroValeData.codigo,
          usuario_id: currentUser?.id || null,
          notas: notas || null
        })
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Error al aplicar vale', 'error');
        return;
      }
    } catch (e) {
      showToast('Error de conexión', 'error');
      return;
    }
    // Refresh pedido data
    const refreshRes = await fetch(`/api/pedidos/${cobroPedidoRef.id}`);
    cobroPedidoRef = await refreshRes.json();
  }

  const pendientePostVale = calcularPendienteCobro();

  if (pendientePostVale <= 0.01) {
    closeCobroModal();
    await verPedidoExistente(posMesaData.id);
    await loadMesas();
    return;
  }

  if (dividido) {
    const tipo = document.getElementById('cobroDividirTipo').value;
    let partes = [];

    if (tipo === 'partes') {
      const n = parseInt(document.getElementById('cobroNumPartes').value) || 2;
      const parte = pendientePostVale / n;
      for (let i = 0; i < n; i++) {
        partes.push(i === n - 1 ? pendientePostVale - parte * (n - 1) : Math.round(parte * 100) / 100);
      }
    } else {
      const montoParte = parseFloat(document.getElementById('cobroMontoParte').value) || 0;
      if (montoParte <= 0) return showToast('Ingresa un monto válido por parte', 'warning');
      const numPartes = Math.ceil(pendientePostVale / montoParte);
      for (let i = 0; i < numPartes; i++) {
        partes.push(i === numPartes - 1 ? pendientePostVale - montoParte * (numPartes - 1) : montoParte);
      }
    }

    const propinaParte = propina / partes.length;
    let successCount = 0;
    for (let i = 0; i < partes.length; i++) {
      const metodo = cobroDividirPersonas[i] || cobroMetodo;
      try {
        const res = await fetch(`/api/pedidos/${cobroPedidoRef.id}/pagar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metodo,
            monto: Math.round(partes[i] * 100) / 100,
            propina: i === partes.length - 1 ? Math.round(propinaParte * (partes.length - 1 - i) > 0 ? propina - Math.round(propinaParte * 100) / 100 * (partes.length - 1) : propina) : Math.round(propinaParte * 100) / 100,
            usuario_id: currentUser?.id || null,
            referencia: referencia || null,
            notas: notas || null
          })
        });
        if (res.ok) successCount++;
      } catch (e) {}
    }

    showToast(`${successCount} de ${partes.length} pagos registrados`, successCount === partes.length ? 'success' : 'warning');
  } else {
    let monto;
    if (cobroMetodo === 'regalo') {
      monto = pendientePostVale;
    } else if (cobroMetodo === 'vale') {
      return showToast('Selecciona un vale en la sección de vales', 'warning');
    } else {
      monto = parseFloat(document.getElementById('cobroMonto').value) || 0;
    }

    if (monto <= 0) return showToast('Ingresa un monto válido', 'warning');

    try {
      const res = await fetch(`/api/pedidos/${cobroPedidoRef.id}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo: cobroMetodo,
          monto: Math.round(monto * 100) / 100,
          propina: Math.round(propina * 100) / 100,
          usuario_id: currentUser?.id || null,
          referencia: referencia || null,
          notas: notas || null
        })
      });

      if (res.ok) {
        const data = await res.json();
        let msg = 'Pago registrado';
        if (data.completado) msg = cobroMetodo === 'efectivo' && data.cambio > 0 ? `Cambio: $${data.cambio.toFixed(2)}` : 'Pedido cobrado';
        showToast(msg, 'success');
      } else {
        const err = await res.json();
        showToast(err.error || 'Error al cobrar', 'error');
        return;
      }
    } catch (err) {
      showToast('Error de conexión', 'error');
      return;
    }
  }

  closeCobroModal();
  await verPedidoExistente(posMesaData.id);
  await loadMesas();
}

// ─── HIDE POS VIEW ON SHOW MESAS ───

const _originalShowMesasView = showMesasView;
showMesasView = function() {
  document.getElementById('mesasView').style.display = 'block';
  document.getElementById('posView').style.display = 'none';
  document.getElementById('pedidoView').style.display = 'none';
  posMesaId = null;
  posMesaData = null;
  pedidoExistente = null;
  pedidoItems = [];
  loadMesas();
};
