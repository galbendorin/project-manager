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
  let opened;
  const props = { view: 'quarterly', referenceMonth: '2026-10', forecast, budgetItems, snapshots: [], categories: [], onOpenMonth: month => { opened = month; }, ...overrides };
  let root;
  await act(async () => { root = create(React.createElement(PeriodPlan, props)); });
  return { root, props, PeriodPlan, transport, get opened() { return opened; }, async close() { await act(async () => root.unmount()); } };
}
test('quarterly, half-year and yearly summaries navigate calendar years without data writes', async () => {
  const f = await fixture();
  try {
    const selector = () => f.root.root.findAllByType('select')[1];
    assert.equal(selector().findAllByType('option').length, 4);
    assert.match(selector().props.value, /2026-10/);
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'halfyear' })));
    assert.equal(selector().findAllByType('option').length, 2);
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'yearly' })));
    assert.equal(f.root.root.findAllByType('select').length, 1);
    await act(async () => f.root.root.findAllByType('button').find(node => node.props['aria-label'] === 'Next year').props.onClick());
    assert.equal(f.root.root.findAllByType('select')[0].props.value, '2027');
    assert.ok(f.root.root.findAll(node => name(node).includes('Partial')).length);
    assert.equal(f.transport.calls.length, 0);
  } finally { await f.close(); }
});
test('partial summaries open the first covered month and ended schedule versions remain visible in detail', async () => {
  const f = await fixture();
  try {
    await act(async () => f.root.root.findAllByType('button').find(node => name(node) === 'Expand all').props.onClick());
    assert.ok(f.root.root.findAll(node => name(node).includes('Rent · 2026-01 to 2026-03')).length);
    await act(async () => f.root.root.findAllByType('button').find(node => node.props['aria-label'] === 'Open Q1 2026 in Monthly').props.onClick());
    assert.equal(f.opened, '2026-01');
    await act(async () => f.root.root.findAllByType('select')[0].props.onChange({ target: { value: '2027' } }));
    await act(async () => f.root.update(React.createElement(f.PeriodPlan, { ...f.props, view: 'yearly' })));
    await act(async () => f.root.root.findAllByType('button').find(node => node.props['aria-label'] === 'Open 2027 in Monthly').props.onClick());
    assert.equal(f.opened, '2027-01');
  } finally { await f.close(); }
});
test('missing end snapshots show a dash, recorded zero stays zero and fractional currency remains readable', async () => {
  const f = await fixture({ snapshots: [{ asOfMonth: '2026-03', cashBalancePence: 0 }, { asOfMonth: '2026-06', cashBalancePence: 6250 }] });
  try {
    const row = f.root.root.findAllByType('tr').find(node => node.findAllByType('th').some(th => name(th) === 'Recorded savings at end'));
    assert.deepEqual(row.findAllByType('td').map(name), ['£0','£62.50','—','—']);
  } finally { await f.close(); }
});
test('view switch exposes all four choices and changing it only requests the selected view', async () => {
  const load = await sourceModules(mockTransport(() => { throw new Error('No data calls'); }));
  const { FinancePlanViewSwitch } = await load('src/components/finance/FinancePeriodPlan.jsx');
  let chosen, root;
  await act(async () => { root = create(React.createElement(FinancePlanViewSwitch, { value: 'monthly', onChange: value => { chosen = value; } })); });
  try {
    const buttons = root.root.findAllByType('button');
    assert.equal(buttons.length, 4);
    assert.equal(buttons[0].props['aria-pressed'], true);
    await act(async () => buttons[2].props.onClick());
    assert.equal(chosen, 'halfyear');
  } finally { await act(async () => root.unmount()); }
});
