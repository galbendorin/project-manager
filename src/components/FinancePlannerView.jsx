import React, { useMemo, useState } from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import {
  buildFinanceForecast,
  FINANCE_HORIZON_OPTIONS,
  formatCurrency,
  formatMonthLabel,
  getItemAmountForMonth,
  parseCurrencyToPence,
} from '../utils/financePlanner';

const TABS = [
  { id: 'regular', label: 'Regular' },
  { id: 'other', label: 'Other' },
  { id: 'plan', label: 'Plan' },
];

const fieldClass = 'pm-input w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-950 placeholder:text-slate-400';
const primaryButton = 'pm-toolbar-primary rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50';

const penceToInput = (value) => String(Math.round((Number(value) || 0) / 100));

const Section = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white ${className}`}>{children}</section>
);

const SectionHeader = ({ title, detail, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
    <div>
      <h2 className="text-lg font-black tracking-[-0.025em] text-slate-950">{title}</h2>
      {detail ? <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p> : null}
    </div>
    {action}
  </div>
);

const PlannerTabs = ({ activeTab, onChange }) => (
  <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
    {TABS.map((tab) => (
      <button
        key={tab.id}
        type="button"
        onClick={() => onChange(tab.id)}
        className={`rounded-lg px-3 py-2.5 text-sm font-black transition ${activeTab === tab.id ? 'bg-[var(--pm-accent)] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

const SummaryStrip = ({ currentMonth, openingCashPence, currencyCode }) => {
  const cells = [
    { label: 'Income', value: currentMonth?.incomePence || 0, tone: 'text-emerald-700' },
    { label: 'Expenses', value: currentMonth?.expensePence || 0, tone: 'text-slate-950' },
    { label: 'Monthly saving', value: currentMonth?.surplusPence || 0, tone: (currentMonth?.surplusPence || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700' },
    { label: 'Opening savings', value: openingCashPence, tone: 'text-slate-950' },
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-4">
      {cells.map((cell, index) => (
        <div key={cell.label} className={`px-4 py-3 ${index % 2 ? 'border-l border-slate-100' : ''} ${index >= 2 ? 'border-t border-slate-100 lg:border-t-0' : ''} ${index > 0 ? 'lg:border-l' : ''}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{cell.label}</div>
          <div className={`mt-1 text-xl font-black tracking-[-0.035em] ${cell.tone}`}>{formatCurrency(cell.value, currencyCode)}</div>
        </div>
      ))}
    </div>
  );
};

const PlannerItemForm = ({ mode, categories, initialItem, startMonth, saving, onSave, onClose }) => {
  const isOther = mode === 'other';
  const initial = initialItem || {
    name: '', amountPence: 0, flowType: 'expense', classification: 'essential',
    frequency: isOther ? 'one_off' : 'monthly', startMonth, endMonth: '',
    categoryId: '', cashTreatment: 'cash_outflow', isActive: true,
  };
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(penceToInput(initial.amountPence));
  const [flowType, setFlowType] = useState(initial.flowType);
  const [classification, setClassification] = useState(initial.classification);
  const [frequency, setFrequency] = useState(initial.frequency);
  const [itemStartMonth, setItemStartMonth] = useState(initial.startMonth || startMonth);
  const [endMonth, setEndMonth] = useState(initial.endMonth || '');
  const [categoryId, setCategoryId] = useState(initial.categoryId || '');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const amountPence = parseCurrencyToPence(amount);
    if (!name.trim() || amountPence === null || amountPence <= 0) {
      setError('Enter a description and an amount greater than zero.');
      return;
    }
    try {
      await onSave({
        ...initialItem,
        name: name.trim(),
        amountPence,
        flowType,
        classification: flowType === 'income' ? 'essential' : classification,
        frequency: isOther ? frequency : 'monthly',
        startMonth: itemStartMonth,
        endMonth: isOther && frequency === 'one_off' ? '' : endMonth,
        annualMonth: isOther && frequency === 'annual' ? Number(itemStartMonth.slice(5, 7)) : null,
        categoryId,
        cashTreatment: 'cash_outflow',
        isActive: true,
      });
      onClose();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save this row.');
    }
  };

  return (
    <form onSubmit={submit} className="border-b border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-slate-500">Description<input value={name} onChange={(event) => setName(event.target.value)} placeholder={isOther ? 'e.g. MOT or holiday' : 'e.g. Energy and gas'} className={`${fieldClass} mt-1`} autoFocus /></label>
        <label className="text-xs font-bold text-slate-500">Amount<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0" className={`${fieldClass} mt-1`} /></label>
        {!isOther ? <label className="text-xs font-bold text-slate-500">Money in or out<select value={flowType} onChange={(event) => setFlowType(event.target.value)} className={`${fieldClass} mt-1`}><option value="expense">Expense</option><option value="income">Income</option></select></label> : <label className="text-xs font-bold text-slate-500">Repeats<select value={frequency} onChange={(event) => setFrequency(event.target.value)} className={`${fieldClass} mt-1`}><option value="one_off">Once</option><option value="annual">Every year</option></select></label>}
        <label className="text-xs font-bold text-slate-500">{isOther ? 'Due month' : 'Starts'}<input type="month" value={itemStartMonth} onChange={(event) => setItemStartMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label>
        {!isOther ? <label className="text-xs font-bold text-slate-500">Ends (optional)<input type="month" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label> : null}
        {flowType === 'expense' ? <label className="text-xs font-bold text-slate-500">Budget type<select value={classification} onChange={(event) => setClassification(event.target.value)} className={`${fieldClass} mt-1`}><option value="essential">Required</option><option value="discretionary">Optional</option><option value="wealth_building">Saving / overpayment</option></select></label> : null}
        <label className="text-xs font-bold text-slate-500">Category (optional)<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={`${fieldClass} mt-1`}><option value="">No category</option>{categories.filter((category) => category.flowType === flowType).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving...' : 'Save row'}</button></div>
    </form>
  );
};

const ItemRows = ({ items, categories, currencyCode, onEdit, onDelete }) => {
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  if (!items.length) return <p className="px-4 py-8 text-center text-sm text-slate-500">No rows yet.</p>;
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(130px,0.7fr)_minmax(120px,0.6fr)_auto] sm:items-center sm:px-5">
          <div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{item.name}</div><div className="mt-0.5 text-xs font-semibold text-slate-400">{categoryNames.get(item.categoryId) || (item.flowType === 'income' ? 'Income' : item.classification === 'essential' ? 'Required' : item.classification === 'wealth_building' ? 'Saving / overpayment' : 'Optional')}</div></div>
          <div className="text-xs font-semibold text-slate-500">{item.frequency === 'one_off' ? formatMonthLabel(item.startMonth) : item.frequency === 'annual' ? `Every ${formatMonthLabel(item.startMonth, { year: undefined })}` : `${formatMonthLabel(item.startMonth)}${item.endMonth ? ` - ${formatMonthLabel(item.endMonth)}` : ' onward'}`}</div>
          <div className={`text-sm font-black ${item.flowType === 'income' ? 'text-emerald-700' : 'text-slate-950'}`}>{item.flowType === 'income' ? '+' : '-'}{formatCurrency(item.amountPence, currencyCode)}</div>
          <div className="flex gap-3 text-xs font-bold"><button type="button" onClick={() => onEdit(item)} className="text-slate-500 hover:text-slate-950">Edit</button><button type="button" onClick={() => { if (window.confirm(`Delete ${item.name}?`)) void onDelete(item.id); }} className="text-rose-600 hover:text-rose-700">Delete</button></div>
        </div>
      ))}
    </div>
  );
};

const ProfileSettings = ({ profile, saving, onSave, onReset }) => {
  const [openingCash, setOpeningCash] = useState(penceToInput(profile.openingCashPence));
  const [startMonth, setStartMonth] = useState(profile.forecastStartMonth);
  const [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const openingCashPence = parseCurrencyToPence(openingCash);
    if (openingCashPence === null) { setMessage('Enter a valid opening savings balance.'); return; }
    try { await onSave({ openingCashPence, forecastStartMonth: startMonth }); setMessage('Plan settings saved.'); } catch (error) { setMessage(error?.message || 'Unable to save plan settings.'); }
  };
  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-700">Plan settings</summary>
      <form onSubmit={submit} className="grid gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-bold text-slate-500">Opening savings<input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" className={`${fieldClass} mt-1`} /></label>
        <label className="text-xs font-bold text-slate-500">Plan starts<input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label>
        <button type="submit" disabled={saving} className={secondaryButton}>Save settings</button>
        {message ? <p className="text-sm font-semibold text-slate-500 sm:col-span-3">{message}</p> : null}
        <div className="border-t border-slate-100 pt-3 sm:col-span-3"><button type="button" onClick={() => { if (window.confirm('Remove all Financial Planner data? This cannot be undone.')) void onReset(); }} className="text-xs font-bold text-rose-600">Reset all Finance data</button></div>
      </form>
    </details>
  );
};

const RegularView = ({ finance, currentMonth, currencyCode }) => {
  const [editingItem, setEditingItem] = useState(null);
  const [adding, setAdding] = useState(false);
  const regularItems = useMemo(() => finance.budgetItems.filter((item) => item.frequency === 'monthly').sort((left, right) => `${left.flowType === 'income' ? '0' : '1'}${left.name}`.localeCompare(`${right.flowType === 'income' ? '0' : '1'}${right.name}`)), [finance.budgetItems]);
  const incomeItems = regularItems.filter((item) => item.flowType === 'income');
  const expenseItems = regularItems.filter((item) => item.flowType === 'expense');
  const closeForm = () => { setAdding(false); setEditingItem(null); };
  return (
    <div className="space-y-4">
      <SummaryStrip currentMonth={currentMonth} openingCashPence={finance.profile.openingCashPence} currencyCode={currencyCode} />
      <Section>
        <SectionHeader title="Regular income and expenses" detail="Amounts that normally repeat every month." action={<button type="button" onClick={() => { setEditingItem(null); setAdding(true); }} className={primaryButton}>Add regular row</button>} />
        {adding || editingItem ? <PlannerItemForm key={editingItem?.id || 'new-regular'} mode="regular" categories={finance.categories} initialItem={editingItem} startMonth={finance.profile.forecastStartMonth} saving={finance.saving} onSave={finance.saveBudgetItem} onClose={closeForm} /> : null}
        <div className="bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 sm:px-5">Income</div>
        <ItemRows items={incomeItems} categories={finance.categories} currencyCode={currencyCode} onEdit={(item) => { setAdding(false); setEditingItem(item); }} onDelete={finance.deleteBudgetItem} />
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 sm:px-5">Expenses</div>
        <ItemRows items={expenseItems} categories={finance.categories} currencyCode={currencyCode} onEdit={(item) => { setAdding(false); setEditingItem(item); }} onDelete={finance.deleteBudgetItem} />
      </Section>
      <ProfileSettings profile={finance.profile} saving={finance.saving} onSave={finance.saveProfile} onReset={finance.resetFinanceData} />
    </div>
  );
};

const OtherView = ({ finance, currencyCode }) => {
  const [editingItem, setEditingItem] = useState(null);
  const [adding, setAdding] = useState(false);
  const otherItems = useMemo(() => finance.budgetItems.filter((item) => item.frequency !== 'monthly').sort((left, right) => `${left.startMonth}${left.name}`.localeCompare(`${right.startMonth}${right.name}`)), [finance.budgetItems]);
  const closeForm = () => { setAdding(false); setEditingItem(null); };
  return (
    <Section>
      <SectionHeader title="Other and future costs" detail="Add MOT, insurance, birthdays, holidays, repairs, or any other dated cost. Each row appears automatically in the Plan." action={<button type="button" onClick={() => { setEditingItem(null); setAdding(true); }} className={primaryButton}>Add other cost</button>} />
      {adding || editingItem ? <PlannerItemForm key={editingItem?.id || 'new-other'} mode="other" categories={finance.categories} initialItem={editingItem} startMonth={finance.profile.forecastStartMonth} saving={finance.saving} onSave={finance.saveBudgetItem} onClose={closeForm} /> : null}
      <ItemRows items={otherItems} categories={finance.categories} currencyCode={currencyCode} onEdit={(item) => { setAdding(false); setEditingItem(item); }} onDelete={finance.deleteBudgetItem} />
    </Section>
  );
};

const PlanRow = ({ label, months, valueForMonth, tone = 'text-slate-800', strong = false, currencyCode }) => (
  <tr className="border-t border-slate-100">
    <th scope="row" className={`sticky left-0 z-10 min-w-[210px] border-r border-slate-200 bg-white px-3 py-2 text-left text-xs ${strong ? 'font-black text-slate-950' : 'font-semibold text-slate-600'}`}>{label}</th>
    {months.map((month) => {
      const value = valueForMonth(month);
      return <td key={month.monthKey} className={`min-w-[108px] px-3 py-2 text-right text-xs ${strong ? 'font-black' : 'font-semibold'} ${tone}`}>{value === null || value === undefined || value === 0 ? '' : formatCurrency(value, currencyCode)}</td>;
    })}
  </tr>
);

const PlanGroup = ({ label, months }) => <tr><th className="sticky left-0 z-20 border-r border-slate-200 bg-slate-100 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</th>{months.map((month) => <td key={month.monthKey} className="bg-slate-100" />)}</tr>;

const MonthlyPlanTable = ({ forecast, budgetItems, snapshots, profile, currencyCode }) => {
  const snapshotByMonth = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.asOfMonth, snapshot])), [snapshots]);
  const regularIncome = budgetItems.filter((item) => item.frequency === 'monthly' && item.flowType === 'income');
  const regularExpenses = budgetItems.filter((item) => item.frequency === 'monthly' && item.flowType === 'expense');
  const otherItems = budgetItems.filter((item) => item.frequency !== 'monthly');
  const amountFor = (item, month) => getItemAmountForMonth({ item, monthKey: month.monthKey, forecastStartMonth: profile.forecastStartMonth, annualExpenseInflationBps: profile.annualExpenseInflationBps, annualIncomeGrowthBps: profile.annualIncomeGrowthBps });
  const otherTotal = (month) => otherItems.reduce((sum, item) => sum + (item.flowType === 'expense' ? amountFor(item, month) : 0), 0);
  const rowProps = { months: forecast, currencyCode };
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-max min-w-full border-separate border-spacing-0">
        <thead><tr><th className="sticky left-0 top-0 z-30 min-w-[210px] border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black text-slate-700">Household plan</th>{forecast.map((month) => <th key={month.monthKey} className="sticky top-0 z-20 min-w-[108px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-right text-xs font-black text-slate-700">{formatMonthLabel(month.monthKey)}</th>)}</tr></thead>
        <tbody>
          <PlanGroup label="Income" months={forecast} />
          {regularIncome.map((item) => <PlanRow key={item.id} {...rowProps} label={item.name} valueForMonth={(month) => amountFor(item, month)} tone="text-emerald-700" />)}
          <PlanRow {...rowProps} label="Income total" valueForMonth={(month) => month.incomePence} tone="text-emerald-700" strong />
          <PlanGroup label="Regular expenses" months={forecast} />
          {regularExpenses.map((item) => <PlanRow key={item.id} {...rowProps} label={item.name} valueForMonth={(month) => amountFor(item, month)} />)}
          <PlanGroup label="Other expenses" months={forecast} />
          {otherItems.map((item) => <PlanRow key={item.id} {...rowProps} label={item.name} valueForMonth={(month) => amountFor(item, month)} tone="text-amber-700" />)}
          <PlanRow {...rowProps} label="Other expenses total" valueForMonth={otherTotal} tone="text-amber-700" strong />
          <PlanGroup label="Totals" months={forecast} />
          <PlanRow {...rowProps} label="Expenses total" valueForMonth={(month) => month.expensePence} strong />
          <PlanRow {...rowProps} label="Savings monthly" valueForMonth={(month) => month.surplusPence} tone="text-emerald-700" strong />
          <PlanRow {...rowProps} label="Planned savings" valueForMonth={(month) => month.closingCashPence} tone="text-violet-700" strong />
          <PlanRow {...rowProps} label="Fact" valueForMonth={(month) => snapshotByMonth.get(month.monthKey)?.cashBalancePence ?? null} tone="text-sky-700" strong />
        </tbody>
      </table>
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">Swipe or scroll sideways to see later months.</div>
    </div>
  );
};

const FactForm = ({ profile, saving, onSave }) => {
  const [month, setMonth] = useState(profile.forecastStartMonth);
  const [cash, setCash] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const cashBalancePence = parseCurrencyToPence(cash);
    if (cashBalancePence === null) { setMessage('Enter the actual savings balance.'); return; }
    try { await onSave({ asOfMonth: month, cashBalancePence, note: 'Actual household savings' }); setCash(''); setMessage('Actual balance saved in the Fact row.'); } catch (error) { setMessage(error?.message || 'Unable to save the actual balance.'); }
  };
  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-700">Add an actual savings balance</summary>
      <form onSubmit={submit} className="grid gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-bold text-slate-500">Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label>
        <label className="text-xs font-bold text-slate-500">Actual savings<input value={cash} onChange={(event) => setCash(event.target.value)} inputMode="decimal" placeholder="0" className={`${fieldClass} mt-1`} /></label>
        <button type="submit" disabled={saving} className={secondaryButton}>Save fact</button>
        {message ? <p className="text-sm font-semibold text-slate-500 sm:col-span-3">{message}</p> : null}
      </form>
    </details>
  );
};

const History = ({ snapshots, actualEntries, currencyCode }) => (
  <details className="rounded-xl border border-slate-200 bg-white">
    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-700">Past and recorded history ({snapshots.length + actualEntries.length})</summary>
    <div className="grid gap-4 border-t border-slate-100 px-4 py-4 lg:grid-cols-2">
      <div><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Savings facts</div><div className="mt-2 divide-y divide-slate-100">{snapshots.length ? snapshots.map((snapshot) => <div key={snapshot.id} className="flex justify-between gap-3 py-2 text-sm"><span className="font-semibold text-slate-500">{formatMonthLabel(snapshot.asOfMonth)}</span><span className="font-black text-slate-900">{formatCurrency(snapshot.cashBalancePence, currencyCode)}</span></div>) : <p className="py-2 text-sm text-slate-500">No facts recorded.</p>}</div></div>
      <div><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Older actual entries</div><div className="mt-2 divide-y divide-slate-100">{actualEntries.length ? actualEntries.slice(0, 24).map((entry) => <div key={entry.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate font-semibold text-slate-500">{entry.note || entry.occurredOn}</span><span className="font-black text-slate-900">{entry.flowType === 'income' ? '+' : '-'}{formatCurrency(entry.amountPence, currencyCode)}</span></div>) : <p className="py-2 text-sm text-slate-500">No actual entries recorded.</p>}</div></div>
    </div>
  </details>
);

const PlanView = ({ finance, forecast, horizon, onHorizonChange, currencyCode }) => (
  <div className="space-y-4">
    <Section>
      <SectionHeader title="Monthly plan" detail="Regular rows repeat automatically. Costs added under Other appear in their selected month." action={<div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">{FINANCE_HORIZON_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => onHorizonChange(option.value)} className={`rounded-lg px-3 py-2 text-xs font-black ${horizon === option.value ? 'bg-white text-[var(--pm-accent)] shadow-sm' : 'text-slate-500'}`}>{option.label}</button>)}</div>} />
      <div className="p-3 sm:p-4"><MonthlyPlanTable forecast={forecast} budgetItems={finance.budgetItems} snapshots={finance.balanceSnapshots} profile={finance.profile} currencyCode={currencyCode} /></div>
    </Section>
    <FactForm profile={finance.profile} saving={finance.saving} onSave={finance.saveBalanceSnapshot} />
    <History snapshots={finance.balanceSnapshots} actualEntries={finance.actualEntries} currencyCode={currencyCode} />
  </div>
);

export default function FinancePlannerView({ currentUserId }) {
  const finance = useFinanceData({ currentUserId });
  const [activeTab, setActiveTab] = useState('regular');
  const [horizon, setHorizon] = useState(36);
  const forecast = useMemo(() => buildFinanceForecast({ ...finance.profile, startMonth: finance.profile.forecastStartMonth, budgetItems: finance.budgetItems, months: horizon }), [finance.budgetItems, finance.profile, horizon]);
  const currentMonth = forecast[0] || null;
  const currencyCode = finance.profile.currencyCode || 'GBP';

  if (finance.loading) return <div className="mx-auto flex min-h-[360px] max-w-6xl items-center justify-center px-4 text-sm font-semibold text-slate-500">Loading Financial Planner...</div>;
  if (finance.needsMigration) return <div className="mx-auto max-w-xl px-4 py-10"><Section className="p-5"><h1 className="text-xl font-black text-slate-950">Finance setup is not connected</h1><p className="mt-2 text-sm leading-6 text-slate-500">The Finance tables could not be reached. Retry after checking the Supabase migration.</p><button type="button" onClick={() => void finance.loadAll()} className={`${secondaryButton} mt-4`}>Retry connection</button></Section></div>;
  if (!finance.summary.hasData) return <div className="mx-auto max-w-xl px-4 py-10"><Section className="p-5"><h1 className="text-xl font-black text-slate-950">Start your household plan</h1><p className="mt-2 text-sm leading-6 text-slate-500">Load the figures from your existing spreadsheet, then edit any row that has changed.</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={finance.saving} onClick={() => void finance.loadSampleHouseholdBudget()} className={primaryButton}>{finance.saving ? 'Loading...' : 'Load current figures'}</button><button type="button" disabled={finance.saving} onClick={() => void finance.saveProfile(finance.profile)} className={secondaryButton}>Start empty</button></div>{finance.error ? <p className="mt-3 text-sm font-semibold text-rose-700">{finance.error}</p> : null}</Section></div>;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 sm:py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">Financial Planner</h1><p className="mt-1 text-sm text-slate-500">Set regular amounts, add future costs, then read the monthly plan.</p></div>
        <div className="text-right text-xs font-bold text-slate-400">Plan starts<span className="ml-2 text-sm font-black text-slate-800">{formatMonthLabel(finance.profile.forecastStartMonth)}</span></div>
      </header>
      <PlannerTabs activeTab={activeTab} onChange={setActiveTab} />
      {finance.error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{finance.error}</div> : null}
      <main className="mt-4">
        {activeTab === 'regular' ? <RegularView finance={finance} currentMonth={currentMonth} currencyCode={currencyCode} /> : null}
        {activeTab === 'other' ? <OtherView finance={finance} currencyCode={currencyCode} /> : null}
        {activeTab === 'plan' ? <PlanView finance={finance} forecast={forecast} horizon={horizon} onHorizonChange={setHorizon} currencyCode={currencyCode} /> : null}
      </main>
    </div>
  );
}
