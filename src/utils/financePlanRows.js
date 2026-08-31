import { compareMonthKeys, normalizeMonthKey } from './financePlanner.js';

export const FINANCE_EXPENSE_GROUPS = [
  {
    id: 'household',
    label: 'Household, bills & mortgage',
    categoryNames: ['housing', 'utilities', 'food'],
    pattern: /\b(?:household|home|mortgage|rent|council\s+tax|bill|energy|electric(?:ity)?|gas|water|broadband|internet|grocer(?:y|ies)|food|insurance)\b/i,
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions, gym & memberships',
    categoryNames: [],
    pattern: /\b(?:subscription|gym|membership|netflix|spotify|streaming|prime|football)\b/i,
  },
  {
    id: 'childcare',
    label: 'Childcare 1 & 2',
    categoryNames: ['family & childcare'],
    pattern: /\b(?:child|childcare|nursery|school)\b/i,
  },
  {
    id: 'pocket_money',
    label: 'Pocket money 1 & 2',
    categoryNames: [],
    pattern: /\bpocket\s+money\b/i,
  },
  {
    id: 'car',
    label: 'Car',
    categoryNames: ['transport'],
    pattern: /\b(?:car|vehicle|mot|fuel|petrol|diesel|road\s+tax|parking|transport)\b/i,
  },
  {
    id: 'other',
    label: 'Other regular expenses',
    categoryNames: [],
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

  // Specific names win over broad categories. This keeps a gym subscription out
  // of a generic Lifestyle or Household group, for example.
  const nameMatch = NAME_MATCH_PRIORITY
    .map((groupId) => FINANCE_EXPENSE_GROUPS.find((group) => group.id === groupId))
    .find((group) => group?.pattern?.test(name));
  if (nameMatch) return nameMatch.id;

  const categoryMatch = FINANCE_EXPENSE_GROUPS.find((group) => (
    group.categoryNames.includes(categoryName)
  ));
  return categoryMatch?.id || 'other';
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

export const isHistoricalFinanceItem = (item = {}, currentMonth) => {
  const month = normalizeMonthKey(currentMonth);
  const frequency = item.frequency || 'monthly';
  if (frequency === 'one_off') {
    return Boolean(item.startMonth) && compareMonthKeys(item.startMonth, month) < 0;
  }
  return Boolean(item.endMonth) && compareMonthKeys(item.endMonth, month) < 0;
};
