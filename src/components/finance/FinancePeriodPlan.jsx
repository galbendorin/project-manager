import React, { useMemo, useState } from 'react';
import { formatCurrency, formatMonthLabel } from '../../utils/financePlanner';
import { buildFinancePlanSections } from '../../utils/financePlanRows';
import { buildFinanceTimelinePeriods, FINANCE_PLAN_VIEW_OPTIONS } from '../../utils/financePeriods';

const money = (value, currency) => value === null || value === undefined ? '—' : formatCurrency(value, currency, {
  minimumFractionDigits: value % 100 === 0 ? 0 : 2,
  maximumFractionDigits: value % 100 === 0 ? 0 : 2,
});
const results = [
  { label: 'Income total', field: 'incomePence', tone: 'text-emerald-700' },
  { label: 'Expenses total', field: 'expensePence', tone: 'text-slate-950' },
  { label: 'Left in period', field: 'surplusPence', tone: 'text-emerald-700' },
  { label: 'Planned savings at end', field: 'closingCashPence', tone: 'text-violet-700' },
  { label: 'Recorded savings at end', field: 'recordedClosingCashPence', tone: 'text-sky-700' },
];
const sectionTone = tone => tone === 'income' ? 'text-emerald-800 bg-emerald-50'
  : tone === 'transfer' ? 'text-sky-800 bg-sky-50' : tone === 'extra' ? 'text-amber-800 bg-amber-50' : 'text-slate-800 bg-slate-50';
const sectionLabel = section => section.tone === 'transfer' ? 'Transfers (not spending)' : section.label;
const totalForSection = (section, period) => section.items.reduce((sum, item) => sum + (period.itemTotals.get(item.id) || 0), 0);
const labelColumn = 'sticky left-0 w-[145px] min-w-[145px] max-w-[145px] sm:w-[205px] sm:min-w-[205px] sm:max-w-[205px]';

export const financePeriodEditMonth = (item, referenceMonth) => {
  if (referenceMonth < item.startMonth) return item.startMonth;
  if (item.endMonth && referenceMonth > item.endMonth) return item.endMonth;
  return referenceMonth;
};

