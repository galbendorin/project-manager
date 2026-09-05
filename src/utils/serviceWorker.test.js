import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

import { injectServiceWorkerManifest } from './pwaCacheManifest.js';

const workerSource = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://pmworkspace.test';
const activeCache = 'pmworkspace-shell-active';
const html = (body) => new Response(body, { headers: { 'content-type': 'text/html' } });
const script = (body) => new Response(body, { headers: { 'content-type': 'application/javascript' } });
const cacheKey = (input) => new URL(typeof input === 'string' ? input : input.url, origin).href;
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function createWorker({
  precacheUrls = ['/index.html', '/offline.html', '/assets/current.js'],
  initialCaches = {},
  network = async () => { throw new Error('offline'); },
  failCache = () => false,
  hangCache = () => false,
  expireNavigation = false,
  windows = [],
} = {}) {
  const listeners = new Map();
  const storedCaches = new Map(Object.entries(initialCaches).map(([name, entries]) => [
    name,
    new Map(Object.entries(entries).map(([url, response]) => [cacheKey(url), response])),
  ]));
  const networkCalls = [];
  const backgroundEvents = [];
  const timers = new Map();
  let nextTimer = 0;
  let claims = 0;
  let skipWaitingCalls = 0;
  const checkCache = async (operation, name, url) => {
    if (failCache(operation, name, url)) throw new Error(`Cache Storage ${operation} failed`);
    if (hangCache(operation, name, url)) await new Promise(() => {});
  };
  const caches = {
    async open(name) {
      await checkCache('open', name);
      if (!storedCaches.has(name)) storedCaches.set(name, new Map());
      const entries = storedCaches.get(name);
      return {
        async match(url) {
          await checkCache('match', name, url);
          return entries.get(cacheKey(url))?.clone();
        },
        async put(url, response) {
          await checkCache('put', name, url);
          entries.set(cacheKey(url), response.clone());
        },
      };
    },
    async keys() {
      await checkCache('keys');
      return [...storedCaches.keys()];
    },
    async delete(name) {
      await checkCache('delete', name);
      return storedCaches.delete(name);
    },
  };
  // Node's native Request rejects mode: 'navigate' and relative URLs. Preserve
  // browser request fields while using native Response body/clone semantics.
  class BrowserRequest {
    constructor(input, options = {}) {
      this.url = cacheKey(input);
      this.method = options.method ?? input.method ?? 'GET';
      this.mode = options.mode ?? input.mode ?? 'cors';
      this.cache = options.cache ?? input.cache ?? 'default';
    }
  }
  runInNewContext(injectServiceWorkerManifest(workerSource, {
    version: 'active', urls: precacheUrls,
  }), {
    self: {
      location: { origin },
      addEventListener: (type, listener) => listeners.set(type, listener),
      skipWaiting: async () => { skipWaitingCalls += 1; },
      clients: {
        claim: async () => { claims += 1; },
        matchAll: async () => windows,
      },
    },
    caches,
    Request: BrowserRequest,
    Response,
    URL,
    fetch: async (input, options) => {
      const request = new BrowserRequest(input, options);
      networkCalls.push(request);
      return network(request);
    },
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      if (expireNavigation && delay === 2500) {
        queueMicrotask(() => { if (timers.delete(id)) callback(); });
      }
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  return {
    networkCalls,
    storedCaches,
    get claims() { return claims; },
    get skipWaitingCalls() { return skipWaitingCalls; },
    cached: (name, url) => storedCaches.get(name)?.get(cacheKey(url))?.clone(),
    expireTimers(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay <= delay && timers.delete(id)) timer.callback();
      }
    },
    settleBackground: () => Promise.all(backgroundEvents),
    async lifecycle(type) {
      const pending = [];
      listeners.get(type)({ waitUntil: (promise) => pending.push(promise) });
      await Promise.all(pending);
    },
    async request(url, options) {
      let response;
      listeners.get('fetch')({
        request: new BrowserRequest(url, options),
        respondWith: (promise) => { response = promise; },
        waitUntil: (promise) => backgroundEvents.push(promise),
      });
      return response;
    },
  };
}

