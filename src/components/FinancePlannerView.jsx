import React, { useMemo, useState } from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import {
  buildFinanceForecast,
  FINANCE_HORIZON_OPTIONS,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
  getItemAmountForMonth,
  parseCurrencyToPence,
} from '../utils/financePlanner';
import {
  FINANCE_QUICK_ENTRY_EXAMPLES,
  findFinanceCategoryId,
  parseFinanceQuickEntry,
} from '../utils/financeQuickEntry';
import {
  groupFinanceExpenseItems,
  isHistoricalFinanceItem,
} from '../utils/financePlanRows';

const TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'regular', label: 'Regular' },
  { id: 'other', label: 'Other' },
];

const fieldClass = 'pm-input w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-950 placeholder:text-slate-400';
const primaryButton = 'pm-toolbar-primary rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50';

const penceToInput = (value) => String(Math.round((Number(value) || 0) / 100));

const QUICK_CLASSIFICATION_LABELS = {
  essential: 'Required',
  discretionary: 'Optional',
  wealth_building: 'Saving / overpayment',
};

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

const quickScheduleLabel = (item) => {
  if (item.frequency === 'annual') {
    return `Every ${formatMonthLabel(item.startMonth, { year: undefined })}, next due ${formatMonthLabel(item.startMonth)}`;
  }
  if (item.frequency === 'one_off') return `Once in ${formatMonthLabel(item.startMonth)}`;
  return `Monthly from ${formatMonthLabel(item.startMonth)}${item.endMonth ? ` until ${formatMonthLabel(item.endMonth)}` : ''}`;
};

