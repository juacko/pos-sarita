const socket = io();

socket.on('connect', () => {
  console.log('Conectado al servidor');
});

socket.on('disconnect', () => {
  console.log('Desconectado del servidor');
});

socket.on('mesa:updated', (mesa) => {
  const cards = document.querySelectorAll(`.mesa-card[data-id="${mesa.id}"]`);
  cards.forEach(card => updateMesaCard(card, mesa));

  const event = new CustomEvent('mesa-updated', { detail: mesa });
  document.dispatchEvent(event);
});

socket.on('pedido:nuevo', (data) => {
  const event = new CustomEvent('pedido-nuevo', { detail: data });
  document.dispatchEvent(event);
});

socket.on('pedido:actualizado', (pedido) => {
  const event = new CustomEvent('pedido-actualizado', { detail: pedido });
  document.dispatchEvent(event);
});

socket.on('item:actualizado', (item) => {
  const event = new CustomEvent('item-actualizado', { detail: item });
  document.dispatchEvent(event);
});

function updateMesaCard(card, mesa) {
  card.className = `mesa-card ${mesa.estado}`;
  card.querySelector('.mesa-status').textContent = mesa.estado;

  const meseroEl = card.querySelector('.mesa-mesero');
  if (meseroEl) {
    meseroEl.textContent = mesa.mesero_nombre ? `Mesero: ${mesa.mesero_nombre}` : '';
  }
}
