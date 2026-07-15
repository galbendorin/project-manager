import { createOfflineTempId, readLocalJson, readOfflineJson, writeLocalJson } from './offlineState.js';

const SHOPPING_OFFLINE_PREFIX = 'pmworkspace:shopping-offline:v1';

export const generateProjectId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return '';
};

export const generateShoppingOperationId = () => generateProjectId();

export const isProjectRelationMissingError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes(relationName.toLowerCase()) && (msg.includes('relation') || msg.includes('relationship'));
};

export const isRowLevelSecurityError = (error, tableName = '') => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes('row-level security')
    && (!tableName || msg.includes(tableName.toLowerCase()));
};

export const sortTodos = (items = []) => (
  [...items].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'Done' ? 1 : -1;
    }
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  })
);

const toShoppingQuantity = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const roundShoppingQuantity = (value) => {
  const next = toShoppingQuantity(value);
  if (next === null) return null;
  return Math.round(next * 100) / 100;
};

const normalizeShoppingUnit = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
);

export const normalizeShoppingTodoTitle = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
);

export const normalizeBoughtTodoTitle = normalizeShoppingTodoTitle;

const getTodoActivityTime = (todo = {}) => (
  new Date(todo.completedAt || todo.updatedAt || todo.createdAt || 0).getTime()
);

const normalizePreviewItem = (item = {}) => {
  const title = String(item?.title || '').trim();
  const titleKey = normalizeShoppingTodoTitle(title);
  if (!titleKey) return null;

  return {
    ...item,
    key: item.key || titleKey,
    title,
    titleKey,
    quantityValue: toShoppingQuantity(item?.quantityValue),
    quantityUnit: String(item?.quantityUnit || '').trim(),
  };
};

const compareShoppingQuantities = (draftItem = {}, matchingTodo = {}) => {
  const draftQuantity = toShoppingQuantity(draftItem.quantityValue);
  const manualQuantity = toShoppingQuantity(matchingTodo.quantityValue);
  const draftUnit = normalizeShoppingUnit(draftItem.quantityUnit);
  const manualUnit = normalizeShoppingUnit(matchingTodo.quantityUnit);

  if (draftQuantity === null && manualQuantity === null) {
    return { status: 'both-missing', differenceValue: null };
  }
  if (draftQuantity === null) {
    return { status: 'draft-missing-quantity', differenceValue: null };
  }
  if (manualQuantity === null) {
    return { status: 'manual-missing-quantity', differenceValue: draftQuantity };
  }
  if (draftUnit && manualUnit && draftUnit !== manualUnit) {
    return { status: 'unit-mismatch', differenceValue: null };
  }

  const differenceValue = roundShoppingQuantity(draftQuantity - manualQuantity);
  if (differenceValue <= 0) {
    return { status: 'manual-covers', differenceValue };
  }
  return { status: 'manual-short', differenceValue };
};

