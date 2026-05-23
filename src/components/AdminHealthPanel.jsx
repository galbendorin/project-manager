import React, { useMemo } from 'react';
import { usePlan } from '../contexts/PlanContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
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
    </details>
  );
}
