import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { startAuthBootstrap } from '../utils/authBootstrap.js';
import { createShoppingDraftOwner } from '../utils/shoppingDraftOwner.js';
import { createShoppingCreateJournal } from '../utils/shoppingCreateJournal.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise(setImmediate);
const value = { text: 'Private grocery', items: [{ title: 'Private grocery', operationId: 'stable-id' }] };

// Execute the actual AuthProvider and bootstrap; replace only JSX rendering
// with its context value. Slot/effect scheduling lets tests emit several auth
// events before React's next render, and hold sign-out/cleanup completions.
async function fixture(t, { offline = false, enabled = true, cached = null } = {}) {
  const slots = [], effects = []; let cursor = 0, listener, mounted = true, cachedUser = cached;
  const initial = deferred(), signOut = deferred(), cleanup = deferred(), journals = [];
  const indexedDB = new IDBFactory(); let delayCleanup = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const hooks = {
    createContext: () => ({}), useContext: () => ({}),
    useRef: initial => { const index = cursor++; return slots[index] ||= { current: initial }; },
    useState: initial => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial,
        set: value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; } };
      return [slots[index].value, slots[index].set];
    },
    useCallback: (callback, deps) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.(); slots[index] = { deps, effect, cleanup: effect() };
      });
    },
  };
  const auth = { getSession: () => initial.promise,
    onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: () => signOut.promise };
  const source = (await readFile(new URL('./AuthContext.jsx', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replace(/export const /g, 'const ')
    .replace('import.meta.env.VITE_SHOPPING_DURABLE_CREATES', JSON.stringify(enabled ? 'true' : 'false'))
    .replace(/return \(\s*<AuthContext.Provider[\s\S]*?<\/AuthContext.Provider>\s*\);/, 'return value;');
  const renderProvider = vm.runInNewContext(`${source}\nAuthProvider`, { ...hooks, navigator: { onLine: !offline },
    URLSearchParams, console: { warn() {} }, startAuthBootstrap, supabase: { auth },
    createShoppingDraftOwner: args => createShoppingDraftOwner({ ...args, createJournal: options => {
      const journal = createShoppingCreateJournal({ ...options, indexedDB }); journals.push(journal); return journal;
    } }),
    loadCachedOfflineUser: () => cachedUser, saveCachedOfflineUser: user => { cachedUser = user; },
    clearCachedOfflineUser: userId => { if (cachedUser?.id === userId) cachedUser = null; },
    clearAiSettings() {}, clearOfflineDataForUser: () => delayCleanup ? cleanup.promise : Promise.resolve(),
  });
  const render = () => { cursor = 0; const result = renderProvider({ children: null }); effects.splice(0).forEach(effect => effect()); return result; };
  const close = () => { if (mounted) { mounted = false; slots.forEach(slot => slot.cleanup?.()); } };
  t.after(close);
  return { render, close, journals, initial, signOut, cleanup,
    emit: (event, user = null) => listener(event, user ? { user } : null),
    holdCleanup: () => { delayCleanup = true; },
    replayEffects: () => {
      const active = slots.filter(slot => slot.effect);
      active.forEach(slot => slot.cleanup?.()); active.forEach(slot => { slot.cleanup = slot.effect(); });
    },
  };
}

test('AuthProvider keeps online cached identity unavailable until bootstrap accepts it; flag OFF opens no journal', async t => {
  const f = await fixture(t, { enabled: false, cached: { id: 'cached' } });
  assert.equal(f.render().user, null); assert.equal(f.render().shoppingDraftScope, null);
  f.initial.resolve({ data: { session: { user: { id: 'a' } } } }); await tick();
  const context = f.render(); assert.equal(context.user.id, 'a'); assert.equal(context.shoppingDraftScope.enabled, false);
  assert.throws(() => context.shoppingDraftScope.acquire(), { code: 'JOURNAL_DRAFT_DISABLED' }); assert.equal(f.journals.length, 0);
});

test('offline startup and null-session fallback preserve the accepted cached owner and draft', async t => {
  const f = await fixture(t, { offline: true, cached: { id: 'a' } });
  const scope = f.render().shoppingDraftScope, runtime = scope.acquire();
  const lease = runtime.registry.attach({ userId: 'a', projectId: 'p' }); lease.edit(value); await lease.flush();
  f.initial.resolve({ data: { session: null } }); await tick();
  assert.equal(f.render().shoppingDraftScope, scope);
  f.emit('TOKEN_REFRESHED'); assert.equal(f.render().shoppingDraftScope, scope);
  assert.equal(lease.snapshot().value.text, value.text); assert.equal(f.journals.length, 1);
});

test('same-user refresh preserves authority; SIGNED_OUT then same-user SIGNED_IN before render revokes old scope', async t => {
  const f = await fixture(t); f.render(); f.emit('SIGNED_IN', { id: 'a' }); const scope = f.render().shoppingDraftScope;
  const runtime = scope.acquire(); const lease = runtime.registry.attach({ userId: 'a', projectId: 'p' });
  lease.edit(value); await lease.flush(); f.emit('TOKEN_REFRESHED', { id: 'a' });
  assert.equal(f.render().shoppingDraftScope, scope);
  f.emit('SIGNED_OUT'); f.emit('SIGNED_IN', { id: 'a' });
  assert.throws(() => scope.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.throws(() => lease.snapshot(), { code: 'JOURNAL_OWNER_CHANGED' });
  await assert.rejects(runtime.repository.list('p'), { code: 'JOURNAL_OWNER_CHANGED' });
  const fresh = f.render().shoppingDraftScope; assert.notEqual(fresh, scope); assert.equal(fresh.userId, 'a');
});

test('account switch closes old writer immediately, before React renders the replacement account', async t => {
  const f = await fixture(t); f.render(); f.emit('SIGNED_IN', { id: 'a' }); const scope = f.render().shoppingDraftScope;
  const runtime = scope.acquire(); f.emit('SIGNED_IN', { id: 'b' });
  assert.throws(() => scope.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
  await assert.rejects(runtime.repository.list('p'), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.equal(f.render().shoppingDraftScope.userId, 'b');
});

test('effect cleanup/replay publishes a fresh offline capability and unmount closes both registry and journal', async t => {
  const f = await fixture(t, { offline: true, cached: { id: 'a' } }); const scope = f.render().shoppingDraftScope;
  const runtime = scope.acquire(); f.replayEffects();
  assert.throws(() => scope.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
  const next = f.render().shoppingDraftScope; assert.notEqual(next, scope); next.acquire(); f.close();
  assert.throws(() => next.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
  await assert.rejects(runtime.repository.list('p'), { code: 'JOURNAL_OWNER_CHANGED' });
});

for (const passwordRecovery of [false, true]) {
  test(`successful ${passwordRecovery ? 'recovery ' : ''}sign-out without an auth event revokes before async cleanup`, async t => {
    const f = await fixture(t); f.render(); f.emit('SIGNED_IN', { id: 'a' }); const context = f.render();
    const scope = context.shoppingDraftScope; scope.acquire(); f.holdCleanup();
    const leaving = passwordRecovery ? context.clearPasswordRecovery({ signOutSession: true }) : context.signOut();
    f.signOut.resolve({ error: null }); await tick();
    assert.throws(() => scope.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
    f.emit('SIGNED_IN', { id: 'b' }); const next = f.render().shoppingDraftScope;
    f.cleanup.resolve(); await leaving;
    assert.equal(f.render().user.id, 'b'); assert.equal(f.render().shoppingDraftScope, next);
  });
}

for (const passwordRecovery of [false, true]) {
  test(`a delayed old ${passwordRecovery ? 'recovery ' : ''}sign-out response cannot close a new same-account lineage`, async t => {
    const f = await fixture(t); f.render(); f.emit('SIGNED_IN', { id: 'a' }); const context = f.render();
    const leaving = passwordRecovery ? context.clearPasswordRecovery({ signOutSession: true }) : context.signOut();
    f.emit('SIGNED_OUT'); f.emit('SIGNED_IN', { id: 'a' });
    const next = f.render().shoppingDraftScope; f.signOut.resolve({ error: null }); await leaving;
    assert.equal(f.render().shoppingDraftScope, next); next.acquire();
  });
}

test('failed sign-out keeps the current draft authority and input', async t => {
  const f = await fixture(t); f.render(); f.emit('SIGNED_IN', { id: 'a' }); const context = f.render();
  const runtime = context.shoppingDraftScope.acquire(); const lease = runtime.registry.attach({ userId: 'a', projectId: 'p' });
  lease.edit(value); await lease.flush(); const leaving = context.signOut();
  f.signOut.resolve({ error: new Error('Offline') }); await leaving;
  assert.equal(f.render().shoppingDraftScope, context.shoppingDraftScope); assert.equal(lease.snapshot().value.text, value.text);
});