export const buildMealPlanShoppingSyncPreview = ({
  draftItems = [],
  hiddenDraftItems = [],
  existingTodos = [],
  batchId = '',
} = {}) => {
  const normalizedDraftItems = (Array.isArray(draftItems) ? draftItems : [])
    .map(normalizePreviewItem)
    .filter(Boolean);
  const normalizedHiddenItems = (Array.isArray(hiddenDraftItems) ? hiddenDraftItems : [])
    .map(normalizePreviewItem)
    .filter(Boolean);
  const todos = Array.isArray(existingTodos) ? existingTodos : [];
  const normalizedBatchId = String(batchId || '').trim();
  const draftTitleKeys = new Set(normalizedDraftItems.map((item) => item.titleKey));

  const currentGeneratedItems = todos
    .filter((todo) => (
      todo?.sourceType === 'meal_plan'
      && normalizedBatchId
      && String(todo.sourceBatchId || '') === normalizedBatchId
    ))
    .map((todo) => ({
      ...todo,
      titleKey: normalizeShoppingTodoTitle(todo.title),
      quantityValue: toShoppingQuantity(todo.quantityValue),
      quantityUnit: String(todo.quantityUnit || '').trim(),
    }))
    .filter((todo) => todo.titleKey);
  const completedGeneratedItems = currentGeneratedItems.filter((todo) => todo.status === 'Done');

  const generatedByTitle = new Map();
  for (const item of currentGeneratedItems) {
    if (!generatedByTitle.has(item.titleKey)) {
      generatedByTitle.set(item.titleKey, item);
    }
  }

  const addItems = [];
  const updateItems = [];
  const manualMatches = [];
  const boughtMatches = [];

  for (const item of normalizedDraftItems) {
    const existingGeneratedItem = generatedByTitle.get(item.titleKey) || null;
    if (existingGeneratedItem) {
      updateItems.push({ item, existingItem: existingGeneratedItem });
    } else {
      addItems.push({ item });
    }

    const matchingManualTodos = todos.filter((todo) => (
      normalizeShoppingTodoTitle(todo?.title) === item.titleKey
      && todo?.sourceType !== 'meal_plan'
    ));
    const openManualTodos = matchingManualTodos.filter((todo) => todo.status !== 'Done');
    const completedTodos = todos.filter((todo) => (
      normalizeShoppingTodoTitle(todo?.title) === item.titleKey
      && todo?.status === 'Done'
      && !(
        todo?.sourceType === 'meal_plan'
        && normalizedBatchId
        && String(todo.sourceBatchId || '') === normalizedBatchId
      )
    ));

    if (openManualTodos.length > 0) {
      manualMatches.push({
        item,
        todos: openManualTodos,
        primaryTodo: openManualTodos[0],
        quantityComparison: compareShoppingQuantities(item, openManualTodos[0]),
      });
    }

    if (completedTodos.length > 0) {
      boughtMatches.push({
        item,
        todos: completedTodos,
        primaryTodo: completedTodos[0],
      });
    }
  }

  const removeItems = currentGeneratedItems
    .filter((item) => !draftTitleKeys.has(item.titleKey))
    .map((item) => ({ item }));

  return {
    addItems,
    boughtMatches,
    completedGeneratedItems,
    currentGeneratedItems,
    hiddenItems: normalizedHiddenItems,
    manualMatches,
    removeItems,
    updateItems,
    counts: {
      add: addItems.length,
      boughtMatches: boughtMatches.length,
      completedGenerated: completedGeneratedItems.length,
      generatedCurrent: currentGeneratedItems.length,
      hidden: normalizedHiddenItems.length,
      manualMatches: manualMatches.length,
      remove: removeItems.length,
      update: updateItems.length,
    },
  };
};

export const mergeShoppingItemQuantity = (existingItem = {}, incomingItem = {}) => {
  const existingQuantity = toShoppingQuantity(existingItem.quantityValue);
  const incomingQuantity = toShoppingQuantity(incomingItem.quantityValue);
  const existingUnit = String(existingItem.quantityUnit || '').trim();
  const incomingUnit = String(incomingItem.quantityUnit || '').trim();
  const normalizedExistingUnit = normalizeShoppingUnit(existingUnit);
  const normalizedIncomingUnit = normalizeShoppingUnit(incomingUnit);

  if (incomingQuantity === null) {
    return {
      quantityValue: existingQuantity,
      quantityUnit: existingUnit || incomingUnit || '',
    };
  }

  if (existingQuantity === null) {
    return {
      quantityValue: incomingQuantity,
      quantityUnit: incomingUnit || existingUnit || '',
    };
  }

  if (normalizedExistingUnit && normalizedIncomingUnit && normalizedExistingUnit === normalizedIncomingUnit) {
    return {
      quantityValue: roundShoppingQuantity(existingQuantity + incomingQuantity),
      quantityUnit: incomingUnit || existingUnit || '',
    };
  }

  if (!normalizedExistingUnit && normalizedIncomingUnit) {
    return {
      quantityValue: incomingQuantity,
      quantityUnit: incomingUnit,
    };
  }

  return {
    quantityValue: existingQuantity,
    quantityUnit: existingUnit || incomingUnit || '',
  };
};

