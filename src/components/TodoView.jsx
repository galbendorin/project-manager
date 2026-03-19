import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  filterBySearch,
  collectDerivedTodos,
  bucketByDeadline,
  formatDate,
  TODO_BUCKETS
} from '../utils/helpers';
import { IconTrash } from './Icons';
import { supabase } from '../lib/supabase';
import {
  getMultiFilterSummary,
  matchesBucketSelection,
  matchesOwnerSelection,
  matchesProjectSelection,
  matchesRecurrenceSelection,
  matchesSourceSelection,
  toggleMultiFilterValue,
} from '../utils/todoFilterUtils';

const STATUS_OPTIONS = ['Open', 'Done'];

const SOURCE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'derived', label: 'Derived' },
  { value: 'action', label: 'Action Log' },
  { value: 'issue', label: 'Issue Log' },
  { value: 'change', label: 'Change Log' },
  { value: 'tracker', label: 'Master Tracker' },
  { value: 'plan', label: 'Project Plan' }
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'One-time' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' }
];

const recurrenceLabel = (recurrence) => {
  const type = String(recurrence?.type || '').toLowerCase();
  if (!type) return 'One-time';
  if (type === 'weekdays') return 'Weekdays';
  if (type === 'weekly') return 'Weekly';
  if (type === 'monthly') return 'Monthly';
  if (type === 'yearly') return 'Yearly';
  return 'One-time';
};

const sourceFilterKeyForItem = (item) => {
  if (!item.isDerived) return 'manual';
  if (item.source === 'Action Log') return 'action';
  if (item.source === 'Issue Log') return 'issue';
  if (item.source === 'Change Log') return 'change';
  if (item.source === 'Master Tracker') return 'tracker';
  if (item.source === 'Project Plan') return 'plan';
  return 'derived';
};

const statusClass = (status) => {
  if (status === 'Done') return 'text-emerald-700 bg-emerald-50 border border-emerald-100';
  return 'text-amber-700 bg-amber-50 border border-amber-100';
};

