import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SHOPPING_MANUAL_TODO_SELECT, mapManualTodoRow } from './projectData/manualTodoUtils';
import { isLikelyNetworkError } from '../utils/connectivity';
import { notifyShoppingListSubscribers } from '../utils/pushNotifications';
import { replaceQueuedTargetId } from '../utils/offlineQueue';
import {
  applyShoppingQueueToTodos,
  findUncertainShoppingCreateMatch,
  getShoppingQueueSyncDetail,
} from '../utils/shoppingListViewState';
import { isMissingShoppingUpsertRpcError, upsertShoppingListItem } from '../utils/shoppingListRpc';

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
      const visibleTodos = applyShoppingQueueToTodos({
        todos: serverTodos,
        queue,
        projectId,
      });
      todosByProject[projectId] = visibleTodos;
      if (selectedProjectId === projectId) {
        setTodos(visibleTodos);
      }
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
            const projectTodos = todosByProject[op.record.projectId] || [];
            todosByProject[op.record.projectId] = sortTodos(
              projectTodos
                .filter((item) => item._id !== op.targetId && item._id !== confirmedTodo._id)
                .concat(confirmedTodo)
            );
            queue = replaceQueuedTargetId(queue.slice(1), op.targetId, confirmedTodo._id);
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
          const projectTodos = todosByProject[op.record.projectId] || [];
          todosByProject[op.record.projectId] = sortTodos(
            projectTodos
              .filter((item) => item._id !== op.targetId && item._id !== savedTodo._id)
              .concat(savedTodo)
          );

          const existingTitles = createdTitlesByProject.get(op.record.projectId) || [];
          createdTitlesByProject.set(op.record.projectId, [...existingTitles, savedTodo.title]);
          queue = replaceQueuedTargetId(queue.slice(1), op.targetId, savedTodo._id);
          continue;
        }

        if (op.kind === 'update') {
          const { error } = await supabase
            .from('manual_todos')
            .update({
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'title') ? { title: op.patch.title } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'status') ? { status: op.patch.status } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'completedAt') ? { completed_at: op.patch.completedAt || null } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'quantityValue') ? { quantity_value: op.patch.quantityValue } : {}),
              ...(Object.prototype.hasOwnProperty.call(op.patch, 'quantityUnit') ? { quantity_unit: op.patch.quantityUnit || '' } : {}),
              updated_at: op.patch.updatedAt || new Date().toISOString(),
            })
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
          queue = queue.slice(1);
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
          queue = queue.slice(1);
          continue;
        }

        queue = queue.slice(1);
      }

      const visibleTodosByProject = Object.fromEntries(
        Object.entries(todosByProject).map(([projectId, projectTodos]) => [
          projectId,
          applyShoppingQueueToTodos({
            todos: projectTodos,
            queue,
            projectId,
          }),
        ])
      );

      persistOfflineState({
        ...cachedState,
        todosByProject: visibleTodosByProject,
        queue,
        lastSyncedAt: queue.length === 0 ? new Date().toISOString() : cachedState.lastSyncedAt,
      });

      if (selectedProjectId) {
        setTodos(sortTodos(visibleTodosByProject[selectedProjectId] || []));
      }

      for (const [projectId, itemTitles] of createdTitlesByProject.entries()) {
        await notifyShoppingListSubscribers({ projectId, itemTitles });
      }

      if (queue.length === 0) {
        setFailedTodoId('');
        setFailedTodoMessage('');
      }
    } finally {
      syncingQueueRef.current = false;
      setSyncingQueue(false);
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
      items.push({
        id: 'failed',
        label: failedTodo ? `Could not save ${failedTodo.title}` : 'One grocery needs attention',
        detail: failedTodoMessage || 'Retry this change when the connection settles.',
        status: 'error',
        statusLabel: 'Needs retry',
        actionLabel: offlineQueue.length > 0 ? 'Retry sync' : (failedTodo ? 'Retry item' : ''),
        onAction: offlineQueue.length > 0 ? () => void syncOfflineQueue() : (failedTodo ? () => retryTodoAction(failedTodo) : undefined),
      });
    }

    if (lastSyncedAt) {
      items.push({
        id: 'last-sync',
        label: 'Last successful sync',
        detail: formatSyncTimeLabel(lastSyncedAt),
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
