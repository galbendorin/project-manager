import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { createShoppingCreateWorkspace } from './shoppingCreateWorkspace.js';
import { createShoppingInputBatches } from './shoppingInputBatches.js';
import { memoryStorage } from '../../scripts/investigations/shopping-input-test-fixture.mjs';

const items = [{ operationId: 'milk-id', title: 'Milk', quantityValue: 2, quantityUnit: 'carton', meta: { note: 'keep' } }];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture(t, wrap = store => store) {
  let owner = 'a';
  const indexedDB = new IDBFactory();
  const storage = memoryStorage(), snapshots = [];
  const journal = createShoppingCreateJournal({ userId: 'a', getCurrentUserId: () => owner, indexedDB });
  const store = createShoppingInputBatches({ userId: 'a', getCurrentUserId: () => owner, storage: () => storage });
  let creates = 0, broadcasts = 0;
  const workspace = createShoppingCreateWorkspace({
    journal: { ...journal, create: entry => { creates++; return journal.create(entry); } },
    inputBatches: wrap(store), getCurrentUserId: () => owner, isOnline: () => false,
    transport: { rpc() { assert.fail('Offline handoff must not call the network'); } },
    onChange: value => snapshots.push(value), onRefresh() {}, broadcast() { broadcasts++; },
  });
  t.after(() => workspace.close());
  return { journal, workspace, store, snapshots, setOwner: value => { owner = value; },
    creates: () => creates, broadcasts: () => broadcasts };
}

test('delayed batch commitment gates acceptance and every operation write', async t => {
  const gate = deferred();
  const f = fixture(t, store => ({ ...store, save: async (...args) => { await gate.promise; return store.save(...args); },
    list: async () => store.list(), remove: async batch => store.remove(batch) }));
  let accepted = 0;
  const adding = f.workspace.add('p', items, { onAccepted() { accepted++; } });
  await Promise.resolve();
  assert.equal(accepted, 0); assert.equal(f.creates(), 0); assert.equal(f.store.list().length, 0);
  gate.resolve();
  const result = await adding;
  assert.equal(accepted, 1); assert.equal(result.queuedCount, 1);
  assert.equal((await f.journal.list()).length, 1);
  assert.equal((await f.journal.read('milk-id')).desired.draft.quantityValue, 2);
  assert.equal(f.store.list().length, 0);
});

test('asynchronous save rejection keeps acceptance and operation writes untouched', async t => {
  const gate = deferred();
  const f = fixture(t, store => ({ ...store, save: () => gate.promise }));
  let accepted = false;
  const adding = f.workspace.add('p', items, { onAccepted() { accepted = true; } });
  const rejection = assert.rejects(adding, { code: 'JOURNAL_STORAGE_TIMEOUT' });
  gate.reject(Object.assign(new Error('Save outcome unknown'), { code: 'JOURNAL_STORAGE_TIMEOUT' }));
  await rejection;
  assert.equal(accepted, false); assert.equal(f.creates(), 0);
});

test('committed save with lost completion recovers original identities on sync', async t => {
  const f = fixture(t, store => ({ ...store, save: async (...args) => {
    store.save(...args);
    throw Object.assign(new Error('Completion lost'), { code: 'JOURNAL_STORAGE_TIMEOUT' });
  }, list: async () => store.list(), remove: async batch => store.remove(batch) }));
  let accepted = false;
  await assert.rejects(f.workspace.add('p', items, { draftGeneration: 'draft-a', onAccepted() { accepted = true; } }),
    { code: 'JOURNAL_STORAGE_TIMEOUT' });
  assert.equal(accepted, false); assert.equal(f.creates(), 0);
  assert.deepEqual(f.store.list()[0].items, items);
  await f.workspace.sync();
  await f.workspace.sync();
  assert.equal((await f.journal.list()).length, 1);
  assert.equal((await f.journal.read('milk-id')).desired.draft.quantityValue, 2);
  assert.equal(f.store.list().length, 0);
});

for (const transition of ['close', 'owner']) {
  test(`${transition} during committed save suppresses acceptance and operation creation`, async t => {
    const gate = deferred();
    const f = fixture(t, store => ({ ...store, save: (...args) => { store.save(...args); return gate.promise; } }));
    let accepted = false;
    const adding = f.workspace.add('p', items, { onAccepted() { accepted = true; } });
    if (transition === 'close') f.workspace.close(); else f.setOwner('b');
    const notifications = f.snapshots.length;
    gate.resolve();
    assert.equal((await adding).cancelled, true);
    assert.equal(accepted, false); assert.equal(f.creates(), 0);
    assert.equal(f.snapshots.length, notifications); assert.equal(f.broadcasts(), 0);
  });
}

test('delayed batch removal is awaited and rejected removal remains recoverable', async t => {
  const gate = deferred(), entered = deferred();
  const f = fixture(t, store => ({ ...store, remove: () => { entered.resolve(); return gate.promise; } }));
  const adding = f.workspace.add('p', items);
  let finished = false;
  void adding.then(() => { finished = true; });
  await entered.promise;
  assert.equal(f.creates(), 1); assert.equal(finished, false);
  gate.reject(Object.assign(new Error('Cannot commit removal'), { code: 'JOURNAL_STORAGE_FAILED' }));
  assert.equal((await adding).failedItems.length, 0);
  assert.equal(f.store.list().length, 1);
  assert.equal(f.snapshots.at(-1).batches.length, 1);
  assert.ok(f.snapshots.at(-1).errors.has(`batch:${f.store.list()[0].id}`));
});

test('older asynchronous reload cannot resurrect a removed batch or its read error', async t => {
  for (const reject of [false, true]) {
    const oldRead = deferred(), entered = deferred();
    let first = true;
    const f = fixture(t, store => ({ ...store, list: () => {
      if (first) { first = false; entered.resolve(); return oldRead.promise; }
      return Promise.resolve(store.list());
    } }));
    const batch = f.store.save('p', items);
    const older = f.workspace.reload();
    await entered.promise;
    f.store.remove(batch);
    await f.workspace.reload();
    const notifications = f.snapshots.length;
    if (reject) oldRead.reject(new Error('Old read failed')); else oldRead.resolve([batch]);
    await older;
    assert.equal(f.snapshots.length, notifications);
    assert.deepEqual(f.snapshots.at(-1).batches, []);
    assert.equal(f.snapshots.at(-1).errors.has('inputs'), false);
  }
});

test('closing during asynchronous recovery read prevents journal writes', async t => {
  const gate = deferred(), entered = deferred();
  const f = fixture(t, store => ({ ...store, list: () => { entered.resolve(); return gate.promise; } }));
  const batch = f.store.save('p', items);
  const syncing = f.workspace.sync();
  // sync will attempt a journal reload after recovery; a closed real journal
  // rejects that read. Observe that rejection without weakening the assertion.
  const outcome = syncing.catch(error => error);
  await entered.promise;
  f.workspace.close(); const notifications = f.snapshots.length;
  gate.resolve([batch]); await outcome;
  assert.equal(f.creates(), 0); assert.equal(f.snapshots.length, notifications);
});
