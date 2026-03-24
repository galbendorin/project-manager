import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePlan } from '../contexts/PlanContext';
import { buildDemoProjectPayload } from '../utils/demoProjectBuilder';
import { createEmptyProjectSnapshot } from '../hooks/projectData/defaults';
import ProjectShareModal from './ProjectShareModal';
import {
  countOwnedProjects,
  normalizeProjectRecord,
  shouldSeedDemoProject,
  summarizeProjectAccess,
} from '../utils/projectSharing';

const DEMO_SEED_FLAG = 'default_demo_seed_v1';

const getLocalDemoSeedKey = (userId) => `pm_demo_seeded_${userId || 'anonymous'}`;

const readLocalDemoSeedFlag = (userId) => {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(getLocalDemoSeedKey(userId)) === '1';
  } catch {
    return false;
  }
};

const writeLocalDemoSeedFlag = (userId) => {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getLocalDemoSeedKey(userId), '1');
  } catch {
    // Ignore localStorage write failures.
  }
};

const isMissingColumnError = (error, columnName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes(columnName.toLowerCase()) && msg.includes('column');
};

const extractMissingColumnName = (error) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`;
  const schemaCacheMatch = msg.match(/could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];

  const relationMatch = msg.match(/column ["']?([a-zA-Z0-9_]+)["']?[^.]*does not exist/i);
  if (relationMatch?.[1]) return relationMatch[1];

  return null;
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

const generateProjectId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return '';
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ProjectSelector = ({ onSelectProject }) => {
  const { user, signOut } = useAuth();
  const { canCreateProject, limits, isReadOnly, refreshProjectCount } = usePlan();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading projects...');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [shareProjectId, setShareProjectId] = useState(null);
  const supportsIsDemoRef = useRef(true);
  const supportsProjectMembersRef = useRef(true);
  const isSeedingDemoRef = useRef(false);
  const demoSeededRef = useRef(
    Boolean(user?.user_metadata?.[DEMO_SEED_FLAG]) || readLocalDemoSeedFlag(user?.id)
  );
  const inputRef = useRef(null);

  useEffect(() => {
    demoSeededRef.current = Boolean(user?.user_metadata?.[DEMO_SEED_FLAG]) || readLocalDemoSeedFlag(user?.id);
  }, [user?.id, user?.user_metadata]);

  const normalizeProject = useCallback((project) => normalizeProjectRecord(project, user?.id), [user?.id]);

  const accessSummary = useMemo(() => summarizeProjectAccess(projects, user?.id), [projects, user?.id]);
  const shareProject = useMemo(
    () => projects.find((project) => project.id === shareProjectId) || null,
    [projects, shareProjectId]
  );

  const createProjectRecord = useCallback(async (payload, includeIsDemo = supportsIsDemoRef.current) => {
    const selectCols = includeIsDemo
      ? 'id, user_id, name, is_demo, created_at, updated_at'
      : 'id, user_id, name, created_at, updated_at';

    const baseInsertPayload = includeIsDemo
      ? payload
      : Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'is_demo'));
    const generatedProjectId = baseInsertPayload.id || generateProjectId();
    const insertPayload = generatedProjectId
      ? {
          id: generatedProjectId,
          ...baseInsertPayload
        }
      : baseInsertPayload;

    const insertProjectWithFetchFallback = async (projectPayload, projectSelectCols, expectsIsDemo) => {
      let { data, error } = await supabase
        .from('projects')
        .insert(projectPayload)
        .select(projectSelectCols)
        .single();

      if (!error || !projectPayload.id || !isRowLevelSecurityError(error, 'projects')) {
        return { data, error };
      }

      const { error: insertError } = await supabase
        .from('projects')
        .insert(projectPayload);

      const insertSucceededOrAlreadyExists = !insertError || insertError.code === '23505';
      if (!insertSucceededOrAlreadyExists) {
        return { data: null, error: insertError };
      }

      const fetchResult = await supabase
        .from('projects')
        .select(projectSelectCols)
        .eq('id', projectPayload.id)
        .single();

      if (!fetchResult.error && fetchResult.data) {
        return fetchResult;
      }

      if (fetchResult.error && insertError?.code === '23505') {
        return { data: null, error: fetchResult.error };
      }

      const optimisticTimestamp = new Date().toISOString();
      return {
        data: {
          id: projectPayload.id,
          user_id: projectPayload.user_id,
          name: projectPayload.name || '',
          is_demo: expectsIsDemo ? Boolean(projectPayload.is_demo) : false,
          created_at: optimisticTimestamp,
          updated_at: optimisticTimestamp
        },
        error: null
      };
    };

    let { data, error } = await insertProjectWithFetchFallback(insertPayload, selectCols, includeIsDemo);

    if (error && includeIsDemo && isMissingColumnError(error, 'is_demo')) {
      supportsIsDemoRef.current = false;
      const retry = await insertProjectWithFetchFallback(
        Object.fromEntries(Object.entries(insertPayload).filter(([key]) => key !== 'is_demo')),
        'id, user_id, name, created_at, updated_at',
        false
      );
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const missingColumn = extractMissingColumnName(error);
      const canRetryWithoutColumn =
        missingColumn &&
        missingColumn !== 'is_demo' &&
        Object.prototype.hasOwnProperty.call(insertPayload, missingColumn);

      if (canRetryWithoutColumn) {
        const retryPayload = Object.fromEntries(
          Object.entries(insertPayload).filter(([key]) => key !== missingColumn)
        );
        const retry = await insertProjectWithFetchFallback(retryPayload, selectCols, includeIsDemo);
        data = retry.data;
        error = retry.error;
      }
    }

    if (error || !data) {
      return { data: null, error: error || new Error('Project create failed') };
    }
    return { data: normalizeProject(data), error: null };
  }, [normalizeProject]);

  const markDemoSeeded = useCallback(async () => {
    if (!user?.id || demoSeededRef.current) return;

    demoSeededRef.current = true;
    writeLocalDemoSeedFlag(user.id);

    const userMetadata = (user?.user_metadata && typeof user.user_metadata === 'object')
      ? user.user_metadata
      : {};
    if (userMetadata[DEMO_SEED_FLAG]) return;

    const { error } = await supabase.auth.updateUser({
      data: {
        ...userMetadata,
        [DEMO_SEED_FLAG]: true
      }
    });

    if (error) {
      console.warn('Failed to persist demo-seeded flag in auth metadata:', error);
    }
  }, [user?.id, user?.user_metadata]);

  const seedDemoProject = useCallback(async (retriesLeft = 2) => {
    const demoPayload = buildDemoProjectPayload({
      anchorDate: user?.created_at,
      startOffsetDays: 0
    });
    const { data, error } = await createProjectRecord({
      user_id: user.id,
      name: 'Network Transformation Demo',
      tasks: demoPayload.tasks,
      registers: demoPayload.registers,
      tracker: demoPayload.tracker,
      status_report: demoPayload.status_report,
      baseline: demoPayload.baseline,
      is_demo: true
    });

    if (error) {
      console.error('Failed to auto-seed demo project:', error);
      if (retriesLeft > 0) {
        setLoadingMessage('Setting up your workspace...');
        await sleep(3000);
        return seedDemoProject(retriesLeft - 1);
      }
      return null;
    }
    await markDemoSeeded();
    return data;
  }, [createProjectRecord, markDemoSeeded, user.id, user?.created_at]);

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

    const ownedProjectCount = countOwnedProjects(nextProjects, user.id);
    const hasOwnedProjects = ownedProjectCount > 0;

    if (hasOwnedProjects && !demoSeededRef.current) {
      markDemoSeeded();
    }

    if (
      shouldSeedDemoProject({
        projects: nextProjects,
        currentUserId: user.id,
        demoSeeded: demoSeededRef.current,
      })
      && !isSeedingDemoRef.current
    ) {
      isSeedingDemoRef.current = true;
      setLoadingMessage('Setting up your workspace...');
      const seeded = await seedDemoProject();
      isSeedingDemoRef.current = false;
      if (seeded) {
        nextProjects = [seeded, ...nextProjects];
      }
    }

    setProjects(nextProjects);
    setLoading(false);
  }, [markDemoSeeded, normalizeProject, queryProjects, seedDemoProject, user?.id]);

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
      markDemoSeeded();
      refreshProjectCount();
      onSelectProject(data);
    } else {
      // If create failed, keep the name and re-focus input
      setCreateError(error?.message || 'Unable to create project. Please try again.');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
    setCreating(false);
  }, [newProjectName, creating, createProjectRecord, markDemoSeeded, user?.id, onSelectProject, canCreateProject, limits, refreshProjectCount]);

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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-200">
              P
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Your Projects</h1>
              <p className="text-slate-500 text-xs">{user.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5 border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-white transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Project count and plan info */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs text-slate-500">
            Owned {accessSummary.ownedCount} of {limits.maxProjects === 999 ? '∞' : limits.maxProjects}
            {accessSummary.sharedCount > 0 ? ` · ${accessSummary.sharedCount} shared` : ''}
            <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
              {limits.label}
            </span>
          </span>
          {!canCreateProject && (
            <button
              onClick={() => window.open('/pricing', '_blank')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Upgrade to Pro →
            </button>
          )}
        </div>

        {/* Read-only warning for downgraded users */}
        {isReadOnly && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm font-medium text-amber-800 mb-1">⚠️ Read-only mode</p>
            <p className="text-xs text-amber-600 mb-3">
              Your {limits.label} plan allows {limits.maxProjects} project{limits.maxProjects !== 1 ? 's' : ''}. Delete extra projects to regain edit access, or upgrade.
            </p>
            <button
              onClick={() => window.open('/pricing', '_blank')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              Upgrade to Pro — £7.99/mo
            </button>
          </div>
        )}

        {/* Bug A fix: Wrap input in a <form> so mobile keyboard "Go" button works properly */}
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4"
        >
          <div className="flex gap-2">
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
              className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base sm:text-sm"
            />
            <button
              type="submit"
              disabled={creating || !newProjectName.trim() || !canCreateProject}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-lg transition-colors whitespace-nowrap text-sm"
            >
              {!canCreateProject ? 'Limit reached' : creating ? '...' : '+ Create'}
            </button>
          </div>
          {createError && (
            <p className="mt-2 text-xs text-rose-600">{createError}</p>
          )}
        </form>

        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="inline-block w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" style={{ borderWidth: '3px' }}></div>
              <p className="text-slate-500 text-sm">{loadingMessage}</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-700 font-medium mb-1">No projects yet</p>
              <p className="text-slate-400 text-sm">Create your first project above</p>
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
                className="w-full text-left bg-white hover:bg-slate-50 border border-slate-200 hover:border-indigo-200 rounded-xl p-4 transition-colors group cursor-pointer shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-slate-900 font-medium group-hover:text-indigo-600 transition-colors">
                        {project.name}
                      </h3>
                      {project.is_demo && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-600 bg-indigo-50 font-semibold">
                          Demo
                        </span>
                      )}
                      {project.isSharedWithMe && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 bg-emerald-50 font-semibold">
                          Shared with you
                        </span>
                      )}
                      {project.isSharedByMe && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 text-sky-700 bg-sky-50 font-semibold">
                          Shared
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs mt-1">
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
                        className="text-xs font-semibold text-slate-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                        title="Share project"
                        type="button"
                      >
                        Share
                      </button>
                    )}
                    <span className="text-slate-400 group-hover:text-indigo-500 text-sm">Open →</span>
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
