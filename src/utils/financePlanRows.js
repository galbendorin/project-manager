import {
  addMonths,
  compareMonthKeys,
  normalizeMonthKey,
} from './financePlanner.js';

export const FINANCE_EXPENSE_GROUPS = [
  {
    id: 'household',
    label: 'Home & bills',
    categoryName: 'Home & bills',
    categoryNames: ['home & bills', 'household, bills & mortgage', 'housing', 'utilities', 'food'],
    classification: 'essential',
    pattern: /\b(?:household|home|mortgage|rent|council\s+tax|bill|energy|electric(?:ity)?|gas|water|broadband|internet|grocer(?:y|ies)|food|insurance)\b/i,
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions & memberships',
    categoryName: 'Subscriptions & memberships',
    categoryNames: ['subscriptions & memberships'],
    classification: 'discretionary',
    pattern: /\b(?:subscription|gym|membership|netflix|spotify|streaming|prime|football)\b/i,
  },
  {
    id: 'childcare',
    label: 'Childcare',
    categoryName: 'Childcare',
    categoryNames: ['childcare', 'family & childcare'],
    classification: 'essential',
    pattern: /\b(?:child|childcare|nursery|school)\b/i,
  },
  {
    id: 'pocket_money',
    label: 'Pocket money',
    categoryName: 'Pocket money',
    categoryNames: ['pocket money'],
    classification: 'discretionary',
    pattern: /\bpocket\s+money\b/i,
  },
  {
    id: 'car',
    label: 'Car',
    categoryName: 'Car',
    categoryNames: ['car', 'transport'],
    classification: 'essential',
    pattern: /\b(?:car|vehicle|mot|fuel|petrol|diesel|road\s+tax|parking|transport)\b/i,
  },
  {
    id: 'other',
    label: 'Other',
    categoryName: 'Other household expenses',
    categoryNames: ['other household expenses', 'irregular costs'],
    classification: 'essential',
    pattern: null,
  },
];

const categoryNameMap = (categories = []) => new Map(
  categories.map((category) => [category.id, String(category.name || '').trim().toLowerCase()]),
);

const NAME_MATCH_PRIORITY = ['pocket_money', 'childcare', 'subscriptions', 'car', 'household'];

export const getFinanceExpenseGroupId = (item = {}, categories = []) => {
  const name = String(item.name || '').trim();
  const categoryName = categoryNameMap(categories).get(item.categoryId) || '';

  const explicitCategoryMatch = FINANCE_EXPENSE_GROUPS.find((group) => (
    group.categoryName.toLowerCase() === categoryName
  ));
  if (explicitCategoryMatch) return explicitCategoryMatch.id;

  // Name inference remains for legacy rows whose saved categories are broader
  // than the household groups shown in the planner.
  const nameMatch = NAME_MATCH_PRIORITY
    .map((groupId) => FINANCE_EXPENSE_GROUPS.find((group) => group.id === groupId))
    .find((group) => group?.pattern?.test(name));
  if (nameMatch) return nameMatch.id;

  const categoryMatch = FINANCE_EXPENSE_GROUPS.find((group) => (
    group.categoryNames.includes(categoryName)
  ));
  return categoryMatch?.id || 'other';
};

export const getFinanceExpenseGroup = (groupId = 'other') => (
  FINANCE_EXPENSE_GROUPS.find((group) => group.id === groupId)
  || FINANCE_EXPENSE_GROUPS.at(-1)
);

export const findFinanceGroupCategoryId = (categories = [], groupId = 'other') => {
  const group = getFinanceExpenseGroup(groupId);
  const canonicalName = group.categoryName.toLowerCase();
  return categories.find((category) => (
    category.flowType === 'expense'
    && String(category.name || '').trim().toLowerCase() === canonicalName
  ))?.id || '';
};

export const groupFinanceExpenseItems = (items = [], categories = []) => {
  const itemsByGroup = new Map(FINANCE_EXPENSE_GROUPS.map((group) => [group.id, []]));
  items.forEach((item) => {
    const groupId = getFinanceExpenseGroupId(item, categories);
    itemsByGroup.get(groupId)?.push(item);
  });

  return FINANCE_EXPENSE_GROUPS.map((group) => ({
    ...group,
    items: (itemsByGroup.get(group.id) || []).sort((left, right) => (
      String(left.name || '').localeCompare(String(right.name || ''))
    )),
  }));
};

export const buildFinancePlanSections = (items = [], categories = []) => {
  const transfers = items.filter((item) => item.cashTreatment === 'internal_transfer');
  const cashItems = items.filter((item) => item.cashTreatment !== 'internal_transfer');
  const income = cashItems.filter((item) => item.flowType === 'income');
  const expenses = cashItems.filter((item) => item.flowType === 'expense');
  const monthlyGroups = groupFinanceExpenseItems(
    expenses.filter((item) => item.frequency === 'monthly'),
    categories,
  );

  return [
    {
      id: 'income',
      label: 'Income',
      tone: 'income',
      items: income,
    },
    ...monthlyGroups.map((group) => ({
      id: `expense:${group.id}`,
      label: group.label,
      tone: 'expense',
      items: group.items,
    })),
    {
      id: 'yearly',
      label: 'Yearly expenses',
      tone: 'extra',
      items: expenses.filter((item) => item.frequency === 'annual'),
    },
    {
      id: 'occasional',
      label: 'Occasional expenses',
      tone: 'extra',
      items: expenses.filter((item) => item.frequency === 'one_off'),
    },
    {
      id: 'transfers',
      label: 'Transfers',
      tone: 'transfer',
      items: transfers,
    },
  ];
};

export const isHistoricalFinanceItem = (item = {}, currentMonth) => {
  const month = normalizeMonthKey(currentMonth);
  const frequency = item.frequency || 'monthly';
  if (frequency === 'one_off') {
    return Boolean(item.startMonth) && compareMonthKeys(item.startMonth, month) < 0;
  }
  return Boolean(item.endMonth) && compareMonthKeys(item.endMonth, month) < 0;
};

export const buildFinanceScheduleChange = (item = {}, effectiveMonth, patch = {}) => {
  const startMonth = normalizeMonthKey(item.startMonth);
  const changeMonth = normalizeMonthKey(effectiveMonth, startMonth);
  const patched = { ...item, ...patch };
  const next = {
    ...patched,
    endMonth: patched.frequency === 'one_off' ? '' : (patched.endMonth || ''),
    annualMonth: patched.frequency === 'annual'
      ? Number(patched.annualMonth) || Number(normalizeMonthKey(patched.startMonth, changeMonth).slice(5, 7))
      : null,
  };
  const canVersion = Boolean(item.id)
    && item.frequency !== 'one_off'
    && compareMonthKeys(changeMonth, startMonth) > 0;

  if (!canVersion) {
    return { mode: 'replace', item: next };
  }
  if (item.endMonth && compareMonthKeys(changeMonth, item.endMonth) > 0) {
    throw new Error('Choose a change month inside the current schedule.');
  }

  const successorEndMonth = next.frequency === 'one_off' ? '' : (next.endMonth || '');
  if (successorEndMonth && compareMonthKeys(successorEndMonth, changeMonth) < 0) {
    throw new Error('The end month must be after the change month.');
  }

  return {
    mode: 'split',
    previous: {
      ...item,
      endMonth: addMonths(changeMonth, -1),
    },
    successor: {
      ...next,
      id: undefined,
      startMonth: changeMonth,
      endMonth: successorEndMonth,
      annualMonth: next.annualMonth,
    },
  };
};
