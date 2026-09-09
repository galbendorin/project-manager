import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingInputBatches } from './shoppingInputBatches.js';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { createShoppingCreateWorkspace } from './shoppingCreateWorkspace.js';
import { memoryStorage } from '../../scripts/investigations/shopping-input-test-fixture.mjs';

const items = [{ operationId: 'milk-id', title: 'Milk', quantityValue: 2, quantityUnit: 'carton', meta: { note: 'keep' } },
  { operationId: 'bread-id', title: 'Bread', quantityValue: 3, quantityUnit: 'loaf' }];

for (const blockedIndex of [0, 1]) {
  test(`reopening during batch write ${blockedIndex + 1} retains complete payloads and stable identities`, async t => {
    const storage = memoryStorage(), indexedDB = new IDBFactory();
    const journals = [], workspaces = [];
    let release, entered;
    const paused = new Promise(resolve => { entered = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const make = block => {
      const journal = createShoppingCreateJournal({ userId: 'a', getCurrentUserId: () => 'a', indexedDB });
      journals.push(journal);
      const batchStore = createShoppingInputBatches({ userId: 'a', getCurrentUserId: () => 'a', storage: () => storage });
      const workspace = createShoppingCreateWorkspace({
        journal: block ? { ...journal, create: async entry => {
          if (entry.operationId === items[blockedIndex].operationId) { entered(); await held; }
          return journal.create(entry);
        } } : journal,
        inputBatches: batchStore, getCurrentUserId: () => 'a', isOnline: () => false,
        transport: { rpc() { throw new Error('No network before journal commit'); } }, onChange() {}, onRefresh() {},
      });
      workspaces.push(workspace); return { journal, workspace, batchStore };
    };
    t.after(() => { release(); workspaces.forEach(value => value.close()); });
    const first = make(true);
    let accepted = false;
    const adding = first.workspace.add('p', items, { onAccepted: () => { accepted = true; } });
    await paused;
    assert.equal(accepted, true);
    first.workspace.close();
    const reopened = make(false);
    assert.deepEqual(reopened.batchStore.list()[0].items, items);
    await reopened.workspace.sync();
    release(); await adding;
    const records = await reopened.journal.list();
    assert.equal(records.length, 2);
    assert.equal(records.find(row => row.operationId === 'milk-id').desired.draft.quantityValue, 2);
    assert.equal(records.find(row => row.operationId === 'bread-id').desired.draft.quantityUnit, 'loaf');
    assert.equal(reopened.batchStore.list().length, 0);
  });
}

test('an accepted batch retries a committed create whose completion was lost without resetting later edits', async t => {
  const storage = memoryStorage(), indexedDB = new IDBFactory();
  const journal = createShoppingCreateJournal({ userId: 'a', getCurrentUserId: () => 'a', indexedDB });
  const makeStore = () => createShoppingInputBatches({ userId: 'a', getCurrentUserId: () => 'a', storage: () => storage });
  let first = true;
  const workspace = createShoppingCreateWorkspace({ journal: { ...journal, create: async entry => {
    const record = await journal.create(entry);
    if (first) {
      first = false;
      await journal.setDesired(record.operationId, record.recordVersion, { ...record.desired,
        revision: '1', draft: { ...record.desired.draft, title: 'Oat milk' } });
      throw Object.assign(new Error('Completion delayed past watchdog'), { code: 'JOURNAL_STORAGE_TIMEOUT' });
    }
    return record;
  } }, inputBatches: makeStore(), getCurrentUserId: () => 'a', isOnline: () => false, transport: {}, onChange() {}, onRefresh() {} });
  t.after(() => workspace.close());
  const result = await workspace.add('p', [items[0]]);
  assert.equal(result.failedItems.length, 0);
  assert.equal(makeStore().list().length, 1);
  await workspace.sync();
  assert.equal((await journal.list()).length, 1);
  assert.equal((await journal.read('milk-id')).desired.draft.title, 'Oat milk');
  assert.equal(makeStore().list().length, 0);
});

test('denied input storage prevents acknowledgement and all journal writes', async () => {
  let accepted = false, creates = 0;
  const inputBatches = createShoppingInputBatches({ userId: 'a', getCurrentUserId: () => 'a', storage: () => {
    throw new Error('denied');
  } });
  const workspace = createShoppingCreateWorkspace({ journal: { create() { creates++; }, close() {} }, inputBatches,
    getCurrentUserId: () => 'a', isOnline: () => true, transport: {}, onChange() {}, onRefresh() {} });
  await assert.rejects(workspace.add('p', items, { onAccepted: () => { accepted = true; } }), { code: 'JOURNAL_STORAGE_INPUT_UNAVAILABLE' });
  assert.equal(accepted, false); assert.equal(creates, 0); workspace.close();
});

test('separate batches/tabs and accounts cannot overwrite or remove each other', () => {
  const storage = memoryStorage();
  let owner = 'a';
  const make = userId => createShoppingInputBatches({ userId, getCurrentUserId: () => owner, storage: () => storage });
  const a = make('a'), tab = make('a');
  const first = a.save('p', items); tab.save('other-p', items);
  a.remove(first); assert.equal(tab.list().length, 1);
  owner = 'b'; const b = make('b'); b.save('b-project', items);
  assert.throws(() => a.list(), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.equal(b.list().length, 1);
  owner = 'a'; a.close(); assert.throws(() => a.list(), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.equal(tab.list().length, 1);
});
