import { isOfflineTempId } from './offlineState.js';

export const enqueueCreate = (queue, record) => [
  ...(Array.isArray(queue) ? queue : []),
  {
    kind: 'create',
    targetId: record.localId,
    record,
  }
];

export const enqueueRecurringComplete = (queue, entry) => [
  ...(Array.isArray(queue) ? queue : []),
  {
    kind: 'complete-recurring',
    targetId: entry.targetId,
    followUpLocalId: entry.followUpLocalId,
    patch: entry.patch,
    completedAt: entry.completedAt,
    fallbackDate: entry.fallbackDate,
    sourceTodo: entry.sourceTodo,
    normalizedRecurrence: entry.normalizedRecurrence,
    nextRecurringDueDate: entry.nextRecurringDueDate,
    followUpRecord: entry.followUpRecord,
  }
];

const lastIndexMatching = (items, predicate) => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
};

export const enqueueUpdate = (queue, targetId, patch) => {
  const nextQueue = Array.isArray(queue) ? [...queue] : [];
  const lastRecurringCompleteIndex = lastIndexMatching(
    nextQueue,
    (item) => (
      item?.kind === 'complete-recurring'
      && (item.targetId === targetId || item.followUpLocalId === targetId)
    )
  );
  const createIndex = nextQueue.findIndex(
    (item, index) => index > lastRecurringCompleteIndex && item?.kind === 'create' && item.targetId === targetId
  );

  if (createIndex !== -1) {
    const existingRecord = nextQueue[createIndex].record || {};
    const nextRecord = existingRecord.payload
      ? {
          ...existingRecord,
          payload: {
            ...existingRecord.payload,
            ...patch,
          },
        }
      : existingRecord.data
        ? {
            ...existingRecord,
            data: {
              ...existingRecord.data,
              ...patch,
            },
          }
        : {
            ...existingRecord,
            ...patch,
          };

    nextQueue[createIndex] = {
      ...nextQueue[createIndex],
      record: nextRecord,
    };
    return nextQueue;
  }

  const updateIndex = nextQueue.findIndex(
    (item, index) => index > lastRecurringCompleteIndex && item?.kind === 'update' && item.targetId === targetId
  );
  if (updateIndex !== -1) {
    nextQueue[updateIndex] = {
      ...nextQueue[updateIndex],
      patch: {
        ...nextQueue[updateIndex].patch,
        ...patch,
      }
    };
    return nextQueue;
  }

  return [
    ...nextQueue,
    {
      kind: 'update',
      targetId,
      patch,
    }
  ];
};

const collectDescendantFollowUpIds = (queue, rootId) => {
  const descendantIds = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of queue) {
      if (
        item?.kind === 'complete-recurring'
        && item.followUpLocalId
        && (item.targetId === rootId || descendantIds.has(item.targetId))
        && !descendantIds.has(item.followUpLocalId)
      ) {
        descendantIds.add(item.followUpLocalId);
        changed = true;
      }
    }
  }
  return descendantIds;
};

export const enqueueDelete = (queue, targetId) => {
  let nextQueue = Array.isArray(queue) ? [...queue] : [];
  const followUpOriginIndex = nextQueue.findIndex(
    (item) => item?.kind === 'complete-recurring' && item.followUpLocalId === targetId
  );

  if (isOfflineTempId(targetId) && followUpOriginIndex === -1) {
    const cancelledFollowUpIds = collectDescendantFollowUpIds(nextQueue, targetId);
    return nextQueue.filter(
      (item) => item?.targetId !== targetId && !cancelledFollowUpIds.has(item?.targetId)
    );
  }

  if (isOfflineTempId(targetId) && followUpOriginIndex !== -1) {
    const descendantIds = collectDescendantFollowUpIds(nextQueue, targetId);
    nextQueue = nextQueue.filter(
      (item, index) => !(
        (index > followUpOriginIndex && (item?.kind === 'update' || item?.kind === 'complete-recurring') && item.targetId === targetId)
        || descendantIds.has(item?.targetId)
      )
    );
  } else {
    const cancelledFollowUpIds = collectDescendantFollowUpIds(nextQueue, targetId);
    nextQueue = nextQueue.filter((item) => (
      !((item?.kind === 'update' || item?.kind === 'complete-recurring') && item.targetId === targetId)
      && !cancelledFollowUpIds.has(item?.targetId)
    ));
  }

  const existingDeleteIndex = nextQueue.findIndex((item) => item?.kind === 'delete' && item.targetId === targetId);
  if (existingDeleteIndex !== -1) {
    return nextQueue;
  }

  return [
    ...nextQueue,
    {
      kind: 'delete',
      targetId,
    }
  ];
};

export const replaceQueuedTargetId = (queue, previousId, nextId) => (
  (Array.isArray(queue) ? queue : []).map((item) => {
    if (!item) return item;
    if (item.targetId === previousId) {
      return {
        ...item,
        targetId: nextId,
        ...(item.kind === 'complete-recurring' && item.sourceTodo
          ? { sourceTodo: { ...item.sourceTodo, _id: nextId } }
          : {}),
      };
    }
    if (item.kind === 'complete-recurring' && item.followUpLocalId === previousId) {
      return {
        ...item,
        followUpLocalId: nextId,
      };
    }
    return item;
  })
);

export const collectRemovedQueuedTargetIds = (queue, targetId) => {
  const removedIds = new Set();
  if (!targetId) return removedIds;
  removedIds.add(targetId);
  const items = Array.isArray(queue) ? queue : [];
  for (const descendantId of collectDescendantFollowUpIds(items, targetId)) {
    removedIds.add(descendantId);
  }
  return removedIds;
};

export const removeQueuedTargetOps = (queue, targetId) => {
  const items = Array.isArray(queue) ? queue : [];
  const removedIds = collectRemovedQueuedTargetIds(items, targetId);
  return items.filter((item) => !removedIds.has(item?.targetId));
};
