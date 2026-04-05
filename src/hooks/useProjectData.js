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
  patchRegisterItemInState,
} from './projectData/registers';
import { getTodoCompletionDescriptor } from './projectData/todoCompletion';
import {
  buildProjectSnapshotKey,
  readOfflineJson,
  writeLocalJson
} from '../utils/offlineState';
import {
  isDirectProjectMutationFallbackError,
  syncProjectRegisterDelete,
  syncProjectRegisterPatch,
  syncProjectRegisterUpsert,
  syncProjectStatusReportField,
} from './projectData/directProjectMutations';
import { useProjectRegisters } from './projectData/useProjectRegisters';
import { useProjectTodos } from './projectData/useProjectTodos';

// Helper: get ISO timestamp
const now = () => new Date().toISOString();

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
  const [projectSyncQueue, setProjectSyncQueue] = useState([]);
  const [projectSyncRetryToken, setProjectSyncRetryToken] = useState(0);

  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef(null);
  const projectVersionRef = useRef(1);
  const projectSyncQueueRef = useRef([]);
  const syncingProjectQueueRef = useRef(false);
  const supportsDirectProjectMutationsRef = useRef(true);
  const registersRef = useRef(createEmptyRegisters());
  const statusReportRef = useRef(createEmptyStatusReport());
  const lastPersistedPlanSignatureRef = useRef('');
  const lastPersistedCollaborativeSignatureRef = useRef('');
  const snapshotKey = buildProjectSnapshotKey(projectId, userId || 'anon');

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

  const {
    addTodo,
    deleteTodo,
    loadTodos,
    setTodoQueue,
    setTodos,
    todoQueue,
    todoQueueRef,
    updateTodo,
    todos,
  } = useProjectTodos({
    isOnline,
    now,
    projectId,
    setLastSaved,
    setOfflinePendingSync,
    setUsingOfflineSnapshot,
    userId,
  });

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
      const nextTodos = await loadTodos(pendingTodoQueue);

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
  }, [loadTodos, projectId, setTodoQueue, setTodos, snapshotKey, todoQueueRef]);

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
  }, [isOnline, projectId, projectSyncQueue.length, projectSyncRetryToken, todoQueueRef]);

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

  const {
    addRegisterItem,
    addRegisterItems,
    updateRegisterItem,
    deleteRegisterItem,
    restoreRegisterItem,
    toggleItemPublic,
    updateRaciData,
    updateStatusReport,
  } = useProjectRegisters({
    now,
    queueProjectSyncOp,
    registers,
    setRegisters,
    setStatusReport,
  });

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
  }, [queueProjectSyncOp, updateTask, updateTodo]);

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
