import React, { useMemo, useState } from 'react';
import { formatCurrency, getCurrentMonthKey } from '../../utils/financePlanner';
import { buildFinancePlanSections } from '../../utils/financePlanRows';
import { buildFinancePeriods, FINANCE_PLAN_VIEW_OPTIONS, getFinancePlanYears } from '../../utils/financePeriods';

const buttonClass = 'min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-700 disabled:opacity-40';
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

export function FinancePlanViewSwitch({ value, onChange }) {
  return <div role="group" aria-label="Plan period" className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:grid-cols-4">
    {FINANCE_PLAN_VIEW_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={value === option.value}
      onClick={() => onChange(option.value)} className={`min-h-[44px] rounded-lg px-3 text-[14px] font-semibold transition ${value === option.value ? 'bg-[var(--pm-accent)] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{option.label}</button>)}
  </div>;
}

export default function FinancePeriodPlan({ view, referenceMonth, forecast = [], budgetItems = [], categories = [], snapshots = [], currencyCode = 'GBP', onOpenMonth }) {
  const years = useMemo(() => getFinancePlanYears(forecast), [forecast]);
  const [chosenYear, setChosenYear] = useState(referenceMonth?.slice(0, 4) || '');
  const [chosenPeriod, setChosenPeriod] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const year = years.includes(chosenYear) ? chosenYear : years.includes(referenceMonth?.slice(0, 4)) ? referenceMonth.slice(0, 4) : years[0];
  const yearIndex = years.indexOf(year);
  const periods = useMemo(() => buildFinancePeriods({ forecast, view, year, snapshots }), [forecast, view, year, snapshots]);
  const selected = periods.find(period => period.id === chosenPeriod)
    || periods.find(period => period.months.some(month => month.monthKey === referenceMonth)) || periods[0];
  const label = FINANCE_PLAN_VIEW_OPTIONS.find(option => option.value === view)?.label || 'Period';
  const sections = useMemo(() => buildFinancePlanSections(budgetItems, categories)
    .map(section => ({ ...section, items: section.items.filter(item => periods.some(period => (period.itemTotals.get(item.id) || 0) > 0)) }))
    .filter(section => section.items.length), [budgetItems, categories, periods]);
  const toggleSection = id => setExpanded(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const currentYear = getCurrentMonthKey().slice(0, 4);
  const itemLabel = item => {
    const duplicates = budgetItems.filter(candidate => candidate.name === item.name).length > 1;
    return duplicates ? `${item.name} · ${item.startMonth}${item.endMonth ? ` to ${item.endMonth}` : ''}` : item.name;
  };
  if (!selected) return <section aria-label={`${label} household plan`} className="rounded-2xl border border-slate-200 bg-white p-5 text-[14px] text-slate-600">No forecast months available for this view.</section>;

  return <section aria-label={`${label} household plan`} className="min-w-0 rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5">
      <div>
        <h2 className="text-[18px] font-semibold text-slate-950">{label} plan · {year}</h2>
        <p className="mt-1 text-[13px] leading-5 text-slate-500">{view === 'quarterly' ? 'Calendar quarters: Jan–Mar, Apr–Jun, Jul–Sep and Oct–Dec.' : view === 'halfyear' ? 'Calendar halves: Jan–Jun and Jul–Dec.' : 'Calendar year: January to December.'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" className={buttonClass} aria-label="Previous year" disabled={yearIndex <= 0} onClick={() => setChosenYear(years[yearIndex - 1])}>←</button>
        <label className="min-w-0 flex-1 text-[12px] font-semibold text-slate-500">Year
          <select value={year} onChange={event => setChosenYear(event.target.value)} className="pm-input mt-1 block min-h-[44px] w-full rounded-xl px-3 text-[16px] text-slate-950 sm:text-[14px]">
            {years.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <button type="button" className={buttonClass} aria-label="Next year" disabled={yearIndex >= years.length - 1} onClick={() => setChosenYear(years[yearIndex + 1])}>→</button>
        {years.includes(currentYear) && year !== currentYear ? <button type="button" className={buttonClass} onClick={() => setChosenYear(currentYear)}>This year</button> : null}
      </div>
    </div>
    <p className="px-4 pt-3 text-[12px] leading-5 text-slate-500 sm:px-5">Income, expenses and money left are period totals. Savings show the balance at the last shown month. Partial periods include only months in your plan.</p>
    <div className="flex flex-wrap justify-end gap-2 px-3 pt-2">
      <button type="button" onClick={() => setExpanded(new Set(sections.map(section => section.id)))} className="min-h-[44px] rounded-lg px-3 text-[12px] font-semibold text-[var(--pm-accent)]">Expand all</button>
      <button type="button" onClick={() => setExpanded(new Set())} className="min-h-[44px] rounded-lg px-3 text-[12px] font-semibold text-slate-500">Collapse all</button>
    </div>

    <div className="hidden p-4 pt-1 lg:block">
      <div tabIndex="0" role="region" aria-label={`${label} plan table. Scroll horizontally if needed.`} className="overflow-x-auto rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--pm-accent)]/30">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <caption className="sr-only">{label} household income, grouped expenses and end-of-period savings for {year}.</caption>
          <thead><tr><th scope="col" className="sticky left-0 z-20 min-w-[220px] border-b border-r border-slate-200 bg-slate-50 p-3 text-left text-slate-700">Household plan</th>
            {periods.map(period => <th scope="col" key={period.id} className="min-w-[140px] border-b border-slate-200 bg-slate-50 p-3 text-right text-slate-800">
              <span className="block font-bold">{period.label}</span><span className="mt-1 block text-[11px] font-normal text-slate-500">{period.rangeLabel}</span>
              {period.isPartial ? <span className="mt-1 block text-[11px] font-semibold text-amber-700">Partial · {period.monthCount} of {period.expectedMonths} months</span> : null}
              <button type="button" onClick={() => onOpenMonth(period.startMonth)} className="mt-1 min-h-[44px] text-[12px] font-semibold text-[var(--pm-accent)]" aria-label={`Open ${period.label} in Monthly`}>Monthly detail</button>
            </th>)}
          </tr></thead>
          {sections.map(section => <tbody key={section.id}>
            <tr><th scope="row" className={`sticky left-0 z-10 border-r border-t border-slate-200 px-3 py-1 text-left ${sectionTone(section.tone)}`}>
              <button type="button" aria-expanded={expanded.has(section.id)} onClick={() => toggleSection(section.id)} className="flex min-h-[44px] w-full items-center gap-2 text-left font-semibold"><span aria-hidden="true">{expanded.has(section.id) ? '▾' : '▸'}</span>{sectionLabel(section)}</button>
            </th>{periods.map(period => <td key={period.id} className={`border-t border-slate-200 px-3 py-2 text-right font-bold tabular-nums ${sectionTone(section.tone)}`}>{money(totalForSection(section, period), currencyCode)}</td>)}</tr>
            {expanded.has(section.id) ? section.items.map(item => <tr key={item.id}><th scope="row" className="sticky left-0 z-10 border-r border-t border-slate-100 bg-white px-4 py-3 text-left font-normal text-slate-600">{itemLabel(item)}</th>{periods.map(period => <td key={period.id} className="border-t border-slate-100 px-3 py-3 text-right tabular-nums text-slate-700">{money(period.itemTotals.get(item.id) || 0, currencyCode)}</td>)}</tr>) : null}
          </tbody>)}
          <tbody>{results.map(result => <tr key={result.field}><th scope="row" className="sticky left-0 z-10 border-r border-t border-slate-200 bg-white px-3 py-3 text-left font-semibold text-slate-700">{result.label}</th>{periods.map(period => <td key={period.id} className={`border-t border-slate-200 px-3 py-3 text-right font-bold tabular-nums ${period[result.field] < 0 ? 'text-rose-700' : result.tone}`}>{money(period[result.field], currencyCode)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>

    <div className="px-3 pb-4 lg:hidden">
      {periods.length > 1 ? <label className="mb-3 block text-[12px] font-semibold text-slate-500">{view === 'quarterly' ? 'Quarter' : 'Half-year'}
        <select value={selected.id} onChange={event => setChosenPeriod(event.target.value)} className="pm-input mt-1 block min-h-[44px] w-full rounded-xl px-3 text-[16px] text-slate-950">{periods.map(period => <option key={period.id} value={period.id}>{period.label} · {period.rangeLabel}{period.isPartial ? ' · Partial' : ''}</option>)}</select>
      </label> : null}
      <div className="rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 p-3"><h3 className="text-[16px] font-bold text-slate-900">{selected.label}</h3><p className="mt-1 text-[12px] text-slate-500">{selected.rangeLabel}</p>{selected.isPartial ? <p className="mt-1 text-[12px] font-semibold text-amber-700">Partial · {selected.monthCount} of {selected.expectedMonths} months</p> : null}</div>
        {sections.map(section => <div key={section.id} className="border-b border-slate-100">
          <button type="button" aria-expanded={expanded.has(section.id)} onClick={() => toggleSection(section.id)} className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] font-semibold ${sectionTone(section.tone)}`}><span><span aria-hidden="true">{expanded.has(section.id) ? '▾' : '▸'} </span>{sectionLabel(section)}</span><span className="shrink-0 tabular-nums">{money(totalForSection(section, selected), currencyCode)}</span></button>
          {expanded.has(section.id) ? <dl className="space-y-2 px-3 py-3">{section.items.map(item => <div key={item.id} className="flex justify-between gap-3 text-[13px] text-slate-600"><dt className="min-w-0 break-words">{itemLabel(item)}</dt><dd className="shrink-0 tabular-nums">{money(selected.itemTotals.get(item.id) || 0, currencyCode)}</dd></div>)}</dl> : null}
        </div>)}
        <dl className="space-y-3 p-3">{results.map(result => <div key={result.field} className="flex justify-between gap-3 text-[13px]"><dt className="text-slate-600">{result.label}</dt><dd className={`shrink-0 font-bold tabular-nums ${selected[result.field] < 0 ? 'text-rose-700' : result.tone}`}>{money(selected[result.field], currencyCode)}</dd></div>)}</dl>
      </div>
      <button type="button" onClick={() => onOpenMonth(selected.startMonth)} className={`${buttonClass} mt-3 w-full`}>Open {selected.label} in Monthly</button>
    </div>
  </section>;
}
