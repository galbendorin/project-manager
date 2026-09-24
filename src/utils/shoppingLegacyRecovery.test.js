import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingLegacyRecovery } from './shoppingLegacyRecovery.js';
import { createShoppingInputBatches } from './shoppingInputBatches.js';
import { createShoppingCreateJournal } from './shoppingCreateJournal.js';
import { shoppingCreateInitialDesired } from './shoppingCreateOperation.js';
import { memoryStorage } from '../../scripts/investigations/shopping-input-test-fixture.mjs';

function fixture(t) {
  const userId = 'owner-a', projectId = 'home';
  const local = memoryStorage(), session = memoryStorage();
  let owner = userId;
  const getCurrentUserId = () => owner;
  const journal = createShoppingCreateJournal({ userId, getCurrentUserId, indexedDB: new IDBFactory(), includeDrafts: true });
  t.after(() => journal.close());
  const options = { userId, getCurrentUserId, journal, repository: journal.drafts, storage: () => local, sessionStorage: () => session };
  const batches = createShoppingInputBatches(options);
  const recovery = createShoppingLegacyRecovery(options);
  const item = { operationId: randomUUID(), title: 'Milk', quantityValue: 2, quantityUnit: 'carton',
    sourceType: 'meal_plan', sourceBatchId: randomUUID(), meta: { note: 'keep original details' } };
  const save = (items = [item], text = 'Milk') => {
    const draft = batches.newDraft(projectId, text, items); batches.persistDraft(draft); return draft;
  };
  const first = async () => (await recovery.scan(projectId)).candidates[0];
  return { userId, projectId, local, session, journal, options, batches, recovery, item, save, first,
    setOwner: value => { owner = value; } };
}

test('discovery preserves older versions, pointers, exact rich fields and owner/project isolation', async t => {
  const f = fixture(t), old = f.save();
  f.save([{ ...f.item, operationId: randomUUID(), title: 'Bread' }], 'Bread');
  f.local.setItem('pmworkspace:shopping-typed-draft:v2:someone-else:home:bad', '{');
  f.local.setItem('pmworkspace:shopping-typed-draft:v2:owner-a:other:bad', '{');
  const before = f.local.length;
  const result = await f.recovery.scan('home');
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].reference, 'This tab');
  const earlier = result.candidates.find(row => row.generation === old.generation);
  assert.equal(earlier.reference, 'Earlier version');
  assert.deepEqual(earlier.items, [f.item]);
  assert.equal(f.local.length, before);
});

test('structured recovery uses original atomic receipt and never creates an editable IDB copy', async t => {
  const f = fixture(t), original = f.save(), candidate = await f.first();
  assert.deepEqual(await f.recovery.acceptStructured('home', candidate), { status: 'accepted' });
  assert.deepEqual(f.batches.list()[0].items, original.items);
  assert.equal(f.batches.list()[0].id, original.generation);
  assert.equal((await f.journal.drafts.list('home')).length, 0);
  assert.equal(f.local.getItem(candidate.key), candidate.raw);
  assert.equal((await f.first()).status, 'accepted');
  assert.deepEqual(await f.recovery.acceptStructured('home', candidate), { status: 'already_accepted' });
});

test('old tab acceptance before or during review converges on the same receipt, including completed markers', async t => {
  const f = fixture(t), original = f.save(), candidate = await f.first();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const recovery = createShoppingLegacyRecovery({ ...f.options, journal: { list: async () => { await held; return []; } } });
  const pending = recovery.acceptStructured('home', candidate);
  const batch = f.batches.save('home', original.items, { draftGeneration: original.generation });
  f.batches.remove(batch); release();
  assert.equal((await pending).status, 'already_accepted');
  assert.equal((await f.first()).status, 'accepted');
  assert.equal(f.batches.list().length, 0);
});

test('unknown receipt write outcome retries without another receipt or operation identity', async t => {
  const f = fixture(t); f.save(); const candidate = await f.first();
  const set = f.local.setItem.bind(f.local);
  let lose = true;
  f.local.setItem = (key, value) => {
    set(key, value);
    if (lose && key.startsWith('pmworkspace:shopping-input-batch:')) { lose = false; throw new Error('confirmation lost'); }
  };
  await assert.rejects(f.recovery.acceptStructured('home', candidate), /JOURNAL_STORAGE_INPUT_UNAVAILABLE/);
  assert.equal((await f.recovery.acceptStructured('home', candidate)).status, 'already_accepted');
  assert.equal(f.batches.list().length, 1);
  assert.deepEqual(f.batches.list()[0].items, [f.item]);
});

