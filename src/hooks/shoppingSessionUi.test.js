import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createShoppingAddEntry } from '../utils/shoppingAddEntry.js';
import { formatShoppingAddSummary } from '../utils/shoppingListViewState.js';
import { splitTypedGroceries } from '../utils/shoppingListViewState.js';
import { createShoppingInputBatches } from '../utils/shoppingInputBatches.js';
import { memoryStorage } from '../../scripts/investigations/shopping-input-test-fixture.mjs';

// Execute the actual hook bodies with deterministic hook slots, effect cleanup,
// speech callbacks and auth transitions. No browser storage or real account.
async function hookHarness(file, name, bindings) {
  const slots = [];
  let cursor = 0, effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memoSlot = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: factory() };
    return slots[index].value;
  };
  const hooks = {
    useMemo: memoSlot, useCallback: (fn, deps) => memoSlot(() => fn, deps),
    useRef: value => { const index = cursor++; return slots[index] ||= { current: value }; },
    useState: initial => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial, set: value => {
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value;
      } };
      return [slots[index].value, slots[index].set];
    },
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) {
        const previous = slots[index];
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const source = (await readFile(new URL(file, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replace(/import\.meta\.env\.[A-Z_]+/g, "'fixture'").replace('export function ', 'function ');
  const render = vm.runInNewContext(`${source}\n${name}`, { ...hooks, ...bindings });
  return {
    render: props => { cursor = 0; effects = []; const result = render(props); effects.forEach(effect => effect()); return result; },
    close: () => slots.forEach(slot => slot.cleanup?.()),
  };
}

test('all add entrypoints restore only failed inputs and discard late results after session replacement', async () => {
  let active = true, restored = [], finish, calls = 0;
  const failures = [{ title: 'Bread', operationId: 'stable-bread' }];
  const entry = createShoppingAddEntry({ isCurrent: () => active,
    addItems: async () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    restoreFailed: items => restored.push(...items) });
  const first = entry(['Milk', 'Bread']);
  finish({ addedCount: 1, failedItems: failures }); await first;
  assert.deepEqual(restored, failures);
  restored = [];
  const late = entry(failures); active = false;
  finish({ addedCount: 0, failedItems: failures });
  assert.deepEqual(await late, { cancelled: true });
  assert.deepEqual(restored, []);
  assert.deepEqual(await entry(['Private grocery']), { cancelled: true });
  assert.equal(calls, 2);
});

test('retained durable callbacks cannot target a replacement account or a later session for the same account', async t => {
  const workspaces = [], calls = [];
  const harness = await hookHarness('./useShoppingDurableCreates.js', 'useShoppingDurableCreates', {
    AbortController, Map, Set, window: { addEventListener() {}, removeEventListener() {} },
    supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
    createShoppingCreateJournal: () => ({}), createShoppingSessionTransport: () => ({}),
    shoppingCreateProgress: () => ({ status: 'pending_add' }), shoppingCreateErrorMessage: () => 'Failure',
    sortTodos: items => items, projectShoppingCreates: ({ todos }) => todos,
    createShoppingCreateWorkspace: options => {
      const workspace = { close() {}, reload: async () => options.onChange({ records: [], errors: new Map(), refreshed: new Set(), busy: false }),
        sync: async () => {}, add: async () => { calls.push(options.getCurrentUserId()); return {}; },
        edit: async () => { calls.push(options.getCurrentUserId()); } };
      workspaces.push(workspace); return workspace;
    },
  });
  t.after(harness.close);
  const props = { currentUserId: 'a', enabled: true, isOnline: false, selectedProjectId: 'p', baseTodos: [] };
  harness.render(props);
  const firstA = harness.render(props);
  await firstA.add(['Milk']);
  harness.render({ ...props, currentUserId: 'b' });
  await assert.rejects(firstA.add(['Private grocery']));
  harness.render(props);
  const nextA = harness.render(props);
  assert.notEqual(firstA.sessionKey, nextA.sessionKey);
  await assert.rejects(firstA.add(['Old session grocery']));
  assert.equal((await firstA.edit({}, {})).cancelled, true);
  await nextA.add(['Bread']);
  assert.deepEqual(calls, ['a', 'a']);
  assert.equal(workspaces.length, 3);
});

test('voice partial failure uses the common recovery and old recognition callbacks stay fenced after A to B to A', async t => {
  const recognitions = [], restored = [], drafts = [];
  class Recognition {
    constructor() { recognitions.push(this); }
    start() {} stop() { this.onend?.(); } abort() { this.onend?.(); }
  }
  const addItems = createShoppingAddEntry({ isCurrent: () => true,
    addItems: async () => ({ addedCount: 1, failedItems: [{ title: 'Bread', operationId: 'bread-id' }] }),
    restoreFailed: items => restored.push(...items) });
  const harness = await hookHarness('./useShoppingListVoiceCapture.js', 'useShoppingListVoiceCapture', {
    formatShoppingAddSummary, navigator: { language: 'en-GB' },
    window: { SpeechRecognition: Recognition, setTimeout: () => 1, clearTimeout() {} },
  });
  t.after(harness.close);
  const props = { currentUserId: 'a', sessionKey: {}, addItems, setDraftTitle: value => drafts.push(value) };
  const voice = harness.render(props);
  voice.startListening();
  const oldResult = recognitions[0].onresult, oldEnd = recognitions[0].onend;
  const event = { resultIndex: 0, results: [Object.assign([{ transcript: 'Milk, Bread' }], { isFinal: true })] };
  oldResult(event); voice.stopListening();
  await new Promise(setImmediate);
  assert.equal(restored[0].operationId, 'bread-id');
  assert.match(harness.render(props).voiceMessage, /entry box/);
  // Changing the selected list replaces the View's sessionKey even when the
  // account is unchanged. Late recognition results must not use the old list.
  harness.render({ ...props, sessionKey: { project: 'second-list' } });
  oldResult(event); oldEnd();
  await new Promise(setImmediate);
  assert.equal(restored.length, 1);
  harness.render({ ...props, currentUserId: 'b', sessionKey: {} });
  const next = harness.render({ ...props, sessionKey: {} });
  oldResult(event); oldEnd(); voice.startListening();
  await new Promise(setImmediate);
  assert.equal(restored.length, 1);
  assert.deepEqual(drafts, []);
  assert.equal(recognitions.length, 1);
  assert.equal(next.voiceMessage, '');
});

async function typedDraftHarness(storage, tabStorage) {
  return hookHarness('./useShoppingTypedDraft.js', 'useShoppingTypedDraft', {
    createShoppingInputBatches: options => createShoppingInputBatches({ ...options,
      storage: () => storage, sessionStorage: () => tabStorage }), splitTypedGroceries,
    readLocalJson: (key, fallback) => JSON.parse(storage.getItem(key) || JSON.stringify(fallback)),
    writeLocalJson: (key, value) => storage.setItem(key, JSON.stringify(value)),
    removeLocalJson: key => storage.removeItem(key),
  });
}

for (const drained of [false, true]) {
  test(`persisted View draft does not reappear after accepted batch, before React clear (drained=${drained})`, async t => {
    const storage = memoryStorage(), tabStorage = memoryStorage();
    const props = { userId: 'a', projectId: 'p', enabled: true };
    const first = await typedDraftHarness(storage, tabStorage); t.after(first.close);
    first.render(props); let view = first.render(props);
    view.set('Milk, Bread'); view = first.render(props);
    const draft = view.prepare();
    const batches = createShoppingInputBatches({ userId: 'a', getCurrentUserId: () => 'a',
      storage: () => storage, sessionStorage: () => tabStorage });
    const batch = batches.save('p', draft.items, { draftGeneration: draft.generation });
    if (drained) batches.remove(batch);
    // Do not call clearAccepted. This is the exact persisted crash snapshot.
    first.close();
    const reopened = await typedDraftHarness(storage, tabStorage); t.after(reopened.close);
    reopened.render(props);
    assert.equal(reopened.render(props).value, '');
    assert.deepEqual(batches.save('p', draft.items, { draftGeneration: draft.generation }).items, draft.items);
    assert.equal(batches.list().length, drained ? 0 : 1);
  });
}

test('accepting an earlier generation preserves a newer identically worded draft and another tab', async t => {
  const storage = memoryStorage(), tabA = memoryStorage(), tabB = memoryStorage();
  const props = { userId: 'a', projectId: 'p', enabled: true };
  const first = await typedDraftHarness(storage, tabA), other = await typedDraftHarness(storage, tabB);
  t.after(first.close); t.after(other.close);
  first.render(props); let view = first.render(props); view.set('Milk');
  view = first.render(props); const submitted = view.prepare();
  view.set('Bread'); view.set('Milk');
  const newer = first.render(props).prepare();
  assert.notEqual(newer.generation, submitted.generation);
  const batches = createShoppingInputBatches({ userId: 'a', getCurrentUserId: () => 'a', storage: () => storage });
  batches.save('p', submitted.items, { draftGeneration: submitted.generation });
  view.clearAccepted(submitted.generation);
  assert.equal(first.render(props).value, 'Milk');
  other.render(props); other.render(props).set('Apples');
  const reloadA = await typedDraftHarness(storage, tabA); t.after(reloadA.close);
  reloadA.render(props);
  assert.equal(reloadA.render(props).value, 'Milk');
  assert.equal(other.render(props).value, 'Apples');
});

test('a failed structured draft write retains its generation until persistence succeeds', async t => {
  const storage = memoryStorage(), tabStorage = memoryStorage();
  const write = storage.setItem;
  let denied = false;
  storage.setItem = (...args) => { if (denied) throw new Error('quota'); return write(...args); };
  const props = { userId: 'a', projectId: 'p', enabled: true };
  const harness = await typedDraftHarness(storage, tabStorage); t.after(harness.close);
  harness.render(props); let view = harness.render(props);
  denied = true; view.set('Milk, Bread'); view = harness.render(props);
  assert.equal(view.value, 'Milk, Bread'); assert.throws(() => view.prepare());
  denied = false;
  const saved = view.prepare();
  assert.deepEqual(view.prepare(), saved);
  assert.equal(saved.items.length, 2);
});

test('rejected rich input is restored, reopened and retried with its exact ID and quantity', async t => {
  const storage = memoryStorage(), tabStorage = memoryStorage();
  const props = { userId: 'a', projectId: 'p', enabled: true };
  const first = await typedDraftHarness(storage, tabStorage); t.after(first.close);
  first.render(props);
  const failed = { title: 'Milk', operationId: 'original-id', quantityValue: 2, quantityUnit: 'carton', sourceType: 'manual', sourceBatchId: null, meta: { kept: true } };
  first.render(props).restoreFailed([failed]);
  const reopened = await typedDraftHarness(storage, tabStorage); t.after(reopened.close);
  reopened.render(props);
  assert.deepEqual(reopened.render(props).prepare().items, [failed]);
});
