import {
  addMonths,
  normalizeMonthKey,
  parseCurrencyToPence,
} from './financePlanner.js';

const MONTHS = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sept', 'sep'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
];

const MONTH_LOOKUP = new Map(
  MONTHS.flatMap((names, index) => names.map((name) => [name, index + 1])),
);
const MONTH_PATTERN = MONTHS.flat().sort((left, right) => right.length - left.length).join('|');
const NAMED_MONTH_PATTERN = new RegExp(`\\b(${MONTH_PATTERN})(?:\\s+(20\\d{2}))?\\b`, 'i');
const END_MONTH_PATTERN = new RegExp(`\\b(?:until|ending|ends?|to)\\s+(${MONTH_PATTERN})(?:\\s+(20\\d{2}))?\\b`, 'i');
const SCHEDULE_MONTH_PATTERN = new RegExp(`\\b(?:from|in|on|due|starting|starts?|every)\\s+(${MONTH_PATTERN})(?:\\s+(20\\d{2}))?\\b`, 'i');
const CURRENCY_AMOUNT_PATTERN = /(?:£|gbp\s*)-?\d[\d,]*(?:\.\d{1,2})?/i;
const NUMBER_PATTERN = /\b\d[\d,]*(?:\.\d{1,2})?\b/g;

export const FINANCE_QUICK_ENTRY_EXAMPLES = {
  regular: [
    'Energy £150 monthly',
    'Salary £3,547 monthly income',
    'Pocket money £300 monthly optional',
    'Childcare £835 monthly from April 2027',
  ],
  other: [
    'MOT £350 in October',
    'Car insurance £800 every February',
    'Holiday £1,400 in November',
    'Birthday £600 in August 2027 optional',
  ],
};

const pad2 = (value) => String(value).padStart(2, '0');

const monthKeyFromParts = (monthNumber, year, startMonth) => {
  const normalizedStart = normalizeMonthKey(startMonth);
  const [startYear, startMonthNumber] = normalizedStart.split('-').map(Number);
  const resolvedYear = year || startYear + (monthNumber < startMonthNumber ? 1 : 0);
  return `${resolvedYear}-${pad2(monthNumber)}`;
};

const monthKeyFromMatch = (match, startMonth) => {
  if (!match) return '';
  const monthNumber = MONTH_LOOKUP.get(String(match[1] || '').toLowerCase());
  if (!monthNumber) return '';
  return monthKeyFromParts(monthNumber, Number(match[2]) || null, startMonth);
};

const findExplicitMonthKey = (text, startMonth) => {
  const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  const slashMatch = text.match(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/);
  if (slashMatch) return `${slashMatch[2]}-${pad2(slashMatch[1])}`;
  if (/\bnext month\b/i.test(text)) return addMonths(startMonth, 1);
  if (/\bthis month\b/i.test(text)) return normalizeMonthKey(startMonth);
  return '';
};

const findScheduleMonth = (text, startMonth) => (
  findExplicitMonthKey(text, startMonth)
  || monthKeyFromMatch(text.match(SCHEDULE_MONTH_PATTERN), startMonth)
  || monthKeyFromMatch(text.match(NAMED_MONTH_PATTERN), startMonth)
  || normalizeMonthKey(startMonth)
);

const findEndMonth = (text, startMonth) => (
  monthKeyFromMatch(text.match(END_MONTH_PATTERN), startMonth)
  || ''
);

const findAmount = (text) => {
  const currencyMatch = text.match(CURRENCY_AMOUNT_PATTERN);
  if (currencyMatch) {
    return {
      amountPence: parseCurrencyToPence(currencyMatch[0]),
      matchedText: currencyMatch[0],
      matchIndex: currencyMatch.index,
    };
  }

  const candidates = [...text.matchAll(NUMBER_PATTERN)]
    .map((match) => ({
      amountPence: parseCurrencyToPence(match[0]),
      matchedText: match[0],
      matchIndex: match.index,
      numericValue: Number(match[0].replace(/,/g, '')),
    }))
    .filter((candidate) => !(candidate.numericValue >= 1900 && candidate.numericValue <= 2100));
  return candidates.at(-1) || { amountPence: null, matchedText: '', matchIndex: -1 };
};

const removeMatchedText = (text, matchedText, matchIndex) => {
  if (!matchedText || matchIndex < 0) return text;
  return `${text.slice(0, matchIndex)} ${text.slice(matchIndex + matchedText.length)}`;
};

