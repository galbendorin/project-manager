import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  BILLING_SYNC_POLL_MS,
  BILLING_SYNC_TIMEOUT_MS,
  clearBillingSyncPending,
  hasBillingSyncPending,
} from '../utils/billingSync';
import { TRIAL_LENGTH_DAYS } from '../utils/trialOffer';
import {
  ALL_TABS,
  PLAN_LIMITS,
  canAccessHouseholdTools as canAccessHouseholdToolsFromProfile,
  canUsePlatformAi as canUsePlatformAiFromProfile,
  resolveRealPlan,
} from '../utils/planAccess';

const PlanContext = createContext({});

export const usePlan = () => useContext(PlanContext);

// ── Plan simulator options (admin only) ──────────────────────
const SIMULATOR_OPTIONS = [
  { value: null, label: 'Real (Admin)' },
  { value: 'starter', label: 'Starter' },
  { value: 'trial_fresh', label: `Trial — Day 1 of ${TRIAL_LENGTH_DAYS}` },
  { value: 'trial_ending', label: 'Trial — 1 day left' },
  { value: 'trial_expired', label: 'Trial Expired → Starter' },
  { value: 'pro', label: 'Pro' },
  { value: 'pro_cancelling', label: 'Pro (Cancelling)' },
];

export { PLAN_LIMITS, ALL_TABS, SIMULATOR_OPTIONS };

