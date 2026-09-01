import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFinanceData } from '../hooks/useFinanceData';
import {
  addMonths,
  buildFinanceForecast,
  formatCurrency,
  formatMonthLabel,
  getCurrentMonthKey,
  getItemAmountForMonth,
  parseCurrencyToPence,
} from '../utils/financePlanner';
import {
  FINANCE_EXPENSE_GROUPS,
  findFinanceGroupCategoryId,
  getFinanceExpenseGroup,
  getFinanceExpenseGroupId,
  groupFinanceExpenseItems,
  isHistoricalFinanceItem,
} from '../utils/financePlanRows';
import {
  downloadFinanceAnalysisWorkbook,
  FINANCE_EXPORT_RANGE_OPTIONS,
} from '../utils/financeAnalysisExport';

const VIEWS = [
  { id: 'plan', label: 'Plan' },
  { id: 'history', label: 'History' },
];

const fieldClass = 'pm-input w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-950 placeholder:text-slate-400';
const primaryButton = 'pm-toolbar-primary min-h-11 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const subtleButton = 'min-h-11 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:opacity-40';

const useDialogFocus = ({ open, onClose, dialogRef, initialFocusRef }) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusInitialControl = () => (initialFocusRef.current || dialogRef.current)?.focus();
    const frame = requestAnimationFrame(focusInitialControl);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll(focusableSelector)]
        .filter((control) => !control.hidden && control.getClientRects().length > 0);
      if (!controls.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [dialogRef, initialFocusRef, open]);
};

const penceToInput = (value) => {
  const amount = (Number(value) || 0) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0$/, '');
};

const Section = ({ children, className = '', id }) => (
  <section id={id} className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}>{children}</section>
);

const SectionHeader = ({ title, detail, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
    <div className="min-w-0">
      <h2 className="text-lg font-black tracking-[-0.025em] text-slate-950">{title}</h2>
      {detail ? <p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p> : null}
    </div>
    {action}
  </div>
);

const PlannerNavigation = ({ activeView, onChange }) => {
  const moveFocus = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + VIEWS.length) % VIEWS.length;
    onChange(VIEWS[nextIndex].id);
    document.getElementById(`finance-tab-${VIEWS[nextIndex].id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label="Financial Planner views" className="grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-[260px]">
      {VIEWS.map((view, index) => (
        <button
          key={view.id}
          id={`finance-tab-${view.id}`}
          type="button"
          role="tab"
          aria-selected={activeView === view.id}
          aria-controls={`finance-panel-${view.id}`}
          tabIndex={activeView === view.id ? 0 : -1}
          onKeyDown={(event) => moveFocus(event, index)}
          onClick={() => onChange(view.id)}
          className={`rounded-lg px-3 py-2.5 text-sm font-black transition ${activeView === view.id ? 'bg-[var(--pm-accent)] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
};

const amountForItem = (item, monthKey, profile) => getItemAmountForMonth({
  item,
  monthKey,
  forecastStartMonth: profile.forecastStartMonth,
  annualExpenseInflationBps: profile.annualExpenseInflationBps,
  annualIncomeGrowthBps: profile.annualIncomeGrowthBps,
});

const buildMonthMetrics = (month, budgetItems, profile) => {
  if (!month) return { incomePence: 0, regularPence: 0, extrasPence: 0, leftPence: 0 };
  const regularPence = budgetItems
    .filter((item) => item.flowType === 'expense' && item.frequency === 'monthly')
    .reduce((total, item) => total + amountForItem(item, month.monthKey, profile), 0);
  return {
    incomePence: month.incomePence,
    regularPence,
    extrasPence: Math.max(0, month.expensePence - regularPence),
    leftPence: month.surplusPence,
  };
};

const PlanSummary = ({ month, metrics, currencyCode }) => {
  const cells = [
    { label: 'Left this month', value: metrics.leftPence, tone: metrics.leftPence >= 0 ? 'text-emerald-700' : 'text-rose-700', mobileOrder: 'order-first sm:order-last' },
    { label: 'Income', value: metrics.incomePence, tone: 'text-emerald-700' },
    { label: 'Regular expenses', value: metrics.regularPence, tone: 'text-slate-950' },
    { label: 'Extra costs', value: metrics.extrasPence, tone: 'text-amber-700' },
  ];
  return (
    <section aria-label={`Summary for ${formatMonthLabel(month.monthKey)}`} className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className={`border-b border-r border-slate-100 px-4 py-3 last:border-r-0 sm:border-b-0 ${cell.mobileOrder || ''}`}>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{cell.label}</div>
          <div className={`mt-1 text-xl font-black tracking-[-0.035em] ${cell.tone}`}>{formatCurrency(cell.value, currencyCode)}</div>
        </div>
      ))}
    </section>
  );
};

const MonthNavigator = ({ forecast, selectedIndex, onChange }) => {
  const currentMonth = getCurrentMonthKey();
  const todayIndex = forecast.findIndex((month) => month.monthKey === currentMonth);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-2 sm:px-3">
      <button type="button" disabled={selectedIndex <= 0} onClick={() => onChange(selectedIndex - 1)} className={subtleButton} aria-label="Previous month">←</button>
      <div className="text-center">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Planning month</div>
        <div className="text-base font-black text-slate-950">{formatMonthLabel(forecast[selectedIndex]?.monthKey)}</div>
      </div>
      <div className="flex items-center gap-1">
        {todayIndex >= 0 && todayIndex !== selectedIndex ? <button type="button" onClick={() => onChange(todayIndex)} className="min-h-11 rounded-xl px-3 text-xs font-black text-[var(--pm-accent)] hover:bg-[var(--pm-accent-tint)]">Today</button> : null}
        <button type="button" disabled={selectedIndex >= forecast.length - 1} onClick={() => onChange(selectedIndex + 1)} className={subtleButton} aria-label="Next month">→</button>
      </div>
    </div>
  );
};

const PlanRow = ({ item, label, months, valueForMonth, tone = 'text-slate-800', strong = false, currencyCode, onEdit }) => (
  <tr className="border-t border-slate-100">
    <th scope="row" className={`sticky left-0 z-10 min-w-[205px] border-r border-slate-200 bg-white px-3 py-1 text-left text-xs ${strong ? 'font-black text-slate-950' : 'font-semibold text-slate-600'}`}>
      {item && onEdit ? (
        <button type="button" onClick={() => onEdit(item)} className="min-h-9 w-full rounded-lg px-1 text-left hover:bg-slate-50 hover:text-[var(--pm-accent)]" aria-label={`Edit ${label}`}>{label}</button>
      ) : <span className="block py-2">{label}</span>}
    </th>
    {months.map((month) => {
      const value = valueForMonth(month);
      const resolvedTone = typeof tone === 'function' ? tone(value) : tone;
      return <td key={month.monthKey} className={`min-w-[104px] px-3 py-2 text-right text-xs ${strong ? 'font-black' : 'font-semibold'} ${resolvedTone}`}>{value === null || value === undefined || value === 0 ? '' : formatCurrency(value, currencyCode)}</td>;
    })}
  </tr>
);

