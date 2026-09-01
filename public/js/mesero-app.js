    // ---- GLOBALS ----
    let currentUser = null;
    let posMesaId = null;
    let posMesaData = null;
    let canalesOcultos = false;
    let canalesStorageKey = 'posCanalesOcultos';
    let categorias = [];
    let productos = [];
    let pedidoItems = [];
    let categoriaActiva = null;
    let noteItemIndex = -1;
    let pinBuffer = '';
    let allMesas = [];
    let areasGlobal = [];
    let areaFilter = null;
    let pedidoCliente = null;
    let canalModalTipo = null;
    let clienteModalTipo = null;
    let clienteModalAccion = null;
    let avisosSinPedido = {};
    let pedidoActivoItems = [];
    let actividadDestino = null;
    let mesaDestinoElegida = null;
    let moverSeleccion = new Set();

    // ---- SOCKET ----
    const socket = io();
    socket.on('connect', () => console.log('Conectado'));
    socket.on('mesa:updated', () => loadMesas());
    socket.on('stock:actualizado', (data) => {
      if (typeof productos !== 'undefined' && Array.isArray(productos)) {
        const p = productos.find(x => x.id === data.producto_id);
        if (p) {
          p.controlar_stock = data.controlar_stock;
          p.stock_actual = data.stock_actual;
          p.stock_minimo = data.stock_minimo;
          renderProductos();
        }
      }
    });

    // ---- LOGIN ----
    function pressPin(n) { pinBuffer += n; document.getElementById('pinDisplay').value = pinBuffer; }
    function clearPin() { pinBuffer = ''; document.getElementById('pinDisplay').value = ''; document.getElementById('loginError').textContent = ''; }
    async function submitPin() {
      if (!pinBuffer) return;
      try {
        const res = await fetch('/api/usuarios/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: pinBuffer })
        });
        if (res.ok) {
          currentUser = await res.json();
          if (currentUser.rol !== 'mesero' && currentUser.rol !== 'admin') {
            document.getElementById('loginError').textContent = 'Este PIN no es de mesero';
            clearPin(); return;
          }
          localStorage.setItem('posUser', JSON.stringify(currentUser));
          document.getElementById('loginScreen').style.display = 'none';
          document.getElementById('appContent').style.display = 'block';
          document.getElementById('userBadge').textContent = currentUser.nombre;
          await initApp();
        } else {
          const err = await res.json();
          document.getElementById('loginError').textContent = err.error || 'PIN incorrecto';
          clearPin();
        }
      } catch (e) {
        document.getElementById('loginError').textContent = 'Error de conexión';
        clearPin();
      }
    }
    function logout() {
      currentUser = null; localStorage.removeItem('posUser');
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('appContent').style.display = 'none'; clearPin();
    }

    // ---- APP ----
    async function initApp() {
      canalesStorageKey = 'posCanalesOcultos_' + (currentUser?.id || 'anon');
      canalesOcultos = localStorage.getItem(canalesStorageKey) === '1';
      const esAdmin = currentUser && currentUser.rol === 'admin';
      document.getElementById('adminLink').style.display = esAdmin ? '' : 'none';
      await loadAreas();
      await Promise.all([loadMesas(), loadCategorias(), loadProductos()]);
    }

    async function loadMesas() {
      try {
        const res = await fetch('/api/mesas');
        allMesas = await res.json();
        renderCanales(allMesas);
        renderMesas(allMesas);
        avisarMesasSinPedido();
        document.getElementById('mesasCount').textContent = allMesas.filter(m => !m.es_virtual).length;
        document.getElementById('ocupadasCount').textContent = allMesas.filter(m => (m.estado === 'OCUPADO' || m.estado === 'CERRANDO') && !m.es_virtual).length;
      } catch (e) { console.error(e); }
    }

    async function loadAreas() {
      try {
        const r = await fetch('/api/mesas/areas');
        areasGlobal = await r.json();
        renderAreaFilter();
      } catch (e) { console.error(e); }
    }

    function renderAreaFilter() {
      const el = document.getElementById('areaFilter');
      if (!el) return;
      const salones = areasGlobal.filter(a => a.tipo === 'SALON' && a.activo);
      const chip = (label, id) => {
        const b = document.createElement('button');
        b.className = `area-chip-mesero${areaFilter === id ? ' active' : ''}`;
        b.textContent = label;
        b.onclick = () => { areaFilter = id; renderAreaFilter(); renderMesas(allMesas); };
        return b;
      };
      el.innerHTML = '';
      el.appendChild(chip('Todas', null));
      for (const a of salones) el.appendChild(chip(a.nombre, a.id));
    }

    function renderCanales(mesas) {
      const el = document.getElementById('canalesRow');
      const btn = document.getElementById('toggleCanalesBtn');
      if (!el) return;
      const tipos = [
        { tipo: 'DELIVERY', icono: '🛵', label: 'Delivery', color: '#3B82F6', sub: 'A domicilio' },
        { tipo: 'PARA_LLEVAR', icono: '🥡', label: 'Para Llevar', color: '#F59E0B', sub: 'Para recoger' }
      ];
      el.innerHTML = '';
      let hayCanales = false;
      for (const t of tipos) {
        const hayArea = areasGlobal.some(a => a.tipo === t.tipo && a.activo);
        if (!hayArea) continue;
        hayCanales = true;
        const activas = mesas.filter(m => m.es_virtual && m.area_tipo === t.tipo && m.pedido_activo_id).length;
        const card = document.createElement('div');
        card.className = 'canal-card-mesero';
        card.style.setProperty('--canal', t.color);
        card.innerHTML = `
          <div class="icon">${t.icono}</div>
          <div class="label">${t.label}</div>
          <div class="badge">${activas} activo${activas !== 1 ? 's' : ''}</div>
          <div class="sub">Nuevo pedido ${t.sub}</div>
        `;
        card.onclick = () => openCanalModal(t.tipo);
        el.appendChild(card);
      }
      if (btn) btn.style.display = hayCanales ? 'inline-block' : 'none';
      el.style.display = canalesOcultos ? 'none' : 'grid';
      if (btn) btn.textContent = canalesOcultos ? '🛵 Ver canales' : '🛵 Canales';
    }

    function toggleCanales() {
      canalesOcultos = !canalesOcultos;
      localStorage.setItem(canalesStorageKey, canalesOcultos ? '1' : '0');
      const el = document.getElementById('canalesRow');
      const btn = document.getElementById('toggleCanalesBtn');
      if (el) el.style.display = canalesOcultos ? 'none' : 'grid';
      if (btn) btn.textContent = canalesOcultos ? '🛵 Ver canales' : '🛵 Canales';
    }

    function renderMesas(mesas) {
      const grid = document.getElementById('mesasGrid');
      grid.innerHTML = '';

      const fisicas = mesas.filter(m => !m.es_virtual);
      let filtered = areaFilter ? fisicas.filter(m => m.area_id === areaFilter) : fisicas;

      if (!filtered.length) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:24px;color:#6B7280;">No hay mesas en esta área</p>';
        return;
      }

      const grupos = {};
      for (const m of filtered) {
        const key = m.area_id || 'sin';
        if (!grupos[key]) grupos[key] = { nombre: m.area_nombre || 'Sin área', mesas: [] };
        grupos[key].mesas.push(m);
      }

      for (const key of Object.keys(grupos)) {
        const g = grupos[key];
        const header = document.createElement('div');
        header.className = 'area-header-mesero';
        header.innerHTML = `${g.nombre} <span class="count">${g.mesas.length}</span>`;
        grid.appendChild(header);

        for (const m of g.mesas) {
          const card = document.createElement('div');
          const estadoEfectivo = m.estado_ejefe || m.estado;
          card.className = `mesa-card-mesero ${estadoEfectivo}`;
          card.dataset.id = m.id;

          let totalHtml = '';
          let pendienteHtml = '';
          if (m.pedido_total != null && (m.estado === 'OCUPADO' || m.estado === 'CERRANDO')) {
            const pendiente = Math.max(0, m.pedido_total - (m.pedido_pagado || 0) - (m.pedido_descuento || 0));
            totalHtml = `<div class="total">S/${m.pedido_total.toFixed(2)}</div>`;
            if (estadoEfectivo !== 'PAGADO') {
              pendienteHtml = `<div class="pendiente">Pendiente: S/${pendiente.toFixed(2)}</div>`;
            }
          }

          const esPagado = estadoEfectivo === 'PAGADO';
          const enAtencion = m.estado === 'OCUPADO' || m.estado === 'CERRANDO';

          const tOcupado = m.ocupado_desde ? timeSince(new Date(m.ocupado_desde + 'Z')) : '';
          const tiempoHtml = (tOcupado && enAtencion)
            ? `<div class="tiempo">⏱ ${tOcupado}</div>` : '';

          let pagoHtml = '';
          if (esPagado && m.pagado_desde) {
            pagoHtml = `<div class="tiempo sinpedido">⏱ sin pedido · ${timeSince(new Date(m.pagado_desde + 'Z'))}</div>`;
          }

          const sinPedido = !esPagado && m.estado === 'OCUPADO' && !m.tiene_pedido_activo && m.minutos_sin_pedido != null;
          let sinPedidoHtml = '';
          if (sinPedido) {
            sinPedidoHtml = `<div class="tiempo sinpedido">⏱ ${m.minutos_sin_pedido} min sin pedido</div>`;
            if (currentUser && (currentUser.rol === 'admin' || currentUser.id === m.mesero_id)) {
              sinPedidoHtml += `<button class="liberar-rapido" onclick="event.stopPropagation(); liberarMesaRapida(${m.id})">Liberar</button>`;
            }
          }

          card.innerHTML = `
            <div class="info-top">${totalHtml}</div>
            <div class="info-mid">
              <div class="num">${m.numero}</div>
              <div class="status">${estadoEfectivo}</div>
              <div class="mesero-name">${m.mesero_nombre || ''}</div>
              ${tiempoHtml}
            </div>
            <div class="info-bot">
              ${pagoHtml}
              ${sinPedidoHtml}
              ${pendienteHtml}
            </div>
          `;
          card.addEventListener('click', () => abrirPOS(m));
          grid.appendChild(card);
        }
      }
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

    async function liberarMesaRapida(mesaId) {
      if (!currentUser) return;
      const ok = await customConfirm({
        title: '¿Liberar Mesa?',
        message: 'Esta mesa está ocupada sin pedido. ¿Deseas liberarla?',
        confirmText: 'Sí, liberar',
        icon: '🪑'
      });
      if (!ok) return;
      try {
        const r = await fetch(`/api/mesas/${mesaId}/liberar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesero_id: currentUser.id })
        });
        if (r.ok) {
          toast('Mesa liberada', 'ok');
          loadMesas();
        } else {
          const e = await r.json();
          toast(e.error || 'Error', 'err');
        }
      } catch (e) {
        toast('Error de conexión', 'err');
      }
    }

    async function anularPedidoMesero() {
      if (!posMesaData?.pedido_activo_id || !currentUser) return;
      if (currentUser.rol !== 'admin' && currentUser.rol !== 'cajero') {
        toast('Solo el administrador o el cajero pueden anular pedidos', 'err');
        return;
      }
      const motivo = await customPrompt({
        title: `Anular Pedido #${posMesaData.pedido_activo_id}`,
        message: 'Motivo para anular el pedido (requerido):',
        placeholder: 'Ej. Error en comanda',
        required: true,
        icon: '🗑️'
      });
      if (!motivo || !motivo.trim()) {
        toast('El motivo es requerido para anular el pedido', 'err');
        return;
      }
      try {
        const r = await fetch(`/api/admin/pedidos/${posMesaData.pedido_activo_id}/anular`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: motivo.trim(), usuario_id: currentUser.id })
        });
        const d = await r.json();
        if (r.ok && d.ok) {
          toast('Pedido anulado y mesa liberada', 'ok');
          showMesasView();
        } else {
          toast(d.error || 'Error al anular el pedido', 'err');
        }
      } catch (e) {
        toast('Error de conexión', 'err');
      }
    }

    async function liberarMesaMesero() {
      if (!posMesaData || !currentUser) return;
      if (posMesaData.pedido_activo_id) {
        const puedeAnular = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'cajero');
        if (puedeAnular) {
          const okAnular = await customConfirm({
            title: 'Mesa con Pedido Activo',
            message: 'Esta mesa tiene un pedido activo. Para liberarla se debe anular el pedido.\n\n¿Deseas anular el pedido y liberar la mesa?',
            isDanger: true,
            confirmText: 'Anular y Liberar'
          });
          if (okAnular) {
            anularPedidoMesero();
          }
        } else {
          toast('No se puede liberar: la mesa tiene un pedido activo. Solo admin o cajero puede anularlo.', 'err');
        }
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
        const r = await fetch(`/api/mesas/${posMesaData.id}/liberar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesero_id: currentUser.id })
        });
        if (r.ok) {
          toast('Mesa liberada', 'ok');
          showMesasView();
        } else {
          const e = await r.json();
          toast(e.error || 'Error', 'err');
        }
      } catch (e) {
        toast('Error de conexión', 'err');
      }
    }
    function toast(msg, tipo) {
      if (tipo === 'success') tipo = 'ok';
      if (tipo === 'warning') tipo = 'warn';
      if (tipo === 'error') tipo = 'err';
      const el = document.createElement('div');
      el.className = `toast-mesero ${tipo}`;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(() => el.remove(), 300);
      }, 2000);
    }

    function avisarMesasSinPedido() {
      if (!allMesas) return;
      avisosSinPedido = avisosSinPedido || {};
      for (const m of allMesas) {
        if (m.estado === 'OCUPADO' && !m.tiene_pedido_activo && m.minutos_sin_pedido != null && m.minutos_sin_pedido >= 15) {
          const nivel = Math.floor(m.minutos_sin_pedido / 15);
          if ((avisosSinPedido[m.id] || 0) < nivel) {
            avisosSinPedido[m.id] = nivel;
            toast(`Mesa ${m.numero} lleva ${m.minutos_sin_pedido} min sin pedido`, 'warn');
          }
        }
      }
    }

    // ---- PAGO QR MESERO ----
    let currentQrPedidoId = null;
    let currentQrMonto = 0;

    function openQrPagoModal(mesaId, pedidoId, pendiente) {
      currentQrPedidoId = pedidoId;
      currentQrMonto = pendiente;
      document.getElementById('qrMontoTotal').textContent = `S/${pendiente.toFixed(2)}`;
      document.getElementById('qrCodigoAprobacion').value = '';
      document.getElementById('qrPagoModal').classList.add('active');
    }

    function closeQrPagoModal() {
      document.getElementById('qrPagoModal').classList.remove('active');
      currentQrPedidoId = null;
    }

    async function confirmarPagoQr() {
      const codigo = document.getElementById('qrCodigoAprobacion').value.trim();
      if (!codigo) {
        toast('Debes ingresar el código de aprobación / referencia.', 'warn');
        return;
      }

      try {
        const res = await fetch(`/api/pedidos/${currentQrPedidoId}/pagar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metodo: 'yape',
            monto: currentQrMonto,
            referencia: codigo,
            usuario_id: currentUser ? currentUser.id : null,
            notas: 'Pago desde vista Mesero'
          })
        });

        const result = await res.json();

        if (!res.ok) {
          throw new Error(result.error || 'Error al procesar el pago.');
        }

        toast('✅ Pago registrado correctamente.', 'ok');
        closeQrPagoModal();
        await loadMesas();
        const mesaRow = allMesas.find(m => m.id === posMesaId);
        if (mesaRow) {
          abrirPOS(mesaRow);
        } else {
          showMesasView();
        }
      } catch (err) {
        alert(err.message);
      }
    }

    // ---- CANALES / CLIENTE ----
    async function openCanalModal(tipo) {
      canalModalTipo = tipo;
      const esDelivery = tipo === 'DELIVERY';
      document.getElementById('canalModalTitle').textContent = esDelivery ? '🛵 Delivery' : '🥡 Para Llevar';
      document.getElementById('canalPedidosActivos').innerHTML = '<p style="color:#6B7280;font-size:0.8rem;">Cargando pedidos...</p>';
      document.getElementById('canalModal').classList.add('active');

      try {
        const res = await fetch(`/api/pedidos/activos?tipo=${tipo}`);
        const pedidos = await res.json();
        renderPedidosActivos(pedidos);
      } catch (e) {
        document.getElementById('canalPedidosActivos').innerHTML = '<p style="color:#DC2626;font-size:0.8rem;">Error al cargar</p>';
      }
    }

    function renderPedidosActivos(pedidos) {
      const el = document.getElementById('canalPedidosActivos');
      if (!pedidos || !pedidos.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px 12px;color:var(--text-muted);background:var(--bg-main);border-radius:var(--radius-md);margin-bottom:12px;font-size:0.88rem;border:1px dashed var(--border);">No hay pedidos activos en este canal</div>';
        return;
      }
      el.innerHTML = `
        <div style="font-family:var(--font-display);font-size:0.85rem;font-weight:800;color:var(--text-dark);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.04em;">📋 Pedidos activos (${pedidos.length})</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
        ${pedidos.map(p => {
        const total = (p.items || []).reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
        const itemsCount = (p.items || []).reduce((s, i) => s + i.cantidad, 0);
        return `<div class="canal-pedido-mesero" onclick="abrirPedidoActivo(${p.mesa_id})" style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;box-shadow:var(--shadow-xs);transition:all 0.15s var(--ease-out);">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                <span style="font-family:var(--font-display);font-weight:800;font-size:0.95rem;color:var(--primary);">#${p.id}</span>
                <strong style="font-size:0.9rem;color:var(--text-dark);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.cliente_nombre || 'Cliente sin nombre'}</strong>
                <span class="badge badge-info" style="font-size:0.65rem;padding:2px 8px;border-radius:var(--radius-full);">${p.estado}</span>
              </div>
              <div class="det" style="font-size:0.78rem;color:var(--text-muted);line-height:1.4;">
                ${itemsCount} item(s) ${p.cliente_telefono ? ' · 📞 ' + p.cliente_telefono : ''}${p.cliente_direccion ? ' · 📍 ' + p.cliente_direccion : ''}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-family:var(--font-display);font-size:1.05rem;font-weight:800;color:var(--primary);">S/${total.toFixed(2)}</div>
              <span style="font-size:0.75rem;font-weight:700;color:var(--primary);display:inline-flex;align-items:center;gap:2px;">Abrir →</span>
            </div>
          </div>`;
      }).join('')}
        </div>
      `;
    }

    async function abrirPedidoActivo(mesaId) {
      closeCanalModal();
      try {
        const res = await fetch(`/api/mesas/${mesaId}`);
        const mesa = await res.json();
        if (mesa.es_virtual && mesa.pedido_activo_id) {
          const pr = await fetch(`/api/pedidos/${mesa.pedido_activo_id}`);
          const pedido = await pr.json();
          pedidoCliente = {
            nombre: pedido.cliente_nombre || '', telefono: pedido.cliente_telefono || '',
            direccion: pedido.cliente_direccion || '', hora: pedido.hora_recogida || '',
            tipo: mesa.area_tipo
          };
        }
        abrirPOS(mesa);
        loadMesas();
      } catch (e) { alert('Error'); }
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
      if (!nombre) { alert('Ingresa el nombre del cliente'); return; }
      const telefono = document.getElementById('cliTelefono').value.trim();
      const direccion = document.getElementById('cliDireccion').value.trim();
      const hora = document.getElementById('cliHora').value;

      if (clienteModalAccion === 'nuevo') {
        let mesa = allMesas.find(m => m.es_virtual && m.area_tipo === clienteModalTipo && m.estado === 'LIBRE' && !m.pedido_activo_id);
        if (!mesa) {
          try {
            const res = await fetch('/api/mesas/virtual', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tipo: clienteModalTipo })
            });
            if (!res.ok) { alert('Error al crear mesa virtual'); return; }
            mesa = await res.json();
          } catch (e) { alert('Error de conexión'); return; }
        }

        pedidoCliente = {
          nombre, telefono,
          direccion: clienteModalTipo === 'DELIVERY' ? direccion : '',
          hora: clienteModalTipo === 'PARA_LLEVAR' ? hora : '',
          tipo: clienteModalTipo
        };

        closeClienteModal();
        abrirPOS(mesa);
      } else {
        pedidoCliente = {
          nombre, telefono,
          direccion: clienteModalTipo === 'DELIVERY' ? direccion : '',
          hora: clienteModalTipo === 'PARA_LLEVAR' ? hora : '',
          tipo: clienteModalTipo
        };
        const pedidoId = posMesaData?.pedido_activo_id;
        if (pedidoId) {
          try {
            await fetch(`/api/pedidos/${pedidoId}/cliente`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cliente_nombre: nombre, cliente_telefono: telefono,
                cliente_direccion: clienteModalTipo === 'DELIVERY' ? direccion : '',
                hora_recogida: clienteModalTipo === 'PARA_LLEVAR' ? hora : ''
              })
            });
          } catch (e) { console.error(e); }
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

    function renderPosClienteBar() {
      const bar = document.getElementById('posClienteBar');
      if (!bar) return;
      const isVirtual = posMesaData && posMesaData.es_virtual;
      if (!isVirtual) { bar.style.display = 'none'; return; }
      bar.style.display = 'block';
      if (pedidoCliente && pedidoCliente.nombre) {
        const tipo = pedidoCliente.tipo === 'DELIVERY' ? '🛵 Delivery' : '🥡 Para Llevar';
        let txt = `${tipo} · <strong>${pedidoCliente.nombre}</strong>`;
        if (pedidoCliente.telefono) txt += ` · 📞 ${pedidoCliente.telefono}`;
        if (pedidoCliente.direccion) txt += ` · 📍 ${pedidoCliente.direccion}`;
        if (pedidoCliente.hora) txt += ` · 🕐 ${pedidoCliente.hora}`;
        bar.innerHTML = txt + ` <button style="border:1px solid #93C5FD;background:white;color:#1E40AF;border-radius:8px;padding:2px 8px;font-size:0.75rem;cursor:pointer;" onclick="editarCliente()">✏️ Editar</button>`;
      } else {
        bar.innerHTML = '🧑‍🤝‍🧑 Sin datos de cliente <button style="border:1px solid #93C5FD;background:white;color:#1E40AF;border-radius:8px;padding:2px 8px;font-size:0.75rem;cursor:pointer;" onclick="editarCliente()">✏️ Ingresar</button>';
      }
    }

    function editarCliente() {
      const tipo = posMesaData?.area_tipo === 'DELIVERY' ? 'DELIVERY' : 'PARA_LLEVAR';
      abrirClienteForm(tipo, 'editar', pedidoCliente);
    }

    async function loadCategorias() {
      try { const r = await fetch('/api/productos/categorias'); categorias = await r.json(); } catch (e) { }
    }

    async function loadProductos() {
      try { const r = await fetch('/api/productos'); productos = await r.json(); } catch (e) { }
    }

    // ---- POS FLOW ----
    async function abrirPOS(mesa) {
      posMesaId = mesa.id;
      posMesaData = mesa;

      const headerMesero = document.querySelector('.header-mesero');
      if (headerMesero) headerMesero.style.display = 'none';
      document.getElementById('mesasView').style.display = 'none';
      document.getElementById('posView').style.display = 'flex';
      document.getElementById('posTableName').textContent = mesa.nombre || `Mesa ${mesa.numero}`;
      document.getElementById('posTableStatus').textContent = mesa.estado + (mesa.mesero_nombre ? ` · ${mesa.mesero_nombre}` : '');
      const searchInput = document.getElementById('searchProductosInput');
      if (searchInput) searchInput.value = '';
      renderPosClienteBar();



      const resumenView = document.getElementById('mesaResumenView');
      const resumenPedido = document.getElementById('mesaResumenPedido');
      const orderSection = document.getElementById('orderSection');
      const cartBar = document.getElementById('cartBar');
      const actionBar = document.getElementById('mesaActionBar');
      const btnActionYape = document.getElementById('btnActionYape');
      const btnActionPrecuenta = document.getElementById('btnActionPrecuenta');
      const masOpcionesBody = document.getElementById('masOpcionesBody');

      let existingOrderHtml = '';
      pedidoActivoItems = [];

      if (mesa.estado === 'LIBRE') {
        resumenPedido.innerHTML = `
          <div style="text-align:center; padding:40px 20px;">
            <p style="font-size:1.1rem; color:#64748b; margin-bottom:15px;">La mesa está libre</p>
            <p style="font-size:0.95rem; color:#94a3b8;">Agrega productos para ocuparla y empezar a atender.</p>
          </div>
        `;
        actionBar.style.display = 'none';
        masOpcionesBody.innerHTML = '';
        mostrarCatalogo();
        return;
      }

      if (mesa.pedido_activo_id) {
        try {
          const res = await fetch(`/api/pedidos/${mesa.pedido_activo_id}`);
          if (res.ok) {
            const pedido = await res.json();
            pedidoActivoItems = (pedido.items || []).filter(i => i.estado !== 'CANCELADO');
            if (pedidoActivoItems.length > 0) {
              const itemsList = pedidoActivoItems.map((i, idx) => {
                const sub = i.cantidad * (i.precio_unitario + (i.precio_adicional || 0));
                const pNameLower = i.producto_nombre.toLowerCase();
                const vNameLower = i.variante_nombre ? i.variante_nombre.toLowerCase() : '';
                
                let finalDetalle = '';
                if (i.detalle) {
                   let parts = i.detalle.split('·').map(p => p.trim()).filter(Boolean);
                   parts = parts.filter(p => {
                       const pLow = p.toLowerCase();
                       if (pLow === vNameLower && pNameLower.includes(vNameLower)) return false;
                       return true;
                   });
                   parts = [...new Set(parts)];
                   finalDetalle = parts.join(' · ');
                }

                let dets = '';
                if (i.variante_nombre && !pNameLower.includes(vNameLower)) {
                   if (!finalDetalle.toLowerCase().includes(vNameLower)) {
                      dets += ` <span style="color:#64748b; font-size:0.85rem;">(${i.variante_nombre})</span>`;
                   }
                }
                
                if (finalDetalle) {
                   dets += ` <div style="color:#64748b; font-size:0.8rem; margin-top:2px; line-height:1.2;">${finalDetalle}</div>`;
                }
                if (i.notas) {
                   dets += ` <div style="color:#64748b; font-size:0.8rem; margin-top:2px; line-height:1.2; font-style:italic;">📝 ${i.notas}</div>`;
                }
                
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #F1F5F9;">
                  <div style="flex:1; padding-right:8px;">
                    <div style="font-size:0.95rem; font-weight:500; color:#1E293B;">
                      ${i.cantidad}x ${i.producto_nombre} 
                      <span style="font-weight:normal; color:#64748b; font-size:0.85rem; white-space:nowrap;">(S/${(i.precio_unitario + (i.precio_adicional||0)).toFixed(2)} c/u)</span>
                    </div>
                    ${dets ? `<div style="margin-top:2px;">${dets}</div>` : ''}
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-weight:600; color:#334155; font-size:0.95rem;">S/${sub.toFixed(2)}</span>
                    <button onclick="abrirOpcionesItem(${i.id}, ${i.cantidad}, ${i.precio_unitario}, ${i.precio_adicional || 0}, '${i.producto_nombre.replace(/'/g, "\\'")}')" style="background:transparent; border:none; color:#64748b; font-size:1.2rem; cursor:pointer; padding:4px 8px;">⋮</button>
                  </div>
                </div>`;
              }).join('');

              const totalPedido = pedido.items.reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
              existingOrderHtml = `
                <div style="background:white; border:1px solid #E2E8F0; border-radius:12px; padding:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                  <div style="font-weight:700; font-size:1rem; color:#334155; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #E2E8F0; padding-bottom:6px;">
                    <span>📋 Pedido actual <span style="font-weight:normal; color:#64748b; font-size:0.85rem; display:block; margin-top:2px;">Atiende: ${pedido.mesero_nombre || mesa.mesero_nombre || 'N/A'}</span></span>
                    <span style="color:#059669; font-size:1.2rem;">S/${totalPedido.toFixed(2)}</span>
                  </div>
                  <div>${itemsList}</div>
                </div>
              `;
            } else {
              existingOrderHtml = '<p style="color:#64748b; text-align:center; padding:20px;">No hay ítems activos en este pedido.</p>';
            }
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        existingOrderHtml = '<p style="color:#64748b; text-align:center; padding:20px;">No hay pedido activo.</p>';
      }

      resumenPedido.innerHTML = existingOrderHtml;

      // Configurar ActionBar y Más opciones
      const estadoEfectivo = mesa.estado_ejefe || mesa.estado;
      let pendiente = 0;
      if (mesa.pedido_activo_id && pedidoActivoItems.length > 0 && estadoEfectivo !== 'PAGADO') {
        const pTotal = mesa.pedido_total || 0;
        const pPagado = 0;
        const pDescuento = mesa.pedido_descuento || 0;
        pendiente = Math.max(0, pTotal - pPagado - pDescuento);
      }

      // Yape Btn
      if (pendiente > 0) {
        btnActionYape.style.display = 'block';
        btnActionYape.dataset.pendiente = pendiente;
      } else {
        btnActionYape.style.display = 'none';
      }

      // Precuenta Btn
      btnActionPrecuenta.style.display = mesa.pedido_activo_id ? 'block' : 'none';

      // Más Opciones Modal
      const puedeAnular = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'cajero');
      masOpcionesBody.innerHTML = `
        ${pedidoActivoItems.length > 0 ? `
          <button class="btn btn-outline" style="padding:14px; font-size:1rem; font-weight:600;" onclick="closeMasOpcionesModal(); abrirMoverPedido()">↔️ Mover a otra mesa</button>
          <button class="btn btn-outline" style="padding:14px; font-size:1rem; font-weight:600;" onclick="closeMasOpcionesModal(); abrirUnirMesa()">🔗 Unir con mesa</button>
        ` : ''}
        ${mesa.estado === 'RESERVADO' ? `<button class="btn btn-primary" style="padding:14px; font-size:1rem; font-weight:600;" onclick="closeMasOpcionesModal(); ocuparMesa(${mesa.id})">✅ Ocupar ahora</button>` : ''}
        <button class="btn btn-outline" style="padding:14px; font-size:1rem; font-weight:600;" onclick="closeMasOpcionesModal(); liberarMesaMesero()">🚪 Liberar mesa</button>
        ${(mesa.pedido_activo_id && puedeAnular) ? `
          <button class="btn btn-outline" style="padding:14px; font-size:1rem; font-weight:600; color:#DC2626; border-color:#FCA5A5;" onclick="closeMasOpcionesModal(); anularPedidoMesero()">🚫 Anular pedido</button>
        ` : ''}
      `;

      mostrarResumen();
    }

    function mostrarResumen() {
      document.getElementById('mesaResumenView').style.display = 'flex';
      document.getElementById('mesaActionBar').style.display = 'flex';
      document.getElementById('orderSection').style.display = 'none';
      document.getElementById('cartBar').style.display = 'none';
    }

    function mostrarCatalogo(focusSearch = false) {
      pedidoItems = []; // Limpiar carrito nuevo
      renderCart();
      document.getElementById('mesaResumenView').style.display = 'none';
      document.getElementById('mesaActionBar').style.display = 'none';
      document.getElementById('orderSection').style.display = 'flex';
      renderCategoriaTabs();
      renderProductos();
      document.getElementById('cartBar').style.display = 'block';

      if (focusSearch) {
        setTimeout(() => document.getElementById('searchProductosInput').focus(), 100);
      }
    }

    function ocultarCatalogo() {
      if (posMesaData && posMesaData.estado === 'LIBRE') {
        showMesasView(); // Si estaba libre y se arrepintió, vuelve a mesas
      } else {
        mostrarResumen();
      }
    }

    function accionCobrarYape() {
      const btn = document.getElementById('btnActionYape');
      const pendiente = parseFloat(btn.dataset.pendiente || 0);
      openQrPagoModal(posMesaId, posMesaData.pedido_activo_id, pendiente);
    }

    function abrirMasOpciones() {
      document.getElementById('masOpcionesModal').classList.add('active');
    }
    function closeMasOpcionesModal() {
      document.getElementById('masOpcionesModal').classList.remove('active');
    }

    function abrirOpcionesItem(itemId, cantidadActual, precioOriginal, precioAdicional, nombre) {
      document.getElementById('opcionesItemTitle').textContent = `Opciones: ${nombre}`;

      const puedeEditar = currentUser && (currentUser.rol === 'admin' || currentUser.rol === 'cajero');

      let html = '';
      if (!puedeEditar) {
        html = `
          <div style="background:#FEF2F2; border:1px solid #FECACA; padding:12px; border-radius:8px; color:#DC2626; font-size:0.9rem; margin-bottom:10px;">
            ⚠️ Solo administradores o cajeros pueden editar precios o eliminar ítems de un pedido enviado.
          </div>
        `;
      }

      html += `
        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:0.9rem; font-weight:600; color:#475569; margin-bottom:6px;">Cantidad Actual: ${cantidadActual}</label>
          <label style="display:block; font-size:0.9rem; font-weight:600; color:#475569; margin-bottom:6px;">Precio Original: S/${precioOriginal.toFixed(2)}</label>
          <label style="display:block; font-size:0.9rem; font-weight:600; color:#475569; margin-bottom:6px;">Ajuste (Adicional/Descuento)</label>
          <input type="number" id="itemPrecioAdicional" class="form-control" value="${precioAdicional}" step="0.5" ${!puedeEditar ? 'disabled' : ''}>
          <p style="font-size:0.8rem; color:#64748b; margin-top:4px;">Usa valores negativos para descuentos (ej. -5).</p>
        </div>
      `;

      if (puedeEditar) {
        html += `
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button class="btn btn-outline" style="flex:1; padding:10px; font-weight:600;" onclick="editarCantidadItem(${itemId}, ${cantidadActual})">✏️ Editar Cantidad</button>
            ${cantidadActual > 1 ? `<button class="btn btn-outline" style="flex:1; padding:10px; font-weight:600;" onclick="dividirItem(${itemId}, ${cantidadActual})">🔀 Dividir Ítem</button>` : ''}
          </div>
          <button class="btn btn-primary" style="padding:12px; font-size:1rem; font-weight:600; width:100%; margin-bottom:12px;" onclick="guardarOpcionesItem(${itemId})">💾 Guardar Ajuste Precio</button>
          <button class="btn btn-outline" style="padding:12px; font-size:1rem; font-weight:600; width:100%; color:#DC2626; border-color:#FCA5A5;" onclick="eliminarOpcionesItem(${itemId})">🗑️ Eliminar Ítem Completo</button>
        `;
      }

      document.getElementById('opcionesItemContent').innerHTML = html;
      document.getElementById('opcionesItemModal').classList.add('active');
    }

    function closeOpcionesItemModal() {
      document.getElementById('opcionesItemModal').classList.remove('active');
    }

    async function guardarOpcionesItem(itemId) {
      if (!posMesaData || !posMesaData.pedido_activo_id) return;
      const adicional = parseFloat(document.getElementById('itemPrecioAdicional').value) || 0;

      try {
        const r = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ precio_adicional: adicional, usuario_id: currentUser.id })
        });
        if (r.ok) {
          toast('Ítem actualizado', 'success');
          closeOpcionesItemModal();
          const mesaRes = await fetch(`/api/mesas/${posMesaData.id}`);
          if (mesaRes.ok) {
            const mesaUpdated = await mesaRes.json();
            abrirPOS(mesaUpdated);
            loadMesas();
          }
        } else {
          const e = await r.json();
          toast(e.error || 'Error al actualizar', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    async function eliminarOpcionesItem(itemId) {
      if (!posMesaData || !posMesaData.pedido_activo_id) return;
      const ok = await customConfirm({
        title: '¿Eliminar producto?',
        message: '¿Estás seguro de eliminar todo el producto del pedido?',
        confirmText: 'Sí, eliminar',
        icon: '🗑️'
      });
      if (!ok) return;

      try {
        const r = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/items/${itemId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario_id: currentUser.id })
        });
        if (r.ok) {
          toast('Ítem eliminado', 'success');
          closeOpcionesItemModal();
          const mesaRes = await fetch(`/api/mesas/${posMesaData.id}`);
          if (mesaRes.ok) {
            const mesaUpdated = await mesaRes.json();
            abrirPOS(mesaUpdated);
            loadMesas();
          }
        } else {
          const e = await r.json();
          toast(e.error || 'Error al eliminar', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    async function editarCantidadItem(itemId, cantidadActual) {
      if (!posMesaData || !posMesaData.pedido_activo_id) return;
      
      const res = prompt(`Ingresa la nueva cantidad para este ítem (Actual: ${cantidadActual}):`, cantidadActual);
      if (res === null) return;
      
      const nuevaCant = parseInt(res, 10);
      if (isNaN(nuevaCant) || nuevaCant < 0) {
        alert("Cantidad inválida");
        return;
      }
      
      if (nuevaCant === 0) {
        eliminarOpcionesItem(itemId);
        return;
      }
      
      if (nuevaCant === cantidadActual) return;

      try {
        const r = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cantidad: nuevaCant, usuario_id: currentUser.id })
        });
        if (r.ok) {
          toast('Cantidad actualizada', 'success');
          closeOpcionesItemModal();
          const mesaRes = await fetch(`/api/mesas/${posMesaData.id}`);
          if (mesaRes.ok) {
            const mesaUpdated = await mesaRes.json();
            abrirPOS(mesaUpdated);
            loadMesas();
          }
        } else {
          const err = await r.json();
          toast(err.error || 'Error al actualizar', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    async function dividirItem(itemId, cantidadActual) {
      if (!posMesaData || !posMesaData.pedido_activo_id) return;
      if (cantidadActual <= 1) return;
      
      const res = prompt(`¿Cuántos productos deseas separar del grupo de ${cantidadActual}?`, "1");
      if (res === null) return;
      
      const qSeparar = parseInt(res, 10);
      if (isNaN(qSeparar) || qSeparar <= 0 || qSeparar >= cantidadActual) {
        alert("Cantidad a separar inválida. Debe ser entre 1 y " + (cantidadActual - 1));
        return;
      }

      try {
        const r = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/items/${itemId}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ splitCantidad: qSeparar, usuario_id: currentUser.id })
        });
        if (r.ok) {
          toast('Ítem dividido', 'success');
          closeOpcionesItemModal();
          const mesaRes = await fetch(`/api/mesas/${posMesaData.id}`);
          if (mesaRes.ok) {
            const mesaUpdated = await mesaRes.json();
            abrirPOS(mesaUpdated);
            loadMesas();
          }
        } else {
          const err = await r.json();
          toast(err.error || 'Error al dividir el ítem', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    async function ocuparMesa(id) {
      if (!currentUser) return;
      try {
        const r = await fetch(`/api/mesas/${id}/tomar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesero_id: currentUser.id })
        });
        if (r.ok) {
          const mesa = await r.json();
          abrirPOS(mesa);
          loadMesas();
        } else {
          const e = await r.json();
          toast(e.error || 'Error', 'error');
        }
      } catch (e) { toast('Error de conexión', 'error'); }
    }
    function showMesasView() {
      const headerMesero = document.querySelector('.header-mesero');
      if (headerMesero) headerMesero.style.display = 'flex';
      document.getElementById('posView').style.display = 'none';
      document.getElementById('mesasView').style.display = 'block';
      document.getElementById('mesaResumenView').style.display = 'none';
      document.getElementById('mesaActionBar').style.display = 'none';
      document.getElementById('orderSection').style.display = 'none';
      document.getElementById('cartBar').style.display = 'none';
      pedidoItems = [];
      pedidoCliente = null;
      closeCartModal();

      // Limpiar cualquier toast pegado
      document.querySelectorAll('.toast-mesero').forEach(t => t.remove());

      loadMesas();
    }

    // ---- PRODUCTOS ----
    function renderCategoriaTabs() {
      const el = document.getElementById('categoriaTabs');
      el.innerHTML = '';
      const all = document.createElement('button');
      all.className = `cat-btn${!categoriaActiva ? ' active' : ''}`;
      all.textContent = 'Todos';
      all.onclick = () => { categoriaActiva = null; renderCategoriaTabs(); renderProductos(); };
      el.appendChild(all);
      for (const c of categorias) {
        const btn = document.createElement('button');
        btn.className = `cat-btn${categoriaActiva === c.id ? ' active' : ''}`;
        btn.textContent = c.nombre;
        btn.onclick = () => { categoriaActiva = c.id; renderCategoriaTabs(); renderProductos(); };
        el.appendChild(btn);
      }
    }

    function renderProductos() {
      const el = document.getElementById('productosGrid');
      const searchQuery = (document.getElementById('searchProductosInput')?.value || '').trim().toLowerCase();

      el.innerHTML = '';
      let filtered = productos;
      if (categoriaActiva) {
        filtered = filtered.filter(p => p.categoria_id === categoriaActiva);
      }
      if (searchQuery) {
        filtered = filtered.filter(p => p.nombre.toLowerCase().includes(searchQuery));
      }

      if (!filtered.length) {
        el.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:24px;color:#6B7280;">Sin productos encontrados</p>';
        return;
      }
      for (const p of filtered) {
        const btn = document.createElement('button');
        let badgeHtml = '';
        let extraClass = '';

        if (p.controlar_stock) {
          if (p.stock_actual <= 0) {
            extraClass = ' agotado';
            badgeHtml = '<span class="stock-badge agotado">🚫 AGOTADO</span>';
          } else if (p.stock_actual <= (p.stock_minimo || 3)) {
            extraClass = ' stock-alerta';
            badgeHtml = `<span class="stock-badge alerta">⚠️ Quedan ${p.stock_actual}</span>`;
          } else {
            badgeHtml = `<span class="stock-badge normal">📦 ${p.stock_actual} disp.</span>`;
          }
        }

        btn.className = `prod-btn${extraClass}`;
        btn.innerHTML = `<span class="name">${p.nombre}</span><span class="price">S/${p.precio.toFixed(2)}</span>${badgeHtml}`;
        btn.onclick = () => agregarItem(p);
        el.appendChild(btn);
      }
    }

    // ---- PRODUCT CUSTOMIZER ----
    let customizeProduct = null;
    let customizeCallback = null;
    let selectedVariante = null;
    let selectedMods = {};
    let selectedAgregados = {};

    function agregarItem(prod) {
      if (prod.controlar_stock && prod.stock_actual <= 0) {
        toast(`🚫 "${prod.nombre}" está AGOTADO en cocina/barra`, 'error');
        return;
      }

      const enCarrito = pedidoItems.filter(i => i.producto_id === prod.id).reduce((s, i) => s + i.cantidad, 0);
      if (prod.controlar_stock && enCarrito >= prod.stock_actual) {
        toast(`⚠️ Stock máximo alcanzado para "${prod.nombre}" (solo quedan ${prod.stock_actual})`, 'warning');
        return;
      }

      const hasExtras = (prod.variantes && prod.variantes.length) ||
        (prod.modificadores && prod.modificadores.length) ||
        (prod.agregados && prod.agregados.length);
      if (hasExtras) {
        openCustomizeModal(prod, (customized) => {
          const currentTotal = pedidoItems.filter(i => i.producto_id === prod.id).reduce((s, i) => s + i.cantidad, 0);
          if (prod.controlar_stock && currentTotal >= prod.stock_actual) {
            toast(`⚠️ Stock máximo alcanzado para "${prod.nombre}" (solo quedan ${prod.stock_actual})`, 'warning');
            return;
          }
          const exist = pedidoItems.find(i =>
            i.producto_id === customized.producto_id &&
            i.variante_id === customized.variante_id &&
            JSON.stringify(i.modificadores) === JSON.stringify(customized.modificadores) &&
            JSON.stringify(i.agregados) === JSON.stringify(customized.agregados)
          );
          if (exist) { exist.cantidad++; }
          else { pedidoItems.push({ ...customized, cantidad: 1 }); }
          renderCart();
        });
      } else {
        const exist = pedidoItems.find(i => i.producto_id === prod.id && !i.variante_id && !i.modificadores?.length && !i.agregados?.length);
        if (exist) { exist.cantidad++; }
        else {
          pedidoItems.push({
            producto_id: prod.id, nombre: prod.nombre, cantidad: 1,
            precio: prod.precio, precio_adicional: 0,
            variante_id: null, variante_nombre: null,
            modificadores: [], agregados: [], detalle: '', notas: ''
          });
        }
        renderCart();
      }
    }

    function openCustomizeModal(prod, callback) {
      customizeProduct = prod;
      customizeCallback = callback;
      selectedVariante = null;
      selectedMods = {};
      selectedAgregados = {};

      document.getElementById('customizeTitle').textContent = prod.nombre;
      let html = `<p style="color:#64748b;font-size:0.85rem;margin-bottom:12px;">S/${prod.precio.toFixed(2)} base</p>`;

      // Variantes
      if (prod.variantes?.length) {
        html += '<div style="margin-bottom:12px;"><strong style="font-size:0.85rem;">Presentación:</strong>';
        prod.variantes.forEach(v => {
          html += `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.85rem;">
            <input type="radio" name="variante" value='${JSON.stringify(v).replace(/'/g, "&#39;")}' onchange="selectVariante(this.value)">
            ${v.nombre} ${v.precio_adicional > 0 ? '<span style="color:#059669;">+$' + v.precio_adicional.toFixed(2) + '</span>' : ''}
          </label>`;
        });
        html += '</div>';
      }

      // Modificadores
      if (prod.modificadores?.length) {
        prod.modificadores.forEach(m => {
          html += `<div id="mod_wrap_${m.id}" data-dep="${m.depende_variante_id || ''}" style="margin-bottom:12px;${m.depende_variante_id ? 'display:none;' : ''}"><strong style="font-size:0.85rem;">${m.nombre}${m.requerido ? ' <span style="color:#ef4444;">*</span>' : ''}</strong>`;
          if (m.tipo === 'text') {
            html += `<input class="form-control" style="margin-top:4px;" id="mod_text_${m.id}" placeholder="Escribe...">`;
          } else {
            m.opciones.forEach(o => {
              const inputType = m.tipo === 'multi' ? 'checkbox' : 'radio';
              const name = `mod_${m.id}`;
              html += `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;">
                <input type="${inputType}" name="${name}" value="${o.id}" data-mod-id="${m.id}" data-precio="${o.precio_adicional}" onchange="selectOpcion(${m.id}, this)">
                ${o.nombre} ${o.precio_adicional > 0 ? '<span style="color:#059669;">+$' + o.precio_adicional.toFixed(2) + '</span>' : ''}
              </label>`;
            });
          }
          html += '</div>';
        });
      }

      // Agregados
      if (prod.agregados?.length) {
        html += '<div style="margin-bottom:12px;"><strong style="font-size:0.85rem;">Agregados:</strong>';
        prod.agregados.forEach(a => {
          html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.85rem;">
            <span style="flex:1;">${a.nombre} <span style="color:#059669;">+S/${a.precio.toFixed(2)}</span></span>
            <button class="btn btn-outline btn-sm" onclick="changeAgregado(${a.id}, -1, ${a.precio})">−</button>
            <span id="agr_qty_${a.id}">0</span>
            <button class="btn btn-outline btn-sm" onclick="changeAgregado(${a.id}, 1, ${a.precio})">+</button>
          </div>`;
        });
        html += '</div>';
      }

      html += '<div id="customizeTotal" style="text-align:right;font-size:1.2rem;font-weight:800;color:#059669;border-top:1px solid #e2e8f0;padding-top:8px;">Total: S/' + prod.precio.toFixed(2) + '</div>';

      document.getElementById('customizeBody').innerHTML = html;
      document.getElementById('customizeModal').classList.add('active');
    }

    function selectVariante(jsonStr) {
      try { selectedVariante = JSON.parse(jsonStr.replace(/&#39;/g, "'")); } catch (e) { selectedVariante = JSON.parse(jsonStr); }
      refreshModifierVisibility();
      updateCustomizeTotal();
    }

    function refreshModifierVisibility() {
      const prod = customizeProduct;
      if (!prod?.modificadores) return;
      prod.modificadores.forEach(m => {
        const wrap = document.getElementById('mod_wrap_' + m.id);
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
        const checked = document.querySelector(`input[name="mod_${modId}"]:checked`);
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

    let agregadoQtys = {};
    function changeAgregado(agrId, delta, precio) {
      if (!agregadoQtys[agrId]) agregadoQtys[agrId] = 0;
      agregadoQtys[agrId] = Math.max(0, agregadoQtys[agrId] + delta);
      document.getElementById('agr_qty_' + agrId).textContent = agregadoQtys[agrId];
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
        toast('Selecciona la presentación/guarnición', 'warn');
        return;
      }

      // Validar modificadores requeridos visibles (incluye dependientes activos)
      const faltantes = [];
      for (const m of prod.modificadores || []) {
        const visible = !m.depende_variante_id || (selectedVariante && selectedVariante.id == m.depende_variante_id);
        if (!visible || !m.requerido) continue;
        if (m.tipo === 'text') {
          const txt = document.getElementById('mod_text_' + m.id)?.value || '';
          if (!txt.trim()) faltantes.push(m.nombre);
        } else {
          const vals = selectedMods[m.id];
          const ok = vals !== undefined && (Array.isArray(vals) ? vals.length > 0 : true);
          if (!ok) faltantes.push(m.nombre);
        }
      }
      if (faltantes.length) {
        toast('Falta seleccionar: ' + faltantes.join(', '), 'warn');
        return;
      }

      const modificadores = prod.modificadores?.map(m => {
        const vals = selectedMods[m.id];
        let selected = [];
        if (m.tipo === 'text') {
          const txt = document.getElementById('mod_text_' + m.id)?.value || '';
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

    // ---- CART ----
    function cambiarCantidad(idx, delta) {
      const item = pedidoItems[idx];
      if (!item) return;
      item.cantidad = Math.max(0, item.cantidad + delta);
      if (item.cantidad <= 0) pedidoItems.splice(idx, 1);
      renderCart();
      renderCartModal();
    }

    function eliminarItem(idx) {
      pedidoItems.splice(idx, 1);
      renderCart();
      renderCartModal();
    }

    function abrirNota(idx) {
      noteItemIndex = idx;
      document.getElementById('noteInput').value = pedidoItems[idx]?.notas || '';
      document.getElementById('noteModal').classList.add('active');
    }

    function closeNoteModal() {
      document.getElementById('noteModal').classList.remove('active');
      noteItemIndex = -1;
    }

    function saveNote() {
      if (noteItemIndex >= 0 && pedidoItems[noteItemIndex]) {
        pedidoItems[noteItemIndex].notas = document.getElementById('noteInput').value;
      }
      closeNoteModal();
      renderCart();
    }

    function renderCart() {
      const count = pedidoItems.reduce((s, i) => s + i.cantidad, 0);
      const total = pedidoItems.reduce((s, i) => s + i.cantidad * (i.precio + (i.precio_adicional || 0)), 0);
      document.getElementById('cartCount').textContent = `${count} producto${count !== 1 ? 's' : ''}`;
      document.getElementById('cartTotal').textContent = `S/${total.toFixed(2)}`;
    }

    function openCartModal() {
      renderCartModal();
      document.getElementById('cartModal').classList.add('active');
    }

    function renderCartModal() {
      const body = document.getElementById('cartModalBody');
      if (!pedidoItems.length) {
        body.innerHTML = '<p style="color:#6B7280;text-align:center;padding:24px;">Sin productos</p>';
      } else {
        body.innerHTML = pedidoItems.map((item, idx) => {
          const precioTotal = (item.precio + (item.precio_adicional || 0));
          const pNameLower = item.nombre.toLowerCase();
          const vNameLower = item.variante_nombre ? item.variante_nombre.toLowerCase() : '';
          
          let finalDetalle = '';
          if (item.detalle) {
             let parts = item.detalle.split('·').map(p => p.trim()).filter(Boolean);
             parts = parts.filter(p => {
                 const pLow = p.toLowerCase();
                 if (pLow === vNameLower && pNameLower.includes(vNameLower)) return false;
                 return true;
             });
             parts = [...new Set(parts)];
             finalDetalle = parts.join(' · ');
          }

          return `<div class="cart-item">
            <span class="cart-item-qty">${item.cantidad}</span>
            <div class="cart-item-info">
              <div class="cart-item-name">${item.nombre}</div>
              ${finalDetalle ? `<div class="cart-item-nota" style="font-size:0.75rem;color:#64748b;">${finalDetalle}</div>` : ''}
              ${item.notas ? `<div class="cart-item-nota">📝 ${item.notas}</div>` : ''}
            </div>
            <span class="cart-item-price">S/${(item.cantidad * precioTotal).toFixed(2)}</span>
            <div class="cart-item-actions">
              <button onclick="cambiarCantidad(${idx}, -1)">−</button>
              <button onclick="cambiarCantidad(${idx}, 1)">+</button>
              <button onclick="abrirNota(${idx})">📝</button>
              <button class="del" onclick="eliminarItem(${idx})">✕</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    function closeCartModal() {
      document.getElementById('cartModal').classList.remove('active');
    }

    async function imprimirPrecuentaMesero() {
      if (!posMesaData?.pedido_activo_id) {
        toast('No hay pedido activo en esta mesa', 'warning');
        return;
      }
      try {
        const res = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/precuenta`, { method: 'POST' });
        const data = await res.json();
        toast(data.ok ? 'Pre-cuenta impresa' : 'Error al imprimir pre-cuenta', data.ok ? 'success' : 'warning');
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    // ---- MOVER / UNIR / REPETIR ----
    function abrirMoverPedido() { abrirSeleccionDestino('mover'); }
    function abrirUnirMesa() { abrirSeleccionDestino('unir'); }

    function abrirSeleccionDestino(accion) {
      actividadDestino = accion;
      let disponibles = allMesas.filter(m =>
        !m.es_virtual &&
        m.id !== posMesaId &&
        m.estado !== 'INACTIVO'
      );
      if (accion === 'unir') {
        disponibles = disponibles.filter(m => m.estado !== 'LIBRE');
      }
      const title = document.getElementById('destinoModalTitle');
      const list = document.getElementById('destinoModalList');
      title.textContent = accion === 'unir' ? '🔗 Unir con otra mesa' : '↔️ Mover a otra mesa';
      if (!disponibles.length) {
        list.innerHTML = '<p style="color:#6B7280;text-align:center;padding:12px;">No hay otras mesas disponibles</p>';
        document.getElementById('destinoModal').classList.add('active');
        return;
      }
      list.innerHTML = disponibles.map(m => {
        const total = m.pedido_total || 0;
        const tienePedido = m.pedido_activo_id && m.pedido_total != null;
        return `<button class="opt-btn" style="justify-content:space-between;" onclick="elegirMesaDestino(${m.id}, '${accion}')">
          <span>${m.nombre || 'Mesa ' + m.numero} — ${m.estado.toLowerCase()}</span>
          <span style="font-weight:800;color:${tienePedido ? '#059669' : '#94A3B8'};">${tienePedido ? 'S/' + total.toFixed(2) : 'sin pedido'}</span>
        </button>`;
      }).join('');
      document.getElementById('destinoModal').classList.add('active');
    }

    async function elegirMesaDestino(id, accion) {
      const destMesa = allMesas.find(m => m.id === id);
      if (!destMesa) return;
      if (accion === 'unir') {
        confirmarUnir(destMesa);
      } else {
        const estaOcupada = destMesa.pedido_activo_id && destMesa.pedido_total != null;
        const nombreDest = destMesa.nombre || 'Mesa ' + destMesa.numero;
        if (estaOcupada) {
          const ok = await customConfirm({
            title: 'Mesa Destino Ocupada',
            message: `La mesa "${nombreDest}" está ocupada (S/${(destMesa.pedido_total || 0).toFixed(2)}). ¿Seguro que deseas mover productos a esta mesa? Los productos se sumarán a su pedido.`,
            confirmText: 'Sí, mover productos',
            icon: '🔀'
          });
          if (!ok) return;
        }
        abrirSeleccionItems(destMesa);
      }
    }

    function closeDestinoModal() {
      document.getElementById('destinoModal').classList.remove('active');
      actividadDestino = null;
    }

    function abrirSeleccionItems(destMesa) {
      mesaDestinoElegida = destMesa;
      moverSeleccion = new Set(pedidoActivoItems.map((_, idx) => idx));
      document.getElementById('destinoModal').classList.remove('active');
      document.getElementById('moverItemsTitle').textContent = `Mover productos a ${destMesa.nombre || 'Mesa ' + destMesa.numero}`;
      document.getElementById('moverItemsInfo').textContent = 'Selecciona los productos a mover. Esta cuenta no debe tener pagos registrados; los productos se sumarán al pedido de la mesa destino.';
      document.getElementById('moverItemsList').innerHTML = pedidoActivoItems.map((it, idx) => {
        const sub = it.cantidad * (it.precio_unitario + (it.precio_adicional || 0));
        return `<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:0.85rem;">
          <input type="checkbox" checked onchange="moverItemCheck(${idx}, this)">
          <span style="flex:1;">${it.cantidad}x ${it.producto_nombre}${it.variante_nombre ? ' (' + it.variante_nombre + ')' : ''}</span>
          <span style="font-weight:600;">S/${sub.toFixed(2)}</span>
        </label>`;
      }).join('');
      document.getElementById('moverItemsModal').classList.add('active');
    }

    function moverItemCheck(idx, el) {
      if (el.checked) moverSeleccion.add(idx);
      else moverSeleccion.delete(idx);
    }

    function closeMoverItemsModal() {
      document.getElementById('moverItemsModal').classList.remove('active');
      mesaDestinoElegida = null;
      moverSeleccion = new Set();
    }

    async function confirmarMoverItems(mode) {
      if (!mesaDestinoElegida || !posMesaData?.pedido_activo_id) return;
      let ids;
      if (mode === 'todo') {
        ids = pedidoActivoItems.map(i => i.id);
      } else {
        ids = pedidoActivoItems.filter((_, idx) => moverSeleccion.has(idx)).map(i => i.id);
      }
      if (!ids.length) { toast('Selecciona al menos un producto', 'warning'); return; }
      try {
        const res = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/mover`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_ids: ids, mesa_destino_id: mesaDestinoElegida.id, mesero_id: currentUser?.id || null })
        });
        const data = await res.json();
        if (res.ok) {
          toast(`Productos movidos a ${mesaDestinoElegida.nombre || 'Mesa ' + mesaDestinoElegida.numero}`, 'success');
          closeMoverItemsModal();
          closeDestinoModal();
          showMesasView();
          await loadMesas();
        } else {
          toast(data.error || 'Error al mover productos', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    async function confirmarUnir(destMesa) {
      if (!posMesaData?.pedido_activo_id) return;
      const ok = await customConfirm({
        title: 'Unir Pedidos de Mesas',
        message: `¿Unir todo el pedido de esta mesa con ${destMesa.nombre || 'Mesa ' + destMesa.numero}? La mesa actual quedará libre.`,
        confirmText: 'Sí, unir mesas',
        icon: '🔗'
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/unir`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesa_destino_id: destMesa.id, mesero_id: currentUser?.id || null })
        });
        const data = await res.json();
        if (res.ok) {
          toast(`Pedido unido a ${destMesa.nombre || 'Mesa ' + destMesa.numero}`, 'success');
          closeDestinoModal();
          showMesasView();
          await loadMesas();
        } else {
          toast(data.error || 'Error al unir mesas', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    async function sumarProductoOrden(idx) {
      const it = pedidoActivoItems[idx];
      if (!it || !posMesaData?.pedido_activo_id) return;
      const item = {
        producto_id: it.producto_id,
        nombre: it.producto_nombre,
        cantidad: 1,
        precio: it.precio_unitario,
        precio_adicional: it.precio_adicional || 0,
        variante_id: it.variante_id,
        variante_nombre: it.variante_nombre,
        modificadores: JSON.parse(it.modificadores_json || '[]'),
        agregados: JSON.parse(it.agregados_json || '[]'),
        detalle: it.detalle || '',
        notas: it.notas || ''
      };
      const ok = await customConfirm({
        title: 'Enviar a Cocina',
        message: `¿Enviar +1 de "${it.producto_nombre}" a cocina?`,
        confirmText: 'Sí, enviar',
        icon: '👨‍🍳'
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/items`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [item], nota: null })
        });
        const data = await res.json();
        if (res.ok) {
          toast(`+1 ${it.producto_nombre} enviado a cocina`, 'success');
          const mesaRes = await fetch('/api/mesas');
          const mesas = await mesaRes.json();
          const fresh = mesas.find(m => m.id === posMesaId);
          if (fresh) abrirPOS(fresh);
          loadMesas();
        } else {
          toast(data.error || 'Error al agregar producto', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    // ---- SEND ORDER ----
    async function enviarPedido() {
      if (!posMesaId || !pedidoItems.length) {
        toast('Agrega al menos un producto', 'warning');
        return;
      }
      const ok = await customConfirm({
        title: 'Enviar a Cocina',
        message: '¿Enviar pedido a cocina?',
        confirmText: 'Sí, enviar pedido',
        icon: '👨‍🍳'
      });
      if (!ok) return;

      try {
        let res;
        if (posMesaData && posMesaData.pedido_activo_id) {
          res = await fetch(`/api/pedidos/${posMesaData.pedido_activo_id}/items`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: pedidoItems, nota: null })
          });
        } else {
          res = await fetch('/api/pedidos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mesa_id: posMesaId,
              mesero_id: currentUser?.id || null,
              items: pedidoItems,
              nota: null,
              cliente_nombre: pedidoCliente?.nombre || null,
              cliente_telefono: pedidoCliente?.telefono || null,
              cliente_direccion: (pedidoCliente?.tipo === 'DELIVERY' ? pedidoCliente?.direccion : null) || null,
              hora_recogida: (pedidoCliente?.tipo === 'PARA_LLEVAR' ? pedidoCliente?.hora : null) || null
            })
          });
        }

        if (res.ok) {
          pedidoItems = [];
          renderCart();
          closeCartModal();
          document.getElementById('successMsg').textContent = `Pedido enviado a cocina — Mesa ${posMesaData?.nombre || posMesaData?.numero}`;
          document.getElementById('successOverlay').classList.add('active');
          setTimeout(() => document.getElementById('successOverlay').classList.remove('active'), 2500);
          await loadMesas();
          showMesasView();
        } else {
          const err = await res.json();
          toast(err.error || 'Error al enviar pedido', 'error');
        }
      } catch (e) {
        toast('Error de conexión', 'error');
      }
    }

    async function cancelarPedido() {
      if (!pedidoItems.length) {
        if (posMesaData && posMesaData.estado !== 'LIBRE') ocultarCatalogo();
        else showMesasView();
        return;
      }
      const ok = await customConfirm({
        title: '¿Cancelar Pedido?',
        message: '¿Estás seguro de cancelar el pedido actual?',
        confirmText: 'Sí, cancelar',
        isDanger: true,
        icon: '🗑️'
      });
      if (ok) {
        pedidoItems = [];
        renderCart();
        if (posMesaData && posMesaData.estado !== 'LIBRE') ocultarCatalogo();
        else showMesasView();
      }
    }

    // ---- KEYBOARD SUPPORT ----
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('loginScreen').style.display !== 'none') {
        if (e.key >= '0' && e.key <= '9') pressPin(e.key);
        if (e.key === 'Enter') submitPin();
        if (e.key === 'Backspace') { pinBuffer = pinBuffer.slice(0, -1); document.getElementById('pinDisplay').value = pinBuffer; }
        if (e.key === 'Escape') clearPin();
      }
    });

    // ---- RESTORE SESSION ----
    (function () {
      const saved = localStorage.getItem('posUser');
      if (saved) {
        try {
          currentUser = JSON.parse(saved);
          if (currentUser.rol === 'mesero' || currentUser.rol === 'admin') {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('appContent').style.display = 'block';
            document.getElementById('userBadge').textContent = currentUser.nombre;
            initApp();
          }
        } catch (e) { localStorage.removeItem('posUser'); }
      }
    })();