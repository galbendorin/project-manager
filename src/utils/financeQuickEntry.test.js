import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findFinanceCategoryId,
  parseFinanceQuickEntry,
} from './financeQuickEntry.js';

test('parses a monthly household expense and suggests its category', () => {
  const result = parseFinanceQuickEntry('Energy £150 monthly', {
    mode: 'regular',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.item, {
    name: 'Energy',
    amountPence: 15000,
    flowType: 'expense',
    classification: 'essential',
    frequency: 'monthly',
    startMonth: '2026-08',
    endMonth: '',
    annualMonth: null,
    categoryHint: 'Utilities',
    cashTreatment: 'cash_outflow',
    isActive: true,
  });
});

test('parses monthly income with a thousands separator', () => {
  const result = parseFinanceQuickEntry('Salary £3,547 monthly income', {
    mode: 'regular',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.name, 'Salary');
  assert.equal(result.item.amountPence, 354700);
  assert.equal(result.item.flowType, 'income');
  assert.equal(result.item.categoryHint, 'Salary');
});

test('parses a future monthly change with an end month', () => {
  const result = parseFinanceQuickEntry('Childcare £835 monthly from April 2027 until March 2028', {
    mode: 'regular',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.name, 'Childcare');
  assert.equal(result.item.startMonth, '2027-04');
  assert.equal(result.item.endMonth, '2028-03');
  assert.equal(result.item.categoryHint, 'Family & childcare');
});

test('keeps identifying numbers in a name while using the final bare number as the amount', () => {
  const result = parseFinanceQuickEntry('Pocket money partner 2 370 monthly optional', {
    mode: 'regular',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.name, 'Pocket money partner 2');
  assert.equal(result.item.amountPence, 37000);
  assert.equal(result.item.classification, 'discretionary');
});

test('parses a one-off cost in the next matching month', () => {
  const result = parseFinanceQuickEntry('MOT £350 in October', {
    mode: 'other',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.name, 'MOT');
  assert.equal(result.item.frequency, 'one_off');
  assert.equal(result.item.startMonth, '2026-10');
  assert.equal(result.item.categoryHint, 'Transport');
});

test('rolls a month without a year into the next forecast year when needed', () => {
  const result = parseFinanceQuickEntry('Holiday £1,400 in June', {
    mode: 'other',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.startMonth, '2027-06');
  assert.equal(result.item.classification, 'discretionary');
});

test('parses an annual cost and records its annual month', () => {
  const result = parseFinanceQuickEntry('Car insurance £800 every February', {
    mode: 'other',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.name, 'Car insurance');
  assert.equal(result.item.frequency, 'annual');
  assert.equal(result.item.startMonth, '2027-02');
  assert.equal(result.item.annualMonth, 2);
  assert.equal(result.item.categoryHint, 'Transport');
});

test('uses explicit years and optional classification', () => {
  const result = parseFinanceQuickEntry('Birthday £600 in August 2027 optional', {
    mode: 'other',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, true);
  assert.equal(result.item.startMonth, '2027-08');
  assert.equal(result.item.classification, 'discretionary');
  assert.equal(result.item.categoryHint, 'Family & childcare');
});

test('returns useful validation when the amount is missing', () => {
  const result = parseFinanceQuickEntry('MOT in October', {
    mode: 'other',
    startMonth: '2026-08',
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /amount/i);
});

test('matches a suggested category without assuming an id', () => {
  const categories = [
    { id: 'utilities-id', name: 'Utilities', flowType: 'expense' },
    { id: 'salary-id', name: 'Salary', flowType: 'income' },
  ];
  assert.equal(findFinanceCategoryId(categories, 'Utilities', 'expense'), 'utilities-id');
  assert.equal(findFinanceCategoryId(categories, 'Utilities', 'income'), '');
});
