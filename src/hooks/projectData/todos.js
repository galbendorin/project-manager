import { getCurrentDate, getNextRecurringDueDate } from '../../utils/helpers';
import { createManualTodoId, normalizeTodoRecurrence } from './manualTodoUtils';

export const createLocalManualTodo = ({ todoData = {}, projectId, userId, ts }) => {
  const normalizedRecurrence = normalizeTodoRecurrence(todoData.recurrence);
  const nextProjectId = Object.prototype.hasOwnProperty.call(todoData, 'projectId')
    ? todoData.projectId
    : projectId;

  return {
    _id: createManualTodoId(),
    projectId: nextProjectId || null,
    title: todoData.title || 'New ToDo',
    dueDate: todoData.dueDate || getCurrentDate(),
    owner: todoData.owner || 'PM',
    assigneeUserId: todoData.assigneeUserId || userId || null,
    status: todoData.status === 'Done' ? 'Done' : 'Open',
    recurrence: normalizedRecurrence,
    createdAt: ts,
    updatedAt: ts,
    completedAt: todoData.status === 'Done' ? ts : ''
  };
};

export const buildLocalTodoUpdate = ({ todo, key, value, userId, ts }) => {
  const normalizedRecurrence = key === 'recurrence'
    ? normalizeTodoRecurrence(value)
    : normalizeTodoRecurrence(todo.recurrence);
  const nextStatus = key === 'status' ? value : todo.status;
  const transitionedToDone = todo.status !== 'Done' && nextStatus === 'Done';

  const localUpdated = {
    ...todo,
    updatedAt: ts
  };

  if (key === 'title') localUpdated.title = value;
  if (key === 'dueDate') localUpdated.dueDate = value;
  if (key === 'owner') localUpdated.owner = value;
  if (key === 'projectId') localUpdated.projectId = value || null;
  if (key === 'assigneeUserId') localUpdated.assigneeUserId = value || null;
  if (key === 'recurrence') localUpdated.recurrence = normalizedRecurrence;
  if (key === 'status') {
    localUpdated.status = value;
    localUpdated.completedAt = value === 'Done' ? (todo.completedAt || ts) : '';
  }

  const nextRecurringDueDate = transitionedToDone && normalizedRecurrence
    ? getNextRecurringDueDate(localUpdated.dueDate, normalizedRecurrence, getCurrentDate())
    : '';

  let followUpLocal = null;
  if (transitionedToDone && normalizedRecurrence) {
    followUpLocal = {
      _id: createManualTodoId(),
      projectId: localUpdated.projectId || null,
      title: localUpdated.title || 'New ToDo',
      dueDate: nextRecurringDueDate,
      owner: localUpdated.owner || 'PM',
      assigneeUserId: localUpdated.assigneeUserId || userId || null,
      status: 'Open',
      recurrence: normalizedRecurrence,
      createdAt: ts,
      updatedAt: ts,
      completedAt: ''
    };
  }

  return {
    localUpdated,
    followUpLocal,
    normalizedRecurrence,
    nextStatus,
    transitionedToDone,
    nextRecurringDueDate
  };
};

export const applyTodoUpdateToState = (items, todoId, localUpdated, followUpLocal = null) => {
  const next = items.map((item) => (item._id === todoId ? localUpdated : item));
  if (followUpLocal) {
    next.push(followUpLocal);
  }
  return next;
};

export const buildTodoUpdatePatch = ({ todo, key, value, normalizedRecurrence, nextStatus, ts }) => {
  const patch = { updated_at: ts };
  if (key === 'title') patch.title = value || '';
  if (key === 'dueDate') patch.due_date = value || null;
  if (key === 'owner') patch.owner_text = value || '';
  if (key === 'projectId') patch.project_id = value || null;
  if (key === 'assigneeUserId') patch.assignee_user_id = value || null;
  if (key === 'recurrence') patch.recurrence = normalizedRecurrence;
  if (key === 'status') {
    patch.status = nextStatus === 'Done' ? 'Done' : 'Open';
    patch.completed_at = nextStatus === 'Done' ? (todo.completedAt || ts) : null;
  }
  return patch;
};

export const buildRecurringFollowUpInsert = ({
  userId,
  localUpdated,
  normalizedRecurrence,
  nextRecurringDueDate
}) => ({
  user_id: userId,
  project_id: localUpdated.projectId || null,
  title: localUpdated.title || 'New ToDo',
  due_date: nextRecurringDueDate || null,
  owner_text: localUpdated.owner || 'PM',
  assignee_user_id: localUpdated.assigneeUserId || userId,
  status: 'Open',
  recurrence: normalizedRecurrence,
  completed_at: null
});
