import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getCurrentDate } from '../utils/helpers';
import { readLocalJson, writeLocalJson } from '../utils/offlineState';
import { useTodoCandidateData, useTodoViewDerivedData } from '../hooks/useTodoViewDerivedData';
import { readCompleteTodoRows } from '../utils/todoSourceLoading';
import { getTodoCompletionDescriptor } from '../hooks/projectData/todoCompletion';
import {
  buildTodoCalendarSections,
  getTodoSectionDefaultDueDate,
} from '../utils/todoCalendarSections';
import {
  calculateTodoReorderPosition,
  canReorderTodo as canReorderTodoItem,
  getStoredTodoOrder,
  TODO_ORDER_STEP,
} from '../utils/todoManualOrdering';
import { buildCrossProjectTodoUpdateData } from '../utils/crossProjectTodoCompletion';
import TodoBoardView from './TodoBoardView';
import TodoBucketSection from './TodoBucketSection';
import TodoKanbanBoard from './TodoKanbanBoard';
import TodoEisenhowerMatrix from './TodoEisenhowerMatrix';
import TaskPlanningControls from './TaskPlanningControls';
import TaskPlanSourceControls from './TaskPlanSourceControls';
import TaskProjectAssignment from './TaskProjectAssignment';
import { useTodoEisenhowerMatrix } from '../hooks/useTodoEisenhowerMatrix';
import { useLocalCalendarDay } from '../hooks/useLocalCalendarDay';
import { groupMatrixTasks, taskViewIdentity } from '../utils/todoEisenhower';
import DesktopTodoDetailModal from './DesktopTodoDetailModal';
import MobileTodoDetailSheet from './MobileTodoDetailSheet';
import TodoViewHeaderControls from './TodoViewHeaderControls';
import { buildTodoCardKey, useTodoKanbanBoard } from '../hooks/useTodoKanbanBoard';
import { useTaskCardChecklists } from '../hooks/useTaskCardChecklists';
import {
  LEGACY_MANUAL_TODO_SELECT,
  MANUAL_TODO_SELECT,
  SHOPPING_MANUAL_TODO_EXTRA_FIELDS,
  SHOPPING_MANUAL_TODO_SELECT,
  isMissingSchemaFieldError,
  mapManualTodoRow,
} from '../hooks/projectData/manualTodoUtils';
import {
  TODO_FOCUS_VIEWS,
  isShoppingListProject,
  mergeManualTodoCollections,
  normalizeTodoFocusView,
} from '../utils/todoCommandCentre';

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
  const defaultDueDate = getTodoSectionDefaultDueDate(bucketKey);
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

const TODO_VIEW_MODE_KEY = 'pmworkspace:todo-view-mode:v1';
const TODO_FUTURE_MONTHS_KEY = 'pmworkspace:todo-future-months:v1';
const TODO_COMMAND_STATE_KEY = 'pmworkspace:todo-command-state:v1';

const readTodoCommandState = () => {
  const cached = readLocalJson(TODO_COMMAND_STATE_KEY, {});
  const readArray = (key) => Array.isArray(cached?.[key]) ? cached[key].filter(Boolean) : [];
  return {
    focusView: cached?.focusView
      ? normalizeTodoFocusView(cached.focusView)
      : TODO_FOCUS_VIEWS.today,
    scope: cached?.scope === 'project' ? 'project' : 'all',
    projectFilter: readArray('projectFilter'),
    sourceFilter: readArray('sourceFilter'),
    ownerFilter: readArray('ownerFilter'),
    recurrenceFilter: readArray('recurrenceFilter'),
    bucketFilter: readArray('bucketFilter'),
    quickAddProjectId: String(cached?.quickAddProjectId || '').trim(),
  };
};

const loadAllManualTodos = async () => {
  let selectClause = SHOPPING_MANUAL_TODO_SELECT;
  let response = await readCompleteTodoRows(() => supabase
    .from('manual_todos')
    .select(selectClause, { count: 'exact' })
    .neq('status', 'Done')
    .order('created_at', { ascending: true }).order('id', { ascending: true }));

  if (response.error && isMissingSchemaFieldError(response.error, SHOPPING_MANUAL_TODO_EXTRA_FIELDS)) {
    selectClause = MANUAL_TODO_SELECT;
    response = await readCompleteTodoRows(() => supabase
      .from('manual_todos')
      .select(selectClause, { count: 'exact' })
      .neq('status', 'Done')
      .order('created_at', { ascending: true }).order('id', { ascending: true }));
  }

  if (response.error && isMissingSchemaFieldError(response.error, ['description', 'kanban_column_id', 'kanban_position'])) {
    response = await readCompleteTodoRows(() => supabase
      .from('manual_todos')
      .select(LEGACY_MANUAL_TODO_SELECT, { count: 'exact' })
      .neq('status', 'Done')
      .order('created_at', { ascending: true }).order('id', { ascending: true }));
  }

  return response;
};

