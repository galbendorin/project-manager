import {
  addMonths,
  buildMortgageProjection,
  getCurrentMonthKey,
} from './financePlanner.js';
import {
  getFinanceExpenseGroup,
  getFinanceExpenseGroupId,
  isHistoricalFinanceItem,
} from './financePlanRows.js';
import { loadXLSX } from './importParsers.js';

export const FINANCE_EXPORT_RANGE_OPTIONS = [
  {
    value: 'overview',
    label: 'Previous 12 + next 24 months',
    description: 'Best for a useful review without sharing the full forecast.',
  },
  {
    value: 'next_12',
    label: 'Next 12 months',
    description: 'Focus on affordability and costs coming soon.',
  },
  {
    value: 'complete',
    label: 'Complete available plan',
    description: 'Include every month currently available in the planner.',
  },
];

const RANGE_LABELS = new Map(FINANCE_EXPORT_RANGE_OPTIONS.map((option) => [option.value, option.label]));
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

const penceToCurrency = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount / 100 : 0;
};

const nullablePenceToCurrency = (value) => (
  value === null || value === undefined || value === '' ? '' : penceToCurrency(value)
);

const bpsToDecimal = (value) => {
  const bps = Number(value);
  return Number.isFinite(bps) ? bps / 10000 : '';
};

export const neutralizeSpreadsheetText = (value) => {
  const text = String(value ?? '').split(String.fromCharCode(0)).join('');
  return FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
};

const humanize = (value) => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const normalizeDate = (value) => String(value || '').slice(0, 10);
const monthFromDate = (value) => normalizeDate(value).slice(0, 7);

const getRangeBounds = (range, currentMonth) => {
  if (range === 'next_12') return { startMonth: currentMonth, endMonth: addMonths(currentMonth, 11) };
  if (range === 'complete') return { startMonth: '', endMonth: '' };
  return { startMonth: addMonths(currentMonth, -12), endMonth: addMonths(currentMonth, 23) };
};

const isMonthInRange = (month, bounds) => Boolean(month)
  && (!bounds.startMonth || month >= bounds.startMonth)
  && (!bounds.endMonth || month <= bounds.endMonth);

const doesScheduleOverlapRange = (item, bounds) => {
  if (!bounds.startMonth && !bounds.endMonth) return true;
  const startMonth = item.startMonth || '';
  const endMonth = item.frequency === 'one_off' ? startMonth : (item.endMonth || '9999-12');
  return Boolean(startMonth)
    && (!bounds.endMonth || startMonth <= bounds.endMonth)
    && (!bounds.startMonth || endMonth >= bounds.startMonth);
};

const makeCategoryMap = (categories) => new Map(
  (categories || []).map((category) => [category.id, neutralizeSpreadsheetText(category.name || 'Uncategorised')]),
);

const makeBudgetItemMap = (budgetItems) => new Map(
  (budgetItems || []).map((item) => [item.id, neutralizeSpreadsheetText(item.name || '')]),
);

const getCategoryName = (categoryMap, categoryId) => categoryMap.get(categoryId) || 'Uncategorised';

const getGroupName = (item, categories) => (
  item.flowType === 'expense'
    ? neutralizeSpreadsheetText(getFinanceExpenseGroup(getFinanceExpenseGroupId(item, categories)).label)
    : ''
);

const getNetCashImpact = (row) => {
  if (row.cashTreatment === 'internal_transfer') return 0;
  const amount = penceToCurrency(row.amountPence);
  return row.flowType === 'income' ? amount : -amount;
};

