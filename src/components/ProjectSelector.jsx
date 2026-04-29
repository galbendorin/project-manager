import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePlan } from '../contexts/PlanContext';
import { buildDemoProjectPayload } from '../utils/demoProjectBuilder';
import { createEmptyProjectSnapshot } from '../hooks/projectData/defaults';
import AuthenticatedFooter from './AuthenticatedFooter';
import ProjectShareModal from './ProjectShareModal';
import PmWorkspaceLogo from './PmWorkspaceLogo';
import AccentThemePicker from './AccentThemePicker';
import {
  normalizeProjectRecord,
  summarizeProjectAccess,
} from '../utils/projectSharing';
import { createProjectWithLimits, getProjectCreationErrorMessage } from '../utils/projectCreation';

const isMissingColumnError = (error, columnName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes(columnName.toLowerCase()) && msg.includes('column');
};

const isMissingRelationError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes(relationName.toLowerCase()) && (msg.includes('relation') || msg.includes('relationship'));
};

const isRowLevelSecurityError = (error, tableName = '') => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes('row-level security')
    && (!tableName || msg.includes(tableName.toLowerCase()));
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getFriendlyProjectCreateErrorMessage = (error) => {
  if (isRowLevelSecurityError(error, 'projects')) {
    return 'We could not create the project right away. Refresh once and try again.';
  }
  return getProjectCreationErrorMessage(error);
};

