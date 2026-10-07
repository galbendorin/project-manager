import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mountHook, mockTransport, sourceModules } from './react-source-runtime.mjs';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const todo = { _id: '33333333-3333-4333-8333-333333333333', title: 'Synthetic future task', dueDate: '2026-11-01', status: 'Open' };
const key = `manual:${todo._id}`;
const preference = { id: '44444444-4444-4444-8444-444444444444', user_id: owner, task_key: key, manual_quadrant: 'urgent_not_important', planned_day: '2026-10-05', version: 1 };
const props = { currentUserId: owner, enabled: true, isExternalView: false, todos: [todo], today: '2026-10-05' };

async function quickAddFixture({ mobile = false, add, derived = false } = {}) {
  const project = { id: other, name: 'Synthetic personal project', tasks: [], registers: {}, tracker: [] };
  const storage = { getItem: (key) => key === 'pmworkspace:todo-command-state:v1' ? '{"scope":"project","focusView":"all"}' : null, setItem() {}, removeItem() {} };
  const window = { localStorage: storage, sessionStorage: storage, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn) => setTimeout(fn, 0), matchMedia: () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }) };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  const transport = mockTransport((r) => r.table === 'projects' ? { data: [project], count: 1 } : { data: [], count: 0 });
  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Bucket = (await load('src/components/TodoBucketSection.jsx')).default;
  const Header = (await load('src/components/TodoViewHeaderControls.jsx')).default;
  const { getTodoSectionDefaultDueDate } = await load('src/utils/todoCalendarSections.js');
  const dueDate = getTodoSectionDefaultDueDate('this_week');
  if (derived) project.registers.actions = [{ _id: 'action-b', description: 'B derived task', target: dueDate, status: 'Open' }, { _id: 'action-c', description: 'C derived task', target: dueDate, status: 'Open' }];
  const existing = derived ? [] : [{ ...todo, projectId: other, dueDate, kanbanPosition: 1024, title: 'Existing first task' }, { ...todo, _id: '55555555-5555-4555-8555-555555555555', projectId: other, dueDate, kanbanPosition: 2048, title: 'Existing last task' }];
  let root; const calls = [];
  function Fixture() {
    const [todos, setTodos] = React.useState(existing);
    return React.createElement(TodoView, { todos, currentProject: project, projectData: project.tasks, registers: project.registers, tracker: project.tracker, currentUserId: owner, currentUserName: '', isExternalView: false, onUpdateTodo: async () => null, onAddTodo: async (payload) => {
      calls.push(payload);
      const saved = add ? await add(payload) : { ...payload, _id: `saved-${calls.length}`, status: 'Open', owner: 'PM' };
      if (saved) setTodos((previous) => [...previous, saved]);
      return saved;
    } });
  }
  await act(async () => { root = create(React.createElement(Fixture)); });
  const bucket = () => root.root.findAllByType(Bucket).find((item) => item.props.bucket.key === 'this_week');
  const input = () => bucket().findByType('input');
  return { root, calls, bucket, input, header: () => root.root.findByType(Header), async type(value) { await act(async () => input().props.onChange({ target: { value } })); }, async close() { await act(async () => root.unmount()); } };
}

test('weekly quick-add appends beside its composer instead of sorting above existing tasks', async () => {
  const f = await quickAddFixture();
  try {
    await f.type('De returnat adidasii');
    await act(async () => f.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }));
    assert.equal(f.calls[0].kanbanPosition, 3072);
    assert.deepEqual(Array.from(f.bucket().props.displayItems, (item) => item.title), ['Existing first task', 'Existing last task', 'De returnat adidasii']);
    assert.equal(f.input().props.value, '');
  } finally { await f.close(); }
});

test('quick-add stays last when its title shifts fallback order for derived tasks', async () => {
  const f = await quickAddFixture({ derived: true });
  try {
    await f.type('A new task');
    await act(async () => f.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }));
    assert.deepEqual(Array.from(f.bucket().props.displayItems, (item) => item.title), ['B derived task', 'C derived task', 'A new task']);
  } finally { await f.close(); }
});