test('online navigation loads current server HTML without relying on the cached shell', async () => {
  const worker = createWorker({
    initialCaches: { [activeCache]: { '/index.html': html('installed shell') } },
    network: async () => html('latest deployment'),
  });

  assert.equal(await (await worker.request('/shopping', { mode: 'navigate' })).text(), 'latest deployment');
  assert.equal(worker.networkCalls[0].cache, 'no-store');
  assert.equal(worker.networkCalls[0].url, `${origin}/shopping`);
  assert.equal(await worker.cached(activeCache, '/index.html').text(), 'installed shell');
});

test('offline navigation uses the active worker shell, ignoring previous and waiting worker HTML', async () => {
  const worker = createWorker({ initialCaches: {
    'pmworkspace-shell-previous': { '/index.html': html('previous shell') },
    [activeCache]: { '/index.html': html('active shell') },
    'pmworkspace-shell-waiting': { '/index.html': html('waiting shell') },
  } });

  assert.equal(await (await worker.request('/track', { mode: 'navigate' })).text(), 'active shell');
});

test('stalled navigation falls back to the installed shell within the navigation timeout', async () => {
  const worker = createWorker({
    initialCaches: { [activeCache]: { '/index.html': html('active shell') } },
    network: () => new Promise(() => {}),
    expireNavigation: true,
  });

  assert.equal(await (await worker.request('/', { mode: 'navigate' })).text(), 'active shell');
});

test('navigation uses its own offline page when the active app shell is unavailable', async () => {
  const worker = createWorker({ initialCaches: {
    'pmworkspace-shell-previous': { '/index.html': html('stale shell') },
    [activeCache]: { '/offline.html': html('offline page') },
    'pmworkspace-shell-waiting': { '/index.html': html('unactivated shell') },
  } });

  assert.equal(await (await worker.request('/', { mode: 'navigate' })).text(), 'offline page');
});

test('unavailable Cache Storage does not prevent online navigation', async () => {
  const worker = createWorker({
    failCache: () => true,
    network: async () => html('online shell'),
  });

  assert.equal(await (await worker.request('/', { mode: 'navigate' })).text(), 'online shell');
});

test('invalid navigation responses fall back to a complete installed shell', async () => {
  for (const response of [new Response('unavailable', { status: 503 }), script('not HTML')]) {
    const worker = createWorker({
      initialCaches: { [activeCache]: { '/index.html': html('active shell') } },
      network: async () => response,
    });
    assert.equal(await (await worker.request('/', { mode: 'navigate' })).text(), 'active shell');
  }
});

test('activation retains two previous versions so already-open pages can load their hashed chunks', async () => {
  const worker = createWorker({ initialCaches: {
    'unrelated-cache': { '/other': html('unrelated') },
    'pmworkspace-shell-oldest': { '/index.html': html('oldest'), '/assets/oldest.js': script('oldest') },
    'pmworkspace-shell-previous2': { '/index.html': html('previous2'), '/assets/previous2.js': script('previous2') },
    'pmworkspace-shell-previous1': { '/index.html': html('previous1'), '/assets/previous1.js': script('previous1') },
    [activeCache]: { '/assets/current.js': script('current') },
  } });

  await worker.lifecycle('activate');

  assert.deepEqual([...worker.storedCaches.keys()], [
    'unrelated-cache', 'pmworkspace-shell-previous2', 'pmworkspace-shell-previous1', activeCache,
  ]);
  assert.equal(worker.claims, 1);
  assert.equal(await (await worker.request('/assets/previous2.js')).text(), 'previous2');
  assert.equal(await (await worker.request('/assets/previous1.js')).text(), 'previous1');
  assert.equal(await (await worker.request('/assets/current.js')).text(), 'current');
  assert.equal(worker.networkCalls.length, 0);
});

test('cache cleanup failures do not prevent the new worker from claiming pages', async () => {
  const worker = createWorker({ failCache: (operation) => operation === 'keys' });
  await worker.lifecycle('activate');
  assert.equal(worker.claims, 1);
});

test('new deployment assets unknown to the active precache are fetched and cached', async () => {
  const worker = createWorker({ network: async () => script('new chunk') });

  assert.equal(await (await worker.request('/assets/new-deployment.js')).text(), 'new chunk');
  await worker.settleBackground();
  assert.equal(worker.networkCalls[0].cache, 'no-cache');
  assert.equal(await worker.cached(activeCache, '/assets/new-deployment.js').text(), 'new chunk');
  assert.equal(await (await worker.request('/assets/new-deployment.js')).text(), 'new chunk');
  assert.equal(worker.networkCalls.length, 1);
});

