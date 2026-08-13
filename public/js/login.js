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
  currentUser = null;
  localStorage.removeItem('posUser');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  clearPin();
}

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('posUser');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appContent').style.display = 'block';
      updateUserInfo();
    } catch (e) {
      localStorage.removeItem('posUser');
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