test('cross-generation receipts suppress exact overlap and block partial or changed payload', async t => {
  const f = fixture(t);
  const accepted = f.save();
  f.batches.save('home', accepted.items, { draftGeneration: accepted.generation });
  const same = f.save(), partial = f.save([f.item, { title: 'Bread', operationId: randomUUID() }], 'Milk, Bread');
  const changed = f.save([{ ...f.item, quantityValue: 3 }]);
  const rows = (await f.recovery.scan('home')).candidates;
  assert.equal(rows.find(row => row.generation === same.generation).status, 'accepted');
  assert.equal(rows.find(row => row.generation === partial.generation).status, 'conflict');
  assert.equal(rows.find(row => row.generation === changed.generation).status, 'conflict');
  await assert.rejects(f.recovery.acceptStructured('home', rows.find(row => row.generation === partial.generation)), /LEGACY_REVIEW_REQUIRED/);
});

test('minimal typed generation agrees with the real legacy writer defaults before and after acceptance', async t => {
  const f = fixture(t), item = { title: 'Tea', operationId: randomUUID() };
  const original = f.save([item], 'Tea'), candidate = await f.first();
  const expected = { ...item, quantityValue: null, quantityUnit: '', sourceType: '', sourceBatchId: null, meta: {} };
  await f.recovery.acceptStructured('home', candidate);
  assert.deepEqual(f.batches.list()[0].items, [expected]);
  assert.doesNotThrow(() => f.batches.save('home', [expected], { draftGeneration: original.generation }));
  assert.equal((await f.first()).status, 'accepted');
});

test('a normalized receipt accepted by the old client is not mistaken for a payload conflict', async t => {
  const f = fixture(t), item = { title: 'Tea', operationId: randomUUID() };
  const original = f.save([item], 'Tea'), candidate = await f.first();
  f.batches.save('home', [{ ...item, quantityValue: null, quantityUnit: '', sourceType: '', sourceBatchId: null, meta: {} }], { draftGeneration: original.generation });
  assert.equal((await f.first()).status, 'accepted');
  assert.equal((await f.recovery.acceptStructured('home', candidate)).status, 'already_accepted');
});

test('journal and transactional acceptance evidence prevent fresh replay after original batch disappears', async t => {
  const f = fixture(t); f.save();
  const initial = shoppingCreateInitialDesired(f.item);
  const record = await f.journal.create({ operationId: f.item.operationId, projectId: 'home', localId: `offline-${f.item.operationId}`, desired: initial });
  await f.journal.setDesired(record.operationId, record.recordVersion, { ...initial, revision: '1', draft: { ...initial.draft, title: 'Oat milk' } });
  assert.equal((await f.first()).status, 'accepted'); // Immutable initial, not edited desired.
  const other = { title: 'Rice', operationId: randomUUID() };
  const original = f.save([other], 'Rice');
  await f.journal.drafts.create({ projectId: 'home', draftId: 'accepted-new', value: { text: 'Rice', items: [other] } });
  await f.journal.drafts.accept({ projectId: 'home', draftId: 'accepted-new', expectedVersion: 1 });
  assert.equal((await f.recovery.scan('home')).candidates.find(row => row.generation === original.generation).status, 'accepted');
});

test('source replacement and malformed acceptance evidence never authorize submission', async t => {
  const f = fixture(t); f.save(); const candidate = await f.first();
  f.local.setItem(candidate.key, JSON.stringify({ ...JSON.parse(candidate.raw), text: 'changed' }));
  await assert.rejects(f.recovery.acceptStructured('home', candidate), /LEGACY_SOURCE_CHANGED/);
  f.local.setItem('pmworkspace:shopping-input-batch:v1:owner-a:broken', '{');
  await assert.rejects(f.recovery.scan('home'), /LEGACY_EVIDENCE_UNREADABLE/);
  assert.equal((await f.journal.list()).length, 0);
});

test('malformed drafts stay stored and storage failure is visible rather than an empty list', async t => {
  const f = fixture(t); f.save();
  f.local.setItem('pmworkspace:shopping-typed-draft:v2:owner-a:home:bad', '{');
  const result = await f.recovery.scan('home');
  assert.equal(result.unreadable, 1); assert.equal(result.candidates.length, 1);
  const blocked = createShoppingLegacyRecovery({ ...f.options, storage: () => { throw new Error('blocked'); } });
  await assert.rejects(blocked.scan('home'), /LEGACY_STORAGE_UNAVAILABLE/);
  assert.equal(f.local.getItem('pmworkspace:shopping-typed-draft:v2:owner-a:home:bad'), '{');
});

