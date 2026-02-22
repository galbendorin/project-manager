import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_STATUS_REPORT } from '../utils/constants';
import { buildDemoProjectPayload } from '../utils/demoProjectBuilder';

const createEmptyRegisters = () => ({
  risks: [],
  issues: [],
  actions: [],
  minutes: [],
  costs: [],
  changes: [],
  comms: []
});

const isMissingColumnError = (error, columnName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes(columnName.toLowerCase()) && msg.includes('column');
};

const ProjectSelector = ({ onSelectProject }) => {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const supportsIsDemoRef = useRef(true);
  const isSeedingDemoRef = useRef(false);

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

    const { data, error } = await createProjectRecord({
      user_id: user.id,
      name: newProjectName.trim(),
      tasks: [],
      registers: createEmptyRegisters(),
      tracker: [],
      status_report: { ...DEFAULT_STATUS_REPORT },
      baseline: null,
      is_demo: false
    });

    if (!error && data) {
      onSelectProject(data);
    }
    setCreating(false);
    setNewProjectName('');
  };

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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Your Projects</h1>
            <p className="text-gray-400 text-sm mt-1">{user.email}</p>
          </div>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-white px-3 py-1.5 border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
          >
            Sign Out
          </button>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
              placeholder="New project name..."
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={createProject}
              disabled={creating || !newProjectName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              {creating ? '...' : '+ Create'}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="text-center text-gray-500 py-8 bg-gray-800 rounded-xl border border-gray-700">
              <p className="text-lg mb-1">No projects yet</p>
              <p className="text-sm">Create your first project above</p>
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
                className="w-full text-left bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-xl p-4 transition-colors group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">
                        {project.name}
                      </h3>
                      {project.is_demo && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 font-semibold">
                          Demo
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-1">
                      Last updated: {formatDate(project.updated_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 group-hover:text-gray-400 text-sm">Open →</span>
                    <button
                      onClick={(e) => deleteProject(project.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-1 transition-all"
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
