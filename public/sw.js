const PRECACHE_VERSION = '__PM_CACHE_VERSION__';
const PRECACHE_URLS = /* __PM_PRECACHE_MANIFEST__ */ [];
const SHELL_CACHE_PREFIX = 'pmworkspace-shell-';
const SHELL_CACHE_NAME = `${SHELL_CACHE_PREFIX}${PRECACHE_VERSION}`;
const APP_SHELL_URL = '/index.html';
const OFFLINE_URL = '/offline.html';
const PRECACHE_URL_SET = new Set(PRECACHE_URLS);
const NAVIGATION_TIMEOUT_MS = 2500;
const CACHE_TIMEOUT_MS = 1000;

const withCacheDeadline = async (operation) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), CACHE_TIMEOUT_MS); }),
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};

const isValidAsset = (response, pathname) => {
  if (!response?.ok || response.redirected) return false;
  const contentType = response.headers.get('content-type') || '';
  if (/\.m?js$/.test(pathname)) return /(?:java|ecma)script/i.test(contentType);
  if (/\.css$/.test(pathname)) return /text\/css/i.test(contentType);
  return true;
};

const readShellCache = (url) => withCacheDeadline(async () => {
  const cache = await caches.open(SHELL_CACHE_NAME);
  return await cache.match(url);
});

const hasLegacyShell = () => withCacheDeadline(async () => {
  const keys = (await caches.keys()).filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE_NAME);
  for (const key of keys.reverse()) {
    const cache = await caches.open(key);
    if (await cache.match(APP_SHELL_URL)) return !(await cache.match('/app-bootstrap.js'));
  }
  return false;
});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (PRECACHE_URLS.length === 0) return;
    // Revalidate stable URLs, and reject SPA fallback HTML returned for missing
    // scripts. An incomplete deployment must never replace a working worker.
    const responses = await Promise.all(PRECACHE_URLS.map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!isValidAsset(response, url)) throw new Error(`Invalid precache response: ${url}`);
      return [url, response];
    }));
    const cache = await caches.open(SHELL_CACHE_NAME);
    try {
      const writes = await Promise.allSettled(responses.map(([url, response]) => cache.put(url, response)));
      const failedWrite = writes.find((result) => result.status === 'rejected');
      if (failedWrite) throw failedWrite.reason;
    } catch (error) {
      // A partial cache must not count as a previous working version. Worker
      // source is included in the build hash, so this cannot be the active cache.
      await withCacheDeadline(() => caches.delete(SHELL_CACHE_NAME));
      throw error;
    }
    // Legacy pages with a broken module graph cannot run the Update button.
    // Adopt this first recovery-capable worker without discarding their assets.
    if (await hasLegacyShell()) await self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const migratingLegacyShell = await hasLegacyShell();
    // Keep the previous two versions for pages still open during an update.
    // Only hashed assets may be read from them; HTML always belongs to this worker.
    await withCacheDeadline(async () => {
      const keys = (await caches.keys()).filter((key) => key.startsWith(SHELL_CACHE_PREFIX));
      const previousKeys = keys.filter((key) => key !== SHELL_CACHE_NAME);
      const completeKeys = [];
      for (const key of previousKeys) {
        if (await (await caches.open(key)).match(APP_SHELL_URL)) completeKeys.push(key);
      }
      const retained = new Set(completeKeys.slice(-2));
      await Promise.all(previousKeys.filter((key) => !retained.has(key)).map((key) => caches.delete(key)));
    });
    await self.clients.claim();
    if (migratingLegacyShell) {
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map(async (client) => {
        const url = new URL(client.url);
        // Only retry windows that already requested automatic recovery. Keep
        // healthy open pages and any unfinished editing sessions in place.
        if (url.origin === self.location.origin && url.searchParams.has('pmw-recover')) {
          try { await client.navigate(url.toString()); } catch { /* Closed window. */ }
        }
      }));
    }
  })());
});

const loadNavigation = async (event) => {
  let timeout;
  try {
    // Normal Safari windows should see the latest deployment too. Bound network
    // waiting so a weak connection still opens the installed offline shell.
    const response = await Promise.race([
      fetch(new Request(event.request, { cache: 'no-store' })),
      new Promise((resolve) => { timeout = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS); }),
    ]);
    if (response?.ok && /text\/html/i.test(response.headers.get('content-type') || '')) return response;
  } catch {
    // Fall back to the complete shell installed by this worker.
  } finally {
    clearTimeout(timeout);
  }
  return (await readShellCache(APP_SHELL_URL))
    || (await readShellCache(OFFLINE_URL))
    || Response.error();
};

const loadPrecachedAsset = async (requestUrl, event) => {
  const pathname = requestUrl.pathname;
  const cachedResponse = await withCacheDeadline(async () => {
    const current = await (await caches.open(SHELL_CACHE_NAME)).match(pathname);
    if (current && isValidAsset(current, pathname)) return current;
    if (pathname.startsWith('/assets/')) {
      const keys = await caches.keys();
      for (const key of keys.reverse()) {
        if (!key.startsWith(SHELL_CACHE_PREFIX) || key === SHELL_CACHE_NAME) continue;
        const previous = await (await caches.open(key)).match(pathname);
        if (previous && isValidAsset(previous, pathname)) return previous;
      }
    }
    return undefined;
  });
  if (cachedResponse) return cachedResponse;

  const response = await fetch(requestUrl.toString(), { cache: 'no-cache' });
  if (isValidAsset(response, pathname)) {
    const copy = response.clone();
    event.waitUntil(withCacheDeadline(async () => {
      const cache = await caches.open(SHELL_CACHE_NAME);
      await cache.put(pathname, copy);
    }));
    return response;
  }
  // Missing hashed files are sometimes rewritten to index.html by the host.
  // Make this a real load failure so the page can recover, never cache the HTML.
  return Response.error();
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

  if (PRECACHE_URL_SET.has(requestUrl.pathname) || requestUrl.pathname.startsWith('/assets/')) {
    event.respondWith(loadPrecachedAsset(requestUrl, event));
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