test('asset cache read and write failures do not discard a successful network response', async () => {
  for (const failure of ['open', 'match', 'keys', 'put']) {
    const worker = createWorker({
      network: async () => script('online chunk'),
      failCache: (operation) => operation === failure,
    });
    assert.equal(await (await worker.request('/assets/new.js')).text(), 'online chunk', failure);
    assert.equal(worker.networkCalls.length, 1, failure);
  }
});

test('hanging Cache Storage reads time out so online asset loading can continue', async () => {
  for (const operation of ['open', 'match', 'keys']) {
    const worker = createWorker({
      hangCache: (candidate) => candidate === operation,
      network: async () => script('online chunk'),
    });
    const pending = worker.request('/assets/new.js');
    await flushPromises();
    assert.equal(worker.networkCalls.length, 0, operation);

    worker.expireTimers(1000);

    assert.equal(await (await pending).text(), 'online chunk', operation);
    await flushPromises();
    worker.expireTimers(1000);
    await worker.settleBackground();
  }
});

test('hanging cache writes cannot hold up a successfully downloaded script', async () => {
  const worker = createWorker({
    hangCache: (operation) => operation === 'put',
    network: async () => script('online chunk'),
  });
  let received;
  const pending = worker.request('/assets/new.js').then((response) => { received = response; });
  await flushPromises();

  assert.ok(received, 'the script response must arrive before the cache write deadline');
  assert.equal(await received.text(), 'online chunk');

  worker.expireTimers(1000);
  await worker.settleBackground();
  await pending;
});

test('hanging cache inspection and cleanup cannot prevent activation', async () => {
  const worker = createWorker({ hangCache: (operation) => operation === 'keys' });
  const activation = worker.lifecycle('activate');
  await flushPromises();
  worker.expireTimers(1000);
  await flushPromises();
  worker.expireTimers(1000);
  await activation;

  assert.equal(worker.claims, 1);
});

test('SPA fallback HTML is never returned or cached as JavaScript or CSS', async () => {
  for (const pathname of ['/assets/missing.js', '/assets/missing.mjs', '/assets/missing.css']) {
    const worker = createWorker({ network: async () => html('SPA fallback') });
    assert.equal((await worker.request(pathname)).type, 'error', pathname);
    assert.equal(worker.cached(activeCache, pathname), undefined, pathname);
  }
});

test('invalid cached script responses are ignored in both current and older caches', async () => {
  const worker = createWorker({
    initialCaches: {
      'pmworkspace-shell-previous': { '/assets/current.js': html('old invalid cache entry') },
      [activeCache]: { '/assets/current.js': html('invalid cache entry') },
    },
    network: async () => script('valid network chunk'),
  });

  assert.equal(await (await worker.request('/assets/current.js')).text(), 'valid network chunk');
  await worker.settleBackground();
  assert.equal(await worker.cached(activeCache, '/assets/current.js').text(), 'valid network chunk');
});

test('install revalidates every precached resource and only caches a complete valid batch', async () => {
  const worker = createWorker({ network: async (request) => (
    request.url.endsWith('.js') ? script('installed chunk') : html('installed HTML')
  ) });

  await worker.lifecycle('install');

  assert.equal(worker.networkCalls.length, 3);
  assert.ok(worker.networkCalls.every((request) => request.cache === 'reload'));
  assert.equal(await worker.cached(activeCache, '/index.html').text(), 'installed HTML');
  assert.equal(await worker.cached(activeCache, '/assets/current.js').text(), 'installed chunk');
});

test('install rejects missing or invalid assets without saving a partial shell', async () => {
  for (const invalidResponse of [html('SPA fallback'), new Response('missing', { status: 404 })]) {
    const worker = createWorker({ network: async (request) => (
      request.url.endsWith('.js') ? invalidResponse : html('new HTML')
    ) });

    await assert.rejects(worker.lifecycle('install'), /Invalid precache response/);

    assert.equal(worker.cached(activeCache, '/index.html'), undefined);
    assert.equal(worker.cached(activeCache, '/assets/current.js'), undefined);
    assert.equal(worker.skipWaitingCalls, 0);
  }
});

