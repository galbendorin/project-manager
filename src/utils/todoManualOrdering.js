export const TODO_ORDER_STEP = 1024;

export const getTodoIdentity = (todo = {}) => String(todo?._id || todo?.id || '');

export const canReorderTodo = (todo = {}, options = {}) => {
  if (options.isExternalView) return false;
  return Boolean(todo?._id) && todo.status !== 'Done';
};

export const getStoredTodoOrder = (todo = {}) => {
  const boardValue = Number(todo?.boardPosition);
  if (Number.isFinite(boardValue)) return boardValue;
  const value = Number(todo?.kanbanPosition);
  return Number.isFinite(value) ? value : null;
};

export const getTodoOrderValue = (todo = {}, fallbackIndex = 0) => {
  const storedOrder = getStoredTodoOrder(todo);
  if (storedOrder !== null) return storedOrder;
  return (fallbackIndex + 1) * TODO_ORDER_STEP;
};

const compareTodoFallback = (a, b) => {
  if (a.status !== b.status) {
    return a.status === 'Open' ? -1 : 1;
  }
  if (a.dueDate && b.dueDate) {
    const dueDateComparison = a.dueDate.localeCompare(b.dueDate);
    if (dueDateComparison !== 0) return dueDateComparison;
  } else if (a.dueDate) {
    return -1;
  } else if (b.dueDate) {
    return 1;
  }
  return String(a.title || '').localeCompare(String(b.title || ''));
};

export const sortTodosForManualOrder = (items = []) => (
  [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const fallbackComparison = compareTodoFallback(left.item, right.item);

      if (left.item.status !== right.item.status) {
        return fallbackComparison;
      }

      const leftOrder = getTodoOrderValue(left.item, left.index);
      const rightOrder = getTodoOrderValue(right.item, right.index);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;

      if (fallbackComparison !== 0) return fallbackComparison;
      return left.index - right.index;
    })
    .map(({ item }) => item)
);

export const calculateTodoReorderPosition = (items = [], targetIndex = 0) => {
  const orderedItems = sortTodosForManualOrder(items);
  const boundedIndex = Math.max(0, Math.min(Number(targetIndex) || 0, orderedItems.length));
  const previous = boundedIndex > 0 ? orderedItems[boundedIndex - 1] : null;
  const next = boundedIndex < orderedItems.length ? orderedItems[boundedIndex] : null;
  const previousPos = previous ? getTodoOrderValue(previous, boundedIndex - 1) : null;
  const nextPos = next ? getTodoOrderValue(next, boundedIndex) : null;

  if (previousPos === null && nextPos === null) return TODO_ORDER_STEP;
  if (previousPos === null) {
    return nextPos > 1 ? nextPos / 2 : nextPos - TODO_ORDER_STEP;
  }
  if (nextPos === null) return previousPos + TODO_ORDER_STEP;
  if (previousPos === nextPos) return previousPos + 1;
  return previousPos + ((nextPos - previousPos) / 2);
};
