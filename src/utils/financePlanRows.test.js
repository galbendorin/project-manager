import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinancePlanSections,
  buildFinanceScheduleChange,
  findFinanceGroupCategoryId,
  getFinanceExpenseGroupId,
  groupFinanceExpenseItems,
  isHistoricalFinanceItem,
} from './financePlanRows.js';

const categories = [
  { id: 'housing', name: 'Housing' },
  { id: 'family', name: 'Family & childcare' },
  { id: 'transport', name: 'Transport' },
  { id: 'lifestyle', name: 'Lifestyle' },
];

test('groups familiar household expense names before using broad category fallbacks', () => {
  assert.equal(getFinanceExpenseGroupId({ name: 'Contractual mortgage', categoryId: 'housing' }, categories), 'household');
  assert.equal(getFinanceExpenseGroupId({ name: 'Gym membership', categoryId: 'lifestyle' }, categories), 'subscriptions');
  assert.equal(getFinanceExpenseGroupId({ name: 'Childcare 2', categoryId: 'family' }, categories), 'childcare');
  assert.equal(getFinanceExpenseGroupId({ name: 'Pocket money partner 1', categoryId: 'lifestyle' }, categories), 'pocket_money');
  assert.equal(getFinanceExpenseGroupId({ name: 'Family car', categoryId: 'transport' }, categories), 'car');
  assert.equal(getFinanceExpenseGroupId({ name: 'Car insurance', categoryId: 'housing' }, categories), 'car');
});

test('an explicit household group category wins over legacy name inference', () => {
  const groupedCategories = [
    ...categories,
    { id: 'subscriptions', name: 'Subscriptions & memberships', flowType: 'expense' },
  ];
  assert.equal(getFinanceExpenseGroupId({ name: 'Car insurance', categoryId: 'subscriptions' }, groupedCategories), 'subscriptions');
  assert.equal(findFinanceGroupCategoryId(groupedCategories, 'subscriptions'), 'subscriptions');
});

test('returns expense groups in the stable planner order', () => {
  const grouped = groupFinanceExpenseItems([
    { id: 'car', name: 'Car', categoryId: 'transport' },
    { id: 'gym', name: 'Gym', categoryId: 'lifestyle' },
    { id: 'mortgage', name: 'Mortgage', categoryId: 'housing' },
  ], categories).filter((group) => group.items.length);

  assert.deepEqual(grouped.map((group) => group.id), ['household', 'subscriptions', 'car']);
});

test('builds stable plan sections and keeps transfers outside expense groups', () => {
  const sections = buildFinancePlanSections([
    { id: 'salary', name: 'Salary', flowType: 'income', cashTreatment: 'cash_outflow', frequency: 'monthly' },
    { id: 'mortgage', name: 'Mortgage', flowType: 'expense', cashTreatment: 'cash_outflow', frequency: 'monthly', categoryId: 'housing' },
    { id: 'insurance', name: 'Insurance', flowType: 'expense', cashTreatment: 'cash_outflow', frequency: 'annual' },
    { id: 'holiday', name: 'Holiday', flowType: 'expense', cashTreatment: 'cash_outflow', frequency: 'one_off' },
    { id: 'isa', name: 'ISA transfer', flowType: 'expense', cashTreatment: 'internal_transfer', frequency: 'monthly' },
  ], categories).filter((section) => section.items.length);

  assert.deepEqual(sections.map((section) => section.id), [
    'income',
    'expense:household',
    'yearly',
    'occasional',
    'transfers',
  ]);
  assert.deepEqual(sections.find((section) => section.id === 'transfers').items.map((item) => item.id), ['isa']);
});

test('moves expired one-offs and ended recurring rows into history', () => {
  assert.equal(isHistoricalFinanceItem({ frequency: 'one_off', startMonth: '2026-07' }, '2026-08'), true);
  assert.equal(isHistoricalFinanceItem({ frequency: 'one_off', startMonth: '2026-09' }, '2026-08'), false);
  assert.equal(isHistoricalFinanceItem({ frequency: 'monthly', startMonth: '2026-01', endMonth: '2026-07' }, '2026-08'), true);
  assert.equal(isHistoricalFinanceItem({ frequency: 'annual', startMonth: '2026-02' }, '2026-08'), false);
});

test('splits a recurring change without a gap or overlap', () => {
  const change = buildFinanceScheduleChange({
    id: 'childcare',
    name: 'Childcare',
    frequency: 'monthly',
    startMonth: '2026-08',
    endMonth: '',
    amountPence: 13500,
  }, '2027-04', { amountPence: 83500 });

  assert.equal(change.mode, 'split');
  assert.equal(change.previous.endMonth, '2027-03');
  assert.equal(change.successor.startMonth, '2027-04');
  assert.equal(change.successor.endMonth, '');
  assert.equal(change.successor.amountPence, 83500);
  assert.equal(change.successor.id, undefined);
});

test('updates the whole schedule when the change starts at its first month', () => {
  const change = buildFinanceScheduleChange({
    id: 'mortgage', frequency: 'monthly', startMonth: '2026-08', amountPence: 70000,
  }, '2026-08', { amountPence: 75000 });
  assert.equal(change.mode, 'replace');
  assert.equal(change.item.amountPence, 75000);
});

test('normalizes one-off fields when replacing a whole recurring schedule', () => {
  const change = buildFinanceScheduleChange({
    id: 'old-annual', frequency: 'annual', startMonth: '2026-08', endMonth: '2030-08', annualMonth: 8, amountPence: 30000,
  }, '2026-08', { frequency: 'one_off' });

  assert.equal(change.mode, 'replace');
  assert.equal(change.item.endMonth, '');
  assert.equal(change.item.annualMonth, null);
});

test('uses the edited end month for a future recurring version', () => {
  const change = buildFinanceScheduleChange({
    id: 'gym', frequency: 'monthly', startMonth: '2026-08', endMonth: '2028-08', amountPence: 4900,
  }, '2027-01', { endMonth: '2027-12' });

  assert.equal(change.previous.endMonth, '2026-12');
  assert.equal(change.successor.startMonth, '2027-01');
  assert.equal(change.successor.endMonth, '2027-12');
});

test('clears bounded schedule fields when a future version becomes one-off', () => {
  const change = buildFinanceScheduleChange({
    id: 'insurance', frequency: 'annual', startMonth: '2026-03', endMonth: '2030-03', annualMonth: 3, amountPence: 42000,
  }, '2027-08', { frequency: 'one_off', endMonth: '', annualMonth: null });

  assert.equal(change.previous.endMonth, '2027-07');
  assert.equal(change.successor.frequency, 'one_off');
  assert.equal(change.successor.startMonth, '2027-08');
  assert.equal(change.successor.endMonth, '');
  assert.equal(change.successor.annualMonth, null);
});

test('keeps an annual recurrence month when only a future amount changes', () => {
  const change = buildFinanceScheduleChange({
    id: 'insurance', frequency: 'annual', startMonth: '2026-03', endMonth: '', annualMonth: 3, amountPence: 42000,
  }, '2027-08', { amountPence: 46000, annualMonth: 3 });

  assert.equal(change.successor.startMonth, '2027-08');
  assert.equal(change.successor.annualMonth, 3);
  assert.equal(change.successor.amountPence, 46000);
});

test('rejects a future version that ends before it begins', () => {
  assert.throws(() => buildFinanceScheduleChange({
    id: 'childcare', frequency: 'monthly', startMonth: '2026-08', endMonth: '', amountPence: 80000,
  }, '2027-08', { endMonth: '2027-07' }), /end month/i);
});
