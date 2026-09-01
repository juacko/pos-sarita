/**
 * POS Sarita - Sistema de Modales y Diálogos Personalizados ("Elegant & Fun")
 * Reemplaza los popups nativos confirm(), prompt() y alert() del navegador por modales estilizados.
 */

// Interceptor global de fetch para enviar el header x-session-token si hay usuario en localStorage
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    try {
      const savedUser = localStorage.getItem('posUser');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        if (user) {
          options = options || {};
          options.headers = options.headers || {};
          if (options.headers instanceof Headers) {
            if (user.token && !options.headers.has('x-session-token')) {
              options.headers.append('x-session-token', user.token);
            }
            if (user.id && !options.headers.has('x-user-id')) {
              options.headers.append('x-user-id', String(user.id));
            }
          } else {
            if (user.token) {
              options.headers['x-session-token'] = options.headers['x-session-token'] || user.token;
            }
            if (user.id) {
              options.headers['x-user-id'] = options.headers['x-user-id'] || String(user.id);
            }
          }
        }
      }
    } catch (e) {}
    return originalFetch.call(this, url, options);
  };
})();

window.customConfirm = function({
  title = '¿Confirmar Acción?',
  message = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDanger = false,
  icon = '❓'
} = {}) {
  return new Promise((resolve) => {
    // Eliminar modal existente si lo hay
    const oldModal = document.getElementById('customConfirmModalOverlay');
    if (oldModal) oldModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customConfirmModalOverlay';
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999999';

    const btnConfirmClass = isDanger ? 'btn-danger' : 'btn-primary';
    const iconBg = isDanger ? 'var(--danger-light)' : 'var(--primary-light)';
    const iconColor = isDanger ? 'var(--danger)' : 'var(--primary)';

    overlay.innerHTML = `
      <div class="modal modal-confirm-box" style="max-width: 440px; border-radius: var(--radius-lg); text-align: center; padding: 28px 24px;">
        <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: var(--radius-full); background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; box-shadow: var(--shadow-sm);">
          ${isDanger ? '⚠️' : icon}
        </div>
        <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 800; color: var(--text-dark); margin-bottom: 8px;">
          ${title}
        </h3>
        <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px; white-space: pre-line;">
          ${message}
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="customConfirmCancelBtn" class="btn btn-outline" style="flex: 1; padding: 12px;">${cancelText}</button>
          <button id="customConfirmOkBtn" class="btn ${btnConfirmClass}" style="flex: 1; padding: 12px;">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (value) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 150);
      resolve(value);
    };

    document.getElementById('customConfirmCancelBtn').onclick = () => cleanup(false);
    document.getElementById('customConfirmOkBtn').onclick = () => cleanup(true);

    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
  });
};

window.customPrompt = function({
  title = 'Ingrese Información',
  message = '',
  placeholder = '',
  defaultValue = '',
  required = false,
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  icon = '✏️'
} = {}) {
  return new Promise((resolve) => {
    const oldModal = document.getElementById('customPromptModalOverlay');
    if (oldModal) oldModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customPromptModalOverlay';
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999999';

    overlay.innerHTML = `
      <div class="modal" style="max-width: 450px; border-radius: var(--radius-lg); padding: 24px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--primary-light); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
            ${icon}
          </div>
          <div>
            <h3 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; color: var(--text-dark);">${title}</h3>
            ${message ? `<p style="font-size: 0.82rem; color: var(--text-muted);">${message}</p>` : ''}
          </div>
        </div>
        <form id="customPromptForm" style="margin-top: 12px;">
          <div class="form-group" style="margin-bottom: 20px;">
            <input type="text" id="customPromptInput" class="form-control" placeholder="${placeholder}" value="${defaultValue}" style="font-size: 0.95rem; padding: 12px 14px;" ${required ? 'required' : ''}>
            <div id="customPromptError" style="color: var(--danger); font-size: 0.78rem; margin-top: 4px; display: none;">Este campo es obligatorio</div>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" id="customPromptCancelBtn" class="btn btn-outline">${cancelText}</button>
            <button type="submit" id="customPromptOkBtn" class="btn btn-primary">${confirmText}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = document.getElementById('customPromptInput');
    input.focus();
    input.select();

    const cleanup = (value) => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 150);
      resolve(value);
    };

    document.getElementById('customPromptCancelBtn').onclick = () => cleanup(null);

    document.getElementById('customPromptForm').onsubmit = (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (required && !val) {
        document.getElementById('customPromptError').style.display = 'block';
        return;
      }
      cleanup(val);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(null);
    };
  });
};

