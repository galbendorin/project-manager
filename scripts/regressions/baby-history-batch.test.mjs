import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mountHook, mockTransport, sourceModules, toggleHistorySlot } from './react-source-runtime.mjs';
const owner = '11111111-1111-4111-8111-111111111111';
const baby = '22222222-2222-4222-8222-222222222222';
const past = '2026-10-15', other = '2026-10-16';
const changes = [{ dateKey: past, blockIndex: 1, status: 'awake' }, { dateKey: other, blockIndex: 8, status: 'asleep' }];
async function fixture() {
  const rows = new Map([1,2].map(block_index => [`${past}:${block_index}`, { id: `old-${block_index}`, baby_id: baby, sleep_date: past, block_index, status: 'asleep' }]));
  const options = { fail: false, lost: false, altered: false, deferred: false };
  let finish;
  const transport = mockTransport(async request => {
    if (request.table === 'baby_profiles') return { data: [{ id: baby, user_id: owner, name: 'Synthetic baby' }] };
    if (request.table !== 'baby_sleep_blocks') return { data: [] };
    if (request.operation === 'upsert') {
      if (options.fail) return { error: { message: 'Synthetic offline failure' } };
      request.payload.forEach(row => rows.set(`${row.sleep_date}:${row.block_index}`, { id: `saved-${row.sleep_date}-${row.block_index}`, ...row }));
      if (options.deferred) await new Promise(resolve => { finish = resolve; });
      if (options.lost) return { error: { message: 'Synthetic lost acknowledgement' } };
      return { data: null };
    }
    const matches = [...rows.values()].filter(row => request.filters.every(({ method, args: [field, value] }) => {
      if (method === 'eq') return row[field] === value;
      if (method === 'in') return value.includes(row[field]);
      if (method === 'gte') return row[field] >= value;
      if (method === 'lte') return row[field] <= value;
      return true;
    }));
    return { data: options.altered && request.filters.some(filter => filter.method === 'in') ? []
      : request.range ? matches.slice(request.range[0], request.range[1] + 1) : matches.slice(0, 1000) };
  });
  const load = await sourceModules(transport);
  const { useBabyData } = await load('src/hooks/useBabyData.js');
  const hook = await mountHook(useBabyData, { currentUserId: owner });
  return { hook, transport, rows, options, finish: () => finish() };
}
test('one batch write changes multiple dates and preserves untouched blocks and dates', async () => {
  const f = await fixture();
  try {
    await act(async () => f.hook.value.loadRangeData({ startDate: past, endDate: other }));
    await act(async () => f.hook.value.setSelectedDate(past));
    await act(async () => f.hook.value.saveSleepHistory(changes));
    const writes = f.transport.calls.filter(call => call.operation !== 'select');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].payload.length, 2);
    assert.ok(writes[0].payload.every(row => row.baby_id === baby && row.user_id === owner));
    assert.equal(f.rows.get(`${past}:2`).status, 'asleep');
    assert.deepEqual(Array.from(f.hook.value.sleepBlocks, row => row.blockIndex), [2]);
    assert.deepEqual(Array.from(f.hook.value.rangeSleepBlocks, row => `${row.sleepDate}:${row.blockIndex}`).sort(), [`${past}:2`, `${other}:8`]);
    assert.equal(f.hook.value.selectedDate, past);
    assert.equal(f.hook.value.saving, false);
  } finally { await f.hook.close(); }
});
test('a large batch confirms per date instead of relying on a server response above 1000 rows', async () => {
  const f = await fixture();
  try {
    const large = Array.from({ length: 14 }, (_, day) => Array.from({ length: 96 }, (_, blockIndex) => ({ dateKey: `2026-10-${String(day + 1).padStart(2, '0')}`, blockIndex, status: 'asleep' }))).flat();
    await act(async () => f.hook.value.saveSleepHistory(large));
    assert.equal(f.transport.calls.filter(call => call.operation === 'upsert').length, 1);
    const reads = f.transport.calls.filter(call => call.filters?.some(filter => filter.method === 'in'));
    assert.equal(reads.length, 14);
    assert.ok(reads.every(call => call.filters.find(filter => filter.method === 'in').args[1].length <= 96));
    assert.equal(f.hook.value.rangeSleepBlocks.length, 1344);
    await act(async () => f.hook.value.loadRangeData({ startDate: '2026-10-01', endDate: '2026-10-14' }));
    assert.equal(f.hook.value.rangeSleepBlocks.length, 1344);
    assert.equal(f.transport.calls.filter(call => call.range).length, 3);
  } finally { await f.hook.close(); }
});
test('failed writes, lost acknowledgements and incomplete confirmations retain confirmed state and allow retry', async () => {
  for (const option of ['fail','lost','altered']) {
    const f = await fixture();
    try {
      await act(async () => f.hook.value.loadRangeData({ startDate: past, endDate: other }));
      const confirmed = f.hook.value.rangeSleepBlocks;
      f.options[option] = true;
      await act(async () => { await assert.rejects(f.hook.value.saveSleepHistory(changes)); });
      assert.equal(f.hook.value.rangeSleepBlocks, confirmed);
      assert.equal(f.hook.value.saving, false);
      f.options[option] = false;
      await act(async () => f.hook.value.saveSleepHistory(changes));
      assert.equal(f.rows.get(`${past}:2`).status, 'asleep');
      assert.equal(f.hook.value.rangeSleepBlocks.length, 2);
    } finally { await f.hook.close(); }
  }
});
test('a pending history save blocks duplicate and daily saves and ignores responses after an account switch', async () => {
  const f = await fixture();
  try {
    f.options.deferred = true;
    let pending;
    await act(async () => { pending = f.hook.value.saveSleepHistory(changes); });
    await assert.rejects(f.hook.value.saveSleepHistory(changes), /Wait/);
    await assert.rejects(f.hook.value.saveSleepBlocks(new Set([5]), past), /Wait/);
    await f.hook.update({ currentUserId: 'another-account' });
    await act(async () => { f.finish(); await assert.rejects(pending, /tracker changed/); });
    assert.equal(f.hook.value.rangeSleepBlocks.length, 0);
    assert.equal(f.hook.value.saving, false);
    assert.equal(f.transport.calls.filter(call => call.filters?.some(filter => filter.method === 'in')).length, 0);
  } finally { await f.hook.close(); }
});
test('invalid or duplicate batch identities fail before any write', async () => {
  const f = await fixture();
  try {
    for (const invalid of [[{ dateKey: '2026-02-31', blockIndex: 0, status: 'asleep' }], [{ ...changes[0], blockIndex: 96 }], [{ ...changes[0], status: 'invalid' }], [changes[0], changes[0]]]) {
      await assert.rejects(f.hook.value.saveSleepHistory(invalid), /Invalid/);
    }
    await f.hook.value.saveSleepHistory([]);
    assert.equal(f.transport.calls.filter(call => call.operation !== 'select').length, 0);
  } finally { await f.hook.close(); }
});
test('Cancel discards a multi-day draft and returning a block to its original value removes its change', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const { PatternPanel } = await load('src/components/BabyView.jsx');
  let root, calls = 0;
  const props = { dateKeys: [past, other], feeds: [], nappies: [], sleepBlocks: [], rangeLoading: false, rangeLabel: 'Synthetic range', setPatternRange() {}, onSaveHistory() { calls++; } };
  await act(async () => { root = create(React.createElement(PatternPanel, props)); });
  try {
    const button = label => root.root.findAllByType('button').find(node => node.children.includes(label));
    await act(async () => button('Edit history').props.onClick());
    await toggleHistorySlot(root, past, 0);
    await toggleHistorySlot(root, past, 0);
    assert.equal(button('Save changes').props.disabled, true);
    await toggleHistorySlot(root, other, 0);
    await act(async () => button('Cancel').props.onClick());
    assert.equal(calls, 0);
    assert.equal(root.root.findAllByType('button').filter(node => node.props['data-sleep-block-index'] !== undefined).length, 0);
  } finally { await act(async () => root.unmount()); }
});

