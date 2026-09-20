import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { createShoppingDraftSession } from './shoppingDraftSession.js';

const identities = new Map();
const itemId = label => {
  if (!identities.has(label)) identities.set(label, `00000000-0000-4000-8000-${String(identities.size + 1).padStart(12, '0')}`);
  return identities.get(label);
};
const value = (title, operationId = 'milk-id') => ({ text: title, items: [{ title, operationId: itemId(operationId),
  quantityValue: 2, quantityUnit: 'carton', sourceType: 'meal', sourceBatchId: '11111111-1111-4111-8111-111111111111', meta: { note: 'keep' } }] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const timeout = () => Object.assign(new Error('Confirmation lost'), { code: 'JOURNAL_STORAGE_TIMEOUT' });
function fixture(t) {
  const indexedDB = new IDBFactory(), journals = [], sessions = [];
  let owner = 'a', sequence = 0;
  const make = ({ wrap = repo => repo, projectId = 'p', draftId = `draft-${++sequence}` } = {}) => {
    const journal = createShoppingCreateJournal({ userId: owner, getCurrentUserId: () => owner, indexedDB, includeDrafts: true });
    journals.push(journal); const snapshots = [];
    const session = createShoppingDraftSession({ repository: wrap(journal.drafts), userId: owner, projectId,
      getCurrentUserId: () => owner, createId: () => draftId, onChange: state => snapshots.push(state) });
    sessions.push(session); return { session, journal, snapshots };
  };
  t.after(() => { sessions.forEach(session => session.close()); journals.forEach(journal => journal.close()); });
  return { make, setOwner: next => { owner = next; } };
}

test('delayed first save coalesces later keystrokes without changing its original payload', async t => {
  const gate = deferred(), entered = deferred(), writes = [];
  const f = fixture(t).make({ wrap: repo => ({ ...repo, create: async request => {
    writes.push(structuredClone(request)); entered.resolve(); await gate.promise; return repo.create(request);
  }, update: request => { writes.push(structuredClone(request)); return repo.update(request); } }) });
  await f.session.recover(); f.session.edit(value('M')); await entered.promise;
  for (let n = 0; n < 100; n++) f.session.edit(value(`Milk ${n}`));
  assert.equal(f.session.snapshot().saved, false); assert.equal(writes.length, 1);
  gate.resolve(); await f.session.flush();
  assert.equal(writes.length, 2); assert.equal(writes[0].value.text, 'M'); assert.equal(writes[1].value.text, 'Milk 99');
  assert.equal(f.session.snapshot().saved, true);
  assert.equal((await f.journal.drafts.list('p')).length, 1);
});

test('committed create timeout retries old request before saving newer RAM input', async t => {
  const gate = deferred(), entered = deferred(), writes = [];
  let first = true;
  const f = fixture(t).make({ wrap: repo => ({ ...repo, create: async request => {
    writes.push(structuredClone(request)); const record = await repo.create(request);
    if (first) { first = false; entered.resolve(); await gate.promise; throw timeout(); }
    return record;
  } }) });
  await f.session.recover(); f.session.edit(value('Milk')); await entered.promise;
  f.session.edit(value('Oat milk'));
  const saving = assert.rejects(f.session.flush(), { code: 'JOURNAL_STORAGE_TIMEOUT' }); gate.resolve(); await saving;
  assert.equal(f.session.snapshot().value.text, 'Oat milk'); assert.equal(f.session.snapshot().phase, 'save_failed');
  await f.session.retry(); assert.deepEqual(writes[1], writes[0]);
  assert.equal(f.session.snapshot().saved, true);
  const stored = (await f.journal.drafts.list('p'))[0];
  assert.equal(stored.recordVersion, 2); assert.equal(stored.value.text, 'Oat milk');
});

test('committed update timeout replays exact version and then latest text', async t => {
  let first = true; const writes = [];
  const f = fixture(t).make({ wrap: repo => ({ ...repo, update: async request => {
    writes.push(structuredClone(request)); const saved = await repo.update(request);
    if (first) { first = false; throw timeout(); } return saved;
  } }) });
  await f.session.recover(); f.session.edit(value('Milk')); await f.session.flush();
  f.session.edit(value('Oat milk')); await assert.rejects(f.session.flush());
  f.session.edit(value('Almond milk')); await f.session.flush();
  assert.deepEqual(writes[0], writes[1]); assert.equal(writes[2].expectedVersion, 2);
  assert.equal(f.session.snapshot().value.text, 'Almond milk'); assert.equal(f.session.snapshot().recordVersion, 3);
});

test('submit freezes the clicked revision and waits for its last save', async t => {
  const gate = deferred(), entered = deferred(); let accepts = 0;
  const f = fixture(t).make({ wrap: repo => ({ ...repo, create: async request => {
    entered.resolve(); await gate.promise; return repo.create(request);
  }, accept: request => { accepts++; return repo.accept(request); } }) });
  await f.session.recover(); f.session.edit(value('Milk')); await entered.promise;
  f.session.edit(value('Oat milk'));
  const sending = f.session.submit(); assert.equal(f.session.submit(), sending);
  assert.throws(() => f.session.edit(value('Bread', 'bread-id')), { code: 'JOURNAL_DRAFT_NOT_EDITABLE' });
  assert.equal(accepts, 0); gate.resolve();
  const result = await sending;
  assert.equal(result.status, 'accepted'); assert.deepEqual(result.batch.value, value('Oat milk')); assert.equal(accepts, 1);
});

for (const compact of [false, true]) {
  test(`committed acceptance timeout remains locked and exact retry succeeds${compact ? ' after compaction' : ''}`, async t => {
    let first = true; const requests = [];
    const f = fixture(t).make({ wrap: repo => ({ ...repo, accept: async request => {
      requests.push(structuredClone(request)); const batch = await repo.accept(request);
      if (first) { first = false; throw timeout(); } return batch;
    } }) });
    await f.session.recover(); f.session.edit(value('Milk')); await f.session.flush();
    const result = await f.session.submit();
    assert.equal(result.status, 'acceptance_unknown'); assert.equal(f.session.snapshot().canEdit, false);
    assert.equal(Object.hasOwn(result, 'failedItems'), false);
    assert.throws(() => f.session.edit(value('Milk', 'fresh-id')), { code: 'JOURNAL_DRAFT_NOT_EDITABLE' });
    if (compact) await f.journal.drafts.compactAccepted({ projectId: 'p', draftId: f.session.snapshot().draftId, expectedVersion: 2 });
    const retry = await f.session.retry(); assert.equal(retry.status, 'accepted'); assert.deepEqual(requests[1], requests[0]);
    assert.deepEqual(retry.batch.value, value('Milk')); assert.equal((await f.journal.drafts.listAccepted('p')).length, 1);
  });
}

test('repeated unresolved acceptance never unlocks or submits fresh identities', async t => {
  let calls = 0;
  const f = fixture(t).make({ wrap: repo => ({ ...repo, accept: async request => { calls++; await repo.accept(request); throw timeout(); } }) });
  await f.session.recover(); f.session.edit(value('Milk')); await f.session.flush();
  await f.session.submit(); const original = f.session.snapshot().submission;
  for (let n = 0; n < 3; n++) assert.equal((await f.session.retry()).status, 'acceptance_unknown');
  assert.equal(calls, 4); assert.deepEqual(f.session.snapshot().submission, original); assert.equal(f.session.snapshot().canEdit, false);
});

test('save failure before acceptance is not submitted and retains the editable draft', async t => {
  let accepts = 0;
  const f = fixture(t).make({ wrap: repo => ({ ...repo, create: () => { throw timeout(); },
    accept: () => { accepts++; } }) });
  await f.session.recover(); f.session.edit(value('Milk'));
  const result = await f.session.submit();
  assert.equal(result.status, 'not_submitted'); assert.equal(accepts, 0);
  assert.equal(f.session.snapshot().canEdit, true); assert.equal(f.session.snapshot().value.text, 'Milk');
  await assert.rejects(f.session.retry(), { code: 'JOURNAL_STORAGE_TIMEOUT' });
});

test('reopen after lost acceptance recovers compacted batch without a session pointer or new IDs', async t => {
  const f = fixture(t), first = f.make();
  await first.session.recover(); first.session.edit(value('Milk')); const result = await first.session.submit();
  const id = first.session.snapshot().draftId;
  await first.journal.drafts.compactAccepted({ projectId: 'p', draftId: id, expectedVersion: 2 }); first.session.close();
  const reopened = f.make(); await reopened.session.recover(id);
  assert.equal(reopened.session.snapshot().phase, 'accepted');
  assert.equal(reopened.session.snapshot().saved, true);
  assert.deepEqual((await reopened.session.submit()).batch, result.batch);
  assert.throws(() => reopened.session.edit(value('Milk', 'other-id')), { code: 'JOURNAL_DRAFT_NOT_EDITABLE' });
});

test('conflicting tab save preserves RAM input and cannot rebase or fork automatically', async t => {
  const f = fixture(t), a = f.make(), b = f.make();
  await a.session.recover(); a.session.edit(value('Milk')); await a.session.flush();
  await b.session.recover(a.session.snapshot().draftId);
  a.session.edit(value('Oat milk')); await a.session.flush();
  b.session.edit(value('Almond milk')); await assert.rejects(b.session.flush(), { code: 'JOURNAL_DRAFT_CONFLICT' });
  assert.equal(b.session.snapshot().phase, 'conflict'); assert.equal(b.session.snapshot().value.text, 'Almond milk');
  assert.equal((await b.session.submit()).status, 'conflict'); assert.equal((await a.journal.drafts.list('p')).length, 1);
});

test('acceptance conflict preserves frozen snapshot when another tab changes the draft', async t => {
  const gate = deferred(), entered = deferred(); const f = fixture(t);
  const a = f.make({ wrap: repo => ({ ...repo, accept: async request => { entered.resolve(); await gate.promise; return repo.accept(request); } }) });
  await a.session.recover(); a.session.edit(value('Milk')); await a.session.flush();
  const sending = a.session.submit(); await entered.promise;
  const b = f.make(); await b.session.recover(a.session.snapshot().draftId); b.session.edit(value('Oat milk')); await b.session.flush();
  gate.resolve(); assert.equal((await sending).status, 'conflict');
  assert.equal(a.session.snapshot().submission.value.text, 'Milk'); assert.equal(a.session.snapshot().canEdit, false);
});

for (const transition of ['close', 'owner']) {
  test(`${transition} fences late acceptance while an independent draft stays intact`, async t => {
    const gate = deferred(), entered = deferred(); const f = fixture(t);
    const a = f.make({ wrap: repo => ({ ...repo, accept: async request => {
      const batch = await repo.accept(request); entered.resolve(); await gate.promise; return batch;
    } }) });
    await a.session.recover(); a.session.edit(value('Milk')); await a.session.flush();
    const sending = a.session.submit(); const rejection = assert.rejects(sending, { code: 'JOURNAL_OWNER_CHANGED' });
    await entered.promise;
    if (transition === 'close') a.session.close(); else f.setOwner('b');
    const b = f.make({ projectId: 'other' }); await b.session.recover(); b.session.edit(value('Bread', 'bread-id')); await b.session.flush();
    const count = a.snapshots.length; gate.resolve(); await rejection;
    assert.equal(a.snapshots.length, count); assert.equal(a.session.snapshot().phase, 'closed');
    assert.equal(b.session.snapshot().value.text, 'Bread'); assert.equal(b.session.snapshot().saved, true);
  });
}

test('caller mutation and invalid rich values cannot change the frozen retry payload', async t => {
  const f = fixture(t).make(); await f.session.recover(); const original = value('Milk');
  f.session.edit(original); original.items[0].meta.note = 'changed'; await f.session.flush();
  const read = f.session.snapshot(); read.value.items[0].quantityValue = 99;
  assert.equal((await f.session.submit()).batch.value.items[0].meta.note, 'keep');
  const other = fixture(t).make(); await other.session.recover();
  assert.throws(() => other.session.edit({ text: 'Milk', items: [{ ...value('Milk').items[0], meta: new Date() }] }), { code: 'JOURNAL_JSON_REQUIRED' });
  assert.equal(other.session.snapshot().value.text, '');
});

test('failed recovery retries the selected identity, including an accepted compacted head', async t => {
  const f = fixture(t), a = f.make();
  await a.session.recover(); a.session.edit(value('Milk')); await a.session.submit(); const id = a.session.snapshot().draftId;
  await a.journal.drafts.compactAccepted({ projectId: 'p', draftId: id, expectedVersion: 2 });
  let first = true;
  const b = f.make({ wrap: repo => ({ ...repo, accept: (...args) => {
    if (first) { first = false; throw timeout(); } return repo.accept(...args);
  } }) });
  await assert.rejects(b.session.recover(id), { code: 'JOURNAL_STORAGE_TIMEOUT' });
  assert.equal(b.session.snapshot().phase, 'recovery_failed'); assert.equal(b.session.snapshot().canEdit, false);
  await b.session.retry(); assert.equal(b.session.snapshot().phase, 'accepted'); assert.equal(b.session.snapshot().draftId, id);
  assert.equal((await b.journal.drafts.listAccepted('p')).length, 1);
});

test('observed account change closes the editor permanently even if the account returns', async t => {
  const f = fixture(t), a = f.make(); await a.session.recover();
  f.setOwner('b'); assert.equal(a.session.snapshot().phase, 'closed');
  f.setOwner('a'); assert.throws(() => a.session.edit(value('Milk')), { code: 'JOURNAL_OWNER_CHANGED' });
});

test('failed recovery cannot create over the selected draft or bypass the single-open boundary', async t => {
  let reads = 0, creates = 0;
  const f = fixture(t).make({ wrap: repo => ({ ...repo, read: () => { reads++; throw timeout(); },
    create: request => { creates++; return repo.create(request); } }) });
  await assert.rejects(f.session.recover('existing'));
  await assert.rejects(f.session.flush(), { code: 'JOURNAL_DRAFT_NOT_EDITABLE' });
  await assert.rejects(f.session.recover('fresh', true), { code: 'JOURNAL_DRAFT_ALREADY_OPEN' });
  assert.equal((await f.session.submit()).status, 'conflict'); assert.equal(creates, 0);
  await assert.rejects(f.session.retry()); assert.equal(reads, 2); assert.equal(f.session.snapshot().draftId, 'existing');
});

test('reentrant submission observer shares the same acceptance flight', async t => {
  const indexedDB = new IDBFactory();
  const journal = createShoppingCreateJournal({ userId: 'a', getCurrentUserId: () => 'a', indexedDB, includeDrafts: true });
  let session, duplicate, accepts = 0;
  session = createShoppingDraftSession({ repository: { ...journal.drafts, accept: request => { accepts++; return journal.drafts.accept(request); } },
    userId: 'a', projectId: 'p', getCurrentUserId: () => 'a', createId: () => 'd',
    onChange: state => { if (state.phase === 'submitting' && !duplicate) duplicate = session.submit(); } });
  t.after(() => { session.close(); journal.close(); });
  await session.recover(); session.edit(value('Milk')); await session.flush();
  const original = session.submit(); await original;
  assert.equal(duplicate, original); assert.equal(accepts, 1);
});

test('a saved observer can edit and submit newer input without accepting the preceding record', async t => {
  const indexedDB = new IDBFactory();
  const journal = createShoppingCreateJournal({ userId: 'a', getCurrentUserId: () => 'a', indexedDB, includeDrafts: true });
  let session, sending, changed = false;
  session = createShoppingDraftSession({ repository: journal.drafts, userId: 'a', projectId: 'p', getCurrentUserId: () => 'a',
    createId: () => 'd', onChange: state => {
      if (state.phase === 'editing' && state.saved && !changed) {
        changed = true; session.edit(value('Bread', 'bread-id')); sending = session.submit();
      }
    } });
  t.after(() => { session.close(); journal.close(); });
  await session.recover(); session.edit(value('Milk')); await session.flush();
  const result = await sending;
  assert.equal(result.status, 'accepted'); assert.deepEqual(result.batch.value, value('Bread', 'bread-id'));
  assert.equal((await journal.drafts.listAccepted('p')).length, 1);
});

test('an edit between drain resolution and completion starts another save before submission', async t => {
  const indexedDB = new IDBFactory();
  const journal = createShoppingCreateJournal({ userId: 'a', getCurrentUserId: () => 'a', indexedDB, includeDrafts: true });
  let session, sending;
  session = createShoppingDraftSession({ repository: { ...journal.drafts, create: async request => {
    const saved = await journal.drafts.create(request);
    queueMicrotask(() => queueMicrotask(() => { session.edit(value('Bread', 'bread-id')); sending = session.submit(); }));
    return saved;
  } }, userId: 'a', projectId: 'p', getCurrentUserId: () => 'a', createId: () => 'd' });
  t.after(() => { session.close(); journal.close(); });
  await session.recover(); session.edit(value('Milk')); await session.flush();
  const result = await sending;
  assert.equal(result.status, 'accepted'); assert.deepEqual(result.batch.value, value('Bread', 'bread-id'));
});
