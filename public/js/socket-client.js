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

socket.on('mesa:updated', () => {
  if (typeof loadMesas === 'function') {
    loadMesas();
  }
});

socket.on('stock:actualizado', (data) => {
  if (typeof productos !== 'undefined' && Array.isArray(productos)) {
    const p = productos.find(x => x.id === data.producto_id);
    if (p) {
      p.controlar_stock = data.controlar_stock;
      p.stock_actual = data.stock_actual;
      p.stock_minimo = data.stock_minimo;
      if (typeof renderProductos === 'function') renderProductos();
      if (typeof renderListaStockRapido === 'function') renderListaStockRapido();
    }
  }
});
