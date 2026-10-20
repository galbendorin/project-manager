import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mountHook, mockTransport, sourceModules } from './react-source-runtime.mjs';
const user = '11111111-1111-4111-8111-111111111111', baby = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333';
const date = '2026-10-20';

test('care dialog traps focus when it opens busy and controls later become available', async () => {
  const listeners = new Map(), original = { focus() { doc.activeElement = original; } };
  const doc = { activeElement: original, body: { style: { overflow: 'auto' } }, addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name) };
  let targets = [], closed = 0, tree;
  const panel = { querySelector: () => targets[0], querySelectorAll: () => targets, focus() { doc.activeElement = panel; } };
  const first = { focus() { doc.activeElement = first; } }, last = { focus() { doc.activeElement = last; } };
  const load = await sourceModules(mockTransport(async () => ({ data: [] })), { document: doc });
  const { default: CareDialog } = await load('src/components/baby/CareDialog.jsx');
  const props = { title: 'Busy form', busy: true, onClose: () => { closed += 1; } };
  await act(async () => { tree = create(React.createElement(CareDialog, props), { createNodeMock: element => element.props.role === 'dialog' ? panel : null }); });
  try {
    assert.equal(doc.activeElement, panel);
    listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
    assert.equal(closed, 0);
    targets = [first, last];
    await act(async () => tree.update(React.createElement(CareDialog, { ...props, busy: false })));
    doc.activeElement = original;
    let prevented = false;
    listeners.get('keydown')({ key: 'Tab', preventDefault() { prevented = true; } });
    assert.equal(prevented, true); assert.equal(doc.activeElement, first);
    listeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() {} });
    assert.equal(doc.activeElement, last);
    listeners.get('keydown')({ key: 'Escape', preventDefault() {} });
    assert.equal(closed, 1);
  } finally { await act(async () => tree.unmount()); }
  assert.equal(doc.activeElement, original); assert.equal(doc.body.style.overflow, 'auto');
});

test('care pop-ups keep entered values after failure, block duplicate saves and retry the same payload', async () => {
  const load = await sourceModules(mockTransport(async () => ({ data: [] })));
  const forms = await load('src/components/BabyView.jsx');
  for (const [name, field, value] of [['FeedModal','textarea','Feed note'], ['WeightModal','input','7.25'], ['NappyModal','textarea','Nappy note']]) {
    let tree, finish, fail = true;
    const calls = [];
    const onSave = payload => { calls.push(payload); return new Promise((resolve, reject) => { finish = () => fail ? reject(new Error('Synthetic save failure.')) : resolve(); }); };
    await act(async () => { tree = create(React.createElement(forms[name], { dateKey: date, saving: false, onSave, onClose() {} })); });
    try {
      const target = () => name === 'WeightModal' ? tree.root.findAllByType('input').find(input => input.props.type === 'number') : tree.root.findByType(field);
      await act(async () => target().props.onChange({ target: { value } }));
      const submit = () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} });
      await act(async () => { submit(); submit(); });
      assert.equal(calls.length, 1, name);
      assert.equal(tree.root.findByType('fieldset').props.disabled, true);
      assert.equal(tree.root.findAllByType('button').find(button => button.children.includes('Close')).props.disabled, true);
      await act(async () => { finish(); });
      assert.match(tree.root.findByProps({ role: 'alert' }).children.join(''), /Your entries are kept/);
      assert.equal(target().props.value, value);
      fail = false;
      await act(async () => submit());
      await act(async () => finish());
      assert.deepEqual(calls[1], calls[0]);
      assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0);
    } finally { await act(async () => tree.unmount()); }
  }
});

