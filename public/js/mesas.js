let currentUser = null;
let selectedMesa = null;
let pedidoActual = [];
let allMesas = [];
let areasGlobal = [];
let areaFilter = null;
let canalModalTipo = null;
let clienteModalTipo = null;
let clienteModalAccion = null;
let mesaPendiente = null;
let canalesOcultos = localStorage.getItem('canalesAdminOculto') === '1';

function toggleCanales() {
  canalesOcultos = !canalesOcultos;
  localStorage.setItem('canalesAdminOculto', canalesOcultos ? '1' : '0');
  const el = document.getElementById('canalesRow');
  const btn = document.getElementById('toggleCanalesBtn');
  if (el) el.style.display = canalesOcultos ? 'none' : 'grid';
  if (btn) btn.textContent = canalesOcultos ? '🛵 Mostrar Canales' : '🛵 Ocultar Canales';
}

async function initApp() {
  await loadAreas();
  await loadMesas();
  await loadUsuarios();
  await loadEstadoCajaHeader();

  leerMesaDesdeURL();
  if (mesaPendiente) setTimeout(abrirMesaPendiente, 400);

  const loginScreen = document.getElementById('loginScreen');
  const appContent = document.getElementById('appContent');

  if (currentUser) {
    loginScreen.style.display = 'none';
    appContent.style.display = 'block';
    updateUserInfo();
    loadEstadoCajaHeader();
  }
}

function leerMesaDesdeURL() {
  const params = new URLSearchParams(window.location.search);
  const m = params.get('mesa');
  if (m && !isNaN(parseInt(m))) mesaPendiente = parseInt(m);
}

async function abrirMesaPendiente() {
  if (!mesaPendiente) return;
  if (!currentUser) return;
  const id = mesaPendiente;
  mesaPendiente = null;
  try {
    await verPedidoExistente(id);
  } catch (e) {
    console.error(e);
  }
  if (window.location.search) history.replaceState({}, '', window.location.pathname);
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
  el.style.display = canalesOcultos ? 'none' : 'grid';
  const btn = document.getElementById('toggleCanalesBtn');
  if (btn) btn.textContent = canalesOcultos ? '🛵 Mostrar Canales' : '🛵 Ocultar Canales';

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

    extraInfo = `<div class="mesa-total">S/${total.toFixed(2)}</div>`;
    if (estadoEfectivo === 'PAGADO') {
      statusText = 'PAGADO';
      card.classList.add('PAGADO');
      extraInfo += '<div class="mesa-pagado-icon">💰</div>';
    } else {
      infoFooter = `<div class="mesa-pendiente">Pendiente: S/${pendiente.toFixed(2)}</div>`;
    }
  }

  const esPagado = estadoEfectivo === 'PAGADO';
  const enAtencion = mesa.estado === 'OCUPADO' || mesa.estado === 'CERRANDO';

  const tOcupado = mesa.ocupado_desde ? timeSince(new Date(mesa.ocupado_desde + 'Z')) : '';
  const ocupadoInfo = (tOcupado && enAtencion)
    ? `<div class="mesa-tiempo">⏱ ${tOcupado}</div>` : '';

  let pagoInfo = '';
  if (esPagado && mesa.pagado_desde) {
    pagoInfo = `<div class="mesa-sinpedido">⏱ sin pedido · ${timeSince(new Date(mesa.pagado_desde + 'Z'))}</div>`;
  }

  const sinPedido = !esPagado && mesa.estado === 'OCUPADO' && !mesa.tiene_pedido_activo && mesa.minutos_sin_pedido != null;
  let sinPedidoInfo = '';
  if (sinPedido) {
    sinPedidoInfo = `<div class="mesa-sinpedido">⏱ ${mesa.minutos_sin_pedido} min sin pedido</div>`;
  }

  const puedeLiberar = (sinPedido || esPagado || mesa.estado === 'RESERVADO')
    && (currentUser?.rol === 'admin' || currentUser?.id === mesa.mesero_id);

  card.innerHTML = `
    <div class="info-top">${extraInfo}</div>
    <div class="info-mid">
      <div class="mesa-numero">${mesa.numero}</div>
      <div class="mesa-nombre">${mesa.nombre || `Mesa ${mesa.numero}`}</div>
      <div class="mesa-status">${statusText}</div>
      <div class="mesa-mesero">${mesa.mesero_nombre ? `Mesero: ${mesa.mesero_nombre}` : ''}</div>
      ${ocupadoInfo}
    </div>
    <div class="info-bot">
      ${pagoInfo}
      ${sinPedidoInfo}
      ${infoFooter}
      ${puedeLiberar ? `<button class="btn-liberar-rapido" onclick="event.stopPropagation(); liberarMesaRapida(${mesa.id})">Liberar</button>` : ''}
    </div>
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
      <button class="btn btn-danger btn-block" onclick="liberarMesa(${mesa.id})" style="margin-top:4px;">
        Liberar Mesa
      </button>
    `;
  } else if (mesa.estado === 'RESERVADO') {
    const tienePedido = !!mesa.pedido_activo_id;
    html = `
      <p>Mesa reservada${tienePedido ? ' con pedido en curso' : ''}</p>
      ${tienePedido ? `
        <button class="btn btn-success btn-block" onclick="closeMesaModal(); verPedidoExistente(${mesa.id})">
          💰 Ver Pedido / Cobrar
        </button>
      ` : ''}
      <button class="btn btn-success btn-block" onclick="ocuparReservada(${mesa.id})" ${tienePedido ? 'style="margin-top:4px;"' : ''}>
        Ocupar mesa ahora
      </button>
      <button class="btn btn-danger btn-block" onclick="liberarMesa(${mesa.id})" style="margin-top:4px;">
        Liberar Mesa
      </button>
      <button class="btn btn-outline btn-block" onclick="cancelarReserva(${mesa.id})" style="margin-top:4px;">
        Cancelar reserva
      </button>
    `;
  } else if (mesa.estado === 'INACTIVO') {
    html = `<p>Mesa fuera de servicio</p>`;
  }

  body.innerHTML = html;
  modal.classList.add('active');

  const footer = modal.querySelector('.modal-footer');
  if (footer) footer.style.display = mesa.estado === 'LIBRE' ? '' : 'none';

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

  const mesa = (await fetch('/api/mesas').then(r => r.json()).catch(() => [])).find(m => m.id === mesaId);
  if (mesa && mesa.tiene_pedido_activo) {
    showToast('La mesa tiene un pedido activo. Ábrelo y usa "Anular pedido" o cobra antes de liberar.', 'warning');
    return;
  }

  const ok = await customConfirm({
    title: '¿Liberar Mesa?',
    message: '¿Estás seguro de liberar esta mesa?',
    confirmText: 'Sí, liberar',
    icon: '🪑'
  });
  if (!ok) return;

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