const MultiSelectFilter = ({
  allLabel,
  options,
  selectedValues,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-left text-slate-700 flex items-center justify-between gap-2 hover:border-slate-300 transition-colors"
      >
        <span className="truncate">{getMultiFilterSummary(selectedValues, options, allLabel)}</span>
        <span className={`text-[10px] text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {isOpen && (
        <div className="absolute z-30 mt-2 w-full min-w-[220px] rounded-xl border border-slate-200 bg-white shadow-lg p-2">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left px-2.5 py-2 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg"
          >
            Clear selection
          </button>
          <div className="mt-1 max-h-64 overflow-y-auto space-y-1">
            {options.map((option) => {
              const checked = selectedValues.includes(option.value);
              return (
                <label
                  key={option.value}
                  className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(toggleMultiFilterValue(selectedValues, option.value))}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const TodoView = ({
  todos,
  projectData,
  registers,
  tracker,
  currentProject,
  currentUserId,
  isExternalView,
  pendingFocusTodoId,
  onTodoFocusHandled,
  onUpdateTodo,
  onDeleteTodo
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState('project');
  const [projectFilter, setProjectFilter] = useState([]);
  const [sourceFilter, setSourceFilter] = useState([]);
  const [ownerFilter, setOwnerFilter] = useState([]);
  const [recurrenceFilter, setRecurrenceFilter] = useState([]);
  const [bucketFilter, setBucketFilter] = useState([]);

  const [projectOptions, setProjectOptions] = useState([]);
  const [allProjectsData, setAllProjectsData] = useState([]);
  const [loadingAllProjects, setLoadingAllProjects] = useState(false);
  const [draftEdits, setDraftEdits] = useState({});
  const draftEditsRef = useRef({});
  const titleInputRefs = useRef(new Map());

  const makeDraftKey = (todoId, field) => `${todoId}::${field}`;

  const setTitleInputRef = (todoId, element) => {
    if (!todoId) return;
    if (element) {
      titleInputRefs.current.set(todoId, element);
      return;
    }
    titleInputRefs.current.delete(todoId);
  };

  useEffect(() => {
    draftEditsRef.current = draftEdits;
  }, [draftEdits]);

  useEffect(() => {
    const activeIds = new Set((todos || []).map((item) => item._id));
    setDraftEdits((prev) => {
      let changed = false;
      const next = {};
      Object.entries(prev).forEach(([key, value]) => {
        const separatorIdx = key.indexOf('::');
        const todoId = separatorIdx >= 0 ? key.slice(0, separatorIdx) : '';
        if (activeIds.has(todoId)) {
          next[key] = value;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [todos]);

  const getDraftValue = (todo, field) => {
    const key = makeDraftKey(todo._id, field);
    if (Object.prototype.hasOwnProperty.call(draftEdits, key)) {
      return draftEdits[key];
    }
    return todo[field] || '';
  };

  const setDraftValue = (todoId, field, value) => {
    const key = makeDraftKey(todoId, field);
    setDraftEdits((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const commitDraftValue = (todo, field) => {
    const key = makeDraftKey(todo._id, field);
    if (!Object.prototype.hasOwnProperty.call(draftEditsRef.current, key)) {
      return;
    }

    const nextValue = draftEditsRef.current[key];
    const currentValue = todo[field] || '';
    if (nextValue !== currentValue) {
      onUpdateTodo(todo._id, field, nextValue);
    }

    setDraftEdits((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    setProjectFilter([]);
  }, [scope, currentProject?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadProjectOptions = async () => {
      if (!currentUserId) return;

      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', currentUserId)
        .order('updated_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error('Failed to load project options:', error);
        setProjectOptions([]);
        return;
      }

      setProjectOptions(data || []);
    };

    loadProjectOptions();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;

    const loadAllProjectData = async () => {
      if (scope !== 'all' || !currentUserId) return;

      setLoadingAllProjects(true);
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, tasks, registers, tracker')
        .eq('user_id', currentUserId)
        .order('updated_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error('Failed to load all-project task data:', error);
        setAllProjectsData([]);
      } else {
        setAllProjectsData(data || []);
      }
      setLoadingAllProjects(false);
    };

    loadAllProjectData();

    return () => {
      cancelled = true;
    };
  }, [scope, currentUserId]);

  const projectsForDerived = useMemo(() => {
    if (scope !== 'all') {
      return [{
        id: currentProject?.id || null,
        name: currentProject?.name || 'Current Project',
        tasks: projectData || [],
        registers: registers || {},
        tracker: tracker || []
      }];
    }

    const allProjects = [...allProjectsData];
    if (currentProject?.id) {
      const idx = allProjects.findIndex((project) => project.id === currentProject.id);
      const currentPayload = {
        id: currentProject.id,
        name: currentProject.name,
        tasks: projectData || [],
        registers: registers || {},
        tracker: tracker || []
      };
      if (idx >= 0) {
        allProjects[idx] = currentPayload;
      } else {
        allProjects.push(currentPayload);
      }
    }

    return allProjects;
  }, [scope, allProjectsData, currentProject?.id, currentProject?.name, projectData, registers, tracker]);

  const projectNameMap = useMemo(() => {
    const map = new Map();
    projectOptions.forEach((project) => {
      map.set(project.id, project.name);
    });
    if (currentProject?.id && currentProject?.name) {
      map.set(currentProject.id, currentProject.name);
    }
    return map;
  }, [projectOptions, currentProject?.id, currentProject?.name]);

  const manualTodosByScope = useMemo(() => {
    const manualTodos = (todos || []).map((item) => ({
      ...item,
      isDerived: false,
      source: 'Manual',
      projectId: item.projectId || null,
      projectName: item.projectId ? (projectNameMap.get(item.projectId) || 'Unknown Project') : 'Other',
      public: true
    }));

    if (scope === 'all') return manualTodos;

    return manualTodos.filter((item) => {
      if (!currentProject?.id) return item.projectId === null;
      return item.projectId === currentProject.id || item.projectId === null;
    });
  }, [todos, scope, currentProject?.id, projectNameMap]);

  const derivedTodosByScope = useMemo(() => {
    return projectsForDerived.flatMap((project) => {
      const derived = collectDerivedTodos(project.tasks, project.registers, project.tracker);
      return derived.map((item) => ({
        ...item,
        projectId: project.id || null,
        projectName: project.id ? (project.name || projectNameMap.get(project.id) || 'Unknown Project') : 'Other'
      }));
    });
  }, [projectsForDerived, projectNameMap]);

  const mergedOpenTodos = useMemo(() => {
    const merged = [...manualTodosByScope, ...derivedTodosByScope];
    return merged.filter((item) => item.status !== 'Done');
  }, [manualTodosByScope, derivedTodosByScope]);

  useEffect(() => {
    if (!pendingFocusTodoId) return undefined;

    const matchingTodo = mergedOpenTodos.find((item) => item._id === pendingFocusTodoId);
    if (!matchingTodo) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const input = titleInputRefs.current.get(pendingFocusTodoId);
      if (input) {
        input.focus();
        input.select();
      }
      onTodoFocusHandled?.();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [mergedOpenTodos, onTodoFocusHandled, pendingFocusTodoId]);

  const ownerOptions = useMemo(() => {
    const values = new Set();
    mergedOpenTodos.forEach((item) => {
      if (item.owner) values.add(item.owner);
    });
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b))
      .map((owner) => ({ value: owner, label: owner }));
  }, [mergedOpenTodos]);

  const filteredTodos = useMemo(() => {
    let items = [...mergedOpenTodos];

    items = items.filter((item) => matchesProjectSelection(projectFilter, item));
    items = items.filter((item) => matchesSourceSelection(sourceFilter, item, sourceFilterKeyForItem));
    items = items.filter((item) => matchesOwnerSelection(ownerFilter, item));
    items = items.filter((item) => matchesRecurrenceSelection(recurrenceFilter, item));

    items = filterBySearch(items, searchQuery);

    if (isExternalView) {
      items = items.filter((item) => item.public !== false);
    }

    return items;
  }, [
    mergedOpenTodos,
    projectFilter,
    sourceFilter,
    ownerFilter,
    recurrenceFilter,
    searchQuery,
    isExternalView
  ]);

  const bucketedTodos = useMemo(() => {
    const grouped = bucketByDeadline(filteredTodos);
    return grouped.filter((bucket) => matchesBucketSelection(bucketFilter, bucket.key));
  }, [filteredTodos, bucketFilter]);

  const projectSelectOptions = useMemo(() => {
    if (scope === 'project') {
      return [
        ...(currentProject?.id
          ? [{ value: currentProject.id, label: currentProject.name || 'Current Project' }]
          : []),
        { value: 'other', label: 'Other' }
      ];
    }

    const options = [{ value: 'other', label: 'Other' }];
    projectOptions.forEach((project) => {
      options.push({ value: project.id, label: project.name });
    });
    return options;
  }, [scope, projectOptions, currentProject?.id, currentProject?.name]);

  return (
    <div className="w-full h-full bg-slate-50 p-4 sm:p-6 overflow-auto">
      <div className="max-w-[1480px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 rounded-t-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800 tracking-tight">Tasks</h2>
              <p className="text-[11px] text-slate-400 mt-1">
                Scope-aware task view with manual + derived items, project filters, and recurring rules.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 text-[12px] border border-slate-200 rounded-lg w-full sm:w-64 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <select
              value={scope}
              onChange={(e) => {
                const nextScope = e.target.value;
                setScope(nextScope);
                setProjectFilter([]);
              }}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="project">This Project + Other</option>
              <option value="all">All Projects + Other</option>
            </select>

            <MultiSelectFilter
              allLabel={scope === 'project' ? 'In Scope (This Project + Other)' : 'All Projects + Other'}
              options={projectSelectOptions}
              selectedValues={projectFilter}
              onChange={setProjectFilter}
            />

            <MultiSelectFilter
              allLabel="All Sources"
              options={SOURCE_FILTER_OPTIONS.filter((option) => option.value !== 'all')}
              selectedValues={sourceFilter}
              onChange={setSourceFilter}
            />

            <MultiSelectFilter
              allLabel="All Owners"
              options={ownerOptions}
              selectedValues={ownerFilter}
              onChange={setOwnerFilter}
            />

            <MultiSelectFilter
              allLabel="All Recurrence"
              options={RECURRENCE_OPTIONS}
              selectedValues={recurrenceFilter}
              onChange={setRecurrenceFilter}
            />

            <MultiSelectFilter
              allLabel="All Buckets"
              options={TODO_BUCKETS.map((bucket) => ({ value: bucket.key, label: bucket.label }))}
              selectedValues={bucketFilter}
              onChange={setBucketFilter}
            />
          </div>

          {scope === 'all' && loadingAllProjects && (
            <div className="text-[11px] text-slate-400">Loading all-project derived tasks...</div>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {bucketedTodos.map((bucket) => (
            <section key={bucket.key} className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">{bucket.label}</h3>
                <span className="text-[11px] text-slate-500">{bucket.items.length}</span>
              </div>

              {bucket.items.length === 0 ? (
                <div className="px-4 py-5 text-[12px] text-slate-400">No items</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-white text-[10px] uppercase font-bold text-slate-400 border-b">
                      <tr>
                        <th className="px-4 py-3 border-b w-[24%]">Title</th>
                        <th className="px-4 py-3 border-b w-[14%]">Project</th>
                        <th className="px-4 py-3 border-b w-[12%]">Due Date</th>
                        <th className="px-4 py-3 border-b w-[14%]">Owner</th>
                        <th className="px-4 py-3 border-b w-[12%]">Recurring</th>
                        <th className="px-4 py-3 border-b w-[10%]">Source</th>
                        <th className="px-4 py-3 border-b w-[8%]">Status</th>
                        <th className="px-4 py-3 border-b w-[6%] text-center">Act</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs">
                      {bucket.items.map((todo) => {
                        const isManualEditable = !isExternalView && !todo.isDerived;
                        return (
                          <tr key={todo._id} className="border-b border-slate-100 hover:bg-slate-50 transition-all">
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <input
                                  type="text"
                                  ref={(element) => setTitleInputRef(todo._id, element)}
                                  value={getDraftValue(todo, 'title')}
                                  onChange={(e) => setDraftValue(todo._id, 'title', e.target.value)}
                                  onBlur={() => commitDraftValue(todo, 'title')}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      commitDraftValue(todo, 'title');
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                />
                              ) : (
                                <div className={todo.status === 'Done' ? 'line-through text-slate-400' : 'text-[12px] text-slate-700'}>
                                  {todo.title || 'Untitled'}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <select
                                  value={todo.projectId || 'other'}
                                  onChange={(e) => onUpdateTodo(todo._id, 'projectId', e.target.value === 'other' ? null : e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                >
                                  <option value="other">Other</option>
                                  {projectOptions.map((project) => (
                                    <option key={project.id} value={project.id}>{project.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[12px] text-slate-600">{todo.projectName || 'Other'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <input
                                  type="date"
                                  value={todo.dueDate || ''}
                                  onChange={(e) => onUpdateTodo(todo._id, 'dueDate', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                />
                              ) : (
                                <span className="text-[12px] text-slate-600">{todo.dueDate ? formatDate(todo.dueDate) : 'No deadline'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <input
                                  type="text"
                                  value={getDraftValue(todo, 'owner')}
                                  onChange={(e) => setDraftValue(todo._id, 'owner', e.target.value)}
                                  onBlur={() => commitDraftValue(todo, 'owner')}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                />
                              ) : (
                                <span className="text-[12px] text-slate-600">{todo.owner || 'Unassigned'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <select
                                  value={todo.recurrence?.type || 'none'}
                                  onChange={(e) => onUpdateTodo(
                                    todo._id,
                                    'recurrence',
                                    e.target.value === 'none' ? null : { type: e.target.value, interval: 1 }
                                  )}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                >
                                  {RECURRENCE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[12px] text-slate-600">{recurrenceLabel(todo.recurrence)}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                {todo.source || 'Manual'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 align-top">
                              {isManualEditable ? (
                                <select
                                  value={todo.status || 'Open'}
                                  onChange={(e) => onUpdateTodo(todo._id, 'status', e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-[12px] border border-slate-200 rounded-md outline-none focus:border-indigo-300"
                                >
                                  {STATUS_OPTIONS.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium ${statusClass(todo.status)}`}>
                                  {todo.status || 'Open'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center align-top">
                              {isManualEditable && (
                                <button
                                  onClick={() => onDeleteTodo(todo._id)}
                                  className="text-slate-300 hover:text-rose-500"
                                  title="Delete Task"
                                >
                                  <IconTrash />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          {filteredTodos.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">
              No open tasks found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoView;