const buildInstructionsRows = ({ currencyCode, rangeLabel, includeNotes, actualEntriesMayBeTruncated }) => [
  ['PMWorkspace household finance export'],
  ['Purpose', 'Upload this workbook to ChatGPT or another analysis tool for a household finance review.'],
  ['Suggested prompt', 'Analyse this household finance workbook. Separate planned, recorded-balance and actual data. Do not count internal transfers as spending. Identify monthly shortfalls, irregular-cost pressure, discretionary or subscription opportunities, emergency-fund runway, goal feasibility and mortgage risks. Give the three highest-impact actions, state data gaps and assumptions, and do not invent missing transactions.'],
  ['Privacy', 'This workbook was created locally in your browser. PMWorkspace has not sent it to ChatGPT or anyone else. It contains sensitive financial information, so store and share it carefully.'],
  ['Identifiers', 'Account IDs, database IDs, the account email, authentication data and internal timestamps are not added to the export.'],
  ['Free text', includeNotes ? 'Optional notes, scenario descriptions and owner labels are included because you selected that option.' : 'Optional notes, scenario descriptions and owner labels are excluded. Item and category names remain included.'],
  ['Currency', `${currencyCode}. Money cells contain decimal currency amounts, not pence.`],
  ['Percentages', 'Percentage cells contain decimal values and are displayed as percentages.'],
  ['Export range', rangeLabel],
  ['Range scope', 'The selected period applies to monthly plan lines, summaries, actuals, balances, scenario changes and budget schedule versions that overlap it.'],
  ['Actual data coverage', actualEntriesMayBeTruncated ? 'The planner returned 500 actual entries. Older actual entries may not be included.' : 'Fewer than 500 actual entries were loaded; no known actual-entry truncation.'],
  ['Important', 'A blank actual value means no actual entries were recorded for that month. It does not mean the real amount was zero.'],
  [],
  ['Sheet', 'Contents'],
  ['01_SETTINGS', 'Plan settings and export scope.'],
  ['02_MONTHLY_SUMMARY', 'Monthly plan, forecast cash, recorded balances and actual totals.'],
  ['03_PLAN_LINES', 'One planned item occurrence per month in the selected range.'],
  ['04_BUDGET_SCHEDULE', 'One row per saved schedule version, including past and future versions.'],
  ['05_ACTUALS', 'Recorded actual income and expenses.'],
  ['06_BALANCES', 'Recorded savings balances compared with the plan.'],
  ['07_GOALS', 'Savings goals and target gaps.'],
  ['08_MORTGAGES', 'Mortgage position and projection using the saved payment information.'],
  ['09_SCENARIOS', 'Saved scenario changes, if any. These are not included in the base monthly plan.'],
];

const buildSettingsRows = ({
  generatedAt,
  timeZone,
  currencyCode,
  rangeLabel,
  profile,
  includeNotes,
  actualEntries,
  exportedActualEntries,
}) => [
  { Field: 'Generated at (UTC)', Value: generatedAt.toISOString() },
  { Field: 'Browser time zone', Value: timeZone },
  { Field: 'Currency', Value: currencyCode },
  { Field: 'Export range', Value: rangeLabel },
  { Field: 'Plan start', Value: profile.forecastStartMonth || '' },
  { Field: 'Opening savings', Value: penceToCurrency(profile.openingCashPence) },
  { Field: 'Protected savings floor', Value: penceToCurrency(profile.protectedCashFloorPence) },
  { Field: 'Emergency target (months)', Value: Number(profile.emergencyTargetMonths) || 0 },
  { Field: 'Annual expense inflation', Value: bpsToDecimal(profile.annualExpenseInflationBps) },
  { Field: 'Annual income growth', Value: bpsToDecimal(profile.annualIncomeGrowthBps) },
  { Field: 'Notes and owner labels', Value: includeNotes ? 'Included' : 'Excluded' },
  { Field: 'Actual entries loaded', Value: actualEntries.length },
  { Field: 'Actual entries exported', Value: exportedActualEntries.length },
  { Field: 'Actual entries may be truncated', Value: actualEntries.length >= 500 ? 'Yes — only the latest 500 may be loaded' : 'No known truncation' },
  { Field: 'Budget schedule scope', Value: 'Active database rows currently loaded; ended schedule versions remain included.' },
];

