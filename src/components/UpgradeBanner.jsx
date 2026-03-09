import React, { useState } from 'react';
import { usePlan } from '../contexts/PlanContext';

// ── Trial Banner (shown at top of app during trial / after expiry) ───
export const TrialBanner = () => {
  const { isTrialActive, isTrialExpired, trialDaysLeft, isStarter, effectivePlan } = usePlan();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // Trial expired → now on Starter
  if (isTrialExpired || (isStarter && !isTrialActive)) {
    return (
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-3 shadow-sm">
        <span>You're on the <strong>Starter</strong> plan. Upgrade to Pro to unlock all features.</span>
        <button
          onClick={() => {
            // TODO: Wire to Stripe checkout
            window.open('/pricing', '_blank');
          }}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-1 rounded-full text-xs font-bold transition-colors"
        >
          Upgrade to Pro
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/50 hover:text-white text-xs ml-1"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  // Trial active — warn when 7 days or fewer left
  if (isTrialActive && trialDaysLeft <= 7) {
    return (
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3">
        <span>
          {trialDaysLeft === 0
            ? 'Your Pro trial ends today!'
            : `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in your Pro trial`}
        </span>
        <button
          onClick={() => {
            // TODO: Wire to Stripe checkout
            window.open('/pricing', '_blank');
          }}
          className="bg-white text-amber-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-amber-50 transition-colors"
        >
          Upgrade Now
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/70 hover:text-white text-xs ml-2"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
};

// ── Cancellation Banner (Pro user who will cancel at period end) ──────
export const CancellationBanner = () => {
  const { willCancel, subscriptionEndsAt, isPro } = usePlan();

  if (!willCancel || !isPro) return null;

  const endDate = subscriptionEndsAt
    ? subscriptionEndsAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'the end of your billing period';

  return (
    <div className="bg-gradient-to-r from-rose-50 to-orange-50 border-b border-rose-200 text-rose-800 px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-3">
      <span>Your Pro plan will cancel on <strong>{endDate}</strong>. You'll move to Starter after that.</span>
      <button
        onClick={() => {
          // TODO: Wire to Stripe customer portal to reactivate
          window.open('/billing', '_blank');
        }}
        className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded-full text-xs font-bold transition-colors"
      >
        Keep Pro
      </button>
    </div>
  );
};

// ── Limit Hit Banner (shown inline when a specific limit is reached) ─
export const LimitBanner = ({ type, currentTaskCount, className = '' }) => {
  const {
    effectivePlan,
    isStarter,
    canCreateProject,
    canUseAiReport,
    canBaseline,
    limits,
    projectCount,
    isInTaskGrace,
    getTaskHardLimit,
    canUseAi,
  } = usePlan();

  const messages = {
    projects: {
      show: !canCreateProject,
      icon: '📁',
      title: 'Project limit reached',
      detail: `Your ${limits.label} plan allows ${limits.maxProjects} project${limits.maxProjects !== 1 ? 's' : ''}. You have ${projectCount}.`,
      cta: 'Upgrade to Pro',
    },
    tasks_warning: {
      show: currentTaskCount != null && isInTaskGrace(currentTaskCount),
      icon: '⚠️',
      title: 'Approaching task limit',
      detail: `You've passed ${limits.maxTasksPerProject} tasks. You can add up to ${getTaskHardLimit()} total, then you'll need to upgrade.`,
      cta: 'Upgrade to Pro',
      severity: 'warning',
    },
    tasks_hard: {
      show: currentTaskCount != null && currentTaskCount >= getTaskHardLimit(),
      icon: '📋',
      title: 'Task limit reached',
      detail: `Your ${limits.label} plan allows ${getTaskHardLimit()} tasks per project (${limits.maxTasksPerProject} + ${limits.taskGrace} grace).`,
      cta: 'Upgrade to Pro',
    },
    ai: {
      show: !canUseAi || !canUseAiReport,
      icon: '🤖',
      title: isStarter ? 'AI reports are a Pro feature' : 'AI report limit reached',
      detail: isStarter
        ? 'Upgrade to Pro to generate AI-powered status reports and email digests.'
        : `You've used all ${limits.aiReportsPerMonth} AI reports this month.`,
      cta: 'Upgrade to Pro',
    },
    baseline: {
      show: !canBaseline,
      icon: '📐',
      title: 'Baseline tracking is a Pro feature',
      detail: 'Upgrade to Pro to compare planned vs actual progress.',
      cta: 'Upgrade to Pro',
    },
  };

  const msg = messages[type];
  if (!msg || !msg.show) return null;

  const isWarning = msg.severity === 'warning';

  return (
    <div className={`${
      isWarning
        ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200'
        : 'bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200'
    } rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{msg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800">{msg.title}</div>
          <div className="text-xs text-slate-600 mt-0.5">{msg.detail}</div>
        </div>
        <button
          onClick={() => {
            // TODO: Wire to Stripe checkout
            window.open('/pricing', '_blank');
          }}
          className={`shrink-0 ${
            isWarning ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'
          } text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors`}
        >
          {msg.cta}
        </button>
      </div>
    </div>
  );
};

// ── Inline upgrade nudge (small, used inside feature areas) ──
export const UpgradeNudge = ({ feature, children }) => {
  const { isPaid, isTrialActive } = usePlan();

  // Don't show nudge for paid or trial users
  if (isPaid || isTrialActive) return null;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
      <span className="text-[10px]">⭐</span>
      <span className="font-medium">{children || `${feature} — upgrade to unlock`}</span>
    </div>
  );
};

// ── AI Reports Counter (shown near AI features) ──────────────
export const AiReportsCounter = () => {
  const { aiReportsRemaining, limits, effectivePlan, isTrialActive, canUseAi } = usePlan();

  if (!canUseAi) return null;
  if (effectivePlan === 'team') return null;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="text-[10px]">🤖</span>
      <span>
        {aiReportsRemaining} of {limits.aiReportsPerMonth} AI report{limits.aiReportsPerMonth !== 1 ? 's' : ''} remaining
        {isTrialActive ? ' (trial)' : ' this month'}
      </span>
    </div>
  );
};

// ── Plan Badge (shown in header) ──────────────────────────────
export const PlanBadge = () => {
  const { effectivePlan, trialDaysLeft, isTrialActive, isTrialExpired, willCancel, simulatedPlan } = usePlan();

  const badges = {
    starter: { label: 'Starter', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    trial: {
      label: `Pro Trial (${trialDaysLeft}d)`,
      color: trialDaysLeft <= 3
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-blue-100 text-blue-700 border-blue-200'
    },
    pro: {
      label: willCancel ? 'Pro (Cancelling)' : 'Pro',
      color: willCancel
        ? 'bg-rose-100 text-rose-700 border-rose-200'
        : 'bg-emerald-100 text-emerald-700 border-emerald-200'
    },
    team: { label: 'Team', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  };

  const badge = badges[effectivePlan] || badges.starter;

  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
      {badge.label}
    </span>
  );
};

// ── Read-Only Banner (shown when downgraded user has too many projects) ──
export const ReadOnlyBanner = () => {
  const { isReadOnly, limits } = usePlan();

  if (!isReadOnly) return null;

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 text-amber-800 px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-3">
      <span>
        ⚠️ Read-only mode — your Starter plan allows {limits.maxProjects} project{limits.maxProjects !== 1 ? 's' : ''}.
        Delete extra projects or upgrade to edit.
      </span>
      <button
        onClick={() => {
          // TODO: Wire to Stripe checkout
          window.open('/pricing', '_blank');
        }}
        className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-full text-xs font-bold transition-colors"
      >
        Upgrade to Pro
      </button>
    </div>
  );
};
