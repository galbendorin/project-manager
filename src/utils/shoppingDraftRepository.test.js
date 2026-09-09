import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';

const value = title => ({ text: title, items: [{ operationId: `id-${title}`, title, quantityValue: 2,
  quantityUnit: 'carton', sourceType: 'manual', sourceBatchId: null, meta: { note: 'keep' } }] });
const initial = value('Milk');
const create = { projectId: 'p', draftId: 'd', value: initial };
const target = { projectId: 'p', draftId: 'd', expectedVersion: 1 };

function fixture(t) {
  const indexedDB = new IDBFactory(), connections = [];
  let owner = 'a';
  const open = (options = {}) => {
    const journal = createShoppingCreateJournal({ indexedDB, userId: owner, getCurrentUserId: () => owner,
      includeDrafts: true, ...options });
    connections.push(journal); return journal;
  };
  t.after(() => connections.forEach(journal => journal.close()));
  return { indexedDB, open, setOwner: next => { owner = next; } };
}

// Wrap native emulator transaction events, preserving its commit/abort and
// cross-connection serialization. Faults never replace the repository logic.
function intercept(indexedDB, onTransaction) {
  return { open(...args) {
    const request = indexedDB.open(...args);
    request.addEventListener('success', () => {
      const db = request.result, transaction = db.transaction.bind(db);
      db.transaction = (...args) => {
        const tx = transaction(...args); onTransaction(tx, args); return tx;
      };
    });
    return request;
  } };
}

test('draft payloads and accepted identities survive a new connection without session storage', async t => {
  const f = fixture(t), first = f.open();
  await first.drafts.create(create);
  await first.drafts.create({ ...create, draftId: 'other', value: value('Bread') });
  const accepted = await first.drafts.accept(target);
  first.close();
  const next = f.open().drafts;
  assert.deepEqual((await next.list('p')).map(draft => draft.value.text), ['Bread']);
  assert.deepEqual(await next.listAccepted('p'), [accepted]);
  assert.deepEqual(accepted.value, initial);
  assert.equal((await next.read('p', 'd')).state, 'accepted');
});

test('repeated draft edits replace one current head without retaining each keystroke', async t => {
  const drafts = fixture(t).open().drafts;
  let record = await drafts.create(create);
  for (let n = 0; n < 100; n++) record = await drafts.update({ ...target, expectedVersion: record.recordVersion, value: value(`Milk ${n}`) });
  const records = await drafts.list('p');
  assert.equal(records.length, 1);
  assert.equal(records[0].value.text, 'Milk 99');
  assert.deepEqual(records[0].initial, initial);
  assert.deepEqual(Object.keys(records[0]).sort(), ['draftId', 'initial', 'projectId', 'recordVersion', 'schemaVersion', 'state', 'userId', 'value']);
});

test('exact create retry returns later and accepted state rather than resetting initial input', async t => {
  const drafts = fixture(t).open().drafts;
  await drafts.create(create);
  const edited = await drafts.update({ ...target, value: value('Oat milk') });
  assert.deepEqual(await drafts.create(create), edited);
  await drafts.accept({ ...target, expectedVersion: 2 });
  assert.equal((await drafts.create(create)).state, 'accepted');
  await assert.rejects(drafts.create({ ...create, value: value('Bread') }), { code: 'JOURNAL_DRAFT_EXISTS' });
});

test('versioned edits allow exact immediate retry but reject stale replay after intervening work', async t => {
  const drafts = fixture(t).open().drafts;
  await drafts.create(create);
  const change = { ...target, value: value('Bread') };
  const edited = await drafts.update(change);
  assert.deepEqual(await drafts.update(change), edited);
  await drafts.update({ ...target, expectedVersion: 2, value: value('Apples') });
  await assert.rejects(drafts.update(change), { code: 'JOURNAL_DRAFT_CONFLICT' });
  assert.equal((await drafts.read('p', 'd')).value.text, 'Apples');
});

