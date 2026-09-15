import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { createShoppingDraftOwner } from './shoppingDraftOwner.js';

const value = { text: 'Milk', items: [{ title: 'Milk', operationId: 'original-id' }] };
function fixture(t, options = {}) {
  const indexedDB = new IDBFactory(), created = [];
  const manager = createShoppingDraftOwner({ enabled: true,
    createJournal: args => { const journal = createShoppingCreateJournal({ ...args, indexedDB }); created.push(journal); return journal; },
    ...options });
  t.after(() => manager.close());
  return { manager, created };
}

test('disabled owner capabilities do not instantiate a journal even when acquisition is attempted', t => {
  const f = fixture(t, { enabled: false, initialUserId: 'a' });
  const scope = f.manager.getScope(); assert.equal(scope.userId, 'a'); assert.equal(scope.enabled, false);
  assert.throws(() => scope.acquire(), { code: 'JOURNAL_DRAFT_DISABLED' });
  f.manager.setOwner('b'); f.manager.close(); assert.equal(f.created.length, 0);
});

test('owner acceptance is storage-free and same-user refresh preserves the exact registry', async t => {
  const f = fixture(t), scope = f.manager.setOwner('a'); assert.equal(f.created.length, 0);
  const runtime = scope.acquire(); const lease = runtime.registry.attach({ userId: 'a', projectId: 'p' });
  lease.edit(value); await lease.flush(); lease.detach();
  assert.equal(f.manager.setOwner('a'), scope); assert.equal(scope.acquire(), runtime); assert.equal(f.created.length, 1);
  assert.equal(runtime.registry.attach({ userId: 'a', projectId: 'p' }).snapshot().value.text, 'Milk');
});

test('A to B to A without a render revokes old acquired and unacquired capabilities', async t => {
  const f = fixture(t), first = f.manager.setOwner('a');
  const a = first.acquire(); const lease = a.registry.attach({ userId: 'a', projectId: 'p' }); lease.edit(value); await lease.flush();
  const middle = f.manager.setOwner('b'), last = f.manager.setOwner('a');
  assert.notEqual(first, last);
  assert.throws(() => first.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.throws(() => middle.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.throws(() => lease.snapshot(), { code: 'JOURNAL_OWNER_CHANGED' });
  await assert.rejects(a.repository.list('p'), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.notEqual(last.acquire(), a); assert.equal(f.created.length, 2);
});

test('owner closure publishes empty state, closes the journal, and restart creates a new lineage', async t => {
  const f = fixture(t), scope = f.manager.setOwner('a'), runtime = scope.acquire(), snapshots = [];
  const lease = runtime.registry.attach({ userId: 'a', projectId: 'p', onChange: snapshot => snapshots.push(snapshot) });
  lease.edit(value); await lease.flush(); f.manager.close();
  assert.equal(snapshots.at(-1).phase, 'closed'); assert.equal(snapshots.at(-1).value.text, '');
  await assert.rejects(runtime.repository.list('p'), { code: 'JOURNAL_OWNER_CHANGED' });
  const fresh = f.manager.setOwner('a'); assert.notEqual(fresh, scope);
  assert.equal(fresh.acquire().registry.list('p').length, 0);
  assert.equal((await fresh.acquire().repository.list('p')).length, 1); // Durable storage remains owner scoped.
});

test('a closed observer cannot reacquire old authority during owner replacement', t => {
  const f = fixture(t), scope = f.manager.setOwner('a'); let checked = false;
  scope.acquire().registry.attach({ userId: 'a', projectId: 'p', onChange: snapshot => {
    if (snapshot.phase === 'closed') { assert.throws(() => scope.acquire(), { code: 'JOURNAL_OWNER_CHANGED' }); checked = true; }
  } });
  f.manager.setOwner('b'); assert.equal(checked, true); assert.equal(f.created.length, 1);
});

test('failed registry construction closes its journal and can retry without changing owner identity', t => {
  let attempts = 0, closed = 0;
  const f = fixture(t, { createJournal: () => ({ drafts: {}, close: () => closed++ }),
    createRegistry: () => { if (++attempts === 1) throw new Error('Unavailable'); return { close() {} }; } });
  const scope = f.manager.setOwner('a'); assert.throws(() => scope.acquire(), /Unavailable/); assert.equal(closed, 1);
  assert.equal(f.manager.getScope(), scope); const runtime = scope.acquire(); assert.equal(scope.acquire(), runtime);
});

test('journal closes even if registry cleanup throws', () => {
  let closed = false;
  const manager = createShoppingDraftOwner({ enabled: true,
    createJournal: () => ({ drafts: {}, close: () => { closed = true; } }),
    createRegistry: () => ({ close: () => { throw new Error('Cleanup failed'); } }) });
  const scope = manager.setOwner('a'); scope.acquire(); assert.throws(() => manager.close(), /Cleanup failed/);
  assert.equal(closed, true); assert.equal(manager.getScope(), null);
  assert.throws(() => scope.acquire(), { code: 'JOURNAL_OWNER_CHANGED' });
});
