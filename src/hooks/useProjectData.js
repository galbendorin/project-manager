import { useState, useCallback, useEffect, useRef } from 'react';
import { calculateSchedule, getNextId, getCurrentDate, getFinishDate } from '../utils/helpers';
import { DEFAULT_TASK, SCHEMAS } from '../utils/constants';
import { buildDemoProjectPayload, buildDemoScheduleTasks } from '../utils/demoProjectBuilder';
import { supabase } from '../lib/supabase';
import { createEmptyRegisters, createEmptyStatusReport } from './projectData/defaults';
import { normalizeLoadedProjectState, buildProjectUpdatePayload } from './projectData/loadSave';
import {
  buildProjectSyncOp,
  enqueueProjectSyncOp,
  applyProjectSyncQueueToState,
} from './projectData/projectSync';
import {
  addTrackedActionIfMissing,
  removeTrackedAction,
  syncTrackedActionFromTask,
  buildRegisterItem,
  updateRegisterItemInState,
  patchRegisterItemInState,
  deleteRegisterItemFromState,
  toggleRegisterItemPublicInState
} from './projectData/registers';
import {
  createLocalManualTodo,
  buildLocalTodoUpdate,
  applyTodoUpdateToState,
  buildTodoUpdatePatch,
  buildRecurringFollowUpInsert
} from './projectData/todos';
import {
  MANUAL_TODO_SELECT,
  mapManualTodoRow,
  isMissingRelationError
} from './projectData/manualTodoUtils';
import { getTodoCompletionDescriptor } from './projectData/todoCompletion';
import {
  buildProjectSnapshotKey,
  createOfflineTempId,
  isOfflineTempId,
  readOfflineJson,
  writeLocalJson
} from '../utils/offlineState';
import {
  enqueueCreate,
  enqueueDelete,
  enqueueUpdate,
  replaceQueuedTargetId
} from '../utils/offlineQueue';
import {
  isDirectProjectMutationFallbackError,
  syncProjectRegisterDelete,
  syncProjectRegisterPatch,
  syncProjectRegisterUpsert,
  syncProjectStatusReportField,
} from './projectData/directProjectMutations';

// Helper: get ISO timestamp
const now = () => new Date().toISOString();

const buildManualTodoInsertPayload = (todo, userId) => ({
  user_id: userId,
  project_id: todo.projectId || null,
  title: todo.title || '',
  due_date: todo.dueDate || null,
  owner_text: todo.owner || '',
  assignee_user_id: todo.assigneeUserId || userId || null,
  status: todo.status === 'Done' ? 'Done' : 'Open',
  recurrence: todo.recurrence,
  completed_at: todo.completedAt || null,
});

const buildManualTodoUpdatePayload = (patch = {}) => {
  const nextPatch = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'projectId')) nextPatch.project_id = patch.projectId || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'title')) nextPatch.title = patch.title || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'dueDate')) nextPatch.due_date = patch.dueDate || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'owner')) nextPatch.owner_text = patch.owner || '';
  if (Object.prototype.hasOwnProperty.call(patch, 'assigneeUserId')) nextPatch.assignee_user_id = patch.assigneeUserId || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) nextPatch.status = patch.status === 'Done' ? 'Done' : 'Open';
  if (Object.prototype.hasOwnProperty.call(patch, 'recurrence')) nextPatch.recurrence = patch.recurrence || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'completedAt')) nextPatch.completed_at = patch.completedAt || null;
  if (Object.prototype.hasOwnProperty.call(patch, 'updatedAt')) nextPatch.updated_at = patch.updatedAt;
  return nextPatch;
};

const buildQueuedManualTodo = (todoId, record = {}) => ({
  _id: todoId,
  projectId: record.projectId || null,
  title: record.title || 'New Task',
  dueDate: record.dueDate || '',
  owner: record.owner || 'PM',
  assigneeUserId: record.assigneeUserId || null,
  status: record.status === 'Done' ? 'Done' : 'Open',
  recurrence: record.recurrence || null,
  createdAt: record.createdAt || now(),
  updatedAt: record.updatedAt || record.createdAt || now(),
  completedAt: record.completedAt || ''
});

const applyManualTodoLocalPatch = (todo, patch = {}) => ({
  ...todo,
  projectId: Object.prototype.hasOwnProperty.call(patch, 'projectId') ? (patch.projectId || null) : todo.projectId,
  title: Object.prototype.hasOwnProperty.call(patch, 'title') ? (patch.title || '') : todo.title,
  dueDate: Object.prototype.hasOwnProperty.call(patch, 'dueDate') ? (patch.dueDate || '') : todo.dueDate,
  owner: Object.prototype.hasOwnProperty.call(patch, 'owner') ? (patch.owner || '') : todo.owner,
  assigneeUserId: Object.prototype.hasOwnProperty.call(patch, 'assigneeUserId') ? (patch.assigneeUserId || null) : todo.assigneeUserId,
  status: Object.prototype.hasOwnProperty.call(patch, 'status') ? (patch.status === 'Done' ? 'Done' : 'Open') : todo.status,
  recurrence: Object.prototype.hasOwnProperty.call(patch, 'recurrence') ? (patch.recurrence || null) : todo.recurrence,
  updatedAt: patch.updatedAt || todo.updatedAt,
  completedAt: Object.prototype.hasOwnProperty.call(patch, 'completedAt') ? (patch.completedAt || '') : todo.completedAt
});

const applyQueuedTodoChanges = (baseTodos = [], queue = []) => {
  let next = Array.isArray(baseTodos) ? [...baseTodos] : [];

  for (const op of Array.isArray(queue) ? queue : []) {
    if (!op?.kind) continue;

    if (op.kind === 'create') {
      const queuedTodo = buildQueuedManualTodo(op.targetId, op.record);
      const existingIndex = next.findIndex((item) => item._id === op.targetId);
      if (existingIndex === -1) {
        next.push(queuedTodo);
      } else {
        next[existingIndex] = queuedTodo;
      }
      continue;
    }

    if (op.kind === 'update') {
      next = next.map((item) => (
        item._id === op.targetId ? applyManualTodoLocalPatch(item, op.patch) : item
      ));
      continue;
    }

    if (op.kind === 'delete') {
      next = next.filter((item) => item._id !== op.targetId);
    }
  }

  return next;
};

