    const socket = io();

    function loadPedidos() {
      fetch('/api/pedidos/cocina')
        .then(r => r.json())
        .then(renderPedidos)
        .catch(console.error);
    }

    function renderPedidos(pedidos) {
      const container = document.getElementById('comandasContainer');

      if (!pedidos || pedidos.length === 0) {
        container.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <h2>🎯 Sin pedidos pendientes</h2>
            <p>Los pedidos nuevos aparecerán aquí automáticamente</p>
          </div>`;
        document.getElementById('pedidosCount').textContent = '0 pedidos';
        return;
      }

      document.getElementById('pedidosCount').textContent = `${pedidos.length} pedido${pedidos.length > 1 ? 's' : ''}`;

      container.innerHTML = '';
      for (const pedido of pedidos) {
        const card = document.createElement('div');
        const isUrgente = pedido.estado !== 'CERRADO' && Date.now() - new Date(pedido.created_at).getTime() > 600000;
        card.className = `comanda-card${isUrgente ? ' urgente' : ''}`;
        if (pedido.estado === 'CERRADO') card.style.borderTop = '4px solid #10B981';

        const tiempo = timeSince(new Date(pedido.created_at + 'Z'));
        card.id = `pedido-card-${pedido.id}`;
        card.innerHTML = `
          <div class="comanda-header">
            <div>
              <div class="comanda-mesa">
                ${pedido.area_tipo === 'DELIVERY' ? '<span class="comanda-tipo delivery">🏍️ DELIVERY</span> ' :
                  pedido.area_tipo === 'PARA_LLEVAR' ? '<span class="comanda-tipo llevar">🛍️ PARA LLEVAR</span> ' : ''}
                ${pedido.area_tipo === 'SALON' || !pedido.area_tipo ? `Mesa ${pedido.mesa_numero || pedido.mesa_nombre || 'N/A'}` : (pedido.mesa_nombre || 'Delivery')}
              </div>
              <div style="font-size:0.75rem;color:var(--gray);">
                Pedido #${pedido.id} ${pedido.mesero_nombre ? '| ' + pedido.mesero_nombre : ''}
                ${pedido.estado === 'CERRADO' ? '<span style="color:#10B981;font-weight:bold;margin-left:8px;padding:2px 6px;background:#D1FAE5;border-radius:4px;">💸 PAGADO</span>' : ''}
              </div>
              ${(pedido.cliente_nombre || pedido.cliente_telefono || pedido.cliente_direccion || pedido.hora_recogida) ? `
              <div class="comanda-cliente">
                ${pedido.cliente_nombre ? `👤 ${pedido.cliente_nombre}` : ''}
                ${pedido.cliente_telefono ? ` 📞 ${pedido.cliente_telefono}` : ''}
                ${pedido.cliente_direccion ? `<br>📍 ${pedido.cliente_direccion}` : ''}
                ${pedido.hora_recogida ? `<br>⏰ Recoger: ${pedido.hora_recogida}` : ''}
              </div>` : ''}
            </div>
            <div class="comanda-time">${tiempo}</div>
          </div>
          <div class="comanda-body">
            ${pedido.nota ? `<div class="comanda-nota">📝 ${pedido.nota}</div>` : ''}
            ${(!pedido.items || pedido.items.length === 0) ? '<p style="color:var(--gray);">Sin items</p>' : (() => {
              const activos = pedido.items;
              const listos = activos.filter(i => i.estado === 'LISTO').length;
              const total = activos.length;
              const todosListos = listos === total;
              
              const progresoHtml = `<div class="comanda-progreso${todosListos ? ' completo' : ''}">${todosListos ? '✅ ' : ''}${listos}/${total} listos</div>`;
              const itemsHtml = activos.map(item => {
                const esNuevo = item.estado === 'PENDIENTE' && item.created_at && (Date.now() - new Date(item.created_at + 'Z').getTime()) < 3 * 60 * 1000;
                return `
                <div class="comanda-item ${item.estado === 'LISTO' ? 'listo' : ''}">
                  <input type="checkbox" class="comanda-item-check" data-item-id="${item.id}" onchange="toggleItemLocal(this, '${item.estado}', false)" ${item.estado === 'LISTO' ? 'checked disabled' : ''}>
                  <div style="display:flex;align-items:center;flex:1;">
                    <span class="comanda-item-qty">${item.cantidad}</span>
                    <div class="comanda-item-info">
                      <div class="comanda-item-name">${item.producto_nombre} ${esNuevo ? '<span class="comanda-item-nuevo">Nuevo</span>' : ''}</div>
                      ${item.variante_nombre ? `<div style="font-size:0.75rem;color:#3B82F6;font-weight:600;">${item.variante_nombre}</div>` : ''}
                      ${item.detalle ? `<div style="font-size:0.75rem;color:#64748b;">${item.detalle}</div>` : ''}
                      ${item.notas ? `<div class="comanda-item-nota">${item.notas}</div>` : ''}
                    </div>
                  </div>
                  <span class="comanda-item-status badge-${item.estado === 'PENDIENTE' ? 'yellow' : item.estado === 'COCINANDO' ? 'blue' : 'green'} badge">
                    ${item.estado}
                  </span>
                </div>`;
              }).join('');
              return progresoHtml + itemsHtml;
            })()}
          </div>
          <div class="comanda-footer">
            <button class="btn btn-primary btn-sm" onclick="marcarPreparando(${pedido.id})" ${pedido.estado !== 'ABIERTO' ? 'disabled' : ''}>
              👨‍🍳 Preparando
            </button>
            <button class="btn btn-success btn-sm btn-despachar" onclick="despacharSeleccionados(${pedido.id}, 'cocina')" disabled>
              ✔️ Despachar
            </button>
          </div>
        `;

        container.appendChild(card);
      }
    }

    function marcarPreparando(pedidoId) {
      fetch(`/api/pedidos/${pedidoId}/items/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'COCINANDO', destino: 'cocina' })
      }).then(r => r.ok ? loadPedidos() : null).catch(console.error);
    }

    function toggleItemLocal(checkbox, originalState, isBarra) {
      const itemDiv = checkbox.closest('.comanda-item');
      const card = checkbox.closest('.comanda-card');
      const badge = itemDiv.querySelector('.comanda-item-status');

      itemDiv.classList.toggle('listo', checkbox.checked);

      if (checkbox.checked) {
        badge.className = 'comanda-item-status badge-green badge';
        badge.textContent = 'LISTO';
      } else {
        const isPrep = originalState === 'COCINANDO';
        badge.className = `comanda-item-status badge-${isPrep ? 'blue' : 'yellow'} badge`;
        badge.textContent = isPrep ? (isBarra ? 'PREPARANDO' : 'COCINANDO') : originalState;
      }

      const totalItems = card.querySelectorAll('.comanda-item-check').length;
      const checkedItems = card.querySelectorAll('.comanda-item-check:checked').length;
      const progressDiv = card.querySelector('.comanda-progreso');
      
      if (progressDiv) {
        const todosListos = (checkedItems === totalItems);
        progressDiv.className = `comanda-progreso${todosListos ? ' completo' : ''}`;
        progressDiv.innerHTML = `${todosListos ? '✅ ' : ''}${checkedItems}/${totalItems} listos`;
      }
      
      const despacharBtn = card.querySelector('.btn-despachar');
      if (despacharBtn) {
        const activeChecks = card.querySelectorAll('.comanda-item-check:checked:not([disabled])');
        despacharBtn.disabled = activeChecks.length === 0;
      }
    }

    function despacharSeleccionados(pedidoId, destino) {
      const card = document.getElementById(`pedido-card-${pedidoId}`);
      if (!card) return;
      const checks = card.querySelectorAll('.comanda-item-check:checked:not([disabled])');
      const itemIds = Array.from(checks).map(c => parseInt(c.dataset.itemId));
      
      if (itemIds.length === 0) {
        showToast('Selecciona al menos un plato para despachar', 'warning');
        return;
      }

      fetch(`/api/pedidos/${pedidoId}/items/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'LISTO', destino: destino, item_ids: itemIds })
      }).then(r => r.ok ? loadPedidos() : null).catch(console.error);
    }

    function marcarItemListo(itemId) {
      fetch(`/api/pedidos/items/${itemId}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'LISTO' })
      }).then(r => r.ok ? loadPedidos() : null).catch(console.error);
    }

    let historialFecha = '';

    function openHistorial() {
      historialFecha = '';
      document.getElementById('historialModal').classList.add('active');
      cargarHistorial();
    }

    function closeHistorial() {
      document.getElementById('historialModal').classList.remove('active');
    }

    function cargarHistorial() {
      const body = document.getElementById('historialBody');
      body.innerHTML = '<p style="color:var(--gray);">Cargando historial...</p>';
      const qs = historialFecha ? `?fecha=${encodeURIComponent(historialFecha)}` : '';
      fetch('/api/pedidos/cocina/historial' + qs)
        .then(r => r.json())
        .then(renderHistorial)
        .catch(err => { body.innerHTML = '<p style="color:var(--danger);">Error al cargar historial</p>'; console.error(err); });
    }

    function renderHistorial(pedidos) {
      const body = document.getElementById('historialBody');

      const hoy = new Date().toISOString().slice(0, 10);
      body.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
          <input type="date" value="${historialFecha || hoy}" onchange="historialFecha=this.value;cargarHistorial()" style="padding:6px 8px;border:1px solid var(--border);border-radius:8px;">
          ${historialFecha ? `<button class="btn btn-secondary btn-sm" onclick="historialFecha='';cargarHistorial();document.querySelector('#historialBody input[type=date]').value='${hoy}'">Hoy</button>` : ''}
          <span style="color:var(--gray);font-size:0.85rem;">${pedidos.length} pedido(s)</span>
        </div>
        ${pedidos.length === 0 ? '<p style="color:var(--gray);">Sin pedidos para esta fecha.</p>' :
          pedidos.map(p => `
            <div class="comanda-card" style="margin-bottom:10px;">
              <div class="comanda-header">
                <div>
                  <div class="comanda-mesa">
                    ${p.area_tipo === 'DELIVERY' ? '<span class="comanda-tipo delivery">🛵 DELIVERY</span> ' :
                      p.area_tipo === 'PARA_LLEVAR' ? '<span class="comanda-tipo llevar">🥡 PARA LLEVAR</span> ' : ''}
                    ${p.area_tipo === 'SALON' || !p.area_tipo ? `Mesa ${p.mesa_numero || p.mesa_nombre || 'N/A'}` : (p.mesa_nombre || 'Delivery')}
                  </div>
                  <div style="font-size:0.75rem;color:var(--gray);">
                    Pedido #${p.id} ${p.mesero_nombre ? '| ' + p.mesero_nombre : ''} | ${new Date(p.created_at + 'Z').toLocaleTimeString('es-MX')}
                  </div>
                </div>
                <span class="comanda-tipo salon" style="background:#DBEAFE;color:#1D4ED8;">${p.estado}</span>
              </div>
              <div class="comanda-body">
                ${(p.items || []).map(i => `
                  <div class="comanda-item">
                    <span class="comanda-item-qty">${i.cantidad}</span>
                    <div class="comanda-item-info">
                      <div class="comanda-item-name">${i.producto_nombre}</div>
                      ${i.variante_nombre ? `<div style="font-size:0.75rem;color:#3B82F6;font-weight:600;">${i.variante_nombre}</div>` : ''}
                      ${i.detalle ? `<div style="font-size:0.75rem;color:#64748b;">${i.detalle}</div>` : ''}
                    </div>
                    <span class="badge badge-${i.estado === 'PENDIENTE' ? 'yellow' : i.estado === 'COCINANDO' ? 'blue' : 'green'}">${i.estado}</span>
                  </div>`).join('')}
              </div>
            </div>`).join('')}
      `;
    }

    function timeSince(date) {
      const seconds = Math.floor((Date.now() - date) / 1000);
      if (seconds < 60) return 'hace ' + seconds + 's';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return 'hace ' + minutes + 'min';
      return 'hace ' + Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'min';
    }

    function updateClock() {
      document.getElementById('reloj').textContent = new Date().toLocaleTimeString('es-MX');
    }

    let productosCocina = [];

    async function openStockModal() {
      document.getElementById('stockCocinaModal').classList.add('active');
      try {
        const res = await fetch('/api/productos');
        if (res.ok) {
          productosCocina = await res.json();
          renderStockCocinaList();
        }
      } catch (e) { console.error(e); }
    }

    function closeStockModal() {
      document.getElementById('stockCocinaModal').classList.remove('active');
    }

    function renderStockCocinaList() {
      const container = document.getElementById('stockCocinaList');
      if (!container) return;
      const q = (document.getElementById('stockCocinaSearch')?.value || '').trim().toLowerCase();
      let list = productosCocina.filter(p => p.nombre.toLowerCase().includes(q) || (p.categoria || '').toLowerCase().includes(q));

      if (!list.length) {
        container.innerHTML = '<p style="text-align:center; color:#64748B; padding:20px;">No se encontraron platos</p>';
        return;
      }

      let html = '';
      for (const p of list) {
        const activo = !!p.controlar_stock;
        const stock = p.stock_actual || 0;
        let badge = activo
          ? (stock <= 0 ? '<span style="background:#FEE2E2;color:#DC2626;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:700;">🚫 Agotado</span>'
            : stock <= (p.stock_minimo || 3) ? `<span style="background:#FEF3C7;color:#D97706;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:700;">⚠️ Quedan ${stock}</span>`
            : `<span style="background:#E0E7FF;color:#3730A3;padding:2px 6px;border-radius:4px;font-size:0.75rem;font-weight:700;">📦 ${stock} disp.</span>`)
          : '<span style="color:#64748B;font-size:0.75rem;">Ilimitado</span>';

        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; gap:8px; flex-wrap:wrap;">
            <div style="flex:1; min-width:160px;">
              <strong style="font-size:0.95rem; color:#1E293B;">${p.nombre}</strong>
              <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                <span style="font-size:0.8rem; color:#64748B;">${p.categoria || ''}</span>
                ${badge}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="display:flex; align-items:center; gap:4px; font-size:0.8rem; font-weight:600; cursor:pointer;">
                <input type="checkbox" ${activo ? 'checked' : ''} onchange="toggleStockCocina(${p.id}, this.checked)" style="width:16px; height:16px;">
                Controlar
              </label>
              <div style="display:flex; align-items:center; gap:4px; opacity:${activo ? '1' : '0.4'}; pointer-events:${activo ? 'auto' : 'none'};">
                <button class="btn btn-sm btn-secondary" onclick="ajustarStockCocina(${p.id}, -1)" style="padding:4px 10px; font-size:1rem; font-weight:bold;">-</button>
                <input type="number" min="0" value="${stock}" onchange="fijarStockCocina(${p.id}, this.value)" style="width:50px; text-align:center; padding:4px; border:1px solid #CBD5E1; border-radius:6px; font-weight:bold;">
                <button class="btn btn-sm btn-secondary" onclick="ajustarStockCocina(${p.id}, 1)" style="padding:4px 10px; font-size:1rem; font-weight:bold;">+</button>
                <button class="btn btn-sm btn-danger" onclick="fijarStockCocina(${p.id}, 0)" style="padding:4px 8px; font-size:0.75rem; font-weight:bold;">🚫 0</button>
              </div>
            </div>
          </div>
        `;
      }
      container.innerHTML = html;
    }

    async function toggleStockCocina(prodId, activo) {
      const p = productosCocina.find(x => x.id === prodId);
      if (p) p.controlar_stock = activo ? 1 : 0;
      renderStockCocinaList();
      await fetch(`/api/productos/${prodId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlar_stock: activo ? 1 : 0 })
      });
    }

    async function ajustarStockCocina(prodId, delta) {
      const p = productosCocina.find(x => x.id === prodId);
      if (!p) return;
      const nuevo = Math.max(0, (p.stock_actual || 0) + delta);
      p.stock_actual = nuevo;
      p.controlar_stock = 1;
      renderStockCocinaList();
      await fetch(`/api/productos/${prodId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_actual: nuevo, controlar_stock: 1 })
      });
    }

    async function fijarStockCocina(prodId, valor) {
      const p = productosCocina.find(x => x.id === prodId);
      if (!p) return;
      const nuevo = Math.max(0, parseInt(valor, 10) || 0);
      p.stock_actual = nuevo;
      p.controlar_stock = 1;
      renderStockCocinaList();
      await fetch(`/api/productos/${prodId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_actual: nuevo, controlar_stock: 1 })
      });
    }

    socket.on('stock:actualizado', (data) => {
      const p = productosCocina.find(x => x.id === data.producto_id);
      if (p) {
        p.controlar_stock = data.controlar_stock;
        p.stock_actual = data.stock_actual;
        p.stock_minimo = data.stock_minimo;
        renderStockCocinaList();
      }
    });

    let kdsAudioConfig = 'default';
    let audioContextUnlocked = false;

    fetch('/api/admin/configuracion')
      .then(r => r.json())
      .then(c => {
        if (c && c.kds_audio && c.kds_audio.tipo) {
          kdsAudioConfig = c.kds_audio.tipo;
        }
      })
      .catch(console.error);

    function playTone(ctx, freq, startTimeOffset, duration, type='sine') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const startTime = ctx.currentTime + startTimeOffset;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      gain.gain.setValueAtTime(0.5, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.stop(startTime + duration);
    }

    function playKdsAudio() {
      if (kdsAudioConfig === 'default') {
        new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACAf39/f4B/f3+AgH9/f3+AgH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gIB/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af3+AgH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gIB/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f39/gIB/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f39/gIB/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+AgH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f39/gH9/f4B/f3+AgH9/f3+Af39/gH9/f4B/f39/gIB/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f39/gH9/f4B/f3+AgH9/f3+Af39/gIB/f3+Af39/gIB/f3+Af39/gIB/f39/gIB/f3+Af39/gIB/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f3+Af39/gIB/f39/gIB/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gIB/f3+Af39/gIB/f3+Af39/gIB/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f3+Af39/gIB/f39/gH9/f4B/f39/gH9/f4B/f39/gIB/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gIB/f39/gIB/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f3+Af39/gH9/f4B/f39/gH9/f4B/f39/gH9/f4B/f38=').play().catch(() => {});
        return;
      }
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        if (kdsAudioConfig === 'campana2') {
          playTone(ctx, 880, 0, 0.3);
          playTone(ctx, 1108.73, 0.2, 0.4);
        } else if (kdsAudioConfig === 'alarma') {
          for(let i=0; i<4; i++) playTone(ctx, 600, i*0.2, 0.1, 'square');
        } else if (kdsAudioConfig === 'timbre') {
          playTone(ctx, 440, 0, 0.1, 'sawtooth');
          playTone(ctx, 440, 0.15, 0.1, 'sawtooth');
        }
      } catch(e) {}
    }

    function activarSonidoKds() {
      audioContextUnlocked = true;
      playKdsAudio(); // Play once to unlock the audio context for the browser
      const btn = document.getElementById('btnAudioToggle');
      if (btn) {
        btn.style.background = '#e5e7eb';
        btn.style.color = '#374151';
        btn.innerText = '✅ Sonido Listo';
      }
    }

    socket.on('pedido:nuevo', () => {
      loadPedidos();
      if (audioContextUnlocked || kdsAudioConfig === 'default') {
        playKdsAudio();
      }
    });

    socket.on('pedido:actualizado', () => loadPedidos());
    socket.on('item:actualizado', () => loadPedidos());
    socket.on('mesa:updated', () => loadPedidos());

    setInterval(updateClock, 1000);
    updateClock();
    loadPedidos();