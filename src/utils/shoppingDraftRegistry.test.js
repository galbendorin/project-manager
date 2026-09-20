import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { createShoppingDraftRegistry } from './shoppingDraftRegistry.js';

const identities = new Map();
const itemId = label => {
  if (!identities.has(label)) identities.set(label, `00000000-0000-4000-8000-${String(identities.size + 1).padStart(12, '0')}`);
  return identities.get(label);
};
const value = (text, operationId = 'milk-id') => ({ text, items: [{ title: text, operationId: itemId(operationId),
  quantityValue: 2, quantityUnit: 'carton', meta: { note: 'keep' } }] });
const timeout = () => Object.assign(new Error('Lost confirmation'), { code: 'JOURNAL_STORAGE_TIMEOUT' });
const tick = () => new Promise(setImmediate);
const gate = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function fixture(t, { wrap = repo => repo, ...options } = {}) {
  let owner = 'a', sequence = 0;
  const journal = createShoppingCreateJournal({ userId: 'a', getCurrentUserId: () => owner,
    indexedDB: new IDBFactory(), includeDrafts: true });
  const repository = wrap(journal.drafts);
  const registry = createShoppingDraftRegistry({ repository, userId: 'a', getCurrentUserId: () => owner,
    createId: () => `draft-${++sequence}`, ...options });
  t.after(() => { registry.close(); journal.close(); });
  return { registry, journal, setOwner: next => { owner = next; },
    attach: (props = {}) => registry.attach({ userId: 'a', projectId: 'p', ...props }) };
}

test('failed create with newer RAM survives list switching and replays the original request first', async t => {
  const writes = []; let lose = true;
  const f = fixture(t, { wrap: repo => ({ ...repo, create: async request => {
    writes.push(structuredClone(request)); const saved = await repo.create(request);
    if (lose) { lose = false; throw timeout(); } return saved;
  } }) });
  const a = f.attach(); a.edit(value('Milk')); await assert.rejects(a.flush());
  // Edit coalesces into RAM. Detach before the new microtask drains it.
  a.edit(value('Oat milk')); const id = a.snapshot().draftId; a.detach();
  const b = f.attach({ projectId: 'other' }); b.edit(value('Bread', 'bread-id')); await b.flush();
  const back = f.attach(); await back.flush();
  assert.equal(back.snapshot().draftId, id); assert.equal(back.snapshot().value.text, 'Oat milk');
  assert.deepEqual(writes[1], writes[0]); assert.equal(back.snapshot().recordVersion, 2);
  assert.equal(b.snapshot().value.text, 'Bread');
  assert.throws(() => a.edit(value('Old callback')), { code: 'JOURNAL_DRAFT_DETACHED' });
});

test('unsaved RAM remains selectable when every device write fails', async t => {
  let fail = true;
  const f = fixture(t, { wrap: repo => ({ ...repo, create: request => {
    if (fail) throw timeout(); return repo.create(request);
  } }) });
  const a = f.attach(); a.edit(value('Milk')); await assert.rejects(a.flush());
  const firstId = a.snapshot().draftId; a.detach();
  assert.equal((await f.journal.drafts.list('p')).length, 0);
  const secondId = f.registry.startNew('p'); const b = f.attach();
  assert.equal(b.snapshot().draftId, secondId); assert.notEqual(secondId, firstId);
  b.edit(value('Bread', 'bread-id')); await assert.rejects(b.flush()); b.detach();
  assert.deepEqual(f.registry.list('p').map(draft => draft.value.text), ['Milk', 'Bread']);
  const restored = f.attach({ draftId: firstId });
  assert.equal(restored.snapshot().value.text, 'Milk'); assert.equal(restored.snapshot().phase, 'save_failed');
  fail = false; await restored.retry(); assert.equal(restored.snapshot().saved, true);
  restored.detach(); assert.equal(f.attach().snapshot().draftId, firstId);
});

test('detaching during a held write lets the exact lineage finish and drains newer input', async t => {
  const held = gate(), entered = gate(); let calls = 0;
  const f = fixture(t, { wrap: repo => ({ ...repo, create: async request => {
    calls++; entered.resolve(); await held.promise; return repo.create(request);
  } }) });
  let notifications = 0;
  const a = f.attach({ onChange: () => notifications++ }); a.edit(value('M')); await entered.promise;
  a.edit(value('Milk')); a.detach(); const before = notifications;
  const b = f.attach(); assert.equal(b.snapshot().value.text, 'Milk'); held.resolve(); await b.flush();
  assert.equal(calls, 1); assert.equal(b.snapshot().saved, true); assert.equal(notifications, before);
  assert.equal((await f.journal.drafts.list('p'))[0].value.text, 'Milk');
});

test('uncertain acceptance stays locked across detach, another draft, and exact retry after compaction', async t => {
  const requests = []; let lose = true;
  const f = fixture(t, { wrap: repo => ({ ...repo, accept: async request => {
    requests.push(structuredClone(request)); const batch = await repo.accept(request);
    if (lose) { lose = false; throw timeout(); } return batch;
  } }) });
  const a = f.attach(); a.edit(value('Milk')); assert.equal((await a.submit()).status, 'acceptance_unknown');
  const frozen = a.snapshot().submission, id = a.snapshot().draftId; a.detach();
  f.registry.startNew('p'); const b = f.attach(); b.edit(value('Bread', 'bread-id')); await b.flush(); b.detach();
  await f.journal.drafts.compactAccepted({ projectId: 'p', draftId: id, expectedVersion: frozen.expectedVersion + 1 });
  const back = f.attach({ draftId: id });
  assert.equal(back.snapshot().phase, 'acceptance_unknown'); assert.equal(back.snapshot().canEdit, false);
  assert.deepEqual(back.snapshot().submission, frozen);
  assert.throws(() => back.edit(value('Milk', 'new-id')), { code: 'JOURNAL_DRAFT_NOT_EDITABLE' });
  assert.equal((await back.retry()).status, 'accepted'); assert.deepEqual(requests[0], requests[1]);
  assert.equal((await f.journal.drafts.listAccepted('p')).length, 1);
});

test('navigation while acceptance is in flight retains its result without detached callbacks', async t => {
  const held = gate(), entered = gate(); let accepts = 0, changes = 0;
  const f = fixture(t, { wrap: repo => ({ ...repo, accept: async request => {
    accepts++; const batch = await repo.accept(request); entered.resolve(); await held.promise; return batch;
  } }) });
  const a = f.attach({ onChange: () => changes++ }); a.edit(value('Milk')); const sending = a.submit();
  await entered.promise; a.detach(); const before = changes;
  const b = f.attach(); assert.equal(b.snapshot().canEdit, false);
  const same = b.submit(); assert.equal(same, sending); held.resolve();
  assert.equal((await same).status, 'accepted'); assert.equal(changes, before); assert.equal(accepts, 1);
  assert.equal(b.snapshot().phase, 'accepted');
});

test('capacity releases detached accepted RAM while preserving immutable replay evidence', async t => {
  const f = fixture(t, { maxSessions: 2 });
  const first = f.attach(); first.edit(value('Milk')); await first.submit();
  const acceptedId = first.snapshot().draftId; first.detach();
  f.registry.startNew('p'); const second = f.attach(); second.edit(value('Bread', 'bread-cap')); await second.flush();
  const unsentId = second.snapshot().draftId; second.detach();
  const thirdId = f.registry.startNew('p');
  assert.deepEqual(f.registry.list('p').map(draft => draft.draftId), [unsentId, thirdId]);
  assert.equal((await f.journal.drafts.listAccepted('p'))[0].draftId, acceptedId);
  assert.equal((await f.journal.drafts.read('p', unsentId)).value.text, 'Bread');
  assert.throws(() => f.registry.startNew('p'), { code: 'JOURNAL_DRAFT_LIMIT' });
});

test('capacity never evicts an uncertain accepted submission or its frozen identity', async t => {
  const f = fixture(t, { maxSessions: 1, wrap: repo => ({ ...repo, accept: async request => {
    await repo.accept(request); throw timeout();
  } }) });
  const first = f.attach(); first.edit(value('Milk'));
  assert.equal((await first.submit()).status, 'acceptance_unknown');
  const frozen = first.snapshot().submission; first.detach();
  assert.throws(() => f.registry.startNew('p'), { code: 'JOURNAL_DRAFT_LIMIT' });
  assert.deepEqual(f.attach().snapshot().submission, frozen);
});

test('default and explicit selection share one session and separately detached observers', async t => {
  const f = fixture(t); let calls = 0;
  const observer = snapshot => { calls++; snapshot.value.text = 'mutated'; };
  const a = f.attach({ onChange: observer }); const id = a.snapshot().draftId;
  const b = f.attach({ draftId: id, onChange: observer }); a.detach();
  b.edit(value('Milk')); await b.flush();
  assert.ok(calls > 0); assert.equal(b.snapshot().value.text, 'Milk');
  assert.equal(f.registry.list('p').length, 1); assert.equal((await f.journal.drafts.list('p')).length, 1);
  const snapshot = f.registry.list('p')[0]; snapshot.value.items[0].meta.note = 'changed';
  assert.equal(b.snapshot().value.items[0].meta.note, 'keep');
});

