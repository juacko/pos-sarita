// POS Sarita - Service Worker (Estrategia Network-First para POS de Restaurante)
const CACHE_NAME = 'pos-sarita-v2';
const STATIC_ASSETS = [
  '/',
  '/mesero.html',
  '/css/style.css',
  '/manifest.json',
  '/js/modal-utils.js',
  '/js/socket-client.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Ignorar esquemas no soportados por Cache Storage (extensiones del navegador, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // NUNCA cachear llamadas a la API ni WebSockets: siempre fresco desde el servidor
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Network-First para vistas HTML y assets: intenta la red, si falla por estar desconectado usa cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guardar copia fresca en cache si la respuesta es válida
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/mesero.html');
          }
        });
      })
  );
});
