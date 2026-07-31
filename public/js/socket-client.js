const socket = io();

socket.on('connect', () => {
  console.log('Conectado al servidor');
});

socket.on('disconnect', () => {
  console.log('Desconectado del servidor');
});

function updateMesaCard(card, mesa) {
  card.className = `mesa-card ${mesa.estado}`;
  card.querySelector('.mesa-status').textContent = mesa.estado;

  const meseroEl = card.querySelector('.mesa-mesero');
  if (meseroEl) {
    meseroEl.textContent = mesa.mesero_nombre ? `Mesero: ${mesa.mesero_nombre}` : '';
  }
}
