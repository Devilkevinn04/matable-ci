const CACHE_NAME = 'matable-ci-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/social-share.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { title: 'MaTable.ci', body: event.data?.text() || 'Vous avez une nouvelle notification.' };
  }
  const title = typeof message.title === 'string' ? message.title : 'MaTable.ci';
  const body = typeof message.body === 'string' ? message.body : 'Vous avez une nouvelle notification.';
  const requestedUrl = typeof message.url === 'string' ? message.url : '/merchant';
  const url = requestedUrl.startsWith('/') && !requestedUrl.startsWith('//') && !requestedUrl.includes('\\')
    ? requestedUrl
    : '/merchant';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: typeof message.tag === 'string' ? message.tag : 'matable-notification',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/merchant';
  const targetUrl = new URL(
    requestedUrl.startsWith('/') && !requestedUrl.startsWith('//') && !requestedUrl.includes('\\') ? requestedUrl : '/merchant',
    self.location.origin,
  ).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client && client.url !== targetUrl) await client.navigate(targetUrl);
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  }));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then((cached) => (
        cached || caches.match('/offline.html')
      )))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (!response.ok) {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/offline.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
