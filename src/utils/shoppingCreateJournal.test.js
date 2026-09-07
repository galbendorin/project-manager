import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, forceCloseDatabase } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';

const draft = { title: 'Milk', quantityValue: 1, quantityUnit: 'carton', status: 'Open', cancel: false };
const entry = { operationId: 'operation-a', projectId: 'project-a', localId: 'offline-a', desired: draft };
const submission = { title: 'Milk', quantityValue: 1, quantityUnit: 'carton', meta: { from: 'manual' } };
const code = expected => error => error?.code === expected;
const tick = () => new Promise(setImmediate);

function setup(t, options = {}) {
  const indexedDB = new IDBFactory();
  let activeUser = 'user-a';
  const journals = [];
  const make = (userId = 'user-a', extra = {}) => {
    const journal = createShoppingCreateJournal({ indexedDB, userId, getCurrentUserId: () => activeUser, ...options, ...extra });
    journals.push(journal);
    return journal;
  };
  t.after(() => journals.forEach(journal => journal.close()));
  return { indexedDB, make, switchUser: userId => { activeUser = userId; } };
}

// Fault injection wraps real emulator requests/transactions; it does not fake
// commit ordering, abort rollback or serialization between connections.
function intercept(indexedDB, onTransaction) {
  return {
    open(...args) {
      const request = indexedDB.open(...args);
      request.addEventListener('success', () => {
        const db = request.result;
        const original = db.transaction.bind(db);
        db.transaction = (...transactionArgs) => {
          const tx = original(...transactionArgs);
          onTransaction(tx, transactionArgs);
          return tx;
        };
      });
      return request;
    },
  };
}

test('submission is readable through a new connection before network delivery starts', async t => {
  const { make } = setup(t);
  const journal = make();
  const created = await journal.create(entry);
  let calls = 0;
  const result = await journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: async saved => {
      calls++;
      assert.deepEqual((await make().read(entry.operationId)).submission, saved.submission);
      return 'sent';
    } });
  assert.equal(result, 'sent');
  assert.equal(calls, 1);
});

test('request success followed by transaction abort never authorizes sending', async t => {
  const fixture = setup(t);
  let abortWrites = false;
  const wrapped = intercept(fixture.indexedDB, tx => {
    const original = tx.objectStore.bind(tx);
    tx.objectStore = name => {
      const store = original(name);
      const put = store.put.bind(store);
      store.put = value => {
        const request = put(value);
        request.addEventListener('success', () => { if (abortWrites) tx.abort(); });
        return request;
      };
      return store;
    };
  });
  const journal = fixture.make('user-a', { indexedDB: wrapped });
  const created = await journal.create(entry);
  abortWrites = true;
  let calls = 0;
  await assert.rejects(journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: () => { calls++; } }), code('JOURNAL_STORAGE_ABORTED'));
  assert.equal(calls, 0);
  assert.equal((await fixture.make().read(entry.operationId)).submission, null);
});

test('simulated quota failure preserves the previous draft and never sends', async t => {
  const fixture = setup(t);
  let fail = false;
  const wrapped = intercept(fixture.indexedDB, tx => {
    const original = tx.objectStore.bind(tx);
    tx.objectStore = name => {
      const store = original(name);
      const put = store.put.bind(store);
      store.put = value => {
        if (fail) throw new DOMException('Quota exhausted', 'QuotaExceededError');
        return put(value);
      };
      return store;
    };
  });
  const journal = fixture.make('user-a', { indexedDB: wrapped });
  const created = await journal.create(entry);
  fail = true;
  let calls = 0;
  await assert.rejects(journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: () => { calls++; } }), { name: 'QuotaExceededError' });
  assert.equal(calls, 0);
  assert.deepEqual((await fixture.make().read(entry.operationId)).desired, draft);
});

test('overlapping writers from separate connections reject the stale version', async t => {
  const { make } = setup(t);
  const a = make();
  const b = make();
  const created = await a.create(entry);
  const results = await Promise.allSettled([
    a.setDesired(entry.operationId, created.recordVersion, { ...draft, title: 'Bread' }),
    b.setDesired(entry.operationId, created.recordVersion, { ...draft, title: 'Apples' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'JOURNAL_VERSION_CONFLICT');
  const latest = await b.read(entry.operationId);
  assert.equal(latest.recordVersion, 2);
  assert.equal(latest.desired.title, results.find(result => result.status === 'fulfilled').value.desired.title);
});

test('a stale submission cannot overtake a newer local edit', async t => {
  const { make } = setup(t);
  const journal = make();
  const created = await journal.create(entry);
  await journal.setDesired(entry.operationId, created.recordVersion, { ...draft, title: 'Oat milk' });
  let calls = 0;
  await assert.rejects(journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: () => { calls++; } }), code('JOURNAL_VERSION_CONFLICT'));
  assert.equal(calls, 0);
  assert.equal((await journal.read(entry.operationId)).submission, null);
});

test('lost response survives reopening and retries the exact immutable submission', async t => {
  const { make } = setup(t);
  const journal = make();
  const created = await journal.create(entry);
  await assert.rejects(journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: () => { throw new Error('Response lost'); } }), /Response lost/);
  journal.close();
  const reopened = make();
  const saved = await reopened.read(entry.operationId);
  await reopened.submit({ operationId: entry.operationId, expectedVersion: saved.recordVersion, submission: saved.submission,
    send: record => assert.deepEqual(record.submission, submission) });
});

