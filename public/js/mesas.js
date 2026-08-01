let currentUser = null;
let selectedMesa = null;
let pedidoActual = [];
let allMesas = [];
let areasGlobal = [];
let areaFilter = null;
let canalModalTipo = null;
let clienteModalTipo = null;
let clienteModalAccion = null;

async function initApp() {
  await loadMesas();
  await loadUsuarios();
  await loadAreas();

  const loginScreen = document.getElementById('loginScreen');
  const appContent = document.getElementById('appContent');

  if (currentUser) {
    loginScreen.style.display = 'none';
    appContent.style.display = 'block';
    updateUserInfo();
  }
}

async function loadMesas() {
  try {
    const res = await fetch('/api/mesas');
    allMesas = await res.json();
    renderCanales(allMesas);
    renderMesas(allMesas);
  } catch (err) {
    showToast('Error al cargar mesas', 'error');
  }
}

async function loadAreas() {
  try {
    const res = await fetch('/api/mesas/areas');
    areasGlobal = await res.json();
    renderAreaFilter();
  } catch (err) {
    console.error('Error al cargar áreas:', err);
  }
}

function renderAreaFilter() {
  const el = document.getElementById('areaFilter');
  if (!el) return;
  const salones = areasGlobal.filter(a => a.tipo === 'SALON' && a.activo);

  const chip = (label, id) => {
    const b = document.createElement('button');
    b.className = `area-chip${areaFilter === id ? ' active' : ''}`;
    b.textContent = label;
    b.onclick = () => {
      areaFilter = id;
      renderAreaFilter();
      renderMesas(allMesas);
    };
    return b;
  };

  el.innerHTML = '';
  el.appendChild(chip('Todas', null));
  for (const a of salones) el.appendChild(chip(a.nombre, a.id));
}

function renderCanales(mesas) {
  const el = document.getElementById('canalesRow');
  if (!el) return;

  const tipos = [
    { tipo: 'DELIVERY', icono: '🛵', label: 'Delivery', color: '#3B82F6', sub: 'A domicilio' },
    { tipo: 'PARA_LLEVAR', icono: '🥡', label: 'Para Llevar', color: '#F59E0B', sub: 'Para recoger' }
  ];

  el.innerHTML = '';
  for (const t of tipos) {
    const hayArea = areasGlobal.some(a => a.tipo === t.tipo && a.activo);
    if (!hayArea) continue;
    const virt = mesas.filter(m => m.es_virtual && m.area_tipo === t.tipo);
    const activas = virt.filter(m => m.pedido_activo_id).length;

    const card = document.createElement('div');
    card.className = 'canal-card';
    card.style.setProperty('--canal', t.color);
    card.innerHTML = `
      <div class="canal-icon">${t.icono}</div>
      <div class="canal-label">${t.label}</div>
      <div class="canal-badge">${activas} activo${activas !== 1 ? 's' : ''}</div>
      <div class="canal-sub">Nuevo pedido ${t.sub}</div>
    `;
    card.onclick = () => openCanalModal(t.tipo);
    el.appendChild(card);
  }
}