export const PlanProvider = ({ children }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectCount, setProjectCount] = useState(0);
  const lastExternalRefreshAtRef = useRef(0);

  // ── Plan simulator state (admin only) ───────────────────────
  const [simulatedPlan, setSimulatedPlan] = useState(null);

  // ── Load profile ────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .rpc('get_or_create_current_user_profile')
        .single();

      if (error) {
        console.error('Failed to load profile:', error);
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Count projects ──────────────────────────────────────────
  const loadProjectCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    setProjectCount(count || 0);
  }, [user]);

  useEffect(() => {
    loadProfile();
    loadProjectCount();
  }, [loadProfile, loadProjectCount]);

  const refreshProfileFromExternalChange = useCallback(() => {
    if (!user) return;

    const now = Date.now();
    if (now - lastExternalRefreshAtRef.current < 1500) return;

    lastExternalRefreshAtRef.current = now;
    loadProfile();
  }, [user, loadProfile]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return undefined;

    const handleFocus = () => {
      refreshProfileFromExternalChange();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshProfileFromExternalChange();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let intervalId = null;
    let timeoutId = null;

    if (hasBillingSyncPending()) {
      clearBillingSyncPending();
      refreshProfileFromExternalChange();

      intervalId = window.setInterval(() => {
        refreshProfileFromExternalChange();
      }, BILLING_SYNC_POLL_MS);

      timeoutId = window.setTimeout(() => {
        if (intervalId) {
          window.clearInterval(intervalId);
        }
      }, BILLING_SYNC_TIMEOUT_MS);
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (intervalId) {
        window.clearInterval(intervalId);
      }

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [user, refreshProfileFromExternalChange]);

  // ── Derived state ───────────────────────────────────────────
  const isAdmin = useMemo(() => Boolean(profile?.is_admin || profile?.is_platform_admin), [profile?.is_admin, profile?.is_platform_admin]);
  const householdToolsEnabled = useMemo(
    () => canAccessHouseholdToolsFromProfile(profile),
    [profile]
  );

  // ── Resolve REAL plan (before simulator override) ───────────
  const realPlan = useMemo(() => {
    return resolveRealPlan({ profile, now: new Date() });
  }, [profile]);

  // ── Effective plan (with simulator override for admin) ──────
  const effectivePlan = useMemo(() => {
    if (!isAdmin || !simulatedPlan) return realPlan;

    // Simulator overrides
    switch (simulatedPlan) {
      case 'starter':         return 'starter';
      case 'trial_fresh':     return 'trial';
      case 'trial_ending':    return 'trial';
      case 'trial_expired':   return 'starter';
      case 'pro':             return 'pro';
      case 'pro_cancelling':  return 'pro';
      default:                return realPlan;
    }
  }, [realPlan, simulatedPlan, isAdmin]);

  const limits = useMemo(() => PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.starter, [effectivePlan]);

  // ── Trial info ──────────────────────────────────────────────
  const trialDaysLeft = useMemo(() => {
    // Simulator overrides
    if (isAdmin && simulatedPlan === 'trial_fresh') return 30;
    if (isAdmin && simulatedPlan === 'trial_ending') return 1;
    if (isAdmin && simulatedPlan === 'trial_expired') return 0;

    if (!profile || realPlan !== 'trial') return 0;
    const end = new Date(profile.trial_ends);
    const now = new Date();
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }, [profile, realPlan, isAdmin, simulatedPlan]);

  const isTrialActive = effectivePlan === 'trial';
  const isTrialExpired = useMemo(() => {
    if (isAdmin && simulatedPlan === 'trial_expired') return true;
    if (!profile) return false;
    if (profile.plan !== 'trial') return false;
    return new Date(profile.trial_ends) <= new Date();
  }, [profile, isAdmin, simulatedPlan]);

  // ── Subscription awareness ──────────────────────────────────
  const subscriptionEndsAt = useMemo(() => {
    if (isAdmin && simulatedPlan === 'pro_cancelling') {
      return new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    }
    if (!profile?.current_period_end) return null;
    return new Date(profile.current_period_end);
  }, [profile, isAdmin, simulatedPlan]);

  const willCancel = useMemo(() => {
    if (isAdmin && simulatedPlan === 'pro_cancelling') return true;
    return profile?.cancel_at_period_end === true;
  }, [profile, isAdmin, simulatedPlan]);

  const isPastDue = useMemo(() => {
    return profile?.subscription_status === 'past_due';
  }, [profile]);

  const isStarter = effectivePlan === 'starter';
  const isPro = effectivePlan === 'pro';
  const isPaid = effectivePlan === 'pro' || effectivePlan === 'team';
  const isFree = effectivePlan === 'starter';

  // ── Tab gating ─────────────────────────────────────────────
  const hasTabAccess = useCallback((tabId) => {
    if (limits.fullAccessTabs === null) return true;
    return limits.fullAccessTabs.includes(tabId);
  }, [limits]);

  // ── Gating checks ──────────────────────────────────────────
  const canCreateProject = useMemo(() => {
    return projectCount < limits.maxProjects;
  }, [projectCount, limits]);

  const canUseAiReport = useMemo(() => {
    if (!limits.canUseAi) return false;
    if (!profile) return false;
    return (profile.ai_reports_used || 0) < limits.aiReportsPerMonth;
  }, [profile, limits]);

  const aiReportsRemaining = useMemo(() => {
    if (!limits.canUseAi) return 0;
    if (!profile) return 0;
    return Math.max(0, limits.aiReportsPerMonth - (profile.ai_reports_used || 0));
  }, [profile, limits]);

  const getTaskLimit = useCallback(() => {
    return limits.maxTasksPerProject;
  }, [limits]);

  const getTaskHardLimit = useCallback(() => {
    return limits.maxTasksPerProject + (limits.taskGrace || 0);
  }, [limits]);

  const isInTaskGrace = useCallback((taskCount) => {
    return taskCount >= limits.maxTasksPerProject &&
           taskCount < limits.maxTasksPerProject + (limits.taskGrace || 0);
  }, [limits]);

  const canExport = limits.canExport;
  const canImport = limits.canImport;
  const canBaseline = limits.canBaseline;
  const canUseAi = limits.canUseAi;
  const canUseAiAssistant = limits.canUseAiAssistant;
  const canExportAiReport = limits.canExportAiReport;
  const canUsePlatformAi = useMemo(
    () => canUsePlatformAiFromProfile(profile) && limits.canUseAi,
    [limits.canUseAi, profile]
  );

  // ── Read-only mode (downgraded Pro with too many projects) ──
  const isReadOnly = useMemo(() => {
    if (effectivePlan !== 'starter') return false;
    return projectCount > limits.maxProjects;
  }, [effectivePlan, projectCount, limits]);

  // ── Actions ────────────────────────────────────────────────
  const incrementAiReports = useCallback(async () => {
    if (!user || !profile) return false;

    const { data, error } = await supabase
      .rpc('increment_current_user_ai_reports')
      .single();

    if (!error && data) {
      setProfile(data);
      return true;
    }
    return false;
  }, [user, profile]);

  const refreshProjectCount = useCallback(() => {
    loadProjectCount();
  }, [loadProjectCount]);

  const refreshProfile = useCallback(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Context value ──────────────────────────────────────────
  const value = useMemo(() => ({
    // State
    profile,
    userProfile: profile,   // Alias — used by PricingPage & BillingScreen for Stripe fields
    loading,
    effectivePlan,
    limits,
    projectCount,

    // Plan booleans
    isStarter,
    isFree,
    isPro,
    isPaid,
    isAdmin,
    isReadOnly,

    // Trial
    isTrialActive,
    isTrialExpired,
    trialDaysLeft,

    // Subscription
    subscriptionEndsAt,
    willCancel,
    isPastDue,

    // Tab gating
    hasTabAccess,

    // Feature gating
    canCreateProject,
    canUseAiReport,
    canExport,
    canImport,
    canBaseline,
    canUseAi,
    canUseAiAssistant,
    canExportAiReport,
    canUsePlatformAi,
    aiReportsRemaining,
    getTaskLimit,
    getTaskHardLimit,
    isInTaskGrace,
    householdToolsEnabled,

    // Actions
    incrementAiReports,
    refreshProjectCount,
    refreshProfile,

    // Plan simulator (admin only)
    simulatedPlan,
    setSimulatedPlan: isAdmin ? setSimulatedPlan : () => {},
    simulatorOptions: isAdmin ? SIMULATOR_OPTIONS : [],
  }), [
    profile, loading, effectivePlan, limits, projectCount,
    isStarter, isFree, isPro, isPaid, isAdmin, isReadOnly,
    isTrialActive, isTrialExpired, trialDaysLeft,
    subscriptionEndsAt, willCancel, isPastDue,
    hasTabAccess,
    canCreateProject, canUseAiReport, canExport, canImport,
    canBaseline, canUseAi, canUseAiAssistant, canExportAiReport, canUsePlatformAi,
    aiReportsRemaining, getTaskLimit, getTaskHardLimit, isInTaskGrace, householdToolsEnabled,
    incrementAiReports, refreshProjectCount, refreshProfile,
    simulatedPlan,
  ]);

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
};