test('plaintext requires explicit destination and preserves source and current editor', async t => {
  const f = fixture(t);
  f.local.setItem('pmworkspace:shopping-draft:v1:owner-a', JSON.stringify('Soup,\nBread'));
  const candidate = await f.first();
  assert.equal(candidate.projectId, null);
  await assert.rejects(f.recovery.createFromPlaintext('home', candidate, ''), /LEGACY_LIST_REQUIRED/);
  await f.journal.drafts.create({ projectId: 'home', draftId: 'current', value: { text: 'Milk', items: [f.item] } });
  const copied = await f.recovery.createFromPlaintext('home', candidate, 'home');
  const record = await f.journal.drafts.read('home', copied.draftId);
  assert.equal(record.value.text, 'Soup,\nBread');
  assert.equal((await f.journal.drafts.read('home', 'current')).value.text, 'Milk');
  assert.equal(f.local.getItem(candidate.key), candidate.raw);
  assert.equal((await f.journal.drafts.listAccepted('home')).length, 0);
});

test('plaintext copy with lost commit confirmation reopens the same destination and later edits', async t => {
  const f = fixture(t);
  f.local.setItem('pmworkspace:shopping-draft:v1:owner-a', JSON.stringify('Soup'));
  const candidate = await f.first(); let lost = true;
  const recovery = createShoppingLegacyRecovery({ ...f.options, repository: { ...f.journal.drafts, create: async input => {
    const saved = await f.journal.drafts.create(input);
    if (lost) { lost = false; throw new Error('timeout'); }
    return saved;
  } } });
  await assert.rejects(recovery.createFromPlaintext('home', candidate, 'home'), /timeout/);
  const [saved] = await f.journal.drafts.list('home');
  await f.journal.drafts.update({ projectId: 'home', draftId: saved.draftId, expectedVersion: 1,
    value: { ...saved.value, text: 'Tomato soup', items: [{ ...saved.value.items[0], title: 'Tomato soup' }] } });
  const result = await recovery.createFromPlaintext('home', candidate, 'home');
  assert.equal(result.draftId, saved.draftId);
  assert.equal((await f.journal.drafts.list('home')).length, 1);
  assert.equal((await f.journal.drafts.read('home', saved.draftId)).value.text, 'Tomato soup');
  await f.journal.drafts.accept({ projectId: 'home', draftId: saved.draftId, expectedVersion: 2 });
  assert.equal((await recovery.createFromPlaintext('home', candidate, 'home')).state, 'accepted');
});

test('owner change during evidence or hashing prevents copy and stale data publication', async t => {
  const f = fixture(t);
  f.local.setItem('pmworkspace:shopping-draft:v1:owner-a', JSON.stringify('Soup'));
  const candidate = await f.first();
  const recovery = createShoppingLegacyRecovery({ ...f.options, digest: async input => {
    f.setOwner('owner-b'); return webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  } });
  await assert.rejects(recovery.createFromPlaintext('home', candidate, 'home'), /JOURNAL_OWNER_CHANGED/);
  await assert.rejects(f.recovery.scan('home'), /JOURNAL_OWNER_CHANGED/);
  f.setOwner('owner-a');
  assert.equal((await f.journal.drafts.list('home')).length, 0);
});

test('plaintext changed during hashing is preserved without copying stale reviewed text', async t => {
  const f = fixture(t);
  f.local.setItem('pmworkspace:shopping-draft:v1:owner-a', JSON.stringify('Soup'));
  const candidate = await f.first();
  const recovery = createShoppingLegacyRecovery({ ...f.options, digest: async input => {
    f.local.setItem(candidate.key, JSON.stringify('Bread'));
    return webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  } });
  await assert.rejects(recovery.createFromPlaintext('home', candidate, 'home'), /LEGACY_SOURCE_CHANGED/);
  assert.equal((await f.journal.drafts.list('home')).length, 0);
});

test('plaintext replaced during destination commit reports conflict while retaining both copies', async t => {
  const f = fixture(t);
  f.local.setItem('pmworkspace:shopping-draft:v1:owner-a', JSON.stringify('Soup'));
  const candidate = await f.first();
  const recovery = createShoppingLegacyRecovery({ ...f.options, repository: { ...f.journal.drafts, create: async input => {
    const result = await f.journal.drafts.create(input);
    f.local.setItem(candidate.key, JSON.stringify('Bread')); return result;
  } } });
  await assert.rejects(recovery.createFromPlaintext('home', candidate, 'home'), /LEGACY_SOURCE_CHANGED/);
  assert.equal((await f.journal.drafts.list('home'))[0].value.text, 'Soup');
  assert.equal(f.local.getItem(candidate.key), JSON.stringify('Bread'));
});