const aggregateActuals = (actualEntries) => {
  const byMonth = new Map();
  actualEntries.forEach((entry) => {
    const month = monthFromDate(entry.occurredOn);
    if (!month) return;
    const current = byMonth.get(month) || { count: 0, incomePence: 0, expensePence: 0 };
    current.count += 1;
    if (entry.cashTreatment !== 'internal_transfer') {
      if (entry.flowType === 'income') current.incomePence += Number(entry.amountPence) || 0;
      else current.expensePence += Number(entry.amountPence) || 0;
    }
    byMonth.set(month, current);
  });
  return byMonth;
};

const buildMonthlySummaryRows = ({ forecast, snapshots, actualEntries }) => {
  const forecastByMonth = new Map(forecast.map((month) => [month.monthKey, month]));
  const snapshotByMonth = new Map(snapshots.map((snapshot) => [snapshot.asOfMonth, snapshot]));
  const actualByMonth = aggregateActuals(actualEntries);
  const months = [...new Set([
    ...forecastByMonth.keys(),
    ...snapshotByMonth.keys(),
    ...actualByMonth.keys(),
  ])].sort();

  return months.map((monthKey) => {
    const plan = forecastByMonth.get(monthKey);
    const snapshot = snapshotByMonth.get(monthKey);
    const actual = actualByMonth.get(monthKey);
    const hasPlan = Boolean(plan);
    const hasSnapshot = Boolean(snapshot);
    const hasActual = Boolean(actual);
    return {
      Month: monthKey,
      'Planned income': hasPlan ? penceToCurrency(plan.incomePence) : '',
      'Planned essential expenses': hasPlan ? penceToCurrency(plan.essentialPence) : '',
      'Planned discretionary expenses': hasPlan ? penceToCurrency(plan.discretionaryPence) : '',
      'Planned wealth building': hasPlan ? penceToCurrency(plan.wealthBuildingPence) : '',
      'Planned cash expenses': hasPlan ? penceToCurrency(plan.expensePence) : '',
      'Internal transfers': hasPlan ? penceToCurrency(plan.internalTransfersPence) : '',
      'Planned surplus': hasPlan ? penceToCurrency(plan.surplusPence) : '',
      'Savings rate': hasPlan && plan.savingsRate !== null ? Number(plan.savingsRate) : '',
      'Opening savings': hasPlan ? penceToCurrency(plan.openingCashPence) : '',
      'Planned closing savings': hasPlan ? penceToCurrency(plan.closingCashPence) : '',
      'Recorded savings': hasSnapshot ? penceToCurrency(snapshot.cashBalancePence) : '',
      'Recorded vs plan': hasSnapshot && hasPlan ? penceToCurrency(snapshot.cashBalancePence - plan.closingCashPence) : '',
      'Emergency cover (months)': hasPlan && plan.emergencyCoverageMonths !== null ? Number(plan.emergencyCoverageMonths) : '',
      'Below protected floor': hasPlan ? (plan.belowProtectedFloor ? 'Yes' : 'No') : '',
      'Actual income': hasActual ? penceToCurrency(actual.incomePence) : '',
      'Actual expenses': hasActual ? penceToCurrency(actual.expensePence) : '',
      'Actual surplus': hasActual ? penceToCurrency(actual.incomePence - actual.expensePence) : '',
      'Actual entries recorded': hasActual ? actual.count : '',
    };
  });
};

const buildPlanLineRows = ({ forecast, categories, categoryMap }) => forecast.flatMap((month) => (
  (month.lineItems || []).map((item) => ({
    Month: month.monthKey,
    Item: neutralizeSpreadsheetText(item.name),
    Group: getGroupName(item, categories),
    Category: getCategoryName(categoryMap, item.categoryId),
    Flow: humanize(item.flowType),
    Classification: humanize(item.classification),
    'Cash treatment': humanize(item.cashTreatment),
    Frequency: humanize(item.frequency === 'one_off' ? 'once' : item.frequency === 'annual' ? 'yearly' : item.frequency),
    Amount: penceToCurrency(item.amountPence),
    'Net cash impact': getNetCashImpact(item),
  }))
));

