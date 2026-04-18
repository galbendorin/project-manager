import { TRIAL_LENGTH_DAYS } from './trialOffer.js';

export const isAdminProfile = (profile = null) => Boolean(
  profile?.is_admin || profile?.is_platform_admin
);

export const canAccessHouseholdTools = (profile = null) => Boolean(
  profile?.household_tools_enabled || profile?.is_admin || profile?.is_platform_admin
);

export const canUsePlatformAi = (profile = null) => Boolean(profile?.platform_ai_enabled);

export const PLAN_LIMITS = {
  starter: {
    label: 'Starter',
    maxProjects: 3,
    maxTasksPerProject: 30,
    taskGrace: 5,
    aiReportsPerMonth: 0,
    canExport: true,
    canImport: true,
    canBaseline: false,
    canUseAi: false,
    canUseAiAssistant: false,
    canExportAiReport: false,
    fullAccessTabs: ['schedule', 'issues', 'actions', 'tracker', 'timesheets'],
  },
  trial: {
    label: 'Pro Trial',
    maxProjects: 999,
    maxTasksPerProject: 999,
    taskGrace: 0,
    aiReportsPerMonth: 100,
    canExport: true,
    canImport: true,
    canBaseline: true,
    canUseAi: true,
    canUseAiAssistant: true,
    canExportAiReport: true,
    fullAccessTabs: null,
  },
  pro: {
    label: 'Pro',
    maxProjects: 999,
    maxTasksPerProject: 500,
    taskGrace: 0,
    aiReportsPerMonth: 100,
    canExport: true,
    canImport: true,
    canBaseline: true,
    canUseAi: true,
    canUseAiAssistant: true,
    canExportAiReport: true,
    fullAccessTabs: null,
  },
  team: {
    label: 'Team',
    maxProjects: 999,
    maxTasksPerProject: 999,
    taskGrace: 0,
    aiReportsPerMonth: 999,
    canExport: true,
    canImport: true,
    canBaseline: true,
    canUseAi: true,
    canUseAiAssistant: true,
    canExportAiReport: true,
    fullAccessTabs: null,
  },
};

export const ALL_TABS = [
  'timesheets', 'schedule', 'tracker', 'statusreport', 'todo',
  'risks', 'issues', 'actions', 'changes',
  'minutes', 'costs', 'stakeholdersmgmt', 'financials',
  'assumptions', 'decisions', 'lessons', 'raci',
];

export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'];

export const resolveRealPlan = ({ profile, now = new Date() }) => {
  if (isAdminProfile(profile)) return 'team';
  if (!profile) return 'starter';

  const subscriptionStatus = String(profile.subscription_status || '').toLowerCase();
  if (ACTIVE_SUBSCRIPTION_STATUSES.includes(subscriptionStatus) && profile.plan === 'pro') {
    return 'pro';
  }

  if (profile.plan === 'trial') {
    const trialEnd = new Date(profile.trial_ends);
    if (!Number.isNaN(trialEnd.getTime()) && trialEnd > now) {
      return 'trial';
    }
    return 'starter';
  }

  if (profile.plan === 'team') return 'team';
  if (profile.plan === 'pro') return 'pro';

  return 'starter';
};

export const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

export const buildDefaultUserProfile = (userId, now = new Date()) => {
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trialEnd = new Date(now.getTime() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000);

  return {
    id: userId,
    plan: 'trial',
    subscription_status: 'trialing',
    trial_start: now.toISOString(),
    trial_ends: trialEnd.toISOString(),
    ai_reports_used: 0,
    ai_reports_reset_at: currentMonthStart.toISOString(),
    is_admin: false,
    household_tools_enabled: false,
    platform_ai_enabled: true,
    is_platform_admin: false,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
};
