import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mountHook, mockTransport, sourceModules } from './react-source-runtime.mjs';
const owner = '11111111-1111-4111-8111-111111111111', id = '22222222-2222-4222-8222-222222222222';
const todo = { _id: id, title: 'Synthetic Return trainers', status: 'Open', projectName: 'Personal', dueDate: '2026-10-13' };
const key = `manual:${id}`;
const row = { id, user_id: owner, task_key: key, manual_quadrant: 'urgent_not_important', planned_day: '2026-10-13', planned_start_minute: null, planned_duration_minutes: null, version: 1 };
const props = { currentUserId: owner, enabled: true, isExternalView: false, calendarEnabled: true, todos: [todo], today: '2026-10-14' };
async function fixture() {
  let saved = { ...row }, fail = false, alter = false;
  const transport = mockTransport(request => {
    if (request.select === 'planned_start_minute,planned_duration_minutes') return { data: [] };
    if (request.operation === 'update') {
      if (fail) return { error: { message: 'Synthetic failure' } };
      if (request.filters.some(filter => filter.args[0] === 'version' && filter.args[1] !== saved.version)) return { data: [] };
      saved = { ...saved, ...request.payload, version: saved.version + 1 };
      if (!saved.planned_day) { saved.planned_start_minute = null; saved.planned_duration_minutes = null; }
      return { data: [{ ...saved, ...(alter ? { planned_duration_minutes: 90 } : {}) }] };
    }
    return { data: [saved], count: 1 };
  });
  const load = await sourceModules(transport);
  const hook = await mountHook((await load('src/hooks/useTodoEisenhowerMatrix.js')).useTodoEisenhowerMatrix, props);
  return { hook, load, transport, get saved() { return saved; }, change: patch => { saved = { ...saved, ...patch }; }, fail: value => { fail = value; }, alter: value => { alter = value; } };
}
test('Calendar atomically plans Wednesday, preserves Tuesday deadline and priority, reloads, moves days and clears timing', async () => {
  const f = await fixture();
  try {
    assert.equal(f.hook.value.calendarReady, true);
    await act(async () => assert.equal(await f.hook.value.planSlot(todo, { day: '2026-10-14', start: 600, duration: 60 }), true));
    assert.equal(f.saved.planned_day, '2026-10-14'); assert.equal(f.saved.planned_start_minute, 600); assert.equal(todo.dueDate, '2026-10-13'); assert.equal(f.saved.manual_quadrant, row.manual_quadrant);
    await act(async () => f.hook.value.reload());
    assert.equal(f.hook.value.preferences[key].planned_duration_minutes, 60);
    await act(async () => assert.equal(await f.hook.value.planDay(todo, '2026-10-15'), true));
    assert.equal(f.saved.planned_start_minute, 600);
    await act(async () => assert.equal(await f.hook.value.planSlot(todo, { day: '2026-10-15', start: null, duration: null }), true));
    assert.equal(f.saved.planned_day, '2026-10-15'); assert.equal(f.saved.planned_start_minute, null);
    await act(async () => f.hook.value.planSlot(todo, { day: '2026-10-15', start: 660, duration: 30 }));
    await act(async () => assert.equal(await f.hook.value.planDay(todo, null), true));
    assert.equal(f.saved.planned_start_minute, null); assert.equal(f.saved.planned_duration_minutes, null);
    assert.ok(f.transport.calls.filter(r => r.operation !== 'select').every(r => r.table === 'task_eisenhower_preferences'));
  } finally { await f.hook.close(); }
});
test('same-day timing changes cannot falsely reconcile stale intent; exact lost acknowledgement can reconcile', async () => {
  const f = await fixture();
  try {
    const { preferenceSnapshot } = await f.load('src/utils/todoCalendar.js');
    const expected = preferenceSnapshot(f.saved);
    f.change({ planned_start_minute: 660, planned_duration_minutes: 60, version: 2 });
    await act(async () => f.hook.value.reload());
    await act(async () => assert.equal(await f.hook.value.planDay(todo, '2026-10-13', expected), false));
    const writes = f.transport.calls.filter(r => r.operation === 'update').length;
    await act(async () => assert.equal(await f.hook.value.planSlot(todo, { day: '2026-10-13', start: 600, duration: 30 }, expected), false));
    assert.equal(f.transport.calls.filter(r => r.operation === 'update').length, writes);
    await act(async () => assert.equal(await f.hook.value.planSlot(todo, { day: '2026-10-13', start: 660, duration: 60 }, expected), true));
    assert.equal(f.transport.calls.filter(r => r.operation === 'update').length, writes);
  } finally { await f.hook.close(); }
});
test('failed writes retain choices and altered acknowledgements require a fresh read of the actual saved timing', async () => {
  const f = await fixture();
  try {
    f.fail(true);
    await act(async () => assert.equal(await f.hook.value.planSlot(todo, { day: '2026-10-14', start: 600, duration: 30 }), false));
    assert.equal(f.hook.value.preferences[key].planned_day, '2026-10-13');
    f.fail(false); f.alter(true);
    await act(async () => assert.equal(await f.hook.value.planSlot(todo, { day: '2026-10-14', start: 600, duration: 30 }), false));
    assert.equal(f.hook.value.preferences[key].planned_start_minute, 600);
    assert.equal(f.hook.value.preferences[key].planned_duration_minutes, 30, 'Fresh read confirms actual saved timing, never the altered duration');
  } finally { await f.hook.close(); }
});
test('missing Calendar columns disable time writes without blocking ordinary personal-day writes', async () => {
  let saved = { ...row };
  const transport = mockTransport(r => r.select === 'planned_start_minute,planned_duration_minutes' ? { error: { code: '42703' } } : r.operation === 'update' ? { data: [saved = { ...saved, ...r.payload, version: saved.version + 1 }] } : { data: [saved], count: 1 });
  const load = await sourceModules(transport), hook = await mountHook((await load('src/hooks/useTodoEisenhowerMatrix.js')).useTodoEisenhowerMatrix, props);
  try {
    assert.equal(hook.value.ready, true); assert.equal(hook.value.calendarReady, false);
    assert.match(hook.value.calendarError, /database update/);
    assert.equal(await hook.value.planSlot(todo, { day: '2026-10-14', start: 600, duration: 30 }), false);
    await act(async () => assert.equal(await hook.value.planDay(todo, null), true));
    assert.deepEqual(transport.calls.find(r => r.operation === 'update').payload, { planned_day: null });
  } finally { await hook.close(); }
});
test('selected-day pool, hidden clash warning, retained failed editor, phone controls and Remove time preserve personal day', async () => {
  const f = await fixture(), { calendarEntries } = await f.load('src/utils/todoCalendar.js');
  const Calendar = (await f.load('src/components/TodoCalendarView.jsx')).default;
  let root, selection = '2026-10-13';
  const hidden = { ...todo, _id: '33333333-3333-4333-8333-333333333333', title: 'Filtered task' };
  const all = () => calendarEntries([todo, hidden], { ...f.hook.value.preferences, [`manual:${hidden._id}`]: { planned_day: '2026-10-13', planned_start_minute: 600, planned_duration_minutes: 30 } });
  const componentProps = () => ({ owner, today: props.today, selectedDay: selection, onSelectDay: day => { selection = day; }, entries: calendarEntries([todo], f.hook.value.preferences), allEntries: all(), plan: f.hook.value, isMobile: false, onOpenTodo() {}, isLocked: () => false, onPlanSlot: (...args) => f.hook.value.planSlot(...args), handleCompleteTodo() {} });
  const button = text => root.root.findAllByType('button').find(node => node.children.includes(text));
  const open = () => root.root.findAllByType('button').find(node => node.props.className === 'task-calendar-pool-task');
  const editor = () => root.root.findByProps({ role: 'dialog' });
  const input = type => editor().findByProps({ type });
  try {
    await act(async () => { root = create(React.createElement(Calendar, componentProps())); });
    await act(async () => open().props.onClick());
    assert.equal(button('Remove time').props.disabled, true);
    await act(async () => input('date').props.onChange({ target: { value: '2026-10-14' } }));
    f.fail(true);
    await act(async () => editor().findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(input('date').props.value, '2026-10-14'); assert.equal(f.hook.value.preferences[key].planned_day, '2026-10-13');
    await act(async () => button('Close').props.onClick());
    await act(async () => root.update(React.createElement(Calendar, { ...componentProps(), enabled: false })));
    await act(async () => root.update(React.createElement(Calendar, { ...componentProps(), isMobile: true })));
    await act(async () => open().props.onClick()); assert.equal(input('date').props.value, '2026-10-14');
    f.fail(false);
    await act(async () => editor().findByType('form').props.onSubmit({ preventDefault() {} }));
    await act(async () => root.update(React.createElement(Calendar, { ...componentProps(), isMobile: true })));
    assert.equal(selection, '2026-10-14'); assert.equal(f.saved.planned_start_minute, 600);
    selection = '2026-10-13'; await act(async () => f.hook.value.planDay(todo, selection));
    await act(async () => root.update(React.createElement(Calendar, componentProps())));
    assert.ok(root.root.findAllByProps({ className: 'task-calendar-clash' }).length);
    await act(async () => open().props.onClick());
    await act(async () => input('date').props.onChange({ target: { value: '2026-10-18' } }));
    await act(async () => button('Remove time').props.onClick());
    assert.equal(f.saved.planned_day, '2026-10-13'); assert.equal(f.saved.planned_start_minute, null);
  } finally { if (root) await act(async () => root.unmount()); await f.hook.close(); }
});

test('late timing acknowledgement cannot populate a replacement account', async () => {
  const other = '33333333-3333-4333-8333-333333333333';
  let finish; const reply = new Promise(resolve => { finish = resolve; });
  const transport = mockTransport(r => {
    if (r.select === 'planned_start_minute,planned_duration_minutes') return { data: [] };
    if (r.operation === 'update') return reply;
    const user = r.filters.find(filter => filter.args[0] === 'user_id').args[1];
    return { data: [{ ...row, user_id: user }], count: 1 };
  });
  const load = await sourceModules(transport), hook = await mountHook((await load('src/hooks/useTodoEisenhowerMatrix.js')).useTodoEisenhowerMatrix, props);
  try {
    let saving;
    await act(async () => { saving = hook.value.planSlot(todo, { day: '2026-10-14', start: 600, duration: 30 }); });
    await hook.update({ ...props, currentUserId: other });
    await act(async () => { finish({ data: [{ ...row, version: 2, planned_day: '2026-10-14', planned_start_minute: 600, planned_duration_minutes: 30 }] }); assert.equal(await saving, false); });
    assert.equal(hook.value.preferences[key].user_id, other); assert.equal(hook.value.preferences[key].planned_start_minute, null);
  } finally { await hook.close(); }
});

test('drag and resize keep gesture-start versions when a newer Calendar edit arrives', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const Calendar = (await load('src/components/TodoCalendarView.jsx')).default;
  const { calendarEntries } = await load('src/utils/todoCalendar.js');
  const old = { ...row, planned_start_minute: 600, planned_duration_minutes: 30 };
  const entries = calendarEntries([todo], { [key]: old }), calls = [];
  const componentProps = { owner, selectedDay: '2026-10-13', today: props.today, entries, allEntries: entries, plan: { ready: true, calendarReady: true, preferences: { [key]: old }, pending: {} }, isMobile: false, onSelectDay() {}, onOpenTodo() {}, isLocked: () => false, handleCompleteTodo() {}, onPlanSlot: async (...args) => { calls.push(args); return true; } };
  let root; await act(async () => { root = create(React.createElement(Calendar, componentProps)); });
  try {
    const pool = () => root.root.findAllByType('button').find(node => node.props.className === 'task-calendar-pool-task');
    await act(async () => pool().props.onDragStart({ preventDefault() {}, dataTransfer: { setData() {} } }));
    await act(async () => root.update(React.createElement(Calendar, { ...componentProps, plan: { ...componentProps.plan, preferences: { [key]: { ...old, version: 2, planned_start_minute: 660 } } } })));
    const wednesday = root.root.findByProps({ 'data-calendar-day': '2026-10-14' });
    await act(async () => wednesday.props.onDrop({ preventDefault() {}, clientY: 300, currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 1020 }) } }));
    assert.equal(calls[0][1].day, '2026-10-14'); assert.equal(calls[0][1].start, 660); assert.equal(calls[0][2].version, 1); assert.equal(todo.dueDate, '2026-10-13');
    await act(async () => root.update(React.createElement(Calendar, componentProps)));
    const resize = () => root.root.findByProps({ 'aria-label': `Resize ${todo.title}` });
    const pointer = { isPrimary: true, button: 0, pointerId: 4, clientY: 0, preventDefault() {}, stopPropagation() {}, currentTarget: { setPointerCapture() {}, closest: () => ({ getBoundingClientRect: () => ({ height: 1020 }) }) } };
    await act(async () => resize().props.onPointerDown(pointer));
    await act(async () => root.update(React.createElement(Calendar, { ...componentProps, plan: { ...componentProps.plan, preferences: { [key]: { ...old, version: 2, planned_start_minute: 660 } } } })));
    await act(async () => resize().props.onPointerMove({ ...pointer, clientY: 30 }));
    await act(async () => resize().props.onPointerUp({ ...pointer, clientY: 30 }));
    assert.equal(calls[1][1].duration, 60); assert.equal(calls[1][1].start, 600); assert.equal(calls[1][2].version, 1);
  } finally { await act(async () => root.unmount()); }
});
