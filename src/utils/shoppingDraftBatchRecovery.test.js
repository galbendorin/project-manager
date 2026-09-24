import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { createShoppingCreateWorkspace, shoppingCreatePendingState } from './shoppingCreateWorkspace.js';
import { createShoppingCreateOperations, shoppingCreateInitialDesired } from './shoppingCreateOperation.js';
import { listShoppingDraftHandoffs } from './shoppingDraftBatchRecovery.js';
import { createShoppingInputBatches } from './shoppingInputBatches.js';
import { memoryStorage } from '../../scripts/investigations/shopping-input-test-fixture.mjs';

const item = (id, title = 'Milk') => ({ operationId: id, title, quantityValue: 2, quantityUnit: 'carton',
  sourceType: 'meal', sourceBatchId: 'meal-a', meta: { note: 'preserve' } });
const items = [item('milk-a'), item('milk-b')];
const tick = () => new Promise(setImmediate);
function fixture(t) {
  const indexedDB = new IDBFactory(), journals = [], workspaces = [];
  let owner = 'a', projectId = 'p';
  const journal = (includeDrafts = false, userId = owner) => {
    const value = createShoppingCreateJournal({ userId, getCurrentUserId: () => owner, indexedDB, includeDrafts });
    journals.push(value); return value;
  };
  const accept = async (entries = items, selectedProject = projectId) => {
    const writer = journal(true);
    const draftId = `draft-${selectedProject}-${entries[0].operationId}`;
    await writer.drafts.create({ projectId: selectedProject, draftId, value: { text: entries.map(row => row.title).join(', '), items: entries } });
    const batch = await writer.drafts.accept({ projectId: selectedProject, draftId, expectedVersion: 1 });
    writer.close(); return batch;
  };
  const workspace = (wrap = value => value) => {
    const base = journal(), snapshots = [], storage = memoryStorage();
    const value = createShoppingCreateWorkspace({ journal: wrap(base), getCurrentUserId: () => owner,
      getSelectedProjectId: () => projectId, isOnline: () => false,
      inputBatches: createShoppingInputBatches({ userId: owner, getCurrentUserId: () => owner, storage: () => storage }),
      transport: { rpc() { assert.fail('Offline recovery cannot send a network request'); } },
      onChange: snapshot => snapshots.push(snapshot), onRefresh() {},
    });
    workspaces.push(value); return { workspace: value, journal: base, snapshots };
  };
  t.after(() => { workspaces.forEach(value => value.close()); journals.forEach(value => value.close()); });
  return { indexedDB, journal, accept, workspace, setOwner: next => { owner = next; }, setProject: next => { projectId = next; } };
}