test('after a lost acknowledgement, reverting an attempted block still writes the intended reversion', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const { PatternPanel } = await load('src/components/BabyView.jsx');
  let root, attempts = 0, reloaded = false;
  const saved = new Map();
  const props = { dateKeys: [past, other], feeds: [], nappies: [], sleepBlocks: [], rangeLoading: false, setPatternRange() {}, onRetryRange() { reloaded = true; },
    onSaveHistory: async patch => { patch.forEach(row => saved.set(`${row.dateKey}:${row.blockIndex}`, row.status)); if (++attempts === 1) throw new Error('Synthetic lost acknowledgement'); } };
  await act(async () => { root = create(React.createElement(PatternPanel, props)); });
  try {
    const button = label => root.root.findAllByType('button').find(node => node.children.includes(label));
    await act(async () => button('Edit history').props.onClick());
    await toggleHistorySlot(root, past, 0);
    await act(async () => button('Save changes').props.onClick());
    assert.equal(saved.get(`${past}:0`), 'asleep');
    await toggleHistorySlot(root, past, 0);
    assert.equal(button('Save changes').props.disabled, false);
    await toggleHistorySlot(root, other, 0);
    await act(async () => button('Save changes').props.onClick());
    assert.equal(saved.get(`${past}:0`), 'awake');
    assert.equal(saved.get(`${other}:0`), 'asleep');
    assert.equal(reloaded, false);
    attempts = 0;
    await act(async () => button('Edit history').props.onClick());
    await toggleHistorySlot(root, other, 0);
    await act(async () => button('Save changes').props.onClick());
    await act(async () => button('Cancel').props.onClick());
    assert.equal(reloaded, true);
  } finally { await act(async () => root.unmount()); }
});

test('phone single-slot edits on separate days share one Save changes without filling gaps', async () => {
  const load = await sourceModules(mockTransport(() => ({ data: [] })));
  const { PatternPanel } = await load('src/components/BabyView.jsx');
  let root, saved;
  await act(async () => { root = create(React.createElement(PatternPanel, { dateKeys: [past, other], feeds: [], nappies: [], sleepBlocks: [], setPatternRange() {}, onSaveHistory: async patch => { saved = patch; } })); });
  try {
    await act(async () => root.root.findAllByType('button').find(node => node.children.includes('Edit history')).props.onClick());
    const tap = (date, index) => toggleHistorySlot(root, date, index);
    await tap(past, 0); await tap(past, 3);
    await tap(other, 8); await tap(other, 9);
    assert.equal(root.root.findAllByType('button').filter(node => node.children.includes('Save changes')).length, 1);
    await act(async () => root.root.findAllByType('button').find(node => node.children.includes('Save changes')).props.onClick());
    assert.deepEqual(Array.from(saved, row => `${row.dateKey}:${row.blockIndex}`), [`${past}:0`,`${past}:3`,`${other}:8`,`${other}:9`]);
  } finally { await act(async () => root.unmount()); }
});