export const planShoppingListAdds = ({ existingTodos = [], incomingItems = [] }) => {
  const openTodosByTitle = new Map();

  for (const todo of Array.isArray(existingTodos) ? existingTodos : []) {
    if (!todo?._id || todo.status === 'Done') continue;
    const key = normalizeShoppingTodoTitle(todo.title);
    if (!key) continue;

    const current = openTodosByTitle.get(key);
    if (!current || getTodoActivityTime(todo) > getTodoActivityTime(current)) {
      openTodosByTitle.set(key, todo);
    }
  }

  const consolidatedIncoming = new Map();

  for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
    const title = String(item?.title || '').trim();
    const key = normalizeShoppingTodoTitle(title);
    if (!key) continue;

    const normalizedItem = {
      ...item,
      title,
      operationId: String(item?.operationId || '').trim(),
      quantityValue: toShoppingQuantity(item?.quantityValue),
      quantityUnit: String(item?.quantityUnit || '').trim(),
      sourceType: String(item?.sourceType || '').trim(),
      sourceBatchId: item?.sourceBatchId || null,
      meta: item?.meta && typeof item.meta === 'object' ? item.meta : {},
    };

    const current = consolidatedIncoming.get(key);
    if (!current) {
      consolidatedIncoming.set(key, normalizedItem);
      continue;
    }

    const mergedQuantity = mergeShoppingItemQuantity(current, normalizedItem);
    consolidatedIncoming.set(key, {
      ...current,
      ...normalizedItem,
      quantityValue: mergedQuantity.quantityValue,
      quantityUnit: mergedQuantity.quantityUnit,
      operationId: current.operationId || normalizedItem.operationId,
      sourceType: current.sourceType || normalizedItem.sourceType,
      sourceBatchId: current.sourceBatchId || normalizedItem.sourceBatchId,
      meta: Object.keys(current.meta || {}).length > 0 ? current.meta : normalizedItem.meta,
    });
  }

  const inserts = [];
  const updates = [];
  const preparedItems = Array.from(consolidatedIncoming.values());

  for (const item of consolidatedIncoming.values()) {
    const key = normalizeShoppingTodoTitle(item.title);
    const existingTodo = openTodosByTitle.get(key);

    if (!existingTodo) {
      inserts.push(item);
      continue;
    }

    const mergedQuantity = mergeShoppingItemQuantity(existingTodo, item);
    updates.push({
      todoId: existingTodo._id,
      title: existingTodo.title || item.title,
      quantityValue: mergedQuantity.quantityValue,
      quantityUnit: mergedQuantity.quantityUnit,
    });
  }

  return {
    inserts,
    preparedItems,
    updates,
    addedCount: inserts.length,
    mergedCount: updates.length,
  };
};

export const formatShoppingAddSummary = ({ addedCount = 0, mergedCount = 0, queuedCount = 0 } = {}) => {
  if (queuedCount > 0) {
    return queuedCount === 1
      ? 'Saved 1 grocery change offline. It will sync automatically.'
      : `Saved ${queuedCount} grocery changes offline. They will sync automatically.`;
  }
  if (addedCount > 0 && mergedCount > 0) {
    return `Added ${addedCount} new ${addedCount === 1 ? 'grocery' : 'groceries'} and merged ${mergedCount} into the open list.`;
  }
  if (addedCount > 0) {
    return addedCount === 1
      ? 'Added 1 new grocery.'
      : `Added ${addedCount} new groceries.`;
  }
  if (mergedCount > 0) {
    return mergedCount === 1
      ? 'Merged 1 grocery into the open list.'
      : `Merged ${mergedCount} groceries into the open list.`;
  }
  return 'No groceries were added.';
};

export const findUncertainShoppingCreateMatch = (record = {}, todos = []) => {
  if (record?.uncertainCommit !== true) return null;

  const titleKey = normalizeShoppingTodoTitle(record.title);
  if (!titleKey) return null;

  const matchingTodo = (Array.isArray(todos) ? todos : []).find((todo) => (
    todo?.status !== 'Done'
    && normalizeShoppingTodoTitle(todo?.title) === titleKey
  ));
  if (!matchingTodo) return null;

  const requestedQuantity = toShoppingQuantity(record.quantityValue);
  if (requestedQuantity === null) return matchingTodo;

  const savedQuantity = toShoppingQuantity(matchingTodo.quantityValue);
  const requestedUnit = normalizeShoppingUnit(record.quantityUnit);
  const savedUnit = normalizeShoppingUnit(matchingTodo.quantityUnit);

  if (savedQuantity === null || requestedUnit !== savedUnit) return null;
  return savedQuantity >= requestedQuantity ? matchingTodo : null;
};

const getQueuedShoppingChangeTitle = (item = {}) => {
  if (item.kind === 'create') {
    return String(item.record?.title || '').trim();
  }
  if (item.kind === 'update') {
    return String(item.patch?.title || '').trim();
  }
  return '';
};

