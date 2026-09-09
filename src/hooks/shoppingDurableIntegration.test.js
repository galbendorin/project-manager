import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { createShoppingCreateJournal } from '../utils/shoppingCreateJournal.js';
import { createShoppingCreateWorkspace, projectShoppingCreates } from '../utils/shoppingCreateWorkspace.js';
import { isOfflineTempId } from '../utils/offlineState.js';
import { planShoppingListAdds, createOfflineShoppingTodo, sortTodos } from '../utils/shoppingListViewState.js';
import { enqueueCreate, enqueueDelete, enqueueUpdate } from '../utils/offlineQueue.js';
import { createShoppingInputBatches } from '../utils/shoppingInputBatches.js';
import { memoryStorage } from '../../scripts/investigations/shopping-input-test-fixture.mjs';

const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const tick = () => new Promise(setImmediate);
const hookSource = (await readFile(new URL('./useShoppingListActions.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace('export function ', 'function ');
const map = row => ({ _id: row.id, projectId: row.project_id, title: row.title, status: row.status,
  quantityValue: row.quantity_value, quantityUnit: row.quantity_unit });

// A deliberately small response model for real action callbacks. Native SQL
// tests separately certify transaction/merge behavior; this model controls the
// network boundary and counts retries and UI state updates deterministically.
function setup(t, { shared = false, loseAdd = false, holdAdd = false, offline = true, journalWrap, allowLegacy = false, failAll = false } = {}) {
  let server = shared ? [{ id: 'shared-milk', project_id: 'project-a', title: 'Milk', status: 'Open', quantity_value: 2, quantity_unit: 'carton' }] : [];
  const receipts = new Map(), intents = new Map();
  const entered = defer(), release = defer();
  const calls = [];
  let firstAdd = true, online = !offline, serial = 0, error = '';
  let base = server.map(map), snapshot = { records: [], refreshed: new Set(), busy: false, errors: new Map() };
  let cache = { queue: [], todosByProject: {} };
  const batchStorage = memoryStorage();
  const journal = createShoppingCreateJournal({ userId: 'user-a', getCurrentUserId: () => 'user-a', indexedDB: new IDBFactory() });
  const transport = { readProject: async () => structuredClone(server), rpc: async (name, args) => {
    calls.push({ name, args: structuredClone(args) });
    if (failAll) throw new Error('RPC unavailable');
    if (name.endsWith('_v3')) {
      let receipt = receipts.get(args.target_operation_id);
      if (!receipt) {
        const previous = server.find(row => row.title === args.target_title);
        const before = previous ? structuredClone(previous) : null;
        const row = { id: previous?.id || `row-${++serial}`, project_id: 'project-a', title: args.target_title,
          status: 'Open', quantity_value: (previous?.quantity_value || 0) + (args.target_quantity_value || 0), quantity_unit: args.target_quantity_unit };
        server = server.filter(value => value.id !== row.id).concat(row);
        receipt = { outcome: 'applied', operation_id: args.target_operation_id, project_id: 'project-a', user_id: 'user-a',
          confirmed_revision: '0', contribution: { kind: previous ? 'merged' : 'inserted', row_id: row.id, revision: '1', before, after: structuredClone(row) },
          row_exists: true, current_item: structuredClone(row) };
        receipts.set(args.target_operation_id, receipt);
      }
      if (firstAdd) {
        firstAdd = false; entered.resolve(); if (holdAdd) await release.promise;
        if (loseAdd) throw new Error('Network response lost');
      }
      return { data: structuredClone(receipt) };
    }
    if (intents.has(args.target_intent_id)) return { data: structuredClone(intents.get(args.target_intent_id)) };
    const receipt = receipts.get(args.target_operation_id);
    const original = receipt.contribution;
    server = server.filter(row => row.id !== original.row_id);
    if (original.before) server.push(original.before);
    let contribution = null;
    if (!args.target_cancel) {
      const row = { id: `row-${++serial}`, project_id: 'project-a', title: args.target_title, status: args.target_status,
        quantity_value: args.target_quantity_value, quantity_unit: args.target_quantity_unit };
      server.push(row); contribution = { kind: 'inserted', row_id: row.id, revision: '2', before: null, after: row };
    }
    receipt.contribution = contribution;
    const result = { outcome: 'applied', operation_id: args.target_operation_id, desired_revision: args.target_desired_revision,
      confirmed_revision: args.target_desired_revision, latest_received_revision: args.target_desired_revision, replayed: false,
      contribution, affected_items: server, removed_row_ids: [original.row_id] };
    intents.set(args.target_intent_id, result);
    return { data: structuredClone(result) };
  } };
  const workspace = createShoppingCreateWorkspace({ journal: journalWrap ? journalWrap(journal) : journal, transport,
    inputBatches: createShoppingInputBatches({ userId: 'user-a', getCurrentUserId: () => 'user-a', storage: () => batchStorage }),
    getCurrentUserId: () => 'user-a', isOnline: () => online, createId: () => `id-${++serial}`,
    onChange: next => { snapshot = next; }, onRefresh: async (_projectId, rows) => { base = rows.map(map); } });
  t.after(() => workspace.close());
  const visible = () => projectShoppingCreates({ todos: base, records: snapshot.records, projectId: 'project-a', refreshed: snapshot.refreshed });
  const unexpected = () => { throw new Error('Durable action escaped to legacy path'); };
  const renderActions = vm.runInNewContext(`${hookSource}\nuseShoppingListActions`, {
    useCallback: fn => fn, useEffect: () => {}, useRef: value => ({ current: value }),
    useState: initial => [initial, () => {}], isOfflineTempId, generateShoppingOperationId: () => `operation-${++serial}`,
    supabase: new Proxy({}, { get: unexpected }), planShoppingListAdds: allowLegacy ? planShoppingListAdds : unexpected,
    enqueueCreate, enqueueDelete, enqueueUpdate,
  });
  const actions = (enabled = true) => renderActions({ currentUserId: 'user-a', isOnline: online,
    selectedProject: { id: 'project-a' }, todos: visible(),
    setTodos: allowLegacy ? value => { base = value; } : unexpected, setTodoError: value => { error = value; },
    loadShoppingOfflineState: () => cache, persistOfflineState: value => { cache = value; }, sortTodos, createOfflineShoppingTodo,
    durableCreates: { enabled, add: (items, options) => workspace.add('project-a', structuredClone(items), options), edit: async (todo, patch) => {
      try { await workspace.edit(todo, structuredClone(patch)); return { ok: true }; } catch (cause) { return { ok: false, message: cause.code }; }
    } } });
  const idle = async () => {
    for (let i = 0; i < 500; i++) { await tick(); if (!snapshot.busy) return; }
    throw new Error('Sync did not stop');
  };
  return { workspace, journal, actions, visible, entered: entered.promise, release: release.resolve, calls, idle,
    online: () => { online = true; }, getServer: () => server, error: () => error, snapshot: () => snapshot,
    setBase: rows => { base = rows; }, cache: () => cache };
}

for (const scenario of [
  { title: 'temporary rename', patch: 'rename' }, { title: 'temporary cancellation', patch: 'cancel' },
  { title: 'merged cancellation', patch: 'cancel', shared: true }, { title: 'merged rename', patch: 'rename', shared: true },
  { title: 'rename after lost committed response', patch: 'rename', loseAdd: true },
]) {
  test(`Q04 durable actions: ${scenario.title}`, { timeout: 3000 }, async t => {
    const fixture = setup(t, { ...scenario, holdAdd: true });
    await fixture.actions().addItems([{ title: 'Milk', quantityValue: 1, quantityUnit: 'carton' }]);
    const pending = fixture.visible().find(todo => todo._shoppingOperationId);
    fixture.online();
    const sync = fixture.workspace.sync();
    await fixture.entered;
    if (scenario.patch === 'cancel') await fixture.actions().deleteTodo(pending._id);
    else assert.equal((await fixture.actions().updateTodoTitle(pending, 'Oat milk')).ok, true);
    fixture.release(); await sync; await fixture.idle();
    if (scenario.loseAdd) { await fixture.workspace.sync(); await fixture.idle(); }
    const server = fixture.getServer();
    if (scenario.shared) assert.equal(server.find(row => row.id === 'shared-milk').quantity_value, 2);
    if (scenario.patch === 'cancel') assert.equal(server.length, scenario.shared ? 1 : 0);
    else assert.ok(server.some(row => row.title === 'Oat milk'));
    assert.equal(fixture.visible().some(todo => todo._shoppingOperationId), false);
    if (scenario.loseAdd) assert.deepEqual(fixture.calls[1].args, fixture.calls[0].args);
  });
}

test('an online addition is durably recorded before its first request, with no legacy queue writes', { timeout: 3000 }, async t => {
  const fixture = setup(t, { offline: false, holdAdd: true });
  await fixture.actions().addItems(['Milk']); await fixture.entered;
  const records = await fixture.journal.list();
  assert.equal(records.length, 1); assert.equal(records[0].submission.item.title, 'Milk');
  fixture.release(); await fixture.idle();
});

test('partial journal failure retains a complete batch and resumes stable IDs without a fresh input', async t => {
  let blocked = true;
  const fixture = setup(t, { journalWrap: journal => ({ ...journal, create: entry => {
    if (blocked && entry.desired.draft.title === 'Bread') throw new Error('quota');
    return journal.create(entry);
  } }) });
  const first = await fixture.actions().addItems(['Milk', 'Bread']);
  assert.equal(first.addedCount, 2); assert.equal(first.failedItems.length, 0);
  const operationId = fixture.snapshot().batches[0].items[1].operationId;
  blocked = false;
  await fixture.workspace.sync();
  const records = await fixture.journal.list();
  assert.equal(records.length, 2); assert.ok(records.some(record => record.operationId === operationId));
});

test('pending records remain editable and syncable when the new-create rollout flag is off', async t => {
  const fixture = setup(t);
  await fixture.actions().addItems(['Milk']);
  const pending = fixture.visible()[0];
  assert.equal((await fixture.actions(false).updateTodoTitle(pending, 'Oat milk')).ok, true);
  fixture.online(); await fixture.workspace.sync();
  assert.equal(fixture.getServer()[0].title, 'Oat milk');
});

test('legacy temporary creates cannot be modified through the durable rollout', async t => {
  const fixture = setup(t);
  fixture.setBase([{ _id: 'offline-legacy', title: 'Milk', status: 'Open' }]);
  assert.equal((await fixture.actions().updateTodoTitle(fixture.visible()[0], 'Bread')).ok, false);
  await fixture.actions().deleteTodo('offline-legacy');
  assert.match(fixture.error(), /older addition/);
  assert.equal(fixture.visible()[0].title, 'Milk');
  assert.equal(fixture.calls.length, 0);
});

test('an edit begun on a pending row retains contribution semantics after its acknowledgement arrives', async t => {
  const fixture = setup(t, { shared: true });
  await fixture.actions().addItems([{ title: 'Milk', quantityValue: 1, quantityUnit: 'carton' }]);
  const captured = fixture.visible().find(todo => todo._shoppingOperationId);
  fixture.online(); await fixture.workspace.sync();
  assert.equal((await fixture.actions().updateTodoTitle(captured, 'Oat milk')).ok, true);
  await fixture.idle();
  assert.equal(fixture.getServer().find(row => row.id === 'shared-milk').quantity_value, 2);
  assert.ok(fixture.getServer().some(row => row.title === 'Oat milk'));
});

test('editing a shared row offline never copies durable projections into the legacy cache', async t => {
  const fixture = setup(t, { shared: true, allowLegacy: true });
  await fixture.actions().addItems(['Bread']);
  const shared = fixture.visible().find(todo => !todo._shoppingOperationId);
  assert.equal((await fixture.actions().updateTodoTitle(shared, 'Oat milk')).ok, true);
  assert.equal(fixture.cache().todosByProject['project-a'].length, 1);
  assert.equal(fixture.cache().todosByProject['project-a'][0].title, 'Oat milk');
  assert.equal(fixture.cache().queue.length, 1);
  assert.equal(fixture.visible().filter(todo => todo._shoppingOperationId).length, 1);
});

test('with rollout off a matching new legacy add cannot mutate a durable temporary row', async t => {
  const fixture = setup(t, { allowLegacy: true });
  await fixture.actions().addItems([{ title: 'Milk', quantityValue: 1, quantityUnit: 'carton' }]);
  const pending = fixture.visible()[0];
  await fixture.actions(false).addItems([{ title: 'Milk', quantityValue: 2, quantityUnit: 'carton' }]);
  assert.equal(fixture.cache().queue.length, 1);
  assert.equal(fixture.cache().queue[0].kind, 'create');
  assert.notEqual(fixture.cache().queue[0].targetId, pending._id);
  assert.equal(fixture.visible().find(todo => todo._shoppingOperationId).quantityValue, 1);
  assert.ok(fixture.cache().todosByProject['project-a'].every(todo => !todo._shoppingOperationId));
});

test('recovery drains more than one bounded batch without waiting for another browser event', { timeout: 10000 }, async t => {
  const fixture = setup(t);
  await fixture.actions().addItems(Array.from({ length: 103 }, (_, index) => `Grocery ${index}`));
  fixture.online(); await fixture.workspace.sync(); await fixture.idle();
  assert.equal(fixture.getServer().length, 103);
  assert.equal(fixture.visible().filter(todo => todo._shoppingOperationId).length, 0);
});

test('a large failing queue attempts every operation once, stops, and retries only on explicit wake', { timeout: 10000 }, async t => {
  const fixture = setup(t, { failAll: true });
  await fixture.actions().addItems(Array.from({ length: 101 }, (_, index) => `Grocery ${index}`));
  fixture.online(); await fixture.workspace.sync(); await fixture.idle();
  assert.equal(fixture.calls.length, 101);
  assert.equal(new Set(fixture.calls.map(call => call.args.target_operation_id)).size, 101);
  await tick(); await tick();
  assert.equal(fixture.snapshot().busy, false);
  assert.equal(fixture.calls.length, 101);
  await fixture.workspace.sync(); await fixture.idle();
  assert.equal(fixture.calls.length, 202);
});
