import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFinalizedClosingCashByMonth,
  buildFinanceMonthReconciliation,
  getDefaultReconciliationOpening,
  getLocalDateKey,
  getMonthEndDate,
  getReconciliationVariancePence,
} from './financeReconciliation.js';

test('only finalized recorded balances are eligible to rebase future forecasts', () => {
  assert.deepEqual(buildFinalizedClosingCashByMonth([
    { monthKey: '2026-07', status: 'finalized', actualClosingCashPence: 0 },
    { monthKey: '2026-08', status: 'draft', actualClosingCashPence: 950000 },
    { monthKey: '2026-09', status: 'finalized', actualClosingCashPence: null },
    { monthKey: '2026-10', status: 'finalized', actualClosingCashPence: 1200000 },
  ]), {
    '2026-07': 0,
    '2026-10': 1200000,
  });
});

const planMonth = {
  monthKey: '2026-08',
  openingCashPence: 1000000,
  incomePence: 500000,
  expensePence: 300000,
  closingCashPence: 1200000,
};

test('reconciliation variance kinds use favourable positive signs', () => {
  assert.equal(getReconciliationVariancePence('extra_expense', 10000), -10000);
  assert.equal(getReconciliationVariancePence('expense_under', 10000), 10000);
  assert.equal(getReconciliationVariancePence('income_lower', 20000), -20000);
  assert.equal(getReconciliationVariancePence('income_higher', 20000), 20000);
});

test('reconciliation separates opening, monthly, closing, explained, and unknown variance', () => {
  const result = buildFinanceMonthReconciliation({
    month: planMonth,
    reconciliation: {
      status: 'draft',
      actualOpeningCashPence: 990000,
      actualClosingCashPence: 1130000,
    },
    lines: [
      { kind: 'extra_expense', variancePence: -50000 },
      { kind: 'income_lower', variancePence: -10000 },
    ],
    currentMonthKey: '2026-09',
  });

  assert.equal(result.openingVariancePence, -10000);
  assert.equal(result.monthlyVariancePence, -60000);
  assert.equal(result.closingVariancePence, -70000);
  assert.equal(result.explainedVariancePence, -60000);
  assert.equal(result.unexplainedVariancePence, 0);
  assert.equal(result.canFinalize, true);
});

test('reconciliation preserves missing balances and does not treat them as zero', () => {
  const result = buildFinanceMonthReconciliation({
    month: planMonth,
    reconciliation: { status: 'draft', actualClosingCashPence: 0 },
    currentMonthKey: '2026-09',
  });
  assert.equal(result.hasActualOpening, false);
  assert.equal(result.hasActualClosing, true);
  assert.equal(result.actualClosingCashPence, 0);
  assert.equal(result.monthlyVariancePence, null);
  assert.equal(result.canFinalize, false);
});

test('current month reports a neutral amount remaining to the month-end target', () => {
  const result = buildFinanceMonthReconciliation({
    month: planMonth,
    reconciliation: { status: 'draft', actualClosingCashPence: 1151600 },
    currentMonthKey: '2026-08',
  });
  assert.equal(result.isCurrent, true);
  assert.equal(result.targetRemainingPence, 48400);
  assert.equal(result.canFinalize, false);
});

test('finalized reconciliations use frozen plan values after the live plan changes', () => {
  const result = buildFinanceMonthReconciliation({
    month: { ...planMonth, closingCashPence: 9999999, incomePence: 900000 },
    reconciliation: {
      status: 'finalized',
      plannedOpeningCashPence: 1000000,
      plannedIncomePence: 500000,
      plannedExpensePence: 300000,
      plannedClosingCashPence: 1200000,
      actualOpeningCashPence: 1000000,
      actualClosingCashPence: 1200000,
    },
    currentMonthKey: '2026-09',
  });
  assert.equal(result.plannedIncomePence, 500000);
  assert.equal(result.plannedClosingCashPence, 1200000);
  assert.equal(result.closingVariancePence, 0);
});

test('unknown lines can balance the arithmetic but cannot close a month', () => {
  const result = buildFinanceMonthReconciliation({
    month: planMonth,
    reconciliation: {
      status: 'draft',
      plannedOpeningCashPence: 1000000,
      plannedIncomePence: 500000,
      plannedExpensePence: 300000,
      plannedClosingCashPence: 1200000,
      actualOpeningCashPence: 1000000,
      actualClosingCashPence: 1151600,
    },
    lines: [{ kind: 'unknown_out', variancePence: -48400 }],
    currentMonthKey: '2026-09',
  });
  assert.equal(result.unexplainedVariancePence, 0);
  assert.equal(result.unknownVariancePence, -48400);
  assert.equal(result.unknownAmountPence, 48400);
  assert.equal(result.hasUnknownLines, true);
  assert.equal(result.isBalanced, true);
  assert.equal(result.canFinalize, false);
});

test('opening balance defaults only from a consecutive source or the plan start', () => {
  assert.deepEqual(getDefaultReconciliationOpening({
    monthKey: '2026-09',
    forecastStartMonth: '2026-08',
    previousReconciliation: { monthKey: '2026-08', status: 'finalized', actualClosingCashPence: 123400 },
  }), { amountPence: 123400, source: 'previous_reconciliation' });
  assert.deepEqual(getDefaultReconciliationOpening({
    monthKey: '2026-08',
    forecastStartMonth: '2026-08',
    openingCashPence: 500000,
  }), { amountPence: 500000, source: 'plan_opening' });
  assert.deepEqual(getDefaultReconciliationOpening({
    monthKey: '2026-10',
    forecastStartMonth: '2026-08',
    previousSnapshot: { asOfMonth: '2026-08', cashBalancePence: 500000 },
  }), { amountPence: null, source: 'missing' });
});

test('date helpers use local dates and real month ends', () => {
  assert.equal(getLocalDateKey(new Date(2026, 8, 1, 23, 30)), '2026-09-01');
  assert.equal(getMonthEndDate('2028-02'), '2028-02-29');
});
