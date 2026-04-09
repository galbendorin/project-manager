const now = () => new Date().toISOString();

export const MANUAL_TODO_SELECT = 'id, project_id, title, description, due_date, owner_text, assignee_user_id, status, recurrence, kanban_column_id, kanban_position, created_at, updated_at, completed_at';
export const LEGACY_MANUAL_TODO_SELECT = 'id, project_id, title, due_date, owner_text, assignee_user_id, status, recurrence, created_at, updated_at, completed_at';
export const SHOPPING_MANUAL_TODO_SELECT = 'id, project_id, title, description, due_date, owner_text, assignee_user_id, status, recurrence, kanban_column_id, kanban_position, quantity_value, quantity_unit, source_type, source_batch_id, meta, created_at, updated_at, completed_at';
export const SHOPPING_MANUAL_TODO_EXTRA_FIELDS = ['quantity_value', 'quantity_unit', 'source_type', 'source_batch_id', 'meta'];

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
  description: row.description || '',
  dueDate: row.due_date || '',
  owner: row.owner_text || '',
  assigneeUserId: row.assignee_user_id || null,
  status: row.status === 'Done' ? 'Done' : 'Open',
  recurrence: normalizeTodoRecurrence(row.recurrence),
  kanbanColumnId: row.kanban_column_id || null,
  kanbanPosition: Number.isFinite(Number(row.kanban_position)) ? Number(row.kanban_position) : 0,
  quantityValue: Number.isFinite(Number(row.quantity_value)) ? Number(row.quantity_value) : null,
  quantityUnit: row.quantity_unit || '',
  sourceType: row.source_type || '',
  sourceBatchId: row.source_batch_id || null,
  meta: row.meta && typeof row.meta === 'object' ? row.meta : {},
  createdAt: row.created_at || now(),
  updatedAt: row.updated_at || now(),
  completedAt: row.completed_at || ''
});

export const isMissingRelationError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return msg.includes('relation') && msg.includes(relationName.toLowerCase());
};

export const isMissingSchemaFieldError = (error, fieldNames = []) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  if (!msg) return false;
  return fieldNames.some((fieldName) => msg.includes(String(fieldName || '').toLowerCase()));
};