const buildBudgetScheduleRows = ({ budgetItems, categories, categoryMap, profile, currentMonth, includeNotes }) => (
  [...budgetItems]
    .sort((left, right) => `${left.startMonth}${left.name}`.localeCompare(`${right.startMonth}${right.name}`))
    .map((item) => {
      const defaultGrowthBps = item.flowType === 'income'
        ? profile.annualIncomeGrowthBps
        : profile.annualExpenseInflationBps;
      const base = {
        Item: neutralizeSpreadsheetText(item.name),
        Group: getGroupName(item, categories),
        Category: getCategoryName(categoryMap, item.categoryId),
        Flow: humanize(item.flowType),
        Classification: humanize(item.classification),
        'Cash treatment': humanize(item.cashTreatment),
        Frequency: humanize(item.frequency === 'one_off' ? 'once' : item.frequency === 'annual' ? 'yearly' : item.frequency),
        'Base amount': penceToCurrency(item.amountPence),
        'Monthly equivalent': item.frequency === 'monthly'
          ? penceToCurrency(item.amountPence)
          : item.frequency === 'annual' ? penceToCurrency(item.amountPence) / 12 : '',
        'Start month': item.startMonth || '',
        'End month': item.endMonth || '',
        'Annual month': item.frequency === 'annual' ? Number(item.annualMonth) || Number(String(item.startMonth).slice(5, 7)) : '',
        'Applied annual growth': bpsToDecimal(item.annualGrowthBps ?? defaultGrowthBps),
        'Schedule status': isHistoricalFinanceItem(item, currentMonth)
          ? 'Past'
          : item.startMonth > currentMonth ? 'Future' : 'Current',
      };
      if (includeNotes) {
        base.Owner = neutralizeSpreadsheetText(item.ownerLabel);
        base.Notes = neutralizeSpreadsheetText(item.notes);
      }
      return base;
    })
);

const buildActualRows = ({ actualEntries, budgetItemMap, categoryMap, categories, includeNotes }) => (
  [...actualEntries]
    .sort((left, right) => String(left.occurredOn).localeCompare(String(right.occurredOn)))
    .map((entry) => {
      const item = {
        ...entry,
        name: budgetItemMap.get(entry.budgetItemId) || '',
      };
      const base = {
        Date: normalizeDate(entry.occurredOn),
        Month: monthFromDate(entry.occurredOn),
        Flow: humanize(entry.flowType),
        Group: getGroupName(item, categories),
        Category: getCategoryName(categoryMap, entry.categoryId),
        Item: budgetItemMap.get(entry.budgetItemId) || '',
        'Cash treatment': humanize(entry.cashTreatment),
        Amount: penceToCurrency(entry.amountPence),
        'Net cash impact': getNetCashImpact(entry),
      };
      if (includeNotes) base.Note = neutralizeSpreadsheetText(entry.note);
      return base;
    })
);

const buildBalanceRows = ({ snapshots, forecast, includeNotes }) => {
  const forecastByMonth = new Map(forecast.map((month) => [month.monthKey, month]));
  return [...snapshots]
    .sort((left, right) => String(left.asOfMonth).localeCompare(String(right.asOfMonth)))
    .map((snapshot) => {
      const plan = forecastByMonth.get(snapshot.asOfMonth);
      const base = {
        Month: snapshot.asOfMonth,
        'Recorded savings': penceToCurrency(snapshot.cashBalancePence),
        'Planned closing savings': plan ? penceToCurrency(plan.closingCashPence) : '',
        Variance: plan ? penceToCurrency(snapshot.cashBalancePence - plan.closingCashPence) : '',
      };
      if (includeNotes) base.Note = neutralizeSpreadsheetText(snapshot.note);
      return base;
    });
};

