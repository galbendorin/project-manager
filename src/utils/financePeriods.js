import { addMonths, formatMonthLabel } from './financePlanner.js';

export const FINANCE_PLAN_VIEW_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'halfyear', label: 'Half-year' },
  { value: 'yearly', label: 'Yearly' },
];

const PERIOD_LENGTHS = { quarterly: 3, halfyear: 6, yearly: 12 };
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const pence = value => Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;

export const getFinancePlanYears = (forecast = []) => [...new Set(forecast
  .filter(month => monthPattern.test(month.monthKey))
  .map(month => month.monthKey.slice(0, 4)))].sort();

export const buildFinancePeriods = ({ forecast = [], view, year, snapshots = [] } = {}) => {
  const length = PERIOD_LENGTHS[view];
  if (!length || !/^\d{4}$/.test(String(year))) return [];
  const monthMap = new Map(forecast.filter(month => monthPattern.test(month.monthKey)
    && month.monthKey.slice(0, 4) === String(year)).map(month => [month.monthKey, month]));
  const snapshotMap = new Map(snapshots.map(snapshot => [snapshot.asOfMonth, snapshot]));
  const periods = [];
  for (let start = 1; start <= 12; start += length) {
    const calendarStart = `${year}-${String(start).padStart(2, '0')}`;
    const keys = Array.from({ length }, (_, offset) => addMonths(calendarStart, offset));
    const months = keys.map(key => monthMap.get(key)).filter(Boolean);
    if (!months.length) continue;
    const first = months[0], last = months.at(-1);
    const itemTotals = new Map();
    months.forEach(month => (month.lineItems || []).forEach(item => {
      if (item.id) itemTotals.set(item.id, (itemTotals.get(item.id) || 0) + pence(item.amountPence));
    }));
    const label = view === 'quarterly' ? `Q${Math.floor((start - 1) / 3) + 1} ${year}`
      : view === 'halfyear' ? `H${start === 1 ? 1 : 2} ${year}` : String(year);
    periods.push({
      id: `${view}:${calendarStart}`, label, months, itemTotals,
      startMonth: first.monthKey, endMonth: last.monthKey,
      rangeLabel: first.monthKey === last.monthKey ? formatMonthLabel(first.monthKey)
        : `${formatMonthLabel(first.monthKey)} – ${formatMonthLabel(last.monthKey)}`,
      monthCount: months.length, expectedMonths: length, isPartial: months.length !== length,
      incomePence: months.reduce((sum, month) => sum + pence(month.incomePence), 0),
      expensePence: months.reduce((sum, month) => sum + pence(month.expensePence), 0),
      surplusPence: months.reduce((sum, month) => sum + pence(month.surplusPence), 0),
      internalTransfersPence: months.reduce((sum, month) => sum + pence(month.internalTransfersPence), 0),
      closingCashPence: last.closingCashPence ?? null,
      recordedClosingCashPence: snapshotMap.get(last.monthKey)?.cashBalancePence ?? null,
    });
  }
  return periods;
};

// Keep whole calendar periods, starting with the one containing the chosen month.
// Only the forecast's own boundaries can make a period partial.
export const buildFinanceTimelinePeriods = ({ forecast = [], view, referenceMonth, snapshots = [] } = {}) => {
  if (!monthPattern.test(referenceMonth)) return [];
  return getFinancePlanYears(forecast)
    .flatMap(year => buildFinancePeriods({ forecast, view, year, snapshots }))
    .filter(period => period.endMonth >= referenceMonth);
};
