import test from 'node:test';
import assert from 'node:assert/strict';
import { React, act, create, mockTransport, sourceModules } from './react-source-runtime.mjs';
const name = node => node.children.filter(child => typeof child === 'string').join('');
async function fixture(overrides = {}) {
  const transport = mockTransport(() => { throw new Error('Summary views must not write data'); });
  const load = await sourceModules(transport);
  const { buildFinanceForecast } = await load('src/utils/financePlanner.js');
  const PeriodPlan = (await load('src/components/finance/FinancePeriodPlan.jsx')).default;
  const budgetItems = [
    { id: 'salary', name: 'Salary', flowType: 'income', amountPence: 300000, frequency: 'monthly', startMonth: '2026-01' },
    { id: 'old-rent', name: 'Rent', flowType: 'expense', amountPence: 100000, frequency: 'monthly', startMonth: '2026-01', endMonth: '2026-03' },
    { id: 'new-rent', name: 'Rent', flowType: 'expense', amountPence: 120000, frequency: 'monthly', startMonth: '2026-04' },
  ];
  const forecast = buildFinanceForecast({ startMonth: '2026-01', months: 18, openingCashPence: 100000, budgetItems });
  let opened, changedMonth, edited, editMonth;
  const props = { view: 'quarterly', referenceMonth: '2026-10', forecast, budgetItems, snapshots: [], categories: [], onOpenMonth: month => { opened = month; }, onChangeMonth: month => { changedMonth = month; }, onEdit: (item, month) => { edited = item; editMonth = month; }, ...overrides };
  let root;
  await act(async () => { root = create(React.createElement(PeriodPlan, props)); });
  return { root, props, PeriodPlan, transport, get opened() { return opened; }, get changedMonth() { return changedMonth; }, get edited() { return edited; }, get editMonth() { return editMonth; }, async close() { await act(async () => root.unmount()); } };
}
test('the same plan table shows consecutive future periods across years at each scale without data writes', async () => {
  const f = await fixture();
  try {
    const headers = () => f.root.root.findAllByType('thead')[0].findAllByType('th').slice(1).map(node => node.findAllByType('span')[0].children.join(''));
    assert.deepEqual(headers(), ['Q4 2026','Q1 2027','Q2 2027']);
    assert.equal(f.root.root.findAllByType('table').length, 1);
    assert.equal(f.root.root.findAllByType('select')[0].props.value, '2026-10');
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'halfyear' })));
    assert.deepEqual(headers(), ['H2 2026','H1 2027']);
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'yearly' })));
    assert.deepEqual(headers(), ['2026','2027']);
    await act(async () => f.root.root.findAllByType('select')[0].props.onChange({ target: { value: '2027-01' } }));
    assert.equal(f.changedMonth, '2027-01');
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'yearly', referenceMonth: f.changedMonth })));
    assert.deepEqual(headers(), ['2027']);
    assert.ok(f.root.root.findAll(node => name(node).includes('Partial')).length);
    assert.equal(f.transport.calls.length, 0);
  } finally { await f.close(); }
});
test('periods open monthly detail and row editing reuses original items including ended schedule versions', async () => {
  const f = await fixture({ referenceMonth: '2026-02' });
  try {
    await act(async () => f.root.root.findAllByType('button').find(node => name(node) === 'Expand all').props.onClick());
    assert.ok(f.root.root.findAll(node => name(node).includes('Rent · 2026-01 to 2026-03')).length);
    await act(async () => f.root.root.findAllByType('button').find(node => name(node) === 'Rent · 2026-01 to 2026-03').props.onClick());
    assert.equal(f.edited, f.props.budgetItems[1]);
    assert.equal(f.editMonth, '2026-02');
    await act(async () => f.root.root.findAllByType('button').find(node => node.props['aria-label'] === 'Open Q1 2026 in Monthly').props.onClick());
    assert.equal(f.opened, '2026-01');
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'yearly', forecast: f.props.forecast.slice(2) })));
    await act(async () => f.root.root.findAllByType('button').find(node => node.props['aria-label'] === 'Open 2026 in Monthly').props.onClick());
    assert.equal(f.opened, '2026-03');
    await act(async () => f.root.root.findAllByType('button').find(node => node.props['aria-label'] === 'Open 2027 in Monthly').props.onClick());
    assert.equal(f.opened, '2027-01');
  } finally { await f.close(); }
});
test('missing end snapshots show a dash, recorded zero stays zero and fractional currency remains readable', async () => {
  const f = await fixture({ referenceMonth: '2026-01', snapshots: [{ asOfMonth: '2026-03', cashBalancePence: 0 }, { asOfMonth: '2026-06', cashBalancePence: 6250 }] });
  try {
    const row = f.root.root.findAllByType('tr').find(node => node.findAllByType('th').some(th => name(th) === 'Recorded savings at end'));
    assert.deepEqual(row.findAllByType('td').map(name), ['£0','£62.50','—','—','—','—']);
  } finally { await f.close(); }
});
test('view dropdown exposes all four scales and changing it only requests the selected scale', async () => {
  const load = await sourceModules(mockTransport(() => { throw new Error('No data calls'); }));
  const { FinancePlanViewSwitch } = await load('src/components/finance/FinancePeriodPlan.jsx');
  let chosen, root;
  await act(async () => { root = create(React.createElement(FinancePlanViewSwitch, { value: 'monthly', onChange: value => { chosen = value; } })); });
  try {
    const selector = root.root.findByType('select');
    assert.deepEqual(selector.findAllByType('option').map(node => node.props.value), ['monthly','quarterly','halfyear','yearly']);
    assert.equal(selector.props.value, 'monthly');
    await act(async () => selector.props.onChange({ target: { value: 'halfyear' } }));
    assert.equal(chosen, 'halfyear');
  } finally { await act(async () => root.unmount()); }
});

test('empty forecasts show a useful empty state without a broken navigation control', async () => {
  const f = await fixture({ forecast: [] });
  try {
    assert.ok(f.root.root.findAll(node => name(node).includes('No forecast months available')).length);
    assert.equal(f.root.root.findAllByType('select').length, 0);
    assert.equal(f.transport.calls.length, 0);
  } finally { await f.close(); }
});

test('yearly rows open an editing month within their original schedule, never after an ended version or before a future one', async () => {
  const f = await fixture({ view: 'yearly' });
  try {
    await act(async () => f.root.root.findAllByType('button').find(node => name(node) === 'Expand all').props.onClick());
    const edit = async label => act(async () => f.root.root.findAllByType('button').find(node => name(node) === label).props.onClick());
    await edit('Rent · 2026-01 to 2026-03');
    assert.equal(f.editMonth, '2026-03');
    await edit('Rent · 2026-04');
    assert.equal(f.editMonth, '2026-10');
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'yearly', referenceMonth: '2026-02' })));
    await edit('Rent · 2026-04');
    assert.equal(f.editMonth, '2026-04');
    assert.equal(f.transport.calls.length, 0);
  } finally { await f.close(); }
});