test('feed presets and native time input survive note changes without changing the captured date', async () => {
  const load = await sourceModules(mockTransport(async () => ({ data: [] })));
  const { FeedModal } = await load('src/components/BabyView.jsx');
  let tree, payload;
  await act(async () => { tree = create(React.createElement(FeedModal, { dateKey: date, feed: { breastSide: 'left', durationMinutes: 20 }, saving: false, onClose() {}, onSave: async value => { payload = value; } })); });
  try {
    await act(async () => tree.root.findAllByType('input').find(input => input.props.type === 'time').props.onInput({ target: { value: '16:07' } }));
    await act(async () => tree.root.findByType('textarea').props.onChange({ target: { value: 'Settled well.' } }));
    await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(payload.time, '16:07');
    assert.equal(payload.feedType, 'breastfeeding');
    assert.equal(payload.breastSide, 'left');
    assert.equal(payload.durationMinutes, 20);
    assert.equal(tree.root.findAllByType('input').find(input => input.props.disabled).props.value, date);
  } finally { await act(async () => tree.unmount()); }
});
const draft = { id, sleepDate: date, startMinute: 967, endMinute: 1003, notes: 'Woke during a journey.' };
async function fixture(initialRows = []) {
  const rows = new Map(initialRows.map(row => [row.id,row]));
  const options = { fail: false, lost: false, altered: false, deferred: false, missing: false, deferRead: false };
  let finish, finishRead;
  const transport = mockTransport(async request => {
    if (request.table !== 'baby_sleep_entries') throw new Error('Exact entries must never write the grid');
    if (options.missing) return { error: { code: '42P01', message: 'missing relation' } };
    if (request.operation !== 'select') {
      if (options.fail) return { error: { message: 'Synthetic offline failure' } };
      const previous = rows.get(request.payload.id);
      if (request.operation === 'insert' && previous) return { error: { code: '23505', message: 'duplicate' } };
      if (request.operation === 'update' && (!previous || request.filters.some(f => f.args[0] === 'version' && f.args[1] !== previous.version))) return { data: null };
      const saved = { ...previous, ...request.payload, version: (previous?.version || 0) + 1, updated_at: '2026-10-20T12:00:00+00:00' };
      if (saved.archived_at) saved.archived_at = saved.archived_at.replace('Z','+00:00');
      rows.set(saved.id,saved);
      if (options.deferred) await new Promise(resolve => { finish = resolve; });
      if (options.lost) return { error: { message: 'Synthetic lost acknowledgement' } };
      return { data: options.altered ? { ...saved, notes: 'altered response' } : saved };
    }
    const matches = [...rows.values()].filter(row => request.filters.every(({method,args:[key,value]}) => method === 'eq' ? row[key] === value : method === 'gte' ? row[key] >= value : method === 'lte' ? row[key] <= value : method === 'is' ? row[key] == null : true));
    const data = request.single ? matches[0] || null : request.range ? matches.slice(request.range[0],request.range[1]+1) : matches;
    if (options.deferRead) { options.deferRead = false; await new Promise(resolve => { finishRead = () => resolve(); }); }
    return { data };
  });
  const load = await sourceModules(transport);
  const { useBabySleepEntries } = await load('src/hooks/useBabySleepEntries.js');
  const props = { currentUserId: user, babyId: baby, startDate: date, endDate: date };
  const hook = await mountHook(useBabySleepEntries, props);
  return { hook, props, transport, rows, options, finish: () => finish(), finishRead: () => finishRead(), load };
}
test('exact time and note save together, reload under the same baby and never write coarse grid records', async () => {
  const f = await fixture();
  try {
    await act(async () => f.hook.value.save(draft));
    assert.equal(f.hook.value.entries[0].endMinute-f.hook.value.entries[0].startMinute,36);
    assert.equal(f.hook.value.entries[0].notes,draft.notes);
    await act(async () => f.hook.value.refresh());
    assert.equal(f.hook.value.entries[0].notes,draft.notes);
    assert.ok(f.transport.calls.every(call => call.table === 'baby_sleep_entries'));
    assert.ok(f.transport.calls.some(call => call.filters.some(f => f.method==='gte' && f.args[1]==='2026-10-19')));
  } finally { await f.hook.close(); }
});
test('lost or altered acknowledgements confirm all fields by stable identity without duplicate entries', async () => {
  for (const flag of ['lost','altered']) {
    const f = await fixture();
    try {
      f.options[flag]=true;
      await act(async () => f.hook.value.save(draft));
      assert.equal(f.rows.size,1); assert.equal(f.hook.value.entries[0].notes,draft.notes);
      await act(async () => f.hook.value.save(draft));
      assert.equal(f.rows.size,1);
    } finally { await f.hook.close(); }
  }
});
test('offline failure keeps confirmed data and permits retry with the same UUID', async () => {
  const f = await fixture();
  try {
    f.options.fail=true;
    await act(async () => assert.rejects(f.hook.value.save(draft),/kept/));
    assert.equal(f.hook.value.entries.length,0);
    f.options.fail=false;
    await act(async () => f.hook.value.save(draft));
    assert.equal(f.rows.size,1);
  } finally { await f.hook.close(); }
});
test('stale versions and uncertain creations with different notes require reviewing latest, never overwrite', async () => {
  const f = await fixture();
  try {
    let saved; await act(async () => { saved = await f.hook.value.save(draft); });
    const row = f.rows.get(id); f.rows.set(id,{...row,notes:'Changed by caregiver',version:2});
    for (const version of [saved.version,undefined]) {
      let error;
      await act(async () => { try { await f.hook.value.save({...draft,version,notes:'My unfinished draft'}); } catch (e) { error=e; } });
      assert.match(error.message,/review the latest/); assert.equal(error.latest.notes,'Changed by caregiver');
      assert.equal(f.rows.get(id).notes,'Changed by caregiver');
    }
  } finally { await f.hook.close(); }
});
test('soft removal confirms equivalent UTC timestamp formats and preserves the saved note', async () => {
  const f = await fixture();
  try {
    let saved; await act(async () => { saved = await f.hook.value.save(draft); });
    await act(async () => f.hook.value.save({...saved,archiveRequestedAt:'2026-10-20T12:30:00.123Z'},true));
    assert.equal(f.hook.value.entries.length,0); assert.equal(f.rows.get(id).notes,draft.notes);
    assert.ok(f.rows.get(id).archived_at);
  } finally { await f.hook.close(); }
});
test('duplicate writes are blocked and delayed old-account results cannot expose times or notes', async () => {
  const f = await fixture();
  try {
    f.options.deferred=true; let pending;
    await act(async () => { pending=f.hook.value.save(draft); });
    await act(async () => assert.rejects(f.hook.value.save(draft),/Wait/));
    await f.hook.update({...f.props,currentUserId:'new-account',babyId:'new-baby'});
    assert.equal(f.hook.value.entries.length,0);
    await act(async () => { f.finish(); await assert.rejects(pending,/tracker changed/); });
    assert.equal(f.hook.value.entries.length,0); assert.equal(f.hook.value.saving,false);
  } finally { await f.hook.close(); }
});
test('older range reads cannot resurrect removed entries and ordinary refresh revisions reload caregiver notes', async () => {
  const f = await fixture();
  try {
    let saved; await act(async () => { saved=await f.hook.value.save(draft); });
    f.options.deferRead=true; let reading;
    await act(async () => { reading=f.hook.value.refresh(); });
    await act(async () => f.hook.value.save(saved,true));
    await act(async () => { f.finishRead(); await reading; });
    assert.equal(f.hook.value.entries.length,0);
    f.rows.set(id,{...f.rows.get(id),archived_at:null,notes:'Caregiver updated note',version:3});
    await f.hook.update({...f.props,revision:1});
    assert.equal(f.hook.value.entries[0].notes,'Caregiver updated note');
  } finally { await f.hook.close(); }
});
test('missing migration reports unavailable exact entries instead of pretending there are no notes', async () => {
  const f = await fixture();
  try {
    f.options.missing=true;
    await act(async () => f.hook.value.refresh());
    assert.equal(f.hook.value.available,false); assert.match(f.hook.value.error,/database update/);
  } finally { await f.hook.close(); }
});
test('manual form preserves exact minutes, note and UUID after failure; rejects reversed times', async () => {
  const f = await fixture(); const Editor=(await f.load('src/components/baby/SleepEntryEditor.jsx')).default;
  let root, payload, attempts=0;
  await act(async () => { root=create(React.createElement(Editor,{dateKey:date,onClose(){},onSave:async value=>{payload=value;attempts++;throw new Error('Synthetic failure; draft kept');}})); });
  try {
    const times=()=>root.root.findAllByType('input').filter(node=>node.props.type==='time');
    await act(async () => times()[0].props.onChange({target:{value:'16:07'}}));
    await act(async () => times()[1].props.onChange({target:{value:'16:43'}}));
    await act(async () => root.root.findByType('textarea').props.onChange({target:{value:'Woke during a journey.'}}));
    const submit=()=>act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));
    await submit(); const identity=payload.id;
    assert.equal(payload.startMinute,967); assert.equal(payload.endMinute,1003); assert.equal(payload.notes,draft.notes);
    assert.equal(root.root.findByType('textarea').props.value,draft.notes);
    await submit(); assert.equal(payload.id,identity); assert.equal(attempts,2);
    await act(async () => times()[1].props.onChange({target:{value:'15:43'}}));
    await submit(); assert.equal(attempts,2);
  } finally { await act(async()=>root.unmount()); await f.hook.close(); }
});
