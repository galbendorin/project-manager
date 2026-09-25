import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as planAccess from '../utils/planAccess.js';
import * as financeAccess from '../utils/financeAccess.js';

const tick = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// Run the actual provider and App routing effects. Keep child-before-parent
// effect order, including the render where auth has resolved but plan effects
// have not run yet. Backend requests remain pending until the test resolves them.
function hookRuntime() {
  const slots = [], effects = [];
  let cursor = 0, changed = false;
  const same = (a, b) => a?.length === b?.length && a?.every((item, i) => Object.is(item, b[i]));
  const memo = (callback, deps) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback(), deps };
    return slots[index].value;
  };
  const hooks = {
    createContext: () => ({}), useContext: () => ({}),
    useState: initial => {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) changed = true;
        slots[index].value = next;
      }];
    },
    useRef: initial => (slots[cursor++] ||= { current: initial }),
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  return { hooks, begin() { cursor = 0; changed = false; }, flush() { effects.splice(0).forEach(effect => effect()); },
    changed: () => changed, close() { slots.forEach(slot => slot?.cleanup?.()); } };
}

async function fixture(t, { path = '/shopping', savedPath = '/', cachedAccess = false } = {}) {
  const planHooks = hookRuntime(), appHooks = hookRuntime();
  let auth = { user: null, loading: true }, plan;
  const requests = [], navigations = [];
  const window = Object.assign(new EventTarget(), {
    location: { pathname: path, search: '' }, setInterval: () => 1, clearInterval() {},
    history: { replaceState(_state, _title, next) { window.location.pathname = next; navigations.push(next); },
      pushState(_state, _title, next) { window.location.pathname = next; navigations.push(next); } },
  });
  const enqueue = kind => {
    const request = { kind, ...deferred() }; requests.push(request); return request.promise;
  };
  const planSource = (await readFile(new URL('./PlanContext.jsx', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replace(/export const /g, 'const ').replace(/^export \{[^}]*\};$/gm, '')
    .replace(/return \(\s*<PlanContext.Provider[\s\S]*?<\/PlanContext.Provider>\s*\);/, 'return value;');
  const renderPlan = vm.runInNewContext(`${planSource}\nPlanProvider`, {
    ...planHooks.hooks, ...planAccess, ...financeAccess, window, document: new EventTarget(),
    useAuth: () => auth, TRIAL_LENGTH_DAYS: 30, console: { error() {} },
    canAccessHouseholdToolsFromProfile: planAccess.canAccessHouseholdTools,
    canUsePlatformAiFromProfile: planAccess.canUsePlatformAi,
    hasBillingSyncPending: () => false, shouldRefreshAfterFocus: () => false,
    loadCachedHouseholdAccess: () => cachedAccess, saveCachedHouseholdAccess() {},
    supabase: { rpc: kind => ({ single: () => enqueue(kind) }), from: () => ({ select: () => ({ eq: () => enqueue('projects') }) }) },
  });
  const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
  const routing = appSource.slice(appSource.indexOf('function App() {'), appSource.indexOf("  if (currentPath === '/privacy')"));
  const renderApp = vm.runInNewContext(`${routing}\nreturn { currentPath, planLoading };\n}\nApp`, {
    ...appHooks.hooks, ...financeAccess, window,
    useAuth: () => auth, usePlan: () => plan, useCheckoutStatus: () => null, useOnlineStatus: () => true,
    loadAccentTheme: () => 'orchid', applyAccentTheme() {}, saveAccentTheme() {},
    getInitialAppPath: () => path === '/' ? savedPath : path, readAppShortcutIntent: () => null,
    hasPendingServiceWorker: () => false, getFeatureByRoute: () => null, canAccessItilQuiz: () => false,
    normalizeAppPath: value => value, saveLastAppPath() {}, clearLastProject() {}, loadLastProject: () => null,
    isHouseholdToolPath: value => ['/shopping', '/meals', '/baby', '/habits', '/weight'].includes(value),
  });
  const render = () => {
    planHooks.begin(); appHooks.begin(); plan = renderPlan({ children: null }); const result = renderApp();
    appHooks.flush(); planHooks.flush(); return result;
  };
  const settle = () => {
    let result;
    for (let i = 0; i < 10; i++) {
      result = render();
      if (!planHooks.changed() && !appHooks.changed()) return result;
    }
    throw new Error('Rendering did not settle');
  };
  t.after(() => { appHooks.close(); planHooks.close(); });
  return { render, settle, navigations, signIn() { auth = { user: { id: 'owner' }, loading: false }; },
    signedOut() { auth = { user: null, loading: false }; },
    async resolveAccess(granted) {
      for (const request of requests.splice(0)) request.resolve(request.kind === 'projects'
        ? { count: granted ? 1 : 0, error: null } : { data: {}, error: null });
      await tick();
    } };
}

for (const [label, options] of [['direct Shopping launch', {}], ['Home Screen restores Shopping', { path: '/', savedPath: '/shopping' }]]) {
  test(`${label} keeps the destination through delayed sign-in and plan access`, async t => {
    const f = await fixture(t, options);
    assert.equal(f.settle().currentPath, '/shopping');
    f.signIn();
    assert.equal(f.render().planLoading, true, 'first signed-in render must not expose the signed-out plan result');
    assert.equal(f.settle().currentPath, '/shopping');
    await f.resolveAccess(true);
    assert.equal(f.settle().currentPath, '/shopping');
    assert.deepEqual(f.navigations, []);
  });
}

test('a signed-out visitor keeps the requested tool for sign-in', async t => {
  const f = await fixture(t);
  f.signedOut();
  assert.equal(f.settle().currentPath, '/shopping');
  assert.deepEqual(f.navigations, []);
});

test('resolved denial still returns an authenticated user to projects', async t => {
  const f = await fixture(t);
  f.settle(); f.signIn(); f.settle();
  await f.resolveAccess(false);
  assert.equal(f.settle().currentPath, '/');
  assert.deepEqual(f.navigations, ['/']);
});
