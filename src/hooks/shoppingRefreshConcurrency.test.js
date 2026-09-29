import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as view from '../utils/shoppingListViewState.js';
import { mapManualTodoRow } from './projectData/manualTodoUtils.js';
import { isLikelyNetworkError } from '../utils/connectivity.js';
import { createShoppingCreateWorkspace } from '../utils/shoppingCreateWorkspace.js';

const copy = value => structuredClone(value);
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const project = id => ({ id, name: 'Shopping List', user_id: 'owner' });
const row = (title, projectId = 'a') => ({ _id: `${projectId}-item`, projectId, title, status: 'Open' });
const serverRow = (title, projectId = 'a') => ({ id: `${projectId}-item`, project_id: projectId, title, status: 'Open' });
const initial = () => ({ ...view.createEmptyShoppingOfflineState(), projects: [project('a'), project('b')],
  selectedProjectId: 'a', todosByProject: { a: [row('A')], b: [row('B', 'b')] } });
const source = (await readFile(new URL('./useShoppingListData.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '').replace('export function ', 'function ');

function fixture({ cache = initial(), holdHydration = false, online = true } = {}) {
  let stored = copy(cache), cursor = 0;
  const slots = [], effects = [], requests = [], hydrations = [], writes = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState: (value) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: (value) => { const i = cursor++; return slots[i] ||= { current: value }; },
    useMemo: (fn, deps) => { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback: (fn, deps) => { return hooks['useMemo'](() => fn, deps); },
    useEffect: (fn, deps) => { const i = cursor++; if (!same(slots[i]?.deps, deps)) {
      const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  };
  const supabase = { from(table) {
    const request = { table, ...deferred() };
    const builder = { select() { return builder; }, order() { return builder; },
      eq(key, value) { request[key] = value; return builder; },
      then(resolve, reject) { requests.push(request); return request.promise.then(resolve, reject); } };
    return builder;
  } };
  const renderHook = vm.runInNewContext(`${source}\nuseShoppingListData`, { ...hooks, ...view, supabase,
    isLikelyNetworkError, createProjectWithLimits: () => { throw new Error('Unexpected project create'); },
    getProjectCreationErrorMessage: error => error.message });
  const props = { currentUserId: 'owner', isOnline: online, canCreateProject: false,
    limits: { label: 'Test', maxProjects: 2 }, shoppingProjectName: 'Shopping List',
    loadShoppingOfflineState: () => copy(stored),
    loadShoppingOfflineStateAsync: () => { const value = copy(stored); if (!holdHydration) return Promise.resolve(value);
      const pending = deferred(); hydrations.push({ ...pending, value }); return pending.promise; },
    persistOfflineState: next => { writes.push(copy(next)); stored = copy(next); return copy(next); },
    sortTodos: view.sortTodos, mapManualTodoRow, normalizeProjectRecord: value => value,
    supportsProjectMembersRef: { current: false }, ensuringProjectRef: { current: false },
    isMissingSchemaFieldError: () => false, isMissingTodoRelationError: () => false,
    isProjectRelationMissingError: () => false, manualTodoSelect: '*', legacyManualTodoSelect: '*',
  };
  return {
    render(extra = {}) { cursor = 0; return renderHook({ ...props, ...extra }); },
    effects() { effects.splice(0).forEach(fn => fn()); },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
    requests, hydrations, writes, cache: () => copy(stored), store(value) { stored = copy(value); },
  };
}

for (const failure of [false, true]) {
  test(`older overlapping item ${failure ? 'failure' : 'success'} cannot replace newest refresh`, async () => {
    const f = fixture(); const old = f.render().loadTodos(); await tick();
    const fresh = f.render().loadTodos(); await tick();
    f.requests[1].resolve({ data: [serverRow('Fresh')], error: null }); await fresh;
    f.requests[0].resolve(failure ? { data: null, error: { message: 'Failed to fetch' } } : { data: [serverRow('Old')], error: null }); await old;
    assert.equal(f.render().todos[0].title, 'Fresh'); assert.equal(f.cache().todosByProject.a[0].title, 'Fresh');
  });
}
test('completed local write survives a server read started before it, even with a drained queue', async () => {
  const f = fixture(); const old = f.render().loadTodos(); await tick();
  f.render().setTodos([row('Written')]);
  f.store({ ...f.cache(), todosByProject: { ...f.cache().todosByProject, a: [row('Written')] }, queue: [] });
  f.requests[0].resolve({ data: [serverRow('Old')], error: null }); await old;
  assert.equal(f.render().todos[0].title, 'Written'); assert.equal(f.cache().todosByProject.a[0].title, 'Written');
});
test('pending online mutation blocks reads started after optimistic UI, and permits reads once settled', async () => {
  const f = fixture(); const data = f.render(); const finish = data.beginTodoMutation();
  data.setTodos([row('Optimistic')]); await f.render().loadTodos();
  assert.equal(f.requests.length, 0); assert.equal(f.render().todos[0].title, 'Optimistic');
  f.store({ ...f.cache(), todosByProject: { ...f.cache().todosByProject, a: [row('Committed')] } });
  finish(); finish(); const loading = f.render().loadTodos(); await tick();
  f.requests[0].resolve({ data: [serverRow('Committed')], error: null }); await loading;
  assert.equal(f.render().todos[0].title, 'Committed');
});
test('switching lists replaces selection and rows together and rejects the old response', async () => {
  const f = fixture(); const loading = f.render().loadTodos(); await tick();
  f.render().setSelectedProjectId('b');
  assert.equal(f.render().selectedProjectId, 'b'); assert.equal(f.render().todos[0].projectId, 'b');
  f.requests[0].resolve({ data: [serverRow('Late A')], error: null }); await loading;
  assert.equal(f.render().todos[0].title, 'B'); assert.equal(f.cache().todosByProject.b[0].title, 'B');
});
test('project completion persists metadata against current cache and preserves current selection', async () => {
  const f = fixture(); const loading = f.render().loadProjects(); await tick();
  f.render().setSelectedProjectId('b'); f.render();
  f.store({ ...f.cache(), selectedProjectId: 'b', queue: [{ kind: 'delete', targetId: 'b-item' }] });
  f.requests[0].resolve({ data: [project('a'), project('b')], error: null }); await loading;
  assert.equal(f.cache().selectedProjectId, 'b'); assert.equal(f.cache().queue.length, 1);
});
test('project network failure does not undo selection before its cache effect runs', async () => {
  const f = fixture(); const loading = f.render().loadProjects(); await tick();
  f.render().setSelectedProjectId('b');
  f.requests[0].resolve({ error: { message: 'Failed to fetch' } }); await loading;
  assert.equal(f.render().selectedProjectId, 'b'); assert.equal(f.render().todos[0].title, 'B');
});
test('an old list callback cannot touch the new list or cancel its refresh', async () => {
  const f = fixture(); const old = f.render().loadTodos;
  f.render().setSelectedProjectId('b'); const fresh = f.render().loadTodos(); await tick();
  await old(); assert.equal(f.render().todos[0].title, 'B'); assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ data: [serverRow('Fresh B', 'b')] }); await fresh;
  assert.equal(f.render().todos[0].title, 'Fresh B');
});
test('durable reads share the local mutation and ordinary refresh acceptance fence', async () => {
  const f = fixture(); const old = f.render().beginTodoRefresh('a');
  assert.equal(old(), true);
  const finish = f.render().beginTodoMutation(); f.render().setTodos([row('Edited')]);
  assert.equal(old(), false); assert.equal(f.render().beginTodoRefresh('a'), null);
  finish(); const newer = f.render().beginTodoRefresh('a'); assert.equal(newer(), true);
  const ordinary = f.render().loadTodos(); await tick(); assert.equal(newer(), false);
  f.requests[0].resolve({ data: [serverRow('Fresh')] }); await ordinary;
  const selected = f.render().beginTodoRefresh('a'); f.render().setSelectedProjectId('b');
  assert.equal(selected(), false);
});
test('mutating during an uncached read does not strand the loading indicator', async () => {
  const f = fixture({ cache: { ...initial(), todosByProject: {} } });
  const loading = f.render().loadTodos(); await tick(); assert.equal(f.render().loadingTodos, true);
  const finish = f.render().beginTodoMutation(); f.render().setTodos([row('New item')]); finish();
  f.requests[0].resolve({ data: [] }); await loading;
  assert.equal(f.render().loadingTodos, false); assert.equal(f.render().todos[0].title, 'New item');
});
test('parallel durable read owns a current failure after superseding the ordinary loader', async () => {
  const f = fixture({ cache: { ...initial(), todosByProject: {} } });
  let rejectRead;
  const workspace = createShoppingCreateWorkspace({ journal: {}, inputBatches: {},
    getCurrentUserId: () => 'owner', isOnline: () => true, onChange() {}, onRefresh() {},
    beginRefresh: projectId => f.render().beginTodoRefresh(projectId),
    transport: { readProject: () => new Promise((resolve, reject) => { rejectRead = reject; }) } });
  const ordinary = f.render().loadTodos();
  const durable = workspace.refresh('a');
  const failed = assert.rejects(durable, /Current failure/);
  rejectRead(new Error('Current failure')); await Promise.all([ordinary, failed]);
  assert.equal(f.requests.length, 0); assert.equal(f.render().loadingTodos, false);
  const obsolete = workspace.refresh('a');
  f.render().setTodos([row('New edit')]); rejectRead(new Error('Old failure'));
  assert.equal(await obsolete, false);
});
test('overlapping project requests ignore older membership data', async () => {
  const f = fixture(); const old = f.render().loadProjects(); await tick();
  const fresh = f.render().loadProjects(); await tick();
  f.requests[1].resolve({ data: [project('b')], error: null }); await fresh;
  f.requests[0].resolve({ data: [project('a'), project('b')], error: null }); await old;
  assert.equal(f.render().projects.length, 1); assert.equal(f.render().projects[0].id, 'b');
});
test('an unmounted hook cannot publish a held response', async () => {
  const f = fixture(); f.render(); f.effects(); await tick();
  f.close(); const writes = f.writes.length;
  f.requests.forEach(request => request.resolve({ data: [], error: null })); await tick();
  assert.equal(f.writes.length, writes);
});
test('delayed hydration cannot replace a newer optimistic edit', async () => {
  const f = fixture({ holdHydration: true }); const loading = f.render().loadTodos();
  f.render().setTodos([row('Typed while hydration waits')]);
  f.hydrations[0].resolve(f.hydrations[0].value); await loading;
  assert.equal(f.render().todos[0].title, 'Typed while hydration waits'); assert.equal(f.requests.length, 0);
});
test('durable hydration for another preferred project uses the retained selection rows', async () => {
  const f = fixture({ holdHydration: true, online: false }); f.render(); f.effects();
  const durable = { ...initial(), selectedProjectId: 'b' };
  f.hydrations.forEach(pending => pending.resolve(copy(durable))); await tick();
  assert.equal(f.render().selectedProjectId, 'a'); assert.equal(f.render().todos[0].projectId, 'a');
});
test('cold durable selection does not cancel online project discovery', async () => {
  const f = fixture({ cache: view.createEmptyShoppingOfflineState(), holdHydration: true }); f.render(); f.effects();
  f.hydrations.forEach(pending => pending.resolve(initial())); await tick();
  assert.equal(f.requests.filter(request => request.table === 'projects').length, 1);
  f.requests.forEach(request => request.resolve({ data: [project('b')], error: null })); await tick();
  assert.equal(f.render().projects[0].id, 'b');
});

test('Shopping async hydration stays read-only and rejects a stale durable snapshot after a local write', async () => {
  const pending = deferred(); let local = initial(); let readOptions;
  const utilitySource = (await readFile(new URL('../utils/shoppingListViewState.js', import.meta.url), 'utf8'))
    .replace(/^import[^\n]+\n/, '').replaceAll('export const ', 'const ');
  const load = vm.runInNewContext(`${utilitySource}\nloadShoppingOfflineStateAsync`, {
    readLocalJson: () => copy(local), readOfflineJson: (key, fallback, options) => { readOptions = options; return pending.promise; },
    writeLocalJson: () => { throw new Error('Hydration must not write'); },
  });
  const loading = load('owner');
  local = { ...local, todosByProject: { a: [row('Newest')] } };
  pending.resolve({ ...initial(), cacheUpdatedAt: '2099-01-01' });
  assert.equal((await loading).todosByProject.a[0].title, 'Newest'); assert.equal(readOptions.hydrateLocal, false);
});
