import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { buildDemoProjectPayload } from '../utils/demoProjectBuilder';
import { createEmptyProjectSnapshot } from '../hooks/projectData/defaults';

const isMissingColumnError = (error, columnName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes(columnName.toLowerCase()) && msg.includes('column');
};

// ── Health stats helper ──────────────────────────────────────────────

const getProjectStats = (project) => {
  const tasks = Array.isArray(project.tasks) ? project.tasks : [];
  const total = tasks.length;
  if (total === 0) return { total: 0, completed: 0, inProgress: 0, pct: 0 };
  const completed = tasks.filter(t => t.pct === 100).length;
  const inProgress = tasks.filter(t => t.pct > 0 && t.pct < 100).length;
  const pct = Math.round(tasks.reduce((sum, t) => sum + (t.pct || 0), 0) / total);
  return { total, completed, inProgress, pct };
};

// ── Mini progress ring ───────────────────────────────────────────────

const ProgressRing = ({ pct, size = 44, strokeWidth = 4 }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? '#059669' : pct >= 50 ? '#4f46e5' : pct > 0 ? '#f59e0b' : '#cbd5e1';

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        className="text-[10px] font-bold" fill="#334155"
      >
        {pct}%
      </text>
    </svg>
  );
};

// ── Main Component ───────────────────────────────────────────────────

const ProjectSelector = ({ onSelectProject }) => {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const supportsIsDemoRef = useRef(true);
  const isSeedingDemoRef = useRef(false);

  const normalizeProject = useCallback((project) => ({
    ...project,
    is_demo: !!project?.is_demo
  }), []);

  const createProjectRecord = useCallback(async (payload, includeIsDemo = supportsIsDemoRef.current) => {
    const selectCols = includeIsDemo
      ? 'id, name, is_demo, tasks, created_at, updated_at'
      : 'id, name, tasks, created_at, updated_at';

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
        .select('id, name, tasks, created_at, updated_at')
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      return { data: null, error: error || new Error('Project create failed') };
    }
    return { data: normalizeProject(data), error: null };
  }, [normalizeProject]);

  const seedDemoProject = useCallback(async () => {
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
      return null;
    }
    return data;
  }, [createProjectRecord, user.id]);

  const fetchProjects = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    const primarySelect = supportsIsDemoRef.current
      ? 'id, name, is_demo, tasks, created_at, updated_at'
      : 'id, name, tasks, created_at, updated_at';

    let { data, error } = await supabase
      .from('projects')
      .select(primarySelect)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error && supportsIsDemoRef.current && isMissingColumnError(error, 'is_demo')) {
      supportsIsDemoRef.current = false;
      const fallback = await supabase
        .from('projects')
        .select('id, name, tasks, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      data = fallback.data;
      error = fallback.error;
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
      const seeded = await seedDemoProject();
      isSeedingDemoRef.current = false;
      if (seeded) {
        nextProjects = [seeded];
      }
    }

    setProjects(nextProjects);
    setLoading(false);
  }, [normalizeProject, seedDemoProject, user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchProjects();
    }
  }, [fetchProjects, user?.id]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);

    const emptyProjectSnapshot = createEmptyProjectSnapshot();
    const { data, error } = await createProjectRecord({
      user_id: user.id,
      name: newProjectName.trim(),
      ...emptyProjectSnapshot,
      is_demo: false
    });

    if (!error && data) {
      onSelectProject(data);
    }
    setCreating(false);
    setNewProjectName('');
  };

  const deleteProject = async (projectId) => {
    await supabase.from('projects').delete().eq('id', projectId).eq('user_id', user.id);
    setConfirmDelete(null);
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

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Decorative background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-100/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-100/30 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm shadow-indigo-200/50">
                P
              </div>
              <h1 className="text-xl font-bold text-slate-900">Your Projects</h1>
            </div>
            <p className="text-sm text-slate-500 ml-12">{user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="text-[13px] text-slate-500 hover:text-slate-700 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
          >
            Sign Out
          </button>
        </div>

        {/* Create project */}
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
              placeholder="New project name..."
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
            />
            <button
              onClick={createProject}
              disabled={creating || !newProjectName.trim()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-xl shadow-sm shadow-indigo-200/50 transition-all whitespace-nowrap"
            >
              {creating ? '...' : '+ Create'}
            </button>
          </div>
        </div>

        {/* Project list */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center gap-2 text-slate-400 text-sm">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading projects...
              </div>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200/60">
              <div className="text-3xl mb-3">📋</div>
              <p className="text-slate-700 font-medium mb-1">No projects yet</p>
              <p className="text-sm text-slate-400">Create your first project above</p>
            </div>
          ) : (
            projects.map((project) => {
              const stats = getProjectStats(project);
              return (
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
                  className="bg-white rounded-xl border border-slate-200/60 hover:border-indigo-200 hover:shadow-md hover:shadow-indigo-100/50 p-4 sm:p-5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-4">
                    {/* Progress ring */}
                    {stats.total > 0 && (
                      <ProgressRing pct={stats.pct} />
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[15px] font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                          {project.name}
                        </h3>
                        {project.is_demo && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-200 text-indigo-600 bg-indigo-50 font-semibold flex-shrink-0">
                            Demo
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[12px] text-slate-400">
                        <span>{timeAgo(project.updated_at)}</span>
                        {stats.total > 0 && (
                          <>
                            <span className="w-px h-3 bg-slate-200" />
                            <span>{stats.total} tasks</span>
                            <span className="w-px h-3 bg-slate-200" />
                            <span className="text-emerald-500">{stats.completed} done</span>
                            {stats.inProgress > 0 && (
                              <>
                                <span className="w-px h-3 bg-slate-200 hidden sm:block" />
                                <span className="text-indigo-500 hidden sm:block">{stats.inProgress} active</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[12px] text-slate-400 group-hover:text-indigo-500 transition-colors hidden sm:block">
                        Open →
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(confirmDelete === project.id ? null : project.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-all"
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

                  {/* Confirm delete */}
                  {confirmDelete === project.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[12px] text-rose-600 font-medium">Delete this project permanently?</span>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                          className="text-[11px] px-3 py-1.5 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                          className="text-[11px] px-3 py-1.5 text-white bg-rose-500 hover:bg-rose-600 rounded-lg transition-all"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectSelector;