export const FinanceQuickAdd = ({ mode, categories, startMonth, currencyCode, saving, onSave, onUseDetails }) => {
  const examples = FINANCE_QUICK_ENTRY_EXAMPLES[mode];
  const isOther = mode === 'other';
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  const interpret = (value = text) => {
    const parsed = parseFinanceQuickEntry(value, { mode, startMonth });
    setResult(parsed);
    setMessage('');
    return parsed;
  };

  const updateText = (value) => {
    setText(value);
    setResult(null);
    setMessage('');
  };

  const chooseExample = (example) => {
    setText(example);
    interpret(example);
  };

  const buildDraft = () => {
    if (!result?.ok) return null;
    const categoryId = findFinanceCategoryId(
      categories,
      result.item.categoryHint,
      result.item.flowType,
    );
    return { ...result.item, categoryId };
  };

  const save = async () => {
    const draft = buildDraft();
    if (!draft) return;
    try {
      await onSave(draft);
      setText('');
      setResult(null);
      setMessage(`${draft.name} was added to your plan.`);
    } catch (error) {
      setMessage(error?.message || 'Unable to add this row.');
    }
  };

  const useDetails = () => {
    const draft = buildDraft();
    if (draft) onUseDetails(draft);
  };

  const draft = buildDraft();
  const matchedCategory = draft?.categoryId
    ? categories.find((category) => category.id === draft.categoryId)
    : null;

  return (
    <div className="border-b border-slate-200 px-3 py-3 sm:px-5 sm:py-4">
      <div className="rounded-2xl border border-[var(--pm-accent)]/20 bg-[var(--pm-accent-tint)] p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-black text-slate-950">Quick add</div>
            <p id={`finance-quick-help-${mode}`} className="mt-0.5 text-xs leading-5 text-slate-500">
              {isOther ? 'Type the cost, amount, and when it is due.' : 'Type the name, amount, and whether it is income or optional.'}
            </p>
          </div>
          <span className="rounded-full border border-[var(--pm-accent)]/20 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--pm-accent-strong)]">Parsed privately</span>
        </div>

        <form
          onSubmit={(event) => { event.preventDefault(); interpret(); }}
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        >
          <label className="min-w-0">
            <span className="sr-only">Describe the {isOther ? 'other cost' : 'regular amount'}</span>
            <input
              value={text}
              onChange={(event) => updateText(event.target.value)}
              placeholder={isOther ? 'e.g. MOT £350 in October' : 'e.g. Energy £150 monthly'}
              aria-describedby={`finance-quick-help-${mode}`}
              autoComplete="off"
              enterKeyHint="done"
              className={`${fieldClass} min-h-11 border-white bg-white shadow-sm`}
            />
          </label>
          <button type="submit" disabled={!text.trim()} className={`${primaryButton} min-h-11 w-full sm:w-auto`}>Preview</button>
        </form>

        <div className="mt-3">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Examples</span>
          <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => chooseExample(example)}
                className="min-h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-[var(--pm-accent)]/30 hover:text-[var(--pm-accent-strong)]"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {result && !result.ok ? (
          <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {result.errors.join(' ')}
          </div>
        ) : null}

        {result?.ok && draft ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-black text-slate-950">{draft.name}</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">{quickScheduleLabel(draft)}</div>
              </div>
              <div className={`text-lg font-black ${draft.flowType === 'income' ? 'text-emerald-700' : 'text-slate-950'}`}>
                {draft.flowType === 'income' ? '+' : '-'}{formatCurrency(draft.amountPence, currencyCode)}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{draft.flowType === 'income' ? 'Income' : QUICK_CLASSIFICATION_LABELS[draft.classification]}</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{matchedCategory?.name || draft.categoryHint || 'No category'}</span>
            </div>
            {result.warnings.map((warning) => <p key={warning} className="mt-2 text-xs font-semibold text-amber-700">{warning}</p>)}
            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={useDetails} className={`${secondaryButton} min-h-11 w-full sm:w-auto`}>Edit details</button>
              <button type="button" onClick={() => void save()} disabled={saving} className={`${primaryButton} min-h-11 w-full sm:w-auto`}>{saving ? 'Adding...' : 'Add to plan'}</button>
            </div>
          </div>
        ) : null}

        {message ? <p role="status" className="mt-3 text-sm font-semibold text-slate-600">{message}</p> : null}
        <p className="mt-3 text-[11px] leading-4 text-slate-400">This sentence is interpreted in your browser and is not sent to AI. Only the confirmed plan row is saved.</p>
      </div>
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
  const historyMonth = getCurrentMonthKey();
  const regularItems = useMemo(() => finance.budgetItems.filter((item) => item.frequency === 'monthly' && !isHistoricalFinanceItem(item, historyMonth)).sort((left, right) => `${left.flowType === 'income' ? '0' : '1'}${left.name}`.localeCompare(`${right.flowType === 'income' ? '0' : '1'}${right.name}`)), [finance.budgetItems, historyMonth]);
  const incomeItems = regularItems.filter((item) => item.flowType === 'income');
  const expenseItems = regularItems.filter((item) => item.flowType === 'expense');
  const expenseGroups = useMemo(() => groupFinanceExpenseItems(expenseItems, finance.categories), [expenseItems, finance.categories]);
  const populatedExpenseGroups = expenseGroups.filter((group) => group.items.length);
  const closeForm = () => { setAdding(false); setEditingItem(null); };
  return (
    <div className="space-y-4">
      <SummaryStrip currentMonth={currentMonth} openingCashPence={finance.profile.openingCashPence} currencyCode={currencyCode} />
      <Section>
        <SectionHeader title="Regular income and expenses" detail="Amounts that normally repeat every month." action={<button type="button" onClick={() => { setEditingItem(null); setAdding(true); }} className={secondaryButton}>Use detailed form</button>} />
        <FinanceQuickAdd mode="regular" categories={finance.categories} startMonth={finance.profile.forecastStartMonth} currencyCode={currencyCode} saving={finance.saving} onSave={finance.saveBudgetItem} onUseDetails={(item) => { setAdding(true); setEditingItem(item); }} />
        {adding || editingItem ? <PlannerItemForm key={editingItem?.id || `new-regular-${editingItem?.name || 'row'}-${editingItem?.startMonth || ''}`} mode="regular" categories={finance.categories} initialItem={editingItem} startMonth={finance.profile.forecastStartMonth} saving={finance.saving} onSave={finance.saveBudgetItem} onClose={closeForm} /> : null}
        <div className="bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 sm:px-5">Income</div>
        <ItemRows items={incomeItems} categories={finance.categories} currencyCode={currencyCode} onEdit={(item) => { setAdding(false); setEditingItem(item); }} onDelete={finance.deleteBudgetItem} />
        {populatedExpenseGroups.length ? populatedExpenseGroups.map((group) => (
          <React.Fragment key={group.id}>
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 sm:px-5">{group.label}</div>
            <ItemRows items={group.items} categories={finance.categories} currencyCode={currencyCode} onEdit={(item) => { setAdding(false); setEditingItem(item); }} onDelete={finance.deleteBudgetItem} />
          </React.Fragment>
        )) : (
          <React.Fragment>
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 sm:px-5">Expenses</div>
            <ItemRows items={[]} categories={finance.categories} currencyCode={currencyCode} onEdit={(item) => { setAdding(false); setEditingItem(item); }} onDelete={finance.deleteBudgetItem} />
          </React.Fragment>
        )}
      </Section>
      <ProfileSettings profile={finance.profile} saving={finance.saving} onSave={finance.saveProfile} onReset={finance.resetFinanceData} />
    </div>
  );
};

