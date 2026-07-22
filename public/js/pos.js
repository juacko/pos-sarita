let posMesaId = null;
let posMesaData = null;
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

    await loadCategorias();
    await loadProductos();
    renderCategoriaTabs();
    renderProductos();
    renderPedidoItems();
  } catch (err) {
    showToast('Error al abrir POS', 'error');
  }
}

function showMesasView() {
  document.getElementById('posView').style.display = 'none';
  document.getElementById('mesasView').style.display = 'block';
  posMesaId = null;
  posMesaData = null;
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
  const existing = pedidoItems.find(i => i.producto_id === producto.id && !i.notas);
  if (existing) {
    existing.cantidad++;
  } else {
    pedidoItems.push({
      producto_id: producto.id,
      nombre: producto.nombre,
      cantidad: 1,
      precio: producto.precio,
      notas: ''
    });
  }
  renderPedidoItems();
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
  const total = pedidoItems.reduce((sum, i) => sum + i.cantidad * i.precio, 0);

  if (pedidoItems.length === 0) {
    container.innerHTML = '<p style="color:var(--gray);font-size:0.875rem;text-align:center;padding:40px 0;">Agrega productos al pedido</p>';
  } else {
    container.innerHTML = pedidoItems.map((item, idx) => `
      <div class="pedido-item">
        <div class="pedido-item-info">
          <div>
            <span class="pedido-item-qty">${item.cantidad}x</span>
            <span class="pedido-item-name">${item.nombre}</span>
          </div>
          ${item.notas ? `<div class="pedido-item-notas">📝 ${item.notas}</div>` : ''}
          <div style="margin-top:4px;display:flex;gap:4px;">
            <button class="btn btn-outline btn-sm" onclick="cambiarCantidad(${idx}, -1)">-</button>
            <button class="btn btn-outline btn-sm" onclick="cambiarCantidad(${idx}, 1)">+</button>
            <button class="btn btn-outline btn-sm" onclick="agregarNota(${idx})">📝</button>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="pedido-item-price">$${(item.cantidad * item.precio).toFixed(2)}</div>
          <button class="pedido-item-remove" onclick="eliminarItem(${idx})">&times;</button>
        </div>
      </div>
    `).join('');
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
  if (!posMesaId || pedidoItems.length === 0) {
    showToast('Agrega al menos un producto', 'warning');
    return;
  }

  const nota = document.getElementById('notaPedido').value;

  try {
    const res = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mesa_id: posMesaId,
        mesero_id: currentUser?.id || null,
        items: pedidoItems,
        nota: nota || null
      })
    });

    if (res.ok) {
      const data = await res.json();
      showToast('Pedido enviado a cocina', 'success');
      pedidoItems = [];
      document.getElementById('notaPedido').value = '';
      renderPedidoItems();

      const mesaRes = await fetch(`/api/mesas/${posMesaId}`);
      posMesaData = await mesaRes.json();
    } else {
      const err = await res.json();
      showToast(err.error || 'Error al enviar pedido', 'error');
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
