import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mountHook, mockTransport, sourceModules } from './react-source-runtime.mjs';
const owner = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const todo = { _id: id, projectId: null, title: 'Synthetic task', status: 'Open', updatedAt: '2026-10-07T09:00:00Z', description: 'Keep notes', dueDate: '2026-10-11' };
const projects = [{ id: projectId, name: 'Synthetic IKO project' }];
async function fixture(save) {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const Assignment = (await load('src/components/TaskProjectAssignment.jsx')).default;
  let root; let saved = todo; const calls = [];
  function Parent() {
    const [task, setTask] = React.useState(todo);
    return React.createElement(Assignment, { todo: task, projects, canEdit: true, onUpdateTodo: async (...args) => {
      calls.push(args); const result = await save(...args);
      if (result?.confirmed) { saved = result.updatedTodo; setTask(saved); }
      return result;
    } });
  }
  await act(async () => { root = create(React.createElement(Parent)); });
  return { root, calls, Assignment, get saved() { return saved; }, select: () => root.root.findByType('select'), button: () => root.root.findByType('button'), async choose() { await act(async () => root.root.findByType('select').props.onChange({ target: { value: projectId } })); }, async close() { await act(async () => root.unmount()); } };
}
test('Save project persists an Other task without creating a Project Plan row', async () => {
  const f = await fixture(async (_id, _key, value) => ({ confirmed: true, updatedTodo: { ...todo, projectId: value } }));
  try {
    await f.choose(); assert.equal(f.calls.length, 0);
    await act(async () => f.button().props.onClick());
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1], 'projectId'); assert.equal(f.calls[0][3].requireConfirmation, true);
    assert.equal(f.saved.projectId, projectId); assert.equal(f.saved.description, todo.description); assert.equal(f.saved.dueDate, todo.dueDate);
    assert.equal(f.button().props.disabled, true); assert.match(f.root.root.findByProps({ role: 'status' }).children.join(''), /Project saved: Synthetic IKO project/);
    await act(async () => f.root.update(React.createElement(f.Assignment, { todo: f.saved, projects, canEdit: true, onUpdateTodo: async () => null })));
    assert.equal(f.select().props.value, projectId);
  } finally { await f.close(); }
});
test('failed or unconfirmed project saves retain the selected destination and show retry guidance', async () => {
  for (const result of [null, { confirmed: false, updatedTodo: { ...todo, projectId } }, { confirmed: true, updatedTodo: { ...todo, projectId: null } }]) {
    const f = await fixture(async () => result);
    try { await f.choose(); await act(async () => f.button().props.onClick()); assert.equal(f.select().props.value, projectId); assert.ok(f.root.root.findByProps({ role: 'alert' })); assert.equal(f.button().props.disabled, false); }
    finally { await f.close(); }
  }
});
test('pending Save project submits once and ignores an acknowledgement after editor close', async () => {
  let finish;
  const f = await fixture(() => new Promise((resolve) => { finish = resolve; }));
  await f.choose(); let saving;
  await act(async () => { saving = f.button().props.onClick(); });
  await act(async () => f.button().props.onClick()); assert.equal(f.calls.length, 1); assert.equal(f.select().props.disabled, true);
  await f.close(); await act(async () => { finish({ confirmed: true, updatedTodo: { ...todo, projectId } }); await saving; });
});
test('completed, derived and plan-linked tasks cannot change project through assignment', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const Assignment = (await load('src/components/TaskProjectAssignment.jsx')).default;
  for (const task of [{ ...todo, status: 'Done' }, { ...todo, isDerived: true }, { ...todo, planLink: { projectId } }]) {
    let root; await act(async () => { root = create(React.createElement(Assignment, { todo: task, projects, canEdit: true })); });
    assert.equal(root.root.findAllByType('select').length, 0); await act(async () => root.unmount());
  }
});
test('actual update hook confirms destination, clears old board column and refuses offline or stale saves', async () => {
  let response = { data: { id, project_id: projectId, title: todo.title, description: todo.description, due_date: todo.dueDate, status: 'Open', kanban_column_id: null } };
  const transport = mockTransport(() => response);
  const load = await sourceModules(transport, { window: { setTimeout, clearTimeout } });
  const hook = await mountHook((await load('src/hooks/projectData/useProjectTodos.js')).useProjectTodos, { userId: owner, projectId, isOnline: true, now: () => '2026-10-07T10:00:00Z', setOfflinePendingSync() {} });
  try {
    let result; await act(async () => { result = await hook.value.updateTodo(id, 'projectId', projectId, todo, { requireConfirmation: true }); });
    assert.equal(result.confirmed, true); assert.equal(result.updatedTodo.projectId, projectId);
    assert.equal(transport.calls[0].payload.kanban_column_id, null);
    assert.ok(transport.calls[0].filters.some((f) => f.method === 'is' && f.args[0] === 'project_id' && f.args[1] === null));
    assert.ok(transport.calls[0].filters.some((f) => f.args[0] === 'updated_at' && f.args[1] === todo.updatedAt));
    response = { data: { id, project_id: null } }; assert.equal(await hook.value.updateTodo(id, 'projectId', projectId, todo, { requireConfirmation: true }), null);
    response = { data: null, error: { code: 'PGRST116', message: 'Stale task' } }; assert.equal(await hook.value.updateTodo(id, 'projectId', projectId, todo, { requireConfirmation: true }), null);
    await hook.update({ userId: owner, projectId, isOnline: false, now: () => '', setOfflinePendingSync() {} });
    const before = transport.calls.length; assert.equal(await hook.value.updateTodo(id, 'projectId', projectId, todo, { requireConfirmation: true }), null); assert.equal(transport.calls.length, before);
  } finally { await hook.close(); }
});