async function cancelarReserva(mesaId) {  if (!currentUser) return showToast('Debe iniciar sesión', 'error');

  const ok = await customConfirm({
    title: '¿Cancelar Reserva?',
    message: '¿Estás seguro de cancelar la reserva de esta mesa?',
    confirmText: 'Sí, cancelar',
    isDanger: true,
    icon: '📅'
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/mesas/${mesaId}/cancelar-reserva`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesero_id: currentUser.id })
    });

    if (res.ok) {
      showToast('Reserva cancelada', 'success');
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

async function transferirMesa(mesaId) {
  const nuevoId = await customPrompt({
    title: 'Transferir Mesa',
    message: 'Ingresa el ID del nuevo mesero asignado:',
    placeholder: 'ID de mesero',
    required: true,
    icon: '👤'
  });
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
          <div class="detalle">${itemsCount} item(s) · S/${total.toFixed(2)}${p.cliente_telefono ? ' · 📞 ' + p.cliente_telefono : ''}${p.cliente_direccion ? ' · 📍 ' + p.cliente_direccion : ''}</div>
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

document.addEventListener('pos-login-done', () => {
  setTimeout(abrirMesaPendiente, 50);
  loadEstadoCajaHeader();
});

// ─── CONTROL RÁPIDO DE CAJA (POS HEADER & MODAL) ───
let sesionCajaActualData = null;

async function loadEstadoCajaHeader() {
  const btns = [
    document.getElementById('btnCajaHeader'),
    document.getElementById('btnCajaHeaderPedido'),
    document.getElementById('btnCajaHeaderPOS')
  ].filter(Boolean);
  if (!btns.length) return;
  try {
    const res = await fetch('/api/admin/caja/sesion-actual');
    const data = await res.json();
    sesionCajaActualData = data;

    btns.forEach(btn => {
      if (data && data.estado === 'ABIERTA') {
        const efectivo = data.efectivo_esperado != null ? data.efectivo_esperado : (data.fondo_inicial || 0);
        btn.style.background = '#ECFDF5';
        btn.style.color = '#065F46';
        btn.style.borderColor = '#A7F3D0';
        btn.innerHTML = `🟢 Caja: <strong>S/${efectivo.toFixed(2)}</strong>`;
        btn.title = `Caja abierta por ${data.usuario_nombre || 'N/A'}. Clic para acciones rápidas`;
      } else {
        btn.style.background = '#FEF3C7';
        btn.style.color = '#92400E';
        btn.style.borderColor = '#FCD34D';
        btn.innerHTML = `⚠️ <strong>Caja Cerrada</strong>`;
        btn.title = 'No hay sesión de caja abierta. Clic para abrir.';
      }
    });
  } catch (e) {
    btns.forEach(btn => btn.innerHTML = `💰 Caja`);
  }
}

async function abrirModalCajaRapida() {
  const modal = document.getElementById('modalCajaRapida');
  const body = document.getElementById('cajaRapidaBody');
  if (!modal || !body) return;

  modal.classList.add('active');
  body.innerHTML = '<p class="empty-state">Consultando estado de caja...</p>';

  try {
    const res = await fetch('/api/admin/caja/sesion-actual');
    const data = await res.json();
    sesionCajaActualData = data;

    if (!data || data.estado !== 'ABIERTA') {
      body.innerHTML = `
        <div style="text-align:center;padding:16px 8px;">
          <div style="font-size:3rem;margin-bottom:8px;">⚠️</div>
          <h3 style="font-size:1.15rem;font-weight:800;color:#92400E;margin-bottom:6px;">No hay caja abierta</h3>
          <p style="font-size:0.88rem;color:#64748B;margin-bottom:18px;">
            Para cobrar pedidos y controlar el flujo de dinero, primero debes abrir la caja.
          </p>
          <a href="/admin.html#caja" class="btn btn-primary btn-block" style="padding:12px;font-size:1rem;text-decoration:none;" onclick="closeModalCajaRapida()">
            🔓 Abrir Caja en Admin
          </a>
        </div>
      `;
      return;
    }

    const s = data;
    const fondo = s.fondo_inicial || 0;
    const ventas = s.total_ventas || 0;
    const ventasEf = s.pagos_efectivo || 0;
    const movTot = s.movimientos_totales || { ingresos: 0, egresos: 0 };
    const esperado = s.efectivo_esperado || 0;
    const apertura = new Date(s.opened_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    let html = `
      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:0.8rem;color:#64748B;">Caja abierta a las <strong>${apertura}</strong> (${s.usuario_nombre || 'N/A'})</span>
          <span class="badge badge-green">ABIERTA</span>
        </div>
        
        <div style="text-align:center;padding:10px 0;background:white;border-radius:10px;border:1px solid #E2E8F0;margin-bottom:10px;">
          <div style="font-size:0.75rem;color:#64748B;font-weight:700;text-transform:uppercase;">Efectivo Actual en Caja</div>
          <div style="font-size:2rem;font-weight:800;color:#059669;">S/${esperado.toFixed(2)}</div>
          <div style="font-size:0.72rem;color:#94A3B8;">Fondo: S/${fondo.toFixed(2)} · Ventas Ef.: +S/${ventasEf.toFixed(2)} · Gastos: -S/${(movTot.egresos || 0).toFixed(2)}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;">
          <div style="background:white;padding:8px 10px;border-radius:8px;border:1px solid #E2E8F0;">
            <div style="color:#64748B;">Ventas Totales:</div>
            <div style="font-weight:800;color:#1E293B;font-size:1rem;">S/${ventas.toFixed(2)}</div>
          </div>
          <div style="background:white;padding:8px 10px;border-radius:8px;border:1px solid #E2E8F0;">
            <div style="color:#64748B;">Pedidos Cobrados:</div>
            <div style="font-weight:800;color:#1E293B;font-size:1rem;">${s.total_pedidos || 0}</div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn btn-outline" style="flex:1;padding:10px;font-weight:700;color:#059669;border-color:#A7F3D0;" onclick="mostrarFormMovimientoRapido('INGRESO')">
          ➕ Ingreso
        </button>
        <button class="btn btn-outline" style="flex:1;padding:10px;font-weight:700;color:#DC2626;border-color:#FECACA;" onclick="mostrarFormMovimientoRapido('EGRESO')">
          ➖ Gasto / Retiro
        </button>
        <button class="btn btn-outline" style="padding:10px;font-weight:700;" onclick="imprimirCorteXRapido()" title="Imprimir Corte X en ticketera">
          🖨️ Corte X
        </button>
      </div>

      <div id="cajaRapidaFormWrap" style="display:none;background:#F1F5F9;border:1px solid #CBD5E1;border-radius:10px;padding:12px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h4 id="movRapidoTitulo" style="margin:0;font-size:0.9rem;font-weight:700;">Registrar Movimiento</h4>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('cajaRapidaFormWrap').style.display='none'" style="padding:1px 6px;">✕</button>
        </div>
        <div class="form-group" style="margin-bottom:8px;">
          <label style="font-size:0.8rem;font-weight:700;">Monto (S/) *</label>
          <input id="movRapidoMonto" type="number" step="0.5" min="0.5" class="form-control" placeholder="0.00" style="font-size:1.1rem;font-weight:700;">
        </div>
        <div class="form-group" style="margin-bottom:8px;">
          <label style="font-size:0.8rem;font-weight:700;">Concepto / Motivo *</label>
          <input id="movRapidoConcepto" class="form-control" placeholder="Ej: Compra de hielo, Insumo urgente, etc.">
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label style="font-size:0.8rem;font-weight:700;">Persona / Destino (opcional)</label>
          <input id="movRapidoPersona" class="form-control" placeholder="Nombre de proveedor / persona">
        </div>
        <input type="hidden" id="movRapidoTipo" value="EGRESO">
        <button id="btnGuardarMovRapido" class="btn btn-primary btn-block" onclick="guardarMovimientoRapido()">
          💾 Guardar Movimiento
        </button>
      </div>
    `;

    body.innerHTML = html;
  } catch (e) {
    body.innerHTML = '<p class="empty-state">Error al conectar con caja</p>';
  }
}

function closeModalCajaRapida() {
  const modal = document.getElementById('modalCajaRapida');
  if (modal) modal.classList.remove('active');
}

function mostrarFormMovimientoRapido(tipo) {
  const wrap = document.getElementById('cajaRapidaFormWrap');
  const tit = document.getElementById('movRapidoTitulo');
  const btn = document.getElementById('btnGuardarMovRapido');
  const hidTipo = document.getElementById('movRapidoTipo');
  if (!wrap || !tit || !btn || !hidTipo) return;

  hidTipo.value = tipo;
  wrap.style.display = 'block';
  if (tipo === 'INGRESO') {
    tit.textContent = '➕ Registrar Ingreso de Dinero';
    tit.style.color = '#059669';
    btn.textContent = '✔ Guardar Ingreso';
    btn.className = 'btn btn-success btn-block';
  } else {
    tit.textContent = '➖ Registrar Gasto / Egreso de Caja';
    tit.style.color = '#DC2626';
    btn.textContent = '✔ Guardar Gasto';
    btn.className = 'btn btn-danger btn-block';
  }
  document.getElementById('movRapidoMonto').focus();
}

async function guardarMovimientoRapido() {
  const tipo = document.getElementById('movRapidoTipo')?.value || 'EGRESO';
  const monto = parseFloat(document.getElementById('movRapidoMonto')?.value || 0);
  const concepto = document.getElementById('movRapidoConcepto')?.value?.trim();
  const persona = document.getElementById('movRapidoPersona')?.value?.trim();

  if (!monto || monto <= 0) return showToast('Ingresa un monto válido mayor a cero', 'warning');
  if (!concepto) return showToast('El concepto o motivo es obligatorio', 'warning');

  try {
    const res = await fetch('/api/admin/caja/movimientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo,
        monto,
        concepto,
        metodo_pago: 'efectivo',
        persona: persona || null,
        usuario_id: currentUser ? currentUser.id : null
      })
    });

    if (res.ok) {
      showToast(`${tipo === 'INGRESO' ? 'Ingreso' : 'Gasto'} de S/${monto.toFixed(2)} registrado`, 'success');
      await loadEstadoCajaHeader();
      await abrirModalCajaRapida();
    } else {
      const err = await res.json();
      showToast(err.error || 'Error al registrar movimiento', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

async function imprimirCorteXRapido() {
  try {
    const res = await fetch('/api/admin/caja/corte-x/imprimir', { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      showToast('🖨️ Ticket Corte X (Parcial) emitido', 'success');
    } else {
      showToast(d.error || 'Error al imprimir', 'warning');
    }
  } catch (e) {
    showToast('Error de conexión con impresora', 'error');
  }
}

if (typeof socket !== 'undefined' && socket) {
  socket.on('caja:updated', () => {
    loadEstadoCajaHeader();
  });
}
