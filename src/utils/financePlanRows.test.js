import test from 'node:test';
import assert from 'node:assert/strict';

import {
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

test('returns expense groups in the stable planner order', () => {
  const grouped = groupFinanceExpenseItems([
    { id: 'car', name: 'Car', categoryId: 'transport' },
    { id: 'gym', name: 'Gym', categoryId: 'lifestyle' },
    { id: 'mortgage', name: 'Mortgage', categoryId: 'housing' },
  ], categories).filter((group) => group.items.length);

  assert.deepEqual(grouped.map((group) => group.id), ['household', 'subscriptions', 'car']);
});

test('moves expired one-offs and ended recurring rows into history', () => {
  assert.equal(isHistoricalFinanceItem({ frequency: 'one_off', startMonth: '2026-07' }, '2026-08'), true);
  assert.equal(isHistoricalFinanceItem({ frequency: 'one_off', startMonth: '2026-09' }, '2026-08'), false);
  assert.equal(isHistoricalFinanceItem({ frequency: 'monthly', startMonth: '2026-01', endMonth: '2026-07' }, '2026-08'), true);
  assert.equal(isHistoricalFinanceItem({ frequency: 'annual', startMonth: '2026-02' }, '2026-08'), false);
});
