let currentUser = null;
let selectedMesa = null;
let pedidoActual = [];

async function initApp() {
  await loadMesas();
  await loadUsuarios();

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
    const mesas = await res.json();
    renderMesas(mesas);
  } catch (err) {
    showToast('Error al cargar mesas', 'error');
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

  grid.innerHTML = '';
  for (const mesa of mesas) {
    const card = document.createElement('div');
    card.className = `mesa-card ${mesa.estado}`;
    card.dataset.id = mesa.id;
    card.innerHTML = `
      <div class="mesa-numero">${mesa.numero}</div>
      <div class="mesa-nombre">${mesa.nombre || `Mesa ${mesa.numero}`}</div>
      <div class="mesa-status">${mesa.estado}</div>
      <div class="mesa-mesero">${mesa.mesero_nombre ? `Mesero: ${mesa.mesero_nombre}` : ''}</div>
    `;
    card.addEventListener('click', () => openMesaModal(mesa));
    grid.appendChild(card);
  }
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
      <button class="btn btn-primary btn-block" onclick="abrirPOS(${mesa.id})">
        Abrir Pedido / POS
      </button>
      ${(currentUser?.rol === 'admin' || currentUser?.id === mesa.mesero_id) ? `
        <button class="btn btn-warning btn-block" onclick="transferirMesa(${mesa.id})">
          Transferir Mesa
        </button>
        <button class="btn btn-danger btn-block" onclick="liberarMesa(${mesa.id})">
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

async function liberarMesa(mesaId) {
  if (!currentUser) return showToast('Debe iniciar sesión', 'error');

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
