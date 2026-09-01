import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getFinanceReconciliationKind, getLocalDateKey } from '../utils/financeReconciliation';
import { getCurrentMonthKey, normalizeMonthKey } from '../utils/financePlanner';

const RECONCILIATION_SELECT = 'id, user_id, month, status, balance_as_of_date, actual_opening_cash_pence, actual_closing_cash_pence, planned_opening_cash_pence, planned_income_pence, planned_expense_pence, planned_closing_cash_pence, note, version, finalized_at, created_at, updated_at';
const LINE_SELECT = 'id, reconciliation_id, user_id, category_id, budget_item_id, promoted_budget_item_id, occurred_on, kind, flow_type, description, variance_pence, planned_amount_pence, actual_amount_pence, group_snapshot, budget_item_snapshot, classification_snapshot, sort_order, created_at, updated_at';

const monthToSql = (value, fallback = getCurrentMonthKey()) => `${normalizeMonthKey(value, fallback)}-01`;
const monthFromSql = (value, fallback = '') => value ? normalizeMonthKey(value, fallback || getCurrentMonthKey()) : fallback;
const nullableInteger = (value) => value === null || value === undefined || value === ''
  ? null
  : Math.round(Number(value) || 0);

const mapReconciliation = (row = {}) => ({
  id: row.id,
  monthKey: monthFromSql(row.month),
  status: row.status || 'draft',
  balanceAsOfDate: row.balance_as_of_date || '',
  actualOpeningCashPence: row.actual_opening_cash_pence === null || row.actual_opening_cash_pence === undefined ? null : Number(row.actual_opening_cash_pence),
  actualClosingCashPence: row.actual_closing_cash_pence === null || row.actual_closing_cash_pence === undefined ? null : Number(row.actual_closing_cash_pence),
  plannedOpeningCashPence: row.planned_opening_cash_pence === null || row.planned_opening_cash_pence === undefined ? null : Number(row.planned_opening_cash_pence),
  plannedIncomePence: row.planned_income_pence === null || row.planned_income_pence === undefined ? null : Number(row.planned_income_pence),
  plannedExpensePence: row.planned_expense_pence === null || row.planned_expense_pence === undefined ? null : Number(row.planned_expense_pence),
  plannedClosingCashPence: row.planned_closing_cash_pence === null || row.planned_closing_cash_pence === undefined ? null : Number(row.planned_closing_cash_pence),
  note: row.note || '',
  version: Number(row.version) || 1,
  finalizedAt: row.finalized_at || '',
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapLine = (row = {}) => ({
  id: row.id,
  reconciliationId: row.reconciliation_id,
  categoryId: row.category_id || '',
  budgetItemId: row.budget_item_id || '',
  promotedBudgetItemId: row.promoted_budget_item_id || '',
  occurredOn: row.occurred_on || '',
  kind: row.kind || 'extra_expense',
  flowType: row.flow_type || 'expense',
  description: row.description || '',
  variancePence: Number(row.variance_pence) || 0,
  plannedAmountPence: row.planned_amount_pence === null || row.planned_amount_pence === undefined ? null : Number(row.planned_amount_pence),
  actualAmountPence: row.actual_amount_pence === null || row.actual_amount_pence === undefined ? null : Number(row.actual_amount_pence),
  groupSnapshot: row.group_snapshot || '',
  budgetItemSnapshot: row.budget_item_snapshot || '',
  classificationSnapshot: row.classification_snapshot || 'essential',
  sortOrder: Number(row.sort_order) || 0,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const isMissingReconciliationSchema = (error) => {
  const code = String(error?.code || '');
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('finance_month_reconciliation');
};

export function useFinanceReconciliation({ currentUserId, monthKey } = {}) {
  const [reconciliation, setReconciliation] = useState(null);
  const [lines, setLines] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!currentUserId || !monthKey) {
      setReconciliation(null);
      setLines([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: monthRows, error: monthError } = await supabase
        .from('finance_month_reconciliations')
        .select(RECONCILIATION_SELECT)
        .eq('user_id', currentUserId)
        .order('month', { ascending: false });
      if (monthError) throw monthError;
      const mappedHistory = (monthRows || []).map(mapReconciliation);
      const selected = mappedHistory.find((item) => item.monthKey === normalizeMonthKey(monthKey)) || null;
      let mappedLines = [];
      if (selected) {
        const { data: lineRows, error: lineError } = await supabase
          .from('finance_month_reconciliation_lines')
          .select(LINE_SELECT)
          .eq('reconciliation_id', selected.id)
          .order('sort_order')
          .order('created_at');
        if (lineError) throw lineError;
        mappedLines = (lineRows || []).map(mapLine);
      }
      setAvailable(true);
      setHistory(mappedHistory);
      setReconciliation(selected);
      setLines(mappedLines);
    } catch (nextError) {
      if (isMissingReconciliationSchema(nextError)) {
        setAvailable(false);
        setHistory([]);
        setReconciliation(null);
        setLines([]);
      } else {
        setError(nextError?.message || 'Unable to load this month check-in.');
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId, monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDraft = useCallback(async (draft = {}) => {
    if (!currentUserId) return null;
    setSaving(true);
    setError('');
    try {
      const payload = {
        user_id: currentUserId,
        month: monthToSql(draft.monthKey || monthKey),
        status: 'draft',
        balance_as_of_date: draft.balanceAsOfDate || null,
        actual_opening_cash_pence: nullableInteger(draft.actualOpeningCashPence),
        actual_closing_cash_pence: nullableInteger(draft.actualClosingCashPence),
        planned_opening_cash_pence: nullableInteger(draft.plannedOpeningCashPence),
        planned_income_pence: nullableInteger(draft.plannedIncomePence),
        planned_expense_pence: nullableInteger(draft.plannedExpensePence),
        planned_closing_cash_pence: nullableInteger(draft.plannedClosingCashPence),
        note: String(draft.note || '').trim(),
      };
      const { data, error: saveError } = await supabase
        .from('finance_month_reconciliations')
        .upsert(payload, { onConflict: 'user_id,month' })
        .select(RECONCILIATION_SELECT)
        .single();
      if (saveError) throw saveError;
      const next = mapReconciliation(data);
      setReconciliation(next);
      setHistory((previous) => [next, ...previous.filter((item) => item.id !== next.id)]
        .sort((left, right) => right.monthKey.localeCompare(left.monthKey)));
      return next;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save this month check-in.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, monthKey]);

  const saveLine = useCallback(async (line = {}) => {
    const parentId = line.reconciliationId || reconciliation?.id;
    if (!currentUserId || !parentId) throw new Error('Save the month balances before adding an explanation.');
    const kind = getFinanceReconciliationKind(line.kind);
    const payload = {
      reconciliation_id: parentId,
      user_id: currentUserId,
      category_id: line.categoryId || null,
      budget_item_id: line.budgetItemId || null,
      promoted_budget_item_id: line.promotedBudgetItemId || null,
      occurred_on: line.occurredOn || null,
      kind: kind.value,
      flow_type: kind.flowType,
      description: String(line.description || '').trim(),
      variance_pence: Math.round(Number(line.variancePence) || 0),
      planned_amount_pence: nullableInteger(line.plannedAmountPence),
      actual_amount_pence: nullableInteger(line.actualAmountPence),
      group_snapshot: String(line.groupSnapshot || '').trim(),
      budget_item_snapshot: String(line.budgetItemSnapshot || '').trim(),
      classification_snapshot: ['essential', 'discretionary', 'wealth_building'].includes(line.classificationSnapshot) ? line.classificationSnapshot : 'essential',
      sort_order: Math.round(Number(line.sortOrder) || 0),
    };
    if (!payload.description) throw new Error('Add a short description.');
    if (!payload.variance_pence) throw new Error('Add an amount greater than zero.');
    setSaving(true);
    setError('');
    try {
      const query = line.id
        ? supabase.from('finance_month_reconciliation_lines').update(payload).eq('id', line.id)
        : supabase.from('finance_month_reconciliation_lines').insert(payload);
      const { data, error: saveError } = await query.select(LINE_SELECT).single();
      if (saveError) throw saveError;
      const next = mapLine(data);
      setLines((previous) => [...previous.filter((item) => item.id !== next.id), next]
        .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt)));
      return next;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save this explanation.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, reconciliation?.id]);

  const deleteLine = useCallback(async (lineId) => {
    setSaving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase
        .from('finance_month_reconciliation_lines')
        .delete()
        .eq('id', lineId);
      if (deleteError) throw deleteError;
      setLines((previous) => previous.filter((line) => line.id !== lineId));
    } catch (nextError) {
      setError(nextError?.message || 'Unable to remove this explanation.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, []);

  const finalize = useCallback(async () => {
    if (!reconciliation) throw new Error('Save this month before finalizing it.');
    setSaving(true);
    setError('');
    try {
      const idempotencyKey = crypto.randomUUID();
      const { data, error: finalizeError } = await supabase.rpc('finalize_finance_month_reconciliation', {
        p_reconciliation_id: reconciliation.id,
        p_expected_version: reconciliation.version,
        p_idempotency_key: idempotencyKey,
      });
      if (finalizeError) throw finalizeError;
      const next = mapReconciliation(data);
      setReconciliation(next);
      setHistory((previous) => [next, ...previous.filter((item) => item.id !== next.id)]
        .sort((left, right) => right.monthKey.localeCompare(left.monthKey)));
      return next;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to finalize this month.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [reconciliation]);

  const reopen = useCallback(async () => {
    if (!reconciliation) return null;
    setSaving(true);
    setError('');
    try {
      const { data, error: reopenError } = await supabase.rpc('reopen_finance_month_reconciliation', {
        p_reconciliation_id: reconciliation.id,
        p_expected_version: reconciliation.version,
      });
      if (reopenError) throw reopenError;
      const next = mapReconciliation(data);
      setReconciliation(next);
      setHistory((previous) => [next, ...previous.filter((item) => item.id !== next.id)]
        .sort((left, right) => right.monthKey.localeCompare(left.monthKey)));
      return next;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to reopen this month.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [reconciliation]);

  const loadAllForExport = useCallback(async () => {
    if (!currentUserId || !available) return { reconciliations: [], reconciliationLines: [] };
    const [monthResult, lineResult] = await Promise.all([
      supabase.from('finance_month_reconciliations').select(RECONCILIATION_SELECT).eq('user_id', currentUserId).order('month'),
      supabase.from('finance_month_reconciliation_lines').select(LINE_SELECT).eq('user_id', currentUserId).order('occurred_on'),
    ]);
    if (monthResult.error) throw monthResult.error;
    if (lineResult.error) throw lineResult.error;
    return {
      reconciliations: (monthResult.data || []).map(mapReconciliation),
      reconciliationLines: (lineResult.data || []).map(mapLine),
    };
  }, [available, currentUserId]);

  return {
    reconciliation,
    lines,
    history,
    loading,
    saving,
    available,
    error,
    load,
    saveDraft,
    saveLine,
    deleteLine,
    finalize,
    reopen,
    loadAllForExport,
    localToday: getLocalDateKey(),
  };
}
