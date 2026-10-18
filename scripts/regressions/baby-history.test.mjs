import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mountHook, mockTransport, sourceModules } from './react-source-runtime.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const profile = { id: '22222222-2222-4222-8222-222222222222', user_id: owner, name: 'Synthetic baby' };
const past = '2026-10-15';
const other = '2026-10-16';
const block = (date, index) => ({ id: `${date}-${index}`, baby_id: profile.id, sleep_date: date, block_index: index, status: 'asleep' });
async function fixture(write = request => ({ data: request.payload })) {
  const transport = mockTransport(request => {
    if (request.table === 'projects') return { data: [] };
    if (request.table === 'baby_profiles') return { data: [profile] };
    if (request.operation === 'upsert') return write(request);
    if (request.table === 'baby_sleep_blocks') {
      const date = request.filters.find(filter => filter.args[0] === 'sleep_date' && filter.method === 'eq')?.args[1];
      return { data: [block(date || past, 1)] };
    }
    return { data: [] };
  });
  const load = await sourceModules(transport);
  const { useBabyData } = await load('src/hooks/useBabyData.js');
  const hook = await mountHook(useBabyData, { currentUserId: owner });
  return { hook, transport, load };
}

test('history saves one explicit date atomically and leaves the selected daily grid unchanged', async () => {
  const f = await fixture();
  try {
    const selected = f.hook.value.selectedDate;
    await act(async () => f.hook.value.saveSleepBlocks(new Set([4, 5]), past));
    const writes = f.transport.calls.filter(call => call.operation !== 'select');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].operation, 'upsert');
    assert.equal(writes[0].payload.length, 96);
    assert.ok(writes[0].payload.every(row => row.sleep_date === past && row.baby_id === profile.id && row.user_id === owner));
    assert.equal(writes[0].payload.filter(row => row.status === 'asleep').length, 2);
    assert.equal(f.hook.value.selectedDate, selected);
    assert.equal(f.hook.value.saving, false);
    assert.equal(f.hook.value.sleepBlocks[0].sleepDate, selected);
    assert.deepEqual(Array.from(f.hook.value.rangeSleepBlocks, row => row.blockIndex), [4, 5]);
    await act(async () => f.hook.value.saveSleepBlocks(new Set([6]), other));
    assert.equal(f.hook.value.rangeSleepBlocks.length, 3);
  } finally { await f.hook.close(); }
});

test('clearing sleep writes awake statuses and saving the selected date refreshes its daily grid', async () => {
  const f = await fixture();
  try {
    await act(async () => f.hook.value.saveSleepBlocks(new Set()));
    const write = f.transport.calls.find(call => call.operation === 'upsert');
    assert.ok(write.payload.every(row => row.status === 'awake'));
    assert.equal(f.hook.value.sleepBlocks.length, 0);
  } finally { await f.hook.close(); }
});

test('failed and altered acknowledgements preserve confirmed sleep and allow the same request to retry', async () => {
  for (const bad of [{ error: { message: 'Synthetic offline failure' } }, { data: [] }]) {
    let fail = true;
    const f = await fixture(request => fail ? bad : { data: request.payload });
    try {
      const previous = f.hook.value.sleepBlocks;
      await act(async () => { await assert.rejects(f.hook.value.saveSleepBlocks(new Set([8]), past)); });
      assert.equal(f.hook.value.sleepBlocks, previous);
      assert.equal(f.hook.value.rangeSleepBlocks.length, 0);
      fail = false;
      await act(async () => f.hook.value.saveSleepBlocks(new Set([8]), past));
      assert.equal(f.hook.value.saving, false);
      assert.equal(f.hook.value.rangeSleepBlocks[0].blockIndex, 8);
    } finally { await f.hook.close(); }
  }
});

test('duplicate saves are blocked and delayed acknowledgements cannot fill a new account with old sleep', async () => {
  let finish;
  const f = await fixture(request => new Promise(resolve => { finish = () => resolve({ data: request.payload }); }));
  try {
    let pending;
    await act(async () => { pending = f.hook.value.saveSleepBlocks(new Set([12]), past); });
    await act(async () => { await assert.rejects(f.hook.value.saveSleepBlocks(new Set([13]), other), /Wait/); });
    await f.hook.update({ currentUserId: 'new-account' });
    assert.equal(f.hook.value.saving, false);
    await act(async () => { finish(); await pending; });
    assert.equal(f.hook.value.rangeSleepBlocks.length, 0);
    assert.equal(f.hook.value.saving, false);
  } finally { await f.hook.close(); }
});

test('invalid dates never write sleep records', async () => {
  const f = await fixture();
  try {
    for (const date of ['wrong', '2026-02-31']) {
      await assert.rejects(f.hook.value.saveSleepBlocks(new Set([1]), date), /valid sleep date/);
    }
    assert.equal(f.transport.calls.filter(call => call.operation !== 'select').length, 0);
  } finally { await f.hook.close(); }
});

test('changing the selected day during a save never applies its sleep to the new daily grid', async () => {
  let finish;
  const f = await fixture(request => new Promise(resolve => { finish = () => resolve({ data: request.payload }); }));
  try {
    const original = f.hook.value.selectedDate;
    let pending;
    await act(async () => { pending = f.hook.value.saveSleepBlocks(new Set([12])); });
    await act(async () => f.hook.value.setSelectedDate(other));
    await act(async () => { finish(); await pending; });
    assert.equal(f.hook.value.sleepBlocks[0].sleepDate, other);
    assert.equal(f.hook.value.rangeSleepBlocks[0].sleepDate, original);
    assert.equal(f.hook.value.saving, false);
  } finally { await f.hook.close(); }
});

