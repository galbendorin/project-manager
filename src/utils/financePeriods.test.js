import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinanceForecast } from './financePlanner.js';
import { buildFinancePeriods, getFinancePlanYears } from './financePeriods.js';

const item = (id, amountPence, extra = {}) => ({ id, name: id, amountPence, startMonth: '2026-01', frequency: 'monthly', flowType: 'expense', classification: 'essential', ...extra });
const items = [
  item('salary', 500000, { flowType: 'income' }), item('rent', 200000),
  item('old-childcare', 30000, { endMonth: '2026-03' }), item('new-childcare', 40000, { startMonth: '2026-04' }),
  item('insurance', 120000, { frequency: 'annual', annualMonth: 4 }),
  item('holiday', 50000, { frequency: 'one_off', startMonth: '2026-08' }),
  item('transfer', 25000, { cashTreatment: 'internal_transfer' }),
];
const forecast = buildFinanceForecast({ startMonth: '2026-01', months: 12, openingCashPence: 1000000, budgetItems: items });

test('calendar quarters total scheduled flows and use the final balance, including ended and replacement rows', () => {
  const periods = buildFinancePeriods({ forecast, view: 'quarterly', year: '2026' });
  assert.deepEqual(periods.map(period => period.label), ['Q1 2026','Q2 2026','Q3 2026','Q4 2026']);
  assert.deepEqual(periods.map(period => period.expensePence), [690000,840000,770000,720000]);
  assert.deepEqual(periods.map(period => period.surplusPence), [810000,660000,730000,780000]);
  assert.deepEqual(periods.map(period => period.closingCashPence), [1810000,2470000,3200000,3980000]);
  assert.equal(periods[0].itemTotals.get('old-childcare'), 90000);
  assert.equal(periods[1].itemTotals.has('old-childcare'), false);
  assert.equal(periods[1].itemTotals.get('insurance'), 120000);
  assert.equal(periods[2].itemTotals.get('holiday'), 50000);
  assert.ok(periods.every(period => !period.isPartial));
});

test('half-year and yearly summaries reconcile to monthly totals without treating transfers as expenses', () => {
  const halves = buildFinancePeriods({ forecast, view: 'halfyear', year: 2026 });
  const [year] = buildFinancePeriods({ forecast, view: 'yearly', year: 2026 });
  assert.deepEqual(halves.map(period => period.label), ['H1 2026','H2 2026']);
  assert.equal(year.incomePence, 6000000);
  assert.equal(year.expensePence, 3020000);
  assert.equal(year.surplusPence, 2980000);
  assert.equal(year.internalTransfersPence, 300000);
  assert.equal(year.itemTotals.get('transfer'), 300000);
  assert.equal(year.closingCashPence, 3980000);
  for (const field of ['incomePence','expensePence','surplusPence','internalTransfersPence']) assert.equal(year[field], halves.reduce((sum, half) => sum + half[field], 0));
});

test('recorded end balances preserve zero and never sum or carry forward an earlier snapshot', () => {
  const periods = buildFinancePeriods({ forecast, view: 'quarterly', year: '2026', snapshots: [
    { asOfMonth: '2026-02', cashBalancePence: 100000 }, { asOfMonth: '2026-03', cashBalancePence: 0 },
    { asOfMonth: '2026-05', cashBalancePence: 60000 },
  ] });
  assert.equal(periods[0].recordedClosingCashPence, 0);
  assert.equal(periods[1].recordedClosingCashPence, null);
});

test('rebased monthly forecasts keep their final balance distinct from summed planned surplus', () => {
  const rebased = buildFinanceForecast({ startMonth: '2026-01', months: 12, openingCashPence: 1000000, budgetItems: items, actualClosingCashByMonth: { '2026-05': 100000 } });
  const quarter = buildFinancePeriods({ forecast: rebased, view: 'quarterly', year: '2026' })[1];
  assert.equal(quarter.surplusPence, 660000);
  assert.equal(quarter.closingCashPence, 360000);
});

test('partial first and final calendar periods identify their actual coverage across years', () => {
  const partial = buildFinanceForecast({ startMonth: '2026-08', months: 12, budgetItems: items });
  const first = buildFinancePeriods({ forecast: partial, view: 'quarterly', year: '2026' });
  assert.equal(first[0].label, 'Q3 2026');
  assert.equal(first[0].startMonth, '2026-08');
  assert.equal(first[0].monthCount, 2);
  assert.equal(first[0].isPartial, true);
  const last = buildFinancePeriods({ forecast: partial, view: 'yearly', year: '2027' })[0];
  assert.equal(last.endMonth, '2027-07');
  assert.equal(last.monthCount, 7);
  assert.equal(last.expectedMonths, 12);
  assert.equal(last.isPartial, true);
});

test('period item totals reuse monthly growth and exclude months outside the requested year', () => {
  const grown = buildFinanceForecast({ startMonth: '2026-11', months: 15, annualExpenseInflationBps: 250, annualIncomeGrowthBps: 300, budgetItems: items });
  const [year] = buildFinancePeriods({ forecast: grown, view: 'yearly', year: '2027' });
  assert.equal(year.incomePence, 6180000);
  assert.equal(year.itemTotals.get('rent'), 2460000);
  assert.equal(year.monthCount, 12);
  assert.equal(year.isPartial, false);
});

test('periods are deterministic for shuffled input, reject invalid ranges and do not mutate the forecast', () => {
  const input = [...forecast].reverse();
  const before = structuredClone(input);
  const quarters = buildFinancePeriods({ forecast: input, view: 'quarterly', year: 2026 });
  assert.equal(quarters[0].startMonth, '2026-01');
  assert.deepEqual(input, before);
  assert.deepEqual(buildFinancePeriods({ forecast, view: 'monthly', year: 2026 }), []);
  assert.deepEqual(buildFinancePeriods({ forecast, view: 'yearly', year: 'bad' }), []);
  assert.deepEqual(getFinancePlanYears([...forecast, { monthKey: 'bad' }, { monthKey: '2027-01' }]), ['2026','2027']);
});
