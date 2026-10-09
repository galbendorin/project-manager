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
  getTodoCreationDueDate,
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
import TaskCreationFields from './TaskCreationFields';
import TaskCreationDialog from './TaskCreationDialog';
import TaskPlanSourceControls from './TaskPlanSourceControls';
import TaskProjectAssignment from './TaskProjectAssignment';
import { useTodoEisenhowerMatrix } from '../hooks/useTodoEisenhowerMatrix';
import { useLocalCalendarDay } from '../hooks/useLocalCalendarDay';
import { groupMatrixTasks, taskViewIdentity, matrixReference, validCalendarDay, DEFAULT_MATRIX_QUADRANT } from '../utils/todoEisenhower';
import TodoDetailDialog from './TodoDetailDialog';
import { useTaskDescriptionDrafts } from '../hooks/useTaskDescriptionDrafts';
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

const dueHint = (defaultDueDate) => {
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
const isMatrixCreation = key => key === 'matrix' || key.startsWith('matrix:');

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
  onQuickCapture,
  quickCaptureStatus,
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
  const [creationDrafts, setCreationDrafts] = useState({ owner: currentUserId, values: {} });
  const [creationOpen, setCreationOpen] = useState(false);
  const [creationKey, setCreationKey] = useState('matrix');
  const [, setCreationRevision] = useState(0);
  const creationRecords = useRef({ owner: currentUserId, records: new Map() });
  if (creationRecords.current.owner !== currentUserId) creationRecords.current = { owner: currentUserId, records: new Map() };
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
    if (!creationRecords.current.records.has(bucketKey) && !quickAddOperations.current.pending.has(bucketKey)) setQuickAddStatus(previous => {
      const values = { ...previous.values }; delete values[bucketKey]; return { ...previous, values };
    });
  };

  const creationDraft = (bucketKey) => {
    const fallbackDay = focusView === 'today' || focusView === 'tomorrow' ? getTodoCreationDueDate('today', today, focusView) : '';
    const dueDate = isMatrixCreation(bucketKey) ? '' : getTodoCreationDueDate(bucketKey, today, focusView);
    const projectId = scope === 'project' ? currentProject?.id || null : isMatrixCreation(bucketKey) ? (projectFilter.length === 1 && projectOptions.some(p => p.id === projectFilter[0]) ? projectFilter[0] : null) : (quickAddProjectId === 'other' ? null : quickAddProjectId || null);
    return { dueDate, workDay: dueDate || fallbackDay, fallbackDay, projectId, repeat: 'none', quadrant: bucketKey.startsWith('matrix:') ? bucketKey.slice(7) : DEFAULT_MATRIX_QUADRANT, ...(creationDrafts.owner === currentUserId ? creationDrafts.values[bucketKey] : {}) };
  };
  const changeCreationDraft = (bucketKey, patch) => {
    quickAddDraftVersions.current[bucketKey] = (quickAddDraftVersions.current[bucketKey] || 0) + 1;
    const base = creationDraft(bucketKey);
    setCreationDrafts(previous => ({ owner: currentUserId, values: { ...(previous.owner === currentUserId ? previous.values : {}), [bucketKey]: { ...base, ...patch } } }));
  };
  const formatQuickAddDueHint = bucketKey => dueHint(creationDraft(bucketKey).dueDate);

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
    setQuickAddValues({}); setCreationDrafts({ owner: currentUserId, values: {} }); setCreationOpen(false);
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
  const personalPlanTodos = [...new Map([...candidates.mergedOpenTodos, ...[...creationRecords.current.records.values()].map(record => record.task ? allProjectManualTodos.find(task => task._id === record.task._id) || record.task : null).filter(Boolean)].map(task => [taskViewIdentity(task), task])).values()];
  const personalPlan = useTodoEisenhowerMatrix({
    currentUserId, isExternalView, enabled: !isExternalView || viewMode === 'matrix',
    todos: personalPlanTodos, today,
  });
  const latestPersonalPlan = useRef(personalPlan);
  latestPersonalPlan.current = personalPlan;
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
    if (options?.moveWorkDay && options.expectedPreference) {
      const preference = latestPersonalPlan.current.preferences[matrixReference(originalTodo)?.task_key];
      const expected = options.expectedPreference;
      if (!(options.retryPersonalOnly && preference?.planned_day === value) && ((preference?.id || null) !== expected.id || (preference?.version || null) !== expected.version || (preference?.planned_day || null) !== expected.day)) {
        setPlanNotice('Your personal day changed. Check it before rescheduling.'); return null;
      }
    }
    if (options?.retryPersonalOnly && originalTodo?.dueDate !== value) return null;
    const result = options?.retryPersonalOnly ? { confirmed: true, updatedTodo: originalTodo } : await onUpdateTodo(todoId, key, value, originalTodo, options);
    if (currentOwner.current !== currentUserId || deadlineOperations.current !== operationScope) return null;
    applyManualMutationResult(result);
    if (confirmedDateWrite && options?.moveWorkDay && result?.confirmed && result.updatedTodo?.dueDate === value) {
      const saved = await latestPersonalPlan.current.planDay(result.updatedTodo, value, options.expectedPreference);
      if (currentOwner.current !== currentUserId || deadlineOperations.current !== operationScope) return null;
      const identity = taskViewIdentity(result.updatedTodo);
      setPlanningDrafts(previous => {
        const values = previous.owner === currentUserId ? previous.values : {};
        const taskDraft = { ...values[identity] };
        if (saved) delete taskDraft.reschedulePending;
        else taskDraft.reschedulePending = { deadline: value, expectedPreference: options.expectedPreference };
        return { owner: currentUserId, values: { ...values, [identity]: taskDraft } };
      });
      return { ...result, personalPlanConfirmed: saved, personalPlanPending: !saved };
    }
    if (key === 'projectId' && result?.confirmed) {
      const name = projectOptions.find((project) => project.id === result.updatedTodo?.projectId)?.name || 'Other / no project';
      setPlanNotice(`Project saved: ${name}. The task remains in Tasks; project filters may hide it.`);
    }
    return result;
    } finally {
      if (confirmedDateWrite) {
        operationScope.ids.delete(todoId);
        if (deadlineOperations.current === operationScope && currentOwner.current === currentUserId) setDeadlineSaves((previous) => { const ids = { ...previous.ids }; delete ids[todoId]; return { owner: currentUserId, ids }; });
      }
    }
  }, [allTodoItems, applyManualMutationResult, onUpdateTodo, currentUserId, pendingCompletedTodos, projectOptions]);

  const descriptionDrafts = useTaskDescriptionDrafts(currentUserId, handleUpdateTodo, (task, saved) => {
    const message = `Description not saved for “${task.title || 'Untitled'}”. Reopen the task to retry; your text is kept.`;
    setPlanNotice(previous => saved ? (previous === message ? '' : previous) : message);
  });

  const handleDeleteTodo = useCallback(async (todoId) => {
    if (!onDeleteTodo || currentOwner.current !== currentUserId) return false;
    const operationScope = deadlineOperations.current;
    if (operationScope.ids.has(todoId)) { setPlanNotice('Wait for the task save before deleting this task.'); return false; }
    operationScope.ids.add(todoId);
    setDeadlineSaves(previous => ({ owner: currentUserId, ids: { ...(previous.owner === currentUserId ? previous.ids : {}), [todoId]: true } }));
    try {
    const originalTodo = allTodoItems.find(todo => (todo._id || todo.id) === todoId);
    if (originalTodo && !(await descriptionDrafts.prepareDelete(originalTodo))) return false;
    if (deadlineOperations.current !== operationScope || currentOwner.current !== currentUserId) return false;
    let deleted;
    try { deleted = await onDeleteTodo(todoId); }
    catch { deleted = false; }
    if (currentOwner.current !== currentUserId || deadlineOperations.current !== operationScope) return false;
    if (originalTodo) descriptionDrafts.finishDelete(originalTodo, deleted !== false);
    if (deleted === false) { setPlanNotice('Task not deleted. Reopen it to try again.'); return false; }
    sourceMutationRevision.current += 1;

    setAllProjectManualTodos((currentTodos) => (
      currentTodos.filter((todo) => (todo._id || todo.id) !== todoId)
    ));
    setSelectedTodo((currentTodo) => (
      currentTodo && (currentTodo._id || currentTodo.id) === todoId ? null : currentTodo
    ));
    return true;
    } finally {
      operationScope.ids.delete(todoId);
      if (deadlineOperations.current === operationScope && currentOwner.current === currentUserId) {
        setDeadlineSaves(previous => { const ids = { ...previous.ids }; delete ids[todoId]; return { owner: currentUserId, ids }; });
      }
    }
  }, [onDeleteTodo, currentUserId, allTodoItems, descriptionDrafts]);

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

  const handleQuickAddSubmit = async (bucketKey, reviewLatest = false) => {
    const rawTitle = quickAddValues[bucketKey] || '';
    const title = rawTitle.trim();
    const operation = quickAddOperations.current;
    const uiScope = quickAddUiScope.current;
    const draftVersion = quickAddDraftVersions.current[bucketKey] || 0;
    const records = creationRecords.current;
    let record = records.records.get(bucketKey);
    if ((!title && !record) || !onAddTodo || isExternalView || currentOwner.current !== currentUserId || operation.pending.has(bucketKey)) return;
    if (isMatrixCreation(bucketKey) && typeof navigator !== 'undefined' && !navigator.onLine) {
      setQuickAddStatus(previous => ({ context: quickAddContext, values: { ...(previous.context === quickAddContext ? previous.values : {}), [bucketKey]: { error: 'Reconnect to save a Matrix task and its personal plan. Your draft is kept.' } } }));
      return;
    }
    operation.pending.add(bucketKey);
    const publishStatus = (value) => {
      if (quickAddOperations.current !== operation || quickAddUiScope.current !== uiScope) return;
      setQuickAddStatus((previous) => ({ context: uiScope.context, values: { ...(previous.context === uiScope.context ? previous.values : {}), [bucketKey]: value } }));
    };
    publishStatus({ saving: true });
    if (record?.task) {
      if (reviewLatest) {
        const preference = latestPersonalPlan.current.preferences[matrixReference(record.task)?.task_key];
        record.expectedPreference = { id: preference?.id || null, version: preference?.version || null, day: preference?.planned_day || null };
      }
      record.stage = 'planning'; record.failed = false;
      setCreationRevision(value => value + 1);
      return;
    }
    const draft = record?.draft || creationDraft(bucketKey);
    if ((draft.dueDate && !validCalendarDay(draft.dueDate)) || (draft.workDay && !validCalendarDay(draft.workDay)) || (draft.projectId && !projectOptions.some(project => project.id === draft.projectId))) {
      operation.pending.delete(bucketKey);
      publishStatus({ error: 'Choose a valid date and an available project. Your draft is kept.' });
      return;
    }
    const destinationProjectId = draft.projectId || null;
    const targetSectionKey = buildTodoCalendarSections([{ dueDate: draft.dueDate, status: 'Open' }], { today, showFutureMonths: true }).sections.find(item => item.items.length)?.key || 'later';
    // Include filtered-out tasks so adding at the end never disturbs their order.
    const section = buildTodoCalendarSections(mergedOpenTodos.map((item) => {
      const position = cardOrderOverrides[buildTodoCardKey(item)];
      return Number.isFinite(Number(position)) ? { ...item, boardPosition: Number(position) } : item;
    }), { today, showFutureMonths: true }).sections.find((item) => item.key === targetSectionKey);
    const items = (section?.items || []).filter((item) => (item.projectId || null) === destinationProjectId);
    // A new title may shift fallback indices for derived tasks without an order.
    const appendPosition = Math.max(
      calculateTodoReorderPosition(items, items.length),
      items.some((item) => getStoredTodoOrder(item) === null) ? (items.length + 2) * TODO_ORDER_STEP : -Infinity,
    );
    if (!record) {
      record = { id: crypto.randomUUID(), draft, title, rawTitle, draftVersion, uiScope, operation, bucketKey,
        confirmedMode: isMatrixCreation(bucketKey) || typeof navigator === 'undefined' || navigator.onLine,
        payload: { title, projectId: destinationProjectId, dueDate: draft.dueDate || '', recurrence: draft.repeat === 'none' ? null : { type: draft.repeat, interval: 1 }, kanbanPosition: appendPosition } };
      records.records.set(bucketKey, record);
    }
    try {
      const addedTodo = await onAddTodo(record.payload, { requireConfirmation: record.confirmedMode, operationId: record.id });
      if (quickAddOperations.current !== operation || currentOwner.current !== currentUserId) return;
      if (!addedTodo) {
        record.uncertain = true;
        publishStatus({ error: 'Task was not added. Your text is kept; try again.' });
        return;
      }
      sourceMutationRevision.current += 1;
      setAllProjectManualTodos((currentTodos) => mergeManualTodoCollections(currentTodos, [addedTodo]));
      if (addedTodo.creationConfirmed && matrixReference(addedTodo)) {
        record.task = addedTodo; record.stage = 'planning'; record.failed = false;
        setCreationRevision(value => value + 1);
        return;
      }
      records.records.delete(bucketKey);
      if (quickAddUiScope.current !== uiScope) return;
      setQuickAddValues((previous) => (quickAddDraftVersions.current[bucketKey] || 0) === draftVersion && previous[bucketKey] === rawTitle ? { ...previous, [bucketKey]: '' } : previous);
      const filterHint = activeFilterCount || searchQuery || focusView !== TODO_FOCUS_VIEWS.all
        ? ' Current filters may hide it.' : '';
      publishStatus({ task: addedTodo, message: `Added “${record.title}”.${filterHint} Personal day is not confirmed${String(addedTodo._id).startsWith('offline-') ? '; task queued until reconnect' : ''}.` });
      window.requestAnimationFrame(() => {
        if (quickAddOperations.current === operation && quickAddUiScope.current === uiScope) quickAddInputRefs.current.get(bucketKey)?.focus();
      });
    } catch (failure) {
      const definitelyAbsent = failure?.definiteRejection && !record.uncertain;
      if (definitelyAbsent && !record.task) records.records.delete(bucketKey);
      else record.uncertain = true;
      publishStatus({ error: definitelyAbsent ? 'Task was rejected. Check the project and dates, then retry your retained draft.' : `Unable to confirm “${record.title}”. Retry this attempt; any newer draft is kept.` });
    } finally {
      if (!record.task) operation.pending.delete(bucketKey);
      if (quickAddOperations.current === operation) setQuickAddStatus((previous) => {
        const values = { ...previous.values };
        if (!record.task && values[bucketKey]?.saving) delete values[bucketKey];
        return { ...previous, values };
      });
    }
  };

  // Newly created tasks must enter the unfiltered candidate set and finish the
  // preference read before writing. Never bypass ready/covered-key protection.
  useEffect(() => {
    const records = creationRecords.current;
    if (records.owner !== currentUserId || !personalPlan.ready || personalPlan.offline) return;
    for (const record of records.records.values()) {
      if (!record.task || record.stage !== 'planning' || record.failed || record.processing) continue;
      const task = personalPlanTodos.find(item => item._id === record.task._id);
      if (!task) continue;
      record.processing = true;
      if (!record.expectedPreference) {
        const preference = personalPlan.preferences[matrixReference(task)?.task_key];
        record.expectedPreference = { id: preference?.id || null, version: preference?.version || null, day: preference?.planned_day || null };
      }
      const quadrant = isMatrixCreation(record.bucketKey) && !(task.dueDate && task.dueDate < today) ? record.draft.quadrant : undefined;
      void personalPlan.planTask(task, { day: record.draft.workDay || null, quadrant }, record.expectedPreference).then(saved => {
        if (creationRecords.current !== records || currentOwner.current !== records.owner) return;
        record.processing = false;
        record.operation.pending.delete(record.bucketKey);
        if (saved) {
          records.records.delete(record.bucketKey);
          if (quickAddUiScope.current === record.uiScope && (quickAddDraftVersions.current[record.bucketKey] || 0) === record.draftVersion) {
            setQuickAddValues(previous => previous[record.bucketKey] === record.rawTitle ? { ...previous, [record.bucketKey]: '' } : previous);
            setCreationDrafts(previous => { const values = { ...previous.values }; delete values[record.bucketKey]; return { ...previous, values }; });
          }
        } else record.failed = true;
        if (quickAddUiScope.current !== record.uiScope) return;
        const name = projectOptions.find(project => project.id === task.projectId)?.name || 'Other / no project';
        setQuickAddStatus(previous => ({ context: record.uiScope.context, values: { ...(previous.context === record.uiScope.context ? previous.values : {}), [record.bucketKey]: saved
          ? { task, message: `Added “${record.title}” · ${name} · ${dueHint(task.dueDate)}. Personal plan saved. Filters may hide it.` }
          : { task, retry: true, error: `“${record.title}” was added. Personal plan was not saved. Retry only the unfinished personal plan.` } } }));
      });
    }
  });

  const showCreatedTask = task => {
    clearAllFilters(); setSearchQuery(''); setScope('all'); setFocusView(TODO_FOCUS_VIEWS.all); setShowFutureMonths(true);
    setCreationOpen(false); setSelectedTodo(task);
  };
  const creationControls = bucketKey => <>
    {quickAddValues[bucketKey]?.trim() ? <TaskCreationFields draft={creationDraft(bucketKey)} onChange={patch => changeCreationDraft(bucketKey, patch)} today={today} projects={projectOptions} showProject={scope === 'all'} /> : null}
    {currentQuickAddStatus[bucketKey]?.retry ? <button type="button" className="min-h-11 px-3 text-xs font-semibold underline" onClick={() => handleQuickAddSubmit(bucketKey)}>Retry personal plan</button> : null}
    {currentQuickAddStatus[bucketKey]?.retry ? <p className="text-xs">Current personal day: {personalPlan.preferences[matrixReference(currentQuickAddStatus[bucketKey].task)?.task_key]?.planned_day || 'not set'}. Requested: {creationRecords.current.records.get(bucketKey)?.draft.workDay || 'not set'}. <button type="button" className="min-h-11 px-3 underline" onClick={() => handleQuickAddSubmit(bucketKey, true)}>Replace with my requested plan</button></p> : null}
    {currentQuickAddStatus[bucketKey]?.task ? <button type="button" className="min-h-11 px-3 text-xs font-semibold underline" onClick={() => showCreatedTask(currentQuickAddStatus[bucketKey].task)}>Show task</button> : null}
  </>;
  const openCreation = key => { setCreationKey(key); setCreationOpen(true); };
  const quadrantCreation = quadrant => {
    const key = `matrix:${quadrant.id}`;
    const draft = creationDraft(key), status = currentQuickAddStatus[key];
    const projectName = projectOptions.find(project => project.id === draft.projectId)?.name || 'No project';
    const savedTask = status?.task && !status.error && !status.saving && !quickAddValues[key]?.trim();
    const errorFeedback = /^Reconnect/i.test(status?.error || '') ? 'Offline — reconnect to save.' : /valid date|available project|check the project and dates/i.test(status?.error || '') ? 'Check project and dates.' : 'Not confirmed — retry this attempt.';
    const feedback = status?.saving ? 'Saving…' : status?.retry ? 'Task added. Personal plan needs retry.' : status?.error ? errorFeedback : savedTask ? `Added: ${status.task.title}` : `${projectName} · ${dueHint(draft.dueDate)}`;
    return <form aria-label={`Add task to ${quadrant.title}`} onSubmit={event => { event.preventDefault(); void handleQuickAddSubmit(key); }}>
      <div className="task-quadrant-add-row"><input aria-label={`New task in ${quadrant.title}`} aria-describedby={`quadrant-entry-${quadrant.id}`} placeholder="Add a task…" value={quickAddValues[key] || ''} onChange={event => setQuickAddValue(key, event.target.value)} ref={element => setQuickAddInputRef(key, element)} /><button type="button" className="task-quadrant-options" aria-label={`Task options in ${quadrant.title}`} title="Project, dates and repeat" onClick={() => openCreation(key)}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 6h14M3 14h14"/><circle cx="7" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="13" cy="14" r="2" fill="currentColor" stroke="none"/></svg><span className="task-quadrant-options-label">Options</span></button><button type={savedTask ? 'button' : 'submit'} className={`task-quadrant-submit ${savedTask ? 'is-confirmed' : ''}`} onClick={savedTask ? () => showCreatedTask(status.task) : undefined} disabled={status?.saving || (!savedTask && !quickAddValues[key]?.trim() && !status?.retry)} aria-label={savedTask ? `Show newly added task in ${quadrant.title}` : status?.retry ? `Retry personal plan in ${quadrant.title}` : `Save new task in ${quadrant.title}`} title={savedTask ? 'Added. Show task' : status?.retry ? 'Retry unfinished save' : 'Add task'}>{savedTask ? <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg> : <span aria-hidden="true">+</span>}</button></div>
      <div id={`quadrant-entry-${quadrant.id}`} className={`task-quadrant-add-options ${status?.error ? 'task-overdue' : savedTask ? 'is-confirmed' : ''}`} title={status?.error || status?.message || `${projectName} · ${dueHint(draft.dueDate)}${draft.workDay ? ` · Work: ${draft.workDay}` : ''}`}><span>{feedback}</span></div>
      {status ? <p role={status.error ? 'alert' : 'status'} className="sr-only">{status.saving ? 'Saving task and personal plan…' : status.error || status.message}</p> : null}
    </form>;
  };

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
    const projectItems = itemsWithoutDragged.filter((item) => (item.projectId || null) === (todo.projectId || null));
    const projectTargetIndex = itemsWithoutDragged.slice(0, adjustedTargetIndex)
      .filter((item) => (item.projectId || null) === (todo.projectId || null)).length;
    const nextPosition = calculateTodoReorderPosition(projectItems, projectTargetIndex);
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
    if (items[targetIndex]?.bucketKey === items[currentIndex]?.bucketKey
      && (items[targetIndex]?.item.projectId || null) !== (todo.projectId || null)) return false;
    if (todo.isDerived && items[targetIndex]?.bucketKey !== items[currentIndex]?.bucketKey) return false;
    return true;
  }, [canDragReorderTodo, getFlattenedReorderItems]);

  const handleTodoReorderMove = useCallback(async (todo, sourceBucketKey, displayIndex, direction) => {
    if (!canMoveTodoByOffset(todo, direction)) return;

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
  }, [canMoveTodoByOffset, getFlattenedReorderItems, persistTodoReorder]);

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
  const selectedPlanningControls = !isExternalView && selectedTodo && selectedTodo.status !== 'Done' ? <>
    {selectedTodo.status !== 'Done' ? <TaskPlanningControls presentation="editor" key={taskViewIdentity(selectedTodo)} todo={selectedTodo} matrix={personalPlan} today={today} deadlinePending={Boolean(currentDeadlineSaves[selectedTodo._id])} draft={currentDrafts[taskViewIdentity(selectedTodo)]} onDraftChange={(field, value, expected) => updatePlanningDraft(selectedTodo, field, value, expected)} onUpdateTodo={handleUpdateTodo} onOpenSourceTodo={onOpenSourceTodo} onNotice={setPlanNotice} /> : null}

  </> : null;
  const selectedSourcePlanControls = !isExternalView && selectedTodo && (onMoveToPlan || selectedTodo.planLink || selectedTodo.meta?.projectPlanLink) ? <TaskPlanSourceControls key={`promotion:${taskViewIdentity(selectedTodo)}`} todo={selectedTodo} projects={projectOptions} onMove={onMoveToPlan} onOpen={onOpenPlan} onReturn={onReturnFromPlan} /> : null;
  const selectedProjectAssignment = selectedTodo ? <TaskProjectAssignment key={`assignment:${taskViewIdentity(selectedTodo)}`} todo={selectedTodo} projects={projectOptions} canEdit={selectedTodoCanEdit} onUpdateTodo={handleUpdateTodo} /> : null;

  return (
    <div className="pm-task-ui w-full h-full p-4 sm:p-6 overflow-auto">
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
          onQuickCapture={isExternalView ? undefined : onQuickCapture}
          onAddMatrixTask={!isExternalView && onAddTodo ? () => openCreation('matrix') : undefined}
          quickCaptureStatus={isExternalView ? undefined : quickCaptureStatus}
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
          <TodoEisenhowerMatrix matrix={matrix} currentUserId={currentUserId} today={today} isMobile={isMobile} isExternalView={isExternalView} onOpenTodo={setSelectedTodo} onOpenSourceTodo={onOpenSourceTodo} onUpdateTodo={handleUpdateTodo} onNotice={setPlanNotice} planningDrafts={currentDrafts} onPlanningDraftChange={updatePlanningDraft} deadlineSaves={currentDeadlineSaves} handleCompleteTodo={handleCompleteTodo} getChecklistSummary={getChecklistSummaryForTodo} transientTodos={filteredTransientTodos} renderCreation={!isExternalView && onAddTodo ? quadrantCreation : undefined}/>
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
            creationControls={creationControls}
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
                creationControls={creationControls}
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

      {creationOpen && !isExternalView ? <TaskCreationDialog key={`${currentUserId}:${creationKey}`} title={quickAddValues[creationKey] || ''} setTitle={value => setQuickAddValue(creationKey, value)} draft={creationDraft(creationKey)} onChange={patch => changeCreationDraft(creationKey, patch)} today={today} projects={projectOptions} onSubmit={() => handleQuickAddSubmit(creationKey)} onReviewRetry={() => handleQuickAddSubmit(creationKey, true)} currentPersonalDay={personalPlan.preferences[matrixReference(currentQuickAddStatus[creationKey]?.task)?.task_key]?.planned_day} requestedPersonalDay={creationRecords.current.records.get(creationKey)?.draft.workDay} onClose={() => setCreationOpen(false)} status={currentQuickAddStatus[creationKey]} onShowTask={showCreatedTask} /> : null}
      {sourceCurrent && selectedTodo ? (
        <TodoDetailDialog
          key={`${currentUserId}:${taskViewIdentity(selectedTodo)}`}
          isMobile={isMobile}
          sourcePlanControls={selectedSourcePlanControls}
          projectAssignmentControls={selectedProjectAssignment}
          planningControls={selectedPlanningControls}
          todo={selectedTodo}
          canEdit={selectedTodoCanEdit}
          projectOptions={projectOptions}
          onClose={() => setSelectedTodo(null)}
          onDeleteTodo={handleDeleteTodo}
          onUpdateTodo={handleUpdateTodo}
          descriptionDraft={descriptionDrafts.read(selectedTodo)}
          onDescriptionChange={value => descriptionDrafts.change(selectedTodo, value)}
          onSaveDescription={() => descriptionDrafts.save(selectedTodo)}
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
