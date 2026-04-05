const SHELL_CACHE = 'pmworkspace-shell-v3';
const RUNTIME_CACHE = 'pmworkspace-runtime-v3';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/favicon-16.png',
  '/favicon-32.png',
  '/pmworkspace-icon-192.png',
  '/pmworkspace-icon-512.png',
  OFFLINE_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(async () => {
          const cachedApp = await caches.match('/index.html');
          return cachedApp || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  const isStaticAsset = ['style', 'script', 'image', 'font'].includes(request.destination);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data?.json?.() || {};
  } catch {
    data = {
      title: 'PM Workspace',
      body: event.data?.text?.() || 'You have a new update.',
    };
  }

  const title = data.title || 'PM Workspace';
  const options = {
    body: data.body || 'You have a new update.',
    icon: data.icon || '/pmworkspace-icon-192.png',
    badge: data.badge || '/pmworkspace-icon-192.png',
    tag: data.tag || 'pmworkspace-update',
    data: {
      url: data?.data?.url || '/shopping',
      ...data?.data,
    },
  };

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clientList.map((client) => client.postMessage({
      type: 'shopping-list-updated',
      projectId: options?.data?.projectId || '',
      url: options?.data?.url || '/shopping',
    })));
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification?.data?.url || '/shopping', self.location.origin).toString();

  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      const clientUrl = new URL(client.url);
      if (clientUrl.origin === self.location.origin) {
        client.postMessage({
          type: 'shopping-list-open',
          projectId: event.notification?.data?.projectId || '',
          url: event.notification?.data?.url || '/shopping',
        });
        if ('focus' in client) {
          await client.focus();
        }
        if ('navigate' in client) {
          await client.navigate(targetUrl);
        }
        return;
      }
    }

    if (clients.openWindow) {
      await clients.openWindow(targetUrl);
    }
  })());
});
