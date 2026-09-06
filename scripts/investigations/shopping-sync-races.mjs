// Q02 reproduction suite. Intentionally outside the normal CI test glob.
// Run: node --test scripts/investigations/shopping-sync-races.mjs
// Assertions describe required behaviour; confirmed defects fail on the Q02 baseline.
import nodeTest from 'node:test';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as view from '../../src/utils/shoppingListViewState.js';
import * as rows from '../../src/hooks/projectData/manualTodoUtils.js';
import * as rpc from '../../src/utils/shoppingListRpc.js';
import { isOfflineTempId } from '../../src/utils/offlineState.js';
import { isLikelyNetworkError } from '../../src/utils/connectivity.js';

async function loadSource(path, exports, injected) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replaceAll('export function ', 'function ')
    .replaceAll('export const ', 'const ');
  return vm.runInNewContext(`${source}\n({${exports.join(',')}})`, injected, { filename: path });
}
const queueFns = await loadSource('../../src/utils/offlineQueue.js',
  ['enqueueCreate', 'enqueueUpdate', 'enqueueDelete', 'replaceQueuedTargetId'], { isOfflineTempId });
const copy = (value) => structuredClone(value);
const noop = () => {};
const unexpected = () => { throw new Error('Unexpected dependency used by reproduction'); };
const project = { id: 'project-test', name: 'Shopping List', user_id: 'user-test' };
const previousSync = '2026-01-01T12:00:00.000Z';
const update = { kind: 'update', targetId: 'item-a', patch: { title: 'First edit' } };
const create = { kind: 'create', targetId: 'offline-new', record: {
  localId: 'offline-new', projectId: project.id, title: 'New milk',
  operationId: 'operation-test', quantityValue: 1, quantityUnit: 'carton',
} };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