const buildGoalRows = ({ goals, includeNotes }) => goals.map((goal) => {
  const current = penceToCurrency(goal.currentBalancePence);
  const target = nullablePenceToCurrency(goal.targetBalancePence);
  const base = {
    Goal: neutralizeSpreadsheetText(goal.name),
    Type: humanize(goal.goalType),
    'Current balance': current,
    'Target balance': target,
    Gap: target === '' ? '' : Math.max(0, target - current),
    'Target date': normalizeDate(goal.targetDate),
    'Monthly contribution': penceToCurrency(goal.monthlyContributionPence),
    Priority: Number(goal.priority) || '',
    Protected: goal.isProtected ? 'Yes' : 'No',
  };
  if (includeNotes) base.Notes = neutralizeSpreadsheetText(goal.notes);
  return base;
});

const buildMortgageRows = (mortgages) => mortgages.map((mortgage) => {
  const projection = buildMortgageProjection({
    balancePence: mortgage.outstandingBalancePence,
    annualRateBps: mortgage.annualRateBps,
    remainingMonths: mortgage.remainingMonths,
    monthlyPaymentPence: mortgage.contractualPaymentPence,
    monthlyOverpaymentPence: mortgage.voluntaryOverpaymentPence,
    months: mortgage.remainingMonths,
  });
  const propertyValue = nullablePenceToCurrency(mortgage.propertyValuePence);
  const balance = penceToCurrency(mortgage.outstandingBalancePence);
  return {
    Mortgage: neutralizeSpreadsheetText(mortgage.name),
    'Outstanding balance': balance,
    'Interest rate': bpsToDecimal(mortgage.annualRateBps),
    'Remaining months': Number(mortgage.remainingMonths) || 0,
    'Contractual payment': penceToCurrency(mortgage.contractualPaymentPence),
    'Voluntary overpayment': penceToCurrency(mortgage.voluntaryOverpaymentPence),
    'Projected total monthly payment': penceToCurrency(projection.totalMonthlyPaymentPence),
    'Property value': propertyValue,
    LTV: propertyValue === '' || propertyValue <= 0 ? '' : balance / propertyValue,
    'Fixed rate end': normalizeDate(mortgage.fixedRateEndDate),
    'Expected future rate': mortgage.expectedFutureRateBps === null || mortgage.expectedFutureRateBps === undefined
      ? ''
      : bpsToDecimal(mortgage.expectedFutureRateBps),
    'Projected payoff months': projection.closingBalancePence === 0 ? projection.schedule.length : '',
    'Projected interest': penceToCurrency(projection.totalInterestPence),
    'Projected balance at term': penceToCurrency(projection.closingBalancePence),
  };
});

const buildScenarioRows = ({ scenarios, scenarioChanges, includeNotes }) => {
  const changesByScenario = new Map();
  scenarioChanges.forEach((change) => {
    const existing = changesByScenario.get(change.scenarioId) || [];
    existing.push(change);
    changesByScenario.set(change.scenarioId, existing);
  });
  const rows = scenarios.flatMap((scenario) => {
    const changes = changesByScenario.get(scenario.id) || [];
    return changes.map((change) => {
      const base = {
        Scenario: neutralizeSpreadsheetText(scenario.name),
        Change: neutralizeSpreadsheetText(change?.name),
        'Effective month': change?.effectiveMonth || '',
        Type: humanize(change?.changeType),
        Amount: change ? penceToCurrency(change.amountPence) : '',
        Frequency: change ? humanize(change.frequency === 'one_off' ? 'once' : change.frequency === 'annual' ? 'yearly' : change.frequency) : '',
        Classification: change ? humanize(change.classification) : '',
        'Included in monthly plan': 'No',
      };
      if (includeNotes) base.Description = neutralizeSpreadsheetText(scenario.description);
      return base;
    });
  });
  return rows;
};

const defineSheet = (name, headers, rows, widths, formats = {}, rowFormats = {}) => ({
  name,
  headers,
  rows,
  widths,
  formats,
  rowFormats,
});

