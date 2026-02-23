const now = () => new Date().toISOString();

export const MANUAL_TODO_SELECT = 'id, project_id, title, due_date, owner_text, assignee_user_id, status, recurrence, created_at, updated_at, completed_at';

export const createManualTodoId = () => `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const TODO_RECURRENCE_TYPE_ALIASES = {
  weekday: 'weekdays',
  weekdays: 'weekdays',
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
  annual: 'yearly'
};

export const normalizeTodoRecurrenceType = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return TODO_RECURRENCE_TYPE_ALIASES[key] || '';
};

export const normalizeTodoRecurrence = (value) => {
  if (!value) return null;

  const rawType = typeof value === 'string' ? value : value.type;
  const type = normalizeTodoRecurrenceType(rawType);
  if (!type) {
    return null;
  }

  const intervalRaw = Number(typeof value === 'object' ? value.interval : 1);
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.floor(intervalRaw) : 1;
  return { type, interval };
};

export const mapManualTodoRow = (row = {}) => ({
  _id: row.id || createManualTodoId(),
  projectId: row.project_id || null,
  title: row.title || '',
  dueDate: row.due_date || '',
  owner: row.owner_text || '',
  assigneeUserId: row.assignee_user_id || null,
  status: row.status === 'Done' ? 'Done' : 'Open',
  recurrence: normalizeTodoRecurrence(row.recurrence),
  createdAt: row.created_at || now(),
  updatedAt: row.updated_at || now(),
  completedAt: row.completed_at || ''
});

export const isMissingRelationError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes('relation') && msg.includes(relationName.toLowerCase());
};