// Minimal persistent state/ref slots. Effects are deliberately not scheduled:
// each test explicitly starts one real callback, pauses its request, invokes a
// real user-action callback, then releases the response. This is not a browser test.
function reactHarness() {
  const slots = [];
  let cursor = 0;
  return {
    reset: () => { cursor = 0; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === 'function' ? value(slots[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: (factory) => factory(), useCallback: (callback) => callback, useEffect: noop,
  };
}

async function setup({ queue = [update], hold = 'update', failure = false } = {}) {
  let server = [
    { id: 'item-a', project_id: project.id, title: 'Milk', status: 'Open' },
    { id: 'item-b', project_id: project.id, title: 'Bread', status: 'Open' },
  ];
  let cache = { projects: [project], selectedProjectId: project.id, queue: copy(queue),
    todosByProject: { [project.id]: view.applyShoppingQueueToTodos({
      todos: server.map(rows.mapManualTodoRow), queue, projectId: project.id,
    }) }, lastSyncedAt: previousSync };
  let visible = copy(cache.todosByProject[project.id]);
  let dataSetTodos;
  const entered = deferred();
  const release = deferred();
  let held = false;
  const requests = [];
  async function execute(request) {
    requests.push(copy(request));
    if (!held && request.kind === hold) {
      held = true;
      entered.resolve(request);
      await release.promise;
      if (failure) return { data: null, error: { message: 'Failed to fetch' } };
    }
    if (request.kind === 'read:manual_todos') return { data: copy(server), error: null };
    if (request.kind === 'read:projects') return { data: [copy(project)], error: null };
    if (request.kind === 'update') {
      server = server.map((row) => row.id === request.id ? { ...row, ...request.patch } : row);
      return { data: { id: request.id }, error: null };
    }
    if (request.kind === 'rpc') {
      assert.equal(request.name, 'apply_shopping_list_add_v2');
      const saved = { id: 'server-new', project_id: project.id,
        title: request.args.target_title, quantity_value: request.args.target_quantity_value,
        quantity_unit: request.args.target_quantity_unit, status: 'Open' };
      server.push(saved);
      return { data: [copy(saved)], error: null };
    }
    if (request.kind === 'delete') {
      server = server.filter((row) => row.id !== request.id);
      return { data: null, error: null };
    }
    throw new Error(`Unexpected request: ${request.kind}`);
  }
  const supabase = {
    from(table) {
      const request = { kind: `read:${table}` };
      const builder = {
        select() { return builder; }, order() { return builder; },
        eq(field, value) { if (field === 'id') request.id = value; return builder; },
        update(patch) { request.kind = 'update'; request.patch = copy(patch); return builder; },
        delete() { request.kind = 'delete'; return builder; },
        maybeSingle() { return builder; }, single() { return builder; },
        then(resolve, reject) { return execute(request).then(resolve, reject); },
      };
      return builder;
    },
    rpc: (name, args) => execute({ kind: 'rpc', name, args: copy(args) }),
  };
  const shared = {
    currentUserId: 'user-test', isOnline: true, selectedProject: project,
    selectedProjectId: project.id, sortTodos: view.sortTodos,
    loadShoppingOfflineState: () => copy(cache),
    loadShoppingOfflineStateAsync: async () => copy(cache),
    // Mirrors ShoppingListView's replacement persistence contract, in memory.
    persistOfflineState: (next) => { cache = copy(next); return copy(cache); },
    setTodos: (next) => {
      visible = copy(typeof next === 'function' ? next(visible) : next);
      if (dataSetTodos) dataSetTodos(copy(visible));
    },
    setTodoError: noop, setFailedTodoId: noop, setFailedTodoMessage: noop,
    retryTodoAction: noop, formatSyncTimeLabel: (value) => value,
    canCreateProject: false, limits: { label: 'Test', maxProjects: 1 },
    supportsProjectMembersRef: { current: false }, ensuringProjectRef: { current: false },
    shoppingProjectName: 'Shopping List', normalizeProjectRecord: (value) => value,
    manualTodoSelect: rows.SHOPPING_MANUAL_TODO_SELECT,
    legacyManualTodoSelect: rows.LEGACY_MANUAL_TODO_SELECT,
    mapManualTodoRow: rows.mapManualTodoRow,
    isMissingSchemaFieldError: () => false, isMissingTodoRelationError: () => false,
    isProjectRelationMissingError: () => false,
  };
  const injected = { supabase, ...view, ...rows, ...queueFns, ...rpc,
    isOfflineTempId, isLikelyNetworkError, notifyShoppingListSubscribers: noop,
    isFreshTimestamp: unexpected, createProjectWithLimits: unexpected,
    getProjectCreationErrorMessage: unexpected };
  async function renderer(name) {
    const react = reactHarness();
    const loaded = await loadSource(`../../src/hooks/${name}.js`, [name], { ...injected, ...react });
    return (extra = {}) => {
      react.reset();
      return loaded[name]({ ...shared, todos: visible, offlineQueue: cache.queue,
        lastSyncedAt: cache.lastSyncedAt, failedTodoId: '', failedTodoMessage: '', ...extra });
    };
  }
  const sync = await renderer('useShoppingListOfflineSync');
  const actions = await renderer('useShoppingListActions');
  const data = await renderer('useShoppingListData');
  dataSetTodos = data().setTodos;
  return {
    sync, data, requests,
    entered: entered.promise, release: () => release.resolve(),
    edit: (id, title) => actions({ isOnline: false }).updateTodoTitle(visible.find((todo) => todo._id === id), title),
    remove: (id) => actions({ isOnline: false }).deleteTodo(id),
    snapshot: () => copy({ cache, visible, server, requests }),
    durableTitle(id) {
      return view.applyShoppingQueueToTodos({ todos: server.map(rows.mapManualTodoRow),
        queue: cache.queue, projectId: project.id }).find((todo) => todo._id === id)?.title;
    },
  };
}

function evidence(snapshot) {
  const items = (todos) => todos.map((todo) => ({ id: todo._id || todo.id, title: todo.title }));
  return JSON.stringify({ queue: snapshot.cache.queue,
    cached: items(snapshot.cache.todosByProject[project.id]),
    visible: items(snapshot.dataTodos || snapshot.visible), server: items(snapshot.server),
    lastSyncedAt: snapshot.cache.lastSyncedAt,
    requests: snapshot.requests.map(({ kind, id }) => ({ kind, id })) });
}

async function runSyncRace(t, options, action) {
  const runtime = await setup(options);
  const syncing = runtime.sync().retryShoppingSync();
  await runtime.entered;
  if (action) await action(runtime);
  runtime.release();
  await syncing;
  t.diagnostic(evidence(runtime.snapshot()));
  return runtime;
}

export function registerShoppingSyncRaceTests({ includeKnownFailures = true } = {}) {
const test = (name, options, callback) => {
  if (includeKnownFailures || !/^Q0[45]:/.test(name)) nodeTest(name, options, callback);
};

test('control: an uncontested queued update reaches the server and drains', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, {}, null);
  assert.equal(runtime.durableTitle('item-a'), 'First edit');
  assert.equal(runtime.snapshot().cache.queue.length, 0);
});

test('Q03: an unrelated edit enqueued during an acknowledgement remains durable', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, {}, (r) => r.edit('item-b', 'New bread'));
  assert.equal(runtime.durableTitle('item-b'), 'New bread');
});

