import { createOfflineTempId, readLocalJson, readOfflineJson, writeLocalJson } from './offlineState.js';

const SHOPPING_OFFLINE_PREFIX = 'pmworkspace:shopping-offline:v1';

export const generateProjectId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return '';
};

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

export const normalizeBoughtTodoTitle = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
);

const getTodoActivityTime = (todo = {}) => (
  new Date(todo.completedAt || todo.updatedAt || todo.createdAt || 0).getTime()
);

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

export const pickPreferredShoppingProject = (projects = [], currentUserId = null) => {
  const candidates = Array.isArray(projects) ? projects.filter(Boolean) : [];
  if (candidates.length === 0) return null;

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
