import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  createSampleFinanceData,
  DEFAULT_FINANCE_CATEGORIES,
  DEFAULT_FINANCE_SETTINGS,
  getCurrentMonthKey,
  normalizeMonthKey,
} from '../utils/financePlanner';
import { buildFinanceScheduleChange } from '../utils/financePlanRows';

const PROFILE_SELECT = 'user_id, currency_code, opening_cash_pence, forecast_start_month, emergency_target_months, protected_cash_floor_pence, annual_expense_inflation_bps, annual_income_growth_bps, created_at, updated_at';
const CATEGORY_SELECT = 'id, user_id, name, flow_type, classification, sort_order, archived_at, created_at, updated_at';
const BUDGET_ITEM_SELECT = 'id, user_id, category_id, name, amount_pence, flow_type, classification, cash_treatment, frequency, start_month, end_month, annual_month, annual_growth_bps, owner_label, notes, is_active, created_at, updated_at';
const ACTUAL_ENTRY_SELECT = 'id, user_id, category_id, budget_item_id, occurred_on, amount_pence, flow_type, cash_treatment, note, created_at, updated_at';
const SNAPSHOT_SELECT = 'id, user_id, as_of_month, cash_balance_pence, note, created_at, updated_at';
const GOAL_SELECT = 'id, user_id, name, goal_type, current_balance_pence, target_balance_pence, target_date, monthly_contribution_pence, priority, is_protected, notes, created_at, updated_at';
const MORTGAGE_SELECT = 'id, user_id, name, outstanding_balance_pence, annual_rate_bps, remaining_months, contractual_payment_pence, voluntary_overpayment_pence, property_value_pence, fixed_rate_end_date, expected_future_rate_bps, created_at, updated_at';
const SCENARIO_SELECT = 'id, user_id, name, description, color, is_archived, created_at, updated_at';
const SCENARIO_CHANGE_SELECT = 'id, user_id, scenario_id, name, effective_month, change_type, amount_pence, frequency, classification, payload, created_at, updated_at';

const monthFromSql = (value, fallback = '') => (
  value ? normalizeMonthKey(value, fallback || getCurrentMonthKey()) : fallback
);

const monthToSql = (value, fallback = getCurrentMonthKey()) => `${normalizeMonthKey(value, fallback)}-01`;

const mapProfile = (row = {}) => ({
  currencyCode: row.currency_code || 'GBP',
  openingCashPence: Number(row.opening_cash_pence) || 0,
  forecastStartMonth: monthFromSql(row.forecast_start_month, getCurrentMonthKey()),
  emergencyTargetMonths: Number(row.emergency_target_months) || 6,
  protectedCashFloorPence: Number(row.protected_cash_floor_pence) || 0,
  annualExpenseInflationBps: Number(row.annual_expense_inflation_bps) || 0,
  annualIncomeGrowthBps: Number(row.annual_income_growth_bps) || 0,
  updatedAt: row.updated_at || '',
});

const mapCategory = (row = {}) => ({
  id: row.id,
  name: row.name || '',
  flowType: row.flow_type || 'expense',
  classification: row.classification || 'essential',
  sortOrder: Number(row.sort_order) || 0,
  archivedAt: row.archived_at || '',
});

