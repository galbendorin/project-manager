const PRECACHE_VERSION = '__PM_CACHE_VERSION__';
const PRECACHE_URLS = /* __PM_PRECACHE_MANIFEST__ */ [];
const SHELL_CACHE_PREFIX = 'pmworkspace-shell-';
const SHELL_CACHE_NAME = `${SHELL_CACHE_PREFIX}${PRECACHE_VERSION}`;
const APP_SHELL_URL = '/index.html';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URL_SET = new Set(PRECACHE_URLS);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (PRECACHE_URLS.length === 0) return;
    const cache = await caches.open(SHELL_CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE_NAME)
      .map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

const loadNavigation = async (event) => {
  try {
    const preloadedResponse = await event.preloadResponse;
    if (preloadedResponse) return preloadedResponse;
    return await fetch(event.request);
  } catch {
    return (await caches.match(APP_SHELL_URL))
      || (await caches.match(OFFLINE_URL))
      || Response.error();
  }
};

const loadPrecachedAsset = async (requestUrl) => {
  const cachedResponse = await caches.match(requestUrl.pathname);
  if (cachedResponse) return cachedResponse;

  const response = await fetch(requestUrl.toString());
  if (response?.ok) {
    const cache = await caches.open(SHELL_CACHE_NAME);
    await cache.put(requestUrl.pathname, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(loadNavigation(event));
    return;
  }

  if (PRECACHE_URL_SET.has(requestUrl.pathname)) {
    event.respondWith(loadPrecachedAsset(requestUrl));
  }
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