test('editing or cancelling desired intent never changes submitted evidence', async t => {
  const { make } = setup(t);
  const journal = make();
  const created = await journal.create(entry);
  const submitted = await journal.freezeSubmission(entry.operationId, created.recordVersion, submission);
  const changed = await journal.setDesired(entry.operationId, submitted.recordVersion, { ...draft, title: 'Bread' });
  const cancelled = await journal.setDesired(entry.operationId, changed.recordVersion, { ...changed.desired, cancel: true });
  assert.deepEqual(cancelled.submission, submission);
  assert.equal((await make().read(entry.operationId)).desired.cancel, true);
  await assert.rejects(journal.freezeSubmission(entry.operationId, cancelled.recordVersion, { ...submission, title: 'Bread' }), code('JOURNAL_SUBMISSION_IMMUTABLE'));
});

test('submission comparison accepts reordered JSON properties', async t => {
  const { make } = setup(t);
  const journal = make();
  const created = await journal.create(entry);
  const first = await journal.freezeSubmission(entry.operationId, created.recordVersion, { title: 'Milk', meta: { a: 1, b: 2 } });
  const second = await journal.freezeSubmission(entry.operationId, first.recordVersion, { meta: { b: 2, a: 1 }, title: 'Milk' });
  assert.deepEqual(second.submission, first.submission);
});

test('input and returned object mutation cannot rewrite persisted evidence', async t => {
  const { make } = setup(t);
  const journal = make();
  const desired = { ...draft };
  const pending = journal.create({ ...entry, desired });
  desired.title = 'Changed while opening';
  const created = await pending;
  created.desired.title = 'Changed returned value';
  assert.equal((await journal.read(entry.operationId)).desired.title, 'Milk');
});

test('identity conflicts and duplicate local rows are refused', async t => {
  const { make } = setup(t);
  const journal = make();
  await journal.create(entry);
  assert.equal((await journal.create(entry)).recordVersion, 1);
  await assert.rejects(journal.create({ ...entry, projectId: 'wrong-project' }), code('JOURNAL_OPERATION_EXISTS'));
  await assert.rejects(journal.create({ ...entry, operationId: 'other-operation' }));
  assert.equal((await journal.list()).length, 1);
});

test('owners cannot read each other’s records, even with the same operation ID', async t => {
  const { make, switchUser } = setup(t);
  const a = make();
  await a.create(entry);
  switchUser('user-b');
  await assert.rejects(a.read(entry.operationId), code('JOURNAL_OWNER_CHANGED'));
  const b = make('user-b');
  assert.equal(await b.read(entry.operationId), null);
  assert.deepEqual(await b.list(), []);
  await b.create({ ...entry, desired: { ...draft, title: 'User B item' } });
  switchUser('user-a');
  assert.equal((await a.read(entry.operationId)).desired.title, 'Milk');
});

test('closing permanently fences a journal even if the same user signs back in', async t => {
  const { make, switchUser } = setup(t);
  const journal = make();
  await journal.create(entry);
  journal.close();
  switchUser('user-b');
  switchUser('user-a');
  await assert.rejects(journal.read(entry.operationId), code('JOURNAL_OWNER_CHANGED'));
  assert.ok(await make().read(entry.operationId));
});

test('owner change after write success prevents a network request', async t => {
  const fixture = setup(t);
  let switchAfterWrite = false;
  const wrapped = intercept(fixture.indexedDB, tx => {
    const original = tx.objectStore.bind(tx);
    tx.objectStore = name => {
      const store = original(name);
      const put = store.put.bind(store);
      store.put = value => {
        const request = put(value);
        request.addEventListener('success', () => { if (switchAfterWrite) fixture.switchUser('user-b'); });
        return request;
      };
      return store;
    };
  });
  const journal = fixture.make('user-a', { indexedDB: wrapped });
  const created = await journal.create(entry);
  switchAfterWrite = true;
  let calls = 0;
  await assert.rejects(journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: () => { calls++; } }), code('JOURNAL_OWNER_CHANGED'));
  assert.equal(calls, 0);
});

