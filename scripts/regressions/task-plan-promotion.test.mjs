import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mountHook, mockTransport, sourceModules } from './react-source-runtime.mjs';
const owner = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const sourceId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const empty = []; const noop = () => {}; const now = () => '2026-10-06T00:00:00Z'; const loadTodos = async () => empty;
const reference = { kind: 'manual', id: sourceId, projectId, key: `manual:${sourceId}` };
const originalProject = { id: projectId, version: 1, tasks: [], registers: {}, tracker: [], baseline: null, status_report: {} };
const originalSource = { id: sourceId, project_id: projectId, title: 'Synthetic manual', status: 'Open', meta: {} };
const link = { projectId, taskId: 1, sourceKind: 'manual', sourceId, sourceKey: reference.key, operationId };
const savedSource = { ...originalSource, meta: { projectPlanLink: link } };
const savedProject = { ...originalProject, version: 2, tasks: [{ id: 1, name: 'Scheduled', start: '2026-10-06', dur: 1, originRef: link }] };
const ack = { ok: true, operation_id: operationId, project_id: projectId, task_id: 1, project: savedProject, source: savedSource };
async function fixture(rpc, readProject = () => originalProject) {
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const window = { localStorage: storage, sessionStorage: storage, setTimeout: (fn, ms) => setTimeout(fn, ms === 500 ? 0 : ms), clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {} };
  const transport = mockTransport((request) => request.operation === 'rpc' ? rpc(request) : { data: request.table === 'projects' ? readProject() : originalSource });
  const load = await sourceModules(transport, { window, navigator: { onLine: true } });
  const usePersistence = (await load('src/hooks/projectData/useProjectPersistence.js')).useProjectPersistence;
  const queueRef = { current: empty };
  const hook = await mountHook(({ userId }) => {
    const [projectData, setProjectData] = React.useState([]); const [registers, setRegisters] = React.useState({}); const [tracker, setTracker] = React.useState([]); const [baseline, setBaselineState] = React.useState(null); const [statusReport, setStatusReport] = React.useState({}); const [todos, setTodos] = React.useState(empty);
    const state = usePersistence({ baseline, isOnline: true, loadTodos, now, projectData, projectId, registers, setBaselineState, setLastSaved: noop, setOfflinePendingSync: noop, setProjectData, setRegisters, setStatusReport, setTodoQueue: noop, setTodos, setTracker, setUsingOfflineSnapshot: noop, statusReport, todoQueue: empty, todoQueueRef: queueRef, todos, tracker, userId });
    return { ...state, projectData, todos, edit: () => setProjectData([{ id: 7, name: 'Unrelated pending edit' }]) };
  }, { userId: owner });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  return { hook, transport };
}
test('actual persistence hook commits one RPC and adopts its version/source snapshot without a second autosave', async () => {
  const { hook, transport } = await fixture(async () => ({ data: ack }));
  try {
    const snapshot = await hook.value.preparePlanPromotion(reference);
    await act(async () => { await hook.value.commitPlanPromotion({ snapshot, reference, operationId, intent: {} }); });
    assert.equal(hook.value.projectData[0].id, 1); assert.equal(hook.value.todos[0]._id, sourceId); assert.equal(hook.value.hasPendingProjectSave, false);
    await assert.rejects(hook.value.preparePlanPromotion(reference), /stale/);
    assert.equal(transport.calls.filter((call) => call.operation === 'update').length, 0);
  } finally { await hook.close(); }
});
test('actual persistence gate refuses dirty unrelated work and simultaneous transactions', async () => {
  let resolveRpc; const held = new Promise((resolve) => { resolveRpc = resolve; });
  const { hook, transport } = await fixture(() => held);
  try {
    const snapshot = await hook.value.preparePlanPromotion(reference); let saving;
    await act(async () => { saving = hook.value.commitPlanPromotion({ snapshot, reference, operationId, intent: {} }); });
    await assert.rejects(hook.value.commitPlanPromotion({ snapshot, reference, operationId, intent: {} }), /pending edits/);
    await act(async () => { resolveRpc({ data: ack }); await saving; });
    assert.equal(transport.calls.filter((call) => call.operation === 'rpc').length, 1);
    await act(async () => hook.value.edit());
    await assert.rejects(hook.value.preparePlanPromotion(reference), /pending edits/);
  } finally { await hook.close(); }
});
test('late owner acknowledgement cannot populate a replacement account workspace', async () => {
  let resolveRpc; const held = new Promise((resolve) => { resolveRpc = resolve; });
  const { hook } = await fixture(() => held);
  try {
    const snapshot = await hook.value.preparePlanPromotion(reference); let saving;
    await act(async () => { saving = hook.value.commitPlanPromotion({ snapshot, reference, operationId, intent: {} }); });
    const rejected = assert.rejects(saving, /workspace changed/i);
    await hook.update({ userId: sourceId });
    await act(async () => { resolveRpc({ data: ack }); await rejected; });
    assert.equal(hook.value.projectData.some((task) => task.id === 1), false);
  } finally { await hook.close(); }
});

