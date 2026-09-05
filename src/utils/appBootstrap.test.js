import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CHUNK_LOAD_GUARD_KEY, buildChunkRecoveryUrl } from './appUpdateRecovery.js';

const bootstrap = readFileSync(new URL('../../public/app-bootstrap.js', import.meta.url), 'utf8');
const chunkError = new Error('Importing a module script failed.');

const createPage = ({ href = 'https://pmworkspace.com/shopping?code=auth#session', online = true, blockedStorage = false, values = new Map() } = {}) => {
  const events = new Map();
  const documentEvents = new Map();
  const timers = new Map();
  const replacements = [];
  let nextTimer = 0;
  let clock = 0;
  let currentUrl = new URL(href);
  const elements = Object.fromEntries(['app-startup', 'app-startup-title', 'app-startup-detail', 'app-startup-retry', 'root'].map((id) => [id, {
    hidden: false,
    textContent: '',
    listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback); },
  }]));
  const window = {
    navigator: { onLine: online },
    location: {
      get href() { return currentUrl.href; },
      replace(url) { replacements.push(url); },
    },
    history: {
      state: { routeState: 'preserved' },
      replaceState(state, _, url) {
        this.state = state;
        currentUrl = new URL(url, currentUrl);
      },
    },
    get sessionStorage() {
      if (blockedStorage) throw new Error('SecurityError');
      return {
        getItem: (key) => values.get(key),
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      };
    },
    addEventListener(name, callback) {
      events.set(name, [...(events.get(name) || []), callback]);
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: clock + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const document = {
    getElementById: (id) => elements[id],
    addEventListener: (name, callback) => documentEvents.set(name, callback),
  };
  vm.runInNewContext(bootstrap, { window, document, URL, Date });
  return {
    window, elements, replacements, values,
    api: window.__PMW_APP_RECOVERY__,
    dispatch(name, event = {}) { for (const handler of events.get(name) || []) handler(event); },
    domReady() { documentEvents.get('DOMContentLoaded')?.(); },
    tick(elapsed) {
      const until = clock + elapsed;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        clock = timer.at;
        timers.delete(id);
        timer.callback();
      }
      clock = until;
    },
  };
};

test('classic bootstrap handles a broken entry before React or DOMContentLoaded', () => {
  const page = createPage();
  page.dispatch('error', { target: { tagName: 'SCRIPT', type: 'module', src: 'https://pmworkspace.com/assets/index-old.js' } });
  assert.equal(page.replacements.length, 1);
  const recovered = new URL(page.replacements[0]);
  assert.equal(recovered.pathname, '/shopping');
  assert.equal(recovered.searchParams.get('code'), 'auth');
  assert.equal(recovered.hash, '#session');
  assert.ok(recovered.searchParams.has('pmw-recover'));
  assert.equal(page.values.get(CHUNK_LOAD_GUARD_KEY), '1');
  page.domReady();
  assert.equal(page.elements['app-startup'].hidden, false);
  assert.equal(page.elements.root.hidden, true);
  assert.match(page.elements['app-startup-title'].textContent, /could not open/);
});

test('entry recovery never loops across documents when storage access is blocked', () => {
  const first = createPage({ blockedStorage: true });
  first.api.recover(chunkError);
  assert.equal(first.replacements.length, 1);
  const second = createPage({ blockedStorage: true, href: first.replacements[0] });
  second.domReady();
  second.api.recover(chunkError);
  second.tick(60000);
  assert.equal(second.replacements.length, 0);
  assert.equal(second.elements['app-startup'].hidden, false);
});

test('DOMContentLoaded and React loading placeholders do not clear recovery guards', () => {
  const page = createPage({ href: 'https://pmworkspace.com/?pmw-recover=123', values: new Map([[CHUNK_LOAD_GUARD_KEY, '1']]) });
  page.domReady();
  page.api.markRendered();
  page.tick(60000);
  assert.equal(page.values.get(CHUNK_LOAD_GUARD_KEY), '1');
  assert.ok(new URL(page.window.location.href).searchParams.has('pmw-recover'));
  assert.equal(page.elements['app-startup'].hidden, true);
  assert.equal(page.replacements.length, 0);
});