test('phone grid supports mouse, two-tap touch ranges and keyboard without double toggles', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const { SleepGrid } = await load('src/components/BabyView.jsx');
  let root;
  await act(async () => { root = create(React.createElement(SleepGrid, { sleepBlocks: [], onSave: async () => {}, saving: false })); });
  try {
    const slot = index => root.root.findAllByType('button').find(node => node.props['data-sleep-block-index'] === index);
    const down = type => ({ pointerType: type, pointerId: 1, preventDefault() {}, currentTarget: {} });
    const click = detail => ({ detail, preventDefault() {} });
    await act(async () => slot(1).props.onPointerDown(down('mouse')));
    await act(async () => slot(1).props.onClick(click(1)));
    assert.equal(slot(1).props['aria-pressed'], true);
    await act(async () => slot(4).props.onPointerDown(down('touch')));
    await act(async () => slot(4).props.onClick(click(1)));
    await act(async () => slot(7).props.onPointerDown(down('touch')));
    await act(async () => slot(7).props.onClick(click(1)));
    for (const index of [4,5,6,7]) assert.equal(slot(index).props['aria-pressed'], true);
    await act(async () => slot(10).props.onClick(click(0)));
    assert.equal(slot(10).props['aria-pressed'], true);
  } finally { await act(async () => root.unmount()); }
});

test('an older history read cannot overwrite a newly confirmed sleep correction', async () => {
  let finish;
  const transport = mockTransport(request => {
    if (request.table === 'baby_profiles') return { data: [profile] };
    if (request.operation === 'upsert') return { data: request.payload };
    if (request.table === 'baby_sleep_blocks' && request.filters.some(filter => filter.method === 'gte')) {
      return new Promise(resolve => { finish = () => resolve({ data: [block(past, 1)] }); });
    }
    return { data: [] };
  });
  const load = await sourceModules(transport);
  const { useBabyData } = await load('src/hooks/useBabyData.js');
  const hook = await mountHook(useBabyData, { currentUserId: owner });
  try {
    let reading;
    await act(async () => { reading = hook.value.loadRangeData({ startDate: past, endDate: other }); });
    await act(async () => hook.value.saveSleepBlocks(new Set([9]), past));
    await act(async () => { finish(); await reading; });
    assert.deepEqual(Array.from(hook.value.rangeSleepBlocks, row => row.blockIndex), [9]);
  } finally { await hook.close(); }
});

test('failed history loads offer retry and never expose an empty editable day', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const { PatternPanel } = await load('src/components/BabyView.jsx');
  let retried = false;
  let root;
  await act(async () => { root = create(React.createElement(PatternPanel, { dateKeys: [past], feeds: [], nappies: [], sleepBlocks: [], rangeError: 'Synthetic load failure', rangeLoading: false, setPatternRange() {}, onRetryRange() { retried = true; } })); });
  try {
    assert.equal(root.root.findAllByType('button').filter(node => node.props['aria-label']?.startsWith('Edit sleep')).length, 0);
    await act(async () => root.root.findAllByType('button').find(node => node.children.includes('Retry history')).props.onClick());
    assert.equal(retried, true);
  } finally { await act(async () => root.unmount()); }
});

const text = node => node.children.filter(child => typeof child === 'string').join('');
test('history edits include empty days, retain a failed draft through refresh and save only that date', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const { PatternPanel, SleepGrid } = await load('src/components/BabyView.jsx');
  const calls = [];
  let fail = true;
  const props = { birthDate: '2026-04-22', dateKeys: [past, other], feeds: [], nappies: [], sleepBlocks: [], patternRange: 'week', rangeLabel: 'Synthetic week', rangeLoading: false, selectedDate: other, setPatternRange() {}, saving: false,
    onSaveSleep: async (blocks, date) => { calls.push({ blocks: [...blocks], date }); if (fail) throw new Error('Synthetic save failure'); } };
  let root;
  await act(async () => { root = create(React.createElement(PatternPanel, props)); });
  try {
    const edits = () => root.root.findAllByType('button').filter(node => text(node) === 'Edit sleep');
    assert.equal(edits().length, 4); // Both responsive presentations offer each date.
    await act(async () => edits()[0].props.onClick({}));
    const grid = () => root.root.findByType(SleepGrid);
    const slot = () => grid().findAllByType('button').filter(node => node.props['data-sleep-block-index'] === 4).at(-1);
    await act(async () => slot().props.onClick({ detail: 0 }));
    const save = () => grid().findAllByType('button').find(node => text(node) === 'Save sleep');
    await act(async () => save().props.onClick());
    assert.equal(calls[0].date, past);
    assert.deepEqual(calls[0].blocks, [4]);
    assert.ok(root.root.findByProps({ role: 'alert' }));
    await act(async () => root.update(React.createElement(PatternPanel, { ...props, sleepBlocks: [{ sleepDate: past, blockIndex: 20, status: 'asleep' }] })));
    assert.equal(slot().props['aria-pressed'], true);
    fail = false;
    await act(async () => save().props.onClick());
    assert.equal(root.root.findAllByType(SleepGrid).length, 0);
    assert.deepEqual(calls[1], calls[0]);
    assert.ok(root.root.findByProps({ role: 'status' }));
  } finally { await act(async () => root.unmount()); }
});