const ProjectSelector = ({ onSelectProject, onOpenBaby, onOpenHabits, onOpenMeals, onOpenTrack, onOpenShopping, accentTheme, onAccentThemeChange }) => {
  const { user, signOut } = useAuth();
  const { canCreateProject, limits, householdToolsEnabled, isReadOnly, refreshProjectCount } = usePlan();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading projects...');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingSample, setCreatingSample] = useState(false);
  const [createError, setCreateError] = useState('');
  const [sampleProjectError, setSampleProjectError] = useState('');
  const [shareProjectId, setShareProjectId] = useState(null);
  const supportsIsDemoRef = useRef(true);
  const supportsProjectMembersRef = useRef(true);
  const inputRef = useRef(null);

  const normalizeProject = useCallback((project) => normalizeProjectRecord(project, user?.id), [user?.id]);

  const accessSummary = useMemo(() => summarizeProjectAccess(projects, user?.id), [projects, user?.id]);
  const ownedSampleProject = useMemo(
    () => projects.find((project) => project.isOwned && project.is_demo) || null,
    [projects]
  );
  const showInternalLaunchCards = householdToolsEnabled;
  const shareProject = useMemo(
    () => projects.find((project) => project.id === shareProjectId) || null,
    [projects, shareProjectId]
  );

  const createProjectRecord = useCallback(async (payload, includeIsDemo = supportsIsDemoRef.current) => {
    const snapshot = {
      tasks: payload?.tasks || [],
      registers: payload?.registers || {},
      tracker: payload?.tracker || [],
      status_report: payload?.status_report || {},
      baseline: payload?.baseline ?? null,
    };

    const { data, error } = await createProjectWithLimits({
      projectId: payload?.id || null,
      name: payload?.name || '',
      snapshot,
      isDemo: includeIsDemo ? Boolean(payload?.is_demo) : false,
    });

    if (error || !data) {
      return { data: null, error: error || new Error('Project create failed') };
    }
    return { data: normalizeProject(data), error: null };
  }, [normalizeProject]);

  const createSampleProject = useCallback(async () => {
    if (!user?.id || ownedSampleProject || creatingSample) return;

    if (!canCreateProject) {
      setSampleProjectError(`Your ${limits.label} plan allows ${limits.maxProjects} project${limits.maxProjects !== 1 ? 's' : ''}. Upgrade to Pro for more.`);
      return;
    }

    setSampleProjectError('');
    setCreatingSample(true);

    const demoPayload = buildDemoProjectPayload({
      anchorDate: user?.created_at,
      startOffsetDays: 0
    });
    const { data, error } = await createProjectRecord({
      user_id: user.id,
      name: 'Network Transformation Sample',
      tasks: demoPayload.tasks,
      registers: demoPayload.registers,
      tracker: demoPayload.tracker,
      status_report: demoPayload.status_report,
      baseline: demoPayload.baseline,
      is_demo: true
    });

    if (!error && data) {
      refreshProjectCount();
      onSelectProject(data);
      setCreatingSample(false);
      return;
    }

    setSampleProjectError(getFriendlyProjectCreateErrorMessage(error));
    setCreatingSample(false);
  }, [
    canCreateProject,
    createProjectRecord,
    creatingSample,
    limits.label,
    limits.maxProjects,
    onSelectProject,
    ownedSampleProject,
    refreshProjectCount,
    user?.created_at,
    user?.id,
  ]);

  const runProjectQuery = useCallback(async (includeIsDemo, includeMembers) => {
    const selectParts = [
      'id',
      'user_id',
      'name',
      includeIsDemo ? 'is_demo' : null,
      'created_at',
      'updated_at',
      includeMembers
        ? 'project_members(id, user_id, member_email, role, invited_by_user_id, created_at)'
        : null
    ].filter(Boolean);

    return supabase
      .from('projects')
      .select(selectParts.join(', '))
      .order('updated_at', { ascending: false });
  }, []);

  const queryProjects = useCallback(async () => {
    let includeIsDemo = supportsIsDemoRef.current;
    let includeMembers = supportsProjectMembersRef.current;
    let data = null;
    let error = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await runProjectQuery(includeIsDemo, includeMembers);
      data = response.data;
      error = response.error;

      if (!error) {
        break;
      }

      let shouldRetry = false;

      if (includeMembers && isMissingRelationError(error, 'project_members')) {
        supportsProjectMembersRef.current = false;
        includeMembers = false;
        shouldRetry = true;
      }

      if (includeIsDemo && isMissingColumnError(error, 'is_demo')) {
        supportsIsDemoRef.current = false;
        includeIsDemo = false;
        shouldRetry = true;
      }

      if (!shouldRetry) {
        break;
      }
    }

    return { data, error };
  }, [runProjectQuery]);

  const fetchProjects = useCallback(async (isRetry = false) => {
    if (!user?.id) return;

    if (!isRetry) {
      setLoading(true);
      setLoadingMessage('Loading projects...');
    }

    let { data, error } = await queryProjects();

    // Cold start retry: if we get an error or null data, wait and try once more
    if ((error || !data) && !isRetry) {
      console.warn('First fetch failed (likely cold start), retrying in 3s...');
      setLoadingMessage('Waking up the database...');
      await sleep(3000);
      const retry = await queryProjects();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Failed to fetch projects:', error);
      setProjects([]);
      setLoading(false);
      return;
    }

    let nextProjects = (data || []).map(normalizeProject);

    setProjects(nextProjects);
    setLoading(false);
  }, [normalizeProject, queryProjects, user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
    }
  }, [fetchProjects, user?.id]);

  useEffect(() => {
    setShareProjectId((currentId) => (
      currentId && projects.some((project) => project.id === currentId) ? currentId : null
    ));
  }, [projects]);

  // Bug A fix: use a separate handler that doesn't trigger re-renders during typing
  const handleNameChange = useCallback((e) => {
    if (createError) setCreateError('');
    setNewProjectName(e.target.value);
  }, [createError]);

  const handleCreateSubmit = useCallback(async (e) => {
    // Prevent form submission default (avoids page reload on mobile)
    if (e) e.preventDefault();

    const name = newProjectName.trim();
    if (!name || creating) return;

    // Check project limit
    if (!canCreateProject) {
      setCreateError(`Your ${limits.label} plan allows ${limits.maxProjects} project${limits.maxProjects !== 1 ? 's' : ''}. Upgrade to Pro for more.`);
      return;
    }

    setCreateError('');
    setCreating(true);

    const emptyProjectSnapshot = createEmptyProjectSnapshot();
    const { data, error } = await createProjectRecord({
      user_id: user.id,
      name: name,
      ...emptyProjectSnapshot,
      is_demo: false
    });

    if (!error && data) {
      setNewProjectName('');
      refreshProjectCount();
      onSelectProject(data);
    } else {
      // If create failed, keep the name and re-focus input
      setCreateError(getFriendlyProjectCreateErrorMessage(error));
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
    setCreating(false);
  }, [newProjectName, creating, createProjectRecord, user?.id, onSelectProject, canCreateProject, limits, refreshProjectCount]);

  const deleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;

    await supabase.from('projects').delete().eq('id', projectId).eq('user_id', user.id);
    refreshProjectCount();
    fetchProjects();
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="pm-accent-scope min-h-screen pm-shell-bg flex flex-col">
      <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="pm-workspace-panel rounded-[30px] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="pm-kicker">Workspace</p>
                    <PmWorkspaceLogo size="sm" />
                    <h1 className="mt-4 truncate text-[1.55rem] font-bold tracking-[-0.04em] text-slate-950">Your projects</h1>
                    <p className="mt-1 truncate text-sm text-slate-500">{user.email}</p>
                    <p className="mt-3 max-w-[22rem] text-sm leading-6 text-slate-500">
                      Keep projects, shared work, and weekly time in one calmer workspace.
                    </p>
                  </div>
                  <div className="hidden rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-500 shadow-sm lg:block">
                    {limits.label}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="pm-metric-card rounded-2xl px-4 py-3">
                    <div className="pm-kicker">Owned</div>
                    <div className="mt-1 text-2xl font-bold text-slate-950">
                      {accessSummary.ownedCount}
                      <span className="ml-1 text-sm font-medium text-slate-400">
                        / {limits.maxProjects === 999 ? '∞' : limits.maxProjects}
                      </span>
                    </div>
                  </div>
                  <div className="pm-metric-card rounded-2xl px-4 py-3">
                    <div className="pm-kicker">Shared</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-2xl font-bold text-slate-950">{accessSummary.sharedCount}</span>
                      <span className="text-xs font-medium text-slate-500">projects visible to you</span>
                    </div>
                  </div>
                </div>

                {onAccentThemeChange && (
                  <div className="pm-surface-soft mt-5 rounded-[24px] px-4 py-4">
                    <AccentThemePicker
                      value={accentTheme}
                      onChange={onAccentThemeChange}
                      mode="inline"
                    />
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card mt-5 hidden rounded-[28px] p-5 lg:block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker">Meal Planner</p>
                        <h2 className="mt-2 text-[1.5rem] font-bold tracking-[-0.04em] text-slate-950">Plan meals</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Build a Monday-to-Sunday meal plan, reuse recipes, and turn the week into one grocery draft.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenMeals}
                        className="pm-subtle-button shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Weekly planner
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Recipe library
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Shopping draft
                      </span>
                    </div>
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card mt-5 hidden rounded-[28px] p-5 lg:block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker">Shopping List</p>
                        <h2 className="mt-2 text-[1.5rem] font-bold tracking-[-0.04em] text-slate-950">Share groceries</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Keep one simple grocery list you can share with your household and update by voice.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenShopping}
                        className="pm-subtle-button shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Shared list
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Voice add
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Groceries
                      </span>
                    </div>
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card mt-5 hidden rounded-[28px] p-5 lg:block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker">Baby</p>
                        <h2 className="mt-2 text-[1.5rem] font-bold tracking-[-0.04em] text-slate-950">Track care</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Log feeds, nappies, sleep, and weight in one shared household dashboard.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenBaby}
                        className="pm-subtle-button shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Feeds
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Nappies
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Sleep grid
                      </span>
                    </div>
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card mt-5 hidden rounded-[28px] p-5 lg:block">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker">Habits</p>
                        <h2 className="mt-2 text-[1.5rem] font-bold tracking-[-0.04em] text-slate-950">Track habits</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Mark daily behaviours, review trends, and keep lightweight journal notes.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenHabits}
                        className="pm-subtle-button shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Journal
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Trends
                      </span>
                      <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                        Notes
                      </span>
                    </div>
                  </div>
                )}

                <div className="pm-utility-card mt-5 hidden rounded-[28px] p-5 lg:block">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="pm-kicker">Timesheets</p>
                      <h2 className="mt-2 text-[1.5rem] font-bold tracking-[-0.04em] text-slate-950">Log hours</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Track time across owned and shared work without leaving the workspace.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenTrack}
                      className="pm-subtle-button shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition"
                    >
                      Open
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                      Weekly view
                    </span>
                    <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                      Owned + shared
                    </span>
                    <span className="pm-utility-chip rounded-full px-2.5 py-1 text-[11px] font-medium">
                      Excel export
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-w-0">
              <div className="pm-home-panel rounded-[30px] p-5 sm:p-6">
                <div className="hidden lg:flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="pm-kicker">Project home</p>
                    <h2 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950">Projects</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Create a workspace project, open shared work, and keep active projects close at hand.
                    </p>
                  </div>

                  <button
                    onClick={signOut}
                    className="pm-subtle-button hidden lg:inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors"
                  >
                    Sign Out
                  </button>
                </div>

                {accessSummary.ownedCount === 0 && accessSummary.sharedCount > 0 && (
                  <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm">
                    You have shared access to {accessSummary.sharedCount} project{accessSummary.sharedCount === 1 ? '' : 's'}. You can collaborate there and still create your own personal workspace projects below.
                  </div>
                )}

                <div className="mt-5 hidden flex-col gap-3 lg:flex lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-sm text-slate-500">
                    Owned {accessSummary.ownedCount} of {limits.maxProjects === 999 ? '∞' : limits.maxProjects}
                    {accessSummary.sharedCount > 0 ? ` · ${accessSummary.sharedCount} shared` : ''}
                  </div>
                  {!canCreateProject && (
                    <button
                      onClick={() => window.open('/pricing', '_blank')}
                      className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Upgrade to Pro →
                    </button>
                  )}
                </div>

                {isReadOnly && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <p className="text-sm font-medium text-amber-800">Read-only mode</p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      Your {limits.label} plan allows {limits.maxProjects} project{limits.maxProjects !== 1 ? 's' : ''}. Delete extra projects to regain edit access, or upgrade.
                    </p>
                    <button
                      onClick={() => window.open('/pricing', '_blank')}
                      className="pm-toolbar-primary mt-3 rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors"
                    >
                      Upgrade to Pro — £7.99/mo
                    </button>
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card rounded-[22px] px-3.5 py-3 lg:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker mb-1">Meal Planner</p>
                        <h2 className="truncate text-base font-semibold text-slate-900">Plan meals</h2>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenMeals}
                        className="pm-subtle-button shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card mt-3 rounded-[22px] px-3.5 py-3 lg:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker mb-1">Shopping List</p>
                        <h2 className="truncate text-base font-semibold text-slate-900">Share groceries</h2>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenShopping}
                        className="pm-subtle-button shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card mt-3 rounded-[22px] px-3.5 py-3 lg:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker mb-1">Baby</p>
                        <h2 className="truncate text-base font-semibold text-slate-900">Track care</h2>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenBaby}
                        className="pm-subtle-button shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                )}

                {showInternalLaunchCards && (
                  <div className="pm-utility-card mt-3 rounded-[22px] px-3.5 py-3 lg:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pm-kicker mb-1">Habits</p>
                        <h2 className="truncate text-base font-semibold text-slate-900">Track habits</h2>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenHabits}
                        className="pm-subtle-button shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                )}

                <div className="pm-utility-card mt-3 rounded-[22px] px-3.5 py-3 lg:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="pm-kicker mb-1">Timesheets</p>
                      <h2 className="truncate text-base font-semibold text-slate-900">Log hours</h2>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenTrack}
                      className="pm-subtle-button shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
                    >
                      Open
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={handleCreateSubmit}
                  className="pm-surface-soft mt-5 rounded-[28px] p-4 sm:p-5"
                >
                  <div className="mb-4">
                    <p className="pm-kicker">Create project</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Start a new workspace</h3>
                    <p className="mt-1 text-sm text-slate-500">Add a project and keep it ready for planning, logs, and reporting.</p>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-end">
                    <div className="min-w-0 flex-1">
                      <input
                        ref={inputRef}
                        type="text"
                        value={newProjectName}
                        onChange={handleNameChange}
                        placeholder="New project name..."
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                        enterKeyHint="go"
                        className="pm-input w-full rounded-2xl px-4 py-3 text-base text-slate-900 placeholder-slate-400 sm:text-sm"
                      />
                    </div>
                    <div className="md:self-end">
                      <button
                        type="submit"
                        disabled={creating || !newProjectName.trim() || !canCreateProject}
                        className="pm-toolbar-primary w-full rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:bg-slate-200 disabled:text-slate-400 md:w-auto"
                      >
                        {!canCreateProject ? 'Limit reached' : creating ? '...' : '+ Create'}
                      </button>
                    </div>
                  </div>
                  {createError && (
                    <p className="mt-3 text-xs text-rose-600">{createError}</p>
                  )}
                </form>

                <div className="pm-surface-soft mt-4 rounded-[28px] p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="pm-kicker">Optional sample</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Explore a sample project</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Load a ready-made workspace with schedule, RAID, tracker, and reporting data. It counts as one project and you can delete it any time.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void createSampleProject()}
                      disabled={creatingSample || ownedSampleProject || !canCreateProject}
                      className="pm-subtle-button shrink-0 rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ownedSampleProject ? 'Sample added' : creatingSample ? 'Adding sample...' : '+ Add sample project'}
                    </button>
                  </div>
                  {sampleProjectError && (
                    <p className="mt-3 text-xs text-rose-600">{sampleProjectError}</p>
                  )}
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="pm-kicker text-sm">Projects</h3>
                    <span className="text-xs text-slate-400">{loading ? loadingMessage : `${projects.length} visible`}</span>
                  </div>

                  <div className="pm-list-shell space-y-3 rounded-[28px] p-3 sm:p-4">
                    {loading ? (
                      <div className="pm-surface-card text-center py-12 rounded-[24px] shadow-sm">
                        <div className="inline-block w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" style={{ borderWidth: '3px' }}></div>
                        <p className="text-slate-500 text-sm">{loadingMessage}</p>
                      </div>
                    ) : projects.length === 0 ? (
                      <div className="pm-surface-card text-center py-12 rounded-[24px] shadow-sm">
                        <div className="text-4xl mb-3">📋</div>
                        <p className="text-slate-700 font-medium mb-1">Your workspace is ready for its first project</p>
                        <p className="text-slate-400 text-sm">Create a project above or add the sample project to explore the workspace.</p>
                      </div>
                    ) : (
                      projects.map((project) => (
                        <div
                          key={project.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectProject(project)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectProject(project);
                            }
                          }}
                          className="w-full text-left rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-slate-50 group cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="truncate text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                  {project.name}
                                </h4>
                                {project.is_demo && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-200 text-indigo-600 bg-indigo-50 font-semibold">
                                    Sample
                                  </span>
                                )}
                                {project.isSharedWithMe && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-200 text-emerald-700 bg-emerald-50 font-semibold">
                                    Shared with you
                                  </span>
                                )}
                                {project.isSharedByMe && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-sky-200 text-sky-700 bg-sky-50 font-semibold">
                                    Shared
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-slate-400">
                                Last updated: {formatDate(project.updated_at)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {supportsProjectMembersRef.current && project.isOwned && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShareProjectId(project.id);
                                  }}
                                  className="pm-subtle-button rounded-full px-3 py-1.5 text-xs font-semibold transition"
                                  title="Share project"
                                  type="button"
                                >
                                  Share
                                </button>
                              )}
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition group-hover:border-violet-200 group-hover:text-violet-700">
                                Open
                              </span>
                              {project.isOwned && (
                                <button
                                  onClick={(e) => deleteProject(project.id, e)}
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-1 transition-all"
                                  title="Delete project"
                                  type="button"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-6 lg:hidden">
                  <button
                    onClick={signOut}
                    className="pm-subtle-button inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
      <AuthenticatedFooter className="mt-auto" />
      <ProjectShareModal
        isOpen={Boolean(shareProject)}
        project={shareProject}
        onClose={() => setShareProjectId(null)}
        onMembershipChanged={fetchProjects}
      />
    </div>
  );
};

export default ProjectSelector;