test('Q03: a newer edit compacted into the same queued update remains durable', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, {}, (r) => r.edit('item-a', 'Newest milk'));
  assert.equal(runtime.durableTitle('item-a'), 'Newest milk');
});

test('Q03: a failed request cannot replace a newer queued edit with its older patch', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, { failure: true }, (r) => r.edit('item-a', 'Newest milk'));
  assert.equal(runtime.durableTitle('item-a'), 'Newest milk');
});

test('Q03: a newer delete superseding an in-flight update reaches the server', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, {}, (r) => r.remove('item-a'));
  assert.equal(runtime.durableTitle('item-a'), undefined);
  assert.equal(runtime.snapshot().cache.queue.length, 0);
  assert.equal(runtime.snapshot().visible.some((todo) => todo._id === 'item-a'), false);
});

test('Q03: a mixed create/update queue preserves an unrelated edit made during the create', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, { queue: [create, update], hold: 'rpc' }, (r) => r.edit('item-b', 'New bread'));
  assert.equal(runtime.durableTitle('server-new'), 'New milk');
  assert.equal(runtime.durableTitle('item-a'), 'First edit');
  assert.equal(runtime.durableTitle('item-b'), 'New bread');
  assert.equal(runtime.snapshot().cache.queue.length, 0);
});

test('control: an uncontested queued create maps its temporary item to the saved ID', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, { queue: [create], hold: 'rpc' }, null);
  assert.equal(runtime.durableTitle('server-new'), 'New milk');
  assert.equal(runtime.snapshot().cache.queue.length, 0);
  assert.ok(runtime.snapshot().visible.some((todo) => todo._id === 'server-new'));
});

test('Q04: editing a temporary item during create preserves the edit under the saved ID', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, { queue: [create], hold: 'rpc' }, (r) => r.edit('offline-new', 'Changed new milk'));
  assert.equal(runtime.durableTitle('server-new'), 'Changed new milk');
});

test('Q04: deleting a temporary item during create does not resurrect it', { timeout: 3000 }, async (t) => {
  const runtime = await runSyncRace(t, { queue: [create], hold: 'rpc' }, (r) => r.remove('offline-new'));
  assert.equal(runtime.durableTitle('server-new'), undefined);
  assert.equal(runtime.snapshot().visible.some((todo) => todo._id === 'server-new'), false);
});

async function runRefreshRace(t, { projects = false, failure = false, edit = true } = {}) {
  const runtime = await setup({ queue: [], hold: projects ? 'read:projects' : 'read:manual_todos', failure });
  const data = runtime.data();
  const loading = projects ? data.loadProjects() : data.loadTodos();
  await runtime.entered;
  if (edit) {
    await runtime.edit('item-a', 'Newest milk');
    assert.equal(runtime.data().todos.find((todo) => todo._id === 'item-a').title, 'Newest milk',
      'The real action must update the data hook state before the delayed response arrives');
  }
  runtime.release();
  await loading;
  const snapshot = runtime.snapshot();
  // loadTodos owns its own React state. Read a rerender for that visible result.
  snapshot.dataTodos = copy(runtime.data().todos);
  t.diagnostic(evidence(snapshot));
  return { runtime, snapshot };
}

test('control: an uncontested item refresh displays server data', { timeout: 3000 }, async (t) => {
  const { snapshot } = await runRefreshRace(t, { edit: false });
  assert.equal(snapshot.dataTodos.find((todo) => todo._id === 'item-a').title, 'Milk');
});

test('Q05: delayed item refresh preserves edits queued after loading began', { timeout: 3000 }, async (t) => {
  const { runtime } = await runRefreshRace(t);
  assert.equal(runtime.durableTitle('item-a'), 'Newest milk');
});

test('Q05: delayed project refresh preserves edits queued after loading began', { timeout: 3000 }, async (t) => {
  const { runtime } = await runRefreshRace(t, { projects: true });
  assert.equal(runtime.durableTitle('item-a'), 'Newest milk');
});

test('Q05: failed item refresh preserves the latest optimistic item on screen', { timeout: 3000 }, async (t) => {
  const { snapshot } = await runRefreshRace(t, { failure: true });
  assert.equal(snapshot.dataTodos.find((todo) => todo._id === 'item-a').title, 'Newest milk');
});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  registerShoppingSyncRaceTests();
}
