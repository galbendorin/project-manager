import React, { useMemo, useState } from 'react';
import { usePlan } from '../contexts/PlanContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase } from '../lib/supabase';
import { buildAdminHealthSnapshot } from '../utils/featureRegistry';

const STATUS_META = {
  ok: {
    label: 'Ready',
    dot: 'bg-emerald-500',
    pill: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  watch: {
    label: 'Check',
    dot: 'bg-amber-500',
    pill: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  blocked: {
    label: 'Missing',
    dot: 'bg-rose-500',
    pill: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};

const HealthStatusPill = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.watch;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
};

const HealthCheckCard = ({ check }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{check.label}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{check.detail}</p>
      </div>
      <HealthStatusPill status={check.status} />
    </div>
  </div>
);

export default function AdminHealthPanel() {
  const {
    canUsePlatformAi,
    effectivePlan,
    hasSharedHouseholdProjectAccess,
    householdToolsEnabled,
    isAdmin,
    limits,
    projectCount,
    userProfile,
  } = usePlan();
  const isOnline = useOnlineStatus();
  const [financeEmail, setFinanceEmail] = useState('');
  const [financeSubmitting, setFinanceSubmitting] = useState(false);
  const [financeError, setFinanceError] = useState('');
  const [financeMessage, setFinanceMessage] = useState('');

  const snapshot = useMemo(() => buildAdminHealthSnapshot({
    env: import.meta.env,
    effectivePlan,
    hasSharedHouseholdProjectAccess,
    householdToolsEnabled,
    isAdmin,
    isOnline,
    limits,
    profile: userProfile,
    projectCount,
    canUsePlatformAi,
  }), [
    canUsePlatformAi,
    effectivePlan,
    hasSharedHouseholdProjectAccess,
    householdToolsEnabled,
    isAdmin,
    isOnline,
    limits,
    projectCount,
    userProfile,
  ]);

  if (!isAdmin) return null;

  const summaryMeta = STATUS_META[snapshot.status] || STATUS_META.watch;

  const updateFinanceAccess = async (enabled) => {
    const normalizedEmail = financeEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setFinanceError('Enter the user’s PM Workspace account email.');
      setFinanceMessage('');
      return;
    }
    if (!enabled && !window.confirm(`Disable Household Finance owner access for ${normalizedEmail}? Their family access will be removed and must be invited again if Finance is re-enabled.`)) return;

    setFinanceSubmitting(true);
    setFinanceError('');
    setFinanceMessage('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token || '';
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch('/api/admin-finance-access', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail, enabled }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Unable to update Household Finance access.');
      setFinanceMessage(enabled
        ? `Household Finance owner access enabled for ${normalizedEmail}.`
        : `Household Finance owner access disabled for ${normalizedEmail}.`);
    } catch (nextError) {
      setFinanceError(nextError?.message || 'Unable to update Household Finance access.');
    } finally {
      setFinanceSubmitting(false);
    }
  };

  return (
    <details className="pm-surface-soft mt-5 rounded-[24px] p-3 sm:p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="pm-kicker">Admin health</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
            Release and access checks
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${summaryMeta.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${summaryMeta.dot}`} />
          {summaryMeta.label}
        </span>
      </summary>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {snapshot.checks.map((check) => (
          <HealthCheckCard key={check.id} check={check} />
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs leading-5 text-slate-500 shadow-sm">
        <span className="font-semibold text-slate-700">Private launch surface:</span>
        {' '}
        {snapshot.privateTools.join(', ')}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Household Finance owners</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Enable an existing account as the owner of its own private household plan. They can then invite family members from inside Finance.</p>
        </div>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => { event.preventDefault(); void updateFinanceAccess(true); }}
        >
          <input
            type="email"
            value={financeEmail}
            onChange={(event) => setFinanceEmail(event.target.value)}
            placeholder="user@example.com"
            autoComplete="email"
            disabled={financeSubmitting}
            className="pm-input min-h-[44px] min-w-0 flex-1 rounded-xl px-3 text-[16px] sm:text-sm"
          />
          <button type="submit" disabled={financeSubmitting} className="pm-toolbar-primary min-h-[44px] rounded-xl px-4 text-sm font-bold text-white disabled:opacity-50">
            Enable as owner
          </button>
          <button type="button" disabled={financeSubmitting} onClick={() => void updateFinanceAccess(false)} className="min-h-[44px] rounded-xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 disabled:opacity-50">
            Disable owner
          </button>
        </form>
        {financeError ? <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{financeError}</p> : null}
        {financeMessage ? <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{financeMessage}</p> : null}
      </div>
    </details>
  );
}
