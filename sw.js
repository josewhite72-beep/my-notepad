// Subir este número en cada despliegue para forzar la actualización del caché
const CACHE_NAME = 'cuaderno-v6';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './styles/app.css',
  './fonts/caveat.woff2',
  './src/main.js',
  './src/utils.js',
  './src/blocks.js',
  './src/editor.js',
  './src/db/database.js',
  './src/db/notes.js',
  './src/db/events.js',
  './src/views/hoy.js',
  './src/views/notas.js',
  './src/views/agenda.js',
  './src/views/cards.js',
  './src/services/reminders.js',
  './src/services/images.js',
  './src/services/inbox.js',
  './src/services/backup.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- Compartir desde otras apps (Web Share Target) ----------
// Lo compartido se guarda en una "bandeja" aparte; la app lo recoge al abrirse.
const INBOX_DB = 'cuaderno-inbox';

function openInbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(INBOX_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('items')) {
        req.result.createObjectStore('items', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function handleShare(request) {
  let status = '1';
  try {
    const form = await request.formData();
    const files = form.getAll('media').filter(f => f && typeof f !== 'string' && f.size > 0);
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: String(form.get('title') || ''),
      text: String(form.get('text') || ''),
      url: String(form.get('url') || ''),
      files,
      createdAt: Date.now()
    };
    const db = await openInbox();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.error('Share target:', err);
    status = 'error';
  }
  return Response.redirect(new URL(`./?share=${status}`, self.registration.scope).href, 303);
}

// Stale-while-revalidate: responde rápido desde caché y actualiza en segundo plano
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith(handleShare(req));
    return;
  }

  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req)
          .then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});

// Al tocar una notificación, abrir o enfocar la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});
