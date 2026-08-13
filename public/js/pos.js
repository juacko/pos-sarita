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
    btn.innerHTML = `${prod.nombre} <span class="precio">S/${prod.precio.toFixed(2)}</span>`;
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
  let html = `<p style="color:var(--gray);font-size:0.85rem;margin-bottom:12px;">Precio base: <strong>S/${prod.precio.toFixed(2)}</strong></p>`;

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
      html += `<div id="pos_mod_wrap_${m.id}" data-dep="${m.depende_variante_id || ''}" style="margin-bottom:12px;${m.depende_variante_id ? 'display:none;' : ''}"><strong style="font-size:0.85rem;">${m.nombre}${m.requerido ? ' <span style="color:#ef4444;">*</span>' : ''}</strong>`;
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
        <span style="flex:1;">${a.nombre} <span style="color:var(--green);">+S/${a.precio.toFixed(2)}</span></span>
        <button class="btn btn-outline btn-sm" onclick="changeAgregado(${a.id}, -1)">−</button>
        <span id="pos_agr_qty_${a.id}">0</span>
        <button class="btn btn-outline btn-sm" onclick="changeAgregado(${a.id}, 1)">+</button>
      </div>`;
    });
    html += '</div>';
  }

        html += '<div id="customizeTotal" style="text-align:right;font-size:1.2rem;font-weight:800;color:var(--green);border-top:1px solid #e2e8f0;padding-top:8px;">Total: S/' + prod.precio.toFixed(2) + '</div>';

  document.getElementById('customizeBody').innerHTML = html;
  document.getElementById('customizeModal').classList.add('active');
}

function selectVariante(jsonStr) {
  try { selectedVariante = JSON.parse(jsonStr.replace(/&#39;/g, "'")); } catch(e) { selectedVariante = JSON.parse(jsonStr); }
  refreshModifierVisibility();
  updateCustomizeTotal();
}

function refreshModifierVisibility() {
  const prod = customizeProduct;
  if (!prod?.modificadores) return;
  prod.modificadores.forEach(m => {
    const wrap = document.getElementById('pos_mod_wrap_' + m.id);
    if (!wrap) return;
    const visible = !m.depende_variante_id || (selectedVariante && selectedVariante.id == m.depende_variante_id);
    wrap.style.display = visible ? '' : 'none';
    if (!visible) {
      delete selectedMods[m.id];
      wrap.querySelectorAll('input').forEach(i => i.checked = false);
    }
  });
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
        document.getElementById('customizeTotal').textContent = 'Total: S/' + total.toFixed(2);
}

function closeCustomizeModal() {
  document.getElementById('customizeModal').classList.remove('active');
  customizeProduct = null;
}

function confirmCustomize() {
  const prod = customizeProduct;
  if (!prod) return;

  if (prod.variantes?.length && !selectedVariante) {
    showToast('Selecciona la presentación/guarnición', 'warning');
    return;
  }

  // Validar modificadores requeridos visibles (incluye dependientes activos)
  const faltantes = [];
  for (const m of prod.modificadores || []) {
    const visible = !m.depende_variante_id || (selectedVariante && selectedVariante.id == m.depende_variante_id);
    if (!visible || !m.requerido) continue;
    if (m.tipo === 'text') {
      const txt = document.getElementById('pos_mod_text_' + m.id)?.value || '';
      if (!txt.trim()) faltantes.push(m.nombre);
    } else {
      const vals = selectedMods[m.id];
      const ok = vals !== undefined && (Array.isArray(vals) ? vals.length > 0 : true);
      if (!ok) faltantes.push(m.nombre);
    }
  }
  if (faltantes.length) {
    showToast(`Falta seleccionar: ${faltantes.join(', ')}`, 'warning');
    return;
  }

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
          ${item.precio_adicional > 0 ? `<div style="font-size:0.7rem;color:var(--gray);">S/${item.precio.toFixed(2)} + S/${item.precio_adicional.toFixed(2)}</div>` : ''}
          <div class="pedido-item-price">S/${(item.cantidad * precioUnitario).toFixed(2)}</div>
          <button class="pedido-item-remove" onclick="eliminarItem(${idx})">&times;</button>
        </div>
      </div>`;
    }).join('');
  }

  document.getElementById('totalPedido').textContent = `S/${total.toFixed(2)}`;
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

    const puedeAnular = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'cajero');
    document.getElementById('btnCobrarPedido').style.display = (!isCerrado && !isFullyPaid) ? 'flex' : 'none';
    document.getElementById('btnReimprimirPedido').style.display = isCerrado ? 'flex' : 'none';
    document.getElementById('btnLiberarMesa').style.display = 'flex';
    document.getElementById('btnAnularPedido').style.display = (!isCerrado && puedeAnular) ? 'flex' : 'none';
    document.getElementById('btnEditarPagos').style.display = (isCerrado && pedidoExistente.estado !== 'CANCELADO' && puedeAnular) ? 'flex' : 'none';
    document.getElementById('btnEliminarPedidoPagado').style.display = (isCerrado && pedidoExistente.estado !== 'CANCELADO' && puedeAnular) ? 'flex' : 'none';
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
          ${precioAdic > 0 ? `<div style="font-size:0.7rem;color:var(--gray);">S/${item.precio_unitario.toFixed(2)} + S/${precioAdic.toFixed(2)}</div>` : ''}
          <div class="pedido-item-price">S/${subtotal.toFixed(2)}</div>
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

  document.getElementById('pedidoViewTotal').textContent = `S/${total.toFixed(2)}`;

  const pendienteEl = document.getElementById('pedidoViewPendiente');
  if (pagado > 0 && pendiente > 0) {
    pendienteEl.style.display = 'flex';
    document.getElementById('pedidoViewPendienteMonto').textContent = `S/${pendiente.toFixed(2)}`;
  } else {
    pendienteEl.style.display = 'none';
  }

  let html = `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:var(--gray);">Items:</span><span>${pedidoExistente.items.length}</span></div>`;
  html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:var(--gray);">Subtotal:</span><span>S/${totalBruto.toFixed(2)}</span></div>`;
  if (totalDescuento > 0) {
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:#DC2626;">Descuento:</span><span style="color:#DC2626;">-S/${totalDescuento.toFixed(2)}</span></div>`;
    for (const d of descuentos) {
      const motLabel = d.tipo === 'porcentaje' ? `${d.valor}%` : `S/${d.valor.toFixed(2)}`;
      html += `<div style="font-size:0.75rem;color:var(--gray);margin-bottom:4px;margin-left:12px;">${motLabel} — ${d.motivo}</div>`;
    }
  }
  if (pagado > 0) {
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="color:var(--gray);">Pagado:</span><span style="color:var(--green);">S/${pagado.toFixed(2)}</span></div>`;
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

  const metodos = { regalo: '🎁', vale: '🎟️' };
  for (const m of metodosVisibles()) metodos[m.key] = m.label;
  container.innerHTML = '<div style="font-size:0.8rem;font-weight:600;margin-bottom:4px;">Pagos realizados:</div>' +
    pagos.map(p => {
      let info = `${metodos[p.metodo] || ''} ${p.metodo}: S/${p.monto.toFixed(2)}`;
      if (p.propina > 0) info += ` (+S/${p.propina.toFixed(2)} propina)`;
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

async function imprimirPrecuenta() {
  if (!pedidoExistente) return;
  try {
    const res = await fetch(`/api/pedidos/${pedidoExistente.id}/precuenta`, { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Pre-cuenta impresa' : 'Error al imprimir pre-cuenta', data.ok ? 'success' : 'warning');
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

async function anularPedidoDesdePOS() {
  if (!pedidoExistente || !currentUser) return;
  if (currentUser.rol !== 'admin' && currentUser.rol !== 'cajero') {
    showToast('Solo el administrador o el cajero pueden anular pedidos', 'warning');
    return;
  }
  const motivo = prompt(`Ingresa el motivo para anular el Pedido #${pedidoExistente.id} (requerido):`);
  if (!motivo || !motivo.trim()) {
    showToast('El motivo es requerido para anular el pedido', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/admin/pedidos/${pedidoExistente.id}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim(), usuario_id: currentUser.id })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast('Pedido anulado y mesa liberada', 'success');
      showMesasView();
    } else {
      showToast(data.error || 'Error al anular el pedido', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

async function liberarMesaDesdePedido() {
  if (!posMesaData || !currentUser) return;

  if (pedidoExistente && pedidoExistente.estado !== 'CERRADO' && pedidoExistente.estado !== 'CANCELADO') {
    if (currentUser.rol === 'admin' || currentUser.rol === 'cajero') {
      if (confirm(`Esta mesa tiene un pedido activo (#${pedidoExistente.id}). Para liberarla se debe anular el pedido.\n\n¿Deseas anular el pedido y liberar la mesa?`)) {
        anularPedidoDesdePOS();
      }
    } else {
      showToast('La mesa tiene un pedido activo. Solo admin o cajero puede anularlo para liberarla.', 'warning');
    }
    return;
  }

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

// ─── MODAL EDITAR PAGOS (pedidos pagados) ───

let editarPagosData = null;

function COBRO_METODOS_LABELS() {
  const extra = { regalo: 'Regalo', vale: 'Vale' };
  for (const m of metodosVisibles()) extra[m.key] = m.texto;
  return extra;
}

function metodosEditables() {
  const labels = COBRO_METODOS_LABELS();
  const keys = metodosVisibles().map(m => m.key);
  const out = {};
  for (const k of keys) if (labels[k]) out[k] = labels[k];
  return out;
}

async function abrirModalEditarPagos() {
  if (!pedidoExistente || !currentUser) return;
  if (currentUser.rol !== 'admin' && currentUser.rol !== 'cajero') {
    showToast('Solo admin o cajero puede editar pagos', 'warning');
    return;
  }
  const res = await fetch(`/api/pedidos/${pedidoExistente.id}`);
  if (!res.ok) return showToast('No se pudo cargar el pedido', 'error');
  editarPagosData = await res.json();

  document.getElementById('editarPagosPedidoId').textContent = editarPagosData.id;
  renderEditarPagos();
  document.getElementById('editarPagosModal').style.display = 'flex';
}

function renderEditarPagos() {
  const total = editarPagosData.items.reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
  const descRow = editarPagosData.descuentos || [];
  const descFijo = descRow.filter(d => d.tipo === 'monto_fijo').reduce((s, d) => s + d.valor, 0);
  const descPct = descRow.filter(d => d.tipo === 'porcentaje').reduce((s, d) => s + d.valor, 0);
  const totalFinal = Math.max(0, total * (1 - descPct / 100) - descFijo);
  const pagos = editarPagosData.pagos || [];
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  const pendiente = Math.max(0, totalFinal - pagado);

  const labels = metodosEditables();
  document.getElementById('editarPagosInfo').innerHTML = `
    <div style="background:var(--gray-light);border-radius:10px;padding:10px 14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;">
        <span>Total</span><span style="font-weight:700;">S/${totalFinal.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;">
        <span>Pagado</span><span style="font-weight:700;color:var(--green);">S/${pagado.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.85rem;">
        <span>Pendiente</span><span style="font-weight:700;color:var(--red);">S/${pendiente.toFixed(2)}</span>
      </div>
    </div>
  `;

  document.getElementById('editarPagosPendiente').textContent = `Pendiente actual: S/${pendiente.toFixed(2)}`;

  const metodoSel = document.getElementById('editarPagosMetodo');
  const actual = metodoSel.value || 'efectivo';
  metodoSel.innerHTML = Object.keys(labels)
    .map(m => `<option value="${m}" ${m === actual ? 'selected' : ''}>${labels[m]}</option>`)
    .join('');

  const listEl = document.getElementById('editarPagosList');
  if (!pagos.length) {
    listEl.innerHTML = '<p style="color:var(--gray);text-align:center;padding:10px;">Sin pagos registrados</p>';
    return;
  }
  listEl.innerHTML = pagos.map(p => {
    const propinaTxt = p.propina > 0 ? ` <small style="color:var(--gray);">+ propina S/${p.propina.toFixed(2)}</small>` : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:8px;background:#fff;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:0.9rem;">${labels[p.metodo] || p.metodo} — S/${p.monto.toFixed(2)}${propinaTxt}</div>
          <div style="font-size:0.75rem;color:var(--gray);">${p.referencia ? 'Ref: ' + p.referencia + ' · ' : ''}${p.created_at ? p.created_at : ''}${p.usuario_nombre ? ' · ' + p.usuario_nombre : ''}</div>
        </div>
        <select class="form-control" style="width:140px;font-size:0.8rem;padding:4px;" onchange="cambiarMetodoPago(${p.id}, this.value)">
          ${Object.keys(labels).map(m => `<option value="${m}" ${m === p.metodo ? 'selected' : ''}>${labels[m]}</option>`).join('')}
          ${labels[p.metodo] ? '' : `<option value="${p.metodo}" selected>${COBRO_METODOS_LABELS()[p.metodo] || p.metodo}</option>`}
        </select>
        <button class="btn btn-sm" style="background:#DC2626;color:white;padding:5px 10px;" onclick="quitarPagoPedido(${p.id}, ${p.monto})">Quitar</button>
      </div>
    `;
  }).join('');
}

function closeEditarPagosModal() {
  document.getElementById('editarPagosModal').style.display = 'none';
  editarPagosData = null;
}

async function cambiarMetodoPago(pagoId, nuevoMetodo) {
  const motivo = prompt('Motivo del cambio de método de pago (opcional):');
  if (motivo === null) { renderEditarPagos(); return; }
  try {
    const res = await fetch(`/api/admin/pedidos/${editarPagosData.id}/pagos/${pagoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metodo: nuevoMetodo, motivo: (motivo || '').trim() || null, usuario_id: currentUser.id })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Método de pago actualizado', 'success');
      const r = await fetch(`/api/pedidos/${editarPagosData.id}`);
      editarPagosData = await r.json();
      renderEditarPagos();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

async function agregarPagoPedido() {
  const metodo = document.getElementById('editarPagosMetodo').value;
  const monto = parseFloat(document.getElementById('editarPagosMonto').value);
  if (!monto || monto <= 0) return showToast('Ingresa un monto válido', 'warning');
  const motivo = prompt('Motivo (opcional):');
  if (motivo === null) return;
  try {
    const res = await fetch(`/api/admin/pedidos/${editarPagosData.id}/pagos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metodo, monto, motivo: (motivo || '').trim() || null, usuario_id: currentUser.id })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Pago agregado', 'success');
      document.getElementById('editarPagosMonto').value = '';
      const r = await fetch(`/api/pedidos/${editarPagosData.id}`);
      editarPagosData = await r.json();
      renderEditarPagos();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

async function quitarPagoPedido(pagoId, monto) {
  if (!confirm(`⚠️ Quitar este pago (S/${monto.toFixed(2)}) es una DEVOLUCIÓN: anulará el pedido #${editarPagosData.id} completo, registrará un EGRESO en caja y liberará la mesa.\n\n¿Continuar?`)) return;
  const motivo = prompt('Motivo de la devolución (requerido):');
  if (!motivo || !motivo.trim()) return showToast('El motivo es requerido', 'warning');
  try {
    const res = await fetch(`/api/admin/pedidos/${editarPagosData.id}/pagos/${pagoId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim(), usuario_id: currentUser.id })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast('Pedido anulado (devolución)', 'success');
      closeEditarPagosModal();
      await verPedidoExistente(pedidoExistente.id);
      showMesasView();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

async function eliminarPedidoPagado() {
  if (!pedidoExistente) return;
  if (currentUser.rol !== 'admin' && currentUser.rol !== 'cajero') {
    showToast('Solo admin o cajero puede eliminar pedidos', 'warning');
    return;
  }
  const pagado = (pedidoExistente.pagos || []).reduce((s, p) => s + p.monto, 0);
  if (!confirm(`⚠️ Eliminar el pedido #${pedidoExistente.id} por S/${pagado.toFixed(2)} devolverá el total como EGRESO en caja, anulará el pedido y liberará la mesa.\n\n¿Continuar?`)) return;
  const motivo = prompt('Motivo de la eliminación (requerido):');
  if (!motivo || !motivo.trim()) return showToast('El motivo es requerido', 'warning');
  try {
    const res = await fetch(`/api/admin/pedidos/${pedidoExistente.id}/eliminar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim(), usuario_id: currentUser.id })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast('Pedido eliminado (devolución)', 'success');
      showMesasView();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

// ─── VISTA PAGADOS (historial) ───

let vistaPagadosOn = false;
let pagadosLista = [];

async function toggleVistaPagados() {
  vistaPagadosOn = !vistaPagadosOn;
  const panel = document.getElementById('pagadosPanel');
  if (vistaPagadosOn) {
    await loadPagados();
    panel.style.display = 'block';
    const grid = document.getElementById('mesasGrid');
    const area = document.getElementById('areaFilter');
    const canales = document.getElementById('canalesRow');
    if (grid) grid.style.display = 'none';
    if (area) area.style.display = 'none';
    if (canales) canales.style.display = 'none';
  } else {
    panel.style.display = 'none';
    const grid = document.getElementById('mesasGrid');
    const area = document.getElementById('areaFilter');
    const canales = document.getElementById('canalesRow');
    if (grid) grid.style.display = '';
    if (area) area.style.display = '';
    if (canales) canales.style.display = '';
  }
}

async function loadPagados() {
  try {
    const res = await fetch('/api/admin/pedidos/pagados?limite=60');
    if (!res.ok) throw new Error();
    pagadosLista = await res.json();
    renderPagados();
  } catch (e) {
    const panel = document.getElementById('pagadosPanel');
    panel.innerHTML = '<p style="color:var(--red);">Error al cargar el historial</p>';
  }
}

function renderPagados() {
  const panel = document.getElementById('pagadosPanel');
  const puede = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'cajero');
  if (!pagadosLista.length) {
    panel.innerHTML = '<p class="empty-state">Sin pedidos pagados o anulados recientes</p>';
    return;
  }
  const rows = pagadosLista.map(p => {
    const badge = p.estado === 'CERRADO'
      ? '<span class="badge badge-green">Pagado</span>'
      : `<span class="badge badge-red">Anulado</span>`;
    const acciones = `
      <button class="btn btn-sm btn-outline" onclick="verPedidoPagado(${p.id})">Ver</button>
      ${p.estado === 'CERRADO' && puede
        ? `<button class="btn btn-sm btn-outline" style="color:#DC2626;border-color:#FCA5A5;" onclick="eliminarPedidoPagadoId(${p.id})">🗑️</button>`
        : ''}
    `;
    return `
      <div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:8px 12px;margin-bottom:6px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:0.85rem;">Pedido #${p.id} · ${p.mesa_nombre || ('Mesa ' + (p.mesa_numero || ''))} ${badge}</div>
          <div style="font-size:0.75rem;color:var(--gray);">${p.created_at}${p.cliente_nombre ? ' · ' + p.cliente_nombre : ''}${p.motivo_cancelacion ? ' · ' + p.motivo_cancelacion : ''}</div>
        </div>
        <div style="font-weight:700;color:var(--green);">S/${(p.pagado || p.total || 0).toFixed(2)}</div>
        <div style="display:flex;gap:4px;">${acciones}</div>
      </div>
    `;
  }).join('');
  panel.innerHTML = `
    <h2 style="font-size:0.95rem;color:var(--gray-dark);margin-bottom:10px;">📋 Historial de pedidos pagados / anulados</h2>
    <div style="max-height:65vh;overflow-y:auto;">${rows}</div>
  `;
}

async function verPedidoPagado(id) {
  const res = await fetch(`/api/pedidos/${id}`);
  if (!res.ok) return showToast('No se pudo cargar el pedido', 'error');
  pedidoExistente = await res.json();
  await verPedidoExistente(id);
}

async function eliminarPedidoPagadoId(id) {
  const ped = pagadosLista.find(p => p.id === id);
  const monto = ped ? (ped.pagado || ped.total || 0) : 0;
  if (!confirm(`⚠️ Eliminar el pedido #${id} por S/${monto.toFixed(2)} devolverá el total como EGRESO en caja, anulará el pedido y liberará la mesa.\n\n¿Continuar?`)) return;
  const motivo = prompt('Motivo de la eliminación (requerido):');
  if (!motivo || !motivo.trim()) return showToast('El motivo es requerido', 'warning');
  try {
    const res = await fetch(`/api/admin/pedidos/${id}/eliminar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim(), usuario_id: currentUser.id })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast('Pedido eliminado (devolución)', 'success');
      await loadPagados();
    } else {
      showToast(data.error || 'Error', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

// ─── MODAL DE COBRO ───

let cobroMetodo = 'efectivo';
let cobroPagos = [];
let cobroPedidoRef = null;
let cobroValeData = null;
let posConfig = null;

async function loadPosConfig() {
  try {
    const res = await fetch('/api/configuracion/modal_pago');
    posConfig = await res.json();
  } catch (e) {
    // conservar config previa
  }
}
loadPosConfig();

const COBRO_METODOS_DEF = [
  { key: 'efectivo', label: '💵', texto: 'Efectivo' },
  { key: 'tarjeta', label: '💳', texto: 'Tarjeta' },
  { key: 'transferencia', label: '📱', texto: 'Transf.' },
  { key: 'otros', label: '📋', texto: 'Otros' }
];

function metodosVisibles() {
  const cfgMetodos = posConfig?.metodos;
  if (cfgMetodos && cfgMetodos.length) {
    return cfgMetodos.map(m => {
      if (typeof m === 'string') {
        const def = COBRO_METODOS_DEF.find(d => d.key === m);
        return def || { key: m, label: '📋', texto: m };
      }
      return { key: m?.key, label: m?.label || '💳', texto: m?.texto || m?.key || '' };
    }).filter(m => m.key);
  }
  return COBRO_METODOS_DEF;
}

function renderPagosCobro() {
  const list = document.getElementById('cobroPagosList');
  if (!list) return;
  const visibles = metodosVisibles();

  list.innerHTML = cobroPagos.map((p, i) => `
    <div style="display:flex;gap:6px;align-items:center;background:white;border-radius:8px;padding:4px 6px;">
      <select id="cobroPagoMetodo-${i}" class="form-control" style="flex:1;font-size:0.85rem;padding:6px;" onchange="cambioFilaPagoMetodo(${i}, this.value)">
        ${visibles.map(m => `<option value="${m.key}" ${p.metodo === m.key ? 'selected' : ''}>${m.label} ${m.texto}</option>`).join('')}
      </select>
      <input id="cobroPagoMonto-${i}" type="number" step="0.01" min="0" value="${(p.monto || 0).toFixed(2)}" class="form-control" style="width:110px;font-weight:700;font-size:0.9rem;text-align:right;" oninput="cambioFilaPagoMonto(${i}, this.value)">
      ${cobroPagos.length > 1 ? `<button class="btn btn-outline" style="padding:3px 9px;color:#DC2626;font-size:0.8rem;" onclick="quitarFilaPago(${i})">✕</button>` : ''}
    </div>
  `).join('');

  actualizarResumenCobro();
}

function ajustarUltimaFila() {
  if (!cobroPagos.length) return;
  const pendiente = calcularPendienteCobro();
  const idxUltima = cobroPagos.length - 1;
  const sumaResto = cobroPagos.slice(0, idxUltima).reduce((s, p) => s + (p.monto || 0), 0);
  const nuevo = Math.round(Math.max(0, pendiente - sumaResto) * 100) / 100;
  cobroPagos[idxUltima].monto = nuevo;
  const input = document.getElementById(`cobroPagoMonto-${idxUltima}`);
  if (input) input.value = nuevo.toFixed(2);
  actualizarResumenCobro();
}

function actualizarResumenCobro() {
  if (!cobroPagos.length) return;
  const pendiente = calcularPendienteCobro();
  const suma = cobroPagos.reduce((s, p) => s + (p.monto || 0), 0);
  document.getElementById('cobroSumaPagos').textContent = `S/${suma.toFixed(2)}`;
  const dif = Math.round((suma - pendiente) * 100) / 100;
  const faltaEl = document.getElementById('cobroFaltaCambioValor');
  const ultima = cobroPagos[cobroPagos.length - 1];
  if (dif > 0.004) {
    faltaEl.textContent = ultima?.metodo === 'efectivo' ? `Cambio: S/${dif.toFixed(2)}` : `Sobrante: S/${dif.toFixed(2)}`;
    faltaEl.style.color = 'var(--green)';
  } else if (dif < -0.004) {
    faltaEl.textContent = `Falta: S/${Math.abs(dif).toFixed(2)}`;
    faltaEl.style.color = 'var(--red)';
  } else {
    faltaEl.textContent = 'Completo ✓';
    faltaEl.style.color = 'var(--green)';
  }
}

function agregarFilaPago() {
  const visibles = metodosVisibles();
  if (!cobroPagos.length) return;
  const pendiente = calcularPendienteCobro();
  const suma = cobroPagos.reduce((s, p) => s + (p.monto || 0), 0);
  const usados = cobroPagos.map(p => p.metodo);
  const metodo = visibles.find(m => !usados.includes(m.key)) || visibles[0];
  cobroPagos.push({ metodo: metodo.key, monto: Math.round(Math.max(0, pendiente - suma) * 100) / 100 });
  renderPagosCobro();
  const input = document.getElementById(`cobroPagoMonto-${cobroPagos.length - 1}`);
  if (input) { input.focus(); input.select(); }
}

function quitarFilaPago(idx) {
  if (cobroPagos.length <= 1) return;
  cobroPagos.splice(idx, 1);
  renderPagosCobro();
  const input = document.getElementById(`cobroPagoMonto-${cobroPagos.length - 1}`);
  if (input) { input.focus(); input.select(); }
}

function cambioFilaPagoMetodo(idx, metodo) {
  cobroPagos[idx].metodo = metodo;
  const sel = document.getElementById(`cobroPagoMetodo-${idx}`);
  if (sel) sel.value = metodo;
  actualizarResumenCobro();
}

function cambioFilaPagoMonto(idx, valor) {
  cobroPagos[idx].monto = Math.max(0, parseFloat(valor) || 0);
  if (idx !== cobroPagos.length - 1) {
    ajustarUltimaFila();
  } else {
    actualizarResumenCobro();
  }
}

function aplicarVisibilidadCobro() {
  const cfg = posConfig || {};
  const secciones = {
    mostrar_descuento: 'cobroDescuentoSection',
    mostrar_vale: 'cobroValeSection',
    mostrar_propina: 'cobroPropinaSection',
    mostrar_notas: 'cobroNotasSection',
    mostrar_regalo: 'cobroRegaloSection'
  };
  for (const [clave, id] of Object.entries(secciones)) {
    const el = document.getElementById(id);
    if (el) el.style.display = cfg[clave] === false ? 'none' : '';
  }
}

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

async function abrirModalCobro() {
  if (!pedidoExistente) return;
  cobroPedidoRef = pedidoExistente;
  cobroValeData = null;

  const totalBruto = cobroPedidoRef.items.reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
  const total = calcularTotalCobro();
  const pagado = (cobroPedidoRef.pagos || []).reduce((s, p) => s + p.monto, 0);
  const pendiente = Math.max(0, total - pagado);

  document.getElementById('cobroPedidoId').textContent = cobroPedidoRef.id;
  document.getElementById('cobroSubtotal').textContent = `S/${totalBruto.toFixed(2)}`;

  const descRow = document.getElementById('cobroDescuentoRow');
  const totalDescuento = totalBruto - total;
  if (totalDescuento > 0) {
    descRow.style.display = 'flex';
    document.getElementById('cobroDescuentoMonto').textContent = `-S/${totalDescuento.toFixed(2)}`;
  } else {
    descRow.style.display = 'none';
  }

  document.getElementById('cobroTotal').textContent = `S/${pendiente.toFixed(2)}`;

  const pagadoInfo = document.getElementById('cobroPagadoInfo');
  if (pagado > 0) {
    pagadoInfo.style.display = 'block';
    document.getElementById('cobroPagado').textContent = pagado.toFixed(2);
  } else {
    pagadoInfo.style.display = 'none';
  }

  renderDescuentosAplicados();

  await loadPosConfig();
  aplicarVisibilidadCobro();

  const visibles = metodosVisibles();
  cobroMetodo = visibles[0]?.key || 'efectivo';
  cobroPagos = [{ metodo: cobroMetodo, monto: Math.round(pendiente * 100) / 100 }];
  renderPagosCobro();

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
    const val = d.tipo === 'porcentaje' ? `${d.valor}%` : `S/${d.valor.toFixed(2)}`;
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
  document.getElementById('cobroTotal').textContent = `S/${pendiente.toFixed(2)}`;
  ajustarUltimaFila();
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
      document.getElementById('cobroValeMonto').textContent = `S/${cobroValeData.monto_restante.toFixed(2)}`;
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
  document.getElementById('cobroPropinaPreview').textContent = propina > 0 ? `Propina: S/${propina.toFixed(2)} (${(propina / total * 100).toFixed(1)}% del total)` : '';
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
  ajustarUltimaFila();

  if (pendientePostVale <= 0.01) {
    closeCobroModal();
    await verPedidoExistente(posMesaData.id);
    await loadMesas();
    return;
  }

  if (!cobroPagos.length) return showToast('Agrega al menos un método de pago', 'warning');

  const pagos = cobroPagos.map(p => ({
    metodo: p.metodo,
    monto: Math.round((p.monto || 0) * 100) / 100
  }));
  let suma = pagos.reduce((s, p) => s + p.monto, 0);

  if (suma < pendientePostVale - 0.01) {
    return showToast(`Falta: S/${(pendientePostVale - suma).toFixed(2)}`, 'warning');
  }

  // El sobrante solo se acepta en efectivo (cambio); en otros métodos se recorta
  const ultimo = pagos[pagos.length - 1];
  if (ultimo.metodo !== 'efectivo' && suma > pendientePostVale + 0.01) {
    ultimo.monto = Math.max(0, Math.round((ultimo.monto - (suma - pendientePostVale)) * 100) / 100);
    suma = pagos.reduce((s, p) => s + p.monto, 0);
    if (suma < pendientePostVale - 0.01) {
      return showToast(`Falta: S/${(pendientePostVale - suma).toFixed(2)}`, 'warning');
    }
  }

  let pagosOk = 0;
  let cambio = 0;
  for (let i = 0; i < pagos.length; i++) {
    const p = pagos[i];
    const esUltimo = i === pagos.length - 1;
    try {
      const res = await fetch(`/api/pedidos/${cobroPedidoRef.id}/pagar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo: p.metodo,
          monto: Math.round(p.monto * 100) / 100,
          propina: esUltimo ? Math.round(propina * 100) / 100 : 0,
          usuario_id: currentUser?.id || null,
          referencia: esUltimo ? (referencia || null) : null,
          notas: esUltimo ? (notas || null) : null
        })
      });
      if (res.ok) {
        const data = await res.json();
        pagosOk++;
        if (data.cambio > 0) cambio = data.cambio;
      } else {
        const err = await res.json();
        if (err.code === 'CAJA_CERRADA' || /caja abierta/i.test(err.error || '')) {
          mostrarModalSinCaja();
        } else {
          showToast(err.error || 'Error al cobrar', 'error');
        }
        break;
      }
    } catch (err) {
      showToast('Error de conexión', 'error');
      break;
    }
  }

  if (pagosOk === pagos.length) {
    let msg = pagos.length > 1 ? `${pagos.length} pagos registrados` : 'Pago registrado';
    if (cambio > 0) msg = `Cambio: S/${cambio.toFixed(2)}`;
    showToast(msg, 'success');
  } else {
    showToast(`Se registraron ${pagosOk} de ${pagos.length} pagos`, 'warning');
  }

  closeCobroModal();
  await verPedidoExistente(posMesaData.id);
  await loadMesas();
}

// ─── MODAL SIN CAJA ABIERTA ───

function mostrarModalSinCaja() {
  closeCobroModal();
  document.getElementById('sinCajaModal').classList.add('active');
}

function closeSinCajaModal() {
  document.getElementById('sinCajaModal').classList.remove('active');
}

function irAbrirCaja() {
  window.open('/admin.html#caja', '_blank');
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
  pedidoCliente = null;
  pedidoItems = [];
  loadMesas();
};