const formatQueuedShoppingChangeTitles = (queue = []) => {
  const titles = (Array.isArray(queue) ? queue : [])
    .map(getQueuedShoppingChangeTitle)
    .filter(Boolean);

  if (titles.length === 0) return '';

  const visibleTitles = titles.slice(0, 3).join(', ');
  const hiddenCount = titles.length - 3;
  return hiddenCount > 0
    ? `${visibleTitles}, and ${hiddenCount} more`
    : visibleTitles;
};

export const getShoppingQueueSyncDetail = (queue = [], { syncing = false } = {}) => {
  const queuedItems = Array.isArray(queue) ? queue : [];
  const queuedAdds = queuedItems.filter((item) => item?.kind === 'create');
  const protectedAdds = queuedAdds.filter((item) => String(item?.record?.operationId || '').trim());
  const titleList = formatQueuedShoppingChangeTitles(queuedItems);
  const titlePrefix = titleList
    ? `${syncing ? 'Syncing now' : 'Waiting to save'}: ${titleList}. `
    : '';

  if (syncing) {
    return `${titlePrefix}Your queued grocery updates are being pushed to the shared list now.`;
  }

  if (protectedAdds.length > 0 && protectedAdds.length === queuedItems.length) {
    return `${titlePrefix}These grocery changes are safe on this phone and protected against duplicate add retries.`;
  }

  return `${titlePrefix}These grocery changes are safe on this phone and will sync automatically.`;
};

export const getShoppingQuickAddSyncState = ({
  isOnline = true,
  queueCount = 0,
  syncing = false,
  hasFailedItem = false,
  lastSyncLabel = '',
} = {}) => {
  const safeQueueCount = Math.max(0, Number.isFinite(Number(queueCount)) ? Number(queueCount) : 0);
  const changeLabel = `${safeQueueCount} change${safeQueueCount === 1 ? '' : 's'}`;

  if (hasFailedItem) {
    return {
      status: 'error',
      label: 'Needs retry',
      detail: 'One grocery did not save yet. It stays on this phone until you retry.',
    };
  }

  if (syncing && safeQueueCount > 0) {
    return {
      status: 'syncing',
      label: 'Syncing now',
      detail: `${changeLabel} going to the shared list.`,
    };
  }

  if (safeQueueCount > 0) {
    return {
      status: 'queue',
      label: 'Saved on this phone',
      detail: isOnline
        ? `${changeLabel} ready to sync.`
        : `${changeLabel} will sync when signal returns.`,
    };
  }

  if (!isOnline) {
    return {
      status: 'offline',
      label: 'Offline ready',
      detail: 'Add and tick groceries from this phone.',
    };
  }

  if (lastSyncLabel) {
    return {
      status: 'ok',
      label: 'Shared list saved',
      detail: `Last synced at ${lastSyncLabel}.`,
    };
  }

  return {
    status: 'ok',
    label: 'Ready',
    detail: 'This list stays available once it has loaded on this phone.',
  };
};

export const groupCompletedShoppingTodos = (items = []) => {
  const groups = new Map();

  for (const todo of Array.isArray(items) ? items : []) {
    if (!todo?._id) continue;

    const titleKey = normalizeBoughtTodoTitle(todo.title);
    if (!titleKey) continue;

    const existing = groups.get(titleKey);
    if (!existing) {
      groups.set(titleKey, {
        key: titleKey,
        title: todo.title,
        primaryTodo: todo,
        todos: [todo],
        count: 1,
      });
      continue;
    }

    const nextTodos = [...existing.todos, todo];
    const nextPrimary = getTodoActivityTime(todo) > getTodoActivityTime(existing.primaryTodo)
      ? todo
      : existing.primaryTodo;

    groups.set(titleKey, {
      ...existing,
      title: nextPrimary.title,
      primaryTodo: nextPrimary,
      todos: nextTodos,
      count: nextTodos.length,
    });
  }

  return [...groups.values()].sort((left, right) => (
    getTodoActivityTime(right.primaryTodo) - getTodoActivityTime(left.primaryTodo)
  ));
};

