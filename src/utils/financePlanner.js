export const FINANCE_HORIZON_OPTIONS = [
  { value: 36, label: '3 years' },
  { value: 60, label: '5 years' },
  { value: 120, label: '10 years' },
];

export const DEFAULT_FINANCE_SETTINGS = {
  currencyCode: 'GBP',
  openingCashPence: 0,
  forecastStartMonth: '',
  emergencyTargetMonths: 6,
  protectedCashFloorPence: 0,
  annualExpenseInflationBps: 250,
  annualIncomeGrowthBps: 0,
};

export const DEFAULT_FINANCE_CATEGORIES = [
  { name: 'Salary', flowType: 'income', classification: 'essential' },
  { name: 'Housing', flowType: 'expense', classification: 'essential' },
  { name: 'Utilities', flowType: 'expense', classification: 'essential' },
  { name: 'Food', flowType: 'expense', classification: 'essential' },
  { name: 'Transport', flowType: 'expense', classification: 'essential' },
  { name: 'Family & childcare', flowType: 'expense', classification: 'essential' },
  { name: 'Lifestyle', flowType: 'expense', classification: 'discretionary' },
  { name: 'Personal spending', flowType: 'expense', classification: 'discretionary' },
  { name: 'Savings & investments', flowType: 'expense', classification: 'wealth_building' },
  { name: 'Irregular costs', flowType: 'expense', classification: 'essential' },
];

const PENCE_PER_POUND = 100;
const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const pad2 = (value) => String(value).padStart(2, '0');

const asInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

const firstOfMonth = (year, monthIndex) => new Date(year, monthIndex, 1, 12);

