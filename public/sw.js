self.addEventListener('install', () => {});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
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