test('phone quick-add retains a failed draft and retries through the Add task button', async () => {
  let fail = true;
  const f = await quickAddFixture({ mobile: true, add: async (payload) => { if (fail) throw new Error('Synthetic save failure'); return { ...payload, _id: 'saved-phone', status: 'Open' }; } });
  const addButton = () => f.bucket().findAllByType('button').find((button) => button.children.join('') === 'Add task');
  try {
    await f.type('Synthetic phone task');
    await act(async () => addButton().props.onClick());
    assert.equal(f.input().props.value, 'Synthetic phone task');
    assert.equal(f.bucket().findAll((item) => item.props.role === 'alert').length, 1);
    fail = false;
    await act(async () => addButton().props.onClick());
    assert.equal(f.bucket().props.displayItems.at(-1).title, 'Synthetic phone task');
    assert.equal(f.input().props.value, '');
  } finally { await f.close(); }
});

test('pending quick-add ignores repeated Enter and preserves the next typed draft', async () => {
  let finish;
  const f = await quickAddFixture({ add: (payload) => new Promise((resolve) => { finish = () => resolve({ ...payload, _id: 'saved-once', status: 'Open' }); }) });
  try {
    await f.type('Synthetic first task');
    let saving;
    await act(async () => { saving = f.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }); });
    await act(async () => f.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }));
    assert.equal(f.calls.length, 1);
    await f.type('Synthetic next draft');
    await act(async () => { finish(); await saving; });
    assert.equal(f.input().props.value, 'Synthetic next draft');
    assert.equal(f.bucket().props.displayItems.at(-1).title, 'Synthetic first task');
  } finally { await f.close(); }
});

test('pending quick-add survives a scope change and cannot clear a different destination draft', async () => {
  let finish;
  const f = await quickAddFixture({ add: (payload) => new Promise((resolve) => { finish = () => resolve({ ...payload, _id: 'saved-original-project', status: 'Open' }); }) });
  try {
    await f.type('Synthetic retained draft');
    let saving;
    await act(async () => { saving = f.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }); });
    await act(async () => f.header().props.onScopeChange('all'));
    await act(async () => f.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }));
    assert.equal(f.calls.length, 1);
    await act(async () => f.bucket().props.setQuickAddProjectId('other'));
    await act(async () => { finish(); await saving; });
    assert.equal(f.input().props.value, 'Synthetic retained draft');
    await act(async () => { const next = f.input().props.onKeyDown({ key: 'Enter', preventDefault() {} }); await Promise.resolve(); finish(); await next; });
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].projectId, null);
  } finally { await f.close(); }
});
test('work day and priority patches preserve each other and reject an altered acknowledgement', async () => {
  let saved = { ...preference }; let altered = false;
  const transport = mockTransport((r) => {
    if (r.operation === 'update') { saved = { ...saved, ...r.payload, version: saved.version + 1 }; return { data: [{ ...saved, ...(altered ? { manual_quadrant: 'not_urgent_important' } : {}) }] }; }
    return { data: [saved], count: 1 };
  });
  const load = await sourceModules(transport); const useMatrix = (await load('src/hooks/useTodoEisenhowerMatrix.js')).useTodoEisenhowerMatrix;
  const hook = await mountHook(useMatrix, props);
  try {
    await act(async () => assert.equal(await hook.value.planDay(todo, '2026-10-09'), true));
    assert.equal(hook.value.preferences[key].manual_quadrant, 'urgent_not_important');
    await act(async () => assert.equal(await hook.value.move(todo, 'not_urgent_not_important'), true));
    assert.equal(hook.value.preferences[key].planned_day, '2026-10-09');
    altered = true;
    await act(async () => assert.equal(await hook.value.planDay(todo, '2026-10-11'), false));
    assert.equal(hook.value.preferences[key].planned_day, '2026-10-09');
  } finally { await hook.close(); }
});
test('due-today choices persist for today and overdue restores Q1 after day rollover', async () => {
  const task = { ...todo, dueDate: props.today }; let saved = { ...preference };
  const transport = mockTransport(r => { if(r.operation === 'update')saved = {...saved,...r.payload,version:saved.version+1};return {data:[saved],count:1}; });
  const load = await sourceModules(transport);
  const hook = await mountHook((await load('src/hooks/useTodoEisenhowerMatrix.js')).useTodoEisenhowerMatrix, { ...props, todos: [task] });
  try {
    assert.equal(hook.value.groups[0].cards.length,1);
    for(const quadrant of ['not_urgent_important','urgent_not_important','not_urgent_not_important']) {
      await act(async () => assert.equal(await hook.value.move(task,quadrant),true));
      assert.equal(hook.value.groups.find(q=>q.cards.length).id,quadrant);
      assert.equal(hook.value.preferences[key].manual_quadrant_day,props.today);
    }
    await act(async () => assert.equal(await hook.value.planDay(task,'2026-10-08'),true));
    assert.equal(hook.value.preferences[key].manual_quadrant_day,props.today);
    await act(async () => hook.value.reload());
    assert.equal(hook.value.groups.find(q=>q.cards.length).id,'not_urgent_not_important');
    await hook.update({...props,todos:[task],today:'2026-10-06'});
    assert.equal(hook.value.groups[0].cards.length,1);
    assert.equal(hook.value.groups[0].cards[0].automatic,true);
    const before=transport.calls.length;
    assert.equal(await hook.value.move(task,'not_urgent_important'),false);
    assert.equal(transport.calls.length,before);
  } finally { await hook.close(); }
});