test('Review latest adopts a clean newer snapshot through persistence without closing the setup', async () => {
  let remote = originalProject;
  const { hook } = await fixture(async () => ({ data: ack }), () => remote);
  try {
    remote = { ...originalProject, version: 3, tasks: [{ id: 7, name: 'New remote predecessor', start: '2026-10-06', dur: 1 }] };
    await assert.rejects(hook.value.preparePlanPromotion(reference), /another session/);
    await act(async () => { assert.equal((await hook.value.preparePlanPromotion(reference, { adoptLatest: true })).project.version, 3); });
    assert.equal(hook.value.projectData[0].name, 'New remote predecessor'); assert.equal(hook.value.hasPendingProjectSave, false);
  } finally { await hook.close(); }
});

test('promoted plan rows cannot be forwarded into duplicate Tracker or Action sources', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: null })));
  const useTasks = (await load('src/hooks/projectData/useProjectTasksTracker.js')).useProjectTasksTracker;
  let forwarded = 0;
  const hook = await mountHook(() => useTasks({ projectData: savedProject.tasks, tracker: [], registers: {}, now, queueProjectSyncOp: () => { forwarded += 1; }, setProjectData: () => { forwarded += 1; }, setTracker: () => { forwarded += 1; }, setRegisters: () => { forwarded += 1; }, setBaselineState: noop }), {});
  try {
    assert.equal(hook.value.sendToTracker(1), false); assert.equal(hook.value.toggleTrackTask(1, true), false); assert.equal(forwarded, 0);
  } finally { await hook.close(); }
});

test('pointer and native Matrix drops move only the intended unlocked task and cancel on owner change', async () => {
  let target = 'urgent_not_important'; const moves = [];
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, requestAnimationFrame: (fn) => fn() };
  const document = { elementFromPoint() { return { closest() { return { getAttribute() { return target; } }; } }; } };
  const load = await sourceModules(mockTransport(() => ({ data: [] })), { window, document });
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;
  const todo = { _id: sourceId, title: 'Synthetic future task', status: 'Open' };
  const card = { todo, reference: { task_key: reference.key }, quadrant: 'not_urgent_important', deadlinePriority: false };
  const groups = ['urgent_important', 'not_urgent_important', 'urgent_not_important', 'not_urgent_not_important'].map((id) => ({ id, title: id, label: id, cards: id === card.quadrant ? [card] : [] }));
  const props = { matrix: { ready: true, pending: {}, groups, preferences: {}, move: async (item, quadrant) => { moves.push({ id: item._id, quadrant }); return true; } }, currentUserId: owner, isMobile: true, today: '2026-10-06', onOpenTodo: noop, handleCompleteTodo: noop };
  let root; await act(async () => { root = create(React.createElement(Matrix, props)); });
  const control = () => root.root.findAllByType('button').find((node) => node.props['aria-label']?.startsWith('Drag '));
  const event = { isPrimary: true, button: 0, pointerId: 5, clientX: 30, clientY: 40, preventDefault() {}, currentTarget: { setPointerCapture() {}, hasPointerCapture() { return false; } } };
  try {
    await act(async () => { control().props.onPointerDown(event); control().props.onPointerMove(event); control().props.onPointerUp(event); });
    assert.equal(moves.length, 1); assert.equal(moves[0].quadrant, target);
    await act(async () => control().props.onPointerDown(event));
    await act(async () => root.update(React.createElement(Matrix, { ...props, currentUserId: sourceId })));
    await act(async () => control().props.onPointerUp(event)); assert.equal(moves.length, 1);
    await act(async () => root.update(React.createElement(Matrix, { ...props, isMobile: false })));
    await act(async () => {
      root.root.findByType('article').props.onDragStart({ preventDefault() {}, dataTransfer: { setData() {} } });
      root.root.findAllByType('section').find((node) => node.props['data-matrix-quadrant'] === target).props.onDrop({ preventDefault() {} });
    });
    assert.equal(moves.length, 2);
    await act(async () => root.update(React.createElement(Matrix, { ...props, matrix: { ...props.matrix, groups: groups.map((group) => ({ ...group, cards: group.cards.map((item) => ({ ...item, deadlinePriority: true, overdue: true })) })) } })));
    assert.equal(control(), undefined);
  } finally { await act(async () => root.unmount()); }
});

