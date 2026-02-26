import React, { useState } from 'react';
import { usePlan } from '../contexts/PlanContext';

// ── Trial Banner (shown at top of app during trial) ─────────
export const TrialBanner = () => {
  const { isTrialActive, isTrialExpired, trialDaysLeft, effectivePlan } = usePlan();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!isTrialActive && !isTrialExpired)) return null;

  if (isTrialExpired) {
    return (
      <div className="bg-gradient-to-r from-rose-600 to-rose-700 text-white px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-3 shadow-sm">
        <span>Your free trial has ended. Upgrade to keep using all features.</span>
        <button
          onClick={() => window.open('/pricing', '_blank')}
          className="bg-white text-rose-700 px-4 py-1 rounded-full text-xs font-bold hover:bg-rose-50 transition-colors"
        >
          View Plans
        </button>
      </div>
    );
  }

  if (isTrialActive && trialDaysLeft <= 7) {
    return (
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3">
        <span>
          {trialDaysLeft === 0
            ? 'Your trial ends today!'
            : `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in your free trial`}
        </span>
        <button
          onClick={() => window.open('/pricing', '_blank')}
          className="bg-white text-amber-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-amber-50 transition-colors"
        >
          Upgrade
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

// ── Limit Hit Banner (shown inline when a specific limit is reached) ─
export const LimitBanner = ({ type, className = '' }) => {
  const {
    effectivePlan,
    isTrialExpired,
    canCreateProject,
    canUseAiReport,
    canExport,
    canBaseline,
    aiReportsRemaining,
    limits,
    projectCount,
  } = usePlan();

  const messages = {
    projects: {
      show: !canCreateProject,
      icon: '📁',
      title: 'Project limit reached',
      detail: `Your ${limits.label} plan allows ${limits.maxProjects} project${limits.maxProjects !== 1 ? 's' : ''}. You have ${projectCount}.`,
      cta: 'Upgrade for unlimited projects',
    },
    tasks: {
      show: false, // Checked dynamically via getTaskLimit()
      icon: '📋',
      title: 'Task limit reached',
      detail: `Your ${limits.label} plan allows ${limits.maxTasksPerProject} tasks per project.`,
      cta: 'Upgrade for unlimited tasks',
    },
    ai: {
      show: !canUseAiReport,
      icon: '🤖',
      title: 'AI report limit reached',
      detail: isTrialExpired
        ? 'Upgrade to generate AI reports.'
        : `You've used all ${limits.aiReportsPerMonth} AI reports this ${effectivePlan === 'trial' ? 'trial' : 'month'}.`,
      cta: 'Upgrade for more AI reports',
    },
    export: {
      show: !canExport,
      icon: '📤',
      title: 'Export is a Team feature',
      detail: 'Upgrade to Team to export your projects to Excel.',
      cta: 'Upgrade to Team',
    },
    baseline: {
      show: !canBaseline,
      icon: '📐',
      title: 'Baseline tracking is a Team feature',
      detail: 'Upgrade to Team to compare planned vs actual progress.',
      cta: 'Upgrade to Team',
    },
  };

  const msg = messages[type];
  if (!msg || !msg.show) return null;

  return (
    <div className={`bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{msg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-800">{msg.title}</div>
          <div className="text-xs text-slate-600 mt-0.5">{msg.detail}</div>
        </div>
        <button
          onClick={() => window.open('/pricing', '_blank')}
          className="shrink-0 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors"
        >
          {msg.cta}
        </button>
      </div>
    </div>
  );
};

// ── Inline upgrade nudge (small, used inside feature areas) ──
export const UpgradeNudge = ({ feature, children }) => {
  const { effectivePlan, isPaid } = usePlan();

  // Don't show nudge if they're paid
  if (isPaid) return null;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
      <span className="text-[10px]">⭐</span>
      <span className="font-medium">{children || `${feature} — upgrade to unlock`}</span>
    </div>
  );
};

// ── AI Reports Counter (shown near AI features) ──────────────
export const AiReportsCounter = () => {
  const { aiReportsRemaining, limits, effectivePlan, isTrialActive } = usePlan();

  if (effectivePlan === 'team') return null; // Unlimited, don't show counter

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

// ── Plan Badge (shown in header/settings) ─────────────────────
export const PlanBadge = () => {
  const { effectivePlan, trialDaysLeft, isTrialActive, isTrialExpired } = usePlan();

  const badges = {
    trial: { label: `Trial (${trialDaysLeft}d left)`, color: 'bg-blue-100 text-blue-700 border-blue-200' },
    expired: { label: 'Trial Expired', color: 'bg-rose-100 text-rose-700 border-rose-200' },
    pro: { label: 'Pro', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    team: { label: 'Team', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  };

  const badge = badges[effectivePlan] || badges.trial;

  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
      {badge.label}
    </span>
  );
};