const OtherView = ({ finance, currencyCode }) => {
  const [editingItem, setEditingItem] = useState(null);
  const [adding, setAdding] = useState(false);
  const historyMonth = getCurrentMonthKey();
  const otherItems = useMemo(() => finance.budgetItems.filter((item) => item.frequency !== 'monthly' && !isHistoricalFinanceItem(item, historyMonth)).sort((left, right) => `${left.startMonth}${left.name}`.localeCompare(`${right.startMonth}${right.name}`)), [finance.budgetItems, historyMonth]);
  const closeForm = () => { setAdding(false); setEditingItem(null); };
  return (
    <Section>
      <SectionHeader title="Other and future costs" detail="Add MOT, insurance, birthdays, holidays, repairs, or any other dated cost. Each row appears automatically in the Plan." action={<button type="button" onClick={() => { setEditingItem(null); setAdding(true); }} className={secondaryButton}>Use detailed form</button>} />
      <FinanceQuickAdd mode="other" categories={finance.categories} startMonth={finance.profile.forecastStartMonth} currencyCode={currencyCode} saving={finance.saving} onSave={finance.saveBudgetItem} onUseDetails={(item) => { setAdding(true); setEditingItem(item); }} />
      {adding || editingItem ? <PlannerItemForm key={editingItem?.id || `new-other-${editingItem?.name || 'row'}-${editingItem?.startMonth || ''}`} mode="other" categories={finance.categories} initialItem={editingItem} startMonth={finance.profile.forecastStartMonth} saving={finance.saving} onSave={finance.saveBudgetItem} onClose={closeForm} /> : null}
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

const MonthlyPlanTable = ({ forecast, budgetItems, categories, snapshots, profile, currencyCode }) => {
  const snapshotByMonth = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.asOfMonth, snapshot])), [snapshots]);
  const amountFor = (item, month) => getItemAmountForMonth({ item, monthKey: month.monthKey, forecastStartMonth: profile.forecastStartMonth, annualExpenseInflationBps: profile.annualExpenseInflationBps, annualIncomeGrowthBps: profile.annualIncomeGrowthBps });
  const appearsInForecast = (item) => forecast.some((month) => amountFor(item, month) > 0);
  const regularIncome = budgetItems.filter((item) => item.frequency === 'monthly' && item.flowType === 'income' && appearsInForecast(item));
  const regularExpenses = budgetItems.filter((item) => item.frequency === 'monthly' && item.flowType === 'expense' && appearsInForecast(item));
  const expenseGroups = groupFinanceExpenseItems(regularExpenses, categories).filter((group) => group.items.length);
  const otherItems = budgetItems.filter((item) => item.frequency !== 'monthly' && appearsInForecast(item));
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
          {expenseGroups.map((group) => (
            <React.Fragment key={group.id}>
              <PlanGroup label={group.label} months={forecast} />
              {group.items.map((item) => <PlanRow key={item.id} {...rowProps} label={item.name} valueForMonth={(month) => amountFor(item, month)} />)}
            </React.Fragment>
          ))}
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

const FUTURE_EXPENSE_ROW_COUNT = 10;

const createFutureExpenseRows = (defaultMonth) => Array.from({ length: FUTURE_EXPENSE_ROW_COUNT }, (_, index) => ({
  key: `future-expense-${index + 1}`,
  name: '',
  amount: '',
  month: defaultMonth,
  frequency: 'one_off',
  error: '',
}));

