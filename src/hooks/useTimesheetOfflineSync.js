import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isOfflineTempId } from '../utils/offlineState';
import { replaceQueuedTargetId } from '../utils/offlineQueue';

const TIME_ENTRY_SELECT = 'id, project_id, user_id, entry_date, start_minutes, duration_minutes, description, created_at, updated_at';

const getTimesheetSyncFailure = (operation, error) => {
  const actionByKind = {
    create: 'add',
    update: 'update',
    delete: 'delete',
  };
  const action = actionByKind[operation?.kind] || 'sync';

  return {
    targetId: operation?.targetId || operation?.record?.localId || '',
    message: `Unable to ${action} this Timesheet entry right now. The change is still saved on this device; retry when the connection settles.`,
    technicalMessage: error?.message || '',
  };
};

export function useTimesheetOfflineSync({
  currentUserId,
  isOnline,
  loadTimesheetOfflineState,
  persistOfflineState,
  selectedProjectId,
  setEntries,
  sortEntries,
  offlineQueue,
  lastSyncedAt,
  weekStart,
  viewMode,
  visibleEntries,
  formatSyncTimeLabel,
}) {
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [syncFailure, setSyncFailure] = useState(null);
  const syncingQueueRef = useRef(false);

  const syncOfflineQueue = useCallback(async () => {
    if (!currentUserId || !isOnline || syncingQueueRef.current) return;

    const cachedState = loadTimesheetOfflineState(currentUserId);
    let queue = Array.isArray(cachedState.queue) ? [...cachedState.queue] : [];
    if (queue.length === 0) return;

    syncingQueueRef.current = true;
    setSyncingQueue(true);
    setSyncFailure(null);
    let entriesByWeek = { ...(cachedState.entriesByWeek || {}) };
    let failure = null;
    let currentOp = null;

    try {
      while (queue.length > 0) {
        const op = queue[0];
        currentOp = op;

        if (op.kind === 'create') {
          const { data, error } = await supabase
            .from('time_entries')
            .insert(op.record?.payload || op.record?.data || op.payload)
            .select(TIME_ENTRY_SELECT)
            .single();

          if (error || !data) {
            failure = getTimesheetSyncFailure(op, error || new Error('No saved entry returned.'));
            break;
          }

          const previousId = op.targetId;
          Object.keys(entriesByWeek).forEach((key) => {
            entriesByWeek[key] = sortEntries((entriesByWeek[key] || []).map((entry) => (
              entry.id === previousId ? data : entry
            )));
          });
          queue = replaceQueuedTargetId(queue.slice(1), previousId, data.id);
          continue;
        }

        if (op.kind === 'update') {
          const { error } = await supabase
            .from('time_entries')
            .update(op.patch)
            .eq('id', op.targetId)
            .eq('user_id', currentUserId);

          if (error) {
            failure = getTimesheetSyncFailure(op, error);
            break;
          }
          queue = queue.slice(1);
          continue;
        }

        if (op.kind === 'delete') {
          const { error } = await supabase
            .from('time_entries')
            .delete()
            .eq('id', op.targetId)
            .eq('user_id', currentUserId);

          if (error) {
            failure = getTimesheetSyncFailure(op, error);
            break;
          }
          queue = queue.slice(1);
          continue;
        }

        failure = getTimesheetSyncFailure(op, new Error(`Unsupported offline operation: ${op.kind || 'unknown'}`));
        break;
      }
    } catch (error) {
      failure = getTimesheetSyncFailure(currentOp, error);
    }

    try {
      persistOfflineState({
        ...cachedState,
        entriesByWeek,
        queue,
        selectedProjectId,
        weekStart,
        viewMode,
        lastSyncedAt: queue.length === 0 ? new Date().toISOString() : cachedState.lastSyncedAt,
      });
      if (entriesByWeek[weekStart]) {
        setEntries(sortEntries(entriesByWeek[weekStart]));
      }
      if (queue.length === 0) {
        setSyncFailure(null);
      } else if (failure) {
        setSyncFailure(failure);
      }
    } finally {
      syncingQueueRef.current = false;
      setSyncingQueue(false);
    }
  }, [
    currentUserId,
    isOnline,
    loadTimesheetOfflineState,
    persistOfflineState,
    selectedProjectId,
    setEntries,
    sortEntries,
    viewMode,
    weekStart,
  ]);

  useEffect(() => {
    void syncOfflineQueue();
  }, [syncOfflineQueue]);

  const retryTimesheetSync = useCallback(() => {
    setSyncFailure(null);
    void syncOfflineQueue();
  }, [syncOfflineQueue]);

  const queuedEntryIds = useMemo(
    () => new Set((offlineQueue || []).map((item) => item.targetId)),
    [offlineQueue]
  );

  const entrySyncStateById = useMemo(() => (
    visibleEntries.reduce((acc, entry) => {
      if (queuedEntryIds.has(entry.id) || isOfflineTempId(entry.id)) {
        acc[entry.id] = syncingQueue && isOnline ? 'syncing' : 'offline';
      }
      return acc;
    }, {})
  ), [isOnline, queuedEntryIds, syncingQueue, visibleEntries]);

  const offlineStatusLabel = useMemo(() => {
    const queueCount = offlineQueue.length;
    if (syncingQueue && queueCount > 0) {
      return `Syncing ${queueCount} offline change${queueCount === 1 ? '' : 's'}...`;
    }
    if (syncFailure && queueCount > 0) {
      return syncFailure.message;
    }
    if (queueCount > 0) {
      return isOnline
        ? `${queueCount} offline change${queueCount === 1 ? '' : 's'} ready to sync.`
        : `${queueCount} offline change${queueCount === 1 ? '' : 's'} waiting for signal.`;
    }
    const lastSyncLabel = formatSyncTimeLabel(lastSyncedAt);
    if (lastSyncLabel) {
      return `Last synced at ${lastSyncLabel}.`;
    }
    return isOnline
      ? 'This week stays cached on this device once it loads.'
      : 'You are working from the last cached copy on this device.';
  }, [formatSyncTimeLabel, isOnline, lastSyncedAt, offlineQueue.length, syncFailure, syncingQueue]);

  const syncCenterItems = useMemo(() => {
    const items = [
      {
        id: 'connection',
        label: isOnline ? 'Connection available' : 'Offline mode',
        detail: isOnline
          ? 'Queued Timesheet changes will sync now that the connection is back.'
          : 'You can keep logging time from the cached week on this device.',
        status: isOnline ? 'ok' : 'offline',
        statusLabel: isOnline ? 'Online' : 'Offline',
      },
    ];

    if (offlineQueue.length > 0) {
      items.push({
        id: 'queue',
        label: `${offlineQueue.length} Timesheet change${offlineQueue.length === 1 ? '' : 's'} waiting`,
        detail: syncFailure
          ? 'One queued change needs another attempt before the queue can finish.'
          : syncingQueue
          ? 'The queued entries are being pushed to the server now.'
          : 'These entries stay on your phone and will sync automatically.',
        status: syncFailure ? 'error' : syncingQueue ? 'syncing' : 'queue',
        statusLabel: syncFailure ? 'Needs retry' : syncingQueue ? 'Syncing' : 'Queued',
      });
    }

    if (syncFailure) {
      items.push({
        id: 'failed',
        label: 'Timesheet sync needs attention',
        detail: syncFailure.message,
        status: 'error',
        statusLabel: 'Retry',
        actionLabel: isOnline && !syncingQueue ? 'Retry sync' : '',
        onAction: isOnline && !syncingQueue ? retryTimesheetSync : undefined,
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
  }, [formatSyncTimeLabel, isOnline, lastSyncedAt, offlineQueue.length, retryTimesheetSync, syncFailure, syncingQueue]);

  return {
    syncingQueue,
    syncFailure,
    entrySyncStateById,
    offlineStatusLabel,
    syncCenterItems,
  };
}