const cleanName = (text, amountMatch) => {
  const withoutAmount = removeMatchedText(text, amountMatch.matchedText, amountMatch.matchIndex);
  const datePattern = `(?:${MONTH_PATTERN})(?:\\s+20\\d{2})?`;
  const cleaned = withoutAmount
    .replace(new RegExp(`\\b(?:from|in|on|due|starting|starts?|until|ending|ends?|to|every)\\s+${datePattern}\\b`, 'gi'), ' ')
    .replace(/\b(?:20\d{2}-(?:0[1-9]|1[0-2])|(?:0?[1-9]|1[0-2])[/-]20\d{2})\b/g, ' ')
    .replace(/\b(?:this|next)\s+month\b/gi, ' ')
    .replace(/\b(?:every|each|per)\s+month\b/gi, ' ')
    .replace(/\b(?:monthly|annually|annual|yearly|every\s+year|once|one[- ]off)\b/gi, ' ')
    .replace(/\b(?:income|expense|required|essential|optional|discretionary)\b/gi, ' ')
    .replace(/[|:;,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim();
  if (!cleaned) return '';
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
};

const inferFlowType = (text, mode) => {
  if (mode === 'other') return 'expense';
  return /\b(?:income|salary|wages?|paycheck|pension|money\s+in)\b/i.test(text)
    ? 'income'
    : 'expense';
};

const inferClassification = (text, flowType) => {
  if (flowType === 'income') return 'essential';
  if (/\b(?:saving|savings|investment|investing|overpayment)\b/i.test(text)) return 'wealth_building';
  if (/\b(?:optional|discretionary|holiday|dining|restaurant|entertainment|pocket\s+money|subscription|netflix|spotify)\b/i.test(text)) return 'discretionary';
  return 'essential';
};

const inferCategoryHint = (text, flowType, mode) => {
  if (flowType === 'income') return 'Salary';
  const rules = [
    ['Housing', /\b(?:mortgage|rent|council\s+tax|home\s+insurance|house\s+insurance)\b/i],
    ['Utilities', /\b(?:energy|electric(?:ity)?|gas|water|internet|broadband|phone)\b/i],
    ['Food', /\b(?:food|grocer(?:y|ies))\b/i],
    ['Transport', /\b(?:mot|fuel|petrol|diesel|transport|car|vehicle|road\s+tax)\b/i],
    ['Family & childcare', /\b(?:child|childcare|school|nursery|family|birthday)\b/i],
    ['Lifestyle', /\b(?:dining|restaurant|entertainment|subscription|gym|membership|netflix|spotify|streaming|football|holiday|vacation)\b/i],
    ['Personal spending', /\b(?:pocket\s+money|clothes|clothing|hair)\b/i],
    ['Savings & investments', /\b(?:saving|savings|investment|investing|overpayment)\b/i],
    ['Irregular costs', /\b(?:repair|insurance|gift)\b/i],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || (mode === 'other' ? 'Irregular costs' : '');
};

export const findFinanceCategoryId = (categories = [], categoryHint = '', flowType = 'expense') => {
  const normalizedHint = String(categoryHint || '').trim().toLowerCase();
  return categories.find((category) => (
    category.flowType === flowType
    && String(category.name || '').trim().toLowerCase() === normalizedHint
  ))?.id || '';
};

export const parseFinanceQuickEntry = (input, { mode = 'regular', startMonth } = {}) => {
  const text = String(input || '').trim();
  const normalizedStart = normalizeMonthKey(startMonth);
  const errors = [];
  const warnings = [];
  if (!text) errors.push('Type a description and amount.');

  const amountMatch = findAmount(text);
  if (amountMatch.amountPence === null || amountMatch.amountPence <= 0) {
    errors.push('Include an amount, for example £350.');
  }

  const name = cleanName(text, amountMatch);
  if (!name) errors.push('Include a short description, for example MOT or Energy.');

  const flowType = inferFlowType(text, mode);
  const classification = inferClassification(text, flowType);
  const annual = mode === 'other' && /\b(?:annually|annual|yearly|every\s+year|every\s+(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec))\b/i.test(text);
  const frequency = mode === 'regular' ? 'monthly' : annual ? 'annual' : 'one_off';
  const hasMonth = Boolean(findExplicitMonthKey(text, normalizedStart) || text.match(SCHEDULE_MONTH_PATTERN) || text.match(NAMED_MONTH_PATTERN));
  const itemStartMonth = findScheduleMonth(text, normalizedStart);
  const endMonth = mode === 'regular' ? findEndMonth(text, itemStartMonth) : '';

  if (endMonth && endMonth < itemStartMonth) {
    errors.push('The end month must be after the start month.');
  }
  if (!hasMonth && mode === 'other') {
    warnings.push('No due month was included, so this is placed in the first plan month.');
  }

  const categoryHint = inferCategoryHint(text, flowType, mode);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    item: {
      name,
      amountPence: amountMatch.amountPence || 0,
      flowType,
      classification,
      frequency,
      startMonth: itemStartMonth,
      endMonth,
      annualMonth: frequency === 'annual' ? Number(itemStartMonth.slice(5, 7)) : null,
      categoryHint,
      cashTreatment: 'cash_outflow',
      isActive: true,
    },
  };
};