export function buildFinanceAnalysisExportData({
  profile = {},
  categories = [],
  budgetItems = [],
  actualEntries = [],
  balanceSnapshots = [],
  goals = [],
  mortgages = [],
  scenarios = [],
  scenarioChanges = [],
  forecast = [],
  range = 'overview',
  includeNotes = false,
  generatedAt = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local browser time',
} = {}) {
  const safeGeneratedAt = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const effectiveGeneratedAt = Number.isNaN(safeGeneratedAt.getTime()) ? new Date() : safeGeneratedAt;
  const effectiveRange = RANGE_LABELS.has(range) ? range : 'overview';
  const currentMonth = getCurrentMonthKey(effectiveGeneratedAt);
  const bounds = getRangeBounds(effectiveRange, currentMonth);
  const rangeLabel = RANGE_LABELS.get(effectiveRange);
  const currencyCode = String(profile.currencyCode || 'GBP').toUpperCase().slice(0, 3);
  const selectedForecast = forecast.filter((month) => isMonthInRange(month.monthKey, bounds));
  const selectedActualEntries = actualEntries.filter((entry) => isMonthInRange(monthFromDate(entry.occurredOn), bounds));
  const selectedSnapshots = balanceSnapshots.filter((snapshot) => isMonthInRange(snapshot.asOfMonth, bounds));
  const selectedBudgetItems = budgetItems.filter((item) => doesScheduleOverlapRange(item, bounds));
  const selectedScenarioChanges = scenarioChanges.filter((change) => isMonthInRange(change.effectiveMonth, bounds));
  const categoryMap = makeCategoryMap(categories);
  const budgetItemMap = makeBudgetItemMap(budgetItems);

  const instructionsRows = buildInstructionsRows({
    currencyCode,
    rangeLabel,
    includeNotes,
    actualEntriesMayBeTruncated: actualEntries.length >= 500,
  });
  const settingsRows = buildSettingsRows({
    generatedAt: effectiveGeneratedAt,
    timeZone,
    currencyCode,
    rangeLabel,
    profile,
    includeNotes,
    actualEntries,
    exportedActualEntries: selectedActualEntries,
  });
  const monthlySummaryRows = buildMonthlySummaryRows({
    forecast: selectedForecast,
    snapshots: selectedSnapshots,
    actualEntries: selectedActualEntries,
  });
  const planLineRows = buildPlanLineRows({ forecast: selectedForecast, categories, categoryMap });
  const budgetScheduleRows = buildBudgetScheduleRows({
    budgetItems: selectedBudgetItems,
    categories,
    categoryMap,
    profile,
    currentMonth,
    includeNotes,
  });
  const actualRows = buildActualRows({
    actualEntries: selectedActualEntries,
    budgetItemMap,
    categoryMap,
    categories,
    includeNotes,
  });
  const balanceRows = buildBalanceRows({ snapshots: selectedSnapshots, forecast: selectedForecast, includeNotes });
  const goalRows = buildGoalRows({ goals, includeNotes });
  const mortgageRows = buildMortgageRows(mortgages);
  const scenarioRows = buildScenarioRows({ scenarios, scenarioChanges: selectedScenarioChanges, includeNotes });

  const scheduleHeaders = [
    'Item', 'Group', 'Category', 'Flow', 'Classification', 'Cash treatment', 'Frequency',
    'Base amount', 'Monthly equivalent', 'Start month', 'End month', 'Annual month',
    'Applied annual growth', 'Schedule status',
    ...(includeNotes ? ['Owner', 'Notes'] : []),
  ];
  const actualHeaders = [
    'Date', 'Month', 'Flow', 'Group', 'Category', 'Item', 'Cash treatment', 'Amount',
    'Net cash impact', ...(includeNotes ? ['Note'] : []),
  ];
  const balanceHeaders = [
    'Month', 'Recorded savings', 'Planned closing savings', 'Variance',
    ...(includeNotes ? ['Note'] : []),
  ];
  const goalHeaders = [
    'Goal', 'Type', 'Current balance', 'Target balance', 'Gap', 'Target date',
    'Monthly contribution', 'Priority', 'Protected', ...(includeNotes ? ['Notes'] : []),
  ];
  const scenarioHeaders = [
    'Scenario', 'Change', 'Effective month', 'Type', 'Amount', 'Frequency',
    'Classification', 'Included in monthly plan', ...(includeNotes ? ['Description'] : []),
  ];

  const sheets = [
    defineSheet('01_SETTINGS', ['Field', 'Value'], settingsRows, [30, 64], {}, {
      'Opening savings': '#,##0.00',
      'Protected savings floor': '#,##0.00',
      'Annual expense inflation': '0.0%',
      'Annual income growth': '0.0%',
    }),
    defineSheet('02_MONTHLY_SUMMARY', [
      'Month', 'Planned income', 'Planned essential expenses', 'Planned discretionary expenses',
      'Planned wealth building', 'Planned cash expenses', 'Internal transfers', 'Planned surplus',
      'Savings rate', 'Opening savings', 'Planned closing savings', 'Recorded savings',
      'Recorded vs plan', 'Emergency cover (months)', 'Below protected floor', 'Actual income',
      'Actual expenses', 'Actual surplus', 'Actual entries recorded',
    ], monthlySummaryRows, [12, 16, 20, 22, 20, 20, 17, 17, 14, 18, 22, 18, 18, 20, 20, 16, 17, 17, 21], {
      'Planned income': '#,##0.00',
      'Planned essential expenses': '#,##0.00',
      'Planned discretionary expenses': '#,##0.00',
      'Planned wealth building': '#,##0.00',
      'Planned cash expenses': '#,##0.00',
      'Internal transfers': '#,##0.00',
      'Planned surplus': '#,##0.00',
      'Savings rate': '0.0%',
      'Opening savings': '#,##0.00',
      'Planned closing savings': '#,##0.00',
      'Recorded savings': '#,##0.00',
      'Recorded vs plan': '#,##0.00',
      'Emergency cover (months)': '0.0',
      'Actual income': '#,##0.00',
      'Actual expenses': '#,##0.00',
      'Actual surplus': '#,##0.00',
    }),
    defineSheet('03_PLAN_LINES', [
      'Month', 'Item', 'Group', 'Category', 'Flow', 'Classification', 'Cash treatment',
      'Frequency', 'Amount', 'Net cash impact',
    ], planLineRows, [12, 28, 25, 24, 12, 18, 18, 14, 15, 18], {
      Amount: '#,##0.00',
      'Net cash impact': '#,##0.00;[Red]-#,##0.00',
    }),
    defineSheet('04_BUDGET_SCHEDULE', scheduleHeaders, budgetScheduleRows,
      [28, 25, 24, 12, 18, 18, 14, 16, 18, 13, 13, 14, 20, 16, 18, 46].slice(0, scheduleHeaders.length), {
        'Base amount': '#,##0.00',
        'Monthly equivalent': '#,##0.00',
        'Applied annual growth': '0.0%',
      }),
    defineSheet('05_ACTUALS', actualHeaders, actualRows,
      [13, 12, 12, 25, 24, 28, 18, 15, 18, 46].slice(0, actualHeaders.length), {
        Amount: '#,##0.00',
        'Net cash impact': '#,##0.00;[Red]-#,##0.00',
      }),
    defineSheet('06_BALANCES', balanceHeaders, balanceRows,
      [12, 20, 24, 18, 46].slice(0, balanceHeaders.length), {
        'Recorded savings': '#,##0.00',
        'Planned closing savings': '#,##0.00',
        Variance: '#,##0.00;[Red]-#,##0.00',
      }),
    defineSheet('07_GOALS', goalHeaders, goalRows,
      [28, 18, 18, 18, 16, 14, 21, 10, 12, 46].slice(0, goalHeaders.length), {
        'Current balance': '#,##0.00',
        'Target balance': '#,##0.00',
        Gap: '#,##0.00',
        'Monthly contribution': '#,##0.00',
      }),
    defineSheet('08_MORTGAGES', [
      'Mortgage', 'Outstanding balance', 'Interest rate', 'Remaining months', 'Contractual payment',
      'Voluntary overpayment', 'Projected total monthly payment', 'Property value', 'LTV',
      'Fixed rate end', 'Expected future rate', 'Projected payoff months', 'Projected interest',
      'Projected balance at term',
    ], mortgageRows, [28, 20, 15, 17, 20, 21, 30, 18, 12, 16, 21, 22, 19, 25], {
      'Outstanding balance': '#,##0.00',
      'Interest rate': '0.00%',
      'Contractual payment': '#,##0.00',
      'Voluntary overpayment': '#,##0.00',
      'Projected total monthly payment': '#,##0.00',
      'Property value': '#,##0.00',
      LTV: '0.0%',
      'Expected future rate': '0.00%',
      'Projected interest': '#,##0.00',
      'Projected balance at term': '#,##0.00',
    }),
  ];
  if (scenarioRows.length) {
    sheets.push(defineSheet('09_SCENARIOS', scenarioHeaders, scenarioRows,
      [28, 30, 16, 16, 16, 15, 18, 24, 48].slice(0, scenarioHeaders.length), {
        Amount: '#,##0.00',
      }));
  }

  return {
    fileName: `pmworkspace-finance-analysis_${effectiveGeneratedAt.toISOString().slice(0, 10)}.xlsx`,
    currentMonth,
    range: effectiveRange,
    rangeLabel,
    includeNotes,
    instructionsRows,
    settingsRows,
    monthlySummaryRows,
    planLineRows,
    budgetScheduleRows,
    actualRows,
    balanceRows,
    goalRows,
    mortgageRows,
    scenarioRows,
    sheets,
  };
}