test('unavailable or denied storage does not fall back to an unconfirmed write', async t => {
  const fixture = setup(t);
  await assert.rejects(fixture.make('user-a', { indexedDB: null }).create(entry), code('JOURNAL_STORAGE_UNAVAILABLE'));
  const denied = { open: () => { throw new DOMException('Denied', 'SecurityError'); } };
  await assert.rejects(fixture.make('user-a', { indexedDB: denied }).create(entry), code('JOURNAL_STORAGE_UNAVAILABLE'));
});

test('owner change on transaction completion keeps committed evidence but prevents sending', async t => {
  const fixture = setup(t);
  let switchOnComplete = false;
  const wrapped = intercept(fixture.indexedDB, tx => {
    tx.addEventListener('complete', () => {
      if (switchOnComplete && tx.mode === 'readwrite') fixture.switchUser('user-b');
    });
  });
  const journal = fixture.make('user-a', { indexedDB: wrapped });
  const created = await journal.create(entry);
  switchOnComplete = true;
  let calls = 0;
  await assert.rejects(journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: () => { calls++; } }), code('JOURNAL_OWNER_CHANGED'));
  assert.equal(calls, 0);
  fixture.switchUser('user-a');
  assert.deepEqual((await fixture.make().read(entry.operationId)).submission, submission);
});

test('an opening timeout closes a late connection without starting a write', async t => {
  let request;
  let closes = 0;
  let writes = 0;
  const { make } = setup(t);
  const journal = make('user-a', { timeoutMs: 10, indexedDB: { open: () => (request = {}) } });
  await assert.rejects(journal.create(entry), code('JOURNAL_STORAGE_TIMEOUT'));
  request.result = { close: () => { closes++; }, transaction: () => { writes++; } };
  request.onsuccess();
  assert.equal(closes, 1);
  assert.equal(writes, 0);
});

test('closing during open rejects promptly and closes a late connection', async t => {
  let request;
  let closes = 0;
  const { make } = setup(t);
  const journal = make('user-a', { indexedDB: { open: () => (request = {}) } });
  const pending = journal.create(entry);
  const rejected = assert.rejects(pending, code('JOURNAL_OWNER_CHANGED'));
  journal.close();
  await rejected;
  request.result = { close: () => { closes++; } };
  request.onsuccess();
  assert.equal(closes, 1);
});

test('transaction timeout aborts a stalled write and prevents transmission', async t => {
  const fixture = setup(t);
  let stall = false;
  const wrapped = intercept(fixture.indexedDB, tx => {
    if (!stall || tx.mode !== 'readwrite') return;
    const original = tx.objectStore.bind(tx);
    const store = original('operations');
    let alive = true;
    tx.addEventListener('abort', () => { alive = false; });
    const keepAlive = () => {
      if (!alive) return;
      const read = store.get(['user-a', entry.operationId]);
      read.onsuccess = keepAlive;
    };
    keepAlive();
  });
  const journal = fixture.make('user-a', { indexedDB: wrapped, timeoutMs: 50 });
  const created = await journal.create(entry);
  stall = true;
  let calls = 0;
  await assert.rejects(journal.submit({ operationId: entry.operationId, expectedVersion: created.recordVersion, submission,
    send: () => { calls++; } }), code('JOURNAL_STORAGE_TIMEOUT'));
  assert.equal(calls, 0);
  assert.equal((await fixture.make().read(entry.operationId)).submission, null);
});

test('a forcibly closed idle database reopens without deleting pending work', async t => {
  const fixture = setup(t);
  let connection;
  const wrapped = { open: (...args) => {
    const request = fixture.indexedDB.open(...args);
    request.addEventListener('success', () => { connection = request.result; });
    return request;
  } };
  const journal = fixture.make('user-a', { indexedDB: wrapped });
  await journal.create(entry);
  forceCloseDatabase(connection);
  await tick();
  assert.equal((await journal.read(entry.operationId)).desired.title, 'Milk');
});

test('invalid JSON and missing owner guards are refused', () => {
  assert.throws(() => createShoppingCreateJournal({ userId: 'user-a' }), code('JOURNAL_OWNER_GUARD_REQUIRED'));
  const journal = createShoppingCreateJournal({ userId: 'user-a', getCurrentUserId: () => 'user-a', indexedDB: null });
  const circular = {}; circular.self = circular;
  for (const desired of [undefined, { value: NaN }, { value: undefined }, { value: 1n }, new Date(), circular, new Array(2)]) {
    assert.throws(() => journal.create({ ...entry, desired }), code('JOURNAL_JSON_REQUIRED'));
  }
  journal.close();
});
