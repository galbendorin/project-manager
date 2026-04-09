import { createOfflineTempId, readLocalJson, readOfflineJson, writeLocalJson } from './offlineState';

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

export const buildShoppingOfflineKey = (userId = 'anon') => `${SHOPPING_OFFLINE_PREFIX}:${userId}`;

export const createEmptyShoppingOfflineState = () => ({
  projects: [],
  selectedProjectId: '',
  todosByProject: {},
  queue: [],
  lastSyncedAt: '',
});

export const loadShoppingOfflineState = (userId) => (
  readLocalJson(buildShoppingOfflineKey(userId), createEmptyShoppingOfflineState())
);

export const loadShoppingOfflineStateAsync = async (userId) => (
  readOfflineJson(buildShoppingOfflineKey(userId), createEmptyShoppingOfflineState())
);

export const saveShoppingOfflineState = (userId, state) => {
  writeLocalJson(buildShoppingOfflineKey(userId), {
    ...createEmptyShoppingOfflineState(),
    ...(state || {}),
  });
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
