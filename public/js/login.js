let pinBuffer = '';

function pressPin(num) {
  pinBuffer += num;
  document.getElementById('pinDisplay').value = pinBuffer;
}

function clearPin() {
  pinBuffer = '';
  document.getElementById('pinDisplay').value = '';
  document.getElementById('loginError').textContent = '';
}

async function submitPin() {
  if (pinBuffer.length === 0) return;

  try {
    const res = await fetch('/api/usuarios/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinBuffer })
    });

    if (res.ok) {
      const user = await res.json();
      currentUser = user;
      localStorage.setItem('posUser', JSON.stringify(user));

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appContent').style.display = 'block';
      updateUserInfo();
      initApp();
      document.dispatchEvent(new Event('pos-login-done'));

      showToast(`Bienvenido ${user.nombre}`, 'success');
    } else {
      const err = await res.json();
      document.getElementById('loginError').textContent = err.error || 'PIN incorrecto';
      clearPin();
    }
  } catch (err) {
    document.getElementById('loginError').textContent = 'Error de conexión';
    clearPin();
  }
}

function updateUserInfo() {
  const el = document.getElementById('userInfo');
  if (el && currentUser) {
    el.innerHTML = `<span class="badge badge-blue">${currentUser.nombre}</span> <small>${currentUser.rol}</small>`;
  }
}

function logout() {
  fetch('/api/usuarios/logout', { method: 'POST' }).catch(() => {});
  currentUser = null;
  localStorage.removeItem('posUser');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  clearPin();
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('expired') === '1') {
    localStorage.removeItem('posUser');
    currentUser = null;
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.textContent = 'Tu sesión ha expirado. Ingresa tu PIN nuevamente.';
    if (window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    return;
  }

  const saved = localStorage.getItem('posUser');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      window.currentUser = currentUser;

      // Restaurar interfaz inmediatamente para evitar parpadeo y pedir PIN
      const loginScreen = document.getElementById('loginScreen');
      const appContent = document.getElementById('appContent');
      if (loginScreen) loginScreen.style.display = 'none';
      if (appContent) appContent.style.display = 'block';
      updateUserInfo();
      // initApp() es ejecutado de forma unificada por mesas.js al cargar el DOM

      // Validar con el backend en segundo plano que la sesión sigue activa
      fetch('/api/usuarios/me')
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            currentUser = { ...currentUser, ...data.usuario };
            window.currentUser = currentUser;
            updateUserInfo();
          } else if (res.status === 401) {
            // Sesión expirada o token inválido en el servidor
            currentUser = null;
            window.currentUser = null;
            localStorage.removeItem('posUser');
            if (loginScreen) loginScreen.style.display = 'flex';
            if (appContent) appContent.style.display = 'none';
            const loginError = document.getElementById('loginError');
            if (loginError) loginError.textContent = 'Tu sesión ha expirado. Ingresa tu PIN nuevamente.';
            clearPin();
          }
        })
        .catch(() => {
          // En caso de corte momentáneo de red/offline, no desloguear abruptamente
        });
    } catch (e) {
      localStorage.removeItem('posUser');
      currentUser = null;
      window.currentUser = null;
      const loginScreen = document.getElementById('loginScreen');
      const appContent = document.getElementById('appContent');
      if (loginScreen) loginScreen.style.display = 'flex';
      if (appContent) appContent.style.display = 'none';
    }
  }

  document.addEventListener('keydown', (e) => {
    if (document.getElementById('loginScreen').style.display !== 'none') {
      if (e.key >= '0' && e.key <= '9') pressPin(e.key);
      if (e.key === 'Enter') submitPin();
      if (e.key === 'Backspace') {
        pinBuffer = pinBuffer.slice(0, -1);
        document.getElementById('pinDisplay').value = pinBuffer;
      }
      if (e.key === 'Escape') clearPin();
    }
  });
});