test('normal reader does not upgrade a fresh database or expose a draft writer', async t => {
  const f = fixture(t), reader = f.journal();
  assert.equal(reader.drafts, undefined); assert.deepEqual(await reader.readAcceptedDrafts('p'), []);
  const db = await new Promise((resolve, reject) => { const request = f.indexedDB.open('pmworkspace-shopping-create-journal');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  assert.equal(db.version, 1); assert.equal(db.objectStoreNames.contains('accepted_draft_batches'), false); db.close();
});

test('reader without the rollout writer recovers accepted batches after compaction', async t => {
  const f = fixture(t), batch = await f.accept();
  const writer = f.journal(true);
  await writer.drafts.compactAccepted({ projectId: 'p', draftId: batch.draftId, expectedVersion: 2 }); writer.close();
  const reader = f.journal();
  assert.equal(reader.drafts, undefined); assert.deepEqual(await reader.readAcceptedDrafts('p'), [batch]);
  assert.deepEqual(await reader.readAcceptedDrafts('other'), []);
});

test('rollback to a compatible feature-off reader recovers old input and v2 acceptance without new identities', async t => {
  const indexedDB = new IDBFactory();
  const storage = memoryStorage();
  const userId = 'a', projectId = 'p';
  const owner = () => userId;
  const journals = [];
  const open = (options = {}) => {
    const journal = createShoppingCreateJournal({ indexedDB, userId, getCurrentUserId: owner, ...options });
    journals.push(journal); return journal;
  };
  const oldPinned = open({ indexedDB: { open: name => indexedDB.open(name, 1) } });
  const legacy = item('old-operation', 'Bread');
  await oldPinned.create({ operationId: legacy.operationId, projectId,
    localId: `offline-${legacy.operationId}`, desired: shoppingCreateInitialDesired(legacy) });
  const oldInput = createShoppingInputBatches({ userId, getCurrentUserId: owner, storage: () => storage });
  const oldBatch = oldInput.save(projectId, [item('old-batch', 'Milk')], { draftGeneration: 'old-generation' });
  storage.setItem('pmworkspace:shopping-draft:v1:a', 'Unsubmitted rice');

  const writer = open({ includeDrafts: true });
  const newer = item('new-accepted', 'Milk');
  await writer.drafts.create({ projectId, draftId: 'new-draft', value: { text: 'Milk', items: [newer] } });
  const accepted = await writer.drafts.accept({ projectId, draftId: 'new-draft', expectedVersion: 1 });
  await writer.drafts.create({ projectId, draftId: 'unsent-draft', value: { text: 'Eggs', items: [item('unsent-eggs', 'Eggs')] } });
  writer.close();

  await assert.rejects(oldPinned.read(legacy.operationId), error =>
    error.code === 'JOURNAL_STORAGE_UNAVAILABLE' && error.cause?.name === 'VersionError');
  assert.equal(storage.getItem('pmworkspace:shopping-input-batch:v1:a:old-generation') !== null, true);
  const rollback = open();
  assert.equal(rollback.drafts, undefined);
  assert.deepEqual(await rollback.readAcceptedDrafts(projectId), [accepted]);
  assert.equal((await rollback.read(legacy.operationId)).operationId, legacy.operationId);

  const snapshots = [];
  const workspace = createShoppingCreateWorkspace({ journal: rollback, getCurrentUserId: owner,
    getSelectedProjectId: () => projectId, isOnline: () => false,
    inputBatches: createShoppingInputBatches({ userId, getCurrentUserId: owner, storage: () => storage }),
    transport: { rpc() { assert.fail('Offline rollback must not dispatch'); } },
    onChange: snapshot => snapshots.push(snapshot), onRefresh() {},
  });
  t.after(() => { workspace.close(); oldInput.close(); journals.forEach(journal => journal.close()); });
  await workspace.sync();
  const records = await rollback.list();
  assert.deepEqual(records.map(record => record.operationId).sort(), ['new-accepted', 'old-batch', 'old-operation']);
  assert.equal(shoppingCreatePendingState({ ...snapshots.at(-1), projectId }).pendingCount, 3);
  assert.equal(snapshots.at(-1).batches.length, 0);
  assert.equal((await rollback.read('old-batch')).initialDesired.draft.title, 'Milk');
  assert.deepEqual(await rollback.readAcceptedDrafts(projectId), [accepted]);
  assert.equal(storage.getItem('pmworkspace:shopping-input-batch:v1:a:old-generation') !== null, true);
  assert.equal(storage.getItem('pmworkspace:shopping-draft:v1:a'), 'Unsubmitted rice');
  assert.equal(oldBatch.items[0].operationId, 'old-batch');

  await workspace.sync();
  assert.deepEqual((await rollback.list()).map(record => record.operationId).sort(), ['new-accepted', 'old-batch', 'old-operation']);
  const resumedWriter = open({ includeDrafts: true });
  assert.deepEqual((await resumedWriter.drafts.list(projectId)).map(draft => draft.draftId), ['unsent-draft']);
});

test('offline workspace recovers exact identities with duplicate titles and keeps batch evidence', async t => {
  const f = fixture(t), batch = await f.accept(), w = f.workspace();
  await w.workspace.reload(); assert.equal(w.snapshots.at(-1).batches[0].items.length, 2);
  await w.workspace.sync();
  const records = await w.journal.list(); assert.equal(records.length, 2);
  assert.deepEqual(records.map(row => row.operationId).sort(), ['milk-a', 'milk-b']);
  assert.equal(records[0].initialDesired.source.meta.note, 'preserve');
  assert.deepEqual(await w.journal.readAcceptedDrafts('p'), [batch]);
  assert.equal(w.snapshots.at(-1).batches.length, 0);
  await w.workspace.sync(); assert.equal((await w.journal.list()).length, 2);
});

test('reload after partial handoff preserves an already edited operation and finishes remaining items', async t => {
  const f = fixture(t); await f.accept();
  const first = f.workspace(journal => ({ ...journal, create: request => {
    if (request.operationId === 'milk-b') throw Object.assign(new Error('Storage unavailable'), { code: 'JOURNAL_STORAGE_FAILED' });
    return journal.create(request);
  } }));
  await first.workspace.sync(); assert.equal((await first.journal.list()).length, 1);
  const operations = createShoppingCreateOperations({ journal: first.journal, getCurrentUserId: () => 'a', supabaseClient: {} });
  await operations.edit('milk-a', '0', { title: 'Oat milk', quantityValue: 3 });
  const edited = await first.journal.read('milk-a'); first.workspace.close();
  const reopened = f.workspace(); await reopened.workspace.sync();
  assert.deepEqual(await reopened.journal.read('milk-a'), edited);
  assert.equal((await reopened.journal.read('milk-b')).desired.draft.title, 'Milk');
  assert.equal(reopened.snapshots.at(-1).batches.length, 0);
});

test('a committed operation with lost completion is recognised without another contribution', async t => {
  const f = fixture(t); await f.accept([items[0]]);
  const w = f.workspace(journal => ({ ...journal, create: async request => {
    await journal.create(request); throw Object.assign(new Error('Lost completion'), { code: 'JOURNAL_STORAGE_TIMEOUT' });
  } }));
  await w.workspace.sync(); await w.workspace.sync();
  assert.equal((await w.journal.list()).length, 1); assert.equal(w.snapshots.at(-1).batches.length, 0);
});

for (const mismatch of ['project', 'local', 'initial']) {
  test(`${mismatch} mismatch cannot be counted as a completed handoff`, async t => {
    const f = fixture(t); await f.accept([items[0]]); const w = f.workspace();
    await w.journal.create({ operationId: 'milk-a', projectId: mismatch === 'project' ? 'other' : 'p',
      localId: mismatch === 'local' ? 'other-local' : 'offline-milk-a',
      desired: shoppingCreateInitialDesired(mismatch === 'initial' ? item('milk-a', 'Wrong payload') : items[0]) });
    const before = await w.journal.read('milk-a');
    await w.workspace.sync();
    assert.equal(w.snapshots.at(-1).errors.has('drafts'), true);
    assert.deepEqual(await w.journal.read('milk-a'), before); assert.equal((await w.journal.readAcceptedDrafts('p')).length, 1);
  });
}

test('independent tabs recovering the same batch create each operation only once', async t => {
  const f = fixture(t); await f.accept(); const a = f.workspace(), b = f.workspace();
  await Promise.all([a.workspace.sync(), b.workspace.sync()]);
  assert.equal((await a.journal.list()).length, 2);
  assert.equal((await a.journal.readAcceptedDrafts('p')).length, 1);
});

test('project and owner scopes isolate accepted batches', async t => {
  const f = fixture(t); await f.accept([items[0]], 'p'); await f.accept([items[1]], 'q');
  const a = f.workspace(); await a.workspace.sync(); assert.equal((await a.journal.list()).length, 1);
  f.setProject('q'); await a.workspace.sync(); assert.equal((await a.journal.list()).length, 2);
  f.setOwner('b');
  const b = f.workspace(); await b.workspace.sync(); assert.equal((await b.journal.list()).length, 0);
  await assert.rejects(a.journal.readAcceptedDrafts('p'), { code: 'JOURNAL_OWNER_CHANGED' });
});

test('owner replacement while reading a batch prevents operation creation', async t => {
  const f = fixture(t); await f.accept(); let finish, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const w = f.workspace(journal => ({ ...journal, readAcceptedDrafts: async project => {
    const result = await journal.readAcceptedDrafts(project); entered(); await new Promise(resolve => { finish = resolve; }); return result;
  } }));
  const syncing = w.workspace.sync().catch(error => error);
  await waiting; f.setOwner('b'); finish(); await syncing;
  f.setOwner('a'); assert.equal((await w.journal.list()).length, 0);
});

test('large offline handoff schedules bounded continuation until every item is journaled', async t => {
  const f = fixture(t); await f.accept(Array.from({ length: 103 }, (_, n) => item(`item-${n}`, `Grocery ${n}`)));
  const w = f.workspace(); await w.workspace.sync();
  for (let n = 0; n < 1000; n++) {
    await tick(); if (!w.snapshots.at(-1).busy && w.snapshots.at(-1).records.length === 103) break;
  }
  assert.equal(w.snapshots.at(-1).records.length, 103); assert.equal(w.snapshots.at(-1).batches.length, 0);
});

test('invalid accepted input is retained and cannot cause partial handoff', async t => {
  const f = fixture(t); await f.accept([items[0], { ...items[1], quantityValue: -2 }]);
  const w = f.workspace(); await w.workspace.sync();
  assert.equal((await w.journal.list()).length, 0); assert.equal(w.snapshots.at(-1).errors.has('drafts'), true);
  assert.equal((await w.journal.readAcceptedDrafts('p')).length, 1);
});

test('handoff listing rejects an edited legacy record without an immutable initial snapshot', async t => {
  const f = fixture(t), batch = await f.accept([items[0]]);
  const initial = shoppingCreateInitialDesired(items[0]);
  await assert.rejects(listShoppingDraftHandoffs({ userId: 'a', projectId: 'p', getCurrentUserId: () => 'a',
    journal: { readAcceptedDrafts: async () => [batch], list: async () => [{ userId: 'a', projectId: 'p',
      operationId: 'milk-a', localId: 'offline-milk-a', desired: { ...initial, draft: { ...initial.draft, title: 'Edited' } } }] },
  }), { code: 'JOURNAL_DRAFT_HANDOFF_CONFLICT' });
});
