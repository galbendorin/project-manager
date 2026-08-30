import React, { useMemo, useState } from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import {
  buildFinanceForecast,
  calculateLoanPayment,
  calculateMortgageSummary,
  FINANCE_HORIZON_OPTIONS,
  formatCurrency,
  formatMonthLabel,
  formatPercent,
  parseCurrencyToPence,
  summarizeForecast,
} from '../utils/financePlanner';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'budget', label: 'Budget' },
  { id: 'actuals', label: 'Actuals' },
  { id: 'goals', label: 'Goals & funds' },
  { id: 'mortgage', label: 'Mortgage' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'settings', label: 'Settings' },
];

const penceToInput = (value) => String(Math.round((Number(value) || 0) / 100));

const getMonthFromDate = (dateValue = '') => String(dateValue || '').slice(0, 7);

const Panel = ({ children, className = '' }) => (
  <section className={`rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
    {children}
  </section>
);

const PanelHeading = ({ eyebrow, title, detail, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      {eyebrow ? <p className="pm-kicker">{eyebrow}</p> : null}
      <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950">{title}</h2>
      {detail ? <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{detail}</p> : null}
    </div>
    {action}
  </div>
);

const MetricCard = ({ label, value, detail, tone = 'text-slate-950' }) => (
  <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className={`mt-1 text-2xl font-black tracking-[-0.04em] ${tone}`}>{value}</div>
    {detail ? <div className="mt-1 text-xs font-semibold text-slate-500">{detail}</div> : null}
  </div>
);

const primaryButton = 'pm-toolbar-primary rounded-2xl px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const fieldClass = 'pm-input w-full rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-slate-950 placeholder:text-slate-400';

const FinanceNavigation = ({ activeView, onChange }) => (
  <>
    <div className="hidden items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm md:flex">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition ${activeView === item.id ? 'bg-[var(--pm-accent)] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
    <label className="block md:hidden">
      <span className="sr-only">Finance section</span>
      <select value={activeView} onChange={(event) => onChange(event.target.value)} className={fieldClass}>
        {NAV_ITEMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  </>
);

const ForecastLineChart = ({ forecast, currencyCode }) => {
  const values = forecast.map((month) => month.closingCashPence);
  if (values.length < 2) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(100, maximum - minimum);
  const points = values.map((value, index) => {
    const x = 24 + ((index / Math.max(1, values.length - 1)) * 332);
    const y = 150 - (((value - minimum) / range) * 108);
    return `${x},${y}`;
  }).join(' ');
  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
        <span>Projected cash balance</span>
        <span>{formatCurrency(minimum, currencyCode)} to {formatCurrency(maximum, currencyCode)}</span>
      </div>
      <svg viewBox="0 0 380 174" role="img" aria-label="Projected cash balance over time" className="mt-2 h-44 w-full overflow-visible">
        <line x1="24" y1="150" x2="356" y2="150" stroke="#e2e8f0" strokeWidth="2" />
        <line x1="24" y1="42" x2="356" y2="42" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="4 6" />
        <polyline points={points} fill="none" stroke="var(--pm-accent,#7c3aed)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[11px] font-bold text-slate-400">
        <span>{formatMonthLabel(forecast[0].monthKey)}</span>
        <span>{formatMonthLabel(forecast[forecast.length - 1].monthKey)}</span>
      </div>
    </div>
  );
};

const PastHistory = ({ actualEntries, balanceSnapshots, currencyCode }) => (
  <details className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
    <summary className="cursor-pointer list-none text-sm font-black text-slate-800">
      <span className="flex items-center justify-between gap-3">
        <span>Past actuals and cash snapshots</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{actualEntries.length + balanceSnapshots.length}</span>
      </span>
    </summary>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Cash snapshots</div>
        <div className="mt-2 space-y-2">
          {balanceSnapshots.length ? balanceSnapshots.slice(0, 12).map((snapshot) => (
            <div key={snapshot.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-600">{formatMonthLabel(snapshot.asOfMonth)}</span>
              <span className="font-black text-slate-950">{formatCurrency(snapshot.cashBalancePence, currencyCode)}</span>
            </div>
          )) : <p className="text-sm text-slate-500">No saved cash snapshots yet.</p>}
        </div>
      </div>
      <div>
        <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Recent actual entries</div>
        <div className="mt-2 space-y-2">
          {actualEntries.length ? actualEntries.slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-700">{entry.note || 'Actual entry'}</div>
                <div className="text-xs text-slate-400">{entry.occurredOn}</div>
              </div>
              <span className={entry.flowType === 'income' ? 'font-black text-emerald-700' : 'font-black text-slate-950'}>{entry.flowType === 'income' ? '+' : '-'}{formatCurrency(entry.amountPence, currencyCode)}</span>
            </div>
          )) : <p className="text-sm text-slate-500">No actual entries yet.</p>}
        </div>
      </div>
    </div>
  </details>
);

const BudgetItemEditor = ({ categories, initialItem, startMonth, onCancel, onSave, saving }) => {
  const initial = initialItem || {
    name: '', amountPence: 0, flowType: 'expense', classification: 'essential', cashTreatment: 'cash_outflow', frequency: 'monthly', startMonth, endMonth: '', annualMonth: '', categoryId: '', ownerLabel: '', notes: '', isActive: true,
  };
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(penceToInput(initial.amountPence));
  const [flowType, setFlowType] = useState(initial.flowType);
  const [classification, setClassification] = useState(initial.classification);
  const [cashTreatment, setCashTreatment] = useState(initial.cashTreatment);
  const [frequency, setFrequency] = useState(initial.frequency);
  const [itemStartMonth, setItemStartMonth] = useState(initial.startMonth || startMonth);
  const [endMonth, setEndMonth] = useState(initial.endMonth || '');
  const [annualMonth, setAnnualMonth] = useState(initial.annualMonth || '');
  const [categoryId, setCategoryId] = useState(initial.categoryId || '');
  const [ownerLabel, setOwnerLabel] = useState(initial.ownerLabel || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [formError, setFormError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const amountPence = parseCurrencyToPence(amount);
    if (!name.trim() || amountPence === null || amountPence < 0) {
      setFormError('Enter a name and a valid amount.');
      return;
    }
    setFormError('');
    try {
      await onSave({ ...initialItem, name, amountPence, flowType, classification, cashTreatment, frequency, startMonth: itemStartMonth, endMonth, annualMonth: frequency === 'annual' ? Number(annualMonth || itemStartMonth.slice(5, 7)) : null, categoryId, ownerLabel, notes, isActive: true });
      onCancel();
    } catch (error) {
      setFormError(error?.message || 'Unable to save this item.');
    }
  };

  return (
    <form onSubmit={submit} className="rounded-[24px] border border-[var(--pm-accent-soft)] bg-[var(--pm-accent-tint)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-slate-950">{initialItem?.id ? 'Edit budget item' : 'Add budget item'}</h3>
        <button type="button" onClick={onCancel} className="text-xs font-bold text-slate-500 hover:text-slate-900">Close</button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className={fieldClass} autoFocus />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Monthly amount" className={fieldClass} />
        <select value={flowType} onChange={(event) => setFlowType(event.target.value)} className={fieldClass}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <select value={classification} onChange={(event) => setClassification(event.target.value)} className={fieldClass}>
          <option value="essential">Required / essential</option>
          <option value="discretionary">Discretionary</option>
          <option value="wealth_building">Wealth-building</option>
        </select>
        <select value={frequency} onChange={(event) => setFrequency(event.target.value)} className={fieldClass}>
          <option value="monthly">Every month</option>
          <option value="annual">Once a year</option>
          <option value="one_off">One-off</option>
        </select>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={fieldClass}>
          <option value="">No category</option>
          {categories.filter((category) => category.flowType === flowType).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <label className="text-xs font-bold text-slate-500">Starts<input type="month" value={itemStartMonth} onChange={(event) => setItemStartMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label>
        <label className="text-xs font-bold text-slate-500">Ends (optional)<input type="month" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label>
        {frequency === 'annual' ? <label className="text-xs font-bold text-slate-500">Annual month<select value={annualMonth} onChange={(event) => setAnnualMonth(event.target.value)} className={`${fieldClass} mt-1`}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString('en-GB', { month: 'long' })}</option>)}</select></label> : null}
        <input value={ownerLabel} onChange={(event) => setOwnerLabel(event.target.value)} placeholder="Owner (optional)" className={fieldClass} />
        <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes (optional)" className={fieldClass} />
      </div>
      {flowType === 'expense' ? <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={cashTreatment === 'internal_transfer'} onChange={(event) => setCashTreatment(event.target.checked ? 'internal_transfer' : 'cash_outflow')} />This is an internal transfer into a cash pot, not spending</label> : null}
      {formError ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{formError}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving...' : 'Save item'}</button></div>
    </form>
  );
};

const BudgetPanel = ({ items, categories, profile, currentMonth, currencyCode, onSave, onDelete, saving }) => {
  const [editingItem, setEditingItem] = useState(null);
  const [adding, setAdding] = useState(false);
  const currentItems = useMemo(() => [...items].sort((left, right) => `${left.flowType}${left.classification}${left.name}`.localeCompare(`${right.flowType}${right.classification}${right.name}`)), [items]);
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeading eyebrow="Baseline" title="Monthly budget" detail="Set the normal household plan once. The forecast applies each item automatically until its end month." action={<button type="button" onClick={() => { setEditingItem(null); setAdding(true); }} className={primaryButton}>Add item</button>} />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <MetricCard label="Income" value={formatCurrency(currentMonth?.incomePence || 0, currencyCode)} detail={`Active in ${formatMonthLabel(profile.forecastStartMonth)}`} tone="text-emerald-700" />
          <MetricCard label="Required spending" value={formatCurrency(currentMonth?.essentialPence || 0, currencyCode)} detail="Excludes optional wealth-building" />
          <MetricCard label="Voluntary / discretionary" value={formatCurrency((currentMonth?.wealthBuildingPence || 0) + (currentMonth?.discretionaryPence || 0), currencyCode)} detail="Can be reviewed for lean months" />
        </div>
        {adding || editingItem ? <div className="mt-4"><BudgetItemEditor key={editingItem?.id || 'new'} categories={categories} initialItem={editingItem} startMonth={profile.forecastStartMonth} saving={saving} onSave={onSave} onCancel={() => { setAdding(false); setEditingItem(null); }} /></div> : null}
      </Panel>
      <Panel>
        <PanelHeading eyebrow="Plan items" title={`${currentItems.length} active items`} detail="Use an end month and a new successor item when a bill, salary, or childcare amount changes." />
        <div className="mt-4 divide-y divide-slate-100">
          {currentItems.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-black text-slate-900">{item.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">{item.classification.replace('_', ' ')}</span></div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{categoryNameById.get(item.categoryId) || 'Uncategorised'} · {item.frequency === 'monthly' ? 'Monthly' : item.frequency === 'annual' ? 'Annual' : 'One-off'} · {formatMonthLabel(item.startMonth)}{item.endMonth ? ` to ${formatMonthLabel(item.endMonth)}` : ''}</div>
              </div>
              <div className="ml-auto flex items-center gap-2"><span className={item.flowType === 'income' ? 'font-black text-emerald-700' : 'font-black text-slate-950'}>{item.flowType === 'income' ? '+' : '-'}{formatCurrency(item.amountPence, currencyCode)}</span><button type="button" onClick={() => { setAdding(false); setEditingItem(item); }} className="text-xs font-bold text-slate-500 hover:text-slate-950">Edit</button><button type="button" onClick={() => { if (window.confirm(`Delete ${item.name}?`)) void onDelete(item.id); }} className="text-xs font-bold text-rose-600 hover:text-rose-700">Delete</button></div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

const ActualsPanel = ({ entries, budgetItems, profile, currencyCode, onSave, onSaveSnapshot, saving }) => {
  const currentMonth = profile.forecastStartMonth;
  const [occurredOn, setOccurredOn] = useState(`${currentMonth}-01`);
  const [amount, setAmount] = useState('');
  const [flowType, setFlowType] = useState('expense');
  const [budgetItemId, setBudgetItemId] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [snapshotCash, setSnapshotCash] = useState(penceToInput(profile.openingCashPence));
  const [snapshotNote, setSnapshotNote] = useState('');
  const [snapshotMessage, setSnapshotMessage] = useState('');
  const monthEntries = entries.filter((entry) => getMonthFromDate(entry.occurredOn) === currentMonth && entry.cashTreatment !== 'internal_transfer');
  const actualIncome = monthEntries.filter((entry) => entry.flowType === 'income').reduce((sum, entry) => sum + entry.amountPence, 0);
  const actualExpenses = monthEntries.filter((entry) => entry.flowType === 'expense').reduce((sum, entry) => sum + entry.amountPence, 0);
  const selectedBudgetItem = budgetItems.find((item) => item.id === budgetItemId);
  const submit = async (event) => {
    event.preventDefault();
    const amountPence = parseCurrencyToPence(amount);
    if (amountPence === null || amountPence <= 0) { setFormError('Enter a valid amount.'); return; }
    try {
      await onSave({ occurredOn, amountPence, flowType, budgetItemId, categoryId: selectedBudgetItem?.categoryId || '', note: note || selectedBudgetItem?.name || '' });
      setAmount(''); setNote(''); setBudgetItemId(''); setFormError('');
    } catch (error) { setFormError(error?.message || 'Unable to save actual entry.'); }
  };
  const saveSnapshot = async (event) => {
    event.preventDefault();
    const cashBalancePence = parseCurrencyToPence(snapshotCash);
    if (cashBalancePence === null) { setSnapshotMessage('Enter a valid cash balance.'); return; }
    try {
      await onSaveSnapshot({ asOfMonth: currentMonth, cashBalancePence, note: snapshotNote });
      setSnapshotMessage('Cash snapshot saved.');
    } catch (error) { setSnapshotMessage(error?.message || 'Unable to save cash snapshot.'); }
  };
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeading eyebrow="Reality check" title="Actual spending" detail="Add entries as they happen. Past entries remain available in the collapsed history on the Overview." />
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><MetricCard label={`${formatMonthLabel(currentMonth)} income`} value={formatCurrency(actualIncome, currencyCode)} tone="text-emerald-700" /><MetricCard label="Actual spending" value={formatCurrency(actualExpenses, currencyCode)} /><MetricCard label="Actual net" value={formatCurrency(actualIncome - actualExpenses, currencyCode)} tone={actualIncome - actualExpenses >= 0 ? 'text-emerald-700' : 'text-rose-700'} /></div>
      </Panel>
      <Panel>
        <PanelHeading eyebrow="Fact" title="Record actual household cash" detail="Use this at month-end to keep your planned cash line connected to real savings and current-account balances." />
        <form onSubmit={saveSnapshot} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input value={snapshotCash} onChange={(event) => setSnapshotCash(event.target.value)} inputMode="decimal" placeholder="Actual cash balance" className={fieldClass} />
          <input value={snapshotNote} onChange={(event) => setSnapshotNote(event.target.value)} placeholder="Optional month-end note" className={fieldClass} />
          <button type="submit" disabled={saving} className={secondaryButton}>Save snapshot</button>
        </form>
        {snapshotMessage ? <p className="mt-3 text-sm font-semibold text-slate-600">{snapshotMessage}</p> : null}
      </Panel>
      <Panel>
        <PanelHeading eyebrow="Quick entry" title="Add an actual" />
        <form onSubmit={submit} className="mt-4 grid gap-3 lg:grid-cols-5">
          <input type="date" value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} className={fieldClass} />
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Amount" className={fieldClass} />
          <select value={flowType} onChange={(event) => setFlowType(event.target.value)} className={fieldClass}><option value="expense">Expense</option><option value="income">Income</option></select>
          <select value={budgetItemId} onChange={(event) => setBudgetItemId(event.target.value)} className={fieldClass}><option value="">Link to budget item (optional)</option>{budgetItems.filter((item) => item.flowType === flowType).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving...' : 'Add actual'}</button>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note (optional)" className="lg:col-span-4 pm-input w-full rounded-2xl px-3.5 py-2.5 text-sm font-semibold text-slate-950 placeholder:text-slate-400" />
        </form>
        {formError ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{formError}</p> : null}
      </Panel>
      <Panel>
        <PanelHeading eyebrow="This month" title="Recorded entries" />
        <div className="mt-3 space-y-2">{monthEntries.length ? monthEntries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><div><div className="font-bold text-slate-800">{entry.note || 'Actual entry'}</div><div className="text-xs text-slate-400">{entry.occurredOn}</div></div><span className={entry.flowType === 'income' ? 'font-black text-emerald-700' : 'font-black text-slate-950'}>{entry.flowType === 'income' ? '+' : '-'}{formatCurrency(entry.amountPence, currencyCode)}</span></div>) : <p className="text-sm text-slate-500">No actual entries for this forecast month yet.</p>}</div>
      </Panel>
    </div>
  );
};

const GoalsPanel = ({ goals, currencyCode, onSave, saving }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [targetBalance, setTargetBalance] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [goalType, setGoalType] = useState('sinking_fund');
  const [protectedGoal, setProtectedGoal] = useState(false);
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault();
    const currentBalancePence = parseCurrencyToPence(currentBalance);
    const targetBalancePence = targetBalance ? parseCurrencyToPence(targetBalance) : null;
    const monthlyContributionPence = monthlyContribution ? parseCurrencyToPence(monthlyContribution) : 0;
    if (!name.trim() || currentBalancePence === null || targetBalancePence === null && targetBalance) { setError('Enter a name and valid amounts.'); return; }
    try {
      await onSave({ name, goalType, currentBalancePence, targetBalancePence, monthlyContributionPence: monthlyContributionPence || 0, isProtected: protectedGoal });
      setAdding(false); setName(''); setCurrentBalance(''); setTargetBalance(''); setMonthlyContribution(''); setError('');
    } catch (nextError) { setError(nextError?.message || 'Unable to save fund.'); }
  };
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeading eyebrow="Safety and purpose" title="Goals & funds" detail="A protected fund is included in total cash but held back when the app calculates money freely available for a major decision." action={<button type="button" onClick={() => setAdding((value) => !value)} className={secondaryButton}>{adding ? 'Close form' : 'Add fund'}</button>} />
        {adding ? <form onSubmit={save} className="mt-4 grid gap-3 rounded-[24px] bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Fund name" className={fieldClass} autoFocus /><select value={goalType} onChange={(event) => setGoalType(event.target.value)} className={fieldClass}><option value="emergency">Emergency fund</option><option value="sinking_fund">Sinking fund</option><option value="savings">Savings</option><option value="major_purchase">Major purchase</option></select><input value={currentBalance} onChange={(event) => setCurrentBalance(event.target.value)} inputMode="decimal" placeholder="Current balance" className={fieldClass} /><input value={targetBalance} onChange={(event) => setTargetBalance(event.target.value)} inputMode="decimal" placeholder="Target balance" className={fieldClass} /><input value={monthlyContribution} onChange={(event) => setMonthlyContribution(event.target.value)} inputMode="decimal" placeholder="Monthly contribution" className={fieldClass} /><label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600"><input type="checkbox" checked={protectedGoal} onChange={(event) => setProtectedGoal(event.target.checked)} />Protected cash</label>{error ? <p className="sm:col-span-2 lg:col-span-3 text-sm font-semibold text-rose-700">{error}</p> : null}<div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button type="submit" disabled={saving} className={primaryButton}>Save fund</button></div></form> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{goals.map((goal) => { const progress = goal.targetBalancePence ? Math.min(100, Math.round((goal.currentBalancePence / goal.targetBalancePence) * 100)) : null; return <div key={goal.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div className="font-black text-slate-900">{goal.name}</div>{goal.isProtected ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800">Protected</span> : null}</div><div className="mt-3 text-2xl font-black text-slate-950">{formatCurrency(goal.currentBalancePence, currencyCode)}</div>{goal.targetBalancePence !== null ? <><div className="mt-1 text-xs font-semibold text-slate-500">Target {formatCurrency(goal.targetBalancePence, currencyCode)} · {progress}%</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[var(--pm-accent)]" style={{ width: `${progress}%` }} /></div></> : null}{goal.monthlyContributionPence ? <div className="mt-3 text-xs font-bold text-slate-500">{formatCurrency(goal.monthlyContributionPence, currencyCode)} reserved each month</div> : null}</div>; })}</div>
      </Panel>
    </div>
  );
};

const MortgagePanel = ({ mortgages, currencyCode, onSave, saving }) => {
  const mortgage = mortgages[0] || null;
  const [editing, setEditing] = useState(!mortgage);
  const initial = mortgage || { name: 'Home mortgage', outstandingBalancePence: 0, annualRateBps: 0, remainingMonths: 300, contractualPaymentPence: 0, voluntaryOverpaymentPence: 0, propertyValuePence: '', fixedRateEndDate: '', expectedFutureRateBps: '' };
  const [balance, setBalance] = useState(penceToInput(initial.outstandingBalancePence));
  const [rate, setRate] = useState(String((initial.annualRateBps || 0) / 100));
  const [months, setMonths] = useState(String(initial.remainingMonths));
  const [contractualPayment, setContractualPayment] = useState(penceToInput(initial.contractualPaymentPence));
  const [overpayment, setOverpayment] = useState(penceToInput(initial.voluntaryOverpaymentPence));
  const [propertyValue, setPropertyValue] = useState(initial.propertyValuePence ? penceToInput(initial.propertyValuePence) : '');
  const [formError, setFormError] = useState('');
  const summary = mortgage ? calculateMortgageSummary({ balancePence: mortgage.outstandingBalancePence, annualRateBps: mortgage.annualRateBps, remainingMonths: mortgage.remainingMonths, propertyValuePence: mortgage.propertyValuePence, monthlyOverpaymentPence: mortgage.voluntaryOverpaymentPence }) : null;
  const submit = async (event) => {
    event.preventDefault();
    const outstandingBalancePence = parseCurrencyToPence(balance); const contractualPaymentPence = parseCurrencyToPence(contractualPayment); const voluntaryOverpaymentPence = parseCurrencyToPence(overpayment); const propertyValuePence = propertyValue ? parseCurrencyToPence(propertyValue) : null;
    if (outstandingBalancePence === null || contractualPaymentPence === null || voluntaryOverpaymentPence === null || propertyValue && propertyValuePence === null) { setFormError('Enter valid mortgage amounts.'); return; }
    try { await onSave({ ...mortgage, name: 'Home mortgage', outstandingBalancePence, annualRateBps: Math.round((Number(rate) || 0) * 100), remainingMonths: Math.max(1, Number(months) || 1), contractualPaymentPence, voluntaryOverpaymentPence, propertyValuePence }); setEditing(false); setFormError(''); } catch (error) { setFormError(error?.message || 'Unable to save mortgage.'); }
  };
  return (
    <Panel>
      <PanelHeading eyebrow="Home" title="Mortgage & overpayments" detail="The contractual payment remains required spending. The voluntary overpayment is shown separately as wealth-building, so lean-month planning stays honest." action={mortgage ? <button type="button" onClick={() => setEditing((value) => !value)} className={secondaryButton}>{editing ? 'Close editor' : 'Edit mortgage'}</button> : null} />
      {summary && !editing ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Balance" value={formatCurrency(mortgage.outstandingBalancePence, currencyCode)} /><MetricCard label="Required payment" value={formatCurrency(mortgage.contractualPaymentPence, currencyCode)} /><MetricCard label="Voluntary overpayment" value={formatCurrency(mortgage.voluntaryOverpaymentPence, currencyCode)} detail="Wealth-building" /><MetricCard label="Estimated LTV" value={summary.ltv === null ? 'Add property value' : formatPercent(summary.ltv, 1)} detail={`Estimated rate payment ${formatCurrency(summary.standardPaymentPence, currencyCode)}`} /></div> : null}
      {editing ? <form onSubmit={submit} className="mt-4 grid gap-3 rounded-[24px] bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"><input value={balance} onChange={(event) => setBalance(event.target.value)} inputMode="decimal" placeholder="Outstanding balance" className={fieldClass} /><input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" placeholder="Interest rate %" className={fieldClass} /><input value={months} onChange={(event) => setMonths(event.target.value)} inputMode="numeric" placeholder="Months remaining" className={fieldClass} /><input value={contractualPayment} onChange={(event) => setContractualPayment(event.target.value)} inputMode="decimal" placeholder="Required payment" className={fieldClass} /><input value={overpayment} onChange={(event) => setOverpayment(event.target.value)} inputMode="decimal" placeholder="Voluntary overpayment" className={fieldClass} /><input value={propertyValue} onChange={(event) => setPropertyValue(event.target.value)} inputMode="decimal" placeholder="Property value (optional)" className={fieldClass} />{formError ? <p className="sm:col-span-2 lg:col-span-3 text-sm font-semibold text-rose-700">{formError}</p> : null}<div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button type="submit" disabled={saving} className={primaryButton}>Save mortgage</button></div></form> : null}
      {summary && !editing ? <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm leading-6 text-slate-600">At the entered rate and term, the standard repayment estimate is <strong>{formatCurrency(summary.standardPaymentPence, currencyCode)}</strong> per month. With the voluntary overpayment, the model projects payoff in roughly <strong>{summary.payoffMonths} months</strong>. These are estimates based on your assumptions.</div> : null}
    </Panel>
  );
};

const ForecastPanel = ({ forecast, currencyCode, horizon, onHorizonChange }) => {
  const byYear = useMemo(() => forecast.reduce((groups, month) => { const year = month.monthKey.slice(0, 4); groups[year] = groups[year] || []; groups[year].push(month); return groups; }, {}), [forecast]);
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeading eyebrow="Forward plan" title="Cash-flow forecast" detail="The default is three years. Expand to five or ten years whenever you want a longer view; the same assumptions are applied consistently." action={<div className="flex rounded-2xl border border-slate-200 bg-white p-1">{FINANCE_HORIZON_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => onHorizonChange(option.value)} className={`rounded-xl px-3 py-2 text-xs font-black ${horizon === option.value ? 'bg-[var(--pm-accent)] text-white' : 'text-slate-500'}`}>{option.label}</button>)}</div>} />
        <ForecastLineChart forecast={forecast} currencyCode={currencyCode} />
      </Panel>
      {Object.entries(byYear).map(([year, months], index) => <details key={year} open={index === 0} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"><summary className="cursor-pointer list-none"><span className="flex items-center justify-between gap-3"><span><span className="pm-kicker">{year}</span><span className="mt-1 block text-xl font-black text-slate-950">{months.length} planned months</span></span><span className="text-sm font-black text-slate-700">{formatCurrency(months[months.length - 1].closingCashPence, currencyCode)}</span></span></summary><div className="mt-4 space-y-2">{months.map((month) => <details key={month.monthKey} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"><summary className="cursor-pointer list-none"><span className="grid grid-cols-[minmax(78px,1fr)_minmax(84px,1fr)_minmax(84px,1fr)] items-center gap-2 text-right text-xs sm:grid-cols-[minmax(100px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)]"><span className="text-left font-black text-slate-800">{formatMonthLabel(month.monthKey)}</span><span className="hidden sm:block text-emerald-700">+{formatCurrency(month.incomePence, currencyCode)}</span><span className={month.surplusPence >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatCurrency(month.surplusPence, currencyCode)}</span><span className="font-black text-slate-950">{formatCurrency(month.closingCashPence, currencyCode)}</span></span></summary><div className="mt-3 border-t border-slate-200 pt-3"><div className="grid gap-2 sm:grid-cols-2">{month.lineItems.map((item, itemIndex) => <div key={`${item.name}-${itemIndex}`} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-600">{item.name}</span><span className={item.flowType === 'income' ? 'font-bold text-emerald-700' : 'font-bold text-slate-800'}>{item.flowType === 'income' ? '+' : '-'}{formatCurrency(item.amountPence, currencyCode)}</span></div>)}</div><div className="mt-3 text-xs font-semibold text-slate-500">Required spending {formatCurrency(month.essentialPence, currencyCode)} · Lean emergency cover {month.emergencyCoverageMonths === null ? '-' : `${month.emergencyCoverageMonths.toFixed(1)} months`}</div></div></details>)}</div></details>)}
    </div>
  );
};

const ScenariosPanel = ({ scenarios, scenarioChanges, profile, budgetItems, currencyCode, onSaveScenario, onSaveScenarioChange, saving }) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState(scenarios[0]?.id || '');
  const [name, setName] = useState('Buy EV');
  const [month, setMonth] = useState(profile.forecastStartMonth);
  const [purchasePrice, setPurchasePrice] = useState('21000');
  const [tradeIn, setTradeIn] = useState('0');
  const [financeAmount, setFinanceAmount] = useState('0');
  const [apr, setApr] = useState('6');
  const [termMonths, setTermMonths] = useState('48');
  const [monthlySaving, setMonthlySaving] = useState('0');
  const [formError, setFormError] = useState('');
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) || null;
  const selectedChanges = scenarioChanges.filter((change) => change.scenarioId === selectedScenarioId);
  const scenarioItems = selectedChanges.map((change) => ({ name: change.name, amountPence: change.amountPence, flowType: ['income', 'saving'].includes(change.changeType) ? 'income' : 'expense', classification: change.classification, frequency: change.frequency, startMonth: change.effectiveMonth, cashTreatment: 'cash_outflow' }));
  const baseForecast = useMemo(() => buildFinanceForecast({ ...profile, startMonth: profile.forecastStartMonth, budgetItems, months: 36 }), [budgetItems, profile]);
  const scenarioForecast = useMemo(() => selectedScenario ? buildFinanceForecast({ ...profile, startMonth: profile.forecastStartMonth, budgetItems, scenarioItems, months: 36 }) : null, [budgetItems, profile, scenarioItems, selectedScenario]);
  const createScenario = async (event) => {
    event.preventDefault();
    const pricePence = parseCurrencyToPence(purchasePrice); const tradeInPence = parseCurrencyToPence(tradeIn); const financePence = parseCurrencyToPence(financeAmount); const savingPence = parseCurrencyToPence(monthlySaving);
    if (pricePence === null || tradeInPence === null || financePence === null || savingPence === null || !name.trim()) { setFormError('Enter a name and valid scenario amounts.'); return; }
    const cashImpactPence = Math.max(0, pricePence - tradeInPence - financePence);
    try {
      const scenario = await onSaveScenario({ name, description: `Purchase model from ${formatMonthLabel(month)}` });
      if (cashImpactPence) await onSaveScenarioChange({ scenarioId: scenario.id, name: `${name} cash impact`, effectiveMonth: month, changeType: 'purchase', amountPence: cashImpactPence, frequency: 'one_off', classification: 'discretionary' });
      if (financePence) await onSaveScenarioChange({ scenarioId: scenario.id, name: `${name} finance payment`, effectiveMonth: month, changeType: 'financing', amountPence: calculateLoanPayment({ principalPence: financePence, annualRateBps: Math.round((Number(apr) || 0) * 100), termMonths: Number(termMonths) || 1 }), frequency: 'monthly', classification: 'essential' });
      if (savingPence) await onSaveScenarioChange({ scenarioId: scenario.id, name: `${name} running-cost saving`, effectiveMonth: month, changeType: 'saving', amountPence: savingPence, frequency: 'monthly', classification: 'essential' });
      setSelectedScenarioId(scenario.id); setFormError('');
    } catch (error) { setFormError(error?.message || 'Unable to save scenario.'); }
  };
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeading eyebrow="What if?" title="Major purchase scenario" detail="Scenarios are saved separately and never alter your base budget." />
        <form onSubmit={createScenario} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Scenario name" className={fieldClass} /><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={fieldClass} /><input value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} inputMode="decimal" placeholder="Purchase price" className={fieldClass} /><input value={tradeIn} onChange={(event) => setTradeIn(event.target.value)} inputMode="decimal" placeholder="Trade-in / sale value" className={fieldClass} /><input value={financeAmount} onChange={(event) => setFinanceAmount(event.target.value)} inputMode="decimal" placeholder="Finance amount" className={fieldClass} /><input value={apr} onChange={(event) => setApr(event.target.value)} inputMode="decimal" placeholder="APR %" className={fieldClass} /><input value={termMonths} onChange={(event) => setTermMonths(event.target.value)} inputMode="numeric" placeholder="Finance months" className={fieldClass} /><input value={monthlySaving} onChange={(event) => setMonthlySaving(event.target.value)} inputMode="decimal" placeholder="Monthly running-cost saving" className={fieldClass} />{formError ? <p className="sm:col-span-2 lg:col-span-4 text-sm font-semibold text-rose-700">{formError}</p> : null}<div className="sm:col-span-2 lg:col-span-4 flex justify-end"><button type="submit" disabled={saving} className={primaryButton}>Save scenario</button></div></form>
      </Panel>
      <Panel>
        <PanelHeading eyebrow="Comparison" title="Base versus scenario" detail="Compare cash impact and the three-year closing position before making a decision." />
        <div className="mt-4 flex flex-wrap gap-2">{scenarios.length ? scenarios.map((scenario) => <button key={scenario.id} type="button" onClick={() => setSelectedScenarioId(scenario.id)} className={`rounded-xl px-3 py-2 text-xs font-black ${selectedScenarioId === scenario.id ? 'bg-[var(--pm-accent)] text-white' : 'bg-slate-100 text-slate-600'}`}>{scenario.name}</button>) : <p className="text-sm text-slate-500">Save a scenario above to compare it with your base plan.</p>}</div>
        {selectedScenario && scenarioForecast ? <div className="mt-4 grid gap-3 md:grid-cols-3"><MetricCard label="Immediate cash impact" value={formatCurrency((baseForecast[0]?.closingCashPence || 0) - (scenarioForecast[0]?.closingCashPence || 0), currencyCode)} tone="text-rose-700" /><MetricCard label="Base cash in 3 years" value={formatCurrency(baseForecast.at(-1)?.closingCashPence || 0, currencyCode)} /><MetricCard label={`${selectedScenario.name} in 3 years`} value={formatCurrency(scenarioForecast.at(-1)?.closingCashPence || 0, currencyCode)} tone={(scenarioForecast.at(-1)?.closingCashPence || 0) >= (baseForecast.at(-1)?.closingCashPence || 0) ? 'text-emerald-700' : 'text-rose-700'} /></div> : null}
      </Panel>
    </div>
  );
};

const SettingsPanel = ({ profile, currencyCode, saving, onSave, onReset }) => {
  const [openingCash, setOpeningCash] = useState(penceToInput(profile.openingCashPence));
  const [startMonth, setStartMonth] = useState(profile.forecastStartMonth);
  const [targetMonths, setTargetMonths] = useState(String(profile.emergencyTargetMonths));
  const [protectedFloor, setProtectedFloor] = useState(penceToInput(profile.protectedCashFloorPence));
  const [expenseInflation, setExpenseInflation] = useState(String((profile.annualExpenseInflationBps || 0) / 100));
  const [incomeGrowth, setIncomeGrowth] = useState(String((profile.annualIncomeGrowthBps || 0) / 100));
  const [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    try { await onSave({ openingCashPence: parseCurrencyToPence(openingCash) || 0, forecastStartMonth: startMonth, emergencyTargetMonths: Number(targetMonths) || 6, protectedCashFloorPence: parseCurrencyToPence(protectedFloor) || 0, annualExpenseInflationBps: Math.round((Number(expenseInflation) || 0) * 100), annualIncomeGrowthBps: Math.round((Number(incomeGrowth) || 0) * 100) }); setMessage('Settings saved.'); } catch (error) { setMessage(error?.message || 'Unable to save settings.'); }
  };
  return <Panel><PanelHeading eyebrow="Assumptions" title="Forecast settings" detail="GBP is the current working currency. Growth and inflation are assumptions, not guarantees." /><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" placeholder="Opening household cash" className={fieldClass} /><input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} className={fieldClass} /><input value={targetMonths} onChange={(event) => setTargetMonths(event.target.value)} inputMode="numeric" placeholder="Emergency target months" className={fieldClass} /><input value={protectedFloor} onChange={(event) => setProtectedFloor(event.target.value)} inputMode="decimal" placeholder="Protected minimum cash" className={fieldClass} /><input value={expenseInflation} onChange={(event) => setExpenseInflation(event.target.value)} inputMode="decimal" placeholder="Annual expense inflation %" className={fieldClass} /><input value={incomeGrowth} onChange={(event) => setIncomeGrowth(event.target.value)} inputMode="decimal" placeholder="Annual income growth %" className={fieldClass} /><div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-500">Currency: {currencyCode}</span><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving...' : 'Save settings'}</button></div>{message ? <p className="sm:col-span-2 lg:col-span-3 text-sm font-semibold text-slate-600">{message}</p> : null}</form><div className="mt-6 border-t border-slate-200 pt-5"><div className="text-sm font-black text-slate-900">Reset Finance data</div><p className="mt-1 text-sm leading-6 text-slate-500">This removes every Finance profile, budget item, actual, fund, mortgage, and scenario for your account. It cannot be undone.</p><button type="button" disabled={saving} onClick={() => { if (window.confirm('Remove all Financial Planner data for your account? This cannot be undone.')) void onReset(); }} className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50">Remove all Finance data</button></div></Panel>;
};

const CategoryManager = ({ categories, saving, onSave }) => {
  const [name, setName] = useState('');
  const [flowType, setFlowType] = useState('expense');
  const [classification, setClassification] = useState('essential');
  const [message, setMessage] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);

  const resetForm = () => {
    setEditingCategory(null);
    setName('');
    setFlowType('expense');
    setClassification('essential');
  };

  const startEditing = (category) => {
    setEditingCategory(category);
    setName(category.name);
    setFlowType(category.flowType);
    setClassification(category.classification);
    setMessage('');
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      await onSave({ id: editingCategory?.id, name, flowType, classification, sortOrder: editingCategory?.sortOrder ?? categories.length + 1 });
      resetForm();
      setMessage(editingCategory ? 'Category updated.' : 'Category added.');
    } catch (error) { setMessage(error?.message || 'Unable to add category.'); }
  };
  return <Panel><PanelHeading eyebrow="Budget setup" title="Editable categories" detail="These are your own labels. They can be used to keep the budget and actuals easy to scan." /><form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category" className={fieldClass} /><select value={flowType} onChange={(event) => setFlowType(event.target.value)} className={fieldClass}><option value="expense">Expense</option><option value="income">Income</option></select><select value={classification} onChange={(event) => setClassification(event.target.value)} className={fieldClass}><option value="essential">Required / essential</option><option value="discretionary">Discretionary</option><option value="wealth_building">Wealth-building</option></select><div className="flex gap-2"><button type="submit" disabled={saving || !name.trim()} className={secondaryButton}>{editingCategory ? 'Save category' : 'Add category'}</button>{editingCategory ? <button type="button" onClick={resetForm} className={secondaryButton}>Cancel</button> : null}</div></form><div className="mt-4 flex flex-wrap gap-2">{categories.map((category) => <button key={category.id} type="button" onClick={() => startEditing(category)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200">{category.name}</button>)}</div>{message ? <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p> : null}</Panel>;
};

export default function FinancePlannerView({ currentUserId }) {
  const finance = useFinanceData({ currentUserId });
  const [activeView, setActiveView] = useState('overview');
  const [horizon, setHorizon] = useState(36);
  const { profile, budgetItems, actualEntries, balanceSnapshots, goals, mortgages, scenarios, scenarioChanges } = finance;
  const forecast = useMemo(() => buildFinanceForecast({ ...profile, startMonth: profile.forecastStartMonth, budgetItems, months: horizon }), [budgetItems, horizon, profile]);
  const forecastSummary = useMemo(() => summarizeForecast(forecast), [forecast]);
  const currentMonth = forecast[0] || null;
  const currencyCode = profile.currencyCode || 'GBP';
  const latestCashSnapshot = balanceSnapshots[0] || null;
  const currentCashPence = latestCashSnapshot?.cashBalancePence ?? profile.openingCashPence;
  const emergencyTargetPence = (currentMonth?.essentialPence || 0) * profile.emergencyTargetMonths;
  const emergencyCoverage = currentMonth?.essentialPence ? currentCashPence / currentMonth.essentialPence : null;

  if (finance.loading) return <div className="mx-auto flex min-h-[420px] max-w-7xl items-center justify-center px-4 text-sm font-semibold text-slate-500">Loading Financial Planner...</div>;
  if (finance.needsMigration) return <div className="mx-auto max-w-2xl px-4 py-10"><Panel><PanelHeading eyebrow="One-time setup" title="Run the Finance SQL migration" detail="The app is ready, but Supabase needs the new Finance tables before it can store your plan." /><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void finance.loadAll()} className={secondaryButton}>Retry connection</button></div><p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800">Run the supplied Finance migration in your Supabase SQL Editor, then return here and choose Retry connection. Your household values are never automatically added.</p></Panel></div>;
  if (!finance.summary.hasData) return <div className="mx-auto max-w-2xl px-4 py-10"><Panel><PanelHeading eyebrow="Financial Planner" title="Start with a clean plan" detail="Load the household baseline from your current layout, or add your own budget items one at a time. The sample is only saved after you choose it." /><div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={finance.saving} onClick={() => void finance.loadSampleHouseholdBudget()} className={primaryButton}>{finance.saving ? 'Loading...' : 'Load current household plan'}</button><button type="button" disabled={finance.saving} onClick={() => void finance.saveProfile(profile)} className={secondaryButton}>Build from scratch</button></div>{finance.error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{finance.error}</p> : null}</Panel></div>;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="pm-kicker">Private household workspace</p><h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">Financial Planner</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Where you are today, what changes are coming, and what happens to your financial safety when you model a major decision.</p></div><div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm"><div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Forecast starts</div><div className="mt-1 text-sm font-black text-slate-900">{formatMonthLabel(profile.forecastStartMonth)}</div></div></div>
        <FinanceNavigation activeView={activeView} onChange={setActiveView} />
        {finance.error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{finance.error}</div> : null}
        {activeView === 'overview' && currentMonth ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Planned income" value={formatCurrency(currentMonth.incomePence, currencyCode)} detail={formatMonthLabel(currentMonth.monthKey)} tone="text-emerald-700" /><MetricCard label="Planned spending" value={formatCurrency(currentMonth.expensePence, currencyCode)} detail={`${formatCurrency(currentMonth.essentialPence, currencyCode)} required`} /><MetricCard label="Monthly surplus" value={formatCurrency(currentMonth.surplusPence, currencyCode)} detail={`Savings rate ${formatPercent(currentMonth.savingsRate)}`} tone={currentMonth.surplusPence >= 0 ? 'text-emerald-700' : 'text-rose-700'} /><MetricCard label="Current cash" value={formatCurrency(currentCashPence, currencyCode)} detail={latestCashSnapshot ? `Updated ${formatMonthLabel(latestCashSnapshot.asOfMonth)}` : 'Opening balance'} tone={currentCashPence < profile.protectedCashFloorPence ? 'text-rose-700' : 'text-slate-950'} /></div><Panel><PanelHeading eyebrow="Cash safety" title="Emergency cover" detail="Lean spending excludes discretionary items and voluntary wealth-building contributions." /><div className="mt-4 grid gap-3 md:grid-cols-3"><MetricCard label="Lean spending" value={formatCurrency(currentMonth.essentialPence, currencyCode)} detail="Per month" /><MetricCard label="Emergency target" value={formatCurrency(emergencyTargetPence, currencyCode)} detail={`${profile.emergencyTargetMonths} lean months`} /><MetricCard label="Current cover" value={emergencyCoverage === null ? '-' : `${emergencyCoverage.toFixed(1)} months`} detail={currentCashPence >= emergencyTargetPence ? `${formatCurrency(currentCashPence - emergencyTargetPence, currencyCode)} above target` : `${formatCurrency(emergencyTargetPence - currentCashPence, currencyCode)} below target`} tone={currentCashPence >= emergencyTargetPence ? 'text-emerald-700' : 'text-amber-700'} /></div></Panel><Panel><PanelHeading eyebrow="Forward-looking" title="Your next financial picture" detail="These figures are projected from your active budget and dated changes." /><div className="mt-4 grid gap-3 md:grid-cols-3"><MetricCard label="Cash in 12 months" value={formatCurrency(forecast[Math.min(11, forecast.length - 1)]?.closingCashPence || 0, currencyCode)} /><MetricCard label={`Cash in ${horizon / 12} years`} value={formatCurrency(forecastSummary.last?.closingCashPence || 0, currencyCode)} /><MetricCard label="Next risk" value={forecastSummary.nextNegativeMonth ? formatMonthLabel(forecastSummary.nextNegativeMonth.monthKey) : 'No deficit in view'} detail={forecastSummary.belowFloorMonth ? `Cash crosses your floor in ${formatMonthLabel(forecastSummary.belowFloorMonth.monthKey)}` : 'Protected cash floor is maintained'} tone={forecastSummary.nextNegativeMonth || forecastSummary.belowFloorMonth ? 'text-amber-700' : 'text-emerald-700'} /></div><ForecastLineChart forecast={forecast} currencyCode={currencyCode} /></Panel><PastHistory actualEntries={actualEntries} balanceSnapshots={balanceSnapshots} currencyCode={currencyCode} /></div> : null}
        {activeView === 'budget' ? <BudgetPanel items={budgetItems} categories={finance.categories} profile={profile} currentMonth={currentMonth} currencyCode={currencyCode} onSave={finance.saveBudgetItem} onDelete={finance.deleteBudgetItem} saving={finance.saving} /> : null}
        {activeView === 'actuals' ? <ActualsPanel entries={actualEntries} budgetItems={budgetItems} profile={profile} currencyCode={currencyCode} onSave={finance.saveActualEntry} onSaveSnapshot={finance.saveBalanceSnapshot} saving={finance.saving} /> : null}
        {activeView === 'goals' ? <GoalsPanel goals={goals} currencyCode={currencyCode} onSave={finance.saveGoal} saving={finance.saving} /> : null}
        {activeView === 'mortgage' ? <MortgagePanel mortgages={mortgages} currencyCode={currencyCode} onSave={finance.saveMortgage} saving={finance.saving} /> : null}
        {activeView === 'forecast' ? <ForecastPanel forecast={forecast} currencyCode={currencyCode} horizon={horizon} onHorizonChange={setHorizon} /> : null}
        {activeView === 'scenarios' ? <ScenariosPanel scenarios={scenarios} scenarioChanges={scenarioChanges} profile={profile} budgetItems={budgetItems} currencyCode={currencyCode} onSaveScenario={finance.saveScenario} onSaveScenarioChange={finance.saveScenarioChange} saving={finance.saving} /> : null}
        {activeView === 'settings' ? <div className="space-y-4"><SettingsPanel profile={profile} currencyCode={currencyCode} saving={finance.saving} onSave={finance.saveProfile} onReset={finance.resetFinanceData} /><CategoryManager categories={finance.categories} saving={finance.saving} onSave={finance.saveCategory} /></div> : null}
      </div>
    </div>
  );
}
