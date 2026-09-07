import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SHOPPING_MANUAL_TODO_SELECT, mapManualTodoRow } from './projectData/manualTodoUtils';
import { isLikelyNetworkError } from '../utils/connectivity';
import { notifyShoppingListSubscribers } from '../utils/pushNotifications';
import { replaceQueuedTargetId } from '../utils/offlineQueue';
import {
  applyShoppingQueueToTodos,
  findUncertainShoppingCreateMatch,
  getShoppingOfflineReadinessState,
  getShoppingQueueSyncDetail,
} from '../utils/shoppingListViewState';
import { isMissingShoppingUpsertRpcError, upsertShoppingListItem } from '../utils/shoppingListRpc';

const matchesSubmittedOperation = (current, submitted) => {
  if (current.kind !== submitted.kind || current.targetId !== submitted.targetId) return false;
  if (submitted.kind !== 'update') return true;
  const currentPatch = current.patch || {};
  const submittedPatch = submitted.patch || {};
  const keys = Object.keys(submittedPatch);
  return keys.length === Object.keys(currentPatch).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(currentPatch, key)
      && Object.is(currentPatch[key], submittedPatch[key]));
};

export function useShoppingListOfflineSync({
  currentUserId,
  isOnline,
  selectedProjectId,
  loadShoppingOfflineState,
  persistOfflineState,
  setTodos,
  sortTodos,
  offlineQueue,
  lastSyncedAt,
  todos,
  failedTodoId,
  failedTodoMessage,
  setFailedTodoId,
  setFailedTodoMessage,
  retryTodoAction,
  formatSyncTimeLabel,
}) {
  const [syncingQueue, setSyncingQueue] = useState(false);
  const syncingQueueRef = useRef(false);

  const syncOfflineQueue = useCallback(async () => {
    if (!currentUserId || !isOnline || syncingQueueRef.current) return;

    const cachedState = loadShoppingOfflineState(currentUserId);
    let queue = Array.isArray(cachedState.queue) ? [...cachedState.queue] : [];
    if (queue.length === 0) return;

    syncingQueueRef.current = true;
    setSyncingQueue(true);
    let todosByProject = { ...(cachedState.todosByProject || {}) };
    const createdTitlesByProject = new Map();

    // Complete each operation against current storage in one synchronous turn.
    // User actions can replace/compact queue entries while a request is pending.
    const commitCurrentState = (mutate = (state) => state) => {
      const nextState = mutate(loadShoppingOfflineState(currentUserId));
      queue = Array.isArray(nextState.queue) ? [...nextState.queue] : [];
      todosByProject = Object.fromEntries(
        Object.entries(nextState.todosByProject || {}).map(([projectId, projectTodos]) => [
          projectId,
          applyShoppingQueueToTodos({ todos: projectTodos, queue, projectId }),
        ])
      );
      persistOfflineState({ ...nextState, queue, todosByProject });
      if (selectedProjectId) setTodos(sortTodos(todosByProject[selectedProjectId] || []));
    };

    const acknowledgeOperation = (submitted, savedTodo = null) => {
      commitCurrentState((latest) => {
        let remainingQueue = (latest.queue || []).filter((item) => !matchesSubmittedOperation(item, submitted));
        let nextTodosByProject = latest.todosByProject || {};
        if (savedTodo) {
          // Preserve existing create/remap behaviour. Later changes to the
          // submitted temporary item itself require Q04's cancellation contract.
          remainingQueue = replaceQueuedTargetId(remainingQueue, submitted.targetId, savedTodo._id);
          const projectId = submitted.record.projectId;
          nextTodosByProject = {
            ...nextTodosByProject,
            [projectId]: sortTodos((nextTodosByProject[projectId] || [])
              .filter((item) => item._id !== submitted.targetId && item._id !== savedTodo._id)
              .concat(savedTodo)),
          };
        }
        return {
          ...latest,
          queue: remainingQueue,
          todosByProject: nextTodosByProject,
          lastSyncedAt: remainingQueue.length === 0 ? new Date().toISOString() : latest.lastSyncedAt,
        };
      });
    };

    const refreshProjectTodos = async (projectId) => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('manual_todos')
        .select(SHOPPING_MANUAL_TODO_SELECT)
        .eq('project_id', projectId)
        .order('status', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;

      const serverTodos = sortTodos((data || []).map(mapManualTodoRow));
      commitCurrentState((latest) => ({
        ...latest,
        todosByProject: { ...(latest.todosByProject || {}), [projectId]: serverTodos },
      }));
      return serverTodos;
    };

    const resolveProjectIdForTarget = (targetId) => {
      if (!targetId) return selectedProjectId || '';

      for (const [projectId, projectTodos] of Object.entries(todosByProject)) {
        if ((projectTodos || []).some((todo) => todo?._id === targetId)) {
          return projectId;
        }
      }

      return selectedProjectId || '';
    };

    try {
      while (queue.length > 0) {
        const op = queue[0];

        if (op.kind === 'create') {
          const refreshedTodos = await refreshProjectTodos(op.record.projectId).catch(() => []);
          const confirmedTodo = findUncertainShoppingCreateMatch(op.record, refreshedTodos);

          if (confirmedTodo) {
            acknowledgeOperation(op, confirmedTodo);
            continue;
          }

          const { data, error } = await upsertShoppingListItem({
            supabaseClient: supabase,
            projectId: op.record.projectId,
            item: op.record,
            operationId: op.record.operationId,
          });

          if (error || !data) {
            if (isLikelyNetworkError(error, { online: isOnline })) {
              setFailedTodoId('');
              setFailedTodoMessage('');
            } else {
              setFailedTodoId(op.targetId);
              setFailedTodoMessage(
                isMissingShoppingUpsertRpcError(error)
                  ? 'Shopping List needs the latest SQL migration before offline groceries can sync safely.'
                  : (error?.message || 'Unable to sync this grocery right now.')
              );
            }
            await refreshProjectTodos(op.record.projectId).catch(() => {});
            break;
          }

          const savedTodo = mapManualTodoRow(data);

          const existingTitles = createdTitlesByProject.get(op.record.projectId) || [];
          createdTitlesByProject.set(op.record.projectId, [...existingTitles, savedTodo.title]);
          acknowledgeOperation(op, savedTodo);
          continue;
        }

        if (op.kind === 'update') {
          const { data, error: updateError } = await supabase
            .from('manual_todos')
            .update({
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'title') ? { title: op.patch.title } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'status') ? { status: op.patch.status } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'completedAt') ? { completed_at: op.patch.completedAt || null } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'quantityValue') ? { quantity_value: op.patch.quantityValue } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'quantityUnit') ? { quantity_unit: op.patch.quantityUnit || '' } : {}),
              updated_at: op.patch.updatedAt || new Date().toISOString(),
            })
            .eq('id', op.targetId)
            .select('id')
            .maybeSingle();

          const error = updateError || (data?.id === op.targetId ? null : new Error(
            'Could not confirm this edit was saved. The item may have been removed or your access changed. Your edit is still queued.'
          ));

          if (error) {
            if (isLikelyNetworkError(error, { online: isOnline })) {
              setFailedTodoId('');
              setFailedTodoMessage('');
            } else {
              setFailedTodoId(op.targetId);
              setFailedTodoMessage(error?.message || 'Unable to sync this grocery right now.');
            }
            await refreshProjectTodos(resolveProjectIdForTarget(op.targetId)).catch(() => {});
            break;
          }
          acknowledgeOperation(op);
          continue;
        }

        if (op.kind === 'delete') {
          const { error } = await supabase
            .from('manual_todos')
            .delete()
            .eq('id', op.targetId);

          if (error) {
            if (isLikelyNetworkError(error, { online: isOnline })) {
              setFailedTodoId('');
              setFailedTodoMessage('');
            } else {
              setFailedTodoId(op.targetId);
              setFailedTodoMessage(error?.message || 'Unable to sync this grocery right now.');
            }
            await refreshProjectTodos(resolveProjectIdForTarget(op.targetId)).catch(() => {});
            break;
          }
          acknowledgeOperation(op);
          continue;
        }

        acknowledgeOperation(op);
      }

      commitCurrentState();

      if (queue.length === 0) {
        setFailedTodoId('');
        setFailedTodoMessage('');
      }
    } finally {
      syncingQueueRef.current = false;
      setSyncingQueue(false);
    }

    // Delivery may be slow. The queue is already persisted, so allow the next
    // online/focus/retry trigger to sync new edits while notifications finish.
    for (const [projectId, itemTitles] of createdTitlesByProject.entries()) {
      await notifyShoppingListSubscribers({ projectId, itemTitles });
    }
  }, [
    currentUserId,
    isOnline,
    loadShoppingOfflineState,
    persistOfflineState,
    selectedProjectId,
    setTodos,
    sortTodos,
    setFailedTodoId,
    setFailedTodoMessage,
  ]);

  useEffect(() => {
    void syncOfflineQueue();
  }, [syncOfflineQueue]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const retryQueuedChanges = () => {
      void syncOfflineQueue();
    };

    window.addEventListener('online', retryQueuedChanges);
    window.addEventListener('focus', retryQueuedChanges);
    return () => {
      window.removeEventListener('online', retryQueuedChanges);
      window.removeEventListener('focus', retryQueuedChanges);
    };
  }, [syncOfflineQueue]);

  const queuedTodoIds = useMemo(
    () => new Set((offlineQueue || []).map((item) => item.targetId)),
    [offlineQueue]
  );

  const shoppingSyncSummary = useMemo(() => {
    const queueCount = offlineQueue.length;
    if (syncingQueue && queueCount > 0) {
      return `Syncing ${queueCount} offline change${queueCount === 1 ? '' : 's'}...`;
    }
    if (queueCount > 0) {
      return isOnline
        ? `${queueCount} item change${queueCount === 1 ? '' : 's'} ready to sync`
        : `${queueCount} item change${queueCount === 1 ? '' : 's'} waiting for signal`;
    }
    const lastSyncLabel = formatSyncTimeLabel(lastSyncedAt);
    if (lastSyncLabel) {
      return `Last synced at ${lastSyncLabel}`;
    }
    return isOnline
      ? 'This list stays cached once it has loaded on this device.'
      : 'Using the last cached list on this device.';
  }, [formatSyncTimeLabel, isOnline, lastSyncedAt, offlineQueue.length, syncingQueue]);

  const syncCenterItems = useMemo(() => {
    const lastSyncLabel = formatSyncTimeLabel(lastSyncedAt);
    const openCount = todos.filter((todo) => todo?.status !== 'Done').length;
    const boughtCount = todos.filter((todo) => todo?.status === 'Done').length;
    const phoneCacheState = getShoppingOfflineReadinessState({
      openCount,
      boughtCount,
      queueCount: offlineQueue.length,
      isOnline,
      lastSyncLabel,
    });
    const items = [
      {
        id: 'connection',
        label: isOnline ? 'Connection available' : 'Offline mode',
        detail: isOnline
          ? 'Queued grocery changes will sync now that the connection is back.'
          : 'You can keep adding and ticking off groceries from the cached list.',
        status: isOnline ? 'ok' : 'offline',
        statusLabel: isOnline ? 'Online' : 'Offline',
      },
      {
        id: 'phone-cache',
        label: phoneCacheState.label,
        detail: phoneCacheState.detail,
        status: phoneCacheState.status,
        statusLabel: phoneCacheState.statusLabel,
      },
    ];

    if (offlineQueue.length > 0) {
      items.push({
        id: 'queue',
        label: `${offlineQueue.length} grocery change${offlineQueue.length === 1 ? '' : 's'} waiting`,
        detail: getShoppingQueueSyncDetail(offlineQueue, { syncing: syncingQueue }),
        status: syncingQueue ? 'syncing' : 'queue',
        statusLabel: syncingQueue ? 'Syncing' : 'Queued',
      });
    }

    if (failedTodoId) {
      const failedTodo = todos.find((todo) => todo._id === failedTodoId);
      const failedIsQueued = offlineQueue.some((item) => item?.targetId === failedTodoId);
      items.push({
        id: 'failed',
        label: failedTodo ? `Could not save ${failedTodo.title}` : 'One grocery needs attention',
        detail: failedIsQueued
          ? (failedTodoMessage || 'This grocery is still safe on this phone. Retry when the signal settles.')
          : (failedTodoMessage || 'Retry this change when the connection settles.'),
        status: 'error',
        statusLabel: 'Needs retry',
        actionLabel: offlineQueue.length > 0 ? 'Retry saved changes' : (failedTodo ? 'Retry item' : ''),
        onAction: offlineQueue.length > 0 ? () => void syncOfflineQueue() : (failedTodo ? () => retryTodoAction(failedTodo) : undefined),
      });
    }

    if (lastSyncedAt) {
      items.push({
        id: 'last-sync',
        label: 'Last successful sync',
        detail: lastSyncLabel,
        status: 'ok',
        statusLabel: 'Saved',
      });
    }

    return items;
  }, [
    failedTodoId,
    failedTodoMessage,
    formatSyncTimeLabel,
    isOnline,
    lastSyncedAt,
    offlineQueue,
    retryTodoAction,
    syncOfflineQueue,
    syncingQueue,
    todos,
  ]);

  return {
    syncingQueue,
    queuedTodoIds,
    retryShoppingSync: syncOfflineQueue,
    shoppingSyncSummary,
    syncCenterItems,
  };
}
