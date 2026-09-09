// Retention activation contract. Outside ordinary app CI: the first two
// assertions intentionally fail on PR #57. The remaining tests demonstrate
// unsafe cleanup proposals and controls using the actual input store.
// Run: node --test scripts/investigations/shopping-draft-retention.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShoppingInputBatches } from '../../src/utils/shoppingInputBatches.js';
import { memoryStorage } from './shopping-input-test-fixture.mjs';

const owner = 'synthetic-owner';
const project = 'synthetic-project';
const draftPrefix = `pmworkspace:shopping-typed-draft:v2:${owner}:${project}`;
const receiptKey = generation => `pmworkspace:shopping-input-batch:v1:${owner}:${generation}`;
const draftKey = generation => `${draftPrefix}:${generation}`;
const make = (storage, session = memoryStorage(), userId = owner) => createShoppingInputBatches({
  userId, getCurrentUserId: () => userId, storage: () => storage, sessionStorage: () => session,
});
const saveDraft = (store, text) => {
  const draft = store.newDraft(project, text, [text]);
  store.persistDraft(draft);
  return draft;
};
const accept = (store, draft) => {
  const batch = store.save(project, draft.items, { draftGeneration: draft.generation });
  store.remove(batch); // Journal handoff complete; not proof of server sync.
  return batch;
};

test('required: repeated editing retains bounded payload storage for one unsent draft', () => {
  const storage = memoryStorage(), store = make(storage);
  for (let index = 0; index < 100; index++) saveDraft(store, `Milk ${index}`);
  assert.equal(store.readDraft(project).text, 'Milk 99');
  // A deliberately loose bound, not a proposed eviction quota. Superseded
  // keystrokes should not require 100 separate full grocery payloads.
  assert.ok(storage.length <= 10, `100 edits retained ${storage.length} keys`);
});

test('required: a fresh session can find an older unsent draft when the latest tab submitted its draft', () => {
  const storage = memoryStorage(), first = make(storage), second = make(storage);
  saveDraft(first, 'Milk');
  accept(second, saveDraft(second, 'Bread'));
  const fresh = make(storage);
  // Future UI may expose choices instead of automatically restoring Milk.
  // Both are valid; it must make the unsent input discoverable.
  const recoverable = fresh.listDrafts?.(project) || [fresh.readDraft(project)];
  assert.ok(recoverable.some(draft => draft?.text === 'Milk'), 'Milk remains stored but is not discoverable');
});

test('unsafe proposal: deleting only a completed batch receipt resurrects accepted text', () => {
  const storage = memoryStorage(), session = memoryStorage(), store = make(storage, session);
  const draft = saveDraft(store, 'Milk');
  accept(store, draft);
  assert.equal(make(storage, session).readDraft(project).text, '');
  storage.removeItem(receiptKey(draft.generation));
  assert.equal(make(storage, session).readDraft(project).text, 'Milk');
});

test('unsafe proposal: removing draft plus receipt allows a sleeping tab to repersist accepted input', () => {
  const storage = memoryStorage(), session = memoryStorage(), store = make(storage, session);
  const draft = saveDraft(store, 'Milk');
  const sleepingTab = make(storage, session), captured = sleepingTab.readDraft(project);
  accept(store, draft);
  storage.removeItem(draftKey(draft.generation));
  storage.removeItem(receiptKey(draft.generation));
  sleepingTab.persistDraft(captured);
  const restored = make(storage, session).readDraft(project);
  assert.equal(restored.text, 'Milk');
  // Retrying the exact old IDs can be idempotent; editing that resurrected
  // text allocates new IDs and loses that protection.
  const edited = sleepingTab.newDraft(project, 'Milk, Eggs', ['Milk', 'Eggs']);
  assert.notEqual(edited.items[0].operationId, draft.items[0].operationId);
});

test('unsafe proposal: a scanner can miss another tab publishing an older captured draft', () => {
  const storage = memoryStorage(), sessionA = memoryStorage(), sessionB = memoryStorage();
  const first = make(storage, sessionA), other = make(storage, sessionB);
  const old = saveDraft(first, 'Milk');
  const captured = other.readDraft(project);
  saveDraft(first, 'Bread');
  // A localStorage cleanup scanner sees only the latest origin pointer.
  assert.notEqual(storage.getItem(draftPrefix), old.generation);
  // Another tab can republish its captured pointer after that observation.
  other.persistDraft(captured);
  storage.removeItem(draftKey(old.generation));
  assert.equal(make(storage, sessionB).readDraft(project), null);
});

test('control: retained receipt prevents reopening accepted text before or after batch drain', () => {
  const storage = memoryStorage(), session = memoryStorage(), store = make(storage, session);
  const draft = saveDraft(store, 'Milk');
  const batch = store.save(project, draft.items, { draftGeneration: draft.generation });
  assert.equal(make(storage, session).readDraft(project).text, '');
  store.remove(batch);
  assert.equal(make(storage, session).readDraft(project).text, '');
  assert.equal(store.list().length, 0);
});

test('control: retained generations preserve separate existing tab drafts', () => {
  const storage = memoryStorage(), sessionA = memoryStorage(), sessionB = memoryStorage();
  saveDraft(make(storage, sessionA), 'Milk');
  saveDraft(make(storage, sessionB), 'Bread');
  assert.equal(make(storage, sessionA).readDraft(project).text, 'Milk');
  assert.equal(make(storage, sessionB).readDraft(project).text, 'Bread');
  assert.equal(make(storage, memoryStorage(), 'another-owner').readDraft(project), null);
});