test('All Projects completes a promoted manual task only in its original project despite matching numeric IDs', async () => {
  const otherProjectId = '77777777-7777-4777-8777-777777777777';
  const otherLink = { ...link, projectId: otherProjectId };
  const localProject = { ...originalProject, name: 'Current project', tasks: [{ id: 1, name: 'Local task must remain open', start: '2026-10-06', dur: 1, pct: 0 }] };
  const remoteProject = { ...originalProject, id: otherProjectId, name: 'Other project', tasks: [{ id: 1, name: 'Remote promoted task', start: '2020-01-01', dur: 1, pct: 0, tracked: true, originRef: otherLink }] };
  const remoteSource = { ...originalSource, project_id: otherProjectId, meta: { projectPlanLink: otherLink } };
  const storage = { getItem: (key) => key === 'pmworkspace:todo-view-mode:v1' ? '{"mode":"matrix"}' : null, setItem() {}, removeItem() {} };
  const window = { localStorage: storage, sessionStorage: storage, addEventListener() {}, removeEventListener() {}, setTimeout: (fn, ms) => setTimeout(fn, ms === 1600 ? 0 : ms), clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  let localCompletion = 0;
  const transport = mockTransport((request) => {
    if (request.table === 'projects' && request.operation === 'update') return { data: { version: 2 } };
    if (request.table === 'projects') return { data: [localProject, remoteProject], count: 2 };
    if (request.table === 'manual_todos') return { data: [remoteSource], count: 1 };
    return { data: [], count: 0 };
  });
  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;
  let root;
  await act(async () => { root = create(React.createElement(TodoView, { todos: empty, currentProject: localProject, projectData: localProject.tasks, registers: {}, tracker: empty, currentUserId: owner, currentUserName: '', isExternalView: false, onCompleteTodo: async () => { localCompletion += 1; }, onUpdateTodo: noop })); });
  try {
    const matrix = root.root.findByType(Matrix);
    const remote = matrix.props.matrix.groups.flatMap((group) => group.cards).find((card) => card.todo._id === sourceId).todo;
    await act(async () => { matrix.props.handleCompleteTodo(remote, 'matrix:urgent_important', 0); await new Promise((resolve) => setTimeout(resolve, 25)); });
    const writes = transport.calls.filter((call) => call.table === 'projects' && call.operation === 'update');
    assert.equal(writes.length, 1); assert.equal(localCompletion, 0);
    assert.equal(writes[0].filters.find((filter) => filter.args[0] === 'id').args[1], otherProjectId);
    assert.equal(writes[0].payload.tasks[0].pct, 100); assert.equal(localProject.tasks[0].pct, 0);
    assert.equal(transport.calls.some((call) => call.table === 'manual_todos' && call.operation === 'update'), false);
  } finally { await act(async () => root.unmount()); }
});

test('scheduling setup refuses unanswered fields, retains inputs and retries the identical operation', async () => {
  const document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
  const load = await sourceModules(mockTransport(() => ({ data: [] })), { document });
  const Setup = (await load('src/components/ScheduleTaskSetup.jsx')).default;
  const operations = []; let saved = 0; let prepareOptions;
  const onPrepare = async (_reference, options) => { prepareOptions = options; return { projectId, project: originalProject, source: { ...originalSource, due_date: '2099-12-01' } }; };
  let root;
  await act(async () => { root = create(React.createElement(Setup, { reference, title: 'Synthetic draft', onPrepare, onCommit: async (operation) => { operations.push(operation); if (operations.length === 1) throw new Error('Synthetic lost response'); return ack; }, onSaved: () => { saved += 1; }, onClose: noop })); });
  const button = (text) => root.root.findAllByType('button').find((node) => node.children.includes(text));
  try {
    await act(async () => button('Save in Project Plan').props.onClick()); assert.equal(operations.length, 0);
    await act(async () => root.root.findAllByType('input').find((node) => node.props.type === 'number').props.onChange({ target: { value: '2' } }));
    await act(async () => root.root.findAllByType('select').find((node) => node.props.value === '').props.onChange({ target: { value: 'independent' } }));
    await act(async () => root.root.findAllByType('input').find((node) => node.props.type === 'checkbox').props.onChange({ target: { checked: true } }));
    await act(async () => button('Save in Project Plan').props.onClick());
    assert.equal(saved, 0); assert.equal(root.root.findAllByType('input').find((node) => node.props.type === 'number').props.value, '2');
    assert.equal(root.root.findAllByType('input').find((node) => node.props.type === undefined).props.value, 'Synthetic draft');
    await act(async () => button('Review latest').props.onClick()); assert.equal(prepareOptions.adoptLatest, true);
    assert.ok(button('Retry same save')); assert.equal(root.root.findByType('fieldset').props.disabled, true);
    await act(async () => button('Retry same save').props.onClick());
    assert.equal(saved, 1); assert.equal(operations.length, 2); assert.equal(operations[0].operationId, operations[1].operationId); assert.equal(operations[0].intent, operations[1].intent); assert.equal(operations[1].replay, true);
    await act(async () => button('Review latest').props.onClick());
    assert.equal(root.root.findAllByType('input').some((node) => node.props.type === 'checkbox'), false);
    assert.equal(root.root.findAllByType('input').find((node) => node.props.type === 'number').props.value, '2');
  } finally { await act(async () => root.unmount()); }
});
