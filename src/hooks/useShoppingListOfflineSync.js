import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MANUAL_TODO_SELECT, mapManualTodoRow } from './projectData/manualTodoUtils';
import { notifyShoppingListSubscribers } from '../utils/pushNotifications';
import { replaceQueuedTargetId } from '../utils/offlineQueue';

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

    while (queue.length > 0) {
      const op = queue[0];

      if (op.kind === 'create') {
        const { data, error } = await supabase
          .from('manual_todos')
          .insert({
            user_id: op.record.userId,
            project_id: op.record.projectId,
            title: op.record.title,
            due_date: null,
            owner_text: '',
            assignee_user_id: op.record.userId,
            status: op.record.status,
            recurrence: null,
            completed_at: op.record.completedAt || null,
          })
          .select(MANUAL_TODO_SELECT)
          .single();

        if (error || !data) break;

        const savedTodo = mapManualTodoRow(data);
        const projectTodos = todosByProject[op.record.projectId] || [];
        todosByProject[op.record.projectId] = sortTodos(projectTodos.map((item) => (
          item._id === op.targetId ? savedTodo : item
        )));
        const existingTitles = createdTitlesByProject.get(op.record.projectId) || [];
        createdTitlesByProject.set(op.record.projectId, [...existingTitles, savedTodo.title]);
        queue = replaceQueuedTargetId(queue.slice(1), op.targetId, savedTodo._id);
        continue;
      }

      if (op.kind === 'update') {
        const { error } = await supabase
          .from('manual_todos')
          .update({
            status: op.patch.status,
            completed_at: op.patch.completedAt || null,
            updated_at: op.patch.updatedAt || new Date().toISOString(),
          })
          .eq('id', op.targetId);

        if (error) break;
        queue = queue.slice(1);
        continue;
      }

      if (op.kind === 'delete') {
        const { error } = await supabase
          .from('manual_todos')
          .delete()
          .eq('id', op.targetId);

        if (error) break;
        queue = queue.slice(1);
      }
    }

    persistOfflineState({
      ...cachedState,
      todosByProject,
      queue,
      lastSyncedAt: queue.length === 0 ? new Date().toISOString() : cachedState.lastSyncedAt,
    });

    if (selectedProjectId) {
      setTodos(sortTodos(todosByProject[selectedProjectId] || []));
    }

    for (const [projectId, itemTitles] of createdTitlesByProject.entries()) {
      await notifyShoppingListSubscribers({ projectId, itemTitles });
    }

    if (queue.length === 0) {
      setFailedTodoId('');
      setFailedTodoMessage('');
    }

    syncingQueueRef.current = false;
    setSyncingQueue(false);
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
        detail: syncingQueue
          ? 'Your queued grocery updates are being pushed to the shared list now.'
          : 'These grocery changes are safe on this phone and will sync automatically.',
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
        actionLabel: failedTodo ? 'Retry item' : '',
        onAction: failedTodo ? () => retryTodoAction(failedTodo) : undefined,
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
    offlineQueue.length,
    retryTodoAction,
    syncingQueue,
    todos,
  ]);

  return {
    syncingQueue,
    queuedTodoIds,
    shoppingSyncSummary,
    syncCenterItems,
  };
}