window.customAlert = function({
  title = 'Notificación',
  message = '',
  type = 'info', // 'info' | 'success' | 'warning' | 'danger'
  confirmText = 'Entendido'
} = {}) {
  return new Promise((resolve) => {
    const oldModal = document.getElementById('customAlertModalOverlay');
    if (oldModal) oldModal.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customAlertModalOverlay';
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '999999';

    let icon = 'ℹ️';
    let iconBg = 'var(--info-light)';
    let iconColor = 'var(--info)';

    if (type === 'success') {
      icon = '✅';
      iconBg = 'var(--success-light)';
      iconColor = 'var(--success)';
    } else if (type === 'warning') {
      icon = '⚠️';
      iconBg = 'var(--warning-light)';
      iconColor = 'var(--warning)';
    } else if (type === 'danger' || type === 'error') {
      icon = '❌';
      iconBg = 'var(--danger-light)';
      iconColor = 'var(--danger)';
    }

    overlay.innerHTML = `
      <div class="modal" style="max-width: 420px; border-radius: var(--radius-lg); text-align: center; padding: 28px 24px;">
        <div style="width: 52px; height: 52px; margin: 0 auto 14px; border-radius: var(--radius-full); background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 1.6rem; box-shadow: var(--shadow-sm);">
          ${icon}
        </div>
        <h3 style="font-family: var(--font-display); font-size: 1.2rem; font-weight: 800; color: var(--text-dark); margin-bottom: 8px;">
          ${title}
        </h3>
        <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px; white-space: pre-line;">
          ${message}
        </p>
        <button id="customAlertOkBtn" class="btn btn-primary btn-block" style="padding: 11px;">${confirmText}</button>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 150);
    };

    document.getElementById('customAlertOkBtn').onclick = () => {
      cleanup();
      resolve();
    };
  });
};

/**
 * Modal Post-Pago para confirmar la emisión de ticket (ahorro de papel) y la liberación de mesa.
 */
window.mostrarModalPostPago = function({ pedidoId, mesaId, mesaNumero, configPostPago, onComplete }) {
  const cfg = configPostPago || {};
  const modoMesa = cfg.liberar_mesa || 'preguntar';
  const modoTicket = cfg.imprimir_ticket || 'preguntar';
  const ticketDefecto = cfg.ticket_marcado_defecto === true || modoTicket === 'si';

  // Si la configuración no requiere preguntar, procesar directamente
  if (modoMesa !== 'preguntar' && modoTicket !== 'preguntar') {
    const acciones = [];
    if (modoTicket === 'si' && pedidoId) {
      acciones.push(fetch(`/api/pedidos/${pedidoId}/reimprimir`, { method: 'POST' }).catch(console.error));
    }
    if (modoMesa === 'si' && mesaId) {
      acciones.push(fetch(`/api/mesas/${mesaId}/liberar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesero_id: null })
      }).catch(console.error));
    }
    Promise.all(acciones).then(() => { if (onComplete) onComplete(); });
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '999999';

  const checkMesa = modoMesa !== 'no' ? 'checked' : '';
  const checkTicket = ticketDefecto ? 'checked' : '';
  const textoMesa = mesaNumero ? `Mesa ${mesaNumero}` : 'la mesa';

  overlay.innerHTML = `
    <div class="modal" style="max-width: 440px; border-radius: var(--radius-lg); text-align: left; padding: 24px 24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:46px;height:46px;border-radius:12px;background:#ECFDF5;color:#059669;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">
          ✅
        </div>
        <div>
          <h3 style="font-size:1.15rem;font-weight:800;color:#1E293B;margin:0;">¡Pago Registrado!</h3>
          <div style="font-size:0.8rem;color:#64748B;">Acciones adicionales post-pago</div>
        </div>
      </div>

      <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:20px;display:flex;flex-direction:column;gap:14px;">
        <label style="display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none;">
          <input type="checkbox" id="postPagoCheckTicket" ${checkTicket} style="width:20px;height:20px;accent-color:#3B82F6;">
          <div>
            <div style="font-weight:700;font-size:0.9rem;color:#334155;">🖨️ Imprimir Ticket de Venta</div>
            <div style="font-size:0.75rem;color:#64748B;">Emitir nota de venta en la impresora de caja.</div>
          </div>
        </label>

        <div style="border-top:1px solid #E2E8F0;"></div>

        <label style="display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none;">
          <input type="checkbox" id="postPagoCheckMesa" ${checkMesa} style="width:20px;height:20px;accent-color:#10B981;">
          <div>
            <div style="font-weight:700;font-size:0.9rem;color:#334155;">🪑 Liberar ${textoMesa} inmediatamente</div>
            <div style="font-size:0.75rem;color:#64748B;">Cambiar estado de la mesa a LIBRE para nuevos clientes.</div>
          </div>
        </label>
      </div>

      <button id="postPagoConfirmBtn" class="btn btn-primary btn-block" style="padding:12px;font-size:0.95rem;font-weight:700;">
        ✔ Confirmar y Continuar
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('postPagoConfirmBtn').onclick = async () => {
    const doTicket = document.getElementById('postPagoCheckTicket').checked;
    const doMesa = document.getElementById('postPagoCheckMesa').checked;

    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 150);

    const promesas = [];
    if (doTicket && pedidoId) {
      promesas.push(fetch(`/api/pedidos/${pedidoId}/reimprimir`, { method: 'POST' }).catch(console.error));
    }
    if (doMesa && mesaId) {
      promesas.push(fetch(`/api/mesas/${mesaId}/liberar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesero_id: null })
      }).catch(console.error));
    }

    await Promise.all(promesas);
    if (onComplete) onComplete();
  };
};
