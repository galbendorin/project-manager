import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFinanceMonthReconciliation,
  FINANCE_RECONCILIATION_KINDS,
  getDefaultReconciliationOpening,
  getFinanceReconciliationKind,
  getMonthEndDate,
  getReconciliationVariancePence,
} from '../../utils/financeReconciliation';
import {
  addMonths,
  formatCurrency,
  formatMonthLabel,
  parseCurrencyToPence,
} from '../../utils/financePlanner';
import {
  FINANCE_EXPENSE_GROUPS,
  getFinanceExpenseGroup,
  getFinanceExpenseGroupId,
} from '../../utils/financePlanRows';

const inputClass = 'pm-input min-h-[44px] w-full rounded-xl px-3 py-2 text-[16px] font-medium text-slate-950 placeholder:text-slate-400';
const primaryButton = 'pm-toolbar-primary min-h-[44px] rounded-xl px-4 py-2 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-[14px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const penceToInput = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0$/, '');
};

const signedCurrency = (pence, currencyCode) => {
  if (pence === null || pence === undefined) return '—';
  if (pence === 0) return formatCurrency(0, currencyCode);
  return `${pence > 0 ? '+' : '−'}${formatCurrency(Math.abs(pence), currencyCode)}`;
};

const toneForVariance = (value) => value === null || value === 0
  ? 'text-slate-700'
  : value > 0 ? 'text-emerald-700' : 'text-rose-700';

const statusCopy = (summary, currencyCode) => {
  if (summary.isFuture) return {
    eyebrow: 'Plan only',
    title: 'This month has not happened yet',
    detail: 'Change the planned rows instead.',
  };
  if (summary.isCurrent) {
    if (!summary.hasActualClosing) return {
      eyebrow: 'Current-month check-in',
      title: `Record your position for ${formatMonthLabel(summary.monthKey)}`,
      detail: 'This is progress towards the month-end plan, not a final result.',
    };
    const remaining = summary.targetRemainingPence;
    return {
      eyebrow: 'Current-month check-in',
      title: remaining > 0
        ? `${formatCurrency(remaining, currencyCode)} to the month-end target`
        : remaining < 0
          ? `${formatCurrency(Math.abs(remaining), currencyCode)} above the month-end target`
          : 'At the month-end target',
      detail: 'This does not mean that amount has been spent. Final review is available after month-end.',
    };
  }
  if (!summary.hasActualClosing) return {
    eyebrow: summary.isFinalized ? 'Finalized' : 'Not started',
    title: `Close ${formatMonthLabel(summary.monthKey)}`,
    detail: 'Add the opening and closing savings balances, then explain every difference before the month can close.',
  };
  if (summary.isFinalized) return {
    eyebrow: summary.status === 'finalized_with_unknown' ? 'Finalized with an unknown amount' : 'Reconciled',
    title: summary.closingVariancePence < 0
      ? `${formatCurrency(Math.abs(summary.closingVariancePence), currencyCode)} behind the overall plan`
      : summary.closingVariancePence > 0
        ? `${formatCurrency(summary.closingVariancePence, currencyCode)} ahead of the overall plan`
        : 'Matched the overall plan',
    detail: summary.status === 'finalized_with_unknown'
      ? `${formatCurrency(Math.abs(summary.unknownVariancePence), currencyCode)} was marked unknown. The recorded closing balance now drives future savings.`
      : `The recorded closing balance now becomes ${formatMonthLabel(addMonths(summary.monthKey, 1))}’s opening balance.`,
  };
  if (summary.unexplainedVariancePence === null) return {
    eyebrow: 'Review in progress',
    title: 'Add the opening balance to isolate this month',
    detail: 'Without it, a carried difference could be mistaken for spending in this month.',
  };
  if (summary.hasUnknownLines) return {
    eyebrow: 'Still investigating',
    title: `${formatCurrency(summary.unknownAmountPence, currencyCode)} still marked unknown`,
    detail: 'Replace the unknown entry with the real expense, income change, or transfer before this month can close.',
  };
  if (summary.isBalanced) return {
    eyebrow: 'Ready to finalize',
    title: '£0 left to explain',
    detail: `Finalize to use this recorded closing balance as ${formatMonthLabel(addMonths(summary.monthKey, 1))}’s opening balance.`,
  };
  return {
    eyebrow: 'Review in progress',
    title: `${formatCurrency(Math.abs(summary.unexplainedVariancePence), currencyCode)} still unexplained`,
    detail: 'This month cannot close or update the future forecast until the difference reaches £0.',
  };
};