test('candidate-before-filter makes future personal selections visible in Today and excludes confirmed revoked projects', async () => {
  const project = { id: other, name: 'Synthetic project', tasks: [], registers: {}, tracker: [] };
  const load = await sourceModules(mockTransport(() => ({ data: [preference], count: 1 })));
  const { useTodoCandidateData, useTodoViewDerivedData } = await load('src/hooks/useTodoViewDerivedData.js');
  const useMatrix = (await load('src/hooks/useTodoEisenhowerMatrix.js')).useTodoEisenhowerMatrix;
  const allProps = { allProjectManualTodos: [], allProjectsData: [project], currentProject: project, projectData: [], projectOptions: [project], registers: {}, scope: 'all', todos: [todo], tracker: [], currentUserId: owner, currentUserName: '', today: props.today, bucketFilter: [], projectFilter: [], sourceFilter: [], ownerFilter: [], recurrenceFilter: [], searchQuery: '', pendingCompletedTodos: {}, focusView: 'today', isExternalView: false, sourcesConfirmed: true };
  const hook = await mountHook((p) => { const candidates = useTodoCandidateData(p); const matrix = useMatrix({ ...props, todos: candidates.mergedOpenTodos }); return useTodoViewDerivedData({ ...p, candidates, preferences: matrix.preferences }); }, allProps);
  try {
    assert.equal(hook.value.visibleOpenTodos.length, 1);
    await hook.update({ ...allProps, todos: [{ ...todo, projectId: other }], allProjectsData: [], projectData: [{ id: 1, tracked: true, name: 'Cached revoked plan', start: props.today, dur: 1 }] });
    assert.equal(hook.value.visibleOpenTodos.length, 0);
  } finally { await hook.close(); }
});
test('Tomorrow combines project deadlines and personal plans, and retains project filtering', async () => {
  const project = { id: other, name: 'Synthetic project', tasks: [], registers: {}, tracker: [] };
  const dueTomorrow = { ...todo, _id: other, projectId: other, dueDate: '2026-10-06' };
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const { useTodoCandidateData, useTodoViewDerivedData } = await load('src/hooks/useTodoViewDerivedData.js');
  const options = { allProjectManualTodos: [], allProjectsData: [project], currentProject: project, projectData: [], projectOptions: [project], registers: {}, scope: 'all', todos: [todo, dueTomorrow], tracker: [], currentUserId: owner, currentUserName: '', today: '2026-10-05', bucketFilter: [], projectFilter: [], sourceFilter: [], ownerFilter: [], recurrenceFilter: [], searchQuery: '', pendingCompletedTodos: {}, focusView: 'tomorrow', isExternalView: false, sourcesConfirmed: true, preferences: { [key]: { ...preference, planned_day: '2026-10-06' } } };
  const hook = await mountHook(p => useTodoViewDerivedData({ ...p, candidates: useTodoCandidateData(p) }), options);
  try {
    assert.equal(hook.value.focusCounts.tomorrow, 2);
    assert.deepEqual(Array.from(hook.value.visibleOpenTodos, t => t._id).sort(), [todo._id, other].sort());
    await hook.update({ ...options, projectFilter: [other] });
    assert.deepEqual(Array.from(hook.value.visibleOpenTodos, t => t._id), [other]);
    await hook.update({ ...options, allProjectsData: [], projectOptions: [] });
    assert.deepEqual(Array.from(hook.value.visibleOpenTodos, t => t._id), [todo._id]);
  } finally { await hook.close(); }
});
test('date controls sync pristine changes but retain dirty dates across delayed saves and failures', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const Controls = (await load('src/components/TaskPlanningControls.jsx')).default;
  const matrix = { ready: true, offline: false, preferences: {}, planDay: async () => false };
  const componentProps = { todo, matrix, today: props.today, onUpdateTodo: async () => null };
  let root;
  await act(async () => { root = create(React.createElement(Controls, componentProps)); });
  const deadline = () => root.root.findAllByType('input').find((n) => n.props['aria-label'].startsWith('Deadline'));
  const work = () => root.root.findAllByType('input').find((n) => n.props['aria-label'].startsWith('Personal'));
  try {
    await act(async () => root.update(React.createElement(Controls, { ...componentProps, todo: { ...todo, dueDate: '2026-11-04' }, matrix: { ...matrix, preferences: { [key]: preference } } })));
    assert.equal(deadline().props.value, '2026-11-04'); assert.equal(work().props.value, '2026-10-05');
    await act(async () => deadline().props.onChange({ target: { value: '2026-12-05' } }));
    await act(async () => root.update(React.createElement(Controls, { ...componentProps, todo: { ...todo, dueDate: '2026-11-07' } })));
    assert.equal(deadline().props.value, '2026-12-05');
    await act(async () => root.root.findAllByType('button').find((n) => n.children.includes('Reschedule deadline')).props.onClick());
    assert.equal(deadline().props.value, '2026-12-05');
    assert(root.root.findAllByProps({ role: 'status' }).some((n) => n.children.join('').includes('not confirmed')));
  } finally { await act(async () => root.unmount()); }
});
test('source navigation refuses late/stale owner responses and preserves the request on success', async () => {
  let finish; const gate = new Promise((resolve) => { finish = resolve; });
  const transport = mockTransport(() => gate); const load = await sourceModules(transport);
  const useNav = (await load('src/hooks/useTodoSourceNavigation.js')).useTodoSourceNavigation;
  const selected = []; const select = (project) => selected.push(project);
  const hook = await mountHook((p) => useNav(p.owner, select), { owner });
  const derived = { ...todo, isDerived: true, projectId: other, originType: 'schedule', originTaskId: 1 };
  try {
    let opening; const stale = hook.value.openSource;
    await act(async () => { opening = stale(derived); });
    await hook.update({ owner: other });
    await act(async () => { finish({ data: { id: other, name: 'Synthetic source project' } }); await opening; });
    assert.equal(selected.length, 0); assert.equal(hook.value.request, null);
    assert.equal(await stale(derived), false);
    assert.equal(transport.calls.length, 1);
    await act(async () => assert.equal(await hook.value.openSource(derived), true));
    assert.equal(selected.length, 1); assert.equal(hook.value.request.projectId, other); assert.equal(hook.value.request.ownerId, other);
  } finally { await hook.close(); }
});

