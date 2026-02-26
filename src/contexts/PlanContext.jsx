import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const PlanContext = createContext({});

export const usePlan = () => useContext(PlanContext);

// ── Plan limits ──────────────────────────────────────────────
const PLAN_LIMITS = {
  trial: {
    label: 'Free Trial',
    maxProjects: 999,        // Unlimited during trial
    maxTasksPerProject: 999, // Unlimited during trial
    aiReportsPerMonth: 5,    // 5 total during trial
    canExport: true,         // Allow during trial (they need to experience it)
    canBaseline: true,       // Allow during trial
    durationDays: 30,
  },
  pro: {
    label: 'Pro',
    maxProjects: 3,
    maxTasksPerProject: 100,
    aiReportsPerMonth: 5,
    canExport: false,        // Export is Team-only
    canBaseline: false,      // Baseline is Team-only
    durationDays: null,      // No expiry
  },
  team: {
    label: 'Team',
    maxProjects: 999,
    maxTasksPerProject: 999,
    aiReportsPerMonth: 999,  // Effectively unlimited
    canExport: true,
    canBaseline: true,
    durationDays: null,
  },
  expired: {
    label: 'Trial Expired',
    maxProjects: 1,
    maxTasksPerProject: 30,
    aiReportsPerMonth: 0,
    canExport: false,
    canBaseline: false,
    durationDays: null,
  },
};

export const PlanProvider = ({ children }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectCount, setProjectCount] = useState(0);

  // ── Load profile ────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        // Profile might not exist yet (race condition with trigger)
        // Create one manually
        if (error.code === 'PGRST116') {
          const { data: newProfile } = await supabase
            .from('user_profiles')
            .insert({
              id: user.id,
              plan: 'trial',
              trial_start: new Date().toISOString(),
              trial_ends: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .select()
            .single();
          setProfile(newProfile);
        } else {
          console.error('Failed to load profile:', error);
        }
      } else {
        // Check if AI counter needs monthly reset
        const resetAt = new Date(data.ai_reports_reset_at);
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        if (resetAt < currentMonthStart && data.plan !== 'trial') {
          // Reset counter for new month
          const { data: updated } = await supabase
            .from('user_profiles')
            .update({
              ai_reports_used: 0,
              ai_reports_reset_at: currentMonthStart.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)
            .select()
            .single();
          setProfile(updated || data);
        } else {
          setProfile(data);
        }
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

  // ── Derived state ───────────────────────────────────────────
  const effectivePlan = useMemo(() => {
    if (!profile) return 'trial';

    if (profile.plan === 'trial') {
      const trialEnd = new Date(profile.trial_ends);
      if (trialEnd < new Date()) {
        return 'expired';
      }
    }
    return profile.plan;
  }, [profile]);

  const limits = useMemo(() => PLAN_LIMITS[effectivePlan] || PLAN_LIMITS.expired, [effectivePlan]);

  const trialDaysLeft = useMemo(() => {
    if (!profile || effectivePlan !== 'trial') return 0;
    const end = new Date(profile.trial_ends);
    const now = new Date();
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  }, [profile, effectivePlan]);

  const isTrialActive = effectivePlan === 'trial';
  const isTrialExpired = effectivePlan === 'expired';
  const isPaid = effectivePlan === 'pro' || effectivePlan === 'team';

  // ── Gating checks ──────────────────────────────────────────
  const canCreateProject = useMemo(() => {
    return projectCount < limits.maxProjects;
  }, [projectCount, limits]);

  const canUseAiReport = useMemo(() => {
    if (!profile) return false;
    return (profile.ai_reports_used || 0) < limits.aiReportsPerMonth;
  }, [profile, limits]);

  const aiReportsRemaining = useMemo(() => {
    if (!profile) return 0;
    return Math.max(0, limits.aiReportsPerMonth - (profile.ai_reports_used || 0));
  }, [profile, limits]);

  const canExport = limits.canExport;
  const canBaseline = limits.canBaseline;

  const getTaskLimit = useCallback(() => {
    return limits.maxTasksPerProject;
  }, [limits]);

  // ── Actions ────────────────────────────────────────────────
  const incrementAiReports = useCallback(async () => {
    if (!user || !profile) return false;

    const newCount = (profile.ai_reports_used || 0) + 1;

    const { error } = await supabase
      .from('user_profiles')
      .update({
        ai_reports_used: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (!error) {
      setProfile(prev => ({ ...prev, ai_reports_used: newCount }));
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
    loading,
    effectivePlan,
    limits,
    projectCount,

    // Trial info
    isTrialActive,
    isTrialExpired,
    isPaid,
    trialDaysLeft,

    // Gating booleans
    canCreateProject,
    canUseAiReport,
    canExport,
    canBaseline,
    aiReportsRemaining,
    getTaskLimit,

    // Actions
    incrementAiReports,
    refreshProjectCount,
    refreshProfile,
  }), [
    profile, loading, effectivePlan, limits, projectCount,
    isTrialActive, isTrialExpired, isPaid, trialDaysLeft,
    canCreateProject, canUseAiReport, canExport, canBaseline,
    aiReportsRemaining, getTaskLimit,
    incrementAiReports, refreshProjectCount, refreshProfile,
  ]);

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
};
