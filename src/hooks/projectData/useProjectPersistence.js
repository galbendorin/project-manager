import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { createEmptyRegisters, createEmptyStatusReport } from './defaults';
import { normalizeLoadedProjectState, buildProjectUpdatePayload } from './loadSave';
import {
  enqueueProjectSyncOp,
  applyProjectSyncQueueToState,
} from './projectSync';
import {
  buildProjectSnapshotKey,
  readOfflineJson,
  writeLocalJson,
} from '../../utils/offlineState';
import {
  isDirectProjectMutationFallbackError,
  syncProjectRegisterDelete,
  syncProjectRegisterPatch,
  syncProjectRegisterUpsert,
  syncProjectStatusReportField,
} from './directProjectMutations';

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

export function useProjectPersistence({
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
}) {
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
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

    const { data, error } = await supabase
      .from('projects')
      .select('tasks, registers, baseline, tracker, status_report, version')
      .eq('id', projectId)
      .single();

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
    window.setTimeout(() => {
      initialLoadDone.current = true;
    }, 500);
  }, [
    loadTodos,
    now,
    projectId,
    setBaselineState,
    setOfflinePendingSync,
    setProjectData,
    setRegisters,
    setStatusReport,
    setTodoQueue,
    setTodos,
    setTracker,
    setUsingOfflineSnapshot,
    snapshotKey,
    todoQueueRef,
  ]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (!projectId || !initialLoadDone.current || saveConflict) return undefined;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
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

    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const updateData = buildProjectUpdatePayload({
        projectData,
        registers,
        tracker,
        statusReport,
        baseline,
      });

      const expectedVersion = projectVersionRef.current;

      const { data, error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('version', expectedVersion)
        .select('version')
        .maybeSingle();

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
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    baseline,
    isOnline,
    projectData,
    projectId,
    projectSyncQueue.length,
    projectSyncRetryToken,
    registers,
    saveConflict,
    setLastSaved,
    setOfflinePendingSync,
    setUsingOfflineSnapshot,
    statusReport,
    tracker,
  ]);

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
  }, [baseline, now, projectData, projectId, projectSyncQueue, registers, snapshotKey, statusReport, todoQueue, todos, tracker]);

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
  }, [isOnline, loadingData, projectId]);

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
  }, [isOnline, projectId, projectSyncQueue.length, projectSyncRetryToken, setLastSaved, setOfflinePendingSync, setUsingOfflineSnapshot, todoQueueRef]);

  useEffect(() => {
    if (todoQueue.length === 0 && projectSyncQueue.length === 0 && !saveTimeoutRef.current && !saving) {
      setOfflinePendingSync(false);
    } else if (todoQueue.length > 0 || projectSyncQueue.length > 0) {
      setOfflinePendingSync(true);
    }
  }, [projectSyncQueue.length, saving, setOfflinePendingSync, todoQueue.length]);

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
  }, [setOfflinePendingSync]);

  return {
    loadingData,
    projectSyncQueue,
    queueProjectSyncOp,
    reloadProject,
    remoteUpdateAvailable,
    retryProjectSync,
    saveConflict,
    saveError,
    saving,
  };
}