test('a complete recovery-capable worker adopts a legacy installation without waiting for broken pages', async () => {
  const worker = createWorker({
    initialCaches: { 'pmworkspace-shell-legacy': { '/index.html': html('legacy shell') } },
    network: async (request) => request.url.endsWith('.js') ? script('new script') : html('new shell'),
  });

  await worker.lifecycle('install');

  assert.equal(worker.skipWaitingCalls, 1);
  assert.equal(await worker.cached(activeCache, '/index.html').text(), 'new shell');
  assert.equal(await worker.cached('pmworkspace-shell-legacy', '/index.html').text(), 'legacy shell');
});

test('fresh installs and later updates keep normal activation behavior even when an older legacy cache remains', async () => {
  for (const initialCaches of [{}, {
    'pmworkspace-shell-legacy': { '/index.html': html('legacy shell') },
    'pmworkspace-shell-previous': { '/index.html': html('previous'), '/app-bootstrap.js': script('bootstrap') },
  }]) {
    const worker = createWorker({
      initialCaches,
      network: async (request) => request.url.endsWith('.js') ? script('new script') : html('new shell'),
    });

    await worker.lifecycle('install');

    assert.equal(worker.skipWaitingCalls, 0);
  }
});

test('legacy migration retries only same-origin windows that already requested recovery, preserving their full URLs', async () => {
  const navigations = [];
  const recoveryUrl = `${origin}/shopping?project=42&pmw-recover=123#items`;
  const worker = createWorker({
    initialCaches: {
      'pmworkspace-shell-legacy': { '/index.html': html('legacy shell') },
      [activeCache]: { '/app-bootstrap.js': script('bootstrap') },
    },
    windows: [recoveryUrl, `${origin}/track?project=7`, 'https://other.example/?pmw-recover=123'].map((url) => ({
      url,
      navigate: async (target) => { navigations.push(target); },
    })),
  });

  await worker.lifecycle('activate');

  assert.equal(worker.claims, 1);
  assert.deepEqual(navigations, [recoveryUrl]);
});

test('later updates never navigate existing windows automatically', async () => {
  const navigations = [];
  const worker = createWorker({
    initialCaches: {
      'pmworkspace-shell-legacy': { '/index.html': html('legacy shell') },
      'pmworkspace-shell-previous': { '/index.html': html('previous'), '/app-bootstrap.js': script('previous bootstrap') },
      [activeCache]: { '/app-bootstrap.js': script('bootstrap') },
    },
    windows: [{
      url: `${origin}/track?pmw-recover=123`,
      navigate: async (target) => { navigations.push(target); },
    }],
  });

  await worker.lifecycle('activate');

  assert.equal(worker.claims, 1);
  assert.deepEqual(navigations, []);
});

test('cross-origin requests, API requests, and mutations remain outside the shell cache', async () => {
  const worker = createWorker();
  assert.equal(await worker.request('https://data.example/assets/data.js'), undefined);
  assert.equal(await worker.request('/api/status', { mode: 'navigate' }), undefined);
  assert.equal(await worker.request('/assets/current.js', { method: 'POST' }), undefined);
  assert.equal(worker.networkCalls.length, 0);
});

test('a storage write failure removes the partial installation and preserves the working cache', async () => {
  const worker = createWorker({
    initialCaches: { 'pmworkspace-shell-previous': { '/index.html': html('working') } },
    failCache: (operation, name, url) => operation === 'put' && url === '/assets/current.js',
    network: async (request) => request.url.endsWith('.js') ? script('script') : html('shell'),
  });
  await assert.rejects(worker.lifecycle('install'), /Cache Storage put failed/);
  assert.equal(worker.storedCaches.has(activeCache), false);
  assert.equal(await worker.cached('pmworkspace-shell-previous', '/index.html').text(), 'working');
  assert.equal(worker.skipWaitingCalls, 0);
});

test('empty caches from failed legacy installs do not displace previous working versions', async () => {
  const worker = createWorker({ initialCaches: {
    'pmworkspace-shell-previous2': { '/index.html': html('older working') },
    'pmworkspace-shell-previous1': { '/index.html': html('working'), '/app-bootstrap.js': script('bootstrap') },
    'pmworkspace-shell-failed1': {},
    'pmworkspace-shell-failed2': {},
    [activeCache]: { '/index.html': html('current'), '/app-bootstrap.js': script('bootstrap') },
  } });
  await worker.lifecycle('activate');
  assert.deepEqual([...worker.storedCaches.keys()], [
    'pmworkspace-shell-previous2', 'pmworkspace-shell-previous1', activeCache,
  ]);
});
