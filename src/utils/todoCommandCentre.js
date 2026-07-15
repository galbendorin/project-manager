export const TODO_FOCUS_VIEWS = Object.freeze({
  today: 'today',
  mine: 'mine',
  nextSevenDays: 'next-seven-days',
  all: 'all',
});

const VALID_FOCUS_VIEWS = new Set(Object.values(TODO_FOCUS_VIEWS));

const normalizeText = (value = '') => String(value || '').trim().toLowerCase();

const parseIsoDate = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIsoDate = (date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const addDays = (date, count) => {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
};

export const normalizeTodoFocusView = (value) => (
  VALID_FOCUS_VIEWS.has(value) ? value : TODO_FOCUS_VIEWS.all
);

export const isShoppingListProject = (project = {}) => (
  normalizeText(project?.name) === 'shopping list'
);

export const isTodoAssignedToCurrentUser = (item = {}, {
  currentUserId = '',
  currentUserName = '',
} = {}) => {
  const assigneeUserId = String(item?.assigneeUserId || '').trim();
  if (currentUserId && assigneeUserId === currentUserId) return true;

  const owner = normalizeText(item?.owner);
  const userName = normalizeText(currentUserName);
  return Boolean(owner && userName && owner === userName);
};

export const matchesTodoFocusView = (item = {}, focusView = TODO_FOCUS_VIEWS.all, {
  currentUserId = '',
  currentUserName = '',
  today = '',
} = {}) => {
  const normalizedView = normalizeTodoFocusView(focusView);
  if (normalizedView === TODO_FOCUS_VIEWS.all) return true;

  if (normalizedView === TODO_FOCUS_VIEWS.mine) {
    return isTodoAssignedToCurrentUser(item, { currentUserId, currentUserName });
  }

  const todayDate = parseIsoDate(today) || new Date();
  const todayIso = toIsoDate(todayDate);
  const dueDate = parseIsoDate(item?.dueDate);
  if (!dueDate) return false;
  const dueIso = toIsoDate(dueDate);

  if (normalizedView === TODO_FOCUS_VIEWS.today) {
    return dueIso <= todayIso;
  }

  if (normalizedView === TODO_FOCUS_VIEWS.nextSevenDays) {
    return dueIso >= todayIso && dueIso <= toIsoDate(addDays(todayDate, 6));
  }

  return true;
};

export const getTodoFocusCounts = (items = [], options = {}) => ({
  [TODO_FOCUS_VIEWS.today]: items.filter((item) => matchesTodoFocusView(item, TODO_FOCUS_VIEWS.today, options)).length,
  [TODO_FOCUS_VIEWS.mine]: items.filter((item) => matchesTodoFocusView(item, TODO_FOCUS_VIEWS.mine, options)).length,
  [TODO_FOCUS_VIEWS.nextSevenDays]: items.filter((item) => matchesTodoFocusView(item, TODO_FOCUS_VIEWS.nextSevenDays, options)).length,
  [TODO_FOCUS_VIEWS.all]: items.length,
});

export const mergeManualTodoCollections = (...collections) => {
  const merged = new Map();
  collections.flat().filter(Boolean).forEach((item) => {
    const key = item?._id || item?.id;
    if (key) merged.set(key, item);
  });
  return [...merged.values()];
};