async function loadUsuarios() {
  try {
    const res = await fetch('/api/usuarios');
    if (res.ok) {
      const usuarios = await res.json();
      const select = document.getElementById('selectMesero');
      if (select) {
        select.innerHTML = '<option value="">Seleccionar mesero</option>';
        for (const u of usuarios.filter(u => u.rol === 'mesero' || u.rol === 'admin')) {
          select.innerHTML += `<option value="${u.id}">${u.nombre} (${u.rol})</option>`;
        }
      }
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderMesas(mesas) {
  const grid = document.getElementById('mesasGrid');
  if (!grid) return;

  const fisicas = mesas.filter(m => !m.es_virtual);
  let filtered = fisicas;
  if (areaFilter) filtered = fisicas.filter(m => m.area_id === areaFilter);

  grid.innerHTML = '';
  if (!filtered.length) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray);">No hay mesas en esta área</p>';
    return;
  }

  const grupos = {};
  for (const mesa of filtered) {
    const key = mesa.area_id || 'sin';
    if (!grupos[key]) grupos[key] = { nombre: mesa.area_nombre || 'Sin área', mesas: [] };
    grupos[key].mesas.push(mesa);
  }

  for (const key of Object.keys(grupos)) {
    const grupo = grupos[key];
    const header = document.createElement('div');
    header.className = 'area-header';
    header.innerHTML = `${grupo.nombre} <span class="area-count">${grupo.mesas.length}</span>`;
    grid.appendChild(header);

    for (const mesa of grupo.mesas) {
      grid.appendChild(createMesaCard(mesa));
    }
  }
}

function createMesaCard(mesa) {
  const card = document.createElement('div');
  const estadoEfectivo = mesa.estado_ejefe || mesa.estado;
  card.className = `mesa-card ${estadoEfectivo}`;
  card.dataset.id = mesa.id;

  let statusText = estadoEfectivo;
  let extraInfo = '';
  let infoFooter = '';

  if (mesa.pedido_total != null && (mesa.estado === 'OCUPADO' || mesa.estado === 'CERRANDO')) {
    const total = mesa.pedido_total;
    const pagado = mesa.pedido_pagado || 0;
    const descuento = mesa.pedido_descuento || 0;
    const pendiente = Math.max(0, total - descuento - pagado);

    extraInfo = `<div class="mesa-total">$${total.toFixed(2)}</div>`;
    if (estadoEfectivo === 'PAGADO') {
      statusText = 'PAGADO';
      card.classList.add('PAGADO');
      extraInfo += '<div class="mesa-pagado-icon">💰</div>';
    } else {
      infoFooter = `<div class="mesa-pendiente">Pendiente: $${pendiente.toFixed(2)}</div>`;
    }
  }

  const tiempo = mesa.ocupado_desde ? timeSince(new Date(mesa.ocupado_desde + 'Z')) : '';
  const ocupadoInfo = tiempo && (mesa.estado === 'OCUPADO' || mesa.estado === 'CERRANDO')
    ? `<div class="mesa-tiempo">⏱ ${tiempo}</div>` : '';

  const sinPedido = mesa.estado === 'OCUPADO' && !mesa.tiene_pedido_activo && mesa.minutos_sin_pedido != null;
  let sinPedidoInfo = '';
  if (sinPedido) {
    sinPedidoInfo = `<div class="mesa-sinpedido">⏱ ${mesa.minutos_sin_pedido} min sin pedido</div>`;
  }

  const puedeLiberar = sinPedido && (currentUser?.rol === 'admin' || currentUser?.id === mesa.mesero_id);

  card.innerHTML = `
    ${extraInfo}
    <div class="mesa-numero">${mesa.numero}</div>
    <div class="mesa-nombre">${mesa.nombre || `Mesa ${mesa.numero}`}</div>
    <div class="mesa-status">${statusText}</div>
    <div class="mesa-mesero">${mesa.mesero_nombre ? `Mesero: ${mesa.mesero_nombre}` : ''}</div>
    ${ocupadoInfo}
    ${sinPedidoInfo}
    ${infoFooter}
    ${puedeLiberar ? `<button class="btn-liberar-rapido" onclick="event.stopPropagation(); liberarMesaRapida(${mesa.id})">Liberar</button>` : ''}
  `;

  if (mesa.estado === 'OCUPADO') {
    card.addEventListener('click', () => {
      if (sinPedido) openMesaModal(mesa);
      else verPedidoExistente(mesa.id);
    });
  } else {
    card.addEventListener('click', () => openMesaModal(mesa));
  }
  return card;
}

function timeSince(date) {
  if (!date || isNaN(date)) return '';
  const seg = Math.floor((Date.now() - date) / 1000);
  if (seg < 60) return `${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

function openMesaModal(mesa) {
  selectedMesa = mesa;
  const modal = document.getElementById('mesaModal');
  const body = document.getElementById('mesaModalBody');

  document.getElementById('mesaModalTitle').textContent = `${mesa.nombre || `Mesa ${mesa.numero}`} - ${mesa.estado}`;

  let html = '';

  if (mesa.estado === 'LIBRE') {
    html = `
      <div class="form-group">
        <label>Acción</label>
        <select id="accionMesa" class="form-control">
          <option value="tomar">Tomar mesa (nuevo pedido)</option>
          <option value="reservar">Reservar mesa</option>
        </select>
      </div>
      <div id="reservarFields" style="display:none;">
        <div class="form-group">
          <label>Nombre del cliente</label>
          <input id="clienteNombre" class="form-control" placeholder="Nombre del cliente">
        </div>
        <div class="form-group">
          <label>Hora de reserva</label>
          <input id="horaReserva" type="time" class="form-control">
        </div>
      </div>
      <div id="tomarFields">
        <div class="form-group">
          <label>Mesero</label>
          <select id="selectMeseroMesa" class="form-control"></select>
        </div>
      </div>
    `;
  } else if (mesa.estado === 'OCUPADO') {
    html = `
      <p><strong>Mesero:</strong> ${mesa.mesero_nombre || 'N/A'}</p>
      <p><strong>Desde:</strong> ${mesa.ocupado_desde ? new Date(mesa.ocupado_desde + 'Z').toLocaleString('es-MX') : 'N/A'}</p>
      <hr style="margin: 12px 0; border-color: #E5E7EB;">
      <button class="btn btn-success btn-block" onclick="closeMesaModal(); verPedidoExistente(${mesa.id})">
        💰 Ver Pedido / Cobrar
      </button>
      ${(currentUser?.rol === 'admin' || currentUser?.id === mesa.mesero_id) ? `
        <button class="btn btn-danger btn-block" onclick="liberarMesa(${mesa.id})" style="margin-top:4px;">
          Liberar Mesa
        </button>
      ` : ''}
    `;
  } else if (mesa.estado === 'RESERVADO') {
    html = `
      <p>Mesa reservada</p>
      <button class="btn btn-success btn-block" onclick="ocuparReservada(${mesa.id})">
        Ocupar mesa ahora
      </button>
      <button class="btn btn-outline btn-block" onclick="liberarMesa(${mesa.id})">
        Cancelar reserva
      </button>
    `;
  } else if (mesa.estado === 'INACTIVO') {
    html = `<p>Mesa fuera de servicio</p>`;
  }

  body.innerHTML = html;
  modal.classList.add('active');

  if (mesa.estado === 'LIBRE') {
    const accionSelect = document.getElementById('accionMesa');
    const reservarFields = document.getElementById('reservarFields');
    const tomarFields = document.getElementById('tomarFields');

    if (accionSelect) {
      accionSelect.addEventListener('change', () => {
        const val = accionSelect.value;
        reservarFields.style.display = val === 'reservar' ? 'block' : 'none';
        tomarFields.style.display = val === 'tomar' ? 'block' : 'none';
      });
    }

    loadMeserosSelect('selectMeseroMesa');
  }
}

function loadMeserosSelect(elementId) {
  const select = document.getElementById(elementId);
  if (!select) return;
  fetch('/api/usuarios')
    .then(r => r.json())
    .then(usuarios => {
      select.innerHTML = '';
      for (const u of usuarios.filter(u => u.rol === 'mesero' || u.rol === 'admin')) {
        select.innerHTML += `<option value="${u.id}">${u.nombre}</option>`;
      }
      if (currentUser) {
        const opt = select.querySelector(`option[value="${currentUser.id}"]`);
        if (opt) opt.selected = true;
      }
    });
}

function closeMesaModal() {
  document.getElementById('mesaModal').classList.remove('active');
  selectedMesa = null;
}

async function confirmarAccionMesa() {
  if (!selectedMesa || !currentUser) return;

  const accion = document.getElementById('accionMesa')?.value || 'tomar';

  try {
    let res;
    if (accion === 'tomar') {
      const meseroId = parseInt(document.getElementById('selectMeseroMesa')?.value) || currentUser.id;
      res = await fetch(`/api/mesas/${selectedMesa.id}/tomar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesero_id: meseroId })
      });
    } else if (accion === 'reservar') {
      const meseroId = currentUser.id;
      const clienteNombre = document.getElementById('clienteNombre')?.value || 'Cliente';
      const hora = document.getElementById('horaReserva')?.value || '';
      res = await fetch(`/api/mesas/${selectedMesa.id}/reservar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesero_id: meseroId, cliente_nombre: clienteNombre, hora })
      });
    }

    if (res.ok) {
      const mesa = await res.json();
      showToast(`Mesa ${mesa.nombre} - ${accion === 'tomar' ? 'Ocupada' : 'Reservada'}`, 'success');
      closeMesaModal();
      await loadMesas();

      if (accion === 'tomar') {
        abrirPOS(mesa.id);
      }
    } else {
      const err = await res.json();
      showToast(err.error || 'Error al procesar', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

async function liberarMesa(mesaId) {  if (!currentUser) return showToast('Debe iniciar sesión', 'error');

  if (!confirm('¿Liberar esta mesa?')) return;

  try {
    const res = await fetch(`/api/mesas/${mesaId}/liberar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesero_id: currentUser.id })
    });

    if (res.ok) {
      showToast('Mesa liberada', 'success');
      closeMesaModal();
      await loadMesas();
    } else {
      const err = await res.json();
      showToast(err.error || 'Error', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

function liberarMesaRapida(mesaId) {
  liberarMesa(mesaId);
}

async function transferirMesa(mesaId) {
  const nuevoId = prompt('ID del nuevo mesero:');
  if (!nuevoId) return;

  try {
    const res = await fetch(`/api/mesas/${mesaId}/transferir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesero_id: currentUser.id, nuevo_mesero_id: parseInt(nuevoId) })
    });

    if (res.ok) {
      showToast('Mesa transferida', 'success');
      closeMesaModal();
      await loadMesas();
    } else {
      const err = await res.json();
      showToast(err.error || 'Error', 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

async function ocuparReservada(mesaId) {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/mesas/${mesaId}/tomar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesero_id: currentUser.id })
    });
    if (res.ok) {
      showToast('Mesa ocupada', 'success');
      closeMesaModal();
      await loadMesas();
    } else {
      const err = await res.json();
      showToast(err.error, 'error');
    }
  } catch (err) {
    showToast('Error de conexión', 'error');
  }
}

// ─── CANALES (DELIVERY / PARA LLEVAR) ───

async function openCanalModal(tipo) {
  canalModalTipo = tipo;
  const esDelivery = tipo === 'DELIVERY';
  document.getElementById('canalModalTitle').textContent = esDelivery ? '🛵 Delivery' : '🥡 Para Llevar';
  document.getElementById('canalPedidosActivos').innerHTML = '<p style="color:var(--gray);font-size:0.85rem;">Cargando pedidos...</p>';
  document.getElementById('canalModal').classList.add('active');

  try {
    const res = await fetch(`/api/pedidos/activos?tipo=${tipo}`);
    const pedidos = await res.json();
    renderPedidosActivos(pedidos);
  } catch (e) {
    document.getElementById('canalPedidosActivos').innerHTML = '<p style="color:var(--red);font-size:0.85rem;">Error al cargar pedidos</p>';
  }
}

function renderPedidosActivos(pedidos) {
  const el = document.getElementById('canalPedidosActivos');
  if (!pedidos || !pedidos.length) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = `
    <h3 style="font-size:0.95rem;margin-bottom:10px;">📋 Pedidos activos (${pedidos.length})</h3>
    ${pedidos.map(p => {
      const total = (p.items || []).reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
      const itemsCount = (p.items || []).reduce((s, i) => s + i.cantidad, 0);
      return `<div class="canal-pedido" onclick="abrirPedidoActivo(${p.mesa_id})">
        <div style="flex:1;">
          <div class="cliente">#${p.id} — <strong>${p.cliente_nombre || 'Cliente'}</strong>
            <span class="badge badge-blue" style="margin-left:6px;">${p.estado}</span>
          </div>
          <div class="detalle">${itemsCount} item(s) · $${total.toFixed(2)}${p.cliente_telefono ? ' · 📞 ' + p.cliente_telefono : ''}${p.cliente_direccion ? ' · 📍 ' + p.cliente_direccion : ''}</div>
        </div>
        <span style="font-size:0.8rem;">Abrir →</span>
      </div>`;
    }).join('')}
  `;
}

function abrirPedidoActivo(mesaId) {
  closeCanalModal();
  verPedidoExistente(mesaId);
}

function closeCanalModal() {
  document.getElementById('canalModal').classList.remove('active');
  canalModalTipo = null;
}

function abrirClienteFormNuevo() {
  const tipo = canalModalTipo;
  closeCanalModal();
  abrirClienteForm(tipo, 'nuevo', null);
}

function abrirClienteForm(tipo, accion, data) {
  clienteModalTipo = tipo;
  clienteModalAccion = accion;

  const esDelivery = tipo === 'DELIVERY';
  document.getElementById('clienteModalTitle').textContent =
    accion === 'editar' ? '✏️ Editar datos del cliente'
    : esDelivery ? '🛵 Nuevo pedido Delivery' : '🥡 Nuevo pedido Para Llevar';

  document.getElementById('cliDireccionGroup').style.display = esDelivery ? 'block' : 'none';
  document.getElementById('cliHoraGroup').style.display = esDelivery ? 'none' : 'block';

  document.getElementById('cliNombre').value = data?.nombre || '';
  document.getElementById('cliTelefono').value = data?.telefono || '';
  document.getElementById('cliDireccion').value = data?.direccion || '';
  document.getElementById('cliHora').value = data?.hora || '';

  document.getElementById('clienteModal').classList.add('active');
}

async function guardarCliente() {
  const nombre = document.getElementById('cliNombre').value.trim();
  if (!nombre) {
    showToast('Ingresa el nombre del cliente', 'warning');
    return;
  }

  const telefono = document.getElementById('cliTelefono').value.trim();
  const direccion = document.getElementById('cliDireccion').value.trim();
  const hora = document.getElementById('cliHora').value;

  if (clienteModalAccion === 'nuevo') {
    // Buscar una mesa virtual LIBRE del canal o crear una nueva
    let mesa = allMesas.find(m => m.es_virtual && m.area_tipo === clienteModalTipo && m.estado === 'LIBRE' && !m.pedido_activo_id);
    if (!mesa) {
      try {
        const res = await fetch('/api/mesas/virtual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: clienteModalTipo })
        });
        if (!res.ok) {
          const err = await res.json();
          showToast(err.error || 'Error al crear mesa virtual', 'error');
          return;
        }
        mesa = await res.json();
      } catch (e) {
        showToast('Error de conexión', 'error');
        return;
      }
    }

    pedidoCliente = {
      nombre,
      telefono,
      direccion: clienteModalTipo === 'DELIVERY' ? direccion : '',
      hora: clienteModalTipo === 'PARA_LLEVAR' ? hora : '',
      tipo: clienteModalTipo
    };

    closeClienteModal();
    abrirPOS(mesa.id);
  } else {
    // Editar cliente de un pedido/mesa virtual actual
    pedidoCliente = {
      nombre,
      telefono,
      direccion: clienteModalTipo === 'DELIVERY' ? direccion : '',
      hora: clienteModalTipo === 'PARA_LLEVAR' ? hora : '',
      tipo: clienteModalTipo
    };

    const pedidoId = posMesaData?.pedido_activo_id;
    if (pedidoId) {
      try {
        await fetch(`/api/pedidos/${pedidoId}/cliente`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente_nombre: nombre,
            cliente_telefono: telefono,
            cliente_direccion: clienteModalTipo === 'DELIVERY' ? direccion : '',
            hora_recogida: clienteModalTipo === 'PARA_LLEVAR' ? hora : ''
          })
        });
      } catch (e) {
        console.error(e);
      }
    }

    closeClienteModal();
    renderPosClienteBar();
  }
}

function closeClienteModal() {
  document.getElementById('clienteModal').classList.remove('active');
  clienteModalTipo = null;
  clienteModalAccion = null;
}

function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();

  document.addEventListener('mesa-updated', () => {
    loadMesas();
  });
});
