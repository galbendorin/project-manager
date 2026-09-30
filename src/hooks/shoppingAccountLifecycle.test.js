import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createShoppingDraftOwner } from '../utils/shoppingDraftOwner.js';
import * as view from '../utils/shoppingListViewState.js';
import * as rows from './projectData/manualTodoUtils.js';
import * as rpc from '../utils/shoppingListRpc.js';
import { replaceQueuedTargetId } from '../utils/offlineQueue.js';

const source = (await readFile(new URL('./useShoppingListOfflineSync.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
  .replace(/import.meta.env.VITE_SUPABASE_(URL|ANON_KEY)/g, "'synthetic'")
  .replace('export function ', 'function ');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(setImmediate);
const operation = kind => kind === 'create' ? { kind, targetId: 'offline-item', record: {
  projectId: 'p', title: 'Q09 TEST private grocery', operationId: 'synthetic-operation' } } :
  { kind, targetId: 'item', patch: { title: 'Q09 TEST edit' } };

function fixture({ kind = 'update', hold = kind, enabled = true, acquisitionError = null, holdAcquisition = false } = {}) {
  const manager = createShoppingDraftOwner({ enabled, initialUserId: 'a' });
  let authScope = manager.getScope(), userId = 'a', cursor = 0;
  const slots = [], effects = [], cleanups = [], requests = [], writes = [], notifications = [], acquisitions = [];
  let lifetimeSetup;
  const gate = deferred(); let held = false;
  let cache = { queue: [operation(kind)], todosByProject: { p: [] }, lastSyncedAt: 'previous' };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState: value => { const index = cursor++; if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef: value => { const index = cursor++; return slots[index] ||= { current: value }; },
    useMemo: (fn, deps) => { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useCallback: (fn, deps) => hooks['useMemo'](() => fn, deps),
    useEffect: (fn, deps) => { const index = cursor++; if (!same(slots[index]?.deps, deps)) {
      const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
    } },
  };
  const execute = async request => {
    requests.push(request);
    if (!held && request.kind === hold) { held = true; return gate.promise; }
    return request.kind === 'read' ? { data: [], error: null } : { data: { id: 'item', project_id: 'p', title: 'Q09 TEST saved' }, error: null };
  };
  const supabase = { from() {
    const request = { kind: 'read' };
    const builder = { update() { request.kind = 'update'; return builder; }, delete() { request.kind = 'delete'; return builder; },
      eq() { return builder; }, select() { return builder; }, order() { return builder; }, maybeSingle() { return builder; },
      then(resolve, reject) { return execute(request).then(resolve, reject); } };
    return builder;
  }, rpc: (name, args) => execute({ kind: 'create', name, args }) };
  const hook = vm.runInNewContext(`${source}\nuseShoppingListOfflineSync`, { ...hooks, ...view, ...rows, ...rpc, replaceQueuedTargetId,
    AbortController, supabase, useAuth: () => ({ shoppingDraftScope: authScope }),
    createShoppingOwnerClient: async () => {
      if (acquisitionError) throw acquisitionError;
      if (holdAcquisition) { const gate = deferred(); acquisitions.push(gate); return gate.promise; }
      return supabase;
    },
    isLikelyNetworkError: () => false, notifyShoppingListSubscribers: async value => { notifications.push(value); } });
  let failure = '';
  const render = () => { cursor = 0; return hook({ currentUserId: userId, isOnline: true, selectedProjectId: 'p',
    loadShoppingOfflineState: () => structuredClone(cache), persistOfflineState: next => { writes.push(structuredClone(next)); cache = next; },
    setTodos() {}, sortTodos: rows => rows, offlineQueue: cache.queue, todos: [], lastSyncedAt: cache.lastSyncedAt,
    setFailedTodoId() {}, setFailedTodoMessage: value => { failure = value; }, formatSyncTimeLabel: () => '', retryTodoAction() {} }); };
  return { render, requests, writes, notifications, acquisitions, release: value => gate.resolve(value),
    acquire: index => acquisitions[index].resolve(supabase),
    getCache: () => cache, failure: () => failure,
    mountLifetime() { lifetimeSetup = effects.shift(); lifetimeSetup(); const slot = slots.find(value => value?.cleanup); cleanups.push(slot.cleanup); },
    replayLifetime() { cleanups.pop()(); lifetimeSetup(); const slot = slots.find(value => value?.cleanup); cleanups.push(slot.cleanup); },
    close() { cleanups.forEach(cleanup => cleanup()); manager.close(); },
    clearCache() { cache = { queue: [], todosByProject: {} }; },
    switchOwner(next, signOut = false) { if (signOut) manager.setOwner(null); authScope = manager.setOwner(next); userId = next; },
  };
}

for (const kind of ['update', 'delete', 'create']) {
  for (const failure of [false, true]) {
    test(`late ${kind} ${failure ? 'failure' : 'success'} after unmount cannot recreate storage or notify`, async () => {
      const f = fixture({ kind }); const value = f.render(); f.mountLifetime();
      const pending = value.retryShoppingSync(); await tick();
      const writtenBeforeClose = f.writes.length;
      f.close(); f.clearCache();
      const before = f.requests.length;
      f.release(failure ? { error: { message: 'Denied' } } : { data: { id: 'item', project_id: 'p', title: 'Q09 TEST saved' }, error: null });
      await pending; await value.retryShoppingSync();
      assert.equal(f.requests.length, before); assert.equal(f.writes.length, writtenBeforeClose);
      assert.equal(f.notifications.length, 0); assert.equal(f.failure(), '');
    });
  }
}

for (const next of ['b', 'a']) {
  test(`auth change to ${next} fences completion before React renders, including a fresh same-account lineage`, async () => {
    const f = fixture(); const value = f.render(); f.mountLifetime();
    const pending = value.retryShoppingSync(); await tick();
    f.switchOwner(next, true); f.clearCache();
    f.release({ data: { id: 'item' } }); await pending; await value.retryShoppingSync();
    assert.equal(f.writes.length, 0); assert.equal(f.requests.length, 1); f.close();
  });
}

test('changing account during create preflight cannot dispatch the add', async () => {
  const f = fixture({ kind: 'create', hold: 'read' }); const value = f.render(); f.mountLifetime();
  const pending = value.retryShoppingSync(); await tick(); f.switchOwner('b');
  f.release({ data: [], error: null }); await pending;
  assert.equal(f.requests.length, 1); assert.equal(f.writes.length, 0); f.close();
});

test('token acquisition failure preserves queued intent and reports retry without writing', async () => {
  const f = fixture({ acquisitionError: new Error('Session unavailable') }); const value = f.render(); f.mountLifetime();
  await value.retryShoppingSync();
  assert.equal(f.getCache().queue.length, 1); assert.equal(f.requests.length, 0); assert.equal(f.writes.length, 0);
  assert.equal(f.failure(), 'Session unavailable'); f.close();
});

test('flag OFF keeps ordinary legacy queue sync working without acquiring a durable writer', async () => {
  const f = fixture({ enabled: false, hold: 'none' }); const value = f.render(); f.mountLifetime();
  await value.retryShoppingSync();
  assert.equal(f.getCache().queue.length, 0); assert.equal(f.requests.length, 1); f.close();
});

test('StrictMode lifetime replay starts a fresh run while cancelled token acquisition is still held', async () => {
  const f = fixture({ holdAcquisition: true, hold: 'none' }); const value = f.render(); f.mountLifetime();
  const obsolete = value.retryShoppingSync(); await tick();
  assert.equal(f.acquisitions.length, 1);
  f.replayLifetime(); const fresh = f.render().retryShoppingSync(); await tick();
  assert.equal(f.acquisitions.length, 2);
  f.acquire(0); await obsolete;
  await value.retryShoppingSync();
  assert.equal(f.acquisitions.length, 2, 'Old finally must not unlock the replacement run');
  f.acquire(1); await fresh;
  assert.equal(f.requests.length, 1); assert.equal(f.getCache().queue.length, 0); f.close();
});