const TodoView = ({
  todos,
  projectData,
  registers,
  tracker,
  currentProject,
  currentUserId,
  currentUserName,
  isExternalView,
  pendingFocusTodoId,
  onTodoFocusHandled,
  onAddTodo,
  onUpdateTodo,
  onDeleteTodo,
  onCompleteTodo,
  onOpenSourceTodo,
  onMoveToPlan,
  onReturnFromPlan,
  onOpenPlan,
}) => {
  const initialCommandStateRef = useRef(null);
  if (!initialCommandStateRef.current) {
    initialCommandStateRef.current = readTodoCommandState();
  }
  const initialCommandState = initialCommandStateRef.current;
  const [searchQuery, setSearchQuery] = useState('');
  const matrixMemoryKey = `pmworkspace:todo-matrix-focus:v1:${currentUserId}`;
  const initialMatrixMemory = useRef(readLocalJson(matrixMemoryKey,{}));
  const [focusView, setFocusView] = useState(() => readLocalJson(TODO_VIEW_MODE_KEY,{})?.mode==='matrix'
    ? normalizeTodoFocusView(initialMatrixMemory.current.matrixFocus || TODO_FOCUS_VIEWS.today) : initialCommandState.focusView);
  const today = useLocalCalendarDay();
  const matrixFocus = useRef(normalizeTodoFocusView(initialMatrixMemory.current.matrixFocus || TODO_FOCUS_VIEWS.today));
  const previousFocus = useRef(normalizeTodoFocusView(initialMatrixMemory.current.previousFocus || initialCommandState.focusView));
  const [scope, setScope] = useState(initialCommandState.scope);
  const [projectFilter, setProjectFilter] = useState(initialCommandState.projectFilter);
  const [sourceFilter, setSourceFilter] = useState(initialCommandState.sourceFilter);
  const [ownerFilter, setOwnerFilter] = useState(initialCommandState.ownerFilter);
  const [recurrenceFilter, setRecurrenceFilter] = useState(initialCommandState.recurrenceFilter);
  const [bucketFilter, setBucketFilter] = useState(initialCommandState.bucketFilter);

  const [projectOptions, setProjectOptions] = useState([]);
  const [allProjectsData, setAllProjectsData] = useState([]);
  const [allProjectManualTodos, setAllProjectManualTodos] = useState([]);
  const [loadingAllProjects, setLoadingAllProjects] = useState(false);
  const [sourceLoadState, setSourceLoadState] = useState({ owner: currentUserId, confirmed: false, error: '' });
  const [sourceReloadNonce, setSourceReloadNonce] = useState(0);
  const [planNotice, setPlanNotice] = useState('');
  const [planningDrafts, setPlanningDrafts] = useState({ owner: currentUserId, values: {} });
  const updatePlanningDraft = (todo, field, value, expected) => setPlanningDrafts((previous) => {
    if (currentOwner.current !== currentUserId) return previous;
    const values = previous.owner === currentUserId ? previous.values : {};
    const key = taskViewIdentity(todo);
    const next = { ...values[key] };
    if (value === undefined && expected !== undefined && next[field] !== expected) return previous;
    if (value === undefined) delete next[field]; else next[field] = value;
    return { owner: currentUserId, values: { ...values, [key]: next } };
  });
  const currentDrafts = planningDrafts.owner === currentUserId ? planningDrafts.values : {};
  const sourceOwner = useRef(currentUserId);
  const currentOwner = useRef(currentUserId);
  currentOwner.current = currentUserId;
  const sourceMutationRevision = useRef(0);
  const deadlineOperations = useRef({ owner: currentUserId, ids: new Set() });
  if (deadlineOperations.current.owner !== currentUserId) deadlineOperations.current = { owner: currentUserId, ids: new Set() };
  const [deadlineSaves, setDeadlineSaves] = useState({ owner: currentUserId, ids: {} });
  const currentDeadlineSaves = deadlineSaves.owner === currentUserId ? deadlineSaves.ids : {};
  const sourceCurrent = sourceLoadState.owner === currentUserId;
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const cached = readLocalJson(TODO_VIEW_MODE_KEY, {});
    if (cached?.mode === 'matrix') return 'matrix';
    if (cached?.mode === 'kanban') return 'kanban';
    if (cached?.mode === 'board' || cached?.mode === 'timeline') return 'timeline';
    return 'list';
  });
  const [showFutureMonths, setShowFutureMonths] = useState(() => {
    const cached = readLocalJson(TODO_FUTURE_MONTHS_KEY, {});
    return cached?.show === true;
  });
  const [quickAddValues, setQuickAddValues] = useState({});
  const [quickAddProjectId, setQuickAddProjectId] = useState(initialCommandState.quickAddProjectId);
  const quickAddContext = `${currentUserId}:${scope}:${currentProject?.id || ''}:${quickAddProjectId}`;
  const quickAddUiScope = useRef({ context: quickAddContext });
  if (quickAddUiScope.current.context !== quickAddContext) quickAddUiScope.current = { context: quickAddContext };
  const quickAddOperations = useRef({ owner: currentUserId, pending: new Set() });
  if (quickAddOperations.current.owner !== currentUserId) {
    quickAddOperations.current = { owner: currentUserId, pending: new Set() };
  }
  const quickAddDraftVersions = useRef({});
  const [quickAddStatus, setQuickAddStatus] = useState({ context: quickAddContext, values: {} });
  const currentQuickAddStatus = { ...(quickAddStatus.context === quickAddContext ? quickAddStatus.values : {}) };
  quickAddOperations.current.pending.forEach((key) => { currentQuickAddStatus[key] = { saving: true }; });
  const [pendingCompletedTodos, setPendingCompletedTodos] = useState({});
  const [todoDragState, setTodoDragState] = useState({ todo: null, sourceBucketKey: '', target: null });
  const quickAddInputRefs = useRef(new Map());
  const completionTimeoutsRef = useRef(new Map());
  const previousProjectIdRef = useRef(currentProject?.id || null);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const changeViewMode = (next) => {
    if (next === 'matrix' && viewMode !== 'matrix') {
      previousFocus.current = focusView; setFocusView(matrixFocus.current);
    } else if (viewMode === 'matrix' && next !== 'matrix') {
      matrixFocus.current = focusView; setFocusView(previousFocus.current);
    }
    setViewMode(next);
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
    quickAddDraftVersions.current[bucketKey] = (quickAddDraftVersions.current[bucketKey] || 0) + 1;
    setQuickAddValues((prev) => ({
      ...prev,
      [bucketKey]: value
    }));
  };

  useEffect(() => {
    writeLocalJson(TODO_VIEW_MODE_KEY, { mode: viewMode });
  }, [viewMode]);
  useEffect(() => {
    if (currentUserId && !isExternalView) writeLocalJson(matrixMemoryKey,{
      matrixFocus: viewMode==='matrix'?focusView:matrixFocus.current,
      previousFocus: viewMode==='matrix'?previousFocus.current:focusView,
    });
  }, [currentUserId, isExternalView, matrixMemoryKey, viewMode, focusView]);

  useEffect(() => {
    writeLocalJson(TODO_FUTURE_MONTHS_KEY, { show: showFutureMonths });
  }, [showFutureMonths]);

  useEffect(() => {
    writeLocalJson(TODO_COMMAND_STATE_KEY, {
      focusView,
      scope,
      projectFilter,
      sourceFilter,
      ownerFilter,
      recurrenceFilter,
      bucketFilter,
      quickAddProjectId,
    });
  }, [
    bucketFilter,
    focusView,
    ownerFilter,
    projectFilter,
    quickAddProjectId,
    recurrenceFilter,
    scope,
    sourceFilter,
  ]);

  useEffect(() => {
    if (!isMobile && showMobileFilters) {
      setShowMobileFilters(false);
    }
  }, [isMobile, showMobileFilters]);

  useEffect(() => {
    if (showFutureMonths) return;
    setBucketFilter((prev) => {
      const next = prev.filter((value) => !String(value).startsWith('month:'));
      return next.length === prev.length ? prev : next;
    });
  }, [showFutureMonths]);

  useEffect(() => () => {
    completionTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    completionTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    const nextProjectId = currentProject?.id || null;
    if (previousProjectIdRef.current === nextProjectId) return;
    previousProjectIdRef.current = nextProjectId;
    if (scope === 'project') setProjectFilter([]);
  }, [currentProject?.id, scope]);

  useEffect(() => {
    if (sourceOwner.current === currentUserId) return;
    sourceOwner.current = currentUserId;
    setProjectOptions([]);
    setAllProjectsData([]);
    setAllProjectManualTodos([]);
    setSourceLoadState({ owner: currentUserId, confirmed: false, error: '' });
    setSelectedTodo(null);
    setPendingCompletedTodos({});
    completionTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    completionTimeoutsRef.current.clear();
    setPlanNotice('');
    setPlanningDrafts({ owner: currentUserId, values: {} });
  }, [currentUserId]);

  useEffect(() => {
    let cancelled = false;

    const loadProjectOptions = async () => {
      if (!currentUserId) return;

      const { data, error } = await readCompleteTodoRows(() => supabase
        .from('projects')
        .select('id, name', { count: 'exact' })
        .order('id', { ascending: true }));

      if (cancelled) return;
      if (error) {
        console.error('Failed to load project options:', error);
        return;
      }

      setProjectOptions((data || []).filter((project) => !isShoppingListProject(project)));
    };

    loadProjectOptions();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, sourceReloadNonce]);

  useEffect(() => {
    let cancelled = false;

    const loadAllProjectData = async () => {
      if (scope !== 'all' || !currentUserId) {
        setLoadingAllProjects(false);
        return;
      }

      setLoadingAllProjects(true);
      const revision = sourceMutationRevision.current;
      try {
      const [projectResponse, manualTodoResponse] = await Promise.all([
        readCompleteTodoRows(() => supabase
          .from('projects')
          .select('id, name, tasks, registers, tracker, version', { count: 'exact' })
          .order('id', { ascending: true })),
        loadAllManualTodos(),
      ]);

      if (cancelled) return;
      if (revision !== sourceMutationRevision.current) {
        setSourceReloadNonce((value) => value + 1);
        return;
      }
      if (projectResponse.error || manualTodoResponse.error) {
        setSourceLoadState((previous) => ({ ...previous, owner: currentUserId, error: 'Some projects or tasks could not be checked. Confirmed tasks are retained; retry loading for a complete Today view.' }));
      } else {
        const professionalProjects = (projectResponse.data || [])
          .filter((project) => !isShoppingListProject(project));
        const professionalProjectIds = new Set(professionalProjects.map((project) => project.id));
        setAllProjectsData(professionalProjects);
          setAllProjectManualTodos((manualTodoResponse.data || [])
            .map(mapManualTodoRow)
            .filter((todo) => !todo.projectId || professionalProjectIds.has(todo.projectId)));
        setProjectOptions(professionalProjects.map(({ id, name }) => ({ id, name })));
        setSourceLoadState({ owner: currentUserId, confirmed: true, error: '' });
      }
      } catch {
        if (!cancelled) setSourceLoadState((previous) => ({ ...previous, owner: currentUserId, error: 'Unable to check all projects. Retry loading; confirmed tasks are retained.' }));
      } finally {
        if (!cancelled) setLoadingAllProjects(false);
      }
    };

    loadAllProjectData();

    return () => {
      cancelled = true;
    };
  }, [scope, currentUserId, sourceReloadNonce]);

  useEffect(() => {
    setQuickAddProjectId((currentValue) => {
      if (currentValue === 'other') return currentValue;
      if (projectOptions.some((project) => project.id === currentValue)) return currentValue;
      if (currentProject?.id && !isShoppingListProject(currentProject)) return currentProject.id;
      return projectOptions[0]?.id || 'other';
    });
  }, [currentProject, projectOptions]);

  const candidates = useTodoCandidateData({
    sourcesConfirmed: sourceCurrent && sourceLoadState.confirmed,
    allProjectManualTodos: sourceCurrent ? allProjectManualTodos : [],
    allProjectsData: sourceCurrent ? allProjectsData : [],
    currentProject, projectData, projectOptions: sourceCurrent ? projectOptions : [], registers, scope, todos, tracker,
  });
  const personalPlan = useTodoEisenhowerMatrix({
    currentUserId, isExternalView, enabled: !isExternalView || viewMode === 'matrix',
    todos: candidates.mergedOpenTodos, today,
  });
  const {
    activeFilterCount,
    allTodoItems,
    filteredTransientTodos,
    focusCounts,
    mergedOpenTodos,
    ownerOptions,
    projectSelectOptions,
    visibleOpenTodos,
  } = useTodoViewDerivedData({
    candidates,
    preferences: personalPlan.preferences,
    today,
    bucketFilter,
    currentProject,
    currentUserId,
    currentUserName,
    focusView,
    isExternalView,
    ownerFilter,
    pendingCompletedTodos,
    projectFilter,
    projectOptions,
    recurrenceFilter,
    scope,
    searchQuery,
    sourceFilter,
  });

  useEffect(() => {
    if (!pendingFocusTodoId) return undefined;

    const matchingTodo = mergedOpenTodos.find((item) => item._id === pendingFocusTodoId);
    if (!matchingTodo) return undefined;

    setSelectedTodo(matchingTodo);
    onTodoFocusHandled?.();
    return undefined;
  }, [mergedOpenTodos, onTodoFocusHandled, pendingFocusTodoId]);

  useEffect(() => {
    if (!sourceCurrent || !selectedTodo) return;
    const nextSelected = allTodoItems.find((item) => taskViewIdentity(item) === taskViewIdentity(selectedTodo)) || null;
    if (!nextSelected) {
      setSelectedTodo(null);
      return;
    }
    if (nextSelected !== selectedTodo) {
      setSelectedTodo(nextSelected);
    }
  }, [allTodoItems, selectedTodo, sourceCurrent]);

  const applyManualMutationResult = useCallback((result) => {
    const changedTodos = [result?.updatedTodo, result?.followUpTodo].filter(Boolean);
    if (changedTodos.length === 0) return;
    sourceMutationRevision.current += 1;
    setAllProjectManualTodos((currentTodos) => (
      mergeManualTodoCollections(currentTodos, changedTodos)
    ));
  }, []);

  const handleUpdateTodo = useCallback(async (todoId, key, value, options) => {
    if (!onUpdateTodo || currentOwner.current !== currentUserId) return null;
    const operationScope = deadlineOperations.current;
    if (operationScope.ids.has(todoId)) return null;
    const confirmedDateWrite = key === 'dueDate' && options?.requireConfirmation;
    if (confirmedDateWrite && pendingCompletedTodos[`manual:${todoId}`]) { setPlanNotice('Undo or finish the pending completion before changing this deadline.'); return null; }
    if (confirmedDateWrite) {
      operationScope.ids.add(todoId);
      setDeadlineSaves((previous) => ({ owner: currentUserId, ids: { ...(previous.owner === currentUserId ? previous.ids : {}), [todoId]: true } }));
    }
    try {
    const originalTodo = allTodoItems.find((todo) => (todo._id || todo.id) === todoId) || null;
    const result = await onUpdateTodo(todoId, key, value, originalTodo, options);
    if (currentOwner.current !== currentUserId) return null;
    applyManualMutationResult(result);
    return result;
    } finally {
      if (confirmedDateWrite) {
        operationScope.ids.delete(todoId);
        if (deadlineOperations.current === operationScope && currentOwner.current === currentUserId) setDeadlineSaves((previous) => { const ids = { ...previous.ids }; delete ids[todoId]; return { owner: currentUserId, ids }; });
      }
    }
  }, [allTodoItems, applyManualMutationResult, onUpdateTodo, currentUserId, pendingCompletedTodos]);

  const handleDeleteTodo = useCallback(async (todoId) => {
    if (!onDeleteTodo || currentOwner.current !== currentUserId) return false;
    if (deadlineOperations.current.ids.has(todoId)) { setPlanNotice('Wait for the deadline save before deleting this task.'); return false; }
    const deleted = await onDeleteTodo(todoId);
    if (currentOwner.current !== currentUserId) return false;
    if (deleted === false) return false;
    sourceMutationRevision.current += 1;

    setAllProjectManualTodos((currentTodos) => (
      currentTodos.filter((todo) => (todo._id || todo.id) !== todoId)
    ));
    setSelectedTodo((currentTodo) => (
      currentTodo && (currentTodo._id || currentTodo.id) === todoId ? null : currentTodo
    ));
    return true;
  }, [onDeleteTodo, currentUserId]);

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

  const completeCrossProjectTodo = useCallback(async (todo) => {
    if (currentOwner.current !== currentUserId) return;
    if (!todo?.projectId || (!todo?.isDerived && !todo?.planLink && !todo?.meta?.projectPlanLink)) {
      if (onCompleteTodo) {
        await onCompleteTodo(todo);
      }
      return;
    }

    const targetProject = allProjectsData.find((project) => project.id === todo.projectId);
    if (!targetProject) {
      throw new Error('The source project is not loaded. Refresh Tasks before completing this item.');
    }

    const nowIso = new Date().toISOString();
    if ((todo.planLink || todo.meta?.projectPlanLink) && !Number.isInteger(targetProject.version)) throw new Error('The source project version could not be checked. Refresh Tasks before completing this item.');
    const completion = getTodoCompletionDescriptor(todo, getCurrentDate(), nowIso);
    const prepared = buildCrossProjectTodoUpdateData(targetProject, completion, nowIso);

    if (!prepared) throw new Error('The linked source could not be verified. Refresh Tasks before completing this item.');

    let updateQuery = supabase
      .from('projects')
      .update(prepared.updateData)
      .eq('id', todo.projectId);

    if (Number.isInteger(targetProject.version)) {
      updateQuery = updateQuery.eq('version', targetProject.version);
    }

    const { data, error } = await updateQuery
      .select('version')
      .maybeSingle();
    if (currentOwner.current !== currentUserId) return;

    if (error) {
      throw error;
    }

    if (Number.isInteger(targetProject.version) && !data) {
      throw new Error('The other project changed before this task could be completed. Please reload the task list and try again.');
    }

    sourceMutationRevision.current += 1;
    setAllProjectsData((prev) => prev.map((project) => (
      project.id === todo.projectId
        ? {
            ...prepared.nextProject,
            version: Number.isInteger(data?.version) ? data.version : project.version,
          }
        : project
    )));
  }, [allProjectsData, onCompleteTodo, currentUserId]);

  const persistCompletedTodo = useCallback(async (todo) => {
    if (!todo?.isDerived && !todo?.planLink && !todo?.meta?.projectPlanLink) {
      await handleUpdateTodo(todo._id, 'status', 'Done');
      return;
    }

    const isCrossProjectTodo = (
      scope === 'all'
      && todo?.projectId
      && todo.projectId !== currentProject?.id
    );

    if (isCrossProjectTodo) {
      await completeCrossProjectTodo(todo);
      return;
    }

    if (onCompleteTodo) {
      await onCompleteTodo(todo);
    }
  }, [completeCrossProjectTodo, currentProject?.id, handleUpdateTodo, onCompleteTodo, scope]);

  const schedulePendingCompletion = useCallback((todo, delayMs) => {
    const key = taskViewIdentity(todo);
    const existingTimeoutId = completionTimeoutsRef.current.get(key);
    if (existingTimeoutId) {
      window.clearTimeout(existingTimeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      Promise.resolve(persistCompletedTodo(todo))
        .catch((error) => {
          console.error('Failed to complete task from Tasks view:', error);
        })
        .finally(() => {
          clearPendingCompletion(key);
        });
    }, delayMs);

    completionTimeoutsRef.current.set(key, timeoutId);
  }, [clearPendingCompletion, persistCompletedTodo]);

  const handleCompleteTodo = useCallback((todo, bucketKey, displayIndex) => {
    if (!todo || isExternalView || !onCompleteTodo) return;
    if (todo.planLinkUnavailable) { setPlanNotice('The linked plan task is unavailable. Reload its source project before completing it.'); return; }
    if (!todo.isDerived && deadlineOperations.current.ids.has(todo._id)) { setPlanNotice('Wait for the deadline save before completing this task.'); return; }

    const key = taskViewIdentity(todo);
    if (Object.prototype.hasOwnProperty.call(pendingCompletedTodos, key)) {
      clearPendingCompletion(key);
      return;
    }

    setPendingCompletedTodos((prev) => ({
      ...prev,
      [key]: {
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

  const showCompletionTick = !isExternalView;
  const showQuickAdd = !isExternalView;

  const {
    addColumn,
    cardOrderOverrides,
    columns,
    columnsLoading,
    createCardInColumn,
    kanbanAvailable,
    kanbanMessage,
    moveCardToColumn,
    moveCardToPosition,
    renameColumn,
  } = useTodoKanbanBoard({
    enabled: viewMode !== 'matrix',
    currentProject,
    currentUserId,
    isExternalView,
    onAddTodo,
    onUpdateTodo: handleUpdateTodo,
    scope,
    visibleOpenTodos,
  });

  const visibleOpenTodosWithCardOrder = useMemo(() => (
    visibleOpenTodos.map((todo) => {
      const savedPosition = cardOrderOverrides[buildTodoCardKey(todo)];
      return Number.isFinite(Number(savedPosition))
        ? { ...todo, boardPosition: Number(savedPosition) }
        : todo;
    })
  ), [cardOrderOverrides, visibleOpenTodos]);

  const {
    sections: allBucketSections,
    futureMonthSections,
    futureItemCount,
  } = buildTodoCalendarSections(visibleOpenTodosWithCardOrder, {
    today,
    showFutureMonths,
  });

  const filterableBucketSections = showFutureMonths
    ? allBucketSections
    : allBucketSections.filter((bucket) => !bucket.key.startsWith('month:'));
  const matrixSections = buildTodoCalendarSections(visibleOpenTodos,{today,showFutureMonths:true}).sections;
  const matrixTodos = matrixSections.filter(section=>!bucketFilter.length||bucketFilter.includes(section.key)).flatMap(section=>section.items);
  const matrix = { ...personalPlan, groups: groupMatrixTasks(matrixTodos, personalPlan.preferences, today) };

  const filteredBucketSections = filterableBucketSections.filter((bucket) => (
    bucketFilter.length === 0 || bucketFilter.includes(bucket.key)
  ));

  const bucketSections = filteredBucketSections.map((bucket) => {
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

  const handleQuickAddSubmit = useCallback(async (bucketKey) => {
    const rawTitle = quickAddValues[bucketKey] || '';
    const title = rawTitle.trim();
    const operation = quickAddOperations.current;
    const uiScope = quickAddUiScope.current;
    const draftVersion = quickAddDraftVersions.current[bucketKey] || 0;
    if (!title || !onAddTodo || isExternalView || currentOwner.current !== currentUserId || operation.pending.has(bucketKey)) return;
    operation.pending.add(bucketKey);
    const publishStatus = (value) => {
      if (quickAddOperations.current !== operation || quickAddUiScope.current !== uiScope) return;
      setQuickAddStatus((previous) => ({ context: uiScope.context, values: { ...(previous.context === uiScope.context ? previous.values : {}), [bucketKey]: value } }));
    };
    publishStatus({ saving: true });
    const destinationProjectId = scope === 'all'
      ? (quickAddProjectId === 'other' ? null : quickAddProjectId)
      : (currentProject?.id || null);
    // Include filtered-out tasks so adding at the end never disturbs their order.
    const section = buildTodoCalendarSections(mergedOpenTodos.map((item) => {
      const position = cardOrderOverrides[buildTodoCardKey(item)];
      return Number.isFinite(Number(position)) ? { ...item, boardPosition: Number(position) } : item;
    }), { today, showFutureMonths: true }).sections.find((item) => item.key === bucketKey);
    const items = section?.items || [];
    // A new title may shift fallback indices for derived tasks without an order.
    const appendPosition = Math.max(
      calculateTodoReorderPosition(items, items.length),
      items.some((item) => getStoredTodoOrder(item) === null) ? (items.length + 2) * TODO_ORDER_STEP : -Infinity,
    );
    try {
      const addedTodo = await onAddTodo({
        title,
        projectId: destinationProjectId,
        dueDate: getTodoSectionDefaultDueDate(bucketKey, today),
        kanbanPosition: appendPosition,
      });
      if (quickAddOperations.current !== operation || currentOwner.current !== currentUserId) return;
      if (!addedTodo) {
        publishStatus({ error: 'Task was not added. Your text is kept; try again.' });
        return;
      }
      sourceMutationRevision.current += 1;
      setAllProjectManualTodos((currentTodos) => mergeManualTodoCollections(currentTodos, [addedTodo]));
      if (quickAddUiScope.current !== uiScope) return;
      setQuickAddValues((previous) => (quickAddDraftVersions.current[bucketKey] || 0) === draftVersion && previous[bucketKey] === rawTitle ? { ...previous, [bucketKey]: '' } : previous);
      const filterHint = activeFilterCount || searchQuery || focusView !== TODO_FOCUS_VIEWS.all
        ? ' Current filters may hide it.' : '';
      publishStatus({ message: `Added “${title}”.${filterHint}` });
      window.requestAnimationFrame(() => {
        if (quickAddOperations.current === operation && quickAddUiScope.current === uiScope) quickAddInputRefs.current.get(bucketKey)?.focus();
      });
    } catch {
      publishStatus({ error: 'Unable to add task. Your text is kept; try again.' });
    } finally {
      operation.pending.delete(bucketKey);
      if (quickAddOperations.current === operation) setQuickAddStatus((previous) => {
        const values = { ...previous.values };
        if (values[bucketKey]?.saving) delete values[bucketKey];
        return { ...previous, values };
      });
    }
  }, [activeFilterCount, cardOrderOverrides, currentProject?.id, currentUserId, focusView, isExternalView, mergedOpenTodos, onAddTodo, quickAddProjectId, quickAddValues, scope, searchQuery, today]);

  const canDragReorderTodo = useCallback((todo) => (
    Boolean(onUpdateTodo)
    && canReorderTodoItem(todo, { isExternalView })
    && (!todo?.isDerived || scope === 'project')
  ), [isExternalView, onUpdateTodo, scope]);

  const persistTodoReorder = useCallback(async (todo, sourceBucketKey, targetBucketKey, targetIndex) => {
    if (!canDragReorderTodo(todo)) return;
    if (todo.isDerived && sourceBucketKey !== targetBucketKey) return;

    const targetBucket = bucketSections.find((bucket) => bucket.key === targetBucketKey);
    if (!targetBucket) return;

    const sourceBucket = bucketSections.find((bucket) => bucket.key === sourceBucketKey);
    const sourceIndex = sourceBucket
      ? sourceBucket.displayItems.findIndex((item) => item._id === todo._id)
      : -1;
    const itemsWithoutDragged = targetBucket.displayItems.filter((item) => item._id !== todo._id);
    const adjustedTargetIndex = sourceBucketKey === targetBucketKey && sourceIndex >= 0 && sourceIndex < targetIndex
      ? Math.max(0, targetIndex - 1)
      : targetIndex;
    const nextPosition = calculateTodoReorderPosition(itemsWithoutDragged, adjustedTargetIndex);
    const nextDueDate = getTodoSectionDefaultDueDate(targetBucketKey);

    if (!todo.isDerived && (todo.dueDate || '') !== nextDueDate) {
      await handleUpdateTodo(todo._id, 'dueDate', nextDueDate);
    }
    await moveCardToPosition(todo, nextPosition);
  }, [bucketSections, canDragReorderTodo, handleUpdateTodo, moveCardToPosition]);

  const getFlattenedReorderItems = useCallback(() => (
    bucketSections.flatMap((bucket) => (
      bucket.displayItems.map((item, index) => ({
        bucketKey: bucket.key,
        index,
        item,
      }))
    ))
  ), [bucketSections]);

  const canMoveTodoByOffset = useCallback((todo, direction) => {
    if (!canDragReorderTodo(todo)) return false;
    const items = getFlattenedReorderItems();
    const currentIndex = items.findIndex((entry) => entry.item._id === todo._id);
    if (currentIndex < 0) return false;
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return false;
    if (todo.isDerived && items[targetIndex]?.bucketKey !== items[currentIndex]?.bucketKey) return false;
    return true;
  }, [canDragReorderTodo, getFlattenedReorderItems]);

  const handleTodoReorderMove = useCallback(async (todo, sourceBucketKey, displayIndex, direction) => {
    if (!canDragReorderTodo(todo)) return;

    const items = getFlattenedReorderItems();
    const currentIndex = items.findIndex((entry) => entry.item._id === todo._id);
    const resolvedCurrentIndex = currentIndex >= 0
      ? currentIndex
      : items.findIndex((entry) => (
          entry.bucketKey === sourceBucketKey
          && entry.index === displayIndex
          && entry.item._id === todo._id
        ));
    const targetFlatIndex = resolvedCurrentIndex + direction;
    if (resolvedCurrentIndex < 0 || targetFlatIndex < 0 || targetFlatIndex >= items.length) return;

    const targetEntry = items[targetFlatIndex];
    if (todo.isDerived && targetEntry.bucketKey !== items[resolvedCurrentIndex]?.bucketKey) return;
    const targetIndex = direction < 0 ? targetEntry.index : targetEntry.index + 1;
    await persistTodoReorder(todo, sourceBucketKey, targetEntry.bucketKey, targetIndex);
  }, [canDragReorderTodo, getFlattenedReorderItems, persistTodoReorder]);

  const handleTodoReorderDragStart = useCallback((event, todo, sourceBucketKey) => {
    if (!canDragReorderTodo(todo)) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', todo._id);
    setTodoDragState({ todo, sourceBucketKey, target: null });
  }, [canDragReorderTodo]);

  const handleTodoReorderDragOver = useCallback((event, bucketKey, index) => {
    if (!todoDragState.todo) return;
    if (todoDragState.todo.isDerived && bucketKey !== todoDragState.sourceBucketKey) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setTodoDragState((prev) => {
      if (!prev.todo) return prev;
      if (prev.target?.bucketKey === bucketKey && prev.target?.index === index) return prev;
      return {
        ...prev,
        target: { bucketKey, index },
      };
    });
  }, [todoDragState.sourceBucketKey, todoDragState.todo]);

  const handleTodoReorderDrop = useCallback(async (event, bucketKey, index) => {
    if (!todoDragState.todo) return;
    if (todoDragState.todo.isDerived && bucketKey !== todoDragState.sourceBucketKey) return;
    event.preventDefault();
    event.stopPropagation();
    await persistTodoReorder(todoDragState.todo, todoDragState.sourceBucketKey, bucketKey, index);
    setTodoDragState({ todo: null, sourceBucketKey: '', target: null });
  }, [persistTodoReorder, todoDragState.sourceBucketKey, todoDragState.todo]);

  const handleTodoReorderDragEnd = useCallback(() => {
    setTodoDragState({ todo: null, sourceBucketKey: '', target: null });
  }, []);

  const clearAllFilters = useCallback(() => {
    setProjectFilter([]);
    setSourceFilter([]);
    setOwnerFilter([]);
    setRecurrenceFilter([]);
    setBucketFilter([]);
  }, []);

  const handleFocusViewChange = useCallback((nextFocusView) => {
    setFocusView(normalizeTodoFocusView(nextFocusView));
    setScope('all');
    setProjectFilter([]);
    setSourceFilter([]);
    setOwnerFilter([]);
    setRecurrenceFilter([]);
    setBucketFilter([]);
    setSearchQuery('');
    if (viewMode === 'kanban') setViewMode('list');
  }, [viewMode]);

  const handleScopeChange = useCallback((nextScope) => {
    setFocusView(TODO_FOCUS_VIEWS.all);
    setScope(nextScope === 'all' ? 'all' : 'project');
    setProjectFilter([]);
    if (nextScope === 'all' && viewMode === 'kanban') setViewMode('list');
  }, [viewMode]);

  const selectedTodoCanEdit = !isExternalView && !currentDeadlineSaves[selectedTodo?._id] && !selectedTodo?.isDerived && selectedTodo?.status !== 'Done';
  const checklistSourceTodos = useMemo(() => {
    const todoMap = new Map();
    visibleOpenTodos.forEach((todo) => {
      if (todo?._id) todoMap.set(taskViewIdentity(todo), todo);
    });
    if (selectedTodo?._id) {
      todoMap.set(taskViewIdentity(selectedTodo), selectedTodo);
    }
    return [...todoMap.values()];
  }, [selectedTodo, visibleOpenTodos]);

  const {
    addChecklist,
    addChecklistItems,
    checklistMessage,
    checklistsAvailable,
    checklistsLoading,
    checklistsSaving,
    retryChecklists,
    deleteChecklist,
    deleteChecklistItem,
    getChecklistSummaryForTodo,
    getChecklistsForTodo,
    moveChecklistItem,
    renameChecklist,
    renameChecklistItem,
    toggleChecklistItem,
  } = useTaskCardChecklists({
    currentUserId,
    isExternalView,
    todos: checklistSourceTodos,
  });
  const selectedTodoChecklists = selectedTodo ? getChecklistsForTodo(selectedTodo) : [];
  const selectedTodoCanEditChecklist = !isExternalView && selectedTodo?.status !== 'Done';
  const selectedPlanningControls = !isExternalView && selectedTodo ? <>
    {selectedTodo.status !== 'Done' ? <TaskPlanningControls key={taskViewIdentity(selectedTodo)} todo={selectedTodo} matrix={personalPlan} today={today} deadlinePending={Boolean(currentDeadlineSaves[selectedTodo._id])} draft={currentDrafts[taskViewIdentity(selectedTodo)]} onDraftChange={(field, value, expected) => updatePlanningDraft(selectedTodo, field, value, expected)} onUpdateTodo={handleUpdateTodo} onOpenSourceTodo={onOpenSourceTodo} onNotice={setPlanNotice} /> : null}
    {onMoveToPlan || selectedTodo.planLink || selectedTodo.meta?.projectPlanLink ? <TaskPlanSourceControls key={`promotion:${taskViewIdentity(selectedTodo)}`} todo={selectedTodo} projects={projectOptions} onMove={onMoveToPlan} onOpen={onOpenPlan} onReturn={onReturnFromPlan} /> : null}
  </> : null;
  const selectedProjectAssignment = selectedTodo ? <TaskProjectAssignment key={`assignment:${taskViewIdentity(selectedTodo)}`} todo={selectedTodo} projects={projectOptions} canEdit={selectedTodoCanEdit} onUpdateTodo={handleUpdateTodo} /> : null;

  return (
    <div className="w-full h-full bg-slate-50 p-4 sm:p-6 overflow-auto">
      <div className="max-w-[1480px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
        <TodoViewHeaderControls
          activeFilterCount={activeFilterCount}
          bucketFilter={bucketFilter}
          bucketOptions={(viewMode==='matrix'?matrixSections:filterableBucketSections).map((bucket) => ({ value: bucket.key, label: bucket.label }))}
          clearAllFilters={clearAllFilters}
          focusCounts={focusCounts}
          focusView={focusView}
          futureItemCount={futureItemCount}
          futureMonthCount={futureMonthSections.length}
          isMobile={isMobile}
          loadingAllProjects={loadingAllProjects}
          ownerFilter={ownerFilter}
          ownerOptions={ownerOptions}
          onFocusViewChange={handleFocusViewChange}
          onScopeChange={handleScopeChange}
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
          setSearchQuery={setSearchQuery}
          setShowFutureMonths={setShowFutureMonths}
          setShowMobileFilters={setShowMobileFilters}
          setViewMode={changeViewMode}
          showFutureMonths={showFutureMonths}
          showMobileFilters={showMobileFilters}
          sourceFilter={sourceFilter}
          sourceOptions={SOURCE_FILTER_OPTIONS.filter((option) => option.value !== 'all')}
          setSourceFilter={setSourceFilter}
          viewMode={viewMode}
          visibleOpenTodos={visibleOpenTodos}
        />

        {scope === 'all' ? <div className="flex justify-end px-3 pt-2"><button type="button" disabled={loadingAllProjects} onClick={() => { setSourceReloadNonce((value) => value + 1); void personalPlan.reload(); }} className="min-h-11 rounded-lg border px-3 text-xs text-slate-600 disabled:opacity-50">Refresh tasks</button></div> : null}
        {scope === 'all' && (loadingAllProjects || sourceLoadState.error || !sourceCurrent) ? (
          <div role={sourceLoadState.error ? 'alert' : 'status'} className="m-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            {sourceCurrent && sourceLoadState.error ? sourceLoadState.error : 'Checking tasks across all projects…'}
            <button type="button" disabled={loadingAllProjects} onClick={() => setSourceReloadNonce((value) => value + 1)} className="ml-2 min-h-11 px-3 font-semibold underline">Retry loading</button>
          </div>
        ) : null}
        {sourceCurrent && planNotice ? <p role="status" className="m-3 rounded-xl border bg-indigo-50 p-3 text-sm">{planNotice}</p> : null}
        {!isExternalView && (personalPlan.loading || personalPlan.error || !personalPlan.ready) ? (
          <div role={personalPlan.error ? 'alert' : 'status'} className="m-3 rounded-xl border bg-slate-50 p-3 text-sm">
            {personalPlan.error || 'Checking your personal plan…'}
            <button type="button" disabled={personalPlan.loading || personalPlan.offline || Object.keys(personalPlan.pending).length > 0} onClick={personalPlan.reload} className="ml-2 min-h-11 px-3 font-semibold underline">Retry personal plan</button>
          </div>
        ) : null}
        {((scope === 'all' && !sourceLoadState.confirmed) || (!isExternalView && !personalPlan.ready)) && !visibleOpenTodos.length ? null : viewMode === 'matrix' ? (
          <TodoEisenhowerMatrix matrix={matrix} currentUserId={currentUserId} today={today} isMobile={isMobile} isExternalView={isExternalView} onOpenTodo={setSelectedTodo} onOpenSourceTodo={onOpenSourceTodo} onUpdateTodo={handleUpdateTodo} onNotice={setPlanNotice} planningDrafts={currentDrafts} onPlanningDraftChange={updatePlanningDraft} deadlineSaves={currentDeadlineSaves} handleCompleteTodo={handleCompleteTodo} getChecklistSummary={getChecklistSummaryForTodo} transientTodos={filteredTransientTodos}/>
        ) : viewMode === 'timeline' ? (
          <TodoBoardView
            bucketSections={bucketSections}
            canReorderTodo={canDragReorderTodo}
            canMoveTodo={canMoveTodoByOffset}
            draggedTodoId={todoDragState.todo?._id || ''}
            dropTarget={todoDragState.target}
            formatQuickAddDueHint={formatQuickAddDueHint}
            handleCompleteTodo={handleCompleteTodo}
            handleQuickAddSubmit={handleQuickAddSubmit}
            isExternalView={isExternalView}
            onDeleteTodo={handleDeleteTodo}
            onReorderDragEnd={handleTodoReorderDragEnd}
            onReorderDragOver={handleTodoReorderDragOver}
            onReorderDragStart={handleTodoReorderDragStart}
            onReorderDrop={handleTodoReorderDrop}
            onReorderMove={handleTodoReorderMove}
            onOpenTodo={setSelectedTodo}
            pendingCompletedTodos={pendingCompletedTodos}
            projectOptions={projectOptions}
            quickAddProjectId={quickAddProjectId}
            quickAddValues={quickAddValues}
            quickAddStatus={currentQuickAddStatus}
            setQuickAddInputRef={setQuickAddInputRef}
            setQuickAddProjectId={setQuickAddProjectId}
            setQuickAddValue={setQuickAddValue}
            showProjectPicker={scope === 'all'}
            showCompletionTick={showCompletionTick}
            showQuickAdd={showQuickAdd}
            statusClass={statusClass}
            getChecklistSummary={getChecklistSummaryForTodo}
          />
        ) : viewMode === 'kanban' ? (
          <TodoKanbanBoard
            addColumn={addColumn}
            columns={columns}
            columnsLoading={columnsLoading}
            createCardInColumn={createCardInColumn}
            handleCompleteTodo={handleCompleteTodo}
            isExternalView={isExternalView}
            kanbanAvailable={kanbanAvailable}
            kanbanMessage={kanbanMessage}
            moveCardToColumn={moveCardToColumn}
            onDeleteTodo={handleDeleteTodo}
            onOpenTodo={setSelectedTodo}
            pendingCompletedTodos={pendingCompletedTodos}
            renameColumn={renameColumn}
            showCompletionTick={showCompletionTick}
            statusClass={statusClass}
            getChecklistSummary={getChecklistSummaryForTodo}
          />
        ) : (
          <div className="space-y-3 px-3 py-3 sm:px-4">
            {bucketSections.map((bucket) => (
              <TodoBucketSection
                key={bucket.key}
                bucket={bucket}
                canReorderTodo={canDragReorderTodo}
                canMoveTodo={canMoveTodoByOffset}
                displayItems={bucket.displayItems}
                draggedTodoId={todoDragState.todo?._id || ''}
                dropTarget={todoDragState.target}
                formatQuickAddDueHint={formatQuickAddDueHint}
                getChecklistSummary={getChecklistSummaryForTodo}
                handleCompleteTodo={handleCompleteTodo}
                handleQuickAddSubmit={handleQuickAddSubmit}
                isExternalView={isExternalView}
                isMobile={isMobile}
                onDeleteTodo={handleDeleteTodo}
                onReorderDragEnd={handleTodoReorderDragEnd}
                onReorderDragOver={handleTodoReorderDragOver}
                onReorderDragStart={handleTodoReorderDragStart}
                onReorderDrop={handleTodoReorderDrop}
                onReorderMove={handleTodoReorderMove}
                pendingCompletedTodos={pendingCompletedTodos}
                projectOptions={projectOptions}
                quickAddProjectId={quickAddProjectId}
                quickAddValues={quickAddValues}
                quickAddStatus={currentQuickAddStatus}
                setSelectedMobileTodo={setSelectedTodo}
                setQuickAddInputRef={setQuickAddInputRef}
                setQuickAddProjectId={setQuickAddProjectId}
                setQuickAddValue={setQuickAddValue}
                showProjectPicker={scope === 'all'}
                showCompletionTick={showCompletionTick}
                showQuickAdd={showQuickAdd}
                statusClass={statusClass}
              />
            ))}
          </div>
        )}
      </div>

      {sourceCurrent && isMobile && selectedTodo ? (
        <MobileTodoDetailSheet
          projectAssignmentControls={selectedProjectAssignment}
          planningControls={selectedPlanningControls}
          todo={selectedTodo}
          canEdit={selectedTodoCanEdit}
          projectOptions={projectOptions}
          onClose={() => setSelectedTodo(null)}
          onDeleteTodo={handleDeleteTodo}
          onUpdateTodo={handleUpdateTodo}
          recurrenceOptions={RECURRENCE_OPTIONS}
          recurrenceLabel={recurrenceLabel}
          statusClass={statusClass}
          checklists={selectedTodoChecklists}
          checklistCanEdit={selectedTodoCanEditChecklist}
          checklistsAvailable={checklistsAvailable}
          checklistsLoading={checklistsLoading}
          checklistMessage={checklistMessage}
          checklistsSaving={checklistsSaving}
          onRetryChecklists={retryChecklists}
          onAddChecklist={() => addChecklist(selectedTodo)}
          onAddChecklistItems={addChecklistItems}
          onDeleteChecklist={deleteChecklist}
          onDeleteChecklistItem={deleteChecklistItem}
          onMoveChecklistItem={moveChecklistItem}
          onRenameChecklist={renameChecklist}
          onRenameChecklistItem={renameChecklistItem}
          onToggleChecklistItem={toggleChecklistItem}
        />
      ) : null}

      {sourceCurrent && !isMobile && selectedTodo ? (
        <DesktopTodoDetailModal
          projectAssignmentControls={selectedProjectAssignment}
          planningControls={selectedPlanningControls}
          todo={selectedTodo}
          canEdit={selectedTodoCanEdit}
          projectOptions={projectOptions}
          onClose={() => setSelectedTodo(null)}
          onDeleteTodo={handleDeleteTodo}
          onUpdateTodo={handleUpdateTodo}
          recurrenceLabel={recurrenceLabel}
          recurrenceOptions={RECURRENCE_OPTIONS}
          statusClass={statusClass}
          checklists={selectedTodoChecklists}
          checklistCanEdit={selectedTodoCanEditChecklist}
          checklistsAvailable={checklistsAvailable}
          checklistsLoading={checklistsLoading}
          checklistMessage={checklistMessage}
          checklistsSaving={checklistsSaving}
          onRetryChecklists={retryChecklists}
          onAddChecklist={() => addChecklist(selectedTodo)}
          onAddChecklistItems={addChecklistItems}
          onDeleteChecklist={deleteChecklist}
          onDeleteChecklistItem={deleteChecklistItem}
          onMoveChecklistItem={moveChecklistItem}
          onRenameChecklist={renameChecklist}
          onRenameChecklistItem={renameChecklistItem}
          onToggleChecklistItem={toggleChecklistItem}
        />
      ) : null}
    </div>
  );
};

export default TodoView;
