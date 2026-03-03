import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { buildDemoProjectPayload } from '../utils/demoProjectBuilder';
import { createEmptyProjectSnapshot } from '../hooks/projectData/defaults';

const isMissingColumnError = (error, columnName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes(columnName.toLowerCase()) && msg.includes('column');
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ProjectSelector = ({ onSelectProject }) => {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading projects...');
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const supportsIsDemoRef = useRef(true);
  const isSeedingDemoRef = useRef(false);
  const inputRef = useRef(null);

  const normalizeProject = useCallback((project) => ({
    ...project,
    is_demo: !!project?.is_demo
  }), []);

  const createProjectRecord = useCallback(async (payload, includeIsDemo = supportsIsDemoRef.current) => {
    const selectCols = includeIsDemo
      ? 'id, name, is_demo, created_at, updated_at'
      : 'id, name, created_at, updated_at';

    const insertPayload = includeIsDemo
      ? payload
      : Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'is_demo'));

    let { data, error } = await supabase
      .from('projects')
      .insert(insertPayload)
      .select(selectCols)
      .single();

    if (error && includeIsDemo && isMissingColumnError(error, 'is_demo')) {
      supportsIsDemoRef.current = false;
      const retry = await supabase
        .from('projects')
        .insert(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'is_demo')))
        .select('id, name, created_at, updated_at')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      return { data: null, error: error || new Error('Project create failed') };
    }
    return { data: normalizeProject(data), error: null };
  }, [normalizeProject]);

  const seedDemoProject = useCallback(async (retriesLeft = 2) => {
    const demoPayload = buildDemoProjectPayload();
    const { data, error } = await createProjectRecord({
      user_id: user.id,
      name: 'SD-WAN Demo',
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
    return data;
  }, [createProjectRecord, user.id]);

  const queryProjects = useCallback(async () => {
    const primarySelect = supportsIsDemoRef.current
      ? 'id, name, is_demo, created_at, updated_at'
      : 'id, name, created_at, updated_at';

    let { data, error } = await supabase
      .from('projects')
      .select(primarySelect)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error && supportsIsDemoRef.current && isMissingColumnError(error, 'is_demo')) {
      supportsIsDemoRef.current = false;
      const fallback = await supabase
        .from('projects')
        .select('id, name, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    return { data, error };
  }, [user?.id]);

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

    if (nextProjects.length === 0 && !isSeedingDemoRef.current) {
      isSeedingDemoRef.current = true;
      setLoadingMessage('Setting up your workspace...');
      const seeded = await seedDemoProject();
      isSeedingDemoRef.current = false;
      if (seeded) {
        nextProjects = [seeded];
      }
    }

    setProjects(nextProjects);
    setLoading(false);
  }, [normalizeProject, queryProjects, seedDemoProject, user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
    }
  }, [fetchProjects, user?.id]);

  // Bug A fix: use a separate handler that doesn't trigger re-renders during typing
  const handleNameChange = useCallback((e) => {
    setNewProjectName(e.target.value);
  }, []);

  const handleCreateSubmit = useCallback(async (e) => {
    // Prevent form submission default (avoids page reload on mobile)
    if (e) e.preventDefault();

    const name = newProjectName.trim();
    if (!name || creating) return;

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
      onSelectProject(data);
    } else {
      // If create failed, keep the name and re-focus input
      setCreating(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
    setCreating(false);
  }, [newProjectName, creating, createProjectRecord, user?.id, onSelectProject]);

  const deleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;

    await supabase.from('projects').delete().eq('id', projectId).eq('user_id', user.id);
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
              className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
            <button
              type="submit"
              disabled={creating || !newProjectName.trim()}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium rounded-lg transition-colors whitespace-nowrap text-sm"
            >
              {creating ? '...' : '+ Create'}
            </button>
          </div>
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
                    </div>
                    <p className="text-slate-400 text-xs mt-1">
                      Last updated: {formatDate(project.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 group-hover:text-indigo-500 text-sm">Open →</span>
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
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectSelector;
