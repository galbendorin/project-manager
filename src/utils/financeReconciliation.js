import {
  addMonths,
  compareMonthKeys,
  getCurrentMonthKey,
  normalizeMonthKey,
} from './financePlanner.js';

export const FINANCE_RECONCILIATION_KINDS = [
  { value: 'extra_expense', label: 'Extra expense', direction: -1, flowType: 'expense' },
  { value: 'expense_over', label: 'Spent more than planned', direction: -1, flowType: 'expense' },
  { value: 'expense_under', label: 'Spent less than planned', direction: 1, flowType: 'expense' },
  { value: 'income_lower', label: 'Income was lower', direction: -1, flowType: 'income' },
  { value: 'income_higher', label: 'Extra income', direction: 1, flowType: 'income' },
  { value: 'money_out', label: 'Money moved out', direction: -1, flowType: 'adjustment' },
  { value: 'money_in', label: 'Money moved in', direction: 1, flowType: 'adjustment' },
  { value: 'unknown_out', label: 'Still unknown — money out', direction: -1, flowType: 'adjustment', unknown: true },
  { value: 'unknown_in', label: 'Still unknown — money in', direction: 1, flowType: 'adjustment', unknown: true },
];

const KIND_BY_VALUE = new Map(FINANCE_RECONCILIATION_KINDS.map((kind) => [kind.value, kind]));

const asInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

export const getFinanceReconciliationKind = (value) => (
  KIND_BY_VALUE.get(value) || KIND_BY_VALUE.get('extra_expense')
);

export const getReconciliationVariancePence = (kind, amountPence) => (
  getFinanceReconciliationKind(kind).direction * Math.max(0, asInteger(amountPence))
);

export const getLocalDateKey = (date = new Date()) => {
  const parsed = date instanceof Date ? date : new Date(date);
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const year = safe.getFullYear();
  const month = String(safe.getMonth() + 1).padStart(2, '0');
  const day = String(safe.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getMonthEndDate = (monthKey) => {
  const month = normalizeMonthKey(monthKey);
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber, 0, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const getDefaultReconciliationOpening = ({
  monthKey,
  forecastStartMonth,
  openingCashPence,
  previousReconciliation,
  previousSnapshot,
} = {}) => {
  const month = normalizeMonthKey(monthKey);
  const previousMonth = addMonths(month, -1);
  if (
    previousReconciliation?.status === 'finalized'
    && previousReconciliation.monthKey === previousMonth
    && hasValue(previousReconciliation.actualClosingCashPence)
  ) {
    return {
      amountPence: asInteger(previousReconciliation.actualClosingCashPence),
      source: 'previous_reconciliation',
    };
  }
  if (
    previousSnapshot?.asOfMonth === previousMonth
    && hasValue(previousSnapshot.cashBalancePence)
  ) {
    return {
      amountPence: asInteger(previousSnapshot.cashBalancePence),
      source: 'legacy_snapshot',
    };
  }
  if (month === normalizeMonthKey(forecastStartMonth, month)) {
    return {
      amountPence: asInteger(openingCashPence),
      source: 'plan_opening',
    };
  }
  return { amountPence: null, source: 'missing' };
};

export const buildFinanceMonthReconciliation = ({
  month,
  reconciliation,
  lines = [],
  currentMonthKey = getCurrentMonthKey(),
  tolerancePence = 1,
} = {}) => {
  if (!month) return null;
  const monthKey = normalizeMonthKey(month.monthKey);
  const isCurrent = monthKey === currentMonthKey;
  const isFuture = compareMonthKeys(monthKey, currentMonthKey) > 0;
  const isPast = compareMonthKeys(monthKey, currentMonthKey) < 0;
  const isFinalized = reconciliation?.status === 'finalized';
  const useFrozenPlan = isFinalized;
  const plannedOpeningCashPence = useFrozenPlan && hasValue(reconciliation.plannedOpeningCashPence)
    ? asInteger(reconciliation.plannedOpeningCashPence)
    : asInteger(month.openingCashPence);
  const plannedIncomePence = useFrozenPlan && hasValue(reconciliation.plannedIncomePence)
    ? asInteger(reconciliation.plannedIncomePence)
    : asInteger(month.incomePence);
  const plannedExpensePence = useFrozenPlan && hasValue(reconciliation.plannedExpensePence)
    ? asInteger(reconciliation.plannedExpensePence)
    : asInteger(month.expensePence);
  const plannedClosingCashPence = useFrozenPlan && hasValue(reconciliation.plannedClosingCashPence)
    ? asInteger(reconciliation.plannedClosingCashPence)
    : asInteger(month.closingCashPence);
  const plannedNetPence = plannedIncomePence - plannedExpensePence;
  const hasActualOpening = hasValue(reconciliation?.actualOpeningCashPence);
  const hasActualClosing = hasValue(reconciliation?.actualClosingCashPence);
  const actualOpeningCashPence = hasActualOpening ? asInteger(reconciliation.actualOpeningCashPence) : null;
  const actualClosingCashPence = hasActualClosing ? asInteger(reconciliation.actualClosingCashPence) : null;
  const explainedVariancePence = lines.reduce(
    (total, line) => total + asInteger(line.variancePence),
    0,
  );
  const unknownVariancePence = lines.reduce((total, line) => (
    getFinanceReconciliationKind(line.kind).unknown
      ? total + asInteger(line.variancePence)
      : total
  ), 0);
  const monthlyVariancePence = hasActualOpening && hasActualClosing
    ? (actualClosingCashPence - actualOpeningCashPence) - plannedNetPence
    : null;
  const closingVariancePence = hasActualClosing
    ? actualClosingCashPence - plannedClosingCashPence
    : null;
  const openingVariancePence = hasActualOpening
    ? actualOpeningCashPence - plannedOpeningCashPence
    : null;
  const unexplainedVariancePence = monthlyVariancePence === null
    ? null
    : monthlyVariancePence - explainedVariancePence;
  const targetRemainingPence = isCurrent && hasActualClosing
    ? plannedClosingCashPence - actualClosingCashPence
    : null;
  const isBalanced = unexplainedVariancePence !== null
    && Math.abs(unexplainedVariancePence) <= Math.max(0, asInteger(tolerancePence, 1));

  let status = 'not_started';
  if (isFuture) status = 'future';
  else if (isFinalized) status = Math.abs(unknownVariancePence) > 0 ? 'finalized_with_unknown' : 'finalized';
  else if (reconciliation) status = 'draft';

  return {
    monthKey,
    isCurrent,
    isFuture,
    isPast,
    isFinalized,
    status,
    plannedOpeningCashPence,
    plannedIncomePence,
    plannedExpensePence,
    plannedNetPence,
    plannedClosingCashPence,
    actualOpeningCashPence,
    actualClosingCashPence,
    hasActualOpening,
    hasActualClosing,
    openingVariancePence,
    monthlyVariancePence,
    closingVariancePence,
    explainedVariancePence,
    unexplainedVariancePence,
    unknownVariancePence,
    targetRemainingPence,
    isBalanced,
    canFinalize: isPast && !isFinalized && hasActualOpening && hasActualClosing && isBalanced,
  };
};