const SummaryMetric = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
    <div className="text-[10px] font-black uppercase tracking-[0.11em] text-slate-400">{label}</div>
    <div className={`mt-1 text-[16px] font-black tabular-nums ${tone}`}>{value}</div>
  </div>
);

const ReconciliationDialog = ({
  open,
  onClose,
  month,
  currentMonthKey,
  currencyCode,
  profile,
  reconciliation,
  lines,
  previousReconciliation,
  previousSnapshot,
  categories,
  localToday,
  saving,
  error,
  onSaveDraft,
  onSaveLine,
  onDeleteLine,
  onFinalize,
  onReopen,
  onPlanLine,
}) => {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const defaultOpening = useMemo(() => getDefaultReconciliationOpening({
    monthKey: month.monthKey,
    forecastStartMonth: profile.forecastStartMonth,
    openingCashPence: profile.openingCashPence,
    previousReconciliation,
    previousSnapshot,
  }), [month.monthKey, previousReconciliation, previousSnapshot, profile.forecastStartMonth, profile.openingCashPence]);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [balanceDate, setBalanceDate] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('extra_expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState('');
  const [groupId, setGroupId] = useState('other');
  const [budgetItemId, setBudgetItemId] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  const summary = buildFinanceMonthReconciliation({
    month,
    reconciliation,
    lines,
    currentMonthKey,
  });
  const plannedItems = (month.lineItems || []).filter((item) => item.cashTreatment !== 'internal_transfer');
  const selectedKind = getFinanceReconciliationKind(kind);
  const eligiblePlannedItems = selectedKind.flowType === 'adjustment'
    ? []
    : plannedItems.filter((item) => item.flowType === selectedKind.flowType);
  const selectedBudgetItem = plannedItems.find((item) => item.id === budgetItemId);

  useEffect(() => {
    if (!open) return;
    setOpeningCash(penceToInput(reconciliation?.actualOpeningCashPence ?? defaultOpening.amountPence));
    setClosingCash(penceToInput(reconciliation?.actualClosingCashPence));
    setBalanceDate(reconciliation?.balanceAsOfDate || (month.monthKey === currentMonthKey ? localToday : getMonthEndDate(month.monthKey)));
    setNote(reconciliation?.note || '');
    setOccurredOn(month.monthKey === currentMonthKey ? localToday : getMonthEndDate(month.monthKey));
    setMessage('');
    setFormError('');
  }, [currentMonthKey, defaultOpening.amountPence, localToday, month.monthKey, open, reconciliation]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((control) => control.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [onClose, open]);

  const draftPayload = () => ({
    monthKey: month.monthKey,
    balanceAsOfDate: balanceDate || null,
    actualOpeningCashPence: parseCurrencyToPence(openingCash),
    actualClosingCashPence: parseCurrencyToPence(closingCash),
    plannedOpeningCashPence: month.openingCashPence,
    plannedIncomePence: month.incomePence,
    plannedExpensePence: month.expensePence,
    plannedClosingCashPence: month.closingCashPence,
    note,
  });

  const saveBalances = async ({ requireBoth = true } = {}) => {
    const payload = draftPayload();
    if (requireBoth && (payload.actualOpeningCashPence === null || payload.actualClosingCashPence === null)) {
      throw new Error('Add both the opening and closing savings balances.');
    }
    if (balanceDate && !balanceDate.startsWith(month.monthKey)) {
      throw new Error(`Choose a balance date inside ${formatMonthLabel(month.monthKey)}.`);
    }
    const saved = await onSaveDraft(payload);
    setMessage('Month position saved.');
    return saved;
  };

  const submitBalances = async (event) => {
    event.preventDefault();
    setFormError('');
    try {
      await saveBalances();
    } catch (nextError) {
      setFormError(nextError?.message || 'Unable to save the month position.');
    }
  };

  const submitLine = async (event) => {
    event.preventDefault();
    setFormError('');
    const amountPence = parseCurrencyToPence(amount);
    if (!description.trim() || amountPence === null || amountPence <= 0) {
      setFormError('Add a description and an amount greater than zero.');
      return;
    }
    if (occurredOn && !occurredOn.startsWith(month.monthKey)) {
      setFormError(`Choose a date inside ${formatMonthLabel(month.monthKey)}.`);
      return;
    }
    try {
      const parent = reconciliation || await saveBalances({ requireBoth: false });
      const resolvedKind = getFinanceReconciliationKind(kind);
      const selectedGroup = getFinanceExpenseGroup(groupId);
      await onSaveLine({
        reconciliationId: parent.id,
        kind,
        description: description.trim(),
        variancePence: getReconciliationVariancePence(kind, amountPence),
        occurredOn: occurredOn || null,
        groupId,
        groupSnapshot: resolvedKind.flowType === 'expense' ? selectedGroup.label : resolvedKind.label,
        categoryId: selectedBudgetItem?.categoryId || '',
        budgetItemId: selectedBudgetItem?.id || '',
        budgetItemSnapshot: selectedBudgetItem?.name || '',
        classificationSnapshot: selectedBudgetItem?.classification || selectedGroup.classification,
        plannedAmountPence: selectedBudgetItem?.amountPence ?? null,
        actualAmountPence: null,
        sortOrder: lines.length,
      });
      setDescription('');
      setAmount('');
      setBudgetItemId('');
      setMessage('Explanation added.');
    } catch (nextError) {
      setFormError(nextError?.message || 'Unable to save this explanation.');
    }
  };

  const markRemainingUnknown = () => {
    if (summary.unexplainedVariancePence === null || summary.unexplainedVariancePence === 0) return;
    setKind(summary.unexplainedVariancePence < 0 ? 'unknown_out' : 'unknown_in');
    setDescription('Unidentified difference');
    setAmount(penceToInput(Math.abs(summary.unexplainedVariancePence)));
    requestAnimationFrame(() => document.getElementById('reconciliation-description')?.focus());
  };

  const finalize = async () => {
    setFormError('');
    try {
      await onFinalize();
      setMessage(`${formatMonthLabel(month.monthKey)} was finalized.`);
    } catch (nextError) {
      setFormError(nextError?.message || 'Unable to finalize this month.');
    }
  };

  if (!open) return null;
  const copy = statusCopy(summary, currencyCode);
  const openingSourceCopy = defaultOpening.source === 'previous_reconciliation'
    ? 'Prefilled from the previous finalized month.'
    : defaultOpening.source === 'legacy_snapshot'
      ? 'Prefilled from the previous recorded balance. Confirm it before finalizing.'
      : defaultOpening.source === 'plan_opening'
        ? 'Prefilled from the opening balance used by the plan.'
        : 'Add the actual opening balance; an earlier gap cannot safely be assigned to this month.';

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-slate-950/45" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="month-reconciliation-title" aria-describedby="month-reconciliation-description" className="flex h-[100dvh] w-full flex-col bg-slate-50 shadow-2xl sm:max-w-[720px]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--pm-accent)]">{formatMonthLabel(month.monthKey)} check-in</div>
            <h2 id="month-reconciliation-title" className="mt-1 text-[20px] font-black tracking-[-0.03em] text-slate-950 sm:text-2xl">{copy.title}</h2>
            <p id="month-reconciliation-description" className="mt-1 text-[13px] leading-5 text-slate-500">Record what differed from the plan. The future plan changes only when you choose “Plan this again”.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-xl text-[22px] font-bold text-slate-500 hover:bg-slate-100" aria-label="Close month check-in">×</button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryMetric label="Planned opening" value={formatCurrency(summary.plannedOpeningCashPence, currencyCode)} />
            {summary.isCurrent ? <>
              <SummaryMetric label="Month-end target" value={formatCurrency(summary.plannedClosingCashPence, currencyCode)} />
              <SummaryMetric label="Current position" value={summary.hasActualClosing ? formatCurrency(summary.actualClosingCashPence, currencyCode) : '—'} />
              <SummaryMetric label="Differences noted" value={signedCurrency(summary.explainedVariancePence, currencyCode)} tone={toneForVariance(summary.explainedVariancePence)} />
            </> : <>
              <SummaryMetric label="Planned movement" value={signedCurrency(summary.plannedNetPence, currencyCode)} tone={toneForVariance(summary.plannedNetPence)} />
              <SummaryMetric label="Month difference" value={signedCurrency(summary.monthlyVariancePence, currencyCode)} tone={toneForVariance(summary.monthlyVariancePence)} />
              <SummaryMetric label="Still unexplained" value={signedCurrency(summary.unexplainedVariancePence, currencyCode)} tone={toneForVariance(summary.unexplainedVariancePence)} />
            </>}
          </div>

          {summary.isCurrent ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] leading-5 text-sky-900"><strong>Progress, not a final result.</strong> The full month’s income and bills have not necessarily happened yet, so this view does not label you behind.</div> : null}

          <form onSubmit={submitBalances} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-[15px] font-black text-slate-950">Savings position</h3><p className="mt-0.5 text-[12px] leading-5 text-slate-500">Use the same total household cash and savings accounts each month.</p></div>{reconciliation?.status === 'finalized' ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-800">Finalized</span> : null}</div>
            <fieldset disabled={summary.isFinalized} className="mt-3 grid gap-3 min-[520px]:grid-cols-2">
              <label className="text-[12px] font-bold text-slate-500">Opening savings<input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" placeholder="0" className={`${inputClass} mt-1`} /></label>
              <label className="text-[12px] font-bold text-slate-500">{summary.isCurrent ? 'Savings today' : 'Closing savings'}<input value={closingCash} onChange={(event) => setClosingCash(event.target.value)} inputMode="decimal" placeholder="0" className={`${inputClass} mt-1`} /></label>
              <label className="text-[12px] font-bold text-slate-500">Balance date<input type="date" value={balanceDate} min={`${month.monthKey}-01`} max={getMonthEndDate(month.monthKey)} onChange={(event) => setBalanceDate(event.target.value)} className={`${inputClass} mt-1`} /></label>
              <label className="text-[12px] font-bold text-slate-500">Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What this balance includes" className={`${inputClass} mt-1`} /></label>
            </fieldset>
            <p className="mt-2 text-[11px] leading-4 text-slate-400">{openingSourceCopy}</p>
            {!summary.isFinalized ? <div className="mt-3 flex justify-end"><button type="submit" disabled={saving} className={secondaryButton}>{saving ? 'Saving…' : 'Save position'}</button></div> : null}
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-[15px] font-black text-slate-950">What differed from the plan</h3><p className="mt-0.5 text-[12px] leading-5 text-slate-500">Only add differences—not every normal bill or purchase.</p></div>
            {lines.length ? <div className="divide-y divide-slate-100">{lines.map((line) => {
              const lineKind = getFinanceReconciliationKind(line.kind);
              return <div key={line.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><div className="truncate text-[13px] font-black text-slate-900">{line.description}</div><div className="mt-0.5 text-[11px] font-semibold text-slate-400">{lineKind.label}{line.groupSnapshot ? ` · ${line.groupSnapshot}` : ''}</div></div><div className="flex shrink-0 items-center gap-1"><span className={`mr-1 text-[13px] font-black tabular-nums ${toneForVariance(line.variancePence)}`}>{signedCurrency(line.variancePence, currencyCode)}</span>{!summary.isFinalized && lineKind.flowType === 'expense' && !line.promotedBudgetItemId ? <button type="button" onClick={() => onPlanLine(line)} className="min-h-[44px] rounded-xl px-2 text-[11px] font-black text-[var(--pm-accent)] hover:bg-[var(--pm-accent-tint)]">Plan again</button> : null}{line.promotedBudgetItemId ? <span className="px-2 text-[10px] font-black text-emerald-700">In plan</span> : null}{!summary.isFinalized ? <button type="button" onClick={() => { if (window.confirm(`Remove ${line.description}?`)) void onDeleteLine(line.id); }} className="min-h-[44px] min-w-[44px] rounded-xl text-[18px] text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${line.description}`}>×</button> : null}</div></div>;
            })}</div> : <p className="px-4 py-6 text-center text-[13px] text-slate-500">No differences recorded for this month.</p>}

            {!summary.isFinalized ? <form onSubmit={submitLine} className="border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
              <fieldset className="grid gap-2.5 min-[520px]:grid-cols-2">
                <legend className="sr-only">New month explanation</legend>
                <label className="text-[12px] font-bold text-slate-500">Difference type<select value={kind} onChange={(event) => { setKind(event.target.value); setBudgetItemId(''); }} className={`${inputClass} mt-1`}>{FINANCE_RECONCILIATION_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <label className="text-[12px] font-bold text-slate-500">Amount<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0" className={`${inputClass} mt-1`} /></label>
                <label className="text-[12px] font-bold text-slate-500 min-[520px]:col-span-2">Description<input id="reconciliation-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. car repair or lower salary" className={`${inputClass} mt-1`} /></label>
                <label className="text-[12px] font-bold text-slate-500">Date<input type="date" value={occurredOn} min={`${month.monthKey}-01`} max={getMonthEndDate(month.monthKey)} onChange={(event) => setOccurredOn(event.target.value)} className={`${inputClass} mt-1`} /></label>
                {getFinanceReconciliationKind(kind).flowType === 'expense' ? <label className="text-[12px] font-bold text-slate-500">Group<select value={groupId} onChange={(event) => setGroupId(event.target.value)} className={`${inputClass} mt-1`}>{FINANCE_EXPENSE_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label> : <div />}
                {selectedKind.flowType !== 'adjustment' ? <label className="text-[12px] font-bold text-slate-500 min-[520px]:col-span-2">Related planned row (optional)<select value={budgetItemId} onChange={(event) => { const nextId = event.target.value; setBudgetItemId(nextId); const item = eligiblePlannedItems.find((candidate) => candidate.id === nextId); if (item?.flowType === 'expense') setGroupId(getFinanceExpenseGroupId(item, categories)); }} className={`${inputClass} mt-1`}><option value="">No planned row — this was extra</option>{eligiblePlannedItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatCurrency(item.amountPence, currencyCode)}</option>)}</select></label> : null}
              </fieldset>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={!summary.unexplainedVariancePence} onClick={markRemainingUnknown} className="min-h-[44px] rounded-xl px-2 text-[11px] font-black text-amber-700 hover:bg-amber-50 disabled:hidden">Track remainder as unknown</button><button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Saving…' : 'Add explanation'}</button></div>
            </form> : null}
          </section>

          {formError || error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{formError || error}</p> : null}
          {message ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800">{message}</p> : null}
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-5">
          <div className="mb-2 min-w-0 sm:mb-0"><div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">{copy.eyebrow}</div><div className="truncate text-[12px] font-semibold text-slate-600">{copy.detail}</div></div>
          {summary.isFinalized ? <button type="button" onClick={() => void onReopen()} disabled={saving} className={`${secondaryButton} w-full sm:w-auto`}>Reopen month</button> : summary.isPast ? <button type="button" onClick={() => void finalize()} disabled={saving || !summary.canFinalize} className={`${primaryButton} w-full sm:w-auto`}>{summary.canFinalize ? `Finalize ${formatMonthLabel(month.monthKey, { year: undefined })}` : summary.hasUnknownLines ? 'Resolve the unknown amount' : 'Explain the remaining difference'}</button> : <button type="button" onClick={onClose} className={`${secondaryButton} w-full sm:w-auto`}>Save progress and close</button>}
        </footer>
      </section>
    </div>
  );
};

export default function MonthReconciliation({
  month,
  currentMonthKey,
  currencyCode,
  profile,
  reconciliation,
  lines,
  history,
  snapshots,
  categories,
  localToday,
  loading,
  saving,
  available,
  error,
  onSaveDraft,
  onSaveLine,
  onDeleteLine,
  onFinalize,
  onReopen,
  onPlanLine,
}) {
  const [open, setOpen] = useState(false);
  const previousMonthKey = addMonths(month.monthKey, -1);
  const previousReconciliation = history.find((item) => item.monthKey === previousMonthKey) || null;
  const previousSnapshot = snapshots.find((item) => item.asOfMonth === previousMonthKey) || null;
  const summary = buildFinanceMonthReconciliation({ month, reconciliation, lines, currentMonthKey });
  const copy = statusCopy(summary, currencyCode);
  const actualBaselineCopy = month.actualBaselineMonth
    ? `Forecast rebased from ${formatMonthLabel(month.actualBaselineMonth)} recorded savings.`
    : '';

  if (!available) return null;

  return (
    <>
      <section aria-label={`${formatMonthLabel(month.monthKey)} month check-in`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button type="button" disabled={loading || summary.isFuture} onClick={() => setOpen(true)} className="grid min-h-[72px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white sm:px-5">
          <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[0.13em] text-[var(--pm-accent)]">{copy.eyebrow}</span><span className="mt-0.5 block truncate text-[15px] font-black text-slate-950">{copy.title}</span><span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">{copy.detail}</span>{actualBaselineCopy ? <span className="mt-1 block text-[10px] font-black text-emerald-700">{actualBaselineCopy}</span> : null}</span>
          <span className="flex min-h-[44px] shrink-0 items-center rounded-xl bg-[var(--pm-accent-tint)] px-3 text-[12px] font-black text-[var(--pm-accent-strong)]">{summary.isFuture ? 'Edit plan' : summary.isCurrent ? 'Check in' : summary.isFinalized ? 'Review' : summary.hasActualClosing ? 'Continue' : 'Start'} <span aria-hidden="true" className="ml-1">→</span></span>
        </button>
      </section>
      <ReconciliationDialog
        open={open}
        onClose={() => setOpen(false)}
        month={month}
        currentMonthKey={currentMonthKey}
        currencyCode={currencyCode}
        profile={profile}
        reconciliation={reconciliation}
        lines={lines}
        previousReconciliation={previousReconciliation}
        previousSnapshot={previousSnapshot}
        categories={categories}
        localToday={localToday}
        saving={saving}
        error={error}
        onSaveDraft={onSaveDraft}
        onSaveLine={onSaveLine}
        onDeleteLine={onDeleteLine}
        onFinalize={onFinalize}
        onReopen={onReopen}
        onPlanLine={(line) => { setOpen(false); onPlanLine(line); }}
      />
    </>
  );
}