test('source navigation rechecks live save state after a delayed project lookup', async () => {
  let finish; const pending = new Promise((resolve) => { finish = resolve; });
  const load = await sourceModules(mockTransport(() => pending));
  const useNav = (await load('src/hooks/useTodoSourceNavigation.js')).useTodoSourceNavigation;
  let canLeave = true; const selected = [];
  const hook = await mountHook(() => useNav(owner, (project) => selected.push(project)), {});
  try {
    let opening;
    await act(async () => { opening = hook.value.openSource({ ...todo, isDerived: true, projectId: other }, { canLeave: () => canLeave }); });
    canLeave = false;
    await act(async () => { finish({ data: { id: other, name: 'Synthetic other project' } }); await opening; });
    assert.equal(selected.length, 0); assert.equal(hook.value.request, null);
    assert.match(hook.value.error, /unsaved edits/);
  } finally { await hook.close(); }
});

test('confirmed-only manual rescheduling refuses offline/fallback/wrong-row responses', async () => {
  const date = '2026-12-05'; let response = { data: { id: other, due_date: date, status: 'Open' } };
  const transport = mockTransport(() => response);
  const load = await sourceModules(transport, { window: { clearTimeout, setTimeout } });
  const useTodos = (await load('src/hooks/projectData/useProjectTodos.js')).useProjectTodos;
  const args = { userId: owner, projectId: other, isOnline: false, now: () => '2026-10-05T00:00:00Z', setLastSaved() {}, setOfflinePendingSync() {}, setUsingOfflineSnapshot() {} };
  const hook = await mountHook(useTodos, args);
  try {
    assert.equal(await hook.value.updateTodo(todo._id, 'dueDate', date, todo, { requireConfirmation: true }), null);
    assert.equal(transport.calls.length, 0);
    await hook.update({ ...args, isOnline: true });
    await act(async () => assert.equal(await hook.value.updateTodo(todo._id, 'dueDate', date, todo, { requireConfirmation: true }), null));
    response = { error: { message: 'relation manual_todos does not exist' } };
    await act(async () => assert.equal(await hook.value.updateTodo(todo._id, 'dueDate', date, todo, { requireConfirmation: true }), null));
    assert.equal(hook.value.todos.length, 0);
  } finally { await hook.close(); }
});

