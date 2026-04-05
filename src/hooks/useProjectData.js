import { useState, useCallback, useEffect } from 'react';
import { getCurrentDate } from '../utils/helpers';
import { SCHEMAS } from '../utils/constants';
import { buildDemoProjectPayload, buildDemoScheduleTasks } from '../utils/demoProjectBuilder';
import { createEmptyRegisters, createEmptyStatusReport } from './projectData/defaults';
import { buildProjectSyncOp } from './projectData/projectSync';
import { patchRegisterItemInState } from './projectData/registers';
import { getTodoCompletionDescriptor } from './projectData/todoCompletion';
import { useProjectRegisters } from './projectData/useProjectRegisters';
import { useProjectTodos } from './projectData/useProjectTodos';
import { useProjectPersistence } from './projectData/useProjectPersistence';
import { useProjectTasksTracker } from './projectData/useProjectTasksTracker';

// Helper: get ISO timestamp
const now = () => new Date().toISOString();

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
  const [lastSaved, setLastSaved] = useState(null);
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  ));
  const [offlinePendingSync, setOfflinePendingSync] = useState(false);
  const [usingOfflineSnapshot, setUsingOfflineSnapshot] = useState(false);

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
  const {
    loadingData,
    projectSyncQueue,
    queueProjectSyncOp,
    reloadProject,
    remoteUpdateAvailable,
    retryProjectSync,
    saveConflict,
    saveError,
    saving,
  } = useProjectPersistence({
    baseline,
    isOnline,
    loadTodos,
    now,
    projectData,
    projectId,
    registers,
    setBaselineState,
    setLastSaved,
    setOfflinePendingSync,
    setProjectData,
    setRegisters,
    setStatusReport,
    setTodoQueue,
    setTodos,
    setTracker,
    setUsingOfflineSnapshot,
    statusReport,
    todoQueue,
    todoQueueRef,
    todos,
    tracker,
    userId,
  });

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
  const {
    addManualTrackerItem,
    addTask,
    clearBaseline,
    deleteTask,
    isInTracker,
    modifyHierarchy,
    removeFromTracker,
    reorderTrackerItems,
    sendToTracker,
    setBaseline,
    toggleTrackTask,
    updateTask,
    updateTrackedActions,
    updateTrackerItem,
  } = useProjectTasksTracker({
    now,
    projectData,
    setBaselineState,
    setProjectData,
    setRegisters,
    setTracker,
    tracker,
  });

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
