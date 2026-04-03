import { isOfflineTempId } from './offlineState';

export const enqueueCreate = (queue, record) => [
  ...(Array.isArray(queue) ? queue : []),
  {
    kind: 'create',
    targetId: record.localId,
    record,
  }
];

export const enqueueUpdate = (queue, targetId, patch) => {
  const nextQueue = Array.isArray(queue) ? [...queue] : [];
  const createIndex = nextQueue.findIndex((item) => item.kind === 'create' && item.targetId === targetId);

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

  const updateIndex = nextQueue.findIndex((item) => item.kind === 'update' && item.targetId === targetId);
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

export const enqueueDelete = (queue, targetId) => {
  let nextQueue = Array.isArray(queue) ? [...queue] : [];

  if (isOfflineTempId(targetId)) {
    return nextQueue.filter((item) => item.targetId !== targetId);
  }

  nextQueue = nextQueue.filter((item) => !(item.kind === 'update' && item.targetId === targetId));
  const existingDeleteIndex = nextQueue.findIndex((item) => item.kind === 'delete' && item.targetId === targetId);

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
  (Array.isArray(queue) ? queue : []).map((item) => (
    item.targetId === previousId
      ? { ...item, targetId: nextId }
      : item
  ))
);