test('only a healthy resolved page clears its guard while preserving auth, queued work, and history', () => {
  const page = createPage({
    href: 'https://pmworkspace.com/shopping?code=auth&pmw-recover=123#token',
    values: new Map([[CHUNK_LOAD_GUARD_KEY, '1'], ['sb-session', 'signed-in'], ['offline-queue', 'unsynced-work']]),
  });
  page.api.markReady();
  page.tick(29999);
  assert.equal(page.values.get(CHUNK_LOAD_GUARD_KEY), '1');
  page.tick(1);
  assert.equal(page.values.has(CHUNK_LOAD_GUARD_KEY), false);
  assert.equal(page.values.get('sb-session'), 'signed-in');
  assert.equal(page.values.get('offline-queue'), 'unsynced-work');
  assert.equal(page.window.location.href, 'https://pmworkspace.com/shopping?code=auth#token');
  assert.equal(page.window.history.state.routeState, 'preserved');
});

test('failure during the healthy grace period retains the cross-reload guard', () => {
  const page = createPage({ href: 'https://pmworkspace.com/?pmw-recover=123', blockedStorage: true });
  page.api.markReady();
  page.tick(10000);
  assert.equal(page.api.recover(chunkError), false);
  page.tick(60000);
  assert.ok(new URL(page.window.location.href).searchParams.has('pmw-recover'));
  assert.equal(page.replacements.length, 0);
});

test('preload errors are prevented only when automatic navigation actually starts', () => {
  for (const options of [{}, { online: false }, { href: 'https://pmworkspace.com/?pmw-recover=123' }]) {
    const page = createPage(options);
    let prevented = false;
    page.dispatch('vite:preloadError', { payload: chunkError, preventDefault() { prevented = true; } });
    assert.equal(prevented, page.replacements.length === 1);
  }
});

test('offline startup remains visible and makes one automatic attempt after reconnecting', () => {
  const page = createPage({ online: false });
  page.api.recover(chunkError);
  page.domReady();
  assert.equal(page.replacements.length, 0);
  assert.match(page.elements['app-startup-title'].textContent, /offline/);
  page.window.navigator.onLine = true;
  page.dispatch('online');
  page.dispatch('online');
  assert.equal(page.replacements.length, 1);
});

test('a stalled module graph gets a bounded recovery and then a usable retry link', () => {
  const first = createPage({ blockedStorage: true });
  first.tick(20000);
  assert.equal(first.replacements.length, 1);
  const next = createPage({ blockedStorage: true, href: first.replacements[0] });
  next.domReady();
  next.tick(60000);
  assert.equal(next.replacements.length, 0);
  assert.equal(next.elements['app-startup'].hidden, false);
  next.elements['app-startup-retry'].listeners.get('click')({ preventDefault() {} });
  assert.equal(next.replacements.length, 1);
});

test('unrelated failures do not cause automatic reloads, and asset failures preserve the helper URL contract', () => {
  const page = createPage();
  page.dispatch('unhandledrejection', { reason: new Error('Unexpected runtime failure') });
  assert.equal(page.replacements.length, 0);
  assert.equal(page.elements['app-startup'].hidden, false);
  page.dispatch('error', { target: { tagName: 'LINK', href: 'https://pmworkspace.com/assets/index-old.css' } });
  const actual = new URL(page.replacements[0]);
  const expected = buildChunkRecoveryUrl({ origin: 'https://pmworkspace.com', pathname: '/shopping', search: '?code=auth', hash: '#session' }, actual.searchParams.get('pmw-recover'));
  assert.equal(actual.href, expected);
});