export const getCurrentMonthKey = (date = new Date()) => {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return getCurrentMonthKey(new Date());
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`;
};

export const normalizeMonthKey = (value, fallback = getCurrentMonthKey()) => {
  const raw = String(value || '').slice(0, 7);
  return MONTH_KEY_PATTERN.test(raw) ? raw : fallback;
};

export const monthKeyToDate = (monthKey) => {
  const normalized = normalizeMonthKey(monthKey);
  const [year, month] = normalized.split('-').map(Number);
  return firstOfMonth(year, month - 1);
};

export const addMonths = (monthKey, amount) => {
  const date = monthKeyToDate(monthKey);
  date.setMonth(date.getMonth() + asInteger(amount));
  return getCurrentMonthKey(date);
};

export const compareMonthKeys = (left, right) => (
  normalizeMonthKey(left).localeCompare(normalizeMonthKey(right))
);

export const formatMonthLabel = (monthKey, options = {}) => (
  monthKeyToDate(monthKey).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    ...options,
  })
);

export const parseCurrencyToPence = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * PENCE_PER_POUND);
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^0-9,.-]/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  if (!normalized || normalized === '-' || normalized === '.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * PENCE_PER_POUND) : null;
};

export const formatCurrency = (pence, currencyCode = 'GBP', options = {}) => (
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currencyCode || 'GBP',
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(asInteger(pence) / PENCE_PER_POUND)
);

export const formatPercent = (decimal, digits = 0) => {
  const value = Number(decimal);
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
};

export const isItemActiveInMonth = (item = {}, monthKey) => {
  const month = normalizeMonthKey(monthKey);
  const startMonth = item.startMonth || item.start_month || item.effectiveMonth || item.effective_month || '';
  const endMonth = item.endMonth || item.end_month || '';
  const frequency = item.frequency || 'monthly';
  const annualMonth = Number(item.annualMonth || item.annual_month || 0);

  if (startMonth && compareMonthKeys(month, startMonth) < 0) return false;
  if (endMonth && compareMonthKeys(month, endMonth) > 0) return false;
  if (frequency === 'one_off') return Boolean(startMonth) && month === normalizeMonthKey(startMonth);
  if (frequency === 'annual') {
    const monthNumber = Number(month.slice(5, 7));
    const referenceMonth = annualMonth || Number(normalizeMonthKey(startMonth || month).slice(5, 7));
    return monthNumber === referenceMonth;
  }
  return true;
};

export const getItemAmountForMonth = ({
  item = {},
  monthKey,
  forecastStartMonth,
  annualExpenseInflationBps = 0,
  annualIncomeGrowthBps = 0,
} = {}) => {
  const baseAmount = Math.max(0, asInteger(item.amountPence ?? item.amount_pence));
  if (!baseAmount || !isItemActiveInMonth(item, monthKey)) return 0;

  const isIncome = (item.flowType || item.flow_type) === 'income';
  const configuredBps = isIncome ? annualIncomeGrowthBps : annualExpenseInflationBps;
  const overrideBps = item.annualGrowthBps ?? item.annual_growth_bps ?? item.inflationOverrideBps ?? item.inflation_override_bps;
  const bps = asInteger(overrideBps, asInteger(configuredBps));
  if (!bps) return baseAmount;

  const startYear = Number(normalizeMonthKey(forecastStartMonth || monthKey).slice(0, 4));
  const targetYear = Number(normalizeMonthKey(monthKey).slice(0, 4));
  const growthYears = Math.max(0, targetYear - startYear);
  return Math.round(baseAmount * ((1 + (bps / 10000)) ** growthYears));
};

export const calculateSavingsRate = (incomePence, surplusPence) => {
  const income = asInteger(incomePence);
  return income > 0 ? asInteger(surplusPence) / income : null;
};

export const calculateEmergencyCoverage = (cashPence, monthlyLeanSpendPence) => {
  const leanSpend = asInteger(monthlyLeanSpendPence);
  return leanSpend > 0 ? asInteger(cashPence) / leanSpend : null;
};

export const calculateSinkingFundContribution = (annualCostPence) => (
  Math.round(Math.max(0, asInteger(annualCostPence)) / 12)
);

export const calculateLoanPayment = ({ principalPence = 0, annualRateBps = 0, termMonths = 0 } = {}) => {
  const principal = Math.max(0, asInteger(principalPence));
  const months = Math.max(0, asInteger(termMonths));
  if (!principal || !months) return 0;
  const monthlyRate = Math.max(0, Number(annualRateBps) || 0) / 10000 / 12;
  if (!monthlyRate) return Math.round(principal / months);
  return Math.round((principal * monthlyRate) / (1 - ((1 + monthlyRate) ** -months)));
};

export const buildMortgageProjection = ({
  balancePence = 0,
  annualRateBps = 0,
  remainingMonths = 0,
  monthlyPaymentPence = 0,
  monthlyOverpaymentPence = 0,
  months = remainingMonths,
} = {}) => {
  const totalMonths = Math.max(0, Math.min(asInteger(months), asInteger(remainingMonths)));
  const rate = Math.max(0, Number(annualRateBps) || 0) / 10000 / 12;
  const scheduledPayment = Math.max(0, asInteger(monthlyPaymentPence))
    || calculateLoanPayment({ principalPence: balancePence, annualRateBps, termMonths: remainingMonths });
  const overpayment = Math.max(0, asInteger(monthlyOverpaymentPence));
  let balance = Math.max(0, asInteger(balancePence));
  let totalInterestPence = 0;
  const schedule = [];

  for (let month = 0; month < totalMonths && balance > 0; month += 1) {
    const interestPence = Math.round(balance * rate);
    const paymentPence = Math.min(balance + interestPence, scheduledPayment + overpayment);
    const principalPence = Math.max(0, paymentPence - interestPence);
    balance = Math.max(0, balance - principalPence);
    totalInterestPence += interestPence;
    schedule.push({ month: month + 1, interestPence, paymentPence, principalPence, closingBalancePence: balance });
  }

  return {
    monthlyPaymentPence: scheduledPayment,
    totalMonthlyPaymentPence: scheduledPayment + overpayment,
    balancePence: Math.max(0, asInteger(balancePence)),
    closingBalancePence: balance,
    totalInterestPence,
    schedule,
  };
};

export const calculateMortgageSummary = ({
  balancePence = 0,
  annualRateBps = 0,
  remainingMonths = 0,
  propertyValuePence = 0,
  monthlyOverpaymentPence = 0,
} = {}) => {
  const standardPaymentPence = calculateLoanPayment({ principalPence: balancePence, annualRateBps, termMonths: remainingMonths });
  const projection = buildMortgageProjection({
    balancePence,
    annualRateBps,
    remainingMonths,
    monthlyPaymentPence: standardPaymentPence,
    monthlyOverpaymentPence,
    months: remainingMonths,
  });
  const propertyValue = asInteger(propertyValuePence);
  const balance = Math.max(0, asInteger(balancePence));
  return {
    standardPaymentPence,
    totalPaymentPence: standardPaymentPence + Math.max(0, asInteger(monthlyOverpaymentPence)),
    totalInterestPence: projection.totalInterestPence,
    ltv: propertyValue > 0 ? balance / propertyValue : null,
    payoffMonths: projection.schedule.length,
    closingBalancePence: projection.closingBalancePence,
  };
};

const toForecastItem = (item = {}) => ({
  ...item,
  flowType: item.flowType || item.flow_type || 'expense',
  classification: item.classification || 'essential',
  cashTreatment: item.cashTreatment || item.cash_treatment || 'cash_outflow',
});

export const buildFinanceForecast = ({
  budgetItems = [],
  scenarioItems = [],
  startMonth = getCurrentMonthKey(),
  months = 36,
  openingCashPence = 0,
  annualExpenseInflationBps = 0,
  annualIncomeGrowthBps = 0,
  protectedCashFloorPence = 0,
} = {}) => {
  const horizon = Math.max(1, Math.min(120, asInteger(months, 36)));
  const forecastStartMonth = normalizeMonthKey(startMonth);
  const allItems = [...budgetItems, ...scenarioItems].map(toForecastItem);
  let openingCash = asInteger(openingCashPence);

  return Array.from({ length: horizon }, (_, index) => {
    const monthKey = addMonths(forecastStartMonth, index);
    const lineItems = allItems
      .map((item) => ({
        ...item,
        amountPence: getItemAmountForMonth({
          item,
          monthKey,
          forecastStartMonth,
          annualExpenseInflationBps,
          annualIncomeGrowthBps,
        }),
      }))
      .filter((item) => item.amountPence > 0);

    const summary = lineItems.reduce((totals, item) => {
      if (item.cashTreatment === 'internal_transfer') {
        totals.internalTransfersPence += item.amountPence;
        return totals;
      }
      if (item.flowType === 'income') {
        totals.incomePence += item.amountPence;
        return totals;
      }
      totals.expensePence += item.amountPence;
      if (item.classification === 'wealth_building') totals.wealthBuildingPence += item.amountPence;
      else if (item.classification === 'discretionary') totals.discretionaryPence += item.amountPence;
      else totals.essentialPence += item.amountPence;
      return totals;
    }, {
      incomePence: 0,
      expensePence: 0,
      essentialPence: 0,
      discretionaryPence: 0,
      wealthBuildingPence: 0,
      internalTransfersPence: 0,
    });

    const surplusPence = summary.incomePence - summary.expensePence;
    const closingCashPence = openingCash + surplusPence;
    const month = {
      monthKey,
      openingCashPence: openingCash,
      closingCashPence,
      surplusPence,
      savingsRate: calculateSavingsRate(summary.incomePence, surplusPence),
      emergencyCoverageMonths: calculateEmergencyCoverage(closingCashPence, summary.essentialPence),
      belowProtectedFloor: closingCashPence < asInteger(protectedCashFloorPence),
      ...summary,
      lineItems,
    };
    openingCash = closingCashPence;
    return month;
  });
};

export const summarizeForecast = (forecast = []) => {
  const first = forecast[0] || null;
  const last = forecast[forecast.length - 1] || null;
  const nextNegativeMonth = forecast.find((month) => month.surplusPence < 0) || null;
  const belowFloorMonth = forecast.find((month) => month.belowProtectedFloor) || null;
  return {
    first,
    last,
    nextNegativeMonth,
    belowFloorMonth,
    totalSurplusPence: forecast.reduce((sum, month) => sum + month.surplusPence, 0),
  };
};

export const createSampleFinanceData = ({ startMonth = getCurrentMonthKey() } = {}) => {
  const nextApril = `${Number(startMonth.slice(0, 4)) + (Number(startMonth.slice(5, 7)) > 4 ? 1 : 0)}-04`;
  const beforeApril = addMonths(nextApril, -1);
  const item = (id, name, amountPence, options = {}) => ({
    id,
    name,
    amountPence,
    frequency: 'monthly',
    startMonth,
    flowType: 'expense',
    classification: 'essential',
    cashTreatment: 'cash_outflow',
    ...options,
  });

  return {
    settings: {
      ...DEFAULT_FINANCE_SETTINGS,
      openingCashPence: 1800000,
      forecastStartMonth: startMonth,
      emergencyTargetMonths: 6,
      protectedCashFloorPence: 1800000,
      annualExpenseInflationBps: 0,
      annualIncomeGrowthBps: 0,
    },
    budgetItems: [
      item('income-1', 'Income Partner 1', 354700, { flowType: 'income', classification: 'essential' }),
      item('income-2', 'Income Partner 2', 206800, { flowType: 'income', classification: 'essential' }),
      item('mortgage-required', 'Contractual mortgage', 70000),
      item('mortgage-overpayment', 'Voluntary mortgage overpayment', 50000, { classification: 'wealth_building' }),
      item('water', 'Water', 7000),
      item('insurance', 'Home and health insurance', 10000),
      item('subscriptions', 'Subscriptions and football', 15900, { classification: 'discretionary' }),
      item('council-tax', 'Council tax', 22400),
      item('energy', 'Energy and gas', 15000),
      item('internet', 'Internet', 4000),
      item('food', 'Food', 85000),
      item('transport', 'Transport', 20000),
      item('dining', 'Dining out and entertainment', 30000, { classification: 'discretionary' }),
      item('childcare-current', 'Existing childcare', 13500, { endMonth: beforeApril }),
      item('childcare-nursery', 'Nursery and childcare', 83500, { startMonth: nextApril }),
      item('pocket-1', 'Pocket money partner 1', 30000, { classification: 'discretionary' }),
      item('pocket-2-current', 'Pocket money partner 2', 37000, { classification: 'discretionary', endMonth: beforeApril }),
      item('pocket-2-future', 'Pocket money partner 2', 52000, { classification: 'discretionary', startMonth: nextApril }),
    ],
    goals: [
      { id: 'emergency-fund', name: 'Emergency fund', goalType: 'emergency', currentBalancePence: 1800000, targetBalancePence: null, monthlyContributionPence: 0, isProtected: true },
    ],
    mortgage: {
      outstandingBalancePence: 16000000,
      contractualPaymentPence: 70000,
      voluntaryOverpaymentPence: 50000,
      annualRateBps: 450,
      remainingMonths: 300,
      propertyValuePence: 30000000,
    },
  };
};