const FutureExpenseGrid = ({ categories, defaultMonth, currencyCode, saving, onSave }) => {
  const [rows, setRows] = useState(() => createFutureExpenseRows(defaultMonth));
  const [message, setMessage] = useState('');

  const updateRow = (index, patch) => {
    setRows((previous) => previous.map((row, rowIndex) => (
      rowIndex === index ? { ...row, error: '', ...patch } : row
    )));
    setMessage('');
  };

  const saveRow = async (index) => {
    const row = rows[index];
    const amountPence = parseCurrencyToPence(row.amount);
    const fieldErrors = [];
    if (!row.name.trim()) fieldErrors.push('Add a short description.');
    if (amountPence === null || amountPence <= 0) fieldErrors.push('Add an amount greater than zero.');
    if (!row.month) fieldErrors.push('Choose a due month.');
    if (fieldErrors.length) {
      updateRow(index, { error: fieldErrors.join(' ') });
      return;
    }

    const parsed = parseFinanceQuickEntry(`${row.name} ${row.amount}`, {
      mode: 'other',
      startMonth: row.month,
    });
    if (!parsed.ok) {
      updateRow(index, { error: parsed.errors.join(' ') });
      return;
    }

    const categoryId = findFinanceCategoryId(
      categories,
      parsed.item.categoryHint,
      'expense',
    );
    const draft = {
      ...parsed.item,
      categoryId,
      frequency: row.frequency,
      startMonth: row.month,
      endMonth: '',
      annualMonth: row.frequency === 'annual' ? Number(row.month.slice(5, 7)) : null,
    };

    try {
      await onSave(draft);
      setRows((previous) => previous.map((current, rowIndex) => (
        rowIndex === index
          ? { ...createFutureExpenseRows(defaultMonth)[index], key: current.key }
          : current
      )));
      setMessage(`${draft.name} was added to ${formatMonthLabel(draft.startMonth)}.`);
    } catch (error) {
      updateRow(index, { error: error?.message || 'Unable to add this expense.' });
    }
  };

  return (
    <Section>
      <SectionHeader
        title="Add future expenses"
        detail="Ten blank lines stay ready below your plan. Add a one-off cost, or make it repeat monthly or yearly."
      />
      <div className="hidden grid-cols-[28px_minmax(180px,1fr)_120px_150px_135px_78px] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 sm:grid">
        <span>#</span><span>Description</span><span>Amount ({currencyCode})</span><span>Due month</span><span>Repeat</span><span />
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((row, index) => (
          <div key={row.key} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 px-3 py-3 sm:grid-cols-[28px_minmax(180px,1fr)_120px_150px_135px_78px] sm:items-start sm:px-4 sm:py-2">
            <span className="pt-2.5 text-xs font-black text-slate-300">{index + 1}</span>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 sm:sr-only">Description</span>
              <input
                value={row.name}
                onChange={(event) => updateRow(index, { name: event.target.value })}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveRow(index); } }}
                placeholder="e.g. MOT or holiday"
                className={`${fieldClass} min-h-10 py-2`}
              />
            </label>
            <label className="col-start-2 sm:col-start-auto">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 sm:sr-only">Amount</span>
              <input
                value={row.amount}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveRow(index); } }}
                inputMode="decimal"
                placeholder="0"
                className={`${fieldClass} min-h-10 py-2`}
              />
            </label>
            <label className="col-start-2 sm:col-start-auto">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 sm:sr-only">Due month</span>
              <input type="month" value={row.month} min={getCurrentMonthKey()} onChange={(event) => updateRow(index, { month: event.target.value })} className={`${fieldClass} min-h-10 py-2`} />
            </label>
            <label className="col-start-2 sm:col-start-auto">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 sm:sr-only">Repeat</span>
              <select value={row.frequency} onChange={(event) => updateRow(index, { frequency: event.target.value })} className={`${fieldClass} min-h-10 py-2`}>
                <option value="one_off">Once</option>
                <option value="monthly">Every month</option>
                <option value="annual">Every year</option>
              </select>
            </label>
            <button type="button" onClick={() => void saveRow(index)} disabled={saving || !row.name.trim() || !row.amount.trim()} className={`${primaryButton} col-start-2 min-h-10 px-3 py-2 sm:col-start-auto`}>Add</button>
            {row.error ? <p role="alert" className="col-start-2 text-xs font-semibold text-rose-700 sm:col-span-5 sm:col-start-2">{row.error}</p> : null}
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
        <p>Once: moves to History after its due month. Every month: joins the regular expense groups. Every year: stays scheduled for the same month each year.</p>
        {message ? <p role="status" className="mt-1 font-black text-emerald-700">{message}</p> : null}
      </div>
    </Section>
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

const historicalScheduleLabel = (item) => {
  if (item.frequency === 'one_off') return formatMonthLabel(item.startMonth);
  if (item.endMonth) return `${formatMonthLabel(item.startMonth)} – ${formatMonthLabel(item.endMonth)}`;
  if (item.frequency === 'annual') return `Every ${formatMonthLabel(item.startMonth, { year: undefined })}`;
  return `From ${formatMonthLabel(item.startMonth)}`;
};