export function FinancePlanViewSwitch({ value, onChange }) {
  return <label className="flex flex-wrap items-center gap-3 text-[14px] font-semibold text-slate-700">View by
    <select value={value} onChange={event => onChange(event.target.value)} className="pm-input min-h-[44px] min-w-[160px] rounded-xl bg-white px-3 text-[16px] text-slate-950 sm:text-[14px]">
      {FINANCE_PLAN_VIEW_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export default function FinancePeriodPlan({ view, referenceMonth, forecast = [], budgetItems = [], categories = [], snapshots = [], currencyCode = 'GBP', onOpenMonth, onChangeMonth, onEdit }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const periods = useMemo(() => buildFinanceTimelinePeriods({ forecast, view, referenceMonth, snapshots }), [forecast, view, referenceMonth, snapshots]);
  const label = FINANCE_PLAN_VIEW_OPTIONS.find(option => option.value === view)?.label || 'Period';
  const sections = useMemo(() => buildFinancePlanSections(budgetItems, categories)
    .map(section => ({ ...section, items: section.items.filter(item => periods.some(period => (period.itemTotals.get(item.id) || 0) > 0)) }))
    .filter(section => section.items.length), [budgetItems, categories, periods]);
  const toggleSection = id => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const itemLabel = item => {
    const duplicates = budgetItems.filter(candidate => candidate.name === item.name).length > 1;
    return duplicates ? `${item.name} · ${item.startMonth}${item.endMonth ? ` to ${item.endMonth}` : ''}` : item.name;
  };
  if (!periods.length) return <section aria-label={`${label} household plan`} className="rounded-2xl border border-slate-200 bg-white p-5 text-[14px] text-slate-600">No forecast months available for this view.</section>;

  return <section aria-label={`${label} household plan`} className="min-w-0 rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5">
      <div>
        <h2 className="text-[18px] font-semibold text-slate-950">Household plan · {label}</h2>
        <p className="mt-1 text-[13px] leading-5 text-slate-500">{formatMonthLabel(periods[0].startMonth)} to {formatMonthLabel(periods.at(-1).endMonth)} · {periods.length} {view === 'quarterly' ? 'quarters' : view === 'halfyear' ? 'half-years' : 'years'}</p>
      </div>
      <label className="min-w-0 text-[12px] font-semibold text-slate-500 sm:w-[180px] sm:shrink-0">Start from
          <select value={referenceMonth} onChange={event => onChangeMonth(event.target.value)} className="pm-input mt-1 block min-h-[44px] w-full rounded-xl px-3 text-[16px] text-slate-950 sm:text-[14px]">
            {forecast.map(month => <option key={month.monthKey} value={month.monthKey}>{formatMonthLabel(month.monthKey)}</option>)}
          </select>
      </label>
    </div>
    <p className="px-4 pt-3 text-[12px] leading-5 text-slate-500 sm:px-5">Scroll right to plan further ahead. Totals cover whole calendar periods; savings show the balance at each period’s end. Partial periods include only months in your plan.</p>
    <div className="flex flex-wrap justify-end gap-2 px-3 pt-2">
      <button type="button" onClick={() => setExpanded(new Set(sections.map(section => section.id)))} className="min-h-[44px] rounded-lg px-3 text-[12px] font-semibold text-[var(--pm-accent)]">Expand all</button>
      <button type="button" onClick={() => setExpanded(new Set())} className="min-h-[44px] rounded-lg px-3 text-[12px] font-semibold text-slate-500">Collapse all</button>
    </div>

    <div className="p-3 pt-1 sm:p-4 sm:pt-1">
      <div key={`${view}:${referenceMonth}`} tabIndex="0" role="region" aria-label={`${label} plan table. Scroll horizontally for future periods.`} className="overflow-x-auto rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--pm-accent)]/30">
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px]">
          <caption className="sr-only">{label} household income, grouped expenses and end-of-period savings across the forecast.</caption>
          <thead><tr><th scope="col" className={`${labelColumn} z-20 border-b border-r border-slate-200 bg-slate-50 p-3 text-left text-slate-700`}>Household plan</th>
            {periods.map(period => <th scope="col" key={period.id} className="w-[132px] min-w-[132px] max-w-[132px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-right align-top text-slate-800">
              <span className="block font-bold">{period.label}</span><span title={period.rangeLabel} className="mt-1 block text-[11px] font-normal text-slate-500">{period.rangeLabel.replace(/\s\d{4}/g, '')}</span>
              {period.isPartial ? <span className="mt-1 block text-[11px] font-semibold text-amber-700">Partial · {period.monthCount} of {period.expectedMonths} months</span> : null}
              <button type="button" onClick={() => onOpenMonth(period.startMonth)} className="mt-1 min-h-[44px] text-[12px] font-semibold text-[var(--pm-accent)]" aria-label={`Open ${period.label} in Monthly`}>Monthly detail</button>
            </th>)}
          </tr></thead>
          {sections.map(section => <tbody key={section.id}>
            <tr><th scope="row" className={`${labelColumn} z-10 border-r border-t border-slate-200 px-3 py-1 text-left ${sectionTone(section.tone)}`}>
              <button type="button" aria-expanded={expanded.has(section.id)} onClick={() => toggleSection(section.id)} className="flex min-h-[44px] w-full items-center gap-2 text-left font-semibold"><span aria-hidden="true">{expanded.has(section.id) ? '▾' : '▸'}</span>{sectionLabel(section)}</button>
            </th>{periods.map(period => <td key={period.id} className={`border-t border-slate-200 px-3 py-2 text-right font-bold tabular-nums ${sectionTone(section.tone)}`}>{money(totalForSection(section, period), currencyCode)}</td>)}</tr>
            {expanded.has(section.id) ? section.items.map(item => <tr key={item.id}><th scope="row" className={`${labelColumn} z-10 border-r border-t border-slate-100 bg-white px-3 py-1 text-left font-normal text-slate-600`}><button type="button" onClick={() => onEdit(item, financePeriodEditMonth(item, referenceMonth))} className="min-h-[44px] w-full break-words text-left hover:text-[var(--pm-accent)]">{itemLabel(item)}</button></th>{periods.map(period => <td key={period.id} className="border-t border-slate-100 px-3 py-3 text-right tabular-nums text-slate-700">{money(period.itemTotals.get(item.id) || 0, currencyCode)}</td>)}</tr>) : null}
          </tbody>)}
          <tbody>{results.map(result => <tr key={result.field}><th scope="row" className={`${labelColumn} z-10 border-r border-t border-slate-200 bg-white px-3 py-3 text-left font-semibold text-slate-700`}>{result.label}</th>{periods.map(period => <td key={period.id} className={`border-t border-slate-200 px-3 py-3 text-right font-bold tabular-nums ${period[result.field] < 0 ? 'text-rose-700' : result.tone}`}>{money(period[result.field], currencyCode)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>

  </section>;
}