export const mergeTodosById = (existingItems = [], incomingItems = []) => {
  const merged = new Map();

  for (const item of existingItems || []) {
    if (item?._id) merged.set(item._id, item);
  }

  for (const item of incomingItems || []) {
    if (!item?._id) continue;
    const current = merged.get(item._id) || {};
    merged.set(item._id, { ...current, ...item });
  }

  return sortTodos(Array.from(merged.values()));
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const todoFromQueuedShoppingCreate = (operation = {}, projectId = '') => {
  const record = operation.record || {};
  const localId = operation.targetId || record.localId || record._id || record.id || '';
  const title = String(record.title || '').trim();
  if (!localId || !title) return null;

  const timestamp = record.updatedAt || record.createdAt || new Date().toISOString();
  return {
    _id: localId,
    projectId: record.projectId || projectId || null,
    title,
    dueDate: record.dueDate || '',
    owner: record.owner || '',
    assigneeUserId: record.userId || record.assigneeUserId || null,
    status: record.status === 'Done' ? 'Done' : 'Open',
    recurrence: record.recurrence || null,
    quantityValue: toShoppingQuantity(record.quantityValue),
    quantityUnit: record.quantityUnit || '',
    sourceType: record.sourceType || '',
    sourceBatchId: record.sourceBatchId || null,
    meta: record.meta && typeof record.meta === 'object' ? record.meta : {},
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp,
    completedAt: record.completedAt || '',
  };
};

export const applyShoppingQueueToTodos = ({ todos = [], queue = [], projectId = '' } = {}) => {
  const visibleTodos = new Map();
  const normalizedProjectId = String(projectId || '').trim();

  for (const todo of Array.isArray(todos) ? todos : []) {
    if (todo?._id) {
      visibleTodos.set(todo._id, todo);
    }
  }

  for (const operation of Array.isArray(queue) ? queue : []) {
    if (!operation || typeof operation !== 'object') continue;

    if (operation.kind === 'create') {
      const recordProjectId = String(operation.record?.projectId || '').trim();
      if (normalizedProjectId && recordProjectId && recordProjectId !== normalizedProjectId) {
        continue;
      }

      const queuedTodo = todoFromQueuedShoppingCreate(operation, normalizedProjectId);
      if (queuedTodo) {
        visibleTodos.set(queuedTodo._id, {
          ...(visibleTodos.get(queuedTodo._id) || {}),
          ...queuedTodo,
        });
      }
      continue;
    }

    const targetId = operation.targetId;
    if (!targetId || !visibleTodos.has(targetId)) continue;

    if (operation.kind === 'delete') {
      visibleTodos.delete(targetId);
      continue;
    }

    if (operation.kind === 'update') {
      const currentTodo = visibleTodos.get(targetId);
      const patch = operation.patch || {};
      visibleTodos.set(targetId, {
        ...currentTodo,
        ...(hasOwn(patch, 'title') ? { title: patch.title } : {}),
        ...(hasOwn(patch, 'status') ? { status: patch.status } : {}),
        ...(hasOwn(patch, 'completedAt') ? { completedAt: patch.completedAt || '' } : {}),
        ...(hasOwn(patch, 'quantityValue') ? { quantityValue: toShoppingQuantity(patch.quantityValue) } : {}),
        ...(hasOwn(patch, 'quantityUnit') ? { quantityUnit: patch.quantityUnit || '' } : {}),
        updatedAt: patch.updatedAt || currentTodo.updatedAt,
      });
    }
  }

  return sortTodos(Array.from(visibleTodos.values()));
};

export const formatSharedActorLabel = (value = '') => {
  const email = String(value || '').trim().toLowerCase();
  const localPart = email.split('@')[0] || '';
  if (!localPart) return '';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export const resolveSharedActorLabel = (row = {}, project, currentUserId) => {
  const actorId = row.user_id || row.assignee_user_id || '';
  if (!actorId || actorId === currentUserId) return '';
  if (actorId === project?.user_id) return 'Owner';

  const matchingMember = (project?.project_members || []).find((member) => member?.user_id === actorId);
  const memberLabel = formatSharedActorLabel(matchingMember?.member_email);
  return memberLabel || 'Someone';
};

export const splitTypedGroceries = (value = '') => (
  String(value || '')
    .split(/\s*[,;\n]\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
);

export const describeShoppingProject = (project, index) => {
  if (project.isOwned) return 'Your Shopping List';
  const createdAt = project.created_at ? new Date(project.created_at) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return `Shared List · ${createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }
  return `Shared List ${index + 1}`;
};

const getProjectShareScore = (project = {}, currentUserId = null) => {
  const members = Array.isArray(project?.project_members) ? project.project_members : [];
  const isOwned = Boolean(project?.user_id && currentUserId && project.user_id === currentUserId);
  const isShared = members.length > 0;

  if (isOwned && isShared) return 4;
  if (!isOwned && isShared) return 3;
  if (isOwned) return 2;
  return 1;
};

export const pickPreferredShoppingProject = (projects = [], currentUserId = null, preferredProjectId = '') => {
  const candidates = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (candidates.length === 0) return null;

  const normalizedPreferredProjectId = String(preferredProjectId || '').trim();
  if (normalizedPreferredProjectId) {
    const preferredProject = candidates.find((project) => project?.id === normalizedPreferredProjectId);
    if (preferredProject) {
      return preferredProject;
    }
  }

  return [...candidates].sort((left, right) => {
    const scoreDifference = getProjectShareScore(right, currentUserId) - getProjectShareScore(left, currentUserId);
    if (scoreDifference !== 0) return scoreDifference;

    const leftTime = new Date(left.created_at || left.createdAt || 0).getTime();
    const rightTime = new Date(right.created_at || right.createdAt || 0).getTime();
    return leftTime - rightTime;
  })[0] || null;
};

export const buildShoppingOfflineKey = (userId = 'anon') => `${SHOPPING_OFFLINE_PREFIX}:${userId}`;

export const createEmptyShoppingOfflineState = () => ({
  projects: [],
  selectedProjectId: '',
  todosByProject: {},
  queue: [],
  lastSyncedAt: '',
});

export const normalizeShoppingOfflineState = (state) => {
  const baseState = createEmptyShoppingOfflineState();
  const rawState = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const rawTodosByProject = (
    rawState.todosByProject && typeof rawState.todosByProject === 'object' && !Array.isArray(rawState.todosByProject)
      ? rawState.todosByProject
      : {}
  );

  const todosByProject = Object.fromEntries(
    Object.entries(rawTodosByProject)
      .filter(([projectId]) => String(projectId || '').trim())
      .map(([projectId, items]) => [
        projectId,
        Array.isArray(items) ? items.filter((item) => item && typeof item === 'object') : [],
      ])
  );

  return {
    ...baseState,
    ...rawState,
    projects: Array.isArray(rawState.projects) ? rawState.projects.filter((item) => item && typeof item === 'object') : [],
    selectedProjectId: typeof rawState.selectedProjectId === 'string' ? rawState.selectedProjectId : '',
    todosByProject,
    queue: Array.isArray(rawState.queue) ? rawState.queue.filter((item) => item && typeof item === 'object') : [],
    lastSyncedAt: typeof rawState.lastSyncedAt === 'string' ? rawState.lastSyncedAt : '',
  };
};

export const loadShoppingOfflineState = (userId) => (
  normalizeShoppingOfflineState(readLocalJson(buildShoppingOfflineKey(userId), createEmptyShoppingOfflineState()))
);

export const loadShoppingOfflineStateAsync = async (userId) => (
  normalizeShoppingOfflineState(await readOfflineJson(buildShoppingOfflineKey(userId), createEmptyShoppingOfflineState()))
);

export const saveShoppingOfflineState = (userId, state) => {
  writeLocalJson(buildShoppingOfflineKey(userId), normalizeShoppingOfflineState(state));
};

export const createOfflineShoppingTodo = ({
  title,
  projectId,
  userId,
  status = 'Open',
  completedAt = '',
  quantityValue = null,
  quantityUnit = '',
  sourceType = '',
  sourceBatchId = null,
  meta = {},
}) => {
  const normalizedQuantityValue = (
    quantityValue === null || quantityValue === undefined || quantityValue === ''
      ? null
      : (Number.isFinite(Number(quantityValue)) ? Number(quantityValue) : null)
  );
  const timestamp = new Date().toISOString();
  return {
    _id: createOfflineTempId('offline-todo'),
    projectId,
    title,
    dueDate: '',
    owner: '',
    assigneeUserId: userId,
    status,
    recurrence: null,
    quantityValue: normalizedQuantityValue,
    quantityUnit,
    sourceType,
    sourceBatchId,
    meta: meta && typeof meta === 'object' ? meta : {},
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt,
  };
};

export const formatSyncTimeLabel = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