const applyNumberFormats = (XLSX, worksheet, headers, rows, formats) => {
  Object.entries(formats).forEach(([header, format]) => {
    const columnIndex = headers.indexOf(header);
    if (columnIndex < 0) return;
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address];
      if (cell && cell.t === 'n') cell.z = format;
    }
  });
};

const applyRowFormats = (XLSX, worksheet, headers, rows, rowFormats) => {
  const fieldColumnIndex = headers.indexOf('Field');
  const valueColumnIndex = headers.indexOf('Value');
  if (fieldColumnIndex < 0 || valueColumnIndex < 0) return;
  rows.forEach((row, rowIndex) => {
    const format = rowFormats[row.Field];
    if (!format) return;
    const address = XLSX.utils.encode_cell({ r: rowIndex + 1, c: valueColumnIndex });
    const cell = worksheet[address];
    if (cell && cell.t === 'n') cell.z = format;
  });
};

const createDataWorksheet = (XLSX, definition) => {
  const worksheet = XLSX.utils.aoa_to_sheet([definition.headers]);
  if (definition.rows.length) {
    XLSX.utils.sheet_add_json(worksheet, definition.rows, {
      header: definition.headers,
      origin: 'A2',
      skipHeader: true,
    });
  }
  worksheet['!cols'] = definition.widths.map((wch) => ({ wch }));
  worksheet['!autofilter'] = {
    ref: `A1:${XLSX.utils.encode_col(Math.max(0, definition.headers.length - 1))}${Math.max(1, definition.rows.length + 1)}`,
  };
  applyNumberFormats(XLSX, worksheet, definition.headers, definition.rows, definition.formats);
  applyRowFormats(XLSX, worksheet, definition.headers, definition.rows, definition.rowFormats);
  return worksheet;
};

export function createFinanceAnalysisWorkbook(XLSX, exportData) {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet(exportData.instructionsRows);
  instructions['!cols'] = [{ wch: 24 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, instructions, '00_READ_ME');
  exportData.sheets.forEach((definition) => {
    XLSX.utils.book_append_sheet(workbook, createDataWorksheet(XLSX, definition), definition.name);
  });
  return workbook;
}

export async function downloadFinanceAnalysisWorkbook(input = {}) {
  const exportData = buildFinanceAnalysisExportData(input);
  const XLSX = await loadXLSX();
  const workbook = createFinanceAnalysisWorkbook(XLSX, exportData);
  XLSX.writeFile(workbook, exportData.fileName, { compression: true });
  return { fileName: exportData.fileName, exportData };
}
