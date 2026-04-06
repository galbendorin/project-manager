import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTodoBucketDefaultDueDate,
  TODO_BUCKETS
} from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { readLocalJson, writeLocalJson } from '../utils/offlineState';
import { useTodoViewDerivedData } from '../hooks/useTodoViewDerivedData';
import TodoBoardView from './TodoBoardView';
import TodoBucketSection from './TodoBucketSection';
import MobileTodoDetailSheet from './MobileTodoDetailSheet';
import TodoViewHeaderControls from './TodoViewHeaderControls';

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

const statusClass = (status) => {
  if (status === 'Done') return 'text-emerald-700 bg-emerald-50 border border-emerald-100';
  return 'text-amber-700 bg-amber-50 border border-amber-100';
};

const formatQuickAddDueHint = (bucketKey) => {
  const defaultDueDate = getTodoBucketDefaultDueDate(bucketKey);
  if (!defaultDueDate) return 'No deadline';

  const parsed = new Date(`${defaultDueDate}T00:00:00`);
  return `Due: ${parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })}`;
};

const DESKTOP_COMPLETE_DELAY_MS = 1600;
const MOBILE_COMPLETE_DELAY_MS = 3200;

const STATUS_OPTIONS = ['Open', 'Done'];
const TODO_VIEW_MODE_KEY = 'pmworkspace:todo-view-mode:v1';

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
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onCompleteTodo
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
  const [mobileEditingTitleTodoId, setMobileEditingTitleTodoId] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedMobileTodo, setSelectedMobileTodo] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const cached = readLocalJson(TODO_VIEW_MODE_KEY, {});
    return cached?.mode === 'board' ? 'board' : 'list';
  });
  const [quickAddValues, setQuickAddValues] = useState({});
  const [pendingCompletedTodos, setPendingCompletedTodos] = useState({});
  const draftEditsRef = useRef({});
  const titleInputRefs = useRef(new Map());
  const quickAddInputRefs = useRef(new Map());
  const completionTimeoutsRef = useRef(new Map());
  const isMobile = useMediaQuery('(max-width: 768px)');

  const makeDraftKey = (todoId, field) => `${todoId}::${field}`;

  const setTitleInputRef = (todoId, element) => {
    if (!todoId) return;
    if (element) {
      titleInputRefs.current.set(todoId, element);
      return;
    }
    titleInputRefs.current.delete(todoId);
  };

  const setQuickAddInputRef = (bucketKey, element) => {
    if (!bucketKey) return;
    if (element) {
      quickAddInputRefs.current.set(bucketKey, element);
      return;
    }
    quickAddInputRefs.current.delete(bucketKey);
  };

  const setQuickAddValue = (bucketKey, value) => {
    setQuickAddValues((prev) => ({
      ...prev,
      [bucketKey]: value
    }));
  };

  useEffect(() => {
    draftEditsRef.current = draftEdits;
  }, [draftEdits]);

  useEffect(() => {
    writeLocalJson(TODO_VIEW_MODE_KEY, { mode: viewMode });
  }, [viewMode]);

  useEffect(() => {
    if (!isMobile && showMobileFilters) {
      setShowMobileFilters(false);
    }
  }, [isMobile, showMobileFilters]);

  useEffect(() => () => {
    completionTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    completionTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!mobileEditingTitleTodoId) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      const input = titleInputRefs.current.get(mobileEditingTitleTodoId);
      if (input) {
        input.focus();
        input.select();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [mobileEditingTitleTodoId]);

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

  useEffect(() => {
    if (!pendingFocusTodoId) return undefined;

    const matchingTodo = mergedOpenTodos.find((item) => item._id === pendingFocusTodoId);
    if (!matchingTodo) return undefined;

    if (isMobile) {
      setSelectedMobileTodo(matchingTodo);
      onTodoFocusHandled?.();
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const input = titleInputRefs.current.get(pendingFocusTodoId);
      if (input) {
        input.focus();
        input.select();
      }
      onTodoFocusHandled?.();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isMobile, mergedOpenTodos, onTodoFocusHandled, pendingFocusTodoId]);

  const {
    activeFilterCount,
    allTodoItems,
    bucketedTodos,
    filteredTransientTodos,
    mergedOpenTodos,
    ownerOptions,
    projectSelectOptions,
    visibleOpenTodos,
  } = useTodoViewDerivedData({
    allProjectsData,
    bucketFilter,
    currentProject,
    isExternalView,
    ownerFilter,
    pendingCompletedTodos,
    projectData,
    projectFilter,
    projectOptions,
    recurrenceFilter,
    registers,
    scope,
    searchQuery,
    sourceFilter,
    todos,
    tracker,
  });

  useEffect(() => {
    if (!selectedMobileTodo) return;
    const selectedId = selectedMobileTodo._id || selectedMobileTodo.id;
    const nextSelected = allTodoItems.find((item) => (item._id || item.id) === selectedId) || null;
    if (!nextSelected) {
      setSelectedMobileTodo(null);
      return;
    }
    if (nextSelected !== selectedMobileTodo) {
      setSelectedMobileTodo(nextSelected);
    }
  }, [allTodoItems, selectedMobileTodo]);

  const clearPendingCompletion = useCallback((todoId) => {
    const existingTimeoutId = completionTimeoutsRef.current.get(todoId);
    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
      completionTimeoutsRef.current.delete(todoId);
    }

    setPendingCompletedTodos((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, todoId)) return prev;
      const next = { ...prev };
      delete next[todoId];
      return next;
    });
  }, []);

  const schedulePendingCompletion = useCallback((todo, delayMs) => {
    const existingTimeoutId = completionTimeoutsRef.current.get(todo._id);
    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      Promise.resolve(onCompleteTodo(todo))
        .catch((error) => {
          console.error('Failed to complete task from Tasks view:', error);
        })
        .finally(() => {
          clearPendingCompletion(todo._id);
        });
    }, delayMs);

    completionTimeoutsRef.current.set(todo._id, timeoutId);
  }, [clearPendingCompletion, onCompleteTodo]);

  const handleCompleteTodo = useCallback((todo, bucketKey, displayIndex) => {
    if (!todo || isExternalView || !onCompleteTodo) return;

    if (Object.prototype.hasOwnProperty.call(pendingCompletedTodos, todo._id)) {
      clearPendingCompletion(todo._id);
      return;
    }

    setPendingCompletedTodos((prev) => ({
      ...prev,
      [todo._id]: {
        todo: {
          ...todo,
          status: 'Done',
          completedAt: new Date().toISOString()
        },
        bucketKey,
        displayIndex
      }
    }));

    schedulePendingCompletion(todo, isMobile ? MOBILE_COMPLETE_DELAY_MS : DESKTOP_COMPLETE_DELAY_MS);
  }, [clearPendingCompletion, isExternalView, isMobile, onCompleteTodo, pendingCompletedTodos, schedulePendingCompletion]);

  const handleQuickAddSubmit = useCallback(async (bucketKey) => {
    const rawTitle = quickAddValues[bucketKey] || '';
    const title = rawTitle.trim();
    if (!title || !onAddTodo || isExternalView) return;

    setQuickAddValue(bucketKey, '');

    await onAddTodo({
      title,
      projectId: currentProject?.id || null,
      dueDate: getTodoBucketDefaultDueDate(bucketKey)
    });

    window.requestAnimationFrame(() => {
      const input = quickAddInputRefs.current.get(bucketKey);
      if (input) {
        input.focus();
      }
    });
  }, [currentProject?.id, isExternalView, onAddTodo, quickAddValues]);

  const showCompletionTick = !isExternalView;
  const showQuickAdd = !isExternalView;

  const bucketSections = bucketedTodos.map((bucket) => {
    const displayItems = [...bucket.items];
    filteredTransientTodos
      .filter((entry) => entry.bucketKey === bucket.key)
      .sort((a, b) => a.displayIndex - b.displayIndex)
      .forEach((entry) => {
        const insertAt = Math.max(0, Math.min(entry.displayIndex, displayItems.length));
        displayItems.splice(insertAt, 0, entry.todo);
      });

    return {
      ...bucket,
      displayItems,
    };
  });

  const clearAllFilters = useCallback(() => {
    setProjectFilter([]);
    setSourceFilter([]);
    setOwnerFilter([]);
    setRecurrenceFilter([]);
    setBucketFilter([]);
  }, []);

  return (
    <div className="w-full h-full bg-slate-50 p-4 sm:p-6 overflow-auto">
      <div className="max-w-[1480px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
        <TodoViewHeaderControls
          activeFilterCount={activeFilterCount}
          bucketFilter={bucketFilter}
          bucketOptions={TODO_BUCKETS.map((bucket) => ({ value: bucket.key, label: bucket.label }))}
          clearAllFilters={clearAllFilters}
          isMobile={isMobile}
          loadingAllProjects={loadingAllProjects}
          ownerFilter={ownerFilter}
          ownerOptions={ownerOptions}
          projectFilter={projectFilter}
          projectSelectOptions={projectSelectOptions}
          recurrenceFilter={recurrenceFilter}
          recurrenceOptions={RECURRENCE_OPTIONS}
          scope={scope}
          searchQuery={searchQuery}
          setBucketFilter={setBucketFilter}
          setOwnerFilter={setOwnerFilter}
          setProjectFilter={setProjectFilter}
          setRecurrenceFilter={setRecurrenceFilter}
          setScope={setScope}
          setSearchQuery={setSearchQuery}
          setShowMobileFilters={setShowMobileFilters}
          setViewMode={setViewMode}
          showMobileFilters={showMobileFilters}
          sourceFilter={sourceFilter}
          sourceOptions={SOURCE_FILTER_OPTIONS.filter((option) => option.value !== 'all')}
          setSourceFilter={setSourceFilter}
          viewMode={viewMode}
          visibleOpenTodos={visibleOpenTodos}
        />

        {viewMode === 'board' ? (
          <TodoBoardView
            bucketSections={bucketSections}
            formatQuickAddDueHint={formatQuickAddDueHint}
            handleCompleteTodo={handleCompleteTodo}
            handleQuickAddSubmit={handleQuickAddSubmit}
            isExternalView={isExternalView}
            isMobile={isMobile}
            onDeleteTodo={onDeleteTodo}
            pendingCompletedTodos={pendingCompletedTodos}
            quickAddValues={quickAddValues}
            setQuickAddInputRef={setQuickAddInputRef}
            setQuickAddValue={setQuickAddValue}
            setSelectedMobileTodo={setSelectedMobileTodo}
            showCompletionTick={showCompletionTick}
            showQuickAdd={showQuickAdd}
            statusClass={statusClass}
          />
        ) : (
          <div className="px-5 py-4 space-y-4">
            {bucketSections.map((bucket) => (
              <TodoBucketSection
                key={bucket.key}
                bucket={bucket}
                commitDraftValue={commitDraftValue}
                displayItems={bucket.displayItems}
                formatQuickAddDueHint={formatQuickAddDueHint}
                getDraftValue={getDraftValue}
                handleCompleteTodo={handleCompleteTodo}
                handleQuickAddSubmit={handleQuickAddSubmit}
                isExternalView={isExternalView}
                isMobile={isMobile}
                mobileEditingTitleTodoId={mobileEditingTitleTodoId}
                onDeleteTodo={onDeleteTodo}
                onUpdateTodo={onUpdateTodo}
                pendingCompletedTodos={pendingCompletedTodos}
                projectOptions={projectOptions}
                quickAddValues={quickAddValues}
                recurrenceLabel={recurrenceLabel}
                recurrenceOptions={RECURRENCE_OPTIONS}
                setDraftValue={setDraftValue}
                setMobileEditingTitleTodoId={setMobileEditingTitleTodoId}
                setSelectedMobileTodo={setSelectedMobileTodo}
                setQuickAddInputRef={setQuickAddInputRef}
                setQuickAddValue={setQuickAddValue}
                setTitleInputRef={setTitleInputRef}
                showCompletionTick={showCompletionTick}
                showQuickAdd={showQuickAdd}
                statusClass={statusClass}
                statusOptions={STATUS_OPTIONS}
              />
            ))}
          </div>
        )}
      </div>

      {isMobile && selectedMobileTodo ? (
        <MobileTodoDetailSheet
          todo={selectedMobileTodo}
          canEdit={!isExternalView && !selectedMobileTodo.isDerived && selectedMobileTodo.status !== 'Done'}
          projectOptions={projectOptions}
          onClose={() => setSelectedMobileTodo(null)}
          onDeleteTodo={onDeleteTodo}
          onUpdateTodo={onUpdateTodo}
          recurrenceOptions={RECURRENCE_OPTIONS}
          recurrenceLabel={recurrenceLabel}
          statusClass={statusClass}
        />
      ) : null}
    </div>
  );
};

export default TodoView;