const History = ({ snapshots, actualEntries, budgetItems, currencyCode }) => {
  const currentMonth = getCurrentMonthKey();
  const historicalItems = budgetItems
    .filter((item) => isHistoricalFinanceItem(item, currentMonth))
    .sort((left, right) => String(right.endMonth || right.startMonth).localeCompare(String(left.endMonth || left.startMonth)));
  const historyCount = snapshots.length + actualEntries.length + historicalItems.length;

  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-slate-700">Past and recorded history ({historyCount})</summary>
      <div className="grid gap-4 border-t border-slate-100 px-4 py-4 lg:grid-cols-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Past plan rows</div>
          <div className="mt-2 divide-y divide-slate-100">
            {historicalItems.length ? historicalItems.map((item) => (
              <div key={item.id} className="py-2 text-sm">
                <div className="flex justify-between gap-3"><span className="min-w-0 truncate font-semibold text-slate-600">{item.name}</span><span className={`shrink-0 font-black ${item.flowType === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>{item.flowType === 'income' ? '+' : '-'}{formatCurrency(item.amountPence, currencyCode)}</span></div>
                <div className="mt-0.5 text-xs font-semibold text-slate-400">{historicalScheduleLabel(item)}</div>
              </div>
            )) : <p className="py-2 text-sm text-slate-500">Past one-offs and ended rows will appear here.</p>}
          </div>
        </div>
        <div><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Savings facts</div><div className="mt-2 divide-y divide-slate-100">{snapshots.length ? snapshots.map((snapshot) => <div key={snapshot.id} className="flex justify-between gap-3 py-2 text-sm"><span className="font-semibold text-slate-500">{formatMonthLabel(snapshot.asOfMonth)}</span><span className="font-black text-slate-900">{formatCurrency(snapshot.cashBalancePence, currencyCode)}</span></div>) : <p className="py-2 text-sm text-slate-500">No facts recorded.</p>}</div></div>
        <div><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Older actual entries</div><div className="mt-2 divide-y divide-slate-100">{actualEntries.length ? actualEntries.slice(0, 24).map((entry) => <div key={entry.id} className="flex justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate font-semibold text-slate-500">{entry.note || entry.occurredOn}</span><span className="font-black text-slate-900">{entry.flowType === 'income' ? '+' : '-'}{formatCurrency(entry.amountPence, currencyCode)}</span></div>) : <p className="py-2 text-sm text-slate-500">No actual entries recorded.</p>}</div></div>
      </div>
    </details>
  );
};

const PlanView = ({ finance, forecast, horizon, onHorizonChange, currencyCode }) => {
  const currentMonth = getCurrentMonthKey();
  const defaultExpenseMonth = finance.profile.forecastStartMonth > currentMonth
    ? finance.profile.forecastStartMonth
    : currentMonth;

  return (
    <div className="space-y-4">
      <Section>
        <SectionHeader title="Monthly plan" detail="Regular expenses are grouped like your household spreadsheet. Future costs appear in their selected month." action={<div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">{FINANCE_HORIZON_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => onHorizonChange(option.value)} className={`rounded-lg px-3 py-2 text-xs font-black ${horizon === option.value ? 'bg-white text-[var(--pm-accent)] shadow-sm' : 'text-slate-500'}`}>{option.label}</button>)}</div>} />
        <div className="p-3 sm:p-4"><MonthlyPlanTable forecast={forecast} budgetItems={finance.budgetItems} categories={finance.categories} snapshots={finance.balanceSnapshots} profile={finance.profile} currencyCode={currencyCode} /></div>
      </Section>
      <FutureExpenseGrid key={defaultExpenseMonth} categories={finance.categories} defaultMonth={defaultExpenseMonth} currencyCode={currencyCode} saving={finance.saving} onSave={finance.saveBudgetItem} />
      <FactForm profile={finance.profile} saving={finance.saving} onSave={finance.saveBalanceSnapshot} />
      <History snapshots={finance.balanceSnapshots} actualEntries={finance.actualEntries} budgetItems={finance.budgetItems} currencyCode={currencyCode} />
    </div>
  );
};

export default function FinancePlannerView({ currentUserId }) {
  const finance = useFinanceData({ currentUserId });
  const [activeTab, setActiveTab] = useState('plan');
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
        <div><h1 className="text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">Financial Planner</h1><p className="mt-1 text-sm text-slate-500">Read the plan and add future costs in the same place.</p></div>
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