test('failed recovery is retained on reattachment and only Retry reads storage again', async t => {
  let reads = 0;
  const f = fixture(t, { wrap: repo => ({ ...repo, read: (...args) => {
    reads++; if (reads === 1) throw timeout(); return repo.read(...args);
  } }) });
  await f.journal.drafts.create({ projectId: 'p', draftId: 'saved', value: value('Milk') });
  const a = f.attach({ draftId: 'saved' }); await tick(); a.detach();
  const b = f.attach({ draftId: 'saved' }); assert.equal(reads, 1); assert.equal(b.snapshot().phase, 'recovery_failed');
  await b.retry(); assert.equal(reads, 2); assert.equal(b.snapshot().value.text, 'Milk');
});

test('capacity rejects new drafts without evicting failed or uncertain lineages', async t => {
  const f = fixture(t, { maxSessions: 1, wrap: repo => ({ ...repo, create: () => { throw timeout(); } }) });
  const a = f.attach(); a.edit(value('Milk')); await assert.rejects(a.flush()); const id = a.snapshot().draftId; a.detach();
  assert.throws(() => f.registry.startNew('p'), { code: 'JOURNAL_DRAFT_LIMIT' });
  assert.throws(() => f.attach({ projectId: 'other' }), { code: 'JOURNAL_DRAFT_LIMIT' });
  assert.equal(f.attach().snapshot().draftId, id); assert.equal(f.registry.list('p')[0].value.text, 'Milk');
});

for (const transition of ['explicit close', 'observed owner change']) {
  test(`${transition} wipes and permanently fences leases even if the same account returns`, async t => {
    const snapshots = []; const f = fixture(t);
    const a = f.attach({ onChange: snapshot => snapshots.push(snapshot) }); a.edit(value('Private grocery')); await a.flush();
    if (transition === 'explicit close') f.registry.close();
    else { f.setOwner('b'); assert.throws(() => a.snapshot(), { code: 'JOURNAL_OWNER_CHANGED' }); }
    assert.equal(snapshots.at(-1).phase, 'closed'); assert.equal(snapshots.at(-1).value.text, '');
    f.setOwner('a');
    assert.throws(() => a.retry(), { code: 'JOURNAL_OWNER_CHANGED' });
    assert.throws(() => f.attach(), { code: 'JOURNAL_OWNER_CHANGED' });
    assert.throws(() => f.registry.list('p'), { code: 'JOURNAL_OWNER_CHANGED' });
    f.registry.close(); // Idempotent auth cleanup.
  });
}

test('closing while acceptance completes fences the old owner result and clears observers', async t => {
  const entered = gate(), held = gate(), snapshots = [];
  const f = fixture(t, { wrap: repo => ({ ...repo, accept: async request => {
    const batch = await repo.accept(request); entered.resolve(); await held.promise; return batch;
  } }) });
  const a = f.attach({ onChange: snapshot => snapshots.push(snapshot) }); a.edit(value('Milk')); const sending = a.submit();
  const rejection = assert.rejects(sending, { code: 'JOURNAL_OWNER_CHANGED' }); await entered.promise;
  f.registry.close(); const before = snapshots.length; held.resolve(); await rejection;
  assert.equal(snapshots.length, before); assert.equal(snapshots.at(-1).value.text, '');
});

test('observer reentrancy can detach or close without exposing a stale snapshot to another observer', async t => {
  const f = fixture(t); let b, secondPrivate = 0;
  const a = f.attach({ onChange: snapshot => {
    if (snapshot.value.text) { b.detach(); f.registry.close(); }
    throw new Error('Observer failure');
  } });
  b = f.attach({ onChange: snapshot => { if (snapshot.value.text) secondPrivate++; } });
  a.edit(value('Milk')); await tick();
  assert.equal(secondPrivate, 0); assert.throws(() => a.snapshot(), { code: 'JOURNAL_OWNER_CHANGED' });
});

test('wrong owner and invalid/colliding new identities cannot replace the selected draft', t => {
  const f = fixture(t, { createId: () => 'same-id' }); const a = f.attach();
  assert.throws(() => f.attach({ userId: 'outsider' }), { code: 'JOURNAL_OWNER_CHANGED' });
  assert.throws(() => f.registry.startNew('p'), { code: 'JOURNAL_DRAFT_EXISTS' });
  assert.throws(() => f.attach({ projectId: '' }), { code: 'JOURNAL_ID_REQUIRED' });
  assert.equal(f.attach().snapshot().draftId, a.snapshot().draftId);
});

test('a nested edit cannot deliver an older snapshot after newer text to another attachment', async t => {
  const f = fixture(t); let a;
  a = f.attach({ onChange: snapshot => { if (snapshot.value.text === 'Milk') a.edit(value('Oat milk')); } });
  const seen = []; const b = f.attach({ onChange: snapshot => seen.push(snapshot.value.text) });
  a.edit(value('Milk')); await b.flush();
  assert.ok(seen.length > 0); assert.ok(seen.every(text => text === 'Oat milk'));
  assert.equal(b.snapshot().value.text, 'Oat milk'); assert.equal(b.snapshot().saved, true);
});