test('a delayed all-project refresh cannot restore a cross-project deadline already saved', async () => {
  const sourceId = '55555555-5555-4555-8555-555555555555';
  const projects = [{ id: other, name: 'Synthetic current', tasks: [], registers: {}, tracker: [] }, { id: sourceId, name: 'Synthetic other', tasks: [], registers: {}, tracker: [] }];
  let rows = [{ id: todo._id, project_id: sourceId, title: todo.title, due_date: '2020-01-01', status: 'Open' }];
  let hold = false; let finish; let deferred;
  const transport = mockTransport((r) => {
    if (r.table === 'projects') return { data: projects, count: 2 };
    if (r.table === 'manual_todos') {
      if (hold) { hold = false; const captured = structuredClone(rows); deferred = new Promise((resolve) => { finish = () => resolve({ data: captured, count: 1 }); }); return deferred; }
      return { data: rows, count: rows.length };
    }
    return { data: [], count: 0 };
  });
  const storage = { getItem: (key) => key === 'pmworkspace:todo-view-mode:v1' ? '{"mode":"matrix"}' : null, setItem() {}, removeItem() {} };
  const window = { localStorage: storage, sessionStorage: storage, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  let root;
  await act(async () => { root = create(React.createElement(TodoView, { todos: [], currentProject: projects[0], projectData: [], registers: {}, tracker: [], currentUserId: owner, currentUserName: '', isExternalView: false, onCompleteTodo: async () => {}, onUpdateTodo: async (id, field, value, original) => { rows = [{ ...rows[0], due_date: value }]; return { updatedTodo: { ...original, dueDate: value }, confirmed: true }; } })); });
  try {
    assert.equal(root.root.findAllByType('article').length, 1);
    hold = true;
    await act(async () => root.root.findAllByType('button').find((node) => node.children.includes('Refresh tasks')).props.onClick());
    assert.ok(finish);
    await act(async () => root.root.findAllByType('input').find((node) => node.props['aria-label']?.startsWith('Deadline')).props.onChange({ target: { value: '2099-11-01' } }));
    await act(async () => root.root.findAllByType('button').find((node) => node.children.includes('Reschedule deadline')).props.onClick());
    assert.equal(root.root.findAllByType('article').length, 0);
    await act(async () => { finish(); await deferred; });
    assert.equal(root.root.findAllByType('article').length, 0);
  } finally { await act(async () => root.unmount()); }
});

test('opened task details retain both dirty dates across phone/desktop layout changes and clear them on account change', async () => {
  const project = { id: other, name: 'Synthetic project', tasks: [], registers: {}, tracker: [] };
  const manual = { ...todo, projectId: other, dueDate: '2020-01-01' };
  const mediaListeners = new Set();
  const media = { matches: true, addEventListener(_event, fn) { mediaListeners.add(fn); }, removeEventListener(_event, fn) { mediaListeners.delete(fn); } };
  const storage = { getItem: (key) => key === 'pmworkspace:todo-view-mode:v1' ? '{"mode":"matrix"}' : null, setItem() {}, removeItem() {} };
  const window = { localStorage: storage, sessionStorage: storage, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout, matchMedia: () => media };
  const document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  let confirmDate; const dateWrite = new Promise((resolve) => { confirmDate = resolve; });
  let confirmWork; const workWrite = new Promise((resolve) => { confirmWork = resolve; });
  let savedPreference = { ...preference };
  const transport = mockTransport((r) => r.table === 'projects' ? { data: [project], count: 1 } : r.table === 'manual_todos' ? { data: [{ id: todo._id, project_id: other, title: todo.title, due_date: manual.dueDate, status: 'Open' }], count: 1 } : r.table === 'task_eisenhower_preferences' ? r.operation === 'update' ? workWrite.then(() => { savedPreference = { ...savedPreference, ...r.payload, version: savedPreference.version + 1 }; return { data: [savedPreference] }; }) : { data: [savedPreference], count: 1 } : { data: [], count: 0 });
  const load = await sourceModules(transport, { window, document, navigator: { onLine: true } });
  const TodoView = (await load('src/components/TodoView.jsx')).default;
  const Matrix = (await load('src/components/TodoEisenhowerMatrix.jsx')).default;
  const Dialog = (await load('src/components/TodoDetailDialog.jsx')).default;
  const input = (component, prefix) => root.root.findByType(component).findAllByType('input').find((node) => node.props['aria-label']?.startsWith(prefix));
  const componentProps = { todos: [manual], currentProject: project, projectData: [], registers: {}, tracker: [], currentUserId: owner, currentUserName: '', isExternalView: false, onCompleteTodo: async () => {}, onUpdateTodo: async (_id, field, value, original) => { await dateWrite; return { confirmed: true, updatedTodo: { ...original, [field]: value } }; } };
  let root;
  await act(async () => { root = create(React.createElement(TodoView, componentProps)); });
  try {
    await act(async () => { const matrix = root.root.findByType(Matrix); matrix.props.onOpenTodo(matrix.props.matrix.groups[0].cards[0].todo); });
    await act(async () => input(Dialog, 'Deadline').props.onChange({ target: { value: '2099-12-03' } }));
    await act(async () => input(Dialog, 'Personal').props.onChange({ target: { value: '2099-12-07' } }));
    await act(async () => root.root.findByType(Dialog).findAllByType('button').find((node) => node.children.includes('Reschedule deadline')).props.onClick());
    await act(async () => { media.matches = false; [...mediaListeners].forEach((fn) => fn({ matches: false })); });
    assert.equal(input(Dialog, 'Deadline').props.value, '2099-12-03'); assert.equal(input(Dialog, 'Personal').props.value, '2099-12-07');
    await act(async () => input(Dialog, 'Deadline').props.onChange({ target: { value: '2099-12-09' } }));
    assert.equal(root.root.findByType(Dialog).findAllByType('button').find((node) => node.children.includes('Reschedule deadline')).props.disabled, true);
    await act(async () => { confirmDate(); await dateWrite; });
    assert.equal(input(Dialog, 'Deadline').props.value, '2099-12-09');
    await act(async () => root.root.findByType(Dialog).findAllByType('button').find((node) => node.children.includes('Save personal day')).props.onClick());
    await act(async () => { media.matches = true; [...mediaListeners].forEach((fn) => fn({ matches: true })); });
    assert.equal(input(Dialog, 'Deadline').props.value, '2099-12-09'); assert.equal(input(Dialog, 'Personal').props.value, '2099-12-07');
    await act(async () => input(Dialog, 'Personal').props.onChange({ target: { value: '2099-12-11' } }));
    await act(async () => { confirmWork(); await workWrite; });
    assert.equal(input(Dialog, 'Personal').props.value, '2099-12-11'); assert.equal(input(Dialog, 'Deadline').props.value, '2099-12-09');
    await act(async () => root.update(React.createElement(TodoView, { ...componentProps, currentUserId: other })));
    assert.equal(root.root.findAllByType(Dialog).length, 0);
  } finally { await act(async () => root.unmount()); }
});

test('project navigation can detect unsaved plan edits before the debounced save begins', async () => {
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const window = { localStorage: storage, sessionStorage: storage, setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {} };
  const transport = mockTransport(() => ({ data: { tasks: [{ id: 1, name: 'Original task', start: '2026-10-05', dur: 1 }], registers: {}, tracker: [], baseline: null, status_report: {}, version: 1 }, error: null }));
  const load = await sourceModules(transport, { window, navigator: { onLine: true } });
  const usePersistence = (await load('src/hooks/projectData/useProjectPersistence.js')).useProjectPersistence;
  const noop = () => {}; const now = () => '2026-10-05T00:00:00Z'; const loadTodos = async () => [];
  const empty = []; const todoQueueRef = { current: empty };
  const hook = await mountHook(() => {
    const [projectData, setProjectData] = React.useState([]);
    const [registers, setRegisters] = React.useState({});
    const [tracker, setTracker] = React.useState([]);
    const [baseline, setBaselineState] = React.useState(null);
    const [statusReport, setStatusReport] = React.useState({});
    const state = usePersistence({ baseline, isOnline: true, loadTodos, now, projectData, projectId: other, registers, setBaselineState, setLastSaved: noop, setOfflinePendingSync: noop, setProjectData, setRegisters, setStatusReport, setTodoQueue: noop, setTodos: noop, setTracker, setUsingOfflineSnapshot: noop, statusReport, todoQueue: empty, todoQueueRef, todos: empty, tracker, userId: owner });
    return { ...state, edit: () => setProjectData((rows) => rows.map((row) => ({ ...row, name: 'Unsaved new name' }))) };
  }, {});
  try {
    assert.equal(hook.value.hasPendingProjectSave, false);
    await act(async () => hook.value.edit());
    assert.equal(hook.value.hasPendingProjectSave, true);
    assert.equal(hook.value.saving, false);
  } finally { await hook.close(); }
});