const mapBudgetItem = (row = {}) => ({
  id: row.id,
  categoryId: row.category_id || '',
  name: row.name || '',
  amountPence: Number(row.amount_pence) || 0,
  flowType: row.flow_type || 'expense',
  classification: row.classification || 'essential',
  cashTreatment: row.cash_treatment || 'cash_outflow',
  frequency: row.frequency || 'monthly',
  startMonth: monthFromSql(row.start_month, getCurrentMonthKey()),
  endMonth: row.end_month ? monthFromSql(row.end_month) : '',
  annualMonth: Number(row.annual_month) || null,
  annualGrowthBps: row.annual_growth_bps === null || row.annual_growth_bps === undefined ? null : Number(row.annual_growth_bps),
  ownerLabel: row.owner_label || '',
  notes: row.notes || '',
  isActive: row.is_active !== false,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapActualEntry = (row = {}) => ({
  id: row.id,
  categoryId: row.category_id || '',
  budgetItemId: row.budget_item_id || '',
  occurredOn: row.occurred_on || '',
  amountPence: Number(row.amount_pence) || 0,
  flowType: row.flow_type || 'expense',
  cashTreatment: row.cash_treatment || 'cash_outflow',
  note: row.note || '',
});

const mapSnapshot = (row = {}) => ({
  id: row.id,
  asOfMonth: monthFromSql(row.as_of_month, getCurrentMonthKey()),
  cashBalancePence: Number(row.cash_balance_pence) || 0,
  note: row.note || '',
});

const mapGoal = (row = {}) => ({
  id: row.id,
  name: row.name || '',
  goalType: row.goal_type || 'sinking_fund',
  currentBalancePence: Number(row.current_balance_pence) || 0,
  targetBalancePence: row.target_balance_pence === null || row.target_balance_pence === undefined ? null : Number(row.target_balance_pence),
  targetDate: row.target_date || '',
  monthlyContributionPence: Number(row.monthly_contribution_pence) || 0,
  priority: Number(row.priority) || 3,
  isProtected: row.is_protected === true,
  notes: row.notes || '',
});

const mapMortgage = (row = {}) => ({
  id: row.id,
  name: row.name || 'Home mortgage',
  outstandingBalancePence: Number(row.outstanding_balance_pence) || 0,
  annualRateBps: Number(row.annual_rate_bps) || 0,
  remainingMonths: Number(row.remaining_months) || 0,
  contractualPaymentPence: Number(row.contractual_payment_pence) || 0,
  voluntaryOverpaymentPence: Number(row.voluntary_overpayment_pence) || 0,
  propertyValuePence: row.property_value_pence === null || row.property_value_pence === undefined ? null : Number(row.property_value_pence),
  fixedRateEndDate: row.fixed_rate_end_date || '',
  expectedFutureRateBps: row.expected_future_rate_bps === null || row.expected_future_rate_bps === undefined ? null : Number(row.expected_future_rate_bps),
});

const mapScenario = (row = {}) => ({
  id: row.id,
  name: row.name || '',
  description: row.description || '',
  color: row.color || '#7c3aed',
  isArchived: row.is_archived === true,
});

const mapScenarioChange = (row = {}) => ({
  id: row.id,
  scenarioId: row.scenario_id || '',
  name: row.name || '',
  effectiveMonth: monthFromSql(row.effective_month, getCurrentMonthKey()),
  changeType: row.change_type || 'expense',
  amountPence: Number(row.amount_pence) || 0,
  frequency: row.frequency || 'one_off',
  classification: row.classification || 'essential',
  payload: row.payload || {},
});

const isMissingFinanceTableError = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('finance_');
};

const toCategoryPayload = (category, userId) => ({
  user_id: userId,
  name: String(category.name || '').trim(),
  flow_type: category.flowType === 'income' ? 'income' : 'expense',
  classification: ['essential', 'discretionary', 'wealth_building'].includes(category.classification) ? category.classification : 'essential',
  sort_order: Number(category.sortOrder) || 0,
});

const toBudgetItemPayload = (item, userId) => ({
  user_id: userId,
  category_id: item.categoryId || null,
  name: String(item.name || '').trim(),
  amount_pence: Math.max(0, Math.round(Number(item.amountPence) || 0)),
  flow_type: item.flowType === 'income' ? 'income' : 'expense',
  classification: ['essential', 'discretionary', 'wealth_building'].includes(item.classification) ? item.classification : 'essential',
  cash_treatment: item.cashTreatment === 'internal_transfer' ? 'internal_transfer' : 'cash_outflow',
  frequency: ['monthly', 'annual', 'one_off'].includes(item.frequency) ? item.frequency : 'monthly',
  start_month: monthToSql(item.startMonth),
  end_month: item.endMonth ? monthToSql(item.endMonth) : null,
  annual_month: item.frequency === 'annual' ? Number(item.annualMonth) || Number(normalizeMonthKey(item.startMonth).slice(5, 7)) : null,
  annual_growth_bps: item.annualGrowthBps === null || item.annualGrowthBps === undefined || item.annualGrowthBps === '' ? null : Math.max(0, Math.round(Number(item.annualGrowthBps) || 0)),
  owner_label: String(item.ownerLabel || '').trim(),
  notes: String(item.notes || '').trim(),
  is_active: item.isActive !== false,
});

export function useFinanceData({ currentUserId } = {}) {
  const [profile, setProfile] = useState({ ...DEFAULT_FINANCE_SETTINGS, forecastStartMonth: getCurrentMonthKey() });
  const [categories, setCategories] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [actualEntries, setActualEntries] = useState([]);
  const [balanceSnapshots, setBalanceSnapshots] = useState([]);
  const [goals, setGoals] = useState([]);
  const [mortgages, setMortgages] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [scenarioChanges, setScenarioChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsMigration, setNeedsMigration] = useState(false);

  const loadAll = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError('');
    setNeedsMigration(false);
    try {
      const [profileResult, categoryResult, budgetResult, actualResult, snapshotResult, goalResult, mortgageResult, scenarioResult, scenarioChangeResult] = await Promise.all([
        supabase.from('finance_profiles').select(PROFILE_SELECT).eq('user_id', currentUserId).maybeSingle(),
        supabase.from('finance_categories').select(CATEGORY_SELECT).eq('user_id', currentUserId).is('archived_at', null).order('sort_order').order('created_at'),
        supabase.from('finance_budget_items').select(BUDGET_ITEM_SELECT).eq('user_id', currentUserId).eq('is_active', true).order('start_month').order('created_at'),
        supabase.from('finance_actual_entries').select(ACTUAL_ENTRY_SELECT).eq('user_id', currentUserId).order('occurred_on', { ascending: false }).limit(500),
        supabase.from('finance_balance_snapshots').select(SNAPSHOT_SELECT).eq('user_id', currentUserId).order('as_of_month', { ascending: false }),
        supabase.from('finance_goals').select(GOAL_SELECT).eq('user_id', currentUserId).order('priority').order('created_at'),
        supabase.from('finance_mortgages').select(MORTGAGE_SELECT).eq('user_id', currentUserId).order('created_at'),
        supabase.from('finance_scenarios').select(SCENARIO_SELECT).eq('user_id', currentUserId).eq('is_archived', false).order('created_at'),
        supabase.from('finance_scenario_changes').select(SCENARIO_CHANGE_SELECT).eq('user_id', currentUserId).order('effective_month').order('created_at'),
      ]);
      const failed = [profileResult, categoryResult, budgetResult, actualResult, snapshotResult, goalResult, mortgageResult, scenarioResult, scenarioChangeResult].find((result) => result.error);
      if (failed?.error) throw failed.error;
      setProfile(profileResult.data ? mapProfile(profileResult.data) : { ...DEFAULT_FINANCE_SETTINGS, forecastStartMonth: getCurrentMonthKey() });
      setCategories((categoryResult.data || []).map(mapCategory));
      setBudgetItems((budgetResult.data || []).map(mapBudgetItem));
      setActualEntries((actualResult.data || []).map(mapActualEntry));
      setBalanceSnapshots((snapshotResult.data || []).map(mapSnapshot));
      setGoals((goalResult.data || []).map(mapGoal));
      setMortgages((mortgageResult.data || []).map(mapMortgage));
      setScenarios((scenarioResult.data || []).map(mapScenario));
      setScenarioChanges((scenarioChangeResult.data || []).map(mapScenarioChange));
    } catch (nextError) {
      setNeedsMigration(isMissingFinanceTableError(nextError));
      setError(isMissingFinanceTableError(nextError)
        ? 'Financial Planner needs its SQL migration before it can save data.'
        : (nextError?.message || 'Unable to load Financial Planner right now.'));
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const saveProfile = useCallback(async (patch = {}) => {
    if (!currentUserId) return null;
    setSaving(true);
    setError('');
    try {
      const nextProfile = { ...profile, ...patch };
      const payload = {
        user_id: currentUserId,
        currency_code: nextProfile.currencyCode || 'GBP',
        opening_cash_pence: Math.round(Number(nextProfile.openingCashPence) || 0),
        forecast_start_month: monthToSql(nextProfile.forecastStartMonth),
        emergency_target_months: Math.max(1, Math.round(Number(nextProfile.emergencyTargetMonths) || 6)),
        protected_cash_floor_pence: Math.round(Number(nextProfile.protectedCashFloorPence) || 0),
        annual_expense_inflation_bps: Math.max(0, Math.round(Number(nextProfile.annualExpenseInflationBps) || 0)),
        annual_income_growth_bps: Math.max(0, Math.round(Number(nextProfile.annualIncomeGrowthBps) || 0)),
      };
      const { data, error: saveError } = await supabase
        .from('finance_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select(PROFILE_SELECT)
        .single();
      if (saveError) throw saveError;
      const next = mapProfile(data);
      setProfile(next);
      return next;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save Finance settings.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, profile]);

  const saveBudgetItem = useCallback(async (item = {}) => {
    if (!currentUserId) return null;
    const payload = toBudgetItemPayload(item, currentUserId);
    if (!payload.name) throw new Error('Give this budget item a name.');
    setSaving(true);
    setError('');
    try {
      const query = item.id
        ? supabase.from('finance_budget_items').update(payload).eq('id', item.id)
        : supabase.from('finance_budget_items').insert(payload);
      const { data, error: saveError } = await query.select(BUDGET_ITEM_SELECT).single();
      if (saveError) throw saveError;
      const nextItem = mapBudgetItem(data);
      setBudgetItems((previous) => [...previous.filter((current) => current.id !== nextItem.id), nextItem]
        .sort((left, right) => `${left.startMonth}${left.name}`.localeCompare(`${right.startMonth}${right.name}`)));
      return nextItem;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save budget item.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const saveBudgetItemChange = useCallback(async (item = {}, effectiveMonth, patch = {}) => {
    const change = buildFinanceScheduleChange(item, effectiveMonth, patch);
    if (change.mode === 'replace') return saveBudgetItem(change.item);
    if (!currentUserId) return null;

    const successorId = crypto.randomUUID();
    const payloads = [
      { id: change.previous.id, ...toBudgetItemPayload(change.previous, currentUserId) },
      { id: successorId, ...toBudgetItemPayload({ ...change.successor, id: successorId }, currentUserId) },
    ];

    setSaving(true);
    setError('');
    try {
      const { data, error: saveError } = await supabase
        .from('finance_budget_items')
        .upsert(payloads, { onConflict: 'id' })
        .select(BUDGET_ITEM_SELECT);
      if (saveError) throw saveError;
      const savedItems = (data || []).map(mapBudgetItem);
      const savedIds = new Set(savedItems.map((savedItem) => savedItem.id));
      setBudgetItems((previous) => [
        ...previous.filter((current) => current.id !== item.id && !savedIds.has(current.id)),
        ...savedItems,
      ].sort((left, right) => `${left.startMonth}${left.name}`.localeCompare(`${right.startMonth}${right.name}`)));
      return {
        previous: savedItems.find((savedItem) => savedItem.id === item.id) || null,
        successor: savedItems.find((savedItem) => savedItem.id === successorId) || null,
      };
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save the scheduled change.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, saveBudgetItem]);

  const saveCategory = useCallback(async (category = {}) => {
    if (!currentUserId) return null;
    const payload = toCategoryPayload(category, currentUserId);
    if (!payload.name) throw new Error('Give this category a name.');
    setSaving(true);
    setError('');
    try {
      const query = category.id
        ? supabase.from('finance_categories').update(payload).eq('id', category.id)
        : supabase.from('finance_categories').insert(payload);
      const { data, error: saveError } = await query.select(CATEGORY_SELECT).single();
      if (saveError) throw saveError;
      const nextCategory = mapCategory(data);
      setCategories((previous) => [...previous.filter((current) => current.id !== nextCategory.id), nextCategory]
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));
      return nextCategory;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save category.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const deleteBudgetItem = useCallback(async (itemId) => {
    setSaving(true);
    setError('');
    try {
      const { error: deleteError } = await supabase.from('finance_budget_items').delete().eq('id', itemId);
      if (deleteError) throw deleteError;
      setBudgetItems((previous) => previous.filter((item) => item.id !== itemId));
    } catch (nextError) {
      setError(nextError?.message || 'Unable to delete budget item.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, []);

  const saveActualEntry = useCallback(async (entry = {}) => {
    if (!currentUserId) return null;
    const payload = {
      user_id: currentUserId,
      category_id: entry.categoryId || null,
      budget_item_id: entry.budgetItemId || null,
      occurred_on: entry.occurredOn || new Date().toISOString().slice(0, 10),
      amount_pence: Math.max(0, Math.round(Number(entry.amountPence) || 0)),
      flow_type: entry.flowType === 'income' ? 'income' : 'expense',
      cash_treatment: entry.cashTreatment === 'internal_transfer' ? 'internal_transfer' : 'cash_outflow',
      note: String(entry.note || '').trim(),
    };
    setSaving(true);
    setError('');
    try {
      const query = entry.id
        ? supabase.from('finance_actual_entries').update(payload).eq('id', entry.id)
        : supabase.from('finance_actual_entries').insert(payload);
      const { data, error: saveError } = await query.select(ACTUAL_ENTRY_SELECT).single();
      if (saveError) throw saveError;
      const nextEntry = mapActualEntry(data);
      setActualEntries((previous) => [nextEntry, ...previous.filter((current) => current.id !== nextEntry.id)]
        .sort((left, right) => String(right.occurredOn).localeCompare(String(left.occurredOn))));
      return nextEntry;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save actual entry.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const saveBalanceSnapshot = useCallback(async (snapshot = {}) => {
    if (!currentUserId) return null;
    const payload = {
      user_id: currentUserId,
      as_of_month: monthToSql(snapshot.asOfMonth),
      cash_balance_pence: Math.round(Number(snapshot.cashBalancePence) || 0),
      note: String(snapshot.note || '').trim(),
    };
    setSaving(true);
    setError('');
    try {
      const { data, error: saveError } = await supabase
        .from('finance_balance_snapshots')
        .upsert(payload, { onConflict: 'user_id,as_of_month' })
        .select(SNAPSHOT_SELECT)
        .single();
      if (saveError) throw saveError;
      const nextSnapshot = mapSnapshot(data);
      setBalanceSnapshots((previous) => [nextSnapshot, ...previous.filter((current) => current.asOfMonth !== nextSnapshot.asOfMonth)]
        .sort((left, right) => right.asOfMonth.localeCompare(left.asOfMonth)));
      return nextSnapshot;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save cash snapshot.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const saveGoal = useCallback(async (goal = {}) => {
    if (!currentUserId) return null;
    const payload = {
      user_id: currentUserId,
      name: String(goal.name || '').trim(),
      goal_type: goal.goalType || 'sinking_fund',
      current_balance_pence: Math.round(Number(goal.currentBalancePence) || 0),
      target_balance_pence: goal.targetBalancePence === null || goal.targetBalancePence === undefined || goal.targetBalancePence === '' ? null : Math.round(Number(goal.targetBalancePence) || 0),
      target_date: goal.targetDate || null,
      monthly_contribution_pence: Math.max(0, Math.round(Number(goal.monthlyContributionPence) || 0)),
      priority: Math.max(1, Math.min(5, Math.round(Number(goal.priority) || 3))),
      is_protected: goal.isProtected === true,
      notes: String(goal.notes || '').trim(),
    };
    if (!payload.name) throw new Error('Give this fund a name.');
    setSaving(true);
    setError('');
    try {
      const query = goal.id
        ? supabase.from('finance_goals').update(payload).eq('id', goal.id)
        : supabase.from('finance_goals').insert(payload);
      const { data, error: saveError } = await query.select(GOAL_SELECT).single();
      if (saveError) throw saveError;
      const nextGoal = mapGoal(data);
      setGoals((previous) => [...previous.filter((current) => current.id !== nextGoal.id), nextGoal]
        .sort((left, right) => left.priority - right.priority));
      return nextGoal;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save fund.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const saveMortgage = useCallback(async (mortgage = {}) => {
    if (!currentUserId) return null;
    const payload = {
      user_id: currentUserId,
      name: String(mortgage.name || 'Home mortgage').trim(),
      outstanding_balance_pence: Math.max(0, Math.round(Number(mortgage.outstandingBalancePence) || 0)),
      annual_rate_bps: Math.max(0, Math.round(Number(mortgage.annualRateBps) || 0)),
      remaining_months: Math.max(1, Math.round(Number(mortgage.remainingMonths) || 1)),
      contractual_payment_pence: Math.max(0, Math.round(Number(mortgage.contractualPaymentPence) || 0)),
      voluntary_overpayment_pence: Math.max(0, Math.round(Number(mortgage.voluntaryOverpaymentPence) || 0)),
      property_value_pence: mortgage.propertyValuePence === null || mortgage.propertyValuePence === undefined || mortgage.propertyValuePence === '' ? null : Math.max(0, Math.round(Number(mortgage.propertyValuePence) || 0)),
      fixed_rate_end_date: mortgage.fixedRateEndDate || null,
      expected_future_rate_bps: mortgage.expectedFutureRateBps === null || mortgage.expectedFutureRateBps === undefined || mortgage.expectedFutureRateBps === '' ? null : Math.max(0, Math.round(Number(mortgage.expectedFutureRateBps) || 0)),
    };
    setSaving(true);
    setError('');
    try {
      const query = mortgage.id
        ? supabase.from('finance_mortgages').update(payload).eq('id', mortgage.id)
        : supabase.from('finance_mortgages').insert(payload);
      const { data, error: saveError } = await query.select(MORTGAGE_SELECT).single();
      if (saveError) throw saveError;
      const nextMortgage = mapMortgage(data);
      setMortgages((previous) => [...previous.filter((current) => current.id !== nextMortgage.id), nextMortgage]);
      return nextMortgage;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save mortgage.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const saveScenario = useCallback(async (scenario = {}) => {
    if (!currentUserId) return null;
    const payload = {
      user_id: currentUserId,
      name: String(scenario.name || '').trim(),
      description: String(scenario.description || '').trim(),
      color: scenario.color || '#7c3aed',
      is_archived: scenario.isArchived === true,
    };
    if (!payload.name) throw new Error('Give this scenario a name.');
    setSaving(true);
    setError('');
    try {
      const query = scenario.id
        ? supabase.from('finance_scenarios').update(payload).eq('id', scenario.id)
        : supabase.from('finance_scenarios').insert(payload);
      const { data, error: saveError } = await query.select(SCENARIO_SELECT).single();
      if (saveError) throw saveError;
      const nextScenario = mapScenario(data);
      setScenarios((previous) => [...previous.filter((current) => current.id !== nextScenario.id), nextScenario]);
      return nextScenario;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save scenario.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const saveScenarioChange = useCallback(async (change = {}) => {
    if (!currentUserId || !change.scenarioId) return null;
    const payload = {
      user_id: currentUserId,
      scenario_id: change.scenarioId,
      name: String(change.name || '').trim(),
      effective_month: monthToSql(change.effectiveMonth),
      change_type: ['income', 'expense', 'purchase', 'financing', 'saving'].includes(change.changeType) ? change.changeType : 'expense',
      amount_pence: Math.max(0, Math.round(Number(change.amountPence) || 0)),
      frequency: ['monthly', 'annual', 'one_off'].includes(change.frequency) ? change.frequency : 'one_off',
      classification: ['essential', 'discretionary', 'wealth_building'].includes(change.classification) ? change.classification : 'essential',
      payload: change.payload || {},
    };
    if (!payload.name) throw new Error('Give this scenario change a name.');
    setSaving(true);
    setError('');
    try {
      const query = change.id
        ? supabase.from('finance_scenario_changes').update(payload).eq('id', change.id)
        : supabase.from('finance_scenario_changes').insert(payload);
      const { data, error: saveError } = await query.select(SCENARIO_CHANGE_SELECT).single();
      if (saveError) throw saveError;
      const nextChange = mapScenarioChange(data);
      setScenarioChanges((previous) => [...previous.filter((current) => current.id !== nextChange.id), nextChange]
        .sort((left, right) => left.effectiveMonth.localeCompare(right.effectiveMonth)));
      return nextChange;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to save scenario change.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const loadSampleHouseholdBudget = useCallback(async () => {
    if (!currentUserId) return null;
    const sample = createSampleFinanceData({ startMonth: profile.forecastStartMonth || getCurrentMonthKey() });
    setSaving(true);
    setError('');
    try {
      await saveProfile(sample.settings);
      const categoryRows = DEFAULT_FINANCE_CATEGORIES.map((category, index) => toCategoryPayload({ ...category, sortOrder: index }, currentUserId));
      const { error: categoryError } = await supabase.from('finance_categories').upsert(categoryRows, { onConflict: 'user_id,name,flow_type' });
      if (categoryError) throw categoryError;
      const budgetRows = sample.budgetItems.map((item) => toBudgetItemPayload(item, currentUserId));
      const { error: budgetError } = await supabase.from('finance_budget_items').insert(budgetRows);
      if (budgetError) throw budgetError;
      const goalRows = sample.goals.map((goal) => ({
        user_id: currentUserId,
        name: goal.name,
        goal_type: goal.goalType,
        current_balance_pence: goal.currentBalancePence,
        target_balance_pence: goal.targetBalancePence,
        monthly_contribution_pence: goal.monthlyContributionPence,
        priority: 1,
        is_protected: goal.isProtected,
      }));
      const { error: goalError } = await supabase.from('finance_goals').insert(goalRows);
      if (goalError) throw goalError;
      const { error: mortgageError } = await supabase.from('finance_mortgages').insert({
        user_id: currentUserId,
        name: 'Home mortgage',
        outstanding_balance_pence: sample.mortgage.outstandingBalancePence,
        annual_rate_bps: sample.mortgage.annualRateBps,
        remaining_months: sample.mortgage.remainingMonths,
        contractual_payment_pence: sample.mortgage.contractualPaymentPence,
        voluntary_overpayment_pence: sample.mortgage.voluntaryOverpaymentPence,
        property_value_pence: sample.mortgage.propertyValuePence,
      });
      if (mortgageError) throw mortgageError;
      const { error: snapshotError } = await supabase.from('finance_balance_snapshots').upsert({
        user_id: currentUserId,
        as_of_month: monthToSql(sample.settings.forecastStartMonth),
        cash_balance_pence: sample.settings.openingCashPence,
        note: 'Opening household cash',
      }, { onConflict: 'user_id,as_of_month' });
      if (snapshotError) throw snapshotError;
      await loadAll();
      return sample;
    } catch (nextError) {
      setError(nextError?.message || 'Unable to load the sample household budget.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadAll, profile.forecastStartMonth, saveProfile]);

  const resetFinanceData = useCallback(async () => {
    if (!currentUserId) return;
    setSaving(true);
    setError('');
    try {
      const deletions = [
        supabase.from('finance_actual_entries').delete().eq('user_id', currentUserId),
        supabase.from('finance_balance_snapshots').delete().eq('user_id', currentUserId),
        supabase.from('finance_goals').delete().eq('user_id', currentUserId),
        supabase.from('finance_mortgages').delete().eq('user_id', currentUserId),
        supabase.from('finance_scenarios').delete().eq('user_id', currentUserId),
        supabase.from('finance_budget_items').delete().eq('user_id', currentUserId),
        supabase.from('finance_categories').delete().eq('user_id', currentUserId),
        supabase.from('finance_profiles').delete().eq('user_id', currentUserId),
      ];
      const results = await Promise.all(deletions);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      setProfile({ ...DEFAULT_FINANCE_SETTINGS, forecastStartMonth: getCurrentMonthKey() });
      setCategories([]);
      setBudgetItems([]);
      setActualEntries([]);
      setBalanceSnapshots([]);
      setGoals([]);
      setMortgages([]);
      setScenarios([]);
      setScenarioChanges([]);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to reset Finance data.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId]);

  const summary = useMemo(() => ({
    hasData: Boolean(budgetItems.length || goals.length || mortgages.length || profile.updatedAt),
    hasBudget: budgetItems.length > 0,
  }), [budgetItems.length, goals.length, mortgages.length, profile.updatedAt]);

  return {
    profile,
    categories,
    budgetItems,
    actualEntries,
    balanceSnapshots,
    goals,
    mortgages,
    scenarios,
    scenarioChanges,
    loading,
    saving,
    error,
    needsMigration,
    summary,
    loadAll,
    saveProfile,
    saveBudgetItem,
    saveBudgetItemChange,
    deleteBudgetItem,
    saveCategory,
    saveActualEntry,
    saveBalanceSnapshot,
    saveGoal,
    saveMortgage,
    saveScenario,
    saveScenarioChange,
    loadSampleHouseholdBudget,
    resetFinanceData,
  };
}