const PlanGroup = ({ label, months }) => (
  <tr>
    <th scope="rowgroup" className="sticky left-0 z-20 border-r border-slate-200 bg-slate-100 px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</th>
    {months.map((month) => <td key={month.monthKey} className="bg-slate-100" />)}
  </tr>
);

const DesktopPlanTable = ({ months, budgetItems, categories, snapshots, profile, currencyCode, onEdit }) => {
  const snapshotByMonth = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.asOfMonth, snapshot])), [snapshots]);
  const appearsInWindow = (item) => months.some((month) => amountForItem(item, month.monthKey, profile) > 0);
  const incomeItems = budgetItems.filter((item) => item.flowType === 'income' && appearsInWindow(item));
  const regularExpenses = budgetItems.filter((item) => item.flowType === 'expense' && item.frequency === 'monthly' && appearsInWindow(item));
  const expenseGroups = groupFinanceExpenseItems(regularExpenses, categories).filter((group) => group.items.length);
  const extraItems = budgetItems.filter((item) => item.flowType === 'expense' && item.frequency !== 'monthly' && appearsInWindow(item));
  const extraTotal = (month) => extraItems.reduce((sum, item) => sum + amountForItem(item, month.monthKey, profile), 0);
  const rowProps = { months, currencyCode };
  const nameCounts = [...incomeItems, ...regularExpenses, ...extraItems].reduce((counts, item) => {
    const key = String(item.name || '').trim().toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const rowLabel = (item) => {
    const key = String(item.name || '').trim().toLowerCase();
    if ((nameCounts.get(key) || 0) < 2) return item.name;
    if (item.frequency === 'one_off') return `${item.name} · ${formatMonthLabel(item.startMonth)}`;
    return `${item.name} · ${item.endMonth ? `until ${formatMonthLabel(item.endMonth)}` : `from ${formatMonthLabel(item.startMonth)}`}`;
  };

  return (
    <div tabIndex="0" role="region" aria-label="Twelve month household plan. Scroll horizontally for later months." className="overflow-x-auto rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--pm-accent)]/30">
      <table className="w-max min-w-full border-separate border-spacing-0">
        <caption className="sr-only">Household income, grouped expenses, and savings for twelve months.</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-30 min-w-[205px] border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-black text-slate-700">Household plan</th>
            {months.map((month) => <th scope="col" key={month.monthKey} className="sticky top-0 z-20 min-w-[104px] border-b border-slate-200 bg-slate-50 px-3 py-3 text-right text-xs font-black text-slate-700">{formatMonthLabel(month.monthKey)}</th>)}
          </tr>
        </thead>
        <tbody>
          <PlanGroup label="Income" months={months} />
          {incomeItems.map((item) => <PlanRow key={item.id} {...rowProps} item={item} label={rowLabel(item)} valueForMonth={(month) => amountForItem(item, month.monthKey, profile)} tone="text-emerald-700" onEdit={onEdit} />)}
          <PlanRow {...rowProps} label="Income total" valueForMonth={(month) => month.incomePence} tone="text-emerald-700" strong />
          {expenseGroups.map((group) => (
            <React.Fragment key={group.id}>
              <PlanGroup label={group.label} months={months} />
              {group.items.map((item) => <PlanRow key={item.id} {...rowProps} item={item} label={rowLabel(item)} valueForMonth={(month) => amountForItem(item, month.monthKey, profile)} onEdit={onEdit} />)}
            </React.Fragment>
          ))}
          {extraItems.length ? <PlanGroup label="Occasional & yearly" months={months} /> : null}
          {extraItems.map((item) => <PlanRow key={item.id} {...rowProps} item={item} label={rowLabel(item)} valueForMonth={(month) => amountForItem(item, month.monthKey, profile)} tone="text-amber-700" onEdit={onEdit} />)}
          {extraItems.length ? <PlanRow {...rowProps} label="Extra costs total" valueForMonth={extraTotal} tone="text-amber-700" strong /> : null}
          <PlanGroup label="Monthly result" months={months} />
          <PlanRow {...rowProps} label="Expenses total" valueForMonth={(month) => month.expensePence} strong />
          <PlanRow {...rowProps} label="Left this month" valueForMonth={(month) => month.surplusPence} tone={(value) => value >= 0 ? 'text-emerald-700' : 'text-rose-700'} strong />
          <PlanRow {...rowProps} label="Planned savings" valueForMonth={(month) => month.closingCashPence} tone={(value) => value >= 0 ? 'text-violet-700' : 'text-rose-700'} strong />
          <PlanRow {...rowProps} label="Recorded savings" valueForMonth={(month) => snapshotByMonth.get(month.monthKey)?.cashBalancePence ?? null} tone="text-sky-700" strong />
        </tbody>
      </table>
    </div>
  );
};

const MobileExpenseGroup = ({ group, monthKey, profile, currencyCode, onEdit }) => {
  const total = group.items.reduce((sum, item) => sum + amountForItem(item, monthKey, profile), 0);
  return (
    <details className="border-b border-slate-100 last:border-b-0" open>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <span><span className="font-black text-slate-900">{group.label}</span><span className="ml-2 text-xs font-semibold text-slate-400">{group.items.length} {group.items.length === 1 ? 'row' : 'rows'}</span></span>
        <span className="font-black text-slate-950">{formatCurrency(total, currencyCode)}</span>
      </summary>
      <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-1">
        {group.items.map((item) => (
          <button key={item.id} type="button" onClick={() => onEdit(item)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-white">
            <span className="min-w-0 truncate text-sm font-semibold text-slate-600">{item.name}</span>
            <span className="shrink-0 text-sm font-black text-slate-900">{formatCurrency(amountForItem(item, monthKey, profile), currencyCode)}</span>
          </button>
        ))}
      </div>
    </details>
  );
};

const MobileMonthPlan = ({ month, budgetItems, categories, profile, currencyCode, onEdit }) => {
  const activeIncome = budgetItems.filter((item) => item.flowType === 'income' && amountForItem(item, month.monthKey, profile) > 0);
  const activeExpenses = budgetItems.filter((item) => item.flowType === 'expense' && amountForItem(item, month.monthKey, profile) > 0);
  const regularGroups = groupFinanceExpenseItems(activeExpenses.filter((item) => item.frequency === 'monthly'), categories).filter((group) => group.items.length);
  const extraItems = activeExpenses.filter((item) => item.frequency !== 'monthly');

  return (
    <Section className="md:hidden">
      <SectionHeader title={`Plan for ${formatMonthLabel(month.monthKey)}`} detail="Tap a row to change it. Regular groups expand and collapse." />
      {activeIncome.length ? (
        <details className="border-b border-slate-200" open>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 bg-emerald-50 px-4 py-3 marker:hidden"><span className="font-black text-emerald-900">Income</span><span className="font-black text-emerald-800">{formatCurrency(activeIncome.reduce((sum, item) => sum + amountForItem(item, month.monthKey, profile), 0), currencyCode)}</span></summary>
          <div className="border-t border-emerald-100 bg-emerald-50/40 px-2 py-1">{activeIncome.map((item) => <button key={item.id} type="button" onClick={() => onEdit(item)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-white"><span className="truncate text-sm font-semibold text-slate-600">{item.name}</span><span className="shrink-0 text-sm font-black text-emerald-800">{formatCurrency(amountForItem(item, month.monthKey, profile), currencyCode)}</span></button>)}</div>
        </details>
      ) : null}
      {regularGroups.length ? regularGroups.map((group) => <MobileExpenseGroup key={group.id} group={group} monthKey={month.monthKey} profile={profile} currencyCode={currencyCode} onEdit={onEdit} />) : <p className="px-4 py-8 text-center text-sm text-slate-500">No regular expenses in this month.</p>}
      {extraItems.length ? (
        <div className="border-t border-slate-200">
          <div className="flex items-center justify-between bg-amber-50 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-800"><span>Extra costs</span><span>{formatCurrency(extraItems.reduce((sum, item) => sum + amountForItem(item, month.monthKey, profile), 0), currencyCode)}</span></div>
          <div className="px-2 py-1">{extraItems.map((item) => <button key={item.id} type="button" onClick={() => onEdit(item)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-amber-50"><span className="truncate text-sm font-semibold text-slate-600">{item.name}</span><span className="shrink-0 text-sm font-black text-amber-800">{formatCurrency(amountForItem(item, month.monthKey, profile), currencyCode)}</span></button>)}</div>
        </div>
      ) : null}
    </Section>
  );
};

const UpcomingExpenses = ({ forecast, selectedIndex, budgetItems, categories, profile, currencyCode, onEdit }) => {
  const upcoming = [];
  const seen = new Set();
  forecast.slice(selectedIndex).forEach((month) => {
    budgetItems.filter((item) => item.flowType === 'expense' && item.frequency !== 'monthly').forEach((item) => {
      if (seen.has(item.id)) return;
      const amountPence = amountForItem(item, month.monthKey, profile);
      if (amountPence <= 0) return;
      seen.add(item.id);
      upcoming.push({ item, monthKey: month.monthKey, amountPence });
    });
  });
  const visible = upcoming.slice(0, 6);
  return (
    <Section>
      <SectionHeader title="Coming up" detail="The next one-off and yearly costs already included in your plan." />
      {visible.length ? <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map(({ item, monthKey, amountPence }) => {
        const group = getFinanceExpenseGroup(getFinanceExpenseGroupId(item, categories));
        return <button key={`${item.id}-${monthKey}`} type="button" onClick={() => onEdit(item)} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-[var(--pm-accent)]/30 hover:bg-[var(--pm-accent-tint)]"><span className="min-w-0"><span className="block truncate text-sm font-black text-slate-900">{item.name}</span><span className="mt-0.5 block text-xs font-semibold text-slate-400">{formatMonthLabel(monthKey)} · {group.label} · {item.frequency === 'annual' ? 'Yearly' : 'Once'}</span></span><span className="shrink-0 text-sm font-black text-amber-800">{formatCurrency(amountPence, currencyCode)}</span></button>;
      })}</div> : <p className="px-4 py-7 text-center text-sm text-slate-500">No occasional costs are scheduled yet.</p>}
    </Section>
  );
};

const createExpenseDraft = (defaultMonth, key = 'draft') => ({
  key,
  name: '',
  groupId: '',
  amount: '',
  month: defaultMonth,
  frequency: 'one_off',
  error: '',
});

const ExpenseDraftFields = ({ draft, onChange, idPrefix, showLabels = false, nameRef }) => (
  <>
    <label>
      <span className={showLabels ? 'mb-1 block text-xs font-bold text-slate-500' : 'sr-only'}>Description</span>
      <input ref={nameRef} value={draft.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="e.g. MOT or gym" className={`${fieldClass} min-h-10 py-2`} aria-invalid={Boolean(draft.error)} aria-describedby={draft.error ? `${idPrefix}-error` : undefined} />
    </label>
    <label>
      <span className={showLabels ? 'mb-1 block text-xs font-bold text-slate-500' : 'sr-only'}>Group</span>
      <select value={draft.groupId} onChange={(event) => onChange({ groupId: event.target.value })} className={`${fieldClass} min-h-10 py-2`}>
        <option value="">Auto group</option>
        {FINANCE_EXPENSE_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
    </label>
    <label>
      <span className={showLabels ? 'mb-1 block text-xs font-bold text-slate-500' : 'sr-only'}>Amount</span>
      <input value={draft.amount} onChange={(event) => onChange({ amount: event.target.value })} inputMode="decimal" placeholder="0" className={`${fieldClass} min-h-10 py-2`} aria-invalid={Boolean(draft.error)} />
    </label>
    <label>
      <span className={showLabels ? 'mb-1 block text-xs font-bold text-slate-500' : 'sr-only'}>{draft.frequency === 'one_off' ? 'Due month' : 'Starts'}</span>
      <input type="month" value={draft.month} min={getCurrentMonthKey()} onChange={(event) => onChange({ month: event.target.value })} className={`${fieldClass} min-h-10 py-2`} />
    </label>
    <label>
      <span className={showLabels ? 'mb-1 block text-xs font-bold text-slate-500' : 'sr-only'}>Repeats</span>
      <select value={draft.frequency} onChange={(event) => onChange({ frequency: event.target.value })} className={`${fieldClass} min-h-10 py-2`}>
        <option value="one_off">Once</option>
        <option value="monthly">Monthly</option>
        <option value="annual">Yearly</option>
      </select>
    </label>
  </>
);

const ExpenseEntryPanel = ({ defaultMonth, currencyCode, saving, requestId, onSave }) => {
  const [rows, setRows] = useState(() => Array.from({ length: 10 }, (_, index) => createExpenseDraft(defaultMonth, `desktop-${index}`)));
  const [visibleRows, setVisibleRows] = useState(3);
  const [pendingKey, setPendingKey] = useState('');
  const [message, setMessage] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDraft, setMobileDraft] = useState(() => createExpenseDraft(defaultMonth, 'mobile'));
  const firstDesktopInputRef = useRef(null);
  const mobileDialogRef = useRef(null);
  const mobileNameRef = useRef(null);

  useDialogFocus({
    open: mobileOpen,
    onClose: () => setMobileOpen(false),
    dialogRef: mobileDialogRef,
    initialFocusRef: mobileNameRef,
  });

  useEffect(() => {
    const useSelectedMonthWhenBlank = (draft) => (
      !draft.name.trim() && !draft.amount.trim()
        ? { ...draft, month: defaultMonth, error: '' }
        : draft
    );
    setRows((previous) => previous.map(useSelectedMonthWhenBlank));
    setMobileDraft(useSelectedMonthWhenBlank);
  }, [defaultMonth]);

  useEffect(() => {
    if (!requestId) return;
    if (window.matchMedia('(max-width: 1023px)').matches) setMobileOpen(true);
    else firstDesktopInputRef.current?.focus();
  }, [requestId]);

  const prepareDraft = (draft) => {
    const amountPence = parseCurrencyToPence(draft.amount);
    const errors = [];
    if (!draft.name.trim()) errors.push('Add a description.');
    if (amountPence === null || amountPence <= 0) errors.push('Add an amount greater than zero.');
    if (!draft.month) errors.push('Choose a month.');
    if (errors.length) throw new Error(errors.join(' '));
    const inferredGroupId = getFinanceExpenseGroupId({ name: draft.name }, []);
    const group = getFinanceExpenseGroup(draft.groupId || inferredGroupId);
    return {
      name: draft.name.trim(),
      groupId: group.id,
      amountPence,
      flowType: 'expense',
      classification: group.classification,
      cashTreatment: 'cash_outflow',
      frequency: draft.frequency,
      startMonth: draft.month,
      endMonth: '',
      annualMonth: draft.frequency === 'annual' ? Number(draft.month.slice(5, 7)) : null,
      isActive: true,
    };
  };

  const saveDesktopRow = async (index) => {
    const draft = rows[index];
    setPendingKey(draft.key);
    setMessage('');
    try {
      const prepared = prepareDraft(draft);
      await onSave(prepared);
      setRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? createExpenseDraft(defaultMonth, row.key) : row));
      setMessage(`${prepared.name} was added to ${formatMonthLabel(prepared.startMonth)}.`);
      requestAnimationFrame(() => {
        const nextInput = document.querySelector(`[data-finance-entry-row="${Math.min(index + 1, visibleRows - 1)}"] input`);
        nextInput?.focus();
      });
    } catch (error) {
      setRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, error: error?.message || 'Unable to add this expense.' } : row));
    } finally {
      setPendingKey('');
    }
  };

  const saveMobile = async (addAnother) => {
    setPendingKey(mobileDraft.key);
    try {
      const prepared = prepareDraft(mobileDraft);
      await onSave(prepared);
      setMessage(`${prepared.name} was added to ${formatMonthLabel(prepared.startMonth)}.`);
      if (addAnother) {
        setMobileDraft({ ...createExpenseDraft(prepared.startMonth, 'mobile'), groupId: prepared.groupId, frequency: prepared.frequency });
      } else {
        setMobileOpen(false);
        setMobileDraft(createExpenseDraft(defaultMonth, 'mobile'));
      }
    } catch (error) {
      setMobileDraft((previous) => ({ ...previous, error: error?.message || 'Unable to add this expense.' }));
    } finally {
      setPendingKey('');
    }
  };

  return (
    <Section id="add-expense">
      <SectionHeader title="Add expenses" detail="Type straight into the plan. Group is optional—the planner can suggest it from the description." action={<button type="button" onClick={() => setMobileOpen(true)} className={`${primaryButton} lg:hidden`}>+ Add expense</button>} />

      <div className="hidden lg:block">
        <div className="grid grid-cols-[minmax(190px,1fr)_180px_120px_150px_120px_76px] gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
          <span>Description</span><span>Group</span><span>Amount ({currencyCode})</span><span>Due / starts</span><span>Repeats</span><span />
        </div>
        <div className="divide-y divide-slate-100">
          {rows.slice(0, visibleRows).map((draft, index) => (
            <fieldset key={draft.key} data-finance-entry-row={index} className="grid grid-cols-[minmax(190px,1fr)_180px_120px_150px_120px_76px] items-start gap-2 px-4 py-2">
              <legend className="sr-only">New expense row {index + 1}</legend>
              <ExpenseDraftFields draft={draft} idPrefix={draft.key} nameRef={index === 0 ? firstDesktopInputRef : undefined} onChange={(patch) => { setRows((previous) => previous.map((row, rowIndex) => rowIndex === index ? { ...row, error: '', ...patch } : row)); setMessage(''); }} />
              <button type="button" onClick={() => void saveDesktopRow(index)} disabled={saving || pendingKey === draft.key || !draft.name.trim() || !draft.amount.trim()} className={`${primaryButton} min-h-10 px-3 py-2`}>Add</button>
              {draft.error ? <p id={`${draft.key}-error`} role="alert" className="col-span-6 text-xs font-semibold text-rose-700">{draft.error}</p> : null}
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button type="button" onClick={() => setVisibleRows((count) => count === 10 ? 3 : 10)} className="text-xs font-black text-[var(--pm-accent)]">{visibleRows === 10 ? 'Show fewer rows' : 'Show all 10 rows'}</button>
          {message ? <p role="status" className="text-xs font-black text-emerald-700">{message}</p> : <p className="text-xs font-semibold text-slate-400">Press Add, then keep typing on the next line.</p>}
        </div>
      </div>

      <div className="px-4 py-4 lg:hidden">
        <p className="text-sm leading-6 text-slate-500">One short form keeps the phone view fast. After saving, choose “Save & add another” for batch entry.</p>
        {message ? <p role="status" className="mt-2 text-sm font-black text-emerald-700">{message}</p> : null}
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
          <div ref={mobileDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="mobile-expense-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="mobile-expense-title" className="text-xl font-black text-slate-950">Add expense</h2><p className="mt-1 text-sm text-slate-500">Add it once or make it repeat automatically.</p></div>
              <button type="button" onClick={() => setMobileOpen(false)} className="min-h-11 min-w-11 rounded-xl text-xl font-bold text-slate-500 hover:bg-slate-100" aria-label="Close add expense">×</button>
            </div>
            <fieldset className="mt-4 grid gap-3">
              <legend className="sr-only">Expense details</legend>
              <ExpenseDraftFields draft={mobileDraft} idPrefix="mobile-expense" showLabels nameRef={mobileNameRef} onChange={(patch) => setMobileDraft((previous) => ({ ...previous, error: '', ...patch }))} />
              {mobileDraft.error ? <p id="mobile-expense-error" role="alert" className="text-sm font-semibold text-rose-700">{mobileDraft.error}</p> : null}
            </fieldset>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => void saveMobile(false)} disabled={saving || pendingKey === mobileDraft.key} className={primaryButton}>Save expense</button>
              <button type="button" onClick={() => void saveMobile(true)} disabled={saving || pendingKey === mobileDraft.key} className={secondaryButton}>Save & add another</button>
            </div>
          </div>
        </div>
      ) : null}
    </Section>
  );
};

export const FinanceExportDialog = ({ finance, forecast, onClose, onDownloaded }) => {
  const [range, setRange] = useState('overview');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const firstRangeRef = useRef(null);

  const close = () => {
    if (!exporting) onClose();
  };

  useDialogFocus({
    open: true,
    onClose: close,
    dialogRef,
    initialFocusRef: firstRangeRef,
  });

  const submit = async (event) => {
    event.preventDefault();
    if (exporting) return;
    setExporting(true);
    setError('');
    try {
      const result = await downloadFinanceAnalysisWorkbook({
        profile: finance.profile,
        categories: finance.categories,
        budgetItems: finance.budgetItems,
        actualEntries: finance.actualEntries,
        balanceSnapshots: finance.balanceSnapshots,
        goals: finance.goals,
        mortgages: finance.mortgages,
        scenarios: finance.scenarios,
        scenarioChanges: finance.scenarioChanges,
        forecast,
        range,
        includeNotes,
      });
      setExporting(false);
      onDownloaded(result.fileName);
      onClose();
    } catch {
      setError('We could not create the export. Your data has not been shared. Try again.');
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <form ref={dialogRef} tabIndex={-1} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="finance-export-title" aria-describedby="finance-export-description" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <div>
            <h2 id="finance-export-title" className="text-xl font-black text-slate-950">Export your finance data</h2>
            <p id="finance-export-description" className="mt-1 text-sm leading-6 text-slate-500">Download a structured Excel workbook you can attach to ChatGPT for analysis.</p>
          </div>
          <button type="button" onClick={close} disabled={exporting} className="min-h-[44px] min-w-[44px] rounded-xl text-xl font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Close finance export">×</button>
        </div>

        <div className="space-y-4 px-4 pb-4 sm:px-5">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-black text-emerald-900">Created privately on this device</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">PMWorkspace does not send this workbook to ChatGPT or anyone else. Account IDs, your account email and internal timestamps are not added.</p>
          </div>

          <fieldset>
            <legend className="text-sm font-black text-slate-900">Choose the period</legend>
            <p className="mt-1 text-xs leading-5 text-slate-500">The export includes entries and saved schedule versions that overlap this period.</p>
            <div className="mt-2 grid gap-2">
              {FINANCE_EXPORT_RANGE_OPTIONS.map((option, index) => (
                <label key={option.value} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition ${range === option.value ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-tint)]' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <input ref={index === 0 ? firstRangeRef : undefined} type="radio" name="finance-export-range" value={option.value} checked={range === option.value} onChange={(event) => setRange(event.target.value)} className="mt-1" />
                  <span><span className="block text-sm font-black text-slate-900">{option.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{option.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 px-3 py-3 hover:bg-slate-50">
            <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} className="mt-1" />
            <span><span className="block text-sm font-black text-slate-900">Include notes and owner labels</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Off by default because free-text fields may contain private details.</span></span>
          </label>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
            Item and category names are included so the analysis is useful. The workbook contains sensitive financial information, so store and share it carefully. A ready-to-use analysis prompt is included on the first sheet.
          </div>
          {error ? <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p> : null}
        </div>

        <div className="sticky bottom-0 border-t border-slate-100 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <p className="mb-3 text-xs leading-5 text-slate-400 sm:mb-0">Excel workbook (.xlsx)</p>
          <button type="submit" disabled={exporting} className={`${primaryButton} min-h-[44px] w-full sm:w-auto`}>{exporting ? 'Preparing workbook...' : 'Download workbook'}</button>
        </div>
      </form>
    </div>
  );
};

const PlanItemEditor = ({ item, categories, effectiveMonth, saving, onSave, onRemove, onClose }) => {
  const isNew = !item.id;
  const initialGroupId = item.flowType === 'expense' ? getFinanceExpenseGroupId(item, categories) : '';
  const canVersion = !isNew && item.frequency !== 'one_off' && effectiveMonth > item.startMonth;
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(penceToInput(item.amountPence));
  const [groupId, setGroupId] = useState(initialGroupId);
  const [frequency, setFrequency] = useState(item.frequency);
  const [startMonth, setStartMonth] = useState(item.startMonth);
  const [endMonth, setEndMonth] = useState(item.endMonth || '');
  const [applyMode, setApplyMode] = useState(canVersion ? 'from_month' : 'entire');
  const [changeMonth, setChangeMonth] = useState(canVersion ? effectiveMonth : item.startMonth);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);

  useDialogFocus({
    open: true,
    onClose,
    dialogRef,
    initialFocusRef: nameInputRef,
  });

  const submit = async (event) => {
    event.preventDefault();
    const amountPence = parseCurrencyToPence(amount);
    if (!name.trim() || amountPence === null || amountPence <= 0) { setError('Add a description and an amount greater than zero.'); return; }
    if (item.flowType === 'expense' && !groupId) { setError('Choose an expense group.'); return; }
    const effectiveStartMonth = applyMode === 'from_month' ? changeMonth : startMonth;
    if (endMonth && endMonth < effectiveStartMonth) { setError('The end month must be after the start month.'); return; }
    const annualMonth = frequency === 'annual'
      ? (applyMode === 'from_month' && item.frequency === 'annual'
        ? Number(item.annualMonth) || Number(item.startMonth.slice(5, 7))
        : Number(effectiveStartMonth.slice(5, 7)))
      : null;
    try {
      await onSave(item, applyMode === 'from_month' ? changeMonth : item.startMonth, {
        name: name.trim(),
        amountPence,
        frequency,
        startMonth: applyMode === 'entire' ? startMonth : item.startMonth,
        endMonth: frequency === 'one_off' ? '' : endMonth,
        annualMonth,
      }, groupId);
      onClose();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save this change.');
    }
  };

  const remove = async () => {
    const preservesHistory = item.frequency !== 'one_off' && effectiveMonth > item.startMonth;
    const prompt = preservesHistory
      ? `Stop ${item.name} from ${formatMonthLabel(effectiveMonth)}? Earlier months will stay in History.`
      : `Delete ${item.name}? This removes the saved row.`;
    if (!window.confirm(prompt)) return;
    setError('');
    try {
      await onRemove(item, effectiveMonth);
      onClose();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to remove this row.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef} tabIndex={-1} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="plan-item-editor-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-5">
        <div className="flex items-start justify-between gap-3"><div><h2 id="plan-item-editor-title" className="text-xl font-black text-slate-950">{isNew ? `Add ${item.flowType}` : `Change ${item.name}`}</h2><p className="mt-1 text-sm text-slate-500">{isNew ? 'Add it once or make it repeat automatically.' : 'Future changes keep the earlier amount in History.'}</p></div><button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl text-xl font-bold text-slate-500 hover:bg-slate-100" aria-label="Close editor">×</button></div>
        {canVersion ? (
          <fieldset className="mt-4 rounded-2xl border border-[var(--pm-accent)]/20 bg-[var(--pm-accent-tint)] p-3">
            <legend className="px-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--pm-accent-strong)]">Apply this change</legend>
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-bold text-slate-700"><input type="radio" name="apply-mode" value="from_month" checked={applyMode === 'from_month'} onChange={() => setApplyMode('from_month')} /> From <input type="month" value={changeMonth} min={item.startMonth} onChange={(event) => setChangeMonth(event.target.value)} className={`${fieldClass} ml-auto max-w-[180px]`} /></label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-slate-700"><input type="radio" name="apply-mode" value="entire" checked={applyMode === 'entire'} onChange={() => setApplyMode('entire')} /> Entire schedule</label>
          </fieldset>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-500">Description<input ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} className={`${fieldClass} mt-1`} /></label>
          <label className="text-xs font-bold text-slate-500">Amount<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className={`${fieldClass} mt-1`} /></label>
          {item.flowType === 'expense' ? <label className="text-xs font-bold text-slate-500">Group<select value={groupId} onChange={(event) => setGroupId(event.target.value)} className={`${fieldClass} mt-1`}>{FINANCE_EXPENSE_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label> : null}
          <label className="text-xs font-bold text-slate-500">Repeats<select value={frequency} onChange={(event) => setFrequency(event.target.value)} className={`${fieldClass} mt-1`}><option value="one_off">Once</option><option value="monthly">Monthly</option><option value="annual">Yearly</option></select></label>
          {applyMode === 'entire' ? <label className="text-xs font-bold text-slate-500">{frequency === 'one_off' ? 'Due month' : 'Starts'}<input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label> : null}
          {frequency !== 'one_off' ? <label className="text-xs font-bold text-slate-500">Ends (optional)<input type="month" value={endMonth} onChange={(event) => setEndMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label> : null}
        </div>
        {error ? <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!isNew ? <button type="button" onClick={() => void remove()} disabled={saving} className="min-h-11 rounded-xl px-3 text-sm font-bold text-rose-600 hover:bg-rose-50">{item.frequency !== 'one_off' && effectiveMonth > item.startMonth ? `Stop from ${formatMonthLabel(effectiveMonth)}` : 'Delete row'}</button> : <span />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" onClick={onClose} className={secondaryButton}>Cancel</button><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving...' : isNew ? `Add ${item.flowType}` : applyMode === 'from_month' ? 'Save new version' : 'Save changes'}</button></div>
        </div>
      </form>
    </div>
  );
};

const PlanSettings = ({ profile, saving, onSave, onReset }) => {
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
    <details className="rounded-2xl border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-black text-slate-700"><span>Plan settings</span><span aria-hidden="true">⌄</span></summary>
      <form onSubmit={submit} className="grid gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-bold text-slate-500">Opening savings<input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" className={`${fieldClass} mt-1`} /></label>
        <label className="text-xs font-bold text-slate-500">Plan starts<input type="month" value={startMonth} onChange={(event) => setStartMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label>
        <button type="submit" disabled={saving} className={secondaryButton}>Save settings</button>
        {message ? <p className="text-sm font-semibold text-slate-500 sm:col-span-3">{message}</p> : null}
        <div className="border-t border-slate-100 pt-3 sm:col-span-3"><button type="button" onClick={() => { if (window.confirm('Remove all Financial Planner data? This cannot be undone.')) void onReset(); }} className="min-h-11 text-xs font-bold text-rose-600">Reset all Finance data</button></div>
      </form>
    </details>
  );
};

const RecordBalanceForm = ({ profile, saving, onSave }) => {
  const [month, setMonth] = useState(getCurrentMonthKey());
  const [cash, setCash] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const cashBalancePence = parseCurrencyToPence(cash);
    if (cashBalancePence === null) { setMessage('Enter the actual savings balance.'); return; }
    try { await onSave({ asOfMonth: month || profile.forecastStartMonth, cashBalancePence, note: 'Actual household savings' }); setCash(''); setMessage('Recorded savings saved.'); } catch (error) { setMessage(error?.message || 'Unable to save the balance.'); }
  };
  return (
    <details className="rounded-2xl border border-slate-200 bg-white">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-black text-slate-700"><span>Record actual savings</span><span aria-hidden="true">⌄</span></summary>
      <form onSubmit={submit} className="grid gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-bold text-slate-500">Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={`${fieldClass} mt-1`} /></label>
        <label className="text-xs font-bold text-slate-500">Actual savings<input value={cash} onChange={(event) => setCash(event.target.value)} inputMode="decimal" placeholder="0" className={`${fieldClass} mt-1`} /></label>
        <button type="submit" disabled={saving} className={secondaryButton}>Save balance</button>
        <p className="text-xs leading-5 text-slate-400 sm:col-span-3">This records what you actually had. It does not rewrite the forecast.</p>
        {message ? <p className="text-sm font-semibold text-slate-500 sm:col-span-3">{message}</p> : null}
      </form>
    </details>
  );
};

const historyScheduleLabel = (item) => {
  if (item.frequency === 'one_off') return formatMonthLabel(item.startMonth);
  if (item.endMonth) return `${formatMonthLabel(item.startMonth)} – ${formatMonthLabel(item.endMonth)}`;
  if (item.frequency === 'annual') return `Every ${formatMonthLabel(item.startMonth, { year: undefined })}`;
  return `From ${formatMonthLabel(item.startMonth)}`;
};

const HistoryView = ({ finance, currencyCode, onRepeat }) => {
  const currentMonth = getCurrentMonthKey();
  const historicalItems = finance.budgetItems
    .filter((item) => isHistoricalFinanceItem(item, currentMonth))
    .sort((left, right) => String(right.endMonth || right.startMonth).localeCompare(String(left.endMonth || left.startMonth)));
  return (
    <div id="finance-panel-history" role="tabpanel" aria-labelledby="finance-tab-history" className="space-y-4">
      <Section>
        <SectionHeader title="Plan history" detail="Past one-offs and replaced recurring amounts stay here instead of being deleted." />
        {historicalItems.length ? <div className="divide-y divide-slate-100">{historicalItems.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{item.name}</div><div className="mt-0.5 text-xs font-semibold text-slate-400">{historyScheduleLabel(item)}</div></div>
            <div className="flex items-center gap-2"><span className={`font-black ${item.flowType === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>{item.flowType === 'income' ? '+' : '-'}{formatCurrency(item.amountPence, currencyCode)}</span>{item.flowType === 'expense' ? <button type="button" onClick={() => onRepeat(item)} className="min-h-11 rounded-xl px-3 text-xs font-black text-[var(--pm-accent)] hover:bg-[var(--pm-accent-tint)]">Plan again</button> : null}</div>
          </div>
        ))}</div> : <p className="px-4 py-10 text-center text-sm text-slate-500">Past plan rows will appear here automatically.</p>}
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section><SectionHeader title="Recorded savings" detail="Balances you entered for previous months." /><div className="divide-y divide-slate-100 px-4">{finance.balanceSnapshots.length ? finance.balanceSnapshots.map((snapshot) => <div key={snapshot.id} className="flex justify-between gap-3 py-3 text-sm"><span className="font-semibold text-slate-500">{formatMonthLabel(snapshot.asOfMonth)}</span><span className="font-black text-slate-900">{formatCurrency(snapshot.cashBalancePence, currencyCode)}</span></div>) : <p className="py-8 text-center text-sm text-slate-500">No balances recorded.</p>}</div></Section>
        <Section><SectionHeader title="Actual entries" detail="Older income and expense entries." /><div className="divide-y divide-slate-100 px-4">{finance.actualEntries.length ? finance.actualEntries.slice(0, 24).map((entry) => <div key={entry.id} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate font-semibold text-slate-500">{entry.note || entry.occurredOn}</span><span className="font-black text-slate-900">{entry.flowType === 'income' ? '+' : '-'}{formatCurrency(entry.amountPence, currencyCode)}</span></div>) : <p className="py-8 text-center text-sm text-slate-500">No actual entries recorded.</p>}</div></Section>
      </div>
    </div>
  );
};

const monthsBetween = (startMonth, endMonth) => {
  const [startYear, start] = String(startMonth).split('-').map(Number);
  const [endYear, end] = String(endMonth).split('-').map(Number);
  return ((endYear - startYear) * 12) + end - start;
};

export default function FinancePlannerView({ currentUserId }) {
  const finance = useFinanceData({ currentUserId });
  const [activeView, setActiveView] = useState('plan');
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [addRequest, setAddRequest] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  const currentMonthKey = getCurrentMonthKey();
  const monthsFromAnchor = Math.max(0, monthsBetween(finance.profile.forecastStartMonth, currentMonthKey));
  const horizon = Math.min(120, Math.max(60, monthsFromAnchor + 60));
  const forecast = useMemo(() => buildFinanceForecast({
    ...finance.profile,
    startMonth: finance.profile.forecastStartMonth,
    budgetItems: finance.budgetItems,
    months: horizon,
  }), [finance.budgetItems, finance.profile, horizon]);

  useEffect(() => {
    if (!forecast.length) return;
    if (selectedMonthKey && forecast.some((month) => month.monthKey === selectedMonthKey)) return;
    const preferredMonth = forecast.find((month) => month.monthKey === currentMonthKey)?.monthKey || forecast[0].monthKey;
    setSelectedMonthKey(preferredMonth);
  }, [currentMonthKey, forecast, selectedMonthKey]);

  const selectedIndex = Math.max(0, forecast.findIndex((month) => month.monthKey === selectedMonthKey));
  const selectedMonth = forecast[selectedIndex] || forecast[0];
  const windowStartIndex = selectedIndex;
  const visibleMonths = forecast.slice(windowStartIndex, windowStartIndex + 12);
  const planBudgetItems = finance.budgetItems.filter((item) => (
    !isHistoricalFinanceItem(item, selectedMonth?.monthKey || currentMonthKey)
  ));
  const metrics = buildMonthMetrics(selectedMonth, finance.budgetItems, finance.profile);
  const currencyCode = finance.profile.currencyCode || 'GBP';

  const ensureGroupCategory = async (groupId) => {
    const group = getFinanceExpenseGroup(groupId);
    const existingId = findFinanceGroupCategoryId(finance.categories, group.id);
    if (existingId) return existingId;
    const category = await finance.saveCategory({
      name: group.categoryName,
      flowType: 'expense',
      classification: group.classification,
      sortOrder: FINANCE_EXPENSE_GROUPS.findIndex((candidate) => candidate.id === group.id) + 1,
    });
    return category?.id || '';
  };

  const saveExpense = async (draft) => {
    const group = getFinanceExpenseGroup(draft.groupId);
    const categoryId = await ensureGroupCategory(group.id);
    return finance.saveBudgetItem({ ...draft, categoryId, classification: group.classification });
  };

  const saveEditedItem = async (item, effectiveMonth, patch, groupId) => {
    const categoryId = item.flowType === 'expense' ? await ensureGroupCategory(groupId) : item.categoryId;
    const group = item.flowType === 'expense' ? getFinanceExpenseGroup(groupId) : null;
    const originalGroupId = item.flowType === 'expense'
      ? getFinanceExpenseGroupId(item, finance.categories)
      : '';
    return finance.saveBudgetItemChange(item, effectiveMonth, {
      ...patch,
      categoryId,
      classification: group && originalGroupId !== groupId
        ? group.classification
        : item.classification,
    });
  };

  const removeEditedItem = async (item, effectiveMonth) => {
    const shouldPreserveHistory = item.frequency !== 'one_off'
      && effectiveMonth > item.startMonth;
    if (shouldPreserveHistory) {
      return finance.saveBudgetItem({
        ...item,
        endMonth: addMonths(effectiveMonth, -1),
      });
    }
    return finance.deleteBudgetItem(item.id);
  };

  const requestAddExpense = () => {
    setActiveView('plan');
    setAddRequest((value) => value + 1);
    requestAnimationFrame(() => document.getElementById('add-expense')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const requestAddIncome = () => {
    setActiveView('plan');
    setEditingItem({
      name: '',
      amountPence: 0,
      flowType: 'income',
      classification: 'essential',
      cashTreatment: 'cash_outflow',
      frequency: 'monthly',
      startMonth: selectedMonth.monthKey,
      endMonth: '',
      annualMonth: null,
      annualGrowthBps: null,
      isActive: true,
    });
  };

  if (finance.loading) return <div className="mx-auto flex min-h-[360px] max-w-6xl items-center justify-center px-4 text-sm font-semibold text-slate-500">Loading Financial Planner...</div>;
  if (finance.needsMigration) return <div className="mx-auto max-w-xl px-4 py-10"><Section className="p-5"><h1 className="text-xl font-black text-slate-950">Finance setup is not connected</h1><p className="mt-2 text-sm leading-6 text-slate-500">The Finance tables could not be reached. Retry after checking the Supabase migration.</p><button type="button" onClick={() => void finance.loadAll()} className={`${secondaryButton} mt-4`}>Retry connection</button></Section></div>;
  if (!finance.summary.hasData) return <div className="mx-auto max-w-xl px-4 py-10"><Section className="p-5"><h1 className="text-xl font-black text-slate-950">Start your household plan</h1><p className="mt-2 text-sm leading-6 text-slate-500">Load the figures from your existing spreadsheet, then adjust any row that has changed.</p><div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={finance.saving} onClick={() => void finance.loadSampleHouseholdBudget()} className={primaryButton}>{finance.saving ? 'Loading...' : 'Load current figures'}</button><button type="button" disabled={finance.saving} onClick={() => void finance.saveProfile(finance.profile)} className={secondaryButton}>Start empty</button></div>{finance.error ? <p className="mt-3 text-sm font-semibold text-rose-700">{finance.error}</p> : null}</Section></div>;
  if (!selectedMonth) return null;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-5 sm:py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--pm-accent)]">Household finance</div><h1 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">Household plan</h1><p className="mt-1 text-sm text-slate-500">Review one month, change a regular amount, or add what is coming next.</p></div>
        <div className="grid w-full grid-cols-2 gap-2 sm:hidden">
          <button type="button" onClick={requestAddExpense} className={`${primaryButton} min-h-[44px] col-span-2`}>+ Add expense</button>
          <button type="button" onClick={() => { setExportMessage(''); setExportOpen(true); }} className={`${secondaryButton} min-h-[44px]`}>↓ Export for ChatGPT</button>
          <button type="button" onClick={requestAddIncome} className={`${secondaryButton} min-h-[44px]`}>+ Add income</button>
        </div>
        <div className="hidden gap-2 sm:flex">
          <button type="button" onClick={() => { setExportMessage(''); setExportOpen(true); }} className={`${secondaryButton} min-h-[44px]`}>↓ Export for ChatGPT</button>
          <button type="button" onClick={requestAddIncome} className={`${secondaryButton} min-h-[44px]`}>+ Add income</button>
          <button type="button" onClick={requestAddExpense} className={`${primaryButton} min-h-[44px]`}>+ Add expense</button>
        </div>
      </header>
      <div className="mb-4"><PlannerNavigation activeView={activeView} onChange={setActiveView} /></div>
      {exportMessage ? <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-800">{exportMessage}</div> : null}
      {finance.error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{finance.error}</div> : null}

      {activeView === 'plan' ? (
        <main id="finance-panel-plan" role="tabpanel" aria-labelledby="finance-tab-plan" className="space-y-4">
          <MonthNavigator forecast={forecast} selectedIndex={selectedIndex} onChange={(index) => setSelectedMonthKey(forecast[index].monthKey)} />
          <PlanSummary month={selectedMonth} metrics={metrics} currencyCode={currencyCode} />
          <Section className="hidden md:block">
            <SectionHeader title={`${formatMonthLabel(visibleMonths[0]?.monthKey)} to ${formatMonthLabel(visibleMonths.at(-1)?.monthKey)}`} detail="A focused 12-month window. Click any row name to change it." action={<div className="flex gap-1"><button type="button" disabled={windowStartIndex <= 0} onClick={() => setSelectedMonthKey(forecast[Math.max(0, windowStartIndex - 12)].monthKey)} className={subtleButton} aria-label="Previous twelve months">← 12 months</button><button type="button" disabled={windowStartIndex + 12 >= forecast.length} onClick={() => setSelectedMonthKey(forecast[Math.min(forecast.length - 1, windowStartIndex + 12)].monthKey)} className={subtleButton} aria-label="Next twelve months">12 months →</button></div>} />
            <div className="p-3 sm:p-4"><DesktopPlanTable months={visibleMonths} budgetItems={planBudgetItems} categories={finance.categories} snapshots={finance.balanceSnapshots} profile={finance.profile} currencyCode={currencyCode} onEdit={setEditingItem} /></div>
          </Section>
          <MobileMonthPlan month={selectedMonth} budgetItems={planBudgetItems} categories={finance.categories} profile={finance.profile} currencyCode={currencyCode} onEdit={setEditingItem} />
          <UpcomingExpenses forecast={forecast} selectedIndex={selectedIndex} budgetItems={planBudgetItems} categories={finance.categories} profile={finance.profile} currencyCode={currencyCode} onEdit={setEditingItem} />
          <ExpenseEntryPanel defaultMonth={selectedMonth.monthKey} currencyCode={currencyCode} saving={finance.saving} requestId={addRequest} onSave={saveExpense} />
          <div className="grid gap-4 lg:grid-cols-2"><RecordBalanceForm profile={finance.profile} saving={finance.saving} onSave={finance.saveBalanceSnapshot} /><PlanSettings profile={finance.profile} saving={finance.saving} onSave={finance.saveProfile} onReset={finance.resetFinanceData} /></div>
        </main>
      ) : <HistoryView finance={finance} currencyCode={currencyCode} onRepeat={(item) => { setSelectedMonthKey(currentMonthKey); setActiveView('plan'); setEditingItem({ ...item, id: undefined, startMonth: currentMonthKey, endMonth: '' }); }} />}

      {editingItem ? <PlanItemEditor key={`${editingItem.id || 'repeat'}-${editingItem.startMonth}`} item={editingItem} categories={finance.categories} effectiveMonth={selectedMonth.monthKey} saving={finance.saving} onSave={saveEditedItem} onRemove={removeEditedItem} onClose={() => setEditingItem(null)} /> : null}
      {exportOpen ? <FinanceExportDialog finance={finance} forecast={forecast} onClose={() => setExportOpen(false)} onDownloaded={(fileName) => setExportMessage(`Finance workbook downloaded: ${fileName}. Attach it in ChatGPT and ask it to review your spending.`)} /> : null}
    </div>
  );
}