const STATUS_REPORT_FIELD_LABELS = {
  overallRag: 'Overall RAG',
  overallNarrative: 'Overall narrative',
  mainRisks: 'Main risks',
  mainIssues: 'Main issues',
  deliverablesThisPeriod: 'Deliverables this period',
  deliverablesNextPeriod: 'Deliverables next period',
  additionalNotes: 'Additional notes',
};

const buildProjectPlanSignature = ({
  projectData,
  tracker,
  baseline,
}) => JSON.stringify({
  tasks: projectData,
  tracker,
  baseline,
});

const buildProjectCollaborativeSignature = ({
  registers,
  statusReport,
}) => JSON.stringify({
  registers,
  statusReport,
});

/**
 * Custom hook for managing project data (tasks, registers, tracker, status report, and todos)
 * With Supabase persistence, baseline support, and timestamps
 */
export const useProjectData = (projectId, userId = null) => {
  const [projectData, setProjectData] = useState([]);
  const [registers, setRegisters] = useState(() => createEmptyRegisters());
  const [tracker, setTracker] = useState([]);
  const [statusReport, setStatusReport] = useState(() => createEmptyStatusReport());
  const [todos, setTodos] = useState([]);
  const [baseline, setBaselineState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  ));
  const [offlinePendingSync, setOfflinePendingSync] = useState(false);
  const [usingOfflineSnapshot, setUsingOfflineSnapshot] = useState(false);
  const [todoQueue, setTodoQueue] = useState([]);
  const [todoQueueRetryToken, setTodoQueueRetryToken] = useState(0);
  const [projectSyncQueue, setProjectSyncQueue] = useState([]);
  const [projectSyncRetryToken, setProjectSyncRetryToken] = useState(0);

  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef(null);
  const projectVersionRef = useRef(1);
  const supportsManualTodosTableRef = useRef(true);
  const todoQueueRef = useRef([]);
  const syncingTodoQueueRef = useRef(false);
  const todoQueueRetryTimeoutRef = useRef(null);
  const projectSyncQueueRef = useRef([]);
  const syncingProjectQueueRef = useRef(false);
  const supportsDirectProjectMutationsRef = useRef(true);
  const registersRef = useRef(createEmptyRegisters());
  const statusReportRef = useRef(createEmptyStatusReport());
  const lastPersistedPlanSignatureRef = useRef('');
  const lastPersistedCollaborativeSignatureRef = useRef('');
  const snapshotKey = buildProjectSnapshotKey(projectId, userId || 'anon');

  useEffect(() => {
    todoQueueRef.current = todoQueue;
  }, [todoQueue]);

  useEffect(() => {
    projectSyncQueueRef.current = projectSyncQueue;
  }, [projectSyncQueue]);

  useEffect(() => {
    registersRef.current = registers;
  }, [registers]);

  useEffect(() => {
    statusReportRef.current = statusReport;
  }, [statusReport]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => () => {
    if (todoQueueRetryTimeoutRef.current) {
      window.clearTimeout(todoQueueRetryTimeoutRef.current);
    }
  }, []);

  // Load project data from Supabase
  const loadProject = useCallback(async () => {
    if (!projectId) return;

    setLoadingData(true);
    initialLoadDone.current = false;
    supportsDirectProjectMutationsRef.current = true;
    setSaveConflict(false);
    setSaveError(null);
    setRemoteUpdateAvailable(false);

    const cachedSnapshot = await readOfflineJson(snapshotKey, null);
    const cachedTodoQueue = Array.isArray(cachedSnapshot?.todoQueue) ? cachedSnapshot.todoQueue : [];
    const cachedProjectSyncQueue = Array.isArray(cachedSnapshot?.projectSyncQueue) ? cachedSnapshot.projectSyncQueue : [];
    const pendingTodoQueue = todoQueueRef.current.length > 0 ? todoQueueRef.current : cachedTodoQueue;
    const pendingProjectSyncQueue = projectSyncQueueRef.current.length > 0
      ? projectSyncQueueRef.current
      : cachedProjectSyncQueue;
    if (cachedSnapshot) {
      const cachedProjectState = applyProjectSyncQueueToState({
        tasks: cachedSnapshot.tasks || [],
        registers: cachedSnapshot.registers || createEmptyRegisters(),
        baseline: cachedSnapshot.baseline || null,
        tracker: cachedSnapshot.tracker || [],
        statusReport: cachedSnapshot.statusReport || createEmptyStatusReport(),
      }, pendingProjectSyncQueue);

      setProjectData(cachedProjectState.tasks || []);
      setRegisters(cachedProjectState.registers || createEmptyRegisters());
      setBaselineState(cachedProjectState.baseline || null);
      setTracker(cachedProjectState.tracker || []);
      setStatusReport(cachedProjectState.statusReport || createEmptyStatusReport());
      setTodos(cachedSnapshot.todos || []);
      setTodoQueue(pendingTodoQueue);
      setProjectSyncQueue(pendingProjectSyncQueue);
      projectVersionRef.current = Number.isInteger(cachedSnapshot.version) ? cachedSnapshot.version : 1;
      lastPersistedPlanSignatureRef.current = buildProjectPlanSignature({
        projectData: cachedProjectState.tasks || [],
        tracker: cachedProjectState.tracker || [],
        baseline: cachedProjectState.baseline || null,
      });
      lastPersistedCollaborativeSignatureRef.current = pendingProjectSyncQueue.length === 0
        ? buildProjectCollaborativeSignature({
            registers: cachedProjectState.registers || createEmptyRegisters(),
            statusReport: cachedProjectState.statusReport || createEmptyStatusReport(),
          })
        : '';
      setUsingOfflineSnapshot(true);
      setOfflinePendingSync(pendingTodoQueue.length > 0 || pendingProjectSyncQueue.length > 0);
      setLoadingData(false);
    }

    let loadQuery = supabase
      .from('projects')
      .select('tasks, registers, baseline, tracker, status_report, version')
      .eq('id', projectId);
    const { data, error } = await loadQuery.single();

    if (!error && data) {
      const normalizedState = normalizeLoadedProjectState(data, now);
      let nextTodos = [];

      if (userId && supportsManualTodosTableRef.current) {
        const { data: todoRows, error: todoError } = await supabase
          .from('manual_todos')
          .select(MANUAL_TODO_SELECT)
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        if (!todoError) {
          nextTodos = applyQueuedTodoChanges((todoRows || []).map(mapManualTodoRow), pendingTodoQueue);
          setTodos(nextTodos);
        } else if (isMissingRelationError(todoError, 'manual_todos')) {
          supportsManualTodosTableRef.current = false;
          nextTodos = applyQueuedTodoChanges([], pendingTodoQueue);
          setTodos(nextTodos);
        } else {
          console.error('Failed to load manual todos:', todoError);
          nextTodos = applyQueuedTodoChanges([], pendingTodoQueue);
          setTodos(nextTodos);
        }
      } else {
        nextTodos = applyQueuedTodoChanges([], pendingTodoQueue);
        setTodos(nextTodos);
      }

      const mergedProjectState = applyProjectSyncQueueToState({
        tasks: normalizedState.tasks,
        registers: normalizedState.registers,
        baseline: normalizedState.baseline,
        tracker: normalizedState.tracker,
        statusReport: normalizedState.statusReport,
      }, pendingProjectSyncQueue);

      setProjectData(mergedProjectState.tasks);
      setRegisters(mergedProjectState.registers);
      setBaselineState(mergedProjectState.baseline);
      setTracker(mergedProjectState.tracker);
      setStatusReport(mergedProjectState.statusReport);
      setTodoQueue(pendingTodoQueue);
      setProjectSyncQueue(pendingProjectSyncQueue);
      projectVersionRef.current = normalizedState.version;
      lastPersistedPlanSignatureRef.current = buildProjectPlanSignature({
        projectData: mergedProjectState.tasks,
        tracker: mergedProjectState.tracker,
        baseline: mergedProjectState.baseline,
      });
      lastPersistedCollaborativeSignatureRef.current = pendingProjectSyncQueue.length === 0
        ? buildProjectCollaborativeSignature({
            registers: mergedProjectState.registers,
            statusReport: mergedProjectState.statusReport,
          })
        : '';
      setUsingOfflineSnapshot(false);
      setOfflinePendingSync(pendingTodoQueue.length > 0 || pendingProjectSyncQueue.length > 0);
      writeLocalJson(snapshotKey, {
        tasks: mergedProjectState.tasks,
        registers: mergedProjectState.registers,
        baseline: mergedProjectState.baseline,
        tracker: mergedProjectState.tracker,
        statusReport: mergedProjectState.statusReport,
        todos: nextTodos,
        todoQueue: pendingTodoQueue,
        projectSyncQueue: pendingProjectSyncQueue,
        version: normalizedState.version,
        cachedAt: now(),
      });
    } else if (error) {
      if (cachedSnapshot) {
        setSaveError(null);
      } else {
        setSaveError(`Unable to load project: ${error.message}`);
      }
    }

    setLoadingData(false);
    setTimeout(() => {
      initialLoadDone.current = true;
    }, 500);
  }, [projectId, snapshotKey, userId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Auto-save to Supabase (debounced)
  useEffect(() => {
    if (!projectId || !initialLoadDone.current || saveConflict) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const currentPlanSignature = buildProjectPlanSignature({
      projectData,
      tracker,
      baseline,
    });
    const currentCollaborativeSignature = buildProjectCollaborativeSignature({
      registers,
      statusReport,
    });

    if (supportsDirectProjectMutationsRef.current && projectSyncQueue.length > 0) {
      return undefined;
    }

    if (
      currentPlanSignature === lastPersistedPlanSignatureRef.current
      && currentCollaborativeSignature === lastPersistedCollaborativeSignatureRef.current
    ) {
      return undefined;
    }

    if (!isOnline) {
      setOfflinePendingSync(true);
      setSaving(false);
      return undefined;
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const updateData = buildProjectUpdatePayload({
        projectData,
        registers,
        tracker,
        statusReport,
        baseline
      });

      const expectedVersion = projectVersionRef.current;

      let saveQuery = supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('version', expectedVersion)
        .select('version');
      const { data, error } = await saveQuery.maybeSingle();

      if (!error && data && Number.isInteger(data.version)) {
        projectVersionRef.current = data.version;
        lastPersistedPlanSignatureRef.current = currentPlanSignature;
        lastPersistedCollaborativeSignatureRef.current = currentCollaborativeSignature;
        setLastSaved(new Date());
        setSaveConflict(false);
        setRemoteUpdateAvailable(false);
        setOfflinePendingSync(false);
        setUsingOfflineSnapshot(false);
        setProjectSyncQueue([]);
      } else if (!error && !data) {
        setSaveConflict(true);
        setSaveError('Save conflict detected. This project was changed in another tab or session. Click Reload Latest.');
      } else if (error) {
        setSaveError(`Save failed: ${error.message}`);
      }

      setSaving(false);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectData, registers, tracker, statusReport, baseline, projectId, userId, saveConflict, isOnline, projectSyncRetryToken, projectSyncQueue.length]);

  useEffect(() => {
    if (!projectId || !initialLoadDone.current) return;

    writeLocalJson(snapshotKey, {
      tasks: projectData,
      registers,
      baseline,
      tracker,
      statusReport,
      todos,
      todoQueue,
      projectSyncQueue,
      version: projectVersionRef.current,
      cachedAt: now(),
    });
  }, [baseline, projectData, projectId, projectSyncQueue, registers, snapshotKey, statusReport, todoQueue, todos, tracker]);

  // Warn user if they close the tab with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (saveTimeoutRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!projectId || loadingData || !isOnline) return undefined;

    let cancelled = false;

    const checkForRemoteUpdates = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const { data, error } = await supabase
        .from('projects')
        .select('version')
        .eq('id', projectId)
        .maybeSingle();

      if (cancelled || error || !data || !Number.isInteger(data.version)) return;

      if (data.version > projectVersionRef.current) {
        setRemoteUpdateAvailable(true);
      }
    };

    const intervalId = window.setInterval(() => {
      void checkForRemoteUpdates();
    }, 20_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [projectId, loadingData, isOnline]);

  useEffect(() => {
    if (!projectId || !userId || !supportsManualTodosTableRef.current || !isOnline || todoQueue.length === 0) {
      return undefined;
    }

    if (syncingTodoQueueRef.current) return undefined;

    let cancelled = false;
    const scheduleRetry = () => {
      if (todoQueueRetryTimeoutRef.current) {
        window.clearTimeout(todoQueueRetryTimeoutRef.current);
      }
      todoQueueRetryTimeoutRef.current = window.setTimeout(() => {
        setTodoQueueRetryToken((value) => value + 1);
      }, 5000);
    };

    const syncTodoQueue = async () => {
      syncingTodoQueueRef.current = true;

      try {
        while (!cancelled && todoQueueRef.current.length > 0) {
          const [op] = todoQueueRef.current;
          if (!op) break;

          if (op.kind === 'create') {
            const { data, error } = await supabase
              .from('manual_todos')
              .insert(buildManualTodoInsertPayload(buildQueuedManualTodo(op.targetId, op.record), userId))
              .select(MANUAL_TODO_SELECT)
              .single();

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              setTodoQueue([]);
              break;
            }

            if (error || !data) {
              console.error('Failed to sync queued manual todo create:', error);
              scheduleRetry();
              break;
            }

            const savedTodo = mapManualTodoRow(data);
            const previousId = op.targetId;
            if (todoQueueRetryTimeoutRef.current) {
              window.clearTimeout(todoQueueRetryTimeoutRef.current);
              todoQueueRetryTimeoutRef.current = null;
            }

            setTodos((prev) => prev.map((item) => (
              item._id === previousId ? savedTodo : item
            )));
            setTodoQueue((prev) => replaceQueuedTargetId(prev.slice(1), previousId, savedTodo._id));
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
            continue;
          }

          if (op.kind === 'update') {
            const { data, error } = await supabase
              .from('manual_todos')
              .update(buildManualTodoUpdatePayload(op.patch))
              .eq('id', op.targetId)
              .select(MANUAL_TODO_SELECT)
              .single();

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              setTodoQueue([]);
              break;
            }

            if (error || !data) {
              console.error('Failed to sync queued manual todo update:', error);
              scheduleRetry();
              break;
            }

            const savedTodo = mapManualTodoRow(data);
            if (todoQueueRetryTimeoutRef.current) {
              window.clearTimeout(todoQueueRetryTimeoutRef.current);
              todoQueueRetryTimeoutRef.current = null;
            }
            setTodos((prev) => prev.map((item) => (
              item._id === op.targetId ? savedTodo : item
            )));
            setTodoQueue((prev) => prev.slice(1));
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
            continue;
          }

          if (op.kind === 'delete') {
            const { error } = await supabase
              .from('manual_todos')
              .delete()
              .eq('id', op.targetId);

            if (error && isMissingRelationError(error, 'manual_todos')) {
              supportsManualTodosTableRef.current = false;
              setTodoQueue([]);
              break;
            }

            if (error) {
              console.error('Failed to sync queued manual todo delete:', error);
              scheduleRetry();
              break;
            }

            if (todoQueueRetryTimeoutRef.current) {
              window.clearTimeout(todoQueueRetryTimeoutRef.current);
              todoQueueRetryTimeoutRef.current = null;
            }
            setTodoQueue((prev) => prev.slice(1));
            setLastSaved(new Date());
            setUsingOfflineSnapshot(false);
          }
        }
      } finally {
        syncingTodoQueueRef.current = false;
      }
    };

    void syncTodoQueue();

    return () => {
      cancelled = true;
    };
  }, [projectId, userId, isOnline, todoQueue.length, todoQueueRetryToken]);

  useEffect(() => {
    if (!projectId || !isOnline || projectSyncQueue.length === 0 || !supportsDirectProjectMutationsRef.current) {
      return undefined;
    }

    if (syncingProjectQueueRef.current) return undefined;

    let cancelled = false;

    const syncProjectQueue = async () => {
      syncingProjectQueueRef.current = true;

      try {
        while (!cancelled && projectSyncQueueRef.current.length > 0) {
          const [op] = projectSyncQueueRef.current;
          if (!op?.kind) break;

          let result = { data: null, error: null };

          if (op.kind === 'status-update') {
            result = await syncProjectStatusReportField({
              projectId,
              key: op.payload?.key,
              value: op.payload?.value ?? '',
            });
          } else if (op.kind === 'register-add') {
            const items = Array.isArray(op.payload?.itemsData) ? op.payload.itemsData : [];

            if (items.length > 0) {
              for (const item of items) {
                result = await syncProjectRegisterUpsert({
                  projectId,
                  registerType: op.payload?.registerType,
                  itemData: item,
                });

                if (result.error) break;
              }
            } else {
              result = await syncProjectRegisterUpsert({
                projectId,
                registerType: op.payload?.registerType,
                itemData: op.payload?.itemData,
              });
            }
          } else if (op.kind === 'register-update') {
            result = await syncProjectRegisterPatch({
              projectId,
              registerType: op.payload?.registerType,
              itemId: op.payload?.itemId,
              patch: op.payload?.patch,
            });
          } else if (op.kind === 'register-delete') {
            result = await syncProjectRegisterDelete({
              projectId,
              registerType: op.payload?.registerType,
              itemId: op.payload?.itemId,
            });
          } else {
            setProjectSyncQueue((prev) => prev.slice(1));
            continue;
          }

          if (result.error) {
            if (isDirectProjectMutationFallbackError(result.error)) {
              supportsDirectProjectMutationsRef.current = false;
              setProjectSyncRetryToken((value) => value + 1);
              break;
            }

            setSaveError(`Project sync failed: ${result.error.message}`);
            break;
          }

          if (result.data?.version && Number.isInteger(result.data.version)) {
            projectVersionRef.current = result.data.version;
          }

          setSaveError(null);
          setSaveConflict(false);
          setRemoteUpdateAvailable(false);
          setUsingOfflineSnapshot(false);
          setLastSaved(new Date());

          const remainingQueue = projectSyncQueueRef.current.slice(1);
          projectSyncQueueRef.current = remainingQueue;
          setProjectSyncQueue(remainingQueue);

          if (remainingQueue.length === 0) {
            lastPersistedCollaborativeSignatureRef.current = buildProjectCollaborativeSignature({
              registers: registersRef.current,
              statusReport: statusReportRef.current,
            });
            setOfflinePendingSync(todoQueueRef.current.length > 0);
          }
        }
      } finally {
        syncingProjectQueueRef.current = false;
      }
    };

    void syncProjectQueue();

    return () => {
      cancelled = true;
    };
  }, [isOnline, projectId, projectSyncQueue.length, projectSyncRetryToken]);

  useEffect(() => {
    if (todoQueue.length === 0 && projectSyncQueue.length === 0 && !saveTimeoutRef.current && !saving) {
      setOfflinePendingSync(false);
    } else if (todoQueue.length > 0 || projectSyncQueue.length > 0) {
      setOfflinePendingSync(true);
    }
  }, [projectSyncQueue.length, saving, todoQueue.length]);

  const reloadProject = useCallback(async () => {
    await loadProject();
  }, [loadProject]);

  const retryProjectSync = useCallback(() => {
    setSaveConflict(false);
    setSaveError(null);
    setProjectSyncRetryToken((value) => value + 1);
  }, []);

  const queueProjectSyncOp = useCallback((op) => {
    setProjectSyncQueue((prev) => enqueueProjectSyncOp(prev, op));
    setOfflinePendingSync(true);
  }, []);

  // Set baseline
  const setBaseline = useCallback(() => {
    const baselineData = projectData.map(task => ({
      id: task.id,
      start: task.start,
      dur: task.dur,
      finish: getFinishDate(task.start, task.dur)
    }));
    setBaselineState(baselineData);
  }, [projectData]);

  const clearBaseline = useCallback(() => {
    setBaselineState(null);
  }, []);

  // Add a new task — with timestamps
  const addTask = useCallback((taskData, insertAfterId = null) => {
    setProjectData(prev => {
      const newTask = {
        ...DEFAULT_TASK,
        ...taskData,
        id: getNextId(prev),
        createdAt: now(),
        updatedAt: now()
      };

      if (insertAfterId !== null) {
        const idx = prev.findIndex(t => t.id === insertAfterId);
        const newData = [...prev];
        newData.splice(idx + 1, 0, newTask);
        return calculateSchedule(newData);
      }

      return calculateSchedule([...prev, newTask]);
    });
  }, []);

  // Update a task — stamp updatedAt
  const updateTask = useCallback((taskId, updates) => {
    setProjectData(prev => {
      const newData = prev.map(task =>
        task.id === taskId ? { ...task, ...updates, updatedAt: now() } : task
      );
      return calculateSchedule(newData);
    });

    // Also update tracker if this task is tracked
    setTracker(prev => {
      const trackerItem = prev.find(t => t.taskId === taskId);
      if (!trackerItem) return prev;
      return prev.map(item => {
        if (item.taskId === taskId) {
          const updatedItem = { ...item, updatedAt: now(), lastUpdated: getCurrentDate() };
          if (updates.name) updatedItem.taskName = updates.name;
          if (updates.pct !== undefined) {
            if (updates.pct === 100) updatedItem.status = 'Completed';
            else if (updates.pct > 0 && updatedItem.status === 'Not Started') updatedItem.status = 'In Progress';
          }
          return updatedItem;
        }
        return item;
      });
    });
  }, []);

  // Delete a task
  const deleteTask = useCallback((taskId) => {
    setProjectData(prev => prev.filter(t => t.id !== taskId));
    setRegisters(prev => ({
      ...prev,
      actions: prev.actions.filter(a => a._id !== `track_${taskId}`)
    }));
    setTracker(prev => prev.filter(t => t.taskId !== taskId));
  }, []);

  // Modify hierarchy — stamp updatedAt
  const modifyHierarchy = useCallback((taskId, delta) => {
    setProjectData(prev => {
      return prev.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            indent: Math.max(0, (task.indent || 0) + delta),
            updatedAt: now()
          };
        }
        return task;
      });
    });
  }, []);

  // Toggle task tracking (actions register)
  const toggleTrackTask = useCallback((taskId, isTracked) => {
    updateTask(taskId, { tracked: isTracked });
    
    const task = projectData.find(t => t.id === taskId);
    if (!task) return;
    
    if (isTracked) {
      setRegisters(prev => addTrackedActionIfMissing(prev, taskId, task, now()));
    } else {
      setRegisters(prev => removeTrackedAction(prev, taskId));
    }
  }, [projectData, updateTask]);

  // Update tracked actions
  const updateTrackedActions = useCallback((task) => {
    setRegisters(prev => syncTrackedActionFromTask(prev, task, now()));
  }, []);

  // ==================== TRACKER FUNCTIONS ====================

  const sendToTracker = useCallback((taskId) => {
    const task = projectData.find(t => t.id === taskId);
    if (!task) return;

    setTracker(prev => {
      if (prev.find(t => t.taskId === taskId)) return prev;
      return [...prev, {
        _id: `tracker_${taskId}_${Date.now()}`,
        taskId: taskId,
        taskName: task.name,
        rowColor: task.rowColor || null,
        notes: '',
        status: task.pct === 100 ? 'Completed' : task.pct > 0 ? 'In Progress' : 'Not Started',
        rag: 'Green',
        nextAction: '',
        owner: '',
        dateAdded: getCurrentDate(),
        lastUpdated: getCurrentDate(),
        createdAt: now(),
        updatedAt: now()
      }];
    });
  }, [projectData]);

  const addManualTrackerItem = useCallback((name = 'New Item') => {
    setTracker(prev => [...prev, {
      _id: `tracker_manual_${Date.now()}`,
      taskId: null,
      taskName: name,
      rowColor: null,
      notes: '',
      status: 'Not Started',
      rag: 'Green',
      nextAction: '',
      owner: '',
      dateAdded: getCurrentDate(),
      lastUpdated: getCurrentDate(),
      createdAt: now(),
      updatedAt: now()
    }]);
  }, []);

  const removeFromTracker = useCallback((trackerId) => {
    setTracker(prev => prev.filter(t => t._id !== trackerId));
  }, []);

  const updateTrackerItem = useCallback((trackerId, key, value) => {
    setTracker(prev => prev.map(item =>
      item._id === trackerId
        ? { ...item, [key]: value, lastUpdated: getCurrentDate(), updatedAt: now() }
        : item
    ));
  }, []);

  const reorderTrackerItems = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    setTracker((prev) => {
      const sourceIndex = prev.findIndex((item) => item._id === sourceId);
      const targetIndex = prev.findIndex((item) => item._id === targetId);

      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      const [movedItem] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return next;
    });
  }, []);

  const isInTracker = useCallback((taskId) => {
    return tracker.some(t => t.taskId === taskId);
  }, [tracker]);

  // ==================== STATUS REPORT FUNCTIONS ====================

  const updateStatusReport = useCallback((key, value) => {
    setStatusReport(prev => ({ ...prev, [key]: value }));
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'status-update',
      targetKey: `status:${key}`,
      label: `Updated ${STATUS_REPORT_FIELD_LABELS[key] || key}`,
      detail: 'Will sync to the project summary when saved.',
      payload: { key, value },
    }));
  }, [queueProjectSyncOp]);

  // ==================== TODO FUNCTIONS ====================

  const addTodo = useCallback(async (todoData = {}) => {
    const ts = now();
    const localTodoBase = createLocalManualTodo({ todoData, projectId, userId, ts });

    if (!userId || !supportsManualTodosTableRef.current) {
      setTodos(prev => [...prev, localTodoBase]);
      return localTodoBase;
    }

    if (!isOnline) {
      const localTodo = {
        ...localTodoBase,
        _id: createOfflineTempId('offline-todo')
      };
      setTodos(prev => [...prev, localTodo]);
      setTodoQueue(prev => enqueueCreate(prev, {
        localId: localTodo._id,
        projectId: localTodo.projectId,
        title: localTodo.title,
        dueDate: localTodo.dueDate,
        owner: localTodo.owner,
        assigneeUserId: localTodo.assigneeUserId,
        status: localTodo.status,
        recurrence: localTodo.recurrence,
        createdAt: localTodo.createdAt,
        updatedAt: localTodo.updatedAt,
        completedAt: localTodo.completedAt,
      }));
      setOfflinePendingSync(true);
      return localTodo;
    }

    const { data, error } = await supabase
      .from('manual_todos')
      .insert({
        user_id: userId,
        project_id: localTodoBase.projectId,
        title: localTodoBase.title,
        due_date: localTodoBase.dueDate || null,
        owner_text: localTodoBase.owner,
        assignee_user_id: localTodoBase.assigneeUserId,
        status: localTodoBase.status,
        recurrence: localTodoBase.recurrence,
        completed_at: localTodoBase.completedAt || null
      })
      .select(MANUAL_TODO_SELECT)
      .single();

    if (!error && data) {
      const savedTodo = mapManualTodoRow(data);
      setTodos(prev => [...prev, savedTodo]);
      return savedTodo;
    }

    if (isMissingRelationError(error, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      setTodos(prev => [...prev, localTodoBase]);
      return localTodoBase;
    } else if (error) {
      console.error('Failed to create manual todo:', error);
    }
    const localTodo = {
      ...localTodoBase,
      _id: createOfflineTempId('offline-todo')
    };
    setTodos(prev => [...prev, localTodo]);
    setTodoQueue(prev => enqueueCreate(prev, {
      localId: localTodo._id,
      projectId: localTodo.projectId,
      title: localTodo.title,
      dueDate: localTodo.dueDate,
      owner: localTodo.owner,
      assigneeUserId: localTodo.assigneeUserId,
      status: localTodo.status,
      recurrence: localTodo.recurrence,
      createdAt: localTodo.createdAt,
      updatedAt: localTodo.updatedAt,
      completedAt: localTodo.completedAt,
    }));
    setOfflinePendingSync(true);
    return localTodo;
  }, [isOnline, projectId, userId]);

  const updateTodo = useCallback(async (todoId, key, value) => {
    const todo = todos.find(item => item._id === todoId);
    if (!todo) return;

    const ts = now();
    const {
      localUpdated,
      followUpLocal,
      normalizedRecurrence,
      nextStatus,
      transitionedToDone,
      nextRecurringDueDate
    } = buildLocalTodoUpdate({ todo, key, value, userId, ts });

    if (!userId || !supportsManualTodosTableRef.current) {
      setTodos(prev => applyTodoUpdateToState(prev, todoId, localUpdated, followUpLocal));
      return;
    }

    const queuePatch = { updatedAt: localUpdated.updatedAt };
    if (key === 'title') queuePatch.title = localUpdated.title;
    if (key === 'dueDate') queuePatch.dueDate = localUpdated.dueDate;
    if (key === 'owner') queuePatch.owner = localUpdated.owner;
    if (key === 'projectId') queuePatch.projectId = localUpdated.projectId;
    if (key === 'assigneeUserId') queuePatch.assigneeUserId = localUpdated.assigneeUserId;
    if (key === 'recurrence') queuePatch.recurrence = localUpdated.recurrence;
    if (key === 'status') {
      queuePatch.status = localUpdated.status;
      queuePatch.completedAt = localUpdated.completedAt || '';
    }

    if (!isOnline || isOfflineTempId(todoId)) {
      const queuedFollowUp = followUpLocal
        ? { ...followUpLocal, _id: createOfflineTempId('offline-todo') }
        : null;
      setTodos(prev => applyTodoUpdateToState(prev, todoId, localUpdated, queuedFollowUp));
      setTodoQueue((prev) => {
        let nextQueue = enqueueUpdate(prev, todoId, queuePatch);
        if (queuedFollowUp) {
          nextQueue = enqueueCreate(nextQueue, {
            localId: queuedFollowUp._id,
            projectId: queuedFollowUp.projectId,
            title: queuedFollowUp.title,
            dueDate: queuedFollowUp.dueDate,
            owner: queuedFollowUp.owner,
            assigneeUserId: queuedFollowUp.assigneeUserId,
            status: queuedFollowUp.status,
            recurrence: queuedFollowUp.recurrence,
            createdAt: queuedFollowUp.createdAt,
            updatedAt: queuedFollowUp.updatedAt,
            completedAt: queuedFollowUp.completedAt,
          });
        }
        return nextQueue;
      });
      setOfflinePendingSync(true);
      return;
    }

    const patch = buildTodoUpdatePatch({
      todo,
      key,
      value,
      normalizedRecurrence,
      nextStatus,
      ts
    });

    const { data: updatedRow, error: updateError } = await supabase
      .from('manual_todos')
      .update(patch)
      .eq('id', todoId)
      .select(MANUAL_TODO_SELECT)
      .single();

    if (updateError && isMissingRelationError(updateError, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      setTodos(prev => applyTodoUpdateToState(prev, todoId, localUpdated, followUpLocal));
      return;
    }

    if (updateError || !updatedRow) {
      console.error('Failed to update manual todo:', updateError);
      return;
    }

    let followUpDbRow = null;
    if (transitionedToDone && normalizedRecurrence) {
      const { data: insertedRow, error: insertError } = await supabase
        .from('manual_todos')
        .insert(buildRecurringFollowUpInsert({
          userId,
          localUpdated,
          normalizedRecurrence,
          nextRecurringDueDate
        }))
        .select(MANUAL_TODO_SELECT)
        .single();

      if (!insertError && insertedRow) {
        followUpDbRow = insertedRow;
      } else if (insertError) {
        if (isMissingRelationError(insertError, 'manual_todos')) {
          supportsManualTodosTableRef.current = false;
        }
        console.error('Failed to create recurring follow-up todo:', insertError);
      }
    }

    setTodos(prev => {
      const next = prev.map(item => item._id === todoId ? mapManualTodoRow(updatedRow) : item);
      if (followUpDbRow) {
        next.push(mapManualTodoRow(followUpDbRow));
      } else if (followUpLocal) {
        next.push(followUpLocal);
      }
      return next;
    });
  }, [isOnline, todos, userId]);

  const deleteTodo = useCallback(async (todoId) => {
    const previousTodos = todos;
    setTodos(prev => prev.filter(todo => todo._id !== todoId));

    if (!userId || !supportsManualTodosTableRef.current) return;

    if (!isOnline || isOfflineTempId(todoId)) {
      setTodoQueue(prev => enqueueDelete(prev, todoId));
      setOfflinePendingSync(true);
      return;
    }

    const { error } = await supabase
      .from('manual_todos')
      .delete()
      .eq('id', todoId);

    if (error && isMissingRelationError(error, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      return;
    }
    if (error) {
      console.error('Failed to delete manual todo:', error);
      setTodos(previousTodos);
    }
  }, [isOnline, todos, userId]);

  const completeTodoFromView = useCallback(async (todo) => {
    const completion = getTodoCompletionDescriptor(todo, getCurrentDate(), now());
    if (!completion) return;

    if (completion.kind === 'manual') {
      await updateTodo(completion.todoId, completion.key, completion.value);
      return;
    }

    if (completion.kind === 'register') {
      setRegisters((prev) => patchRegisterItemInState(
        prev,
        completion.registerType,
        completion.itemId,
        completion.patch,
        now()
      ));
      const title = SCHEMAS[completion.registerType]?.title || 'Register';
      queueProjectSyncOp(buildProjectSyncOp({
        kind: 'register-update',
        targetKey: `register:${completion.registerType}:${completion.itemId}`,
        label: `Updated ${title}`,
        detail: 'Completed from Tasks view',
        payload: {
          registerType: completion.registerType,
          itemId: completion.itemId,
          patch: completion.patch,
        },
      }));
      return;
    }

    if (completion.kind === 'tracker') {
      setTracker((prev) => prev.map((item) => (
        item._id === completion.trackerId
          ? { ...item, ...completion.patch }
          : item
      )));
      return;
    }

    if (completion.kind === 'schedule') {
      updateTask(completion.taskId, completion.patch);
    }
  }, [updateTask, updateTodo]);

  // ==================== TEMPLATE ====================

  const loadTemplate = useCallback(() => {
    setProjectData(buildDemoScheduleTasks());
  }, []);

  const loadDemoDataAllTabs = useCallback((options = {}) => {
    const demoPayload = buildDemoProjectPayload(options);
    setProjectData(demoPayload.tasks);
    setRegisters(demoPayload.registers);
    setTracker(demoPayload.tracker);
    setStatusReport(demoPayload.status_report);
    setBaselineState(demoPayload.baseline);
  }, []);

  const resetDemoData = useCallback(() => {
    setProjectData([]);
    setRegisters(createEmptyRegisters());
    setTracker([]);
    setStatusReport(createEmptyStatusReport());
    setBaselineState(null);
  }, []);

  // ==================== REGISTER FUNCTIONS ====================

  // Add register item — with timestamps
  const addRegisterItem = useCallback((registerType, itemData = {}) => {
    const ts = now();
    const existingItems = Array.isArray(registers[registerType]) ? registers[registerType] : [];
    const createdItem = buildRegisterItem(registerType, existingItems, itemData, ts);
    if (!createdItem) return null;

    setRegisters(prev => ({
      ...prev,
      [registerType]: [...(prev[registerType] || []), createdItem]
    }));

    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-add',
      targetKey: `register:${registerType}:${createdItem._id}`,
      label: `Added ${title} item`,
      detail: createdItem.description || createdItem.riskdetails || createdItem.decision || createdItem.minutedescription || createdItem.issue || '',
      createdAt: ts,
      payload: {
        registerType,
        itemData: createdItem,
      },
    }));

    return createdItem;
  }, [queueProjectSyncOp, registers]);

  const addRegisterItems = useCallback((registerType, itemsData = []) => {
    const entries = Array.isArray(itemsData) ? itemsData : [];
    if (entries.length === 0) return [];

    const ts = now();
    const existingItems = Array.isArray(registers[registerType]) ? [...registers[registerType]] : [];
    const createdItems = [];

    for (const itemData of entries) {
      const nextItem = buildRegisterItem(registerType, [...existingItems, ...createdItems], itemData, ts);
      if (nextItem) createdItems.push(nextItem);
    }

    if (createdItems.length === 0) return [];

    setRegisters(prev => ({
      ...prev,
      [registerType]: [...(prev[registerType] || []), ...createdItems]
    }));

    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-add',
      targetKey: `register:${registerType}:batch:${createdItems.map((item) => item._id).join(',')}`,
      label: `Added ${createdItems.length} ${title} item${createdItems.length === 1 ? '' : 's'}`,
      detail: createdItems.length === 1
        ? (createdItems[0].description || createdItems[0].riskdetails || createdItems[0].decision || createdItems[0].minutedescription || '')
        : '',
      createdAt: ts,
      payload: {
        registerType,
        itemsData: createdItems,
      },
    }));

    return createdItems;
  }, [queueProjectSyncOp, registers]);

  // Update register item — stamp updatedAt
  const updateRegisterItem = useCallback((registerType, itemId, key, value) => {
    const ts = now();
    setRegisters(prev => updateRegisterItemInState(prev, registerType, itemId, key, value, ts));
    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-update',
      targetKey: `register:${registerType}:${itemId}`,
      label: `Updated ${title}`,
      detail: `${key} changed`,
      createdAt: ts,
      payload: {
        registerType,
        itemId,
        patch: {
          [key]: value,
          updatedAt: ts,
        },
      },
    }));
  }, [queueProjectSyncOp]);

  const deleteRegisterItem = useCallback((registerType, itemId) => {
    const deletedItem = (registers[registerType] || []).find((item) => item._id === itemId) || null;
    setRegisters(prev => deleteRegisterItemFromState(prev, registerType, itemId));
    if (deletedItem) {
      const title = SCHEMAS[registerType]?.title || 'Register';
      queueProjectSyncOp(buildProjectSyncOp({
        kind: 'register-delete',
        targetKey: `register:${registerType}:${itemId}:delete`,
        label: `Deleted ${title} item`,
        detail: deletedItem.description || deletedItem.riskdetails || deletedItem.decision || deletedItem.minutedescription || '',
        payload: {
          registerType,
          itemId,
        },
      }));
    }
    return deletedItem;
  }, [queueProjectSyncOp, registers]);

  const restoreRegisterItem = useCallback((registerType, itemData) => {
    if (!itemData?._id) return null;
    if ((registers[registerType] || []).some((item) => item._id === itemData._id)) return itemData;

    const restoredItem = {
      ...itemData,
      updatedAt: now(),
    };

    setRegisters(prev => ({
      ...prev,
      [registerType]: [...(prev[registerType] || []), restoredItem]
    }));

    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-add',
      targetKey: `register:${registerType}:${restoredItem._id}:restore`,
      label: `Restored ${title} item`,
      detail: restoredItem.description || restoredItem.riskdetails || restoredItem.decision || restoredItem.minutedescription || '',
      payload: {
        registerType,
        itemData: restoredItem,
      },
    }));

    return restoredItem;
  }, [queueProjectSyncOp, registers]);

  const toggleItemPublic = useCallback((registerType, itemId) => {
    const ts = now();
    const currentItem = (registers[registerType] || []).find((item) => item._id === itemId) || null;
    setRegisters(prev => toggleRegisterItemPublicInState(prev, registerType, itemId, ts));
    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-update',
      targetKey: `register:${registerType}:${itemId}:visibility`,
      label: `Updated ${title} visibility`,
      detail: 'Visibility changed',
      createdAt: ts,
      payload: {
        registerType,
        itemId,
        patch: {
          public: currentItem ? !currentItem.public : true,
          updatedAt: ts,
        },
      },
    }));
  }, [queueProjectSyncOp, registers]);

  const updateRaciData = useCallback((assignments, roles) => {
    const ts = now();
    const currentRaci = registers._raci?.[0] || {};
    const nextRaciItem = {
      ...currentRaci,
      _id: currentRaci._id || 'raci_matrix',
      assignments,
      roles,
      updatedAt: ts,
    };

    setRegisters((prev) => ({
      ...prev,
      _raci: [nextRaciItem],
    }));

    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-update',
      targetKey: 'register:_raci:raci_matrix',
      label: 'Updated RACI',
      detail: 'RACI assignments changed',
      createdAt: ts,
      payload: {
        registerType: '_raci',
        itemId: nextRaciItem._id,
        patch: nextRaciItem,
      },
    }));
  }, [queueProjectSyncOp, registers]);

  return {
    projectData,
    registers,
    tracker,
    statusReport,
    todos,
    baseline,
    saving,
    lastSaved,
    loadingData,
    saveConflict,
    saveError,
    remoteUpdateAvailable,
    isOnline,
    offlinePendingSync: offlinePendingSync || todoQueue.length > 0 || projectSyncQueue.length > 0,
    usingOfflineSnapshot,
    projectSyncQueue,
    pendingProjectSyncCount: projectSyncQueue.length,
    addTask,
    updateTask,
    deleteTask,
    modifyHierarchy,
    toggleTrackTask,
    updateTrackedActions,
    loadTemplate,
    loadDemoDataAllTabs,
    resetDemoData,
    setBaseline,
    clearBaseline,
    addRegisterItem,
    addRegisterItems,
    updateRegisterItem,
    deleteRegisterItem,
    restoreRegisterItem,
    toggleItemPublic,
    sendToTracker,
    addManualTrackerItem,
    removeFromTracker,
    updateTrackerItem,
    reorderTrackerItems,
    isInTracker,
    updateStatusReport,
    addTodo,
    updateTodo,
    deleteTodo,
    completeTodoFromView,
    retryProjectSync,
    reloadProject,
    setProjectData,
    setRegisters,
    setTracker,
    setTodos,
    updateRaciData,
  };
};
