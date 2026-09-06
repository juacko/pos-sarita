    let editingProductoId = null;
    let editingCategoriaId = null;
    let editingModificadorId = null;
    let editingAreaId = null;
    let categorias = [];
    let productosCompleto = [];
    let areasData = [];
    let mesasData = [];
    let currentUser = null;
    let cajaTabActual = 'flujo';
    let reporteTabActual = 'ventas';

    // Load user from localStorage
    try {
      const saved = localStorage.getItem('posUser');
      if (saved) currentUser = JSON.parse(saved);
    } catch (e) {}

    // ---- NAV ----
    function showSection(s) { toggleAdminMenu(true);
      document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.admin-sidebar a').forEach(el => el.classList.remove('active'));
      document.getElementById('sec-' + s).style.display = 'block';
      const enlace = document.querySelector(`.admin-sidebar a[data-sec="${s}"]`);
      if (enlace) enlace.classList.add('active');
      if (s === 'productos') loadProductos();
      if (s === 'categorias') loadCategorias();
      if (s === 'reportes') { reporteTabActual = 'ventas'; switchReporteTab('ventas'); }
      if (s === 'caja') { cajaTabActual = 'flujo'; switchCajaTab('flujo'); }
      if (s === 'areas') loadAreasAdmin();
      if (s === 'config') loadConfiguracion();
    }

    // Deep-link: abrir directo a una seccion via #hash (ej: /admin.html#caja)
    const _seccionHash = (location.hash || '').replace('#', '');
    if (_seccionHash && document.getElementById('sec-' + _seccionHash)) {
      showSection(_seccionHash);
    }

    // Cargar config al inicio para labels de métodos en reportes/caja/editar pagos
    loadConfiguracion();

    // ---- CONFIGURACION ----
    let configGlobal = null;

    const METODO_DEFS = {
      efectivo: { label: '💵', texto: 'Efectivo', color: '#059669' },
      tarjeta: { label: '💳', texto: 'Tarjeta', color: '#3B82F6' },
      transferencia: { label: '📱', texto: 'Transferencia', color: '#8B5CF6' },
      otros: { label: '📋', texto: 'Otros', color: '#6B7280' },
      yape: { label: '📲', texto: 'Yape', color: '#7C3AED' },
      plin: { label: '📲', texto: 'Plin', color: '#2563EB' },
      regalo: { label: '🎁', texto: 'Regalo', color: '#EC4899' },
      vale: { label: '🎟️', texto: 'Vale', color: '#F59E0B' }
    };

    // Métodos visibles actuales (mezcla config viva + defaults) para renderizar desgloses
    function metodosConfigurables() {
      const raw = configGlobal?.modal_pago?.metodos;
      const extras = ['regalo', 'vale', 'yape', 'plin'];
      if (Array.isArray(raw) && raw.length) {
        const out = raw.map(m => {
          const key = typeof m === 'string' ? m : m.key;
          const def = METODO_DEFS[key] || {};
          return { key, label: (m && m.label) || def.label || '💳', texto: (m && m.texto) || def.texto || key, color: def.color || '#64748B' };
        });
        for (const k of extras) {
          if (!out.some(o => o.key === k)) {
            const def = METODO_DEFS[k];
            out.push({ key: k, label: def.label, texto: def.texto, color: def.color });
          }
        }
        return out;
      }
      return ['efectivo', 'tarjeta', 'transferencia', 'otros', 'yape', 'plin', 'vale', 'regalo'].map(k => ({
        key: k, ...METODO_DEFS[k]
      }));
    }

    function textoMetodo(key) {
      const m = metodosConfigurables().find(x => x.key === key);
      return m ? m.texto : key;
    }

    function metodosValidadosParaBackend() {
      const raw = (configGlobal?.modal_pago?.metodos) || [];
      return raw.map(m => typeof m === 'string' ? m : m.key);
    }

    async function loadConfiguracion() {
      try {
        const res = await fetch('/api/admin/configuracion');
        configGlobal = await res.json();
        renderConfigModalPago();
        renderConfigHoraCorte();
        renderConfigPostPago();
        renderConfigImpresionComandas();
        renderConfigKdsAudio();
      } catch (e) {
        showToast('Error al cargar configuración', 'error');
      }
    }

    function renderConfigPostPago() {
      const cfg = configGlobal?.post_pago || {};
      const elMesa = document.getElementById('cfgPostPagoMesa');
      const elTicket = document.getElementById('cfgPostPagoTicket');
      const elDefault = document.getElementById('cfgPostPagoTicketDefault');
      if (elMesa) elMesa.value = cfg.liberar_mesa || 'preguntar';
      if (elTicket) elTicket.value = cfg.imprimir_ticket || 'preguntar';
      if (elDefault) elDefault.value = String(cfg.ticket_marcado_defecto === true);
    }

    async function saveConfigPostPago() {
      const valor = {
        liberar_mesa: document.getElementById('cfgPostPagoMesa')?.value || 'preguntar',
        imprimir_ticket: document.getElementById('cfgPostPagoTicket')?.value || 'preguntar',
        ticket_marcado_defecto: document.getElementById('cfgPostPagoTicketDefault')?.value === 'true'
      };
      try {
        const res = await fetch('/api/admin/configuracion/post_pago', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valor })
        });
        if (res.ok) {
          showToast('Preferencia post-pago guardada', 'success');
          configGlobal.post_pago = valor;
        } else {
          showToast('Error al guardar preferencia', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    function renderConfigImpresionComandas() {
      const wrap = document.getElementById('cfgImpresionComandasWrap');
      if (!wrap) return;
      const cfg = configGlobal?.impresion_comandas || { cocina: true, barra: true };
      
      wrap.innerHTML = `
        <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:20px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div>
              <div style="font-weight:700;font-size:1rem;">🖨️ Impresión de Comandas (Paperless)</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">Activa o desactiva la impresión física de tickets. Si se desactiva, los pedidos solo aparecerán en las pantallas (KDS).</div>
            </div>
            <button class="btn btn-primary" onclick="saveConfigImpresionComandas()">💾 Guardar preferencia</button>
          </div>
          <div style="display:flex;gap:20px;">
            <div class="form-group" style="flex:1;">
              <label>Impresora Cocina</label>
              <select id="cfgImpresionCocina" class="form-control">
                <option value="true" ${cfg.cocina !== false ? 'selected' : ''}>Sí (Imprimir tickets)</option>
                <option value="false" ${cfg.cocina === false ? 'selected' : ''}>No (Solo KDS)</option>
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label>Impresora Barra</label>
              <select id="cfgImpresionBarra" class="form-control">
                <option value="true" ${cfg.barra !== false ? 'selected' : ''}>Sí (Imprimir tickets)</option>
                <option value="false" ${cfg.barra === false ? 'selected' : ''}>No (Solo KDS)</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }

    async function saveConfigImpresionComandas() {
      const valor = {
        cocina: document.getElementById('cfgImpresionCocina')?.value === 'true',
        barra: document.getElementById('cfgImpresionBarra')?.value === 'true'
      };
      try {
        const res = await fetch('/api/admin/configuracion/impresion_comandas', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valor })
        });
        if (res.ok) {
          showToast('Configuración de comandas guardada', 'success');
          configGlobal.impresion_comandas = valor;
        } else {
          showToast('Error al guardar', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

        function renderConfigKdsAudio() {
      const wrap = document.getElementById('cfgKdsAudioWrap');
      if (!wrap) return;
      const cfgCocina = configGlobal?.kds_audio_cocina || { tipo: 'default' };
      const cfgBarra = configGlobal?.kds_audio_barra || { tipo: 'default' };
      
      const opcionesSelect = 
        <option value="default">Predeterminado (MP3 Clásico)</option>
        <optgroup label="Sonidos Graves (Recomendados para Cocina)">
          <option value="grave_campana">Campana Grave</option>
          <option value="grave_timbre">Timbre Oscuro</option>
          <option value="grave_alarma">Alarma Baja</option>
          <option value="grave_gong">Gong Sintético</option>
          <option value="grave_zumbido">Zumbido de Máquina</option>
        </optgroup>
        <optgroup label="Sonidos Agudos (Recomendados para Barra)">
          <option value="agudo_timbre">Timbre Agudo</option>
          <option value="agudo_doble">Doble Ding</option>
          <option value="agudo_cristal">Cristal / Copa</option>
          <option value="agudo_alerta">Alerta Rápida</option>
          <option value="agudo_pajaro">Pájaro Cibernético</option>
        </optgroup>
      ;
      
      wrap.innerHTML = 
        <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:20px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div>
              <div style="font-weight:700;font-size:1rem;">🔔 Sonidos KDS (Cocina y Barra)</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">Configura sonidos independientes para distinguir rápidamente a qué área llegó el pedido.</div>
            </div>
            <button class="btn btn-primary" onclick="saveConfigKdsAudio()">💾 Guardar Audios</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div class="form-group">
              <label>Sonido para 🍳 Cocina</label>
              <select id="cfgKdsAudioCocina" class="form-control">
                 + opcionesSelect + 
              </select>
            </div>
            <div class="form-group">
              <label>Sonido para 🍹 Barra</label>
              <select id="cfgKdsAudioBarra" class="form-control">
                 + opcionesSelect + 
              </select>
            </div>
          </div>
        </div>
      ;
      
      setTimeout(() => {
        document.getElementById('cfgKdsAudioCocina').value = cfgCocina.tipo || 'default';
        document.getElementById('cfgKdsAudioBarra').value = cfgBarra.tipo || 'default';
      }, 0);
    }

    async function saveConfigKdsAudio() {
      const valCocina = { tipo: document.getElementById('cfgKdsAudioCocina')?.value || 'default' };
      const valBarra = { tipo: document.getElementById('cfgKdsAudioBarra')?.value || 'default' };
      try {
        const resC = await fetch('/api/admin/configuracion/kds_audio_cocina', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: valCocina }) });
        const resB = await fetch('/api/admin/configuracion/kds_audio_barra', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: valBarra }) });
        
        if (resC.ok && resB.ok) {
          showToast('Audios KDS guardados con éxito', 'success');
          configGlobal.kds_audio_cocina = valCocina;
          configGlobal.kds_audio_barra = valBarra;
        } else {
          showToast('Error al guardar los audios', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    function renderConfigHoraCorte() {
      const wrap = document.getElementById('cfgOtrosWrap');
      const hora = configGlobal?.hora_corte || '23:00';
      wrap.innerHTML = `
        <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div>
              <div style="font-weight:700;font-size:1rem;">⏱️ Corte de día (reportes)</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">El día operativo va desde la hora de corte del día anterior hasta la hora de corte del día seleccionado. Todo pago después de la hora de corte pertenece al día siguiente. Útil si el restaurante cierra de noche.</div>
            </div>
            <button class="btn btn-primary" onclick="saveConfigHoraCorte()">💾 Guardar</button>
          </div>
          <div class="form-group" style="max-width:220px;margin-bottom:0;">
            <label>Hora de corte (HH:MM)</label>
            <input id="cfgHoraCorte" type="time" class="form-control" value="${hora}">
          </div>
        </div>`;
    }

    async function saveConfigHoraCorte() {
      const hora = document.getElementById('cfgHoraCorte')?.value;
      if (!hora || !/^\d{2}:\d{2}$/.test(hora)) return showToast('Ingresa una hora válida (HH:MM)', 'warning');
      try {
        const res = await fetch('/api/admin/configuracion/hora_corte', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valor: hora })
        });
        if (res.ok) {
          showToast('Hora de corte guardada', 'success');
          configGlobal.hora_corte = hora;
        } else {
          const err = await res.json();
          showToast(err.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    function renderConfigModalPago() {
      const cfg = configGlobal?.modal_pago || {};
      const secciones = [
        { key: 'mostrar_descuento', label: '🏷️ Descuento', desc: 'Aplicar descuentos al cobrar' },
        { key: 'mostrar_vale', label: '🎟️ Vale de consumo', desc: 'Usar vales en el cobro' },
        { key: 'mostrar_propina', label: '💡 Propina', desc: 'Botones rápidos y monto de propina' },
        { key: 'mostrar_notas', label: '📝 Notas / Referencia', desc: 'Referencia y notas del pago' },
        { key: 'mostrar_regalo', label: '🎁 Regalo / Obsequio', desc: 'Marcar pendiente como obsequio' }
      ];

      const secEl = document.getElementById('cfgModalSecciones');
      secEl.innerHTML = secciones.map(s => {
        const checked = cfg[s.key] !== false;
        return `<div style="border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px;">
          <label class="toggle"><input type="checkbox" data-cfg-sec="${s.key}" ${checked ? 'checked' : ''}><span class="slider"></span></label>
          <div>
            <div style="font-weight:600;font-size:0.85rem;">${s.label}</div>
            <div style="font-size:0.72rem;color:#94A3B8;">${s.desc}</div>
          </div>
        </div>`;
      }).join('');

      const metEl = document.getElementById('cfgModalMetodos');
      const metodos = normalizeMetodosCfg(cfg.metodos);
      metEl.innerHTML = metodos.map(m => `
        <div style="border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px;background:#fff;">
          <span style="font-size:1.1rem;">${m.label}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.85rem;">${m.texto}</div>
            <div style="font-size:0.7rem;color:#94A3B8;">clave: ${m.key}${m.especial ? ' · especial' : ''}</div>
          </div>
          <button class="btn btn-sm" style="background:#FEE2E2;color:#DC2626;padding:5px 9px;font-size:0.75rem;" onclick="quitarMetodoConfig('${m.key}')" ${m.especial ? 'disabled title="Método especial (regalo/vale) requerido"' : ''}>🗑 Quitar</button>
        </div>`).join('') || '<p style="color:#94A3B8;font-size:0.85rem;">Sin métodos configurados.</p>';
    }

    function normalizeMetodosCfg(raw) {
      const defs = { efectivo: '💵', tarjeta: '💳', transferencia: '📱', otros: '📋', regalo: '🎁', vale: '🎟️', yape: '📲', plin: '📲' };
      const textos = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otros: 'Otros', regalo: 'Regalo', vale: 'Vale', yape: 'Yape', plin: 'Plin' };
      if (!Array.isArray(raw) || !raw.length) {
        return ['efectivo', 'tarjeta', 'transferencia', 'otros'].map(k => ({ key: k, label: defs[k], texto: textos[k] }));
      }
      return raw.map(m => {
        if (typeof m === 'string') return { key: m, label: defs[m] || '💳', texto: textos[m] || m };
        return {
          key: m.key,
          label: m.label || defs[m.key] || '💳',
          texto: m.texto || textos[m.key] || m.key,
          especial: m.especial || m.key === 'regalo' || m.key === 'vale'
        };
      });
    }

    let nuevoMetodoAbierto = false;
    function agregarMetodoConfig() {
      const form = document.getElementById('cfgModalMetodosAddForm');
      if (!form) return;
      nuevoMetodoAbierto = true;
      form.style.display = 'block';
      document.getElementById('cfgMetodoNuevoTexto').focus();
    }
    function cancelarMetodoNuevo() {
      nuevoMetodoAbierto = false;
      const form = document.getElementById('cfgModalMetodosAddForm');
      if (form) form.style.display = 'none';
    }
    function guardarMetodoNuevo() {
      const texto = (document.getElementById('cfgMetodoNuevoTexto').value || '').trim();
      const label = (document.getElementById('cfgMetodoNuevoLabel').value || '💳').trim();
      let key = (document.getElementById('cfgMetodoNuevoKey').value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (!texto) return showToast('Escribe el nombre del método', 'warning');
      if (!key) return showToast('La clave es obligatoria y debe ser única', 'warning');
      const cfg = configGlobal?.modal_pago || {};
      const metodos = normalizeMetodosCfg(cfg.metodos);
      if (metodos.some(m => m.key === key)) return showToast('Ya existe un método con esa clave', 'warning');
      metodos.push({ key, label, texto });
      cfg.metodos = metodos;
      configGlobal.modal_pago = cfg;
      renderConfigModalPago();
      cancelarMetodoNuevo();
      showToast('Método agregado. Guarda los cambios.', 'success');
    }
    function quitarMetodoConfig(key) {
      const cfg = configGlobal?.modal_pago || {};
      const metodos = normalizeMetodosCfg(cfg.metodos).filter(m => m.key !== key);
      if (!metodos.length && !['regalo', 'vale'].some(k => metodos.some(m => m.key === k))) {
        return showToast('Debe quedar al menos un método de pago', 'warning');
      }
      cfg.metodos = metodos;
      configGlobal.modal_pago = cfg;
      renderConfigModalPago();
      showToast('Método quitado. Guarda los cambios.', 'success');
    }

    async function saveConfiguracion() {
      const cfg = configGlobal?.modal_pago || {};
      const secciones = ['mostrar_descuento', 'mostrar_vale', 'mostrar_propina', 'mostrar_notas', 'mostrar_regalo'];
      for (const key of secciones) {
        const el = document.querySelector(`[data-cfg-sec="${key}"]`);
        cfg[key] = el ? el.checked : true;
      }
      const metodos = normalizeMetodosCfg(cfg.metodos);
      if (!metodos.filter(m => !m.especial).length) return showToast('Debe dejar al menos un método de pago visible', 'warning');
      cfg.metodos = metodos.map(({ key, label, texto }) => ({ key, label, texto }));
      if (nuevoMetodoAbierto) cancelarMetodoNuevo();

      try {
        const res = await fetch('/api/admin/configuracion/modal_pago', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valor: cfg })
        });
        if (res.ok) {
          showToast('Configuración guardada', 'success');
          configGlobal.modal_pago = cfg;
        } else {
          const err = await res.json();
          showToast(err.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    // ---- CAJA SUB-TABS ----
    function switchCajaTab(tab) {
      cajaTabActual = tab;
      document.querySelectorAll('#sec-caja .caja-tab').forEach(el => el.classList.remove('caja-tab-active'));
      document.querySelectorAll('.caja-panel').forEach(el => el.style.display = 'none');
      document.getElementById('cajaTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('caja-tab-active');
      const panelId = tab === 'flujo' ? 'cajaFlujo' : tab === 'movimientos' ? 'cajaMovimientos' : tab === 'cierre' ? 'cajaCierre' : 'cajaAnulaciones';
      document.getElementById(panelId).style.display = 'block';
      if (tab === 'flujo') loadCajaFlujo();
      else if (tab === 'movimientos') loadMovimientos();
      else if (tab === 'cierre') loadCorteCaja();
      else loadPedidosAnulables();
    }

    async function loadCaja() {
      if (cajaTabActual === 'flujo') {
        loadCajaFlujo();
      } else if (cajaTabActual === 'movimientos') {
        loadMovimientos();
      } else {
        loadCorteCaja();
      }
    }

    async function loadCajaFlujo() {
      try {
        const res = await fetch('/api/admin/caja/flujo');
        const data = await res.json();
        renderCajaFlujoBar(data.sesion);
        if (!data.sesion) {
          document.getElementById('cajaFlujoResumen').innerHTML = '';
          document.getElementById('cajaFlujoDesglose').innerHTML = '';
          document.getElementById('cajaFlujoAnalisis').innerHTML = '';
          document.getElementById('cajaFlujoTimeline').innerHTML = '<p class="empty-state">Abre una caja para ver su flujo y movimientos</p>';
          return;
        }
        renderCajaFlujoResumen(data);
        renderCajaFlujoDesglose(data);
        renderCajaFlujoAnalisis(data);
        renderCajaFlujoTimeline(data);
      } catch (e) {
        document.getElementById('cajaFlujoTimeline').innerHTML = '<p class="empty-state">Error al cargar flujo de caja</p>';
      }
    }

    function renderCajaFlujoBar(sesion) {
      const el = document.getElementById('cajaSesionBarFlujo');
      if (sesion) {
        const apertura = new Date(sesion.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        el.innerHTML = `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.2rem;">✅</span>
            <div>
              <div style="font-weight:700;color:#059669;font-size:0.95rem;">Caja abierta</div>
              <div style="font-size:0.8rem;color:#64748b;">Fondo: S/${(sesion.fondo_inicial || 0).toFixed(2)} — ${sesion.usuario_nombre || 'N/A'} — ${apertura}</div>
            </div>
          </div>
          <button class="btn btn-sm" style="background:#DC2626;color:white;" onclick="cerrarCaja()">Cerrar caja</button>
        </div>`;
      } else {
        el.innerHTML = `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.2rem;">⚠️</span>
            <span style="font-weight:600;color:#92400E;">No hay sesión de caja abierta</span>
          </div>
          <button class="btn btn-sm btn-primary" onclick="abrirCaja()">Abrir caja</button>
        </div>`;
      }
    }

    function renderCajaFlujoResumen(data) {
      const el = document.getElementById('cajaFlujoResumen');
      const sesion = data.sesion;
      const fondo = sesion ? (sesion.fondo_inicial || 0) : 0;
      const propina = data.total_propina || 0;
      const movIng = data.movimientos_totales?.ingresos || 0;
      const movEgr = data.movimientos_totales?.egresos || 0;
      const totalGeneral = data.total_general || 0;
      const ticketPromedio = data.ticket_promedio || 0;
      const cancelados = data.cancelados || { total: 0 };
      const efectivoEsperado = data.efectivo_esperado;
      const totalPedidos = data.total_pedidos || 0;

      const cards = [
        { label: 'Fondo inicial', value: `S/${fondo.toFixed(2)}`, color: '#64748B', icon: '🏦' },
        { label: 'Total cobrado', value: `S/${totalGeneral.toFixed(2)}`, color: '#059669', icon: '💰' },
        { label: 'Ticket promedio', value: `S/${ticketPromedio.toFixed(2)}`, color: '#3B82F6', icon: '🧾' },
        { label: 'Pedidos cerrados', value: `${totalPedidos}`, color: '#0D9488', icon: '📋' },
      ];
      if (propina > 0) cards.push({ label: 'Propinas', value: `S/${propina.toFixed(2)}`, color: '#F97316', icon: '💡' });
      if (efectivoEsperado != null) cards.push({ label: 'Efectivo esperado (caja)', value: `S/${efectivoEsperado.toFixed(2)}`, color: '#059669', icon: '💵' });
      cards.push({ label: 'Movimientos', value: `+S/${movIng.toFixed(2)} / -S/${movEgr.toFixed(2)}`, color: '#3B82F6', icon: '🔄' });
      if (cancelados.total > 0) cards.push({ label: 'Cancelados', value: `${cancelados.total}`, color: '#EF4444', icon: '🚫' });
      if (data.descuentos?.total > 0) cards.push({ label: 'Descuentos', value: `${data.descuentos.total} (−S/${(data.descuentos.monto_estimado || 0).toFixed(2)})`, color: '#DC2626', icon: '🏷️' });
      if (data.vales_usados?.total > 0) cards.push({ label: 'Vales usados', value: `S/${data.vales_usados.suma.toFixed(2)}`, color: '#F59E0B', icon: '🎫' });
      if (data.regalos?.total > 0) cards.push({ label: 'Regalos', value: `S/${data.regalos.suma.toFixed(2)}`, color: '#EC4899', icon: '🎁' });

      let h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;">';
      for (const c of cards) {
        h += `<div style="background:white;padding:14px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);border-left:4px solid ${c.color};">
          <div style="font-size:0.7rem;color:#94A3B8;display:flex;align-items:center;gap:4px;">${c.icon} ${c.label}</div>
          <div style="font-size:1.2rem;font-weight:800;color:${c.color};margin-top:2px;">${c.value}</div>
        </div>`;
      }
      h += '</div>';
      el.innerHTML = h;
    }

    function renderCajaFlujoDesglose(data) {
      const el = document.getElementById('cajaFlujoDesglose');
      const metodosMeta = metodosConfigurables();
      const entries = Object.entries(data.desglose || {});
      const totalGeneral = data.total_general || 0;
      if (!entries.length) { el.innerHTML = ''; return; }
      let hasData = false;
      let h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px;">';
      for (const [key, d] of entries) {
        const meta = metodosMeta.find(mtm => mtm.key === key) || { label: key, color: '#64748B' };
        const total = d.total || 0;
        if (total === 0 && !d.cantidad) continue;
        hasData = true;
        h += `<div style="background:white;padding:10px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);border-left:4px solid ${meta.color};">
          <div style="font-size:0.7rem;color:#64748b;">${meta.label} ${meta.texto || ''}</div>
          <div style="font-size:1.1rem;font-weight:800;color:${meta.color};">S/${total.toFixed(2)}</div>
          <div style="font-size:0.7rem;color:#94a3b8;">${d.cantidad || 0} pago(s)</div>
        </div>`;
      }
      h += '</div>';
      if (!hasData) h = '<p style="color:#94A3B8;font-size:0.85rem;">Sin pagos en esta sesión.</p>';

      let resumen = '';
      if (totalGeneral > 0) {
        resumen = `<div style="display:flex;justify-content:space-between;align-items:center;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 14px;margin-bottom:12px;">
          <span style="font-weight:600;font-size:0.85rem;color:#166534;">💰 Total cobrado (sesión activa)</span>
          <span style="font-weight:800;font-size:1.1rem;color:#059669;">S/${totalGeneral.toFixed(2)}</span>
        </div>`;
      }
      el.innerHTML = resumen + h;
    }

    function renderCajaFlujoAnalisis(data) {
      const el = document.getElementById('cajaFlujoAnalisis');
      const top = data.top_productos || [];
      const porHora = data.ventas_por_hora || [];

      let h = '';
      if (top.length || porHora.length) {
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;">';
        if (top.length) {
          const maxCant = Math.max(...top.map(t => t.cantidad));
          h += `<div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:16px;">
            <div style="font-size:0.85rem;font-weight:700;color:#334155;margin-bottom:12px;">🏆 Top productos más vendidos</div>`;
          for (const t of top) {
            const w = maxCant > 0 ? (t.cantidad / maxCant) * 100 : 0;
            h += `<div style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:2px;">
                <span style="font-weight:600;">${t.nombre}</span>
                <span style="color:#64748b;">${t.cantidad} ud · S/${t.total.toFixed(2)}</span>
              </div>
              <div style="background:#F1F5F9;border-radius:6px;height:8px;overflow:hidden;">
                <div style="width:${w}%;height:100%;background:#059669;border-radius:6px;"></div>
              </div>
            </div>`;
          }
          h += '</div>';
        }
        if (porHora.length) {
          const maxTotal = Math.max(...porHora.map(v => v.total));
          h += `<div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:16px;">
            <div style="font-size:0.85rem;font-weight:700;color:#334155;margin-bottom:12px;">🕐 Ventas por hora</div>
            <div style="display:flex;align-items:flex-end;gap:6px;height:110px;">`;
          for (const v of porHora) {
            const hgt = maxTotal > 0 ? Math.max(4, (v.total / maxTotal) * 100) : 4;
            h += `<div style="flex:1;text-align:center;">
              <div style="background:#3B82F6;border-radius:4px 4px 0 0;height:${hgt}%;margin:0 auto;min-height:4px;max-width:26px;position:relative;" title="S/${v.total.toFixed(2)} (${v.cantidad} pagos)">
                <div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:0.6rem;color:#64748b;white-space:nowrap;">S/${Math.round(v.total)}</div>
              </div>
              <div style="font-size:0.62rem;color:#94A3B8;margin-top:4px;">${v.hora}h</div>
            </div>`;
          }
          h += '</div></div>';
        }
        h += '</div>';
      }
      el.innerHTML = h;
    }

    function renderCajaFlujoTimeline(data) {
      const el = document.getElementById('cajaFlujoTimeline');
      const eventos = data.eventos || [];
      if (!eventos.length) {
        el.innerHTML = '<p class="empty-state">Sin actividad de caja hoy</p>';
        return;
      }
      const tipoConfig = {
        APERTURA: { icon: '🏦', color: '#64748B', bg: '#F1F5F9', label: 'Apertura' },
        PAGO: { icon: '💵', color: '#059669', bg: '#ECFDF5', label: 'Pago' },
        INGRESO: { icon: '📈', color: '#059669', bg: '#ECFDF5', label: 'Ingreso' },
        EGRESO: { icon: '📉', color: '#DC2626', bg: '#FEF2F2', label: 'Egreso' },
        CIERRE: { icon: '🔒', color: '#64748B', bg: '#F1F5F9', label: 'Cierre' }
      };
      const metodoIcons = { efectivo: '💵', tarjeta: '💳', transferencia: '🏦', yape: '📱', plin: '📱', otros: '📋', vale: '🎫', regalo: '🎁' };

      let h = `<div style="font-size:0.8rem;font-weight:600;color:#64748b;margin-bottom:8px;padding-left:4px;">Timeline de actividad — ${eventos.length} evento(s)</div>`;
      for (const ev of eventos) {
        const cfg = tipoConfig[ev.tipo] || tipoConfig.PAGO;
        const hora = new Date(ev.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const montoColor = ev.tipo === 'EGRESO' ? '#DC2626' : '#059669';
        const montoPrefix = ev.tipo === 'EGRESO' ? '-' : '+';
        const metodoIcon = (metodosConfigurables().find(mm => mm.key === ev.metodo) || {}).label || '📋';
        let extra = '';
        if (ev.propina > 0) extra += `<span style="color:#F97316;font-size:0.7rem;margin-left:4px;">+propina S/${ev.propina.toFixed(2)}</span>`;
        if (ev.referencia) extra += `<span style="color:#94A3B8;font-size:0.7rem;margin-left:4px;">Ref: ${ev.referencia}</span>`;
        if (ev.notas) extra += `<span style="color:#94A3B8;font-size:0.7rem;margin-left:4px;">📝 ${ev.notas}</span>`;

        h += `<div class="caja-timeline-item">
          <div class="caja-timeline-icon" style="background:${cfg.bg};color:${cfg.color};">${cfg.icon}</div>
          <div class="caja-timeline-body">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-weight:600;font-size:0.85rem;">${cfg.label}</span>
                <span style="font-size:0.8rem;color:#64748b;margin-left:6px;">${ev.concepto}</span>
                ${extra}
              </div>
              <div style="text-align:right;">
                <div style="font-weight:800;color:${montoColor};font-size:0.95rem;">${ev.tipo !== 'APERTURA' && ev.tipo !== 'CIERRE' ? montoPrefix + 'S/' + ev.monto.toFixed(2) : ev.tipo === 'CIERRE' && ev.sobrante != null && Math.abs(ev.sobrante) > 0.01 ? (ev.sobrante > 0 ? '+S/' : '-S/') + Math.abs(ev.sobrante).toFixed(2) : 'S/' + ev.monto.toFixed(2)}</div>
                <div class="caja-timeline-meta">${hora} — ${metodoIcon} ${ev.metodo} — ${ev.persona || ''}</div>
              </div>
            </div>
            ${ev.saldo != null ? `<div style="font-size:0.7rem;color:#94A3B8;margin-top:4px;text-align:right;">Saldo: S/${ev.saldo.toFixed(2)}</div>` : ''}
          </div>
        </div>`;
      }
      el.innerHTML = h;
    }

    // ---- CORTE DE CAJA (Cierre tab) ----
    async function loadCategorias() {
      try {
        const r = await fetch('/api/admin/categorias');
        const data = await r.json();
        if (r.ok && Array.isArray(data)) {
          categorias = data;
        } else {
          categorias = [];
          if (r.status === 401) showToast('Sesión requerida. Por favor ingresa con tu PIN', 'error');
        }
      } catch (e) {
        categorias = [];
      }
    }

    async function loadProductos() {
      try {
        const r = await fetch('/api/admin/productos/completo');
        const data = await r.json();
        if (r.ok && Array.isArray(data)) {
          productosCompleto = data;
        } else {
          productosCompleto = [];
          if (r.status === 401) showToast('Sesión requerida. Por favor ingresa con tu PIN', 'error');
        }
        renderProductos();
      } catch (e) {
        productosCompleto = [];
        renderProductos();
      }
    }

    // ---- CATEGORIAS ----
    async function renderCategorias() {
      const w = document.getElementById('categoriasWrap');
      if (!categorias.length) { w.innerHTML = '<p class="empty-state">Sin categorías</p>'; return; }
      let h = '<table><thead><tr><th>Color</th><th>Nombre</th><th>Destino Comanda</th><th>Productos</th><th>Activo</th><th>Acción</th></tr></thead><tbody>';
      for (const c of categorias) {
        const count = productosCompleto.filter(p => p.categoria_id === c.id).length;
        const dest = c.destino || 'cocina';
        const destLabel = dest === 'barra' ? '🍹 Barra' : dest === 'ambos' ? '📋 Ambos' : '🍳 Cocina';
        const destBadgeClass = dest === 'barra' ? 'background:#EEF2FF;color:#4F46E5;' : dest === 'ambos' ? 'background:#ECFDF5;color:#047857;' : 'background:#FEF3C7;color:#92400E;';
        h += `<tr>
          <td><span class="badge-color" style="background:${c.color}"></span></td>
          <td><strong>${c.nombre}</strong></td>
          <td><span style="font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:12px;${destBadgeClass}">${destLabel}</span></td>
          <td>${count} productos</td>
          <td><label class="toggle"><input type="checkbox" ${c.activo ? 'checked' : ''} onchange="toggleCategoria(${c.id},this.checked)"><span class="slider"></span></label></td>
          <td><button class="btn btn-outline btn-sm" onclick="openCategoriaModal(${c.id})">✏️</button></td>
        </tr>`;
      }
      h += '</tbody></table>';
      w.innerHTML = h;
    }

    function openCategoriaModal(id) {
      editingCategoriaId = id || null;
      document.getElementById('modalCategoriaTitle').textContent = id ? 'Editar categoría' : 'Nueva categoría';
      if (id) {
        const c = categorias.find(x => x.id === id);
        document.getElementById('catNombre').value = c?.nombre || '';
        document.getElementById('catColor').value = c?.color || '#6B7280';
        document.getElementById('catDestino').value = c?.destino || 'cocina';
      } else {
        document.getElementById('catNombre').value = '';
        document.getElementById('catColor').value = '#3B82F6';
        document.getElementById('catDestino').value = 'cocina';
      }
      document.getElementById('modalCategoria').classList.add('active');
    }

    async function saveCategoria() {
      const data = {
        nombre: document.getElementById('catNombre').value,
        color: document.getElementById('catColor').value,
        destino: document.getElementById('catDestino').value
      };
      if (!data.nombre) return alert('Nombre requerido');
      try {
        if (editingCategoriaId) {
          await fetch('/api/admin/categorias/' + editingCategoriaId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        } else {
          await fetch('/api/admin/categorias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        }
        closeModal('modalCategoria');
        await loadCategorias(); await loadProductos(); renderCategorias();
      } catch (e) { alert('Error'); }
    }

    async function toggleCategoria(id, active) {
      const c = categorias.find(x => x.id === id);
      if (c) c.activo = active ? 1 : 0;
      await fetch('/api/admin/categorias/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ...c, activo: active ? 1 : 0 }) });
    }

    // ---- PRODUCTOS ----
    function renderProductos() {
      const w = document.getElementById('productosWrap');
      const q = (document.getElementById('searchProductos').value || '').toLowerCase();
      let list = productosCompleto.filter(p => p.nombre.toLowerCase().includes(q) || (p.categoria_nombre || '').toLowerCase().includes(q));
      if (!list.length) { w.innerHTML = '<p class="empty-state">Sin productos</p>'; return; }
      let h = '<table><thead><tr><th>Producto</th><th>Categoría</th><th>Destino</th><th>Precio</th><th>Stock Diario</th><th>Variantes</th><th>Mod.</th><th>Agr.</th><th>Activo</th><th>Acción</th></tr></thead><tbody>';
      for (const p of list) {
        const cat = categorias.find(c => c.id === p.categoria_id);
        const catDestino = cat?.destino || 'cocina';
        const hasOverride = !!p.destino_override;
        const finalDest = p.destino_override || catDestino;
        const destLabel = finalDest === 'barra' ? '🍹 Barra' : finalDest === 'ambos' ? '📋 Ambos' : '🍳 Cocina';
        const isOverrideTag = hasOverride ? ' <small style="color:#6366F1;font-weight:700;">(Forzado)</small>' : '';

        let stockInfo = '<span style="color:#64748B;font-size:0.8rem;">Ilimitado</span>';
        if (p.controlar_stock) {
          if (p.stock_actual <= 0) {
            stockInfo = '<span style="background:#FEE2E2;color:#DC2626;padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.75rem;">🚫 Agotado (0)</span>';
          } else if (p.stock_actual <= (p.stock_minimo || 3)) {
            stockInfo = `<span style="background:#FEF3C7;color:#D97706;padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.75rem;">⚠️ Quedan ${p.stock_actual}</span>`;
          } else {
            stockInfo = `<span style="background:#E0E7FF;color:#3730A3;padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.75rem;">📦 ${p.stock_actual} disp.</span>`;
          }
        }

        h += `<tr>
          <td><strong>${p.nombre}</strong><br><small style="color:#94a3b8;">${p.descripcion || ''}</small></td>
          <td>${p.categoria_nombre || '-'}</td>
          <td><span style="font-size:0.75rem;">${destLabel}${isOverrideTag}</span></td>
          <td><strong>S/${p.precio.toFixed(2)}</strong></td>
          <td>${stockInfo}</td>
          <td>${p.variantes?.length || 0}</td>
          <td>${p.modificadores?.length || 0}</td>
          <td>${p.agregados?.length || 0}</td>
          <td><label class="toggle"><input type="checkbox" ${p.activo ? 'checked' : ''} onchange="toggleProducto(${p.id},this.checked)"><span class="slider"></span></label></td>
          <td><button class="btn btn-outline btn-sm" onclick="openProductoModal(${p.id})">✏️</button></td>
        </tr>`;
      }
      h += '</tbody></table>';
      w.innerHTML = h;
    }

    async function toggleProducto(id, active) {
      const p = productosCompleto.find(x => x.id === id);
      if (!p) return;
      await fetch('/api/admin/productos/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ...p, activo: active ? 1 : 0 }) });
    }

    async function openProductoModal(id) {
      editingProductoId = id || null;
      document.getElementById('modalProductoTitle').textContent = id ? 'Editar producto' : 'Nuevo producto';

      let p = { nombre: '', descripcion: '', precio: '', categoria_id: '', para_llevar: 0, destino_override: '', controlar_stock: 0, stock_actual: 0, stock_minimo: 3, variantes: [], modificadores: [], agregados: [] };
      if (id) p = productosCompleto.find(x => x.id === id) || p;

      document.getElementById('prodNombre').value = p.nombre;
      document.getElementById('prodPrecio').value = p.precio;
      document.getElementById('prodDesc').value = p.descripcion || '';
      document.getElementById('prodParaLlevar').checked = !!p.para_llevar;
      document.getElementById('prodDestinoOverride').value = p.destino_override || '';

      const controlarCheck = document.getElementById('prodControlarStock');
      controlarCheck.checked = !!p.controlar_stock;
      document.getElementById('prodStockActual').value = p.stock_actual ?? 0;
      document.getElementById('prodStockMinimo').value = p.stock_minimo ?? 3;
      document.getElementById('stockFieldsRow').style.display = p.controlar_stock ? 'flex' : 'none';

      const sel = document.getElementById('prodCategoria');
      sel.innerHTML = '<option value="">Sin categoría</option>';
      for (const c of categorias) {
        sel.innerHTML += `<option value="${c.id}" ${c.id === p.categoria_id ? 'selected' : ''}>${c.nombre}</option>`;
      }

      renderVariantes(p.variantes || []);
      renderModificadores(p.modificadores || []);
      renderAgregados(p.agregados || []);

      const depSel = document.getElementById('modDepende');
      depSel.innerHTML = '<option value="">Sin dependencia</option>';
      for (const v of (p.variantes || [])) {
        depSel.innerHTML += `<option value="${v.id}">${v.nombre}</option>`;
      }

      document.getElementById('modalProducto').classList.add('active');
    }

    async function saveProducto() {
      const data = {
        nombre: document.getElementById('prodNombre').value,
        descripcion: document.getElementById('prodDesc').value,
        precio: parseFloat(document.getElementById('prodPrecio').value),
        categoria_id: parseInt(document.getElementById('prodCategoria').value) || null,
        para_llevar: document.getElementById('prodParaLlevar').checked ? 1 : 0,
        destino_override: document.getElementById('prodDestinoOverride').value || null,
        controlar_stock: document.getElementById('prodControlarStock').checked ? 1 : 0,
        stock_actual: parseInt(document.getElementById('prodStockActual').value, 10) || 0,
        stock_minimo: parseInt(document.getElementById('prodStockMinimo').value, 10) || 3
      };
      if (!data.nombre || !data.precio) return alert('Nombre y precio requeridos');
      try {
        if (editingProductoId) {
          await fetch('/api/admin/productos/' + editingProductoId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        } else {
          await fetch('/api/admin/productos', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
        }
        closeModal('modalProducto');
        await loadProductos();
      } catch (e) { alert('Error'); }
    }

    // ---- VARIANTES ----
    function renderVariantes(variantes) {
      const el = document.getElementById('variantesList');
      if (!variantes.length) { el.innerHTML = '<p style="font-size:0.8rem;color:#94a3b8;">Sin variantes</p>'; return; }
      el.innerHTML = variantes.map(v => `
        <div class="sub-item">
          <span><strong>${v.nombre}</strong> ${v.precio_adicional > 0 ? '+S/' + v.precio_adicional.toFixed(2) : ''}</span>
          <div class="actions">
            <button class="del" onclick="deleteVariante(${v.id})">✕</button>
          </div>
        </div>
      `).join('');
    }

    async function addVariante() {
      if (!editingProductoId) return alert('Guarda el producto primero');
      const nombre = document.getElementById('varNombre').value;
      const precio = parseFloat(document.getElementById('varPrecio').value) || 0;
      if (!nombre) return;
      await fetch('/api/admin/variantes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ producto_id: editingProductoId, nombre, precio_adicional: precio }) });
      document.getElementById('varNombre').value = '';
      document.getElementById('varPrecio').value = '';
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      if (p) {
        renderVariantes(p.variantes || []);
        const depSel = document.getElementById('modDepende');
        depSel.innerHTML = '<option value="">Sin dependencia</option>';
        for (const v of (p.variantes || [])) depSel.innerHTML += `<option value="${v.id}">${v.nombre}</option>`;
      }
    }

    async function deleteVariante(id) {
      await fetch('/api/admin/variantes/' + id, { method: 'DELETE' });
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      if (p) {
        renderVariantes(p.variantes || []);
        const depSel = document.getElementById('modDepende');
        depSel.innerHTML = '<option value="">Sin dependencia</option>';
        for (const v of (p.variantes || [])) depSel.innerHTML += `<option value="${v.id}">${v.nombre}</option>`;
      }
    }

    // ---- MODIFICADORES ----
    function renderModificadores(mods) {
      const el = document.getElementById('modificadoresList');
      if (!mods.length) { el.innerHTML = '<p style="font-size:0.8rem;color:#94a3b8;">Sin modificadores</p>'; return; }
      const p = productosCompleto.find(x => x.id === editingProductoId);
      const variantes = p?.variantes || [];
      const nombreVariante = (id) => variantes.find(v => v.id === id)?.nombre || '';
      el.innerHTML = mods.map(m => {
        const depNombre = m.depende_variante_id ? nombreVariante(m.depende_variante_id) : '';
        return `
        <div class="sub-item">
          <span>
            <strong>${m.nombre}</strong>
            <small style="color:#64748b;">(${m.tipo}${m.requerido ? ', requerido' : ''}${depNombre ? ', solo con: ' + depNombre : ''})</small>
            ${m.opciones?.length ? '<br><small style="color:#94a3b8;">' + m.opciones.map(o => o.nombre + (o.precio_adicional > 0 ? ' +$' + o.precio_adicional : '')).join(', ') + '</small>' : ''}
          </span>
          <div class="actions">
            <button class="edit" onclick="openModOpcionesModal(${m.id})">📋</button>
            <button class="del" onclick="deleteModificador(${m.id})">✕</button>
          </div>
        </div>`;
      }).join('');
    }

    async function deleteModificador(id) {
      const ok = await customConfirm({
        title: '¿Eliminar Modificador?',
        message: 'Se eliminará este modificador y todas sus opciones registradas.',
        confirmText: 'Sí, eliminar',
        isDanger: true,
        icon: '🗑️'
      });
      if (!ok) return;
      await fetch('/api/admin/modificadores/' + id, { method: 'DELETE' });
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      if (p) renderModificadores(p.modificadores || []);
    }

    async function openAddModificadorModal() {
      if (!editingProductoId) return alert('Guarda el producto primero');
      const nombre = document.getElementById('modNombre').value;
      const tipo = document.getElementById('modTipo').value;
      const requerido = document.getElementById('modRequerido').checked ? 1 : 0;
      const depende_variante_id = parseInt(document.getElementById('modDepende').value) || null;
      if (!nombre) return alert('Nombre del modificador requerido');
      const r = await fetch('/api/admin/modificadores', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ producto_id: editingProductoId, nombre, tipo, requerido, depende_variante_id }) });
      const mod = await r.json();
      document.getElementById('modNombre').value = '';
      document.getElementById('modRequerido').checked = false;
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      if (p) renderModificadores(p.modificadores || []);
      openModOpcionesModal(mod.id);
    }

    function openModOpcionesModal(modId) {
      editingModificadorId = modId;
      const p = productosCompleto.find(x => x.id === editingProductoId);
      const mod = p?.modificadores?.find(m => m.id === modId);
      if (!mod) return;
      document.getElementById('modalModTitle').textContent = 'Opciones: ' + mod.nombre;
      document.getElementById('modalModDesc').textContent = 'Agrega opciones para este modificador';
      renderOpciones(mod.opciones || []);
      document.getElementById('modalModOpciones').classList.add('active');
    }

    function renderOpciones(opcs) {
      const el = document.getElementById('modalOpcionesList');
      if (!opcs.length) { el.innerHTML = '<p style="font-size:0.8rem;color:#94a3b8;">Sin opciones</p>'; return; }
      el.innerHTML = opcs.map(o => `
        <div class="sub-item">
          <span><strong>${o.nombre}</strong> ${o.precio_adicional > 0 ? '+S/' + o.precio_adicional.toFixed(2) : ''}</span>
          <div class="actions">
            <button class="del" onclick="deleteOpcion(${o.id})">✕</button>
          </div>
        </div>
      `).join('');
    }

    async function addOpcion() {
      if (!editingModificadorId) return;
      const nombre = document.getElementById('opcNombre').value;
      const precio = parseFloat(document.getElementById('opcPrecio').value) || 0;
      if (!nombre) return;
      await fetch('/api/admin/opciones-mod', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ modificador_id: editingModificadorId, nombre, precio_adicional: precio }) });
      document.getElementById('opcNombre').value = '';
      document.getElementById('opcPrecio').value = '';
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      const mod = p?.modificadores?.find(m => m.id === editingModificadorId);
      if (mod) renderOpciones(mod.opciones || []);
    }

    async function deleteOpcion(id) {
      await fetch('/api/admin/opciones-mod/' + id, { method: 'DELETE' });
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      const mod = p?.modificadores?.find(m => m.id === editingModificadorId);
      if (mod) renderOpciones(mod.opciones || []);
    }

    // ---- AGREGADOS ----
    function renderAgregados(agrs) {
      const el = document.getElementById('agregadosList');
      if (!agrs.length) { el.innerHTML = '<p style="font-size:0.8rem;color:#94a3b8;">Sin agregados</p>'; return; }
      el.innerHTML = agrs.map(a => `
        <div class="sub-item">
          <span><strong>${a.nombre}</strong> — S/${a.precio.toFixed(2)} (máx: ${a.maximo})</span>
          <div class="actions">
            <button class="del" onclick="deleteAgregado(${a.id})">✕</button>
          </div>
        </div>
      `).join('');
    }

    async function addAgregado() {
      if (!editingProductoId) return alert('Guarda el producto primero');
      const nombre = document.getElementById('agrNombre').value;
      const precio = parseFloat(document.getElementById('agrPrecio').value);
      if (!nombre || !precio) return;
      await fetch('/api/admin/agregados', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ producto_id: editingProductoId, nombre, precio }) });
      document.getElementById('agrNombre').value = '';
      document.getElementById('agrPrecio').value = '';
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      if (p) renderAgregados(p.agregados || []);
    }

    async function deleteAgregado(id) {
      await fetch('/api/admin/agregados/' + id, { method: 'DELETE' });
      await loadProductos();
      const p = productosCompleto.find(x => x.id === editingProductoId);
      if (p) renderAgregados(p.agregados || []);
    }

    // ---- REPORTES ----
    async function loadReportes() {
      const el = document.getElementById('reporteContent');
      try {
        const fechaEl = document.getElementById('corteFecha');
        if (fechaEl && !fechaEl.value) {
          const hoy = new Date();
          fechaEl.value = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        }
        const fecha = fechaEl?.value;
        const r1 = await fetch('/api/admin/pedidos/reporte?fecha=' + fecha);
        const data = await r1.json();
        const r2 = await fetch('/api/admin/pedidos/reporte/detalle?fecha=' + fecha);
        const detalle = await r2.json();
        renderReporteVentas(el, data, detalle);
      } catch (e) { el.innerHTML = '<p class="empty-state">Error al cargar reportes</p>'; }
    }

    async function loadReportesSesionActiva() {
      const el = document.getElementById('reporteContent');
      try {
        const r1 = await fetch('/api/admin/pedidos/reporte?rango=sesion');
        const data = await r1.json();
        if (!r1.ok) return el.innerHTML = `<p class="empty-state">${data.error || 'No hay sesión de caja abierta'}</p>`;
        const r2 = await fetch('/api/admin/pedidos/reporte/detalle?rango=sesion');
        const detalle = await r2.json();
        renderReporteVentas(el, data, detalle, 'sesion');
      } catch (e) { el.innerHTML = '<p class="empty-state">Error de conexión</p>'; }
    }

    function renderReporteVentas(el, data, detalle, fuente) {
      const desg = data.desglose || {};
      const labelsMeta = {};
      for (const mt of metodosConfigurables()) labelsMeta[mt.key] = `${mt.label} ${mt.texto}`;
      const desgloseHtml = Object.entries(desg)
        .filter(([k, v]) => v && (v.cantidad > 0 || v.total > 0))
        .map(([k, v]) => `
          <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <div style="font-size:0.8rem;color:#64748b;">${labelsMeta[k] || k}</div>
            <div style="font-size:1.8rem;font-weight:800;color:#0F172A;">S/${(v.total || 0).toFixed(2)}</div>
            <div style="font-size:0.75rem;color:#94A3B8;">${v.cantidad || 0} pago(s)</div>
          </div>
        `).join('') || '<p style="color:#94A3B8;font-size:0.85rem;">Sin pagos en el periodo</p>';
      const corte = data.rango?.corte || '23:00';
      const cancelados = data.cancelados || { total: 0, suma: 0 };
      const fuenteTxt = fuente === 'sesion' ? '💰 Sesión de caja' : `📅 Día (corte ${corte})`;
      let h = `<div style="margin-bottom:8px;font-size:0.75rem;color:#94A3B8;">
        ${fuenteTxt} · Periodo: ${data.rango?.inicio || ''} → ${data.rango?.fin || ''} · ${cancelados.total} pedido(s) cancelado(s) (S/${(cancelados.suma || 0).toFixed(2)})
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
        <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:0.8rem;color:#64748b;">Ventas (por pagos)</div>
          <div style="font-size:1.8rem;font-weight:800;color:#059669;">S/${(data.totalVentas || 0).toFixed(2)}</div>
        </div>
        <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:0.8rem;color:#64748b;">Propinas</div>
          <div style="font-size:1.8rem;font-weight:800;">S/${(data.totalPropina || 0).toFixed(2)}</div>
        </div>
        <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
          <div style="font-size:0.8rem;color:#64748b;">Pedidos con pago</div>
          <div style="font-size:1.8rem;font-weight:800;">${data.cantidad || 0}</div>
        </div>
      </div>
      <div style="font-size:0.85rem;font-weight:600;color:#334155;margin:0 0 10px;">Desglose por método (cuadra con caja)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px;">${desgloseHtml}</div>`;
      if (data.pedidos && data.pedidos.length) {
        h += '<div class="table-wrap"><table><thead><tr><th>#</th><th>Mesa</th><th>Hora pago</th><th>Total</th><th>Pagado periodo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>';
        for (const p of data.pedidos) {
          const badgeClass = p.estado === 'CERRADO' ? 'badge-green' : p.estado === 'CANCELADO' ? 'badge-red' : 'badge-blue';
          const acciones = [
            `<button class="btn btn-outline btn-sm" title="Ver detalle" onclick="verPedidoAdmin(${p.id})">👁️</button>`,
            `<button class="btn btn-outline btn-sm" title="Reimprimir" onclick="reimprimirPedidoAdmin(${p.id})">🖨️</button>`
          ];
          if (p.estado === 'CERRADO') {
            acciones.push(`<button class="btn btn-outline btn-sm" title="Editar pagos" onclick="abrirModalEditarPagosAdmin(${p.id})">💳</button>`);
            acciones.push(`<button class="btn btn-outline btn-sm" title="Eliminar pedido" onclick="eliminarPedidoAdmin(${p.id})" style="color:#DC2626;border-color:#FCA5A5;">🗑️</button>`);
          }
          h += `<tr>
            <td>${p.id}</td>
            <td>${p.mesa_nombre}</td>
            <td>${new Date(p.created_at + 'Z').toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'})}</td>
            <td><strong>S/${(p.total || 0).toFixed(2)}</strong></td>
            <td>S/${(p.total_pagado_periodo || 0).toFixed(2)}</td>
            <td><span class="badge ${badgeClass}">${p.estado}</span></td>
            <td style="white-space:nowrap;">${acciones.join(' ')}</td>
          </tr>`;
        }
        h += '</tbody></table></div>';
      } else {
        h += '<p class="empty-state">Sin pedidos con pago en esta fecha</p>';
      }
      if (detalle.length) {
        h += '<h3 style="margin:24px 0 12px;font-size:1rem;">Detalle por producto</h3>';
        h += '<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Vendidos</th><th>Ingresos</th></tr></thead><tbody>';
        for (const d of detalle) {
          h += `<tr><td>${d.producto_nombre}</td><td>${d.total_vendido}</td><td>S/${(d.total_ingresos || 0).toFixed(2)}</td></tr>`;
        }
        h += '</tbody></table></div>';
      }
      el.innerHTML = h;
    }

    async function reimprimirPedidoAdmin(pedidoId) {
      try {
        const res = await fetch('/api/pedidos/' + pedidoId + '/reimprimir', { method: 'POST' });
        const data = await res.json();
        alert(data.ok ? 'Ticket reimpreso' : 'Error al reimprimir: ' + (data.reason || ''));
      } catch (e) { alert('Error de conexión'); }
    }

    let adminEditarPagosData = null;

    async function verPedidoAdmin(pedidoId) {
      try {
        const res = await fetch('/api/pedidos/' + pedidoId);
        if (!res.ok) return alert('No se pudo cargar el pedido');
        const p = await res.json();
        const items = (p.items || []).map(i => {
          const sub = i.cantidad * (i.precio_unitario + (i.precio_adicional || 0));
          return `<tr><td>${i.cantidad}x ${i.producto_nombre}</td><td style="text-align:right;">S/${sub.toFixed(2)}</td></tr>`;
        }).join('');
        const pagos = (p.pagos || []).map(pg => {
          return `<tr><td>${textoMetodo(pg.metodo)}</td><td style="text-align:right;">S/${pg.monto.toFixed(2)}</td><td>${pg.created_at || ''}</td></tr>`;
        }).join('');
        alert([
          'Pedido #' + p.id + ' · ' + (p.mesa_nombre || '') + '\n',
          'Estado: ' + p.estado,
          'Total: S/' + (p.total || 0).toFixed(2),
          '',
          'ITEMS:',
          items,
          'PAGOS:',
          pagos || '(sin pagos)'
        ].join('\n').replace(/<[^>]+>/g, ''));
      } catch (e) { alert('Error de conexión'); }
    }

    function textoMetodoAdminEdit(key) {
      const m = metodosConfigurables().find(x => x.key === key);
      return m ? `${m.label} ${m.texto}` : key;
    }

    const ADMIN_PAGO_LABELS = new Proxy({}, {
      get: function (_, prop) { return textoMetodo(prop); }
    });

    async function abrirModalEditarPagosAdmin(pedidoId) {
      try {
        const res = await fetch('/api/pedidos/' + pedidoId);
        if (!res.ok) return showToast('No se pudo cargar el pedido', 'error');
        adminEditarPagosData = await res.json();
        document.getElementById('adminEditarPagosId').textContent = adminEditarPagosData.id;
        renderAdminEditarPagos();
        document.getElementById('modalEditarPagos').classList.add('active');
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    function renderAdminEditarPagos() {
      const p = adminEditarPagosData;
      const total = (p.items || []).reduce((s, i) => s + i.cantidad * (i.precio_unitario + (i.precio_adicional || 0)), 0);
      const descRow = p.descuentos || [];
      const descFijo = descRow.filter(d => d.tipo === 'monto_fijo').reduce((s, d) => s + d.valor, 0);
      const descPct = descRow.filter(d => d.tipo === 'porcentaje').reduce((s, d) => s + d.valor, 0);
      const totalFinal = Math.max(0, total * (1 - descPct / 100) - descFijo);
      const pagos = p.pagos || [];
      const pagado = pagos.reduce((s, pg) => s + pg.monto, 0);

      document.getElementById('adminEditarPagosInfo').innerHTML = `
        <div style="background:var(--gray-light);border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:0.85rem;">
          <div style="display:flex;justify-content:space-between;"><span>Total</span><span style="font-weight:700;">S/${totalFinal.toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>Pagado</span><span style="font-weight:700;color:#059669;">S/${pagado.toFixed(2)}</span></div>
        </div>`;

      document.getElementById('adminEditarPagosList').innerHTML = pagos.length
        ? pagos.map(pg => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:8px;background:#fff;">
              <div style="flex:1;">
                <div style="font-weight:700;font-size:0.9rem;">${ADMIN_PAGO_LABELS[pg.metodo] || pg.metodo} — S/${pg.monto.toFixed(2)}${pg.propina > 0 ? ` <small style="color:#64748b;">+ propina S/${pg.propina.toFixed(2)}</small>` : ''}</div>
                <div style="font-size:0.75rem;color:#64748b;">${pg.created_at || ''}${pg.usuario_nombre ? ' · ' + pg.usuario_nombre : ''}</div>
              </div>
              <button class="btn btn-outline btn-sm" onclick="cambiarMetodoPagoAdmin(${pg.id})">✏️</button>
              <button class="btn btn-outline btn-sm" style="color:#DC2626;border-color:#FCA5A5;" onclick="quitarPagoAdmin(${pg.id}, ${pg.monto})">🗑️</button>
            </div>`).join('')
        : '<p style="color:#64748b;text-align:center;padding:10px;">Sin pagos registrados</p>';
    }

    async function cambiarMetodoPagoAdmin(pagoId) {
      const metodos = metodosConfigurables();
      const actual = (adminEditarPagosData.pagos || []).find(pg => pg.id === pagoId)?.metodo;
      const opciones = metodos.map(m => `${m.key}`).join(', ');
      const entrada = await customPrompt({
        title: 'Cambiar Método de Pago',
        message: `Métodos permitidos: ${opciones}`,
        placeholder: 'ej. efectivo / tarjeta / transferencia',
        defaultValue: actual || '',
        icon: '💳'
      });
      if (!entrada) return;
      const metodo = entrada.trim().toLowerCase();
      if (!metodos.some(m => m.key === metodo) && !['regalo', 'vale'].includes(metodo)) return showToast('Método inválido', 'error');
      const motivo = await customPrompt({
        title: 'Motivo del Cambio',
        message: 'Motivo del cambio de método (opcional):',
        placeholder: 'Ej: Ajuste por error',
        icon: '📝'
      });
      if (motivo === null) return;
      try {
        const res = await fetch(`/api/admin/pedidos/${adminEditarPagosData.id}/pagos/${pagoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metodo, motivo: (motivo || '').trim() || null, usuario_id: currentUser?.id })
        });
        const data = await res.json();
        if (res.ok) { showToast('Método actualizado', 'success'); await abrirModalEditarPagosAdmin(adminEditarPagosData.id); }
        else showToast(data.error || 'Error', 'error');
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function quitarPagoAdmin(pagoId, monto) {
      const ok = await customConfirm({
        title: '⚠️ Devolución de Pago',
        message: `Quitar este pago (S/${monto.toFixed(2)}) anulará el pedido #${adminEditarPagosData.id} completo, registrará un EGRESO en caja y liberará la mesa.`,
        isDanger: true,
        confirmText: 'Proceder a Devolución'
      });
      if (!ok) return;

      const motivo = await customPrompt({
        title: 'Motivo de Devolución',
        message: 'Motivo de la devolución (requerido):',
        placeholder: 'Ej. Error en cobro',
        required: true,
        icon: '⚠️'
      });
      if (!motivo || !motivo.trim()) return showToast('El motivo es requerido', 'error');
      try {
        const res = await fetch(`/api/admin/pedidos/${adminEditarPagosData.id}/pagos/${pagoId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: motivo.trim(), usuario_id: currentUser?.id })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast('Pedido anulado (devolución)', 'success');
          closeModal('modalEditarPagos');
          loadReportes();
        } else showToast(data.error || 'Error', 'error');
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function eliminarPedidoAdmin(pedidoId) {
      const ok = await customConfirm({
        title: '⚠️ Eliminar Pedido',
        message: `Eliminar el pedido #${pedidoId} devolverá el total como EGRESO en caja, anulará el pedido y liberará la mesa.`,
        isDanger: true,
        confirmText: 'Sí, eliminar pedido'
      });
      if (!ok) return;

      const motivo = await customPrompt({
        title: 'Motivo de Eliminación',
        message: 'Motivo de la eliminación (requerido):',
        placeholder: 'Ej. Duplicado',
        required: true,
        icon: '🗑️'
      });
      if (!motivo || !motivo.trim()) return showToast('El motivo es requerido', 'error');
      try {
        const res = await fetch('/api/admin/pedidos/' + pedidoId + '/eliminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: motivo.trim(), usuario_id: currentUser?.id })
        });
        const data = await res.json();
        if (res.ok && data.ok) { showToast('Pedido eliminado (devolución)', 'ok'); loadReportes(); }
        else showToast(data.error || 'Error', 'error');
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    // ---- REPORTE: SESIONES DE CAJA ----
    function switchReporteTab(tab) {
      reporteTabActual = tab;
      document.querySelectorAll('#sec-reportes .caja-tab').forEach(el => el.classList.remove('caja-tab-active'));
      document.getElementById('reporteTab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('caja-tab-active');
      document.getElementById('reporteVentas').style.display = tab === 'ventas' ? 'block' : 'none';
      document.getElementById('reporteSesiones').style.display = tab === 'sesiones' ? 'block' : 'none';
      if (tab === 'ventas') loadReportes();
      else loadSesionesCaja();
    }

    function formatFechaHora(iso) {
      if (!iso) return '-';
      try {
        const d = new Date(iso + 'Z');
        return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
               d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      } catch (e) { return iso; }
    }

    async function loadSesionesCaja() {
      const resumenEl = document.getElementById('sesionesResumen');
      const contentEl = document.getElementById('sesionesContent');
      try {
        const res = await fetch('/api/admin/caja/sesiones');
        const sesiones = await res.json();
        if (!sesiones.length) {
          resumenEl.innerHTML = '';
          contentEl.innerHTML = '<p class="empty-state">Aún no hay sesiones de caja cerradas</p>';
          return;
        }
        const totalVentas = sesiones.reduce((s, x) => s + (x.total_ventas || 0), 0);
        const totalPropinas = sesiones.reduce((s, x) => s + (x.propinas || 0), 0);
        const totalPedidos = sesiones.reduce((s, x) => s + (x.total_pedidos || 0), 0);
        resumenEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;">
          <div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid #059669;">
            <div style="font-size:0.75rem;color:#64748b;">Sesiones cerradas</div>
            <div style="font-size:1.5rem;font-weight:800;">${sesiones.length}</div>
          </div>
          <div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid #3B82F6;">
            <div style="font-size:0.75rem;color:#64748b;">Ventas acumuladas</div>
            <div style="font-size:1.5rem;font-weight:800;color:#059669;">S/${totalVentas.toFixed(2)}</div>
          </div>
          <div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid #F97316;">
            <div style="font-size:0.75rem;color:#64748b;">Propinas acumuladas</div>
            <div style="font-size:1.5rem;font-weight:800;color:#F97316;">S/${totalPropinas.toFixed(2)}</div>
          </div>
          <div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid #0D9488;">
            <div style="font-size:0.75rem;color:#64748b;">Pedidos cerrados</div>
            <div style="font-size:1.5rem;font-weight:800;">${totalPedidos}</div>
          </div>
        </div>`;

        let h = '<div class="table-wrap"><table><thead><tr><th>#</th><th>Apertura</th><th>Cierre</th><th>Cajero</th><th>Fondo</th><th>Ventas</th><th>Propinas</th><th>Pedidos</th><th>Efectivo esperado</th><th>Contado</th><th>Δ</th><th></th></tr></thead><tbody>';
        for (const s of sesiones) {
          const delta = s.sobrante_faltante == null ? '-' : (s.sobrante_faltante > 0 ? '+' : '') + s.sobrante_faltante.toFixed(2);
          const deltaColor = (s.sobrante_faltante || 0) >= 0 ? '#059669' : '#DC2626';
          h += `<tr>
            <td>${s.id}</td>
            <td>${formatFechaHora(s.opened_at)}</td>
            <td>${formatFechaHora(s.closed_at)}</td>
            <td>${s.usuario_nombre || '-'}</td>
            <td>S/${(s.fondo_inicial || 0).toFixed(2)}</td>
            <td style="font-weight:700;color:#059669;">S/${(s.total_ventas || 0).toFixed(2)}</td>
            <td>S/${(s.propinas || 0).toFixed(2)}</td>
            <td>${s.total_pedidos || 0}</td>
            <td>S/${(s.efectivo_esperado == null ? 0 : s.efectivo_esperado).toFixed(2)}</td>
            <td>S/${(s.efectivo_contado == null ? 0 : s.efectivo_contado).toFixed(2)}</td>
            <td style="font-weight:700;color:${deltaColor};">${delta}</td>
            <td><button class="btn btn-outline btn-sm" onclick="verSesionCaja(${s.id})">👁 Ver</button></td>
          </tr>`;
        }
        h += '</tbody></table></div>';
        contentEl.innerHTML = h;
      } catch (e) {
        contentEl.innerHTML = '<p class="empty-state">Error al cargar sesiones de caja</p>';
      }
    }

    async function verSesionCaja(id) {
      try {
        const res = await fetch('/api/admin/caja/sesiones/' + id);
        const data = await res.json();
        renderSesionCajaModal(data);
      } catch (e) {
        showToast('Error al cargar la sesión', 'error');
      }
    }

    function renderSesionCajaModal(data) {
      const s = data.sesion;
      sesionModalActualId = s.id;
      const desglose = data.desglose || {};
      const metodos = metodosConfigurables();
      const delta = s.sobrante_faltante == null ? '-' : (s.sobrante_faltante > 0 ? '+' : '') + s.sobrante_faltante.toFixed(2);
      const deltaColor = (s.sobrante_faltante || 0) >= 0 ? '#059669' : '#DC2626';

      let h = `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#334155;">Sesión #${s.id}</strong>
          <span class="badge badge-green">CERRADA</span>
        </div>
        <div style="font-size:0.85rem;color:#475569;line-height:1.7;">
          <div>🔓 Apertura: ${formatFechaHora(s.opened_at)} — ${s.usuario_nombre || 'N/A'} (Fondo: S/${(s.fondo_inicial || 0).toFixed(2)})</div>
          <div>🔒 Cierre: ${formatFechaHora(s.closed_at)} — ${s.cerrado_por_nombre || s.usuario_nombre || 'N/A'}</div>
          <div>📋 Pedidos: <strong>${s.total_pedidos || 0}</strong> · 💰 Ventas: <strong style="color:#059669;">S/${(s.total_ventas || 0).toFixed(2)}</strong> · 💡 Propinas: <strong style="color:#F97316;">S/${(s.propinas || 0).toFixed(2)}</strong></div>
          <div>💵 Efectivo esperado: S/${(s.efectivo_esperado == null ? 0 : s.efectivo_esperado).toFixed(2)} · Contado: S/${(s.efectivo_contado == null ? 0 : s.efectivo_contado).toFixed(2)} · Δ <strong style="color:${deltaColor};">${delta}</strong></div>
          ${s.notas_apertura ? '<div>📝 Apertura: ' + s.notas_apertura + '</div>' : ''}
          ${s.notas_cierre ? '<div>📝 Cierre: ' + s.notas_cierre + '</div>' : ''}
        </div>
      </div>`;

      let hasDesg = false;
      let desg = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:14px;">';
      for (const m of metodos) {
        const d = desglose[m.key];
        if (!d || (d.total || 0) === 0) continue;
        hasDesg = true;
        desg += `<div style="background:white;padding:10px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);border-left:4px solid ${m.color};">
          <div style="font-size:0.7rem;color:#64748b;">${m.label}</div>
          <div style="font-size:1.1rem;font-weight:800;color:${m.color};">S/${(d.total || 0).toFixed(2)}</div>
          <div style="font-size:0.7rem;color:#94a3b8;">${d.cantidad || 0} pago(s)</div>
        </div>`;
      }
      desg += '</div>';
      if (hasDesg) h += desg;

      if (data.movimientos && data.movimientos.length) {
        h += '<h3 style="font-size:0.9rem;color:#334155;margin:0 0 8px;">🔄 Movimientos</h3><div class="table-wrap" style="margin-bottom:14px;"><table><thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Método</th><th>Persona</th></tr></thead><tbody>';
        for (const mv of data.movimientos) {
          h += `<tr>
            <td>${formatFechaHora(mv.created_at).split(' ')[1]}</td>
            <td>${mv.tipo === 'INGRESO' ? '<span class="badge badge-green">INGRESO</span>' : '<span class="badge badge-red">EGRESO</span>'}</td>
            <td>${mv.concepto}${mv.notas ? '<br><small style="color:#94a3b8;">' + mv.notas + '</small>' : ''}</td>
            <td style="font-weight:700;color:${mv.tipo === 'INGRESO' ? '#059669' : '#DC2626'};">${mv.tipo === 'INGRESO' ? '+' : '-'}S/${mv.monto.toFixed(2)}</td>
            <td>${mv.metodo_pago}</td>
            <td style="font-size:0.8rem;color:#64748b;">${mv.persona || '-'}</td>
          </tr>`;
        }
        h += '</tbody></table></div>';
      }

      if (data.pagos && data.pagos.length) {
        h += '<h3 style="font-size:0.9rem;color:#334155;margin:0 0 8px;">💵 Pagos registrados</h3><div class="table-wrap"><table><thead><tr><th>Hora</th><th>#Pedido</th><th>Método</th><th>Monto</th><th>Propina</th><th>Cajero</th></tr></thead><tbody>';
        for (const pg of data.pagos) {
          h += `<tr>
            <td>${formatFechaHora(pg.created_at).split(' ')[1]}</td>
            <td>#${pg.pedido_id}</td>
            <td>${pg.metodo}</td>
            <td style="font-weight:700;">S/${pg.monto.toFixed(2)}</td>
            <td>S/${(pg.propina || 0).toFixed(2)}</td>
            <td style="font-size:0.8rem;color:#64748b;">${pg.cajero_nombre || '-'}</td>
          </tr>`;
        }
        h += '</tbody></table></div>';
      }

      if (!hasDesg && !data.movimientos?.length && !data.pagos?.length) {
        h += '<p class="empty-state">Sesión sin movimientos registrados</p>';
      }

      document.getElementById('sesionCajaBody').innerHTML = h;
      document.getElementById('modalSesionCaja').classList.add('active');
    }

    // ---- CAJA: ANULAR PEDIDO ----
    let anularPedidoActual = null;

    async function loadPedidosAnulables() {
      const el = document.getElementById('anularContent');
      try {
        const res = await fetch('/api/admin/pedidos/anulables');
        const pedidos = await res.json();
        if (!pedidos.length) {
          el.innerHTML = '<p class="empty-state">No hay pedidos activos para anular</p>';
          return;
        }
        let h = '<div class="table-wrap"><table><thead><tr><th>#</th><th>Mesa</th><th>Hora</th><th>Items</th><th>Total</th><th>Pagado</th><th>Estado</th><th></th></tr></thead><tbody>';
        for (const p of pedidos) {
          const hora = new Date(p.created_at + 'Z').toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
          const badgeClass = p.estado === 'ENTREGADO' ? 'badge-yellow' : p.estado === 'EN_PREPARACION' ? 'badge-blue' : p.estado === 'LISTO' ? 'badge-yellow' : 'badge-blue';
          h += `<tr>
            <td>${p.id}</td>
            <td>${p.mesa_nombre || (p.mesa_numero ? 'Mesa ' + p.mesa_numero : '—')}${p.es_virtual ? ' <small style="color:#94a3b8;">(virtual)</small>' : ''}</td>
            <td>${hora}</td>
            <td>${p.items}</td>
            <td><strong>S/${(p.total || 0).toFixed(2)}</strong></td>
            <td style="color:${(p.pagado || 0) > 0 ? '#F59E0B' : '#94a3b8'};">S/${(p.pagado || 0).toFixed(2)}</td>
            <td><span class="badge ${badgeClass}">${p.estado}</span></td>
            <td><button class="btn btn-sm" style="background:#DC2626;color:white;" onclick="abrirModalAnular(${p.id})">🚫 Anular</button></td>
          </tr>`;
        }
        h += '</tbody></table></div>';
        el.innerHTML = h;
      } catch (e) {
        el.innerHTML = '<p class="empty-state">Error al cargar pedidos</p>';
      }
    }

    async function abrirModalAnular(id) {
      try {
        const res = await fetch('/api/admin/pedidos/anulables');
        const pedidos = await res.json();
        const p = pedidos.find(x => x.id === id);
        if (!p) return showToast('Pedido no encontrado', 'error');
        anularPedidoActual = p;
        const mesaNombre = p.mesa_nombre || (p.mesa_numero ? 'Mesa ' + p.mesa_numero : 'Sin mesa');
        const warning = (p.pagado || 0) > 0
          ? `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:0.85rem;color:#92400E;">⚠️ Este pedido ya tiene pagos registrados (S/${(p.pagado || 0).toFixed(2)}). Si el dinero fue devuelto, registra un movimiento EGRESO en Caja para compensar.</div>`
          : '';
        document.getElementById('anularPedidoInfo').innerHTML = `
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:0.85rem;line-height:1.7;color:#334155;">
            <strong>Pedido #${p.id}</strong> — ${mesaNombre} · ${p.estado}<br>
            Items: <strong>${p.items}</strong> · Total: <strong style="color:#059669;">S/${(p.total || 0).toFixed(2)}</strong> · Pagado: <strong style="color:${(p.pagado || 0) > 0 ? '#F59E0B' : '#94a3b8'};">S/${(p.pagado || 0).toFixed(2)}</strong>
          </div>${warning}`;
        document.getElementById('anularMotivo').value = '';
        document.getElementById('anularDetalle').value = '';
        document.getElementById('modalAnularPedido').classList.add('active');
      } catch (e) {
        showToast('Error al cargar el pedido', 'error');
      }
    }

    async function confirmarAnularPedido() {
      if (!anularPedidoActual) return;
      const motivo = document.getElementById('anularMotivo').value;
      if (!motivo) return showToast('Selecciona un motivo de anulación', 'warning');
      const detalle = document.getElementById('anularDetalle').value.trim();
      const texto = detalle ? motivo + ' — ' + detalle : motivo;
      if (!confirm('¿Anular el pedido #' + anularPedidoActual.id + '?\nMotivo: ' + texto)) return;
      try {
        const res = await fetch('/api/admin/pedidos/' + anularPedidoActual.id + '/anular', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: texto, usuario_id: currentUser?.id || null })
        });
        const data = await res.json();
        if (data.ok) {
          closeModal('modalAnularPedido');
          showToast('Pedido anulado', 'success');
          loadPedidosAnulables();
        } else {
          showToast(data.error || 'No se pudo anular el pedido', 'error');
        }
      } catch (e) {
        showToast('Error de conexión', 'error');
      }
    }

    // ---- CORTE DE CAJA (Cierre tab) ----
    async function loadCorteCaja() {
      const el = document.getElementById('corteContent');
      const barEl = document.getElementById('corteSesionBar');
      try {
        const res = await fetch('/api/admin/corte-caja');
        const data = await res.json();

        // Sesion bar
        if (data.sesion) {
          const s = data.sesion;
          const apertura = new Date(s.opened_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
          barEl.innerHTML = `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-weight:600;color:#059669;">✅ Caja abierta</span>
              <span style="font-size:0.8rem;color:#6B7280;margin-left:12px;">Fondo: S/${(s.fondo_inicial || 0).toFixed(2)} — Abierta por: ${s.usuario_nombre || 'N/A'} a las ${apertura}</span>
            </div>
            <button class="btn btn-sm" style="background:#DC2626;color:white;" onclick="cerrarCaja()">Cerrar caja</button>
          </div>`;
        } else {
          barEl.innerHTML = `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;color:#92400E;">⚠️ No hay sesión de caja abierta</span>
            <button class="btn btn-sm btn-primary" onclick="abrirCaja()">Abrir caja</button>
          </div>`;
        }

        const metodos = metodosConfigurables();

        let h = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px;">`;
        for (const m of metodos) {
          const d = data.desglose[m.key] || { cantidad: 0, total: 0 };
          if (d.cantidad === 0) continue;
          h += `<div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid ${m.color};">
            <div style="font-size:0.75rem;color:#64748b;">${m.label} ${m.texto || ''}</div>
            <div style="font-size:1.4rem;font-weight:800;color:${m.color};">S/${d.total.toFixed(2)}</div>
            <div style="font-size:0.75rem;color:#94a3b8;">${d.cantidad} pago(s)</div>
          </div>`;
        }
        h += `</div>`;

        // Propina total
        if (data.total_propina > 0) {
          h += `<div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:16px;border-left:4px solid #F97316;">
            <div style="font-size:0.75rem;color:#64748b;">💡 Propinas totales</div>
            <div style="font-size:1.4rem;font-weight:800;color:#F97316;">S/${data.total_propina.toFixed(2)}</div>
          </div>`;
        }

        h += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px;">
          <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-align:center;">
            <div style="font-size:0.8rem;color:#64748b;">TOTAL COBRADO</div>
            <div style="font-size:2rem;font-weight:800;color:#059669;">S/${data.total_general.toFixed(2)}</div>
          </div>
          <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-align:center;">
            <div style="font-size:0.8rem;color:#64748b;">PEDIDOS CERRADOS</div>
            <div style="font-size:2rem;font-weight:800;">${data.total_pedidos}</div>
            <div style="font-size:0.75rem;color:#94a3b8;">Suma: S/${data.suma_pedidos.toFixed(2)}</div>
          </div>
          <div style="background:white;padding:20px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-align:center;">
            <div style="font-size:0.8rem;color:#64748b;">TICKET PROMEDIO</div>
            <div style="font-size:2rem;font-weight:800;color:#3B82F6;">S/${(data.ticket_promedio || 0).toFixed(2)}</div>
            <div style="font-size:0.75rem;color:#94a3b8;">${data.cancelados?.total > 0 ? `🚫 Cancelados: ${data.cancelados.total} (−S/${(data.cancelados.suma || 0).toFixed(2)})` : 'Sin cancelados'}</div>
          </div>
        </div>`;

        // Descuentos y vales
        if (data.descuentos && data.descuentos.total > 0) {
          h += `<div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:16px;">
            <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;">🏷️ Descuentos aplicados</div>
            <div style="display:flex;gap:16px;font-size:0.85rem;">
              <span>Total descuentos: <strong style="color:#DC2626;">${data.descuentos.total}</strong></span>
              <span>Monto estimado: <strong>S/${(data.descuentos.monto_estimado || 0).toFixed(2)}</strong></span>
            </div>
          </div>`;
        }
        if (data.vales_usados && data.vales_usados.total > 0) {
          h += `<div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:16px;">
            <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;">🎫 Vales utilizados</div>
            <div style="font-size:0.85rem;">${data.vales_usados.total} vale(s) — Total: <strong>S/${data.vales_usados.suma.toFixed(2)}</strong></div>
          </div>`;
        }
        if (data.regalos && data.regalos.total > 0) {
          h += `<div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:16px;">
            <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px;">🎁 Regalos/Obsequios</div>
            <div style="font-size:0.85rem;">${data.regalos.total} regalo(s) — Total: <strong>S/${data.regalos.suma.toFixed(2)}</strong></div>
          </div>`;
        }

        const diff = data.suma_pedidos - data.total_general;
        if (Math.abs(diff) > 0.01) {
          h += `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px;margin-bottom:16px;font-size:0.85rem;">
            ⚠️ Diferencia: S/${diff.toFixed(2)} (suma pedidos vs suma pagos)
          </div>`;
        }

        const top = data.top_productos || [];
        if (top.length) {
          const maxCant = Math.max(...top.map(t => t.cantidad));
          h += `<div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:16px;">
            <div style="font-size:0.85rem;font-weight:700;margin-bottom:12px;">🏆 Top productos más vendidos</div>`;
          for (const t of top) {
            const w = maxCant > 0 ? (t.cantidad / maxCant) * 100 : 0;
            h += `<div style="margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:2px;">
                <span style="font-weight:600;">${t.nombre}</span>
                <span style="color:#64748b;">${t.cantidad} ud · S/${t.total.toFixed(2)}</span>
              </div>
              <div style="background:#F1F5F9;border-radius:6px;height:8px;overflow:hidden;">
                <div style="width:${w}%;height:100%;background:#059669;border-radius:6px;"></div>
              </div>
            </div>`;
          }
          h += '</div>';
        }

        const porHora = data.ventas_por_hora || [];
        if (porHora.length) {
          const maxTotal = Math.max(...porHora.map(v => v.total));
          h += `<div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:16px;">
            <div style="font-size:0.85rem;font-weight:700;margin-bottom:12px;">🕐 Ventas por hora</div>
            <div style="display:flex;align-items:flex-end;gap:6px;height:110px;">`;
          for (const v of porHora) {
            const hgt = maxTotal > 0 ? Math.max(4, (v.total / maxTotal) * 100) : 4;
            h += `<div style="flex:1;text-align:center;">
              <div style="background:#3B82F6;border-radius:4px 4px 0 0;height:${hgt}%;margin:0 auto;min-height:4px;max-width:26px;position:relative;" title="S/${v.total.toFixed(2)} (${v.cantidad} pagos)">
                <div style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:0.6rem;color:#64748b;white-space:nowrap;">S/${Math.round(v.total)}</div>
              </div>
              <div style="font-size:0.62rem;color:#94A3B8;margin-top:4px;">${v.hora}h</div>
            </div>`;
          }
          h += '</div></div>';
        }

        el.innerHTML = h;
      } catch (e) {
        el.innerHTML = '<p class="empty-state">Error al cargar corte de caja</p>';
      }
    }

    async function abrirCaja() {
      if (!currentUser) return showToast('Inicia sesión para abrir la caja', 'error');
      const fondo = await customPrompt({
        title: 'Apertura de Caja',
        message: 'Ingresa el fondo inicial de caja en S/:',
        placeholder: '500.00',
        defaultValue: '500',
        required: true,
        icon: '💰'
      });
      if (fondo === null) return;
      try {
        const res = await fetch('/api/admin/caja/abrir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario_id: currentUser.id, fondo_inicial: parseFloat(fondo) || 0 })
        });
        if (res.ok) {
          showToast('Caja abierta', 'success');
          loadCaja();
        } else {
          const err = await res.json();
          showToast(err.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function cerrarCaja() {
      try {
        const res = await fetch('/api/admin/caja/sesion-actual');
        const data = await res.json();
        const sesion = data;
        if (!sesion) return showToast('No hay sesión de caja abierta', 'warning');

        let bloqueantes = [];
        try {
          const bres = await fetch('/api/admin/caja/bloqueantes');
          const bdata = await bres.json();
          bloqueantes = bdata.mesas || [];
        } catch (e) { /* sin red: seguir sin validacion */ }

        const body = document.getElementById('cierreCajaBody');
        const btnConfirmar = document.getElementById('btnConfirmarCierre');

        if (bloqueantes.length > 0) {
          body.innerHTML = renderBloqueosCierre(bloqueantes);
          btnConfirmar.disabled = true;
          btnConfirmar.textContent = '⛔ Resolver mesas pendientes';
          document.getElementById('modalCierreCaja').classList.add('active');
          return;
        }
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = '✅ Confirmar cierre';

        const fondo = sesion.fondo_inicial || 0;
        const pagosEfectivo = sesion.pagos_efectivo || 0;
        const totalVentas = sesion.total_ventas || 0;
        const propinas = sesion.propinas || 0;
        const totalPedidos = sesion.total_pedidos || 0;
        const desglose = sesion.desglose || {};
        const esperado = sesion.efectivo_esperado || 0;

        const movsEfectivo = (sesion.movimientos || []).filter(m => m.metodo_pago === 'efectivo');
        let ingresosEfectivo = 0, egresosEfectivo = 0;
        for (const mv of movsEfectivo) {
          if (mv.tipo === 'INGRESO') ingresosEfectivo += mv.monto;
          else egresosEfectivo += mv.monto;
        }

        const metodosCierre = metodosConfigurables();

        let desgloseHtml = '';
        for (const m of metodosCierre) {
          const d = desglose[m.key];
          if (!d || d.cantidad === 0) continue;
          desgloseHtml += `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #F1F5F9;font-size:0.85rem;">
            <span>${m.label} ${m.texto || ''} <small style="color:#94A3B8;">(${d.cantidad} pago${d.cantidad !== 1 ? 's' : ''}${d.total_propina > 0 ? ` · propina S/${d.total_propina.toFixed(2)}` : ''})</small></span>
            <span style="font-weight:700;color:${m.color};">S/${d.total.toFixed(2)}</span>
          </div>`;
        }

        let html = `
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:0.8rem;color:#64748b;">Efectivo esperado en caja</div>
            <div style="font-size:2.2rem;font-weight:800;color:#059669;">S/${esperado.toFixed(2)}</div>
            <div style="font-size:0.75rem;color:#94A3B8;">${totalPedidos} pedidos · Ventas: S/${totalVentas.toFixed(2)} · Propinas: S/${propinas.toFixed(2)}</div>
          </div>

          <div style="background:#F8FAFC;border-radius:10px;padding:16px;margin-bottom:16px;">
            <div style="font-size:0.8rem;font-weight:600;color:#334155;margin-bottom:8px;">📊 Ventas de la sesión por método</div>
            ${desgloseHtml || '<div style="font-size:0.8rem;color:#94A3B8;">Sin pagos registrados en esta sesión</div>'}
          </div>

          <div style="background:#F0FDF4;border-radius:10px;padding:16px;margin-bottom:16px;">
            <div style="font-size:0.8rem;font-weight:600;color:#059669;margin-bottom:10px;">📐 Fórmula de cálculo (efectivo)</div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #D1FAE5;font-size:0.9rem;">
              <span>Fondo inicial</span><span style="font-weight:600;">S/${fondo.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #D1FAE5;font-size:0.9rem;">
              <span style="color:#059669;">+ Pagos en efectivo</span><span style="font-weight:600;color:#059669;">S/${pagosEfectivo.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #D1FAE5;font-size:0.9rem;">
              <span style="color:#059669;">+ Ingresos (movimientos)</span><span style="font-weight:600;color:#059669;">S/${ingresosEfectivo.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #D1FAE5;font-size:0.9rem;">
              <span style="color:#DC2626;">- Egresos (movimientos)</span><span style="font-weight:600;color:#DC2626;">S/${egresosEfectivo.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0 0;font-size:0.95rem;font-weight:700;">
              <span>= Efectivo esperado</span><span>S/${esperado.toFixed(2)}</span>
            </div>
          </div>`;

        if (movsEfectivo.length > 0) {
          html += `<div style="margin-bottom:16px;">
            <div style="font-size:0.8rem;font-weight:600;color:#64748b;margin-bottom:8px;">🔄 Movimientos de efectivo del día</div>`;
          for (const mv of movsEfectivo) {
            const hora = new Date(mv.created_at + 'Z').toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            const color = mv.tipo === 'INGRESO' ? '#059669' : '#DC2626';
            const prefix = mv.tipo === 'INGRESO' ? '+' : '-';
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:white;border-radius:6px;margin-bottom:4px;font-size:0.85rem;">
              <div>
                <span style="color:${color};font-weight:600;">${prefix}S/${mv.monto.toFixed(2)}</span>
                <span style="color:#64748b;margin-left:6px;">${mv.concepto}</span>
                <span style="color:#9CA3AF;margin-left:4px;font-size:0.75rem;">${hora}</span>
              </div>
              <span style="color:#9CA3AF;font-size:0.75rem;">${mv.persona || ''}</span>
            </div>`;
          }
          html += `</div>`;
        }

        html += `
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <span style="font-weight:700;font-size:0.88rem;color:#1E293B;">🧮 Conteo Físico (Billetes y Monedas)</span>
              <button type="button" class="btn btn-outline btn-sm" onclick="limpiarArqueo()" style="padding:2px 8px;font-size:0.75rem;">Limpiar conteo</button>
            </div>

            <div style="font-size:0.72rem;font-weight:800;color:#64748B;letter-spacing:0.04em;margin-bottom:6px;">💵 BILLETES</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(90px, 1fr));gap:6px;margin-bottom:12px;">
              ${[200, 100, 50, 20, 10].map(val => `
                <div style="background:white;padding:6px 6px;border-radius:8px;border:1px solid #CBD5E1;text-align:center;">
                  <div style="font-size:0.75rem;font-weight:800;color:#1E293B;">S/ ${val}</div>
                  <input type="number" min="0" step="1" data-denom="${val}" class="arqueo-denom-input" oninput="recalcularArqueo()" placeholder="0" style="width:100%;text-align:center;padding:4px;font-size:0.95rem;font-weight:700;border:1px solid #E2E8F0;border-radius:6px;margin-top:2px;">
                  <div id="sub_denom_${String(val).replace('.','_')}" style="font-size:0.68rem;color:#64748B;margin-top:2px;">S/0.00</div>
                </div>
              `).join('')}
            </div>

            <div style="font-size:0.72rem;font-weight:800;color:#64748B;letter-spacing:0.04em;margin-bottom:6px;">🪙 MONEDAS</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(75px, 1fr));gap:6px;">
              ${[5, 2, 1, 0.5, 0.2, 0.1].map(val => `
                <div style="background:white;padding:6px 4px;border-radius:8px;border:1px solid #CBD5E1;text-align:center;">
                  <div style="font-size:0.72rem;font-weight:800;color:#1E293B;">S/ ${val.toFixed(val < 1 ? 2 : 0)}</div>
                  <input type="number" min="0" step="1" data-denom="${val}" class="arqueo-denom-input" oninput="recalcularArqueo()" placeholder="0" style="width:100%;text-align:center;padding:4px;font-size:0.95rem;font-weight:700;border:1px solid #E2E8F0;border-radius:6px;margin-top:2px;">
                  <div id="sub_denom_${String(val).replace('.','_')}" style="font-size:0.68rem;color:#64748B;margin-top:2px;">S/0.00</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="font-weight:700;font-size:0.9rem;display:flex;justify-content:space-between;">
              <span>Total Efectivo Contado (S/)</span>
              <small style="color:#64748b;font-weight:normal;">(Se auto-calcula o puedes editar)</small>
            </label>
            <input id="cierreContado" type="number" step="0.01" min="0" class="form-control" placeholder="0.00" style="font-size:1.35rem;text-align:center;font-weight:800;color:#0F172A;">
          </div>
          
          <div id="cierreResultado" style="text-align:center;padding:12px;border-radius:10px;display:none;margin-bottom:12px;"></div>

          <div class="form-group" style="margin-bottom:12px;">
            <label style="font-weight:600;font-size:0.85rem;">Notas u observaciones de cierre</label>
            <input id="cierreNotas" class="form-control" placeholder="Opcional (ej: billete deteriorado, gastos pendientes...)">
          </div>

          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <input type="checkbox" id="chkImprimirCorteZ" checked style="width:18px;height:18px;cursor:pointer;">
            <label for="chkImprimirCorteZ" style="font-size:0.85rem;font-weight:700;color:#166534;cursor:pointer;margin:0;">🖨️ Imprimir ticket de Corte Z en ticketera al confirmar</label>
          </div>`;

        body.innerHTML = html;
        body.dataset.esperado = esperado;

        document.getElementById('cierreContado').addEventListener('input', function() {
          evaluarCuadreCierre(parseFloat(this.value) || 0, esperado);
        });

        document.getElementById('modalCierreCaja').classList.add('active');
      } catch (e) {
        showToast('Error al cargar datos de cierre', 'error');
      }
    }

    function recalcularArqueo() {
      let total = 0;
      const inputs = document.querySelectorAll('.arqueo-denom-input');
      inputs.forEach(inp => {
        const denom = parseFloat(inp.dataset.denom) || 0;
        const cant = parseInt(inp.value) || 0;
        const sub = denom * cant;
        total += sub;
        const subEl = document.getElementById('sub_denom_' + String(denom).replace('.','_'));
        if (subEl) subEl.textContent = 'S/' + sub.toFixed(2);
      });

      const inpContado = document.getElementById('cierreContado');
      if (inpContado) {
        inpContado.value = total > 0 ? total.toFixed(2) : '';
        const esperado = parseFloat(document.getElementById('cierreCajaBody')?.dataset?.esperado || 0);
        evaluarCuadreCierre(total, esperado);
      }
    }

    function limpiarArqueo() {
      document.querySelectorAll('.arqueo-denom-input').forEach(inp => {
        inp.value = '';
        const denom = parseFloat(inp.dataset.denom) || 0;
        const subEl = document.getElementById('sub_denom_' + String(denom).replace('.','_'));
        if (subEl) subEl.textContent = 'S/0.00';
      });
      const inpContado = document.getElementById('cierreContado');
      if (inpContado) {
        inpContado.value = '';
        const el = document.getElementById('cierreResultado');
        if (el) el.style.display = 'none';
      }
    }

    function evaluarCuadreCierre(contado, esperado) {
      const el = document.getElementById('cierreResultado');
      if (!el) return;
      const inpVal = document.getElementById('cierreContado')?.value;
      if (!inpVal || inpVal === '') { el.style.display = 'none'; return; }
      el.style.display = 'block';
      const diff = contado - esperado;
      if (Math.abs(diff) < 0.01) {
        el.style.background = '#ECFDF5';
        el.style.color = '#059669';
        el.innerHTML = `<div style="font-size:1.1rem;font-weight:700;">✅ Caja totalmente cuadrada</div>`;
      } else {
        el.style.background = '#FEF2F2';
        el.style.color = '#DC2626';
        const label = diff > 0 ? 'SOBRANTE' : 'FALTANTE';
        el.innerHTML = `<div style="font-size:1.1rem;font-weight:700;">⚠️ ${label}: S/${Math.abs(diff).toFixed(2)}</div>
          <div style="font-size:0.8rem;margin-top:4px;">Esperado: S/${esperado.toFixed(2)} | Contado: S/${contado.toFixed(2)}</div>`;
      }
    }

    function getArqueoDesgloseObj() {
      const out = {};
      document.querySelectorAll('.arqueo-denom-input').forEach(inp => {
        const cant = parseInt(inp.value) || 0;
        if (cant > 0) out[inp.dataset.denom] = cant;
      });
      return Object.keys(out).length > 0 ? out : null;
    }

    async function confirmarCierreCaja() {
      const contado = document.getElementById('cierreContado').value;
      const notas = document.getElementById('cierreNotas')?.value || '';
      const imprimirZ = document.getElementById('chkImprimirCorteZ')?.checked;
      const arqueoDesglose = getArqueoDesgloseObj();

      if (contado === '' || parseFloat(contado) < 0) return showToast('Ingresa el efectivo contado', 'warning');
      if (!currentUser) return showToast('Inicia sesión para cerrar la caja', 'error');

      try {
        const res = await fetch('/api/admin/caja/cerrar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            efectivo_contado: parseFloat(contado),
            notas: notas || null,
            usuario_id: currentUser.id
          })
        });
        if (res.ok) {
          const d = await res.json();
          closeModal('modalCierreCaja');
          const dif = Math.abs(d.sobrante_faltante);
          let msg = `Caja cerrada · Ventas: S/${(d.total_ventas || 0).toFixed(2)} · Esperado: S/${d.efectivo_esperado.toFixed(2)} | Contado: S/${d.efectivo_contado.toFixed(2)}`;
          if (dif > 0.01) {
            msg += ` | ${d.sobrante_faltante > 0 ? 'SOBRANTE' : 'FALTANTE'}: S/${dif.toFixed(2)}`;
          } else {
            msg += ' | Cuadrada ✅';
          }
          showToast(msg, dif > 0.01 ? 'warning' : 'success');

          if (imprimirZ && d.sesion_id) {
            imprimirCorteZ(d.sesion_id, arqueoDesglose);
          }

          loadCaja();
        } else {
          const err = await res.json();
          if (err.mesas && err.mesas.length > 0) {
            const body = document.getElementById('cierreCajaBody');
            body.innerHTML = renderBloqueosCierre(err.mesas);
            const btnConfirmar = document.getElementById('btnConfirmarCierre');
            btnConfirmar.disabled = true;
            btnConfirmar.textContent = '⛔ Resolver mesas pendientes';
            return;
          }
          showToast(err.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function imprimirCorteX() {
      try {
        const res = await fetch('/api/admin/caja/corte-x/imprimir', { method: 'POST' });
        const d = await res.json();
        if (res.ok) {
          showToast('Ticket Corte X (Parcial) emitido correctamente 🖨️', 'success');
        } else {
          showToast(d.error || 'Error al imprimir Corte X', 'warning');
        }
      } catch (e) { showToast('Error de conexión con impresora', 'error'); }
    }

    async function imprimirCorteZ(sesionId = null, arqueoDesglose = null) {
      try {
        const res = await fetch('/api/admin/caja/corte-z/imprimir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sesion_id: sesionId, arqueo_desglose: arqueoDesglose })
        });
        const d = await res.json();
        if (res.ok) {
          showToast('Ticket Corte Z (Cierre) emitido correctamente 🖨️', 'success');
        } else {
          showToast(d.error || 'Error al imprimir Corte Z', 'warning');
        }
      } catch (e) { showToast('Error de conexión con impresora', 'error'); }
    }

    let sesionModalActualId = null;
    function reimprimirCorteZModal() {
      if (sesionModalActualId) imprimirCorteZ(sesionModalActualId);
    }

    function renderBloqueosCierre(mesas) {
      const rows = mesas.map(m => {
        let desc = '';
        let accion = '';
        if (m.tipo === 'COBRAR') {
          desc = `💵 Cobro pendiente: <b>S/${m.pendiente.toFixed(2)}</b>${m.reservada ? ' <small>(mesa reservada)</small>' : ''}`;
          accion = `<a class="btn btn-sm" style="background:#2563EB;color:white;text-decoration:none;flex-shrink:0;" href="/index.html?mesa=${m.id}" target="_blank">💵 Ir a cobrar</a>`;
        } else if (m.tipo === 'LIBERAR') {
          desc = '♻️ Ya está pagada, falta liberar la mesa';
          accion = `<button class="btn btn-sm" style="background:#059669;color:white;" onclick="liberarMesaBloqueo(${m.id})">Liberar</button>`;
        } else {
          desc = '📍 Mesa reservada sin atender';
          accion = `<button class="btn btn-sm" style="background:#D97706;color:white;" onclick="cancelarReservaBloqueo(${m.id})">Cancelar reserva</button>`;
        }
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;background:white;border:1px solid #FECACA;border-radius:8px;margin-bottom:6px;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:0.88rem;">Mesa ${m.numero}${m.nombre ? ' — ' + m.nombre : ''}</div>
            <div style="font-size:0.78rem;color:#DC2626;">${desc}${m.mesero_nombre ? ` · ${m.mesero_nombre}` : ''}</div>
          </div>
          ${accion}
        </div>`;
      }).join('');

      return `
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:16px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:1.1rem;">⛔</span>
            <span style="font-weight:700;color:#B91C1C;">No se puede cerrar la caja</span>
          </div>
          <div style="font-size:0.8rem;color:#DC2626;margin-bottom:10px;">${mesas.length} mesa${mesas.length !== 1 ? 's' : ''} sin liberar o con cobro pendiente. Resuélvelas para continuar:</div>
          ${rows}
          <button class="btn btn-sm" style="background:#7C3AED;color:white;margin-top:10px;width:100%;" onclick="cerrarCaja()">🔄 Verificar de nuevo</button>
        </div>`;
    }

    async function liberarMesaBloqueo(mesaId) {
      try {
        const res = await fetch(`/api/mesas/${mesaId}/liberar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesero_id: currentUser?.id || 1 })
        });
        if (res.ok) {
          showToast('Mesa liberada', 'success');
          cerrarCaja();
        } else {
          const err = await res.json();
          showToast(err.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function cancelarReservaBloqueo(mesaId) {
      try {
        const res = await fetch(`/api/mesas/${mesaId}/cancelar-reserva`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesero_id: currentUser?.id || 1 })
        });
        if (res.ok) {
          showToast('Reserva cancelada', 'success');
          cerrarCaja();
        } else {
          const err = await res.json();
          showToast(err.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    // ---- MOVIMIENTOS DE CAJA ----
    let movimientosFilter = '';
    let movimientosData = [];

    async function loadMovimientos() {
      try {
        const select = document.getElementById('movMetodo');
        if (select && !select.options.length) {
          const metodosMov = ['efectivo', 'yape', 'plin', 'tarjeta', 'transferencia'];
          const metodosCfg = metodosConfigurables().filter(m => !metodosMov.includes(m.key));
          select.innerHTML = [...new Set([...metodosMov, ...metodosCfg.map(m => m.key)])]
            .map(k => { const m = metodosConfigurables().find(x => x.key === k); return `<option value="${k}">${m ? m.label + ' ' + m.texto : k}</option>`; })
            .join('');
        }
        const res = await fetch('/api/admin/caja/movimientos');
        movimientosData = await res.json();
        renderMovimientosResumen();
        renderMovimientosHistorial();
      } catch (e) {
        document.getElementById('movHistorial').innerHTML = '<p class="empty-state">Error al cargar movimientos</p>';
      }
    }

    function labelMovimiento(met) {
      const m = metodosConfigurables().find(x => x.key === met);
      return m ? `${m.label} ${m.texto}`.trim() : met;
    }

    function renderMovimientosResumen() {
      const el = document.getElementById('movResumen');
      let totalIngresos = 0, totalEgresos = 0;
      const porMetodo = {};

      for (const mv of movimientosData) {
        if (mv.tipo === 'INGRESO') totalIngresos += mv.monto;
        else totalEgresos += mv.monto;
        if (!porMetodo[mv.metodo_pago]) porMetodo[mv.metodo_pago] = { ingresos: 0, egresos: 0 };
        porMetodo[mv.metodo_pago][mv.tipo === 'INGRESO' ? 'ingresos' : 'egresos'] += mv.monto;
      }
      const saldo = totalIngresos - totalEgresos;

      let h = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px;">
        <div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid #059669;">
          <div style="font-size:0.75rem;color:#64748b;">Total Ingresos</div>
          <div style="font-size:1.4rem;font-weight:800;color:#059669;">+S/${totalIngresos.toFixed(2)}</div>
        </div>
        <div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid #DC2626;">
          <div style="font-size:0.75rem;color:#64748b;">Total Egresos</div>
          <div style="font-size:1.4rem;font-weight:800;color:#DC2626;">-S/${totalEgresos.toFixed(2)}</div>
        </div>
        <div style="background:white;padding:16px;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border-left:4px solid ${saldo >= 0 ? '#3B82F6' : '#EF4444'};">
          <div style="font-size:0.75rem;color:#64748b;">Saldo del día</div>
          <div style="font-size:1.4rem;font-weight:800;color:${saldo >= 0 ? '#3B82F6' : '#EF4444'};">S/${saldo.toFixed(2)}</div>
        </div>
      </div>`;

      if (Object.keys(porMetodo).length > 0) {
        h += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">`;
        for (const [met, val] of Object.entries(porMetodo)) {
          h += `<div style="background:white;padding:8px 12px;border-radius:8px;font-size:0.8rem;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <strong>${labelMovimiento(met)}</strong>: <span style="color:#059669;">+S/${val.ingresos.toFixed(2)}</span> / <span style="color:#DC2626;">-S/${val.egresos.toFixed(2)}</span>
          </div>`;
        }
        h += `</div>`;
      }
      el.innerHTML = h;
    }

    function renderMovimientosHistorial() {
      const el = document.getElementById('movHistorial');

      let filtered = movimientosData;
      if (movimientosFilter) filtered = movimientosData.filter(m => m.tipo === movimientosFilter);

      if (!filtered.length) {
        el.innerHTML = '<p class="empty-state">Sin movimientos registrados</p>';
        return;
      }

      let h = '<table><thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Método</th><th>Persona</th><th>Registró</th><th></th></tr></thead><tbody>';
      for (const mv of filtered) {
        const hora = new Date(mv.created_at + 'Z').toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const tipoBadge = mv.tipo === 'INGRESO'
          ? '<span class="badge badge-green">INGRESO</span>'
          : '<span class="badge badge-red">EGRESO</span>';
        const montoColor = mv.tipo === 'INGRESO' ? '#059669' : '#DC2626';
        const montoPrefix = mv.tipo === 'INGRESO' ? '+' : '-';
        h += `<tr>
          <td>${hora}</td>
          <td>${tipoBadge}</td>
          <td>${mv.concepto}${mv.notas ? '<br><small style="color:#94a3b8;">' + mv.notas + '</small>' : ''}</td>
          <td style="font-weight:700;color:${montoColor};">${montoPrefix}S/${mv.monto.toFixed(2)}</td>
          <td>${labelMovimiento(mv.metodo_pago)}</td>
          <td>${mv.persona || '-'}</td>
          <td style="font-size:0.8rem;color:#64748b;">${mv.usuario_nombre || '-'}</td>
          <td><button class="btn btn-outline btn-sm" style="color:#DC2626;font-size:0.75rem;" onclick="eliminarMovimiento(${mv.id})">✕</button></td>
        </tr>`;
      }
      h += '</tbody></table>';
      el.innerHTML = h;
    }

    function filtrarMovimientos(tipo) {
      movimientosFilter = tipo;
      document.getElementById('movFiltroTodos').style.fontWeight = tipo === '' ? '700' : '';
      document.getElementById('movFiltroIngresos').style.fontWeight = tipo === 'INGRESO' ? '700' : '';
      document.getElementById('movFiltroEgresos').style.fontWeight = tipo === 'EGRESO' ? '700' : '';
      renderMovimientosHistorial();
    }

    async function registrarMovimiento() {
      const tipo = document.getElementById('movTipo').value;
      const metodo_pago = document.getElementById('movMetodo').value;
      const monto = parseFloat(document.getElementById('movMonto').value);
      const persona = document.getElementById('movPersona').value.trim();
      const concepto = document.getElementById('movConcepto').value.trim();
      const notas = document.getElementById('movNotas').value.trim();

      if (!concepto) return showToast('El concepto es requerido', 'warning');
      if (!monto || monto <= 0) return showToast('Ingresa un monto válido', 'warning');

      try {
        const res = await fetch('/api/admin/caja/movimientos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo, concepto, monto, metodo_pago, persona: persona || null, usuario_id: currentUser?.id || 1, notas: notas || null })
        });
        if (res.ok) {
          showToast(`${tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} registrado`, 'success');
          document.getElementById('movMonto').value = '';
          document.getElementById('movPersona').value = '';
          document.getElementById('movConcepto').value = '';
          document.getElementById('movNotas').value = '';
          await loadMovimientos();
        } else {
          const err = await res.json();
          showToast(err.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function eliminarMovimiento(id) {
      const ok = await customConfirm({
        title: '¿Eliminar Movimiento?',
        message: '¿Estás seguro de eliminar este movimiento de caja?',
        confirmText: 'Sí, eliminar',
        isDanger: true,
        icon: '💸'
      });
      if (!ok) return;
      try {
        await fetch('/api/admin/caja/movimientos/' + id, { method: 'DELETE' });
        showToast('Movimiento eliminado', 'success');
        await loadMovimientos();
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function imprimirMovimientos() {
      try {
        const res = await fetch('/api/admin/caja/movimientos/imprimir');
        const data = await res.json();
        showToast(data.ok ? 'Resumen impreso' : 'Error al imprimir', data.ok ? 'success' : 'warning');
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    // ---- AREAS Y MESAS ----
    async function loadAreasAdmin() {
      try {
        const [areasRes, mesasRes] = await Promise.all([
          fetch('/api/mesas/areas'),
          fetch('/api/mesas')
        ]);
        areasData = await areasRes.json();
        mesasData = await mesasRes.json();
        renderAreasAdmin();
      } catch (e) {
        document.getElementById('areasWrap').innerHTML = '<p class="empty-state">Error al cargar áreas</p>';
      }
    }

    function areaBadge(tipo) {
      if (tipo === 'SALON') return '<span class="badge" style="background:#DBEAFE;color:#1D4ED8;">🪑 Salón</span>';
      if (tipo === 'DELIVERY') return '<span class="badge" style="background:#E0F2FE;color:#0369A1;">🛵 Delivery</span>';
      return '<span class="badge" style="background:#FEF3C7;color:#92400E;">🥡 Para Llevar</span>';
    }

    function renderAreasAdmin() {
      const el = document.getElementById('areasWrap');
      const salones = areasData.filter(a => a.tipo === 'SALON');
      const sinArea = mesasData.filter(m => !m.es_virtual && !m.area_id);

      let h = '';
      for (const a of areasData) {
        const mesasDeArea = mesasData.filter(m => m.area_id === a.id && !m.es_virtual);
        const virtuales = mesasData.filter(m => m.area_id === a.id && m.es_virtual);

        let chips = mesasDeArea.length
          ? mesasDeArea.map(m => `<span style="display:inline-flex;align-items:center;gap:4px;background:${m.estado === 'INACTIVO' ? '#FEE2E2' : '#F1F5F9'};border-radius:8px;padding:4px 10px;font-size:0.8rem;font-weight:600;">
              ${m.nombre || 'Mesa ' + m.numero}
              ${m.estado === 'INACTIVO' ? '<span style="font-size:0.65rem;color:#DC2626;">INACTIVA</span>' : ''}
              ${(m.estado === 'OCUPADO' || m.estado === 'CERRANDO' || m.estado === 'RESERVADO') && !m.tiene_pedido_activo
                ? `<button onclick="liberarMesaAdmin(${m.id})" style="border:none;background:transparent;color:#DC2626;cursor:pointer;font-size:0.85rem;" title="Liberar mesa">🚪</button>` : ''}
              <button onclick="openMesaModal(${m.id})" style="border:none;background:transparent;color:#64748B;cursor:pointer;font-size:0.85rem;" title="Editar mesa">✏️</button>
              ${m.estado === 'INACTIVO'
                ? `<button onclick="toggleMesaEstado(${m.id}, 'LIBRE')" style="border:none;background:transparent;color:#059669;cursor:pointer;font-size:0.85rem;" title="Activar mesa">🟢</button>`
                : !m.tiene_pedido_activo ? `<button onclick="toggleMesaEstado(${m.id}, 'INACTIVO')" style="border:none;background:transparent;color:#94A3B8;cursor:pointer;font-size:0.85rem;" title="Inactivar mesa">🗑️</button>` : ''}
            </span>`).join('')
          : '<span style="color:#94A3B8;font-size:0.8rem;">Sin mesas</span>';

        h += `<div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:18px;margin-bottom:14px;${a.activo ? '' : 'opacity:0.55;'}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-weight:700;font-size:1rem;">${a.nombre} ${areaBadge(a.tipo)}</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:4px;">Orden ${a.orden} · ${mesasDeArea.length} mesas físicas · ${virtuales.length} virtuales ${a.activo ? '' : '· OCULTA'}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <button class="btn btn-outline btn-sm" onclick="toggleAreaActivo(${a.id}, ${a.activo ? 0 : 1})">${a.activo ? '🙈 Ocultar' : '👁️ Mostrar'}</button>
              <button class="btn btn-outline btn-sm" onclick="openAreaModal(${a.id})">✏️ Editar</button>
              <button class="btn btn-outline btn-sm" style="color:#DC2626;" onclick="deleteArea(${a.id})">🗑️</button>
            </div>
          </div>
          ${a.tipo === 'SALON' ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:14px;">
            ${chips}
            <select class="form-control" style="width:auto;font-size:0.8rem;padding:4px 8px;height:32px;" onchange="if(this.value)asignarMesa(this.value, ${a.id});this.value='';">
              <option value="">+ Mover mesa aquí</option>
              ${mesasData.filter(m => !m.es_virtual && (m.area_id !== a.id)).map(m => `<option value="${m.id}">${m.nombre || 'Mesa ' + m.numero}${m.area_nombre ? ' (' + m.area_nombre + ')' : ' (sin área)'}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>`;
      }

      if (sinArea.length) {
        h += `<div style="background:#FEF2F2;border:1px dashed #FCA5A5;border-radius:12px;padding:18px;margin-bottom:14px;">
          <div style="font-weight:700;color:#991B1B;font-size:0.9rem;margin-bottom:8px;">⚠️ ${sinArea.length} mesa(s) sin área asignada</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
            ${sinArea.map(m => `<span style="display:inline-flex;align-items:center;gap:4px;background:white;border:1px solid #FECACA;border-radius:8px;padding:4px 10px;font-size:0.8rem;font-weight:600;">${m.nombre || 'Mesa ' + m.numero}</span>`).join('')}
          </div>
        </div>`;
      }

      if (!salones.length) {
        h = '<p class="empty-state">No hay áreas. Crea al menos un Salón.</p>' + h;
      }
      el.innerHTML = h;
    }

    let editingMesaId = null;

    async function liberarMesaAdmin(mesaId) {
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
          body: JSON.stringify({ mesero_id: currentUser?.id || 1 })
        });
        if (res.ok) {
          showToast('Mesa liberada', 'success');
          loadAreasAdmin();
        } else {
          const err = await res.json();
          showToast(err.error || 'Error al liberar', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    function openMesaModal(id) {
      editingMesaId = id || null;
      const mesa = id ? mesasData.find(m => m.id === id) : null;
      const sel = document.getElementById('mesaArea');
      sel.innerHTML = '';
      for (const a of areasData.filter(a => a.tipo === 'SALON' && a.activo)) {
        sel.innerHTML += `<option value="${a.id}">${a.nombre}</option>`;
      }
      if (areasData.some(a => a.tipo === 'SALON' && !a.activo)) {
        sel.innerHTML += '<option value="">— Oculto —</option>';
      }
      document.getElementById('modalMesaTitle').textContent = mesa ? `Editar mesa ${mesa.nombre || mesa.numero}` : 'Nueva mesa';
      document.getElementById('mesaNumero').value = mesa ? mesa.numero : '';
      document.getElementById('mesaNombre').value = mesa ? (mesa.nombre || '') : '';
      document.getElementById('mesaCapacidad').value = mesa ? mesa.capacidad : '4';
      sel.value = mesa ? (mesa.area_id || '') : '';
      sel.disabled = !!mesa && !!mesa.tiene_pedido_activo;
      document.getElementById('mesaError').style.display = 'none';
      closeAllModals();
      document.getElementById('modalMesa').classList.add('active');
    }

    async function saveMesa() {
      const numero = document.getElementById('mesaNumero').value;
      const nombre = document.getElementById('mesaNombre').value.trim();
      const capacidad = document.getElementById('mesaCapacidad').value;
      const area_id = document.getElementById('mesaArea').value;
      const errEl = document.getElementById('mesaError');

      const body = {
        numero: numero ? parseInt(numero) : null,
        nombre: nombre || null,
        capacidad: capacidad ? parseInt(capacidad) : 4,
        area_id: area_id ? parseInt(area_id) : null
      };
      try {
        const res = await fetch(editingMesaId ? `/api/mesas/${editingMesaId}` : '/api/mesas', {
          method: editingMesaId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          showToast(editingMesaId ? 'Mesa actualizada' : 'Mesa creada', 'success');
          closeModal('modalMesa');
          await loadAreasAdmin();
        } else {
          const e = await res.json();
          errEl.textContent = e.error || 'Error';
          errEl.style.display = 'block';
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function toggleMesaEstado(mesaId, estado) {
      const accion = estado === 'INACTIVO' ? 'inactivar' : 'activar';
      const ok = await customConfirm({
        title: `¿${accion === 'inactivar' ? 'Inactivar' : 'Activar'} Mesa?`,
        message: `¿Deseas ${accion} esta mesa?`,
        confirmText: accion === 'inactivar' ? 'Sí, inactivar' : 'Sí, activar',
        isDanger: accion === 'inactivar'
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/mesas/${mesaId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado, mesero_id: currentUser?.id || 1 })
        });
        if (res.ok) {
          showToast(accion === 'inactivar' ? 'Mesa inactivada' : 'Mesa activada', 'success');
          await loadAreasAdmin();
        } else {
          const e = await res.json();
          showToast(e.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    function openAreaModal(id) {
      editingAreaId = id || null;
      const area = id ? areasData.find(a => a.id === id) : null;
      document.getElementById('modalAreaTitle').textContent = area ? 'Editar área' : 'Nueva área';
      document.getElementById('areaNombre').value = area ? area.nombre : '';
      document.getElementById('areaTipo').value = area ? area.tipo : 'SALON';
      document.getElementById('areaTipo').disabled = !!area && area.tipo !== 'SALON';
      document.getElementById('areaOrden').value = area ? area.orden : '';
      document.getElementById('areaError').style.display = 'none';
      closeAllModals();
      document.getElementById('modalArea').classList.add('active');
    }

    async function saveArea() {
      const nombre = document.getElementById('areaNombre').value.trim();
      const tipo = document.getElementById('areaTipo').value;
      const orden = document.getElementById('areaOrden').value;
      const errEl = document.getElementById('areaError');
      if (!nombre) { errEl.textContent = 'El nombre es requerido'; errEl.style.display = 'block'; return; }

      const body = { nombre, tipo, orden: orden ? parseInt(orden) : null };
      try {
        const res = await fetch(editingAreaId ? `/api/mesas/areas/${editingAreaId}` : '/api/mesas/areas', {
          method: editingAreaId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          showToast(editingAreaId ? 'Área actualizada' : 'Área creada', 'success');
          closeModal('modalArea');
          await loadAreasAdmin();
        } else {
          const e = await res.json();
          errEl.textContent = e.error || 'Error';
          errEl.style.display = 'block';
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function deleteArea(id) {
      const ok = await customConfirm({
        title: '¿Eliminar Área?',
        message: '¿Eliminar esta área? Las mesas asignadas se moverán a estado sin área.',
        confirmText: 'Sí, eliminar',
        isDanger: true,
        icon: '🗺️'
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/mesas/areas/${id}`, { method: 'DELETE' });
        if (res.ok) {
          showToast('Área eliminada', 'success');
          await loadAreasAdmin();
        } else {
          const e = await res.json();
          showToast(e.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function toggleAreaActivo(id, activo) {
      try {
        const res = await fetch(`/api/mesas/areas/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo })
        });
        if (res.ok) {
          showToast(activo ? 'Área visible' : 'Área oculta', 'success');
          await loadAreasAdmin();
        } else {
          const e = await res.json();
          showToast(e.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    async function asignarMesa(mesaId, areaId) {
      try {
        const res = await fetch(`/api/mesas/${mesaId}/area`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ area_id: areaId })
        });
        if (res.ok) {
          showToast('Mesa asignada', 'success');
          await loadAreasAdmin();
        } else {
          const e = await res.json();
          showToast(e.error || 'Error', 'error');
        }
      } catch (e) { showToast('Error de conexión', 'error'); }
    }

    // ---- HELPERS ----
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }
    function toggleSection(id) {
      const el = document.getElementById(id);
      const toggle = document.getElementById('toggle' + id.charAt(0).toUpperCase() + id.slice(1));
      if (el.style.display === 'none') { el.style.display = 'block'; toggle.textContent = '▼'; }
      else { el.style.display = 'none'; toggle.textContent = '▶'; }
    }
    function closeAllModals() {
      document.querySelectorAll('.modal-overlay.admin-modal').forEach(m => m.classList.remove('active'));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllModals();
    });

    // ---- INIT ----
    (async function() {
      await loadCategorias();
      await loadProductos();
      renderCategorias();
    })();

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
    }    function toggleAdminMenu(forceClose = false) {
      const sidebar = document.querySelector('.admin-sidebar');
      const overlay = document.getElementById('mobileMenuOverlay');
      if (forceClose) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        return;
      }
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    }


