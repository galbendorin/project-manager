import { useState, useCallback, useEffect } from 'react';
import { getCurrentDate } from '../utils/helpers';
import { SCHEMAS } from '../utils/constants';
import { buildDemoProjectPayload, buildDemoScheduleTasks } from '../utils/demoProjectBuilder';
import { createEmptyRegisters, createEmptyStatusReport } from './projectData/defaults';
import { buildProjectSyncOp } from './projectData/projectSync';
import {
  patchRegisterItemInState,
  reconcileActionDeadlineRisks,
} from './projectData/registers';
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
  const [riskAutomationDate, setRiskAutomationDate] = useState(() => getCurrentDate());

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

  useEffect(() => {
    const refreshAutomationDate = () => setRiskAutomationDate(getCurrentDate());
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshAutomationDate();
    };

    const intervalId = window.setInterval(refreshAutomationDate, 60_000);
    window.addEventListener('focus', refreshAutomationDate);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshAutomationDate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
    readyProjectId,
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

  useEffect(() => {
    if (!projectId || readyProjectId !== projectId) return;

    const ts = now();
    const reconciliation = reconcileActionDeadlineRisks(registers, {
      todayDate: riskAutomationDate,
      nowIso: ts,
      tasks: projectData,
    });
    if (reconciliation.changes.length === 0) return;

    setRegisters(reconciliation.registers);
    reconciliation.changes.forEach((change) => {
      const itemId = change.item._id;
      const common = {
        targetKey: `register:risks:${itemId}:deadline-automation`,
        label: change.type === 'delete'
          ? 'Cleared automatic deadline risk'
          : change.type === 'add'
            ? 'Added automatic deadline risk'
            : 'Updated automatic deadline risk',
        detail: change.item.riskdetails || 'Linked from Action Log deadline',
        createdAt: ts,
      };

      if (change.type === 'add') {
        queueProjectSyncOp(buildProjectSyncOp({
          ...common,
          kind: 'register-add',
          payload: { registerType: 'risks', itemData: change.item },
        }));
      } else if (change.type === 'update') {
        queueProjectSyncOp(buildProjectSyncOp({
          ...common,
          kind: 'register-update',
          payload: { registerType: 'risks', itemId, patch: change.item },
        }));
      } else if (change.type === 'delete') {
        queueProjectSyncOp(buildProjectSyncOp({
          ...common,
          kind: 'register-delete',
          payload: { registerType: 'risks', itemId },
        }));
      }
    });
  }, [projectData, projectId, queueProjectSyncOp, readyProjectId, registers, riskAutomationDate]);

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
    getRiskLinkState,
    isInTracker,
    modifyHierarchy,
    removeFromTracker,
    removeFromRiskLog,
    reorderTrackerItems,
    sendToTracker,
    sendToRiskLog,
    setBaseline,
    toggleTrackTask,
    updateTask,
    updateTrackedActions,
    updateTrackerItem,
  } = useProjectTasksTracker({
    now,
    projectData,
    queueProjectSyncOp,
    registers,
    setBaselineState,
    setProjectData,
    setRegisters,
    setStatusReport,
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
    sendToRiskLog,
    addManualTrackerItem,
    removeFromTracker,
    removeFromRiskLog,
    updateTrackerItem,
    reorderTrackerItems,
    isInTracker,
    getRiskLinkState,
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
