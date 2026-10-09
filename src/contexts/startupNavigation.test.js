import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as planAccess from '../utils/planAccess.js';
import * as financeAccess from '../utils/financeAccess.js';
import { shouldRefreshAfterFocus } from '../utils/refreshThrottle.js';

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

async function fixture(t, { path = '/shopping', savedPath = '/', cachedAccess = false, focusRefresh = false } = {}) {
  const planHooks = hookRuntime(), appHooks = hookRuntime();
  let auth = { user: null, loading: true }, plan;
  const requests = [], navigations = [];
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
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
    ...planHooks.hooks, ...planAccess, ...financeAccess, window, document,
    useAuth: () => auth, TRIAL_LENGTH_DAYS: 30, console: { error() {} },
    canAccessHouseholdToolsFromProfile: planAccess.canAccessHouseholdTools,
    canUsePlatformAiFromProfile: planAccess.canUsePlatformAi,
    hasBillingSyncPending: () => false, shouldRefreshAfterFocus: focusRefresh ? shouldRefreshAfterFocus : () => false,
    loadCachedHouseholdAccess: () => cachedAccess, saveCachedHouseholdAccess() {},
    supabase: { rpc: kind => ({ single: () => enqueue(kind) }), from: () => ({ select: () => ({ eq: () => enqueue('projects') }) }) },
  });
  const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
  const routing = appSource.slice(appSource.indexOf('function App() {'), appSource.indexOf("  if (currentPath === '/privacy')"));
  const renderApp = vm.runInNewContext(`${routing}\nreturn { currentPath, planLoading };\n}\nApp`, {
    ...appHooks.hooks, ...financeAccess, window,
    useAuth: () => auth, usePlan: () => plan, useCheckoutStatus: () => null, useOnlineStatus: () => true,
    useTodoSourceNavigation: () => ({ request: null, error: '', openSource() {}, clear() {} }),
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
  return { render, settle, navigations, requests, window, document, get plan() { return plan; }, signIn(id = 'owner') { auth = { user: { id }, loading: false }; },
    refreshIdentity() { auth = { ...auth, user: { ...auth.user } }; },
    signedOut() { auth = { user: null, loading: false }; },
    async resolveAccess(granted, profile = {}) {
      for (const request of requests.splice(0)) request.resolve(request.kind === 'projects'
        ? { count: granted ? 1 : 0, error: null } : { data: request.kind === 'get_or_create_current_user_profile' ? profile : {}, error: null });
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

test('same-account session refresh keeps the confirmed plan and does not restart access loading', async t => {
  const f = await fixture(t);
  f.settle(); f.signIn(); f.settle();
  await f.resolveAccess(true, { id: 'owner', plan: 'pro', subscription_status: 'active' });
  f.settle();
  assert.equal(f.plan.effectivePlan, 'pro'); assert.equal(f.plan.loading, false);
  f.refreshIdentity();
  assert.equal(f.render().planLoading, false);
  f.settle();
  assert.equal(f.plan.effectivePlan, 'pro'); assert.equal(f.plan.profile.id, 'owner');
  assert.equal(f.requests.length, 0, 'a new object for the same account must not reinitialize access');
});

test('focus refresh stays invisible while pending and applies a confirmed license change', async t => {
  const f = await fixture(t, { focusRefresh: true });
  f.settle(); f.signIn(); f.settle();
  await f.resolveAccess(true, { id: 'owner', plan: 'pro', subscription_status: 'active' });
  f.settle();
  f.window.dispatchEvent(new Event('focus')); f.document.dispatchEvent(new Event('visibilitychange'));
  f.settle();
  assert.equal(f.plan.effectivePlan, 'pro'); assert.equal(f.plan.loading, false);
  assert.equal(f.requests.length, 3, 'focus and visibility share the existing refresh throttle');
  await f.resolveAccess(true, { id: 'owner', plan: 'starter', subscription_status: 'canceled' });
  f.settle(); assert.equal(f.plan.effectivePlan, 'starter'); assert.equal(f.plan.loading, false);
});

test('failed same-account profile refresh retains its last confirmed license', async t => {
  const f = await fixture(t, { focusRefresh: true });
  f.settle(); f.signIn(); f.settle();
  await f.resolveAccess(true, { id: 'owner', plan: 'pro', subscription_status: 'active' });
  f.settle(); f.window.dispatchEvent(new Event('focus')); f.settle();
  const profile = f.requests.find(request => request.kind === 'get_or_create_current_user_profile');
  profile.resolve({ data: null, error: { message: 'Synthetic connection failure' } });
  await tick(); f.settle();
  assert.equal(f.plan.effectivePlan, 'pro'); assert.equal(f.plan.loading, false);
  await f.resolveAccess(true, { id: 'owner', plan: 'pro' }); f.settle();
});

test('account changes clear access and reject old-account requests even after switching back', async t => {
  const f = await fixture(t);
  f.settle(); f.signIn('owner'); f.settle();
  const stale = f.requests.splice(0);
  f.signIn('other'); assert.equal(f.render().planLoading, true); f.settle();
  await f.resolveAccess(false, { id: 'other', plan: 'starter' }); f.settle();
  assert.equal(f.plan.profile.id, 'other'); assert.equal(f.plan.effectivePlan, 'starter'); assert.equal(f.plan.projectCount, 0);
  f.signIn('owner'); f.settle();
  assert.equal(f.plan.profile, null); assert.equal(f.plan.loading, true);
  await f.resolveAccess(true, { id: 'owner', plan: 'starter' }); f.settle();
  assert.equal(f.plan.profile.id, 'owner'); assert.equal(f.plan.loading, false);
  for (const request of stale) request.resolve(request.kind === 'projects' ? { count: 9 } : { data: { id: 'owner', plan: 'pro' } });
  await tick(); f.settle();
  assert.equal(f.plan.effectivePlan, 'starter'); assert.equal(f.plan.projectCount, 1);
});

test('an older profile refresh cannot restore access after a newer refresh denies it', async t => {
  const f = await fixture(t);
  f.settle(); f.signIn(); f.settle();
  await f.resolveAccess(true, { id: 'owner', plan: 'pro' }); f.settle();
  f.plan.refreshProfile();
  const stale = f.requests.splice(0);
  f.plan.refreshProfile();
  await f.resolveAccess(false, { id: 'owner', plan: 'starter' }); f.settle();
  for (const request of stale) request.resolve(request.kind === 'projects' ? { count: 9 } : { data: { id: 'owner', plan: 'pro' } });
  await tick(); f.settle();
  assert.equal(f.plan.effectivePlan, 'starter'); assert.equal(f.plan.hasSharedHouseholdProjectAccess, false);
});

test('AI usage acknowledgement and profile refresh share the latest-profile fence', async t => {
  const f = await fixture(t);
  f.settle(); f.signIn(); f.settle();
  await f.resolveAccess(true, { id: 'owner', plan: 'pro', ai_reports_used: 0 }); f.settle();
  f.plan.refreshProfile(); const staleRead = f.requests.splice(0);
  const increment = f.plan.incrementAiReports();
  f.requests.splice(0)[0].resolve({ data: { id: 'owner', plan: 'pro', ai_reports_used: 1 }, error: null });
  assert.equal(await increment, true); f.settle();
  for (const request of staleRead) request.resolve(request.kind === 'projects' ? { count: 0 } : { data: { id: 'owner', plan: 'pro', ai_reports_used: 0 } });
  await tick(); f.settle(); assert.equal(f.plan.profile.ai_reports_used, 1);
  const pendingIncrement = f.plan.incrementAiReports(); const staleWrite = f.requests.splice(0)[0];
  f.plan.refreshProfile();
  await f.resolveAccess(true, { id: 'owner', plan: 'starter', ai_reports_used: 2 }); f.settle();
  staleWrite.resolve({ data: { id: 'owner', plan: 'pro', ai_reports_used: 2 }, error: null });
  assert.equal(await pendingIncrement, true, 'confirmed RPC success is retained even when its stale full-row update is suppressed');
  f.settle(); assert.equal(f.plan.effectivePlan, 'starter');
});
