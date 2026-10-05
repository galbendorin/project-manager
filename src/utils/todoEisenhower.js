export const MATRIX_QUADRANTS = Object.freeze([
  { id: "urgent_important", title: "Do", label: "Urgent & Important" },
  { id: "not_urgent_important", title: "Plan", label: "Important, Not Urgent" },
  {
    id: "urgent_not_important",
    title: "Delegate",
    label: "Urgent, Not Important",
  },
  {
    id: "not_urgent_not_important",
    title: "Defer",
    label: "Neither Urgent nor Important",
  },
]);
export const DEFAULT_MATRIX_QUADRANT = "not_urgent_important";
export const taskViewIdentity = (todo) =>
  todo?.isDerived
    ? `project:${todo.projectId || "personal"}:${todo._id || todo.id}`
    : `manual:${todo?._id || todo?.id}`;
export const validMatrixQuadrant = (value) =>
  MATRIX_QUADRANTS.some((q) => q.id === value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validCalendarDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};
export const matrixReference = (todo) => {
  if (!todo?.isDerived) {
    const id = todo?._id || todo?.id;
    return UUID.test(id || "")
      ? {
          task_key: `manual:${id}`,
          manual_todo_id: id,
          project_id: null,
          card_key: null,
        }
      : null;
  }
  if (!UUID.test(todo.projectId || "") || todo.hasStableOriginId !== true)
    return null;
  let key;
  if (
    todo.originType === "register" &&
    todo.originRegisterType &&
    todo.originItemId
  )
    key = `register:${todo.originRegisterType}:${todo.originItemId}`;
  if (todo.originType === "tracker" && todo.originItemId)
    key = `tracker:${todo.originItemId}`;
  if (todo.originType === "schedule" && todo.originTaskId != null)
    key = `schedule:${todo.originTaskId}`;
  return key
    ? {
        task_key: `project:${todo.projectId}:${key}`,
        manual_todo_id: null,
        project_id: todo.projectId,
        card_key: key,
      }
    : null;
};
export const matrixPlacement = (todo, preference, today) => {
  const manual = validMatrixQuadrant(preference?.manual_quadrant)
    ? preference.manual_quadrant
    : DEFAULT_MATRIX_QUADRANT;
  const overdue =
    todo.status !== "Done" &&
    validCalendarDay(today) &&
    validCalendarDay(todo.dueDate) &&
    todo.dueDate < today;
  return {
    quadrant: overdue ? "urgent_important" : manual,
    overdue,
    automatic: overdue && manual !== "urgent_important",
    unclassified: !preference,
  };
};
export const groupMatrixTasks = (todos, preferences, today) =>
  MATRIX_QUADRANTS.map((quadrant) => ({
    ...quadrant,
    cards: todos
      .filter((todo) => todo.status !== "Done")
      .map((todo) => {
        const reference = matrixReference(todo);
        const preference = reference ? preferences[reference.task_key] : null;
        return { todo, reference, ...matrixPlacement(todo, preference, today) };
      })
      .filter((card) => card.quadrant === quadrant.id)
      .sort(
        (a, b) =>
          (a.todo.dueDate || "9999").localeCompare(b.todo.dueDate || "9999") ||
          (a.todo.title || "").localeCompare(b.todo.title || "") ||
          String(a.reference?.task_key || a.todo._id).localeCompare(
            String(b.reference?.task_key || b.todo._id),
          ),
      ),
  }));