test('two duplicated-tab editors cannot silently overwrite each other', async t => {
  const f = fixture(t), a = f.open().drafts, b = f.open().drafts;
  await a.create(create);
  const results = await Promise.allSettled([a.update({ ...target, value: value('Bread') }), b.update({ ...target, value: value('Apples') })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'JOURNAL_DRAFT_CONFLICT');
  assert.equal((await a.read('p', 'd')).recordVersion, 2);
});

for (const editFirst of [false, true]) {
  test(`acceptance racing an edit has one consistent committed outcome (edit initiated first=${editFirst})`, async t => {
    const f = fixture(t), a = f.open().drafts, b = f.open().drafts;
    await a.create(create); await b.read('p', 'd');
    const edit = () => b.update({ ...target, value: value('Bread') });
    const accept = () => a.accept(target);
    const results = await Promise.allSettled(editFirst ? [edit(), accept()] : [accept(), edit()]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const record = await a.read('p', 'd'), batches = await a.listAccepted('p');
    if (record.state === 'accepted') {
      assert.equal(batches.length, 1); assert.deepEqual(batches[0].value, initial);
    } else {
      assert.equal(batches.length, 0); assert.equal(record.value.text, 'Bread');
    }
  });
}

test('concurrent exact acceptance retries share one immutable batch', async t => {
  const f = fixture(t), a = f.open().drafts, b = f.open().drafts;
  await a.create(create);
  const results = await Promise.all([a.accept(target), b.accept(target)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await b.listAccepted('p')).length, 1);
  await assert.rejects(a.accept({ ...target, expectedVersion: 2 }), { code: 'JOURNAL_DRAFT_CONFLICT' });
  await assert.rejects(b.update({ ...target, expectedVersion: 2, value: value('Bread') }), { code: 'JOURNAL_DRAFT_ACCEPTED' });
});

test('operation identities cannot be accepted by two drafts even in different projects', async t => {
  const drafts = fixture(t).open().drafts;
  await drafts.create(create); await drafts.accept(target);
  await drafts.create({ ...create, projectId: 'q', draftId: 'other' });
  await assert.rejects(drafts.accept({ ...target, projectId: 'q', draftId: 'other' }));
  assert.equal((await drafts.read('q', 'other')).state, 'editing');
  assert.deepEqual(await drafts.listAccepted('q'), []);
});

test('owner/project scopes isolate reads, updates, acceptance and operation identity reservations', async t => {
  const f = fixture(t), a = f.open().drafts;
  await a.create(create); await a.accept(target);
  assert.equal(await a.read('q', 'd'), null);
  await assert.rejects(a.update({ ...target, projectId: 'q', value: initial }), { code: 'JOURNAL_DRAFT_MISSING' });
  f.setOwner('b'); const b = f.open().drafts;
  assert.deepEqual(await b.list('p'), []); assert.deepEqual(await b.listAccepted('p'), []);
  await assert.rejects(a.read('p', 'd'), { code: 'JOURNAL_OWNER_CHANGED' });
  await b.create(create); await b.accept(target);
  assert.equal((await b.listAccepted('p')).length, 1);
});

test('request success followed by abort rolls back both accepted batch and draft state', async t => {
  const f = fixture(t);
  let abortAcceptance = false;
  const indexedDB = intercept(f.indexedDB, tx => {
    const objectStore = tx.objectStore.bind(tx);
    tx.objectStore = name => {
      const store = objectStore(name), put = store.put.bind(store);
      store.put = record => {
        const request = put(record);
        request.addEventListener('success', () => { if (abortAcceptance && record.state === 'accepted') tx.abort(); });
        return request;
      };
      return store;
    };
  });
  const drafts = f.open({ indexedDB }).drafts;
  await drafts.create(create); abortAcceptance = true;
  await assert.rejects(drafts.accept(target), { code: 'JOURNAL_STORAGE_ABORTED' });
  assert.equal((await drafts.read('p', 'd')).state, 'editing');
  assert.deepEqual(await drafts.listAccepted('p'), []);
  abortAcceptance = false;
  assert.deepEqual((await drafts.accept(target)).value, initial);
});

test('lost completion after acceptance commit times out, then exact retry recovers the same batch', async t => {
  const f = fixture(t);
  let hideCompletion = false;
  const indexedDB = intercept(f.indexedDB, (tx, [, mode]) => {
    tx.addEventListener('complete', event => { if (hideCompletion && mode === 'readwrite') event.stopImmediatePropagation(); });
  });
  const drafts = f.open({ indexedDB, timeoutMs: 80 }).drafts;
  await drafts.create(create); hideCompletion = true;
  await assert.rejects(drafts.accept(target), { code: 'JOURNAL_STORAGE_TIMEOUT' });
  const next = f.open().drafts, batch = await next.accept(target);
  assert.deepEqual(batch.value, initial);
  assert.equal((await next.listAccepted('p')).length, 1);
  assert.equal((await next.read('p', 'd')).recordVersion, 2);
});

test('owner change before transaction completion suppresses acceptance acknowledgement', async t => {
  const f = fixture(t);
  let switchOnWrite = false;
  const indexedDB = intercept(f.indexedDB, tx => {
    const objectStore = tx.objectStore.bind(tx);
    tx.objectStore = name => {
      const store = objectStore(name), put = store.put.bind(store);
      store.put = record => {
        const request = put(record);
        request.addEventListener('success', () => { if (switchOnWrite && record.state === 'accepted') f.setOwner('b'); });
        return request;
      };
      return store;
    };
  });
  const drafts = f.open({ indexedDB }).drafts;
  await drafts.create(create); switchOnWrite = true;
  await assert.rejects(drafts.accept(target), { code: 'JOURNAL_OWNER_CHANGED' });
  const next = f.open().drafts;
  assert.deepEqual(await next.listAccepted('p'), []);
});

test('schema upgrade preserves operations and lets an existing ordinary journal reopen', async t => {
  const f = fixture(t), normal = f.open({ includeDrafts: false });
  const operation = { operationId: 'op', projectId: 'p', localId: 'offline-op', desired: { title: 'Existing' } };
  const original = await normal.create(operation);
  const drafts = f.open().drafts;
  await drafts.create(create);
  assert.deepEqual(await normal.read('op'), original);
  assert.deepEqual(await f.open({ includeDrafts: false }).read('op'), original);
});

test('v2-first database allows ordinary operation creation without draft opt-in', async t => {
  const f = fixture(t);
  await f.open().drafts.create(create);
  const normal = f.open({ includeDrafts: false });
  assert.equal(normal.drafts, undefined);
  assert.equal((await normal.create({ operationId: 'op', projectId: 'p', localId: 'offline-op', desired: {} })).operationId, 'op');
});

test('blocked schema upgrade fails closed and can recover after the older connection closes', async t => {
  const f = fixture(t);
  const old = await new Promise((resolve, reject) => {
    const request = f.indexedDB.open('pmworkspace-shopping-create-journal', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('operations', { keyPath: ['userId', 'operationId'] });
      store.createIndex('owner', 'userId'); store.createIndex('local', ['userId', 'localId'], { unique: true });
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  t.after(() => old.close());
  const drafts = f.open().drafts;
  await assert.rejects(drafts.create(create), { code: 'JOURNAL_STORAGE_BLOCKED' });
  old.close();
  assert.equal((await f.open().drafts.create(create)).state, 'editing');
});

test('invalid or lossy values, duplicate identities and empty acceptance fail without writes', async t => {
  const drafts = fixture(t).open().drafts;
  const invalid = [new Date(), { ...initial, extra: undefined }, { ...initial, items: [initial.items[0], initial.items[0]] },
    { text: 'Milk', items: [{ title: 'Milk', operationId: '' }] }, { ...initial, items: Array(1) }];
  for (const next of invalid) assert.throws(() => drafts.create({ ...create, value: next }));
  assert.deepEqual(await drafts.list('p'), []);
  await drafts.create({ ...create, value: { text: '', items: [] } });
  await assert.rejects(drafts.accept(target), { code: 'JOURNAL_DRAFT_EMPTY' });
  assert.throws(() => drafts.update({ ...target, expectedVersion: Number.MAX_SAFE_INTEGER, value: initial }), { code: 'JOURNAL_DRAFT_VERSION_INVALID' });
});
