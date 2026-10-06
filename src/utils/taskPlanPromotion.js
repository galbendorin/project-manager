import { calculateSchedule, getFinishDate, getTaskDependencies, parseDateValue, toISODateString } from './helpers.js';
import { matrixReference, validCalendarDay } from './todoEisenhower.js';

const CLOSED = /^(done|completed|closed|cancelled|resolved)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function promotionReference(todo) {
  const reference = matrixReference(todo);
  if (!reference) return null;
  if (!todo.isDerived) return { kind: 'manual', id: todo._id || todo.id, projectId: todo.projectId || null, key: reference.task_key };
  if (todo.originType === 'register' && todo.originRegisterType === 'actions') return { kind: 'action', id: todo.originItemId, projectId: todo.projectId, key: reference.task_key };
  if (todo.originType === 'tracker') return { kind: 'tracker', id: todo.originItemId, projectId: todo.projectId, key: reference.task_key };
  return null;
}

export function promotionTodoFromSource(kind, item, projectId) {
  return { _id: `${kind}_${item._id}`, isDerived: true, hasStableOriginId: Boolean(item._id), projectId,
    originType: kind === 'action' ? 'register' : 'tracker', originRegisterType: kind === 'action' ? 'actions' : '', originItemId: item._id,
    originTaskId: kind === 'action' ? item.sourceTaskId ?? null : item.taskId ?? null,
    title: kind === 'action' ? item.description || item.currentstatus : item.taskName,
    status: item.status, dueDate: kind === 'action' ? item.target : item.dueDate,
    planLink: item.projectPlanLink, planProgress: item.planProgress };
}

export function planLinkForTodo(todo) {
  const link = todo?.planLink || todo?.meta?.projectPlanLink;
  return link?.projectId && link?.taskId != null ? link : null;
}

export function promotionEligibility(todo, { readOnly = false } = {}) {
  const reference = promotionReference(todo);
  if (readOnly) return { eligible: false, reason: 'This view is read-only.' };
  const link = planLinkForTodo(todo);
  if (link) return { eligible: false, link, reason: 'This task is already in Project Plan.' };
  if (!reference) return { eligible: false, reason: 'Save a manual task, action or tracker item with a stable ID first.' };
  if (CLOSED.test(todo.status || '')) return { eligible: false, reason: 'Only open work can be moved into Project Plan.' };
  if (reference.kind === 'manual' && (todo.recurrence || todo.sourceBatchId || todo.sourceType)) return { eligible: false, reason: 'This flow schedules one-off manual tasks.' };
  if (todo.originTaskId != null) return { eligible: false, link: { projectId: todo.projectId, taskId: todo.originTaskId }, reason: 'Open the existing Project Plan task.' };
  return { eligible: true, reference };
}

// Validate before calling calculateSchedule, whose recursive resolver has no
// visiting-set cycle guard. Include a predecessor group's descendants for
// successors outside the group, matching summary dependencies in the scheduler.
export function validatePromotionGraph(tasks) {
  if (!Array.isArray(tasks)) throw new Error('The project plan could not be loaded.');
  const byId = new Map(); const edges = new Map(); const hierarchy = []; const descendants = new Map();
  for (const task of tasks) {
    if (task?.id == null || byId.has(String(task.id))) throw new Error('The existing plan has missing or duplicate task IDs.');
    const id = String(task.id); byId.set(id, task); edges.set(id, []); descendants.set(id, new Set());
  }
  for (const task of tasks) {
    const id = String(task.id);
    const indent = Math.max(0, Number(task.indent) || 0);
    while (hierarchy.length && hierarchy.at(-1).indent >= indent) hierarchy.pop();
    for (const ancestor of hierarchy) descendants.get(ancestor.id).add(id);
    hierarchy.push({ id, indent });
  }
  for (const task of tasks) {
    const id = String(task.id); const seen = new Set();
    for (const dependency of getTaskDependencies(task)) {
      const parent = String(dependency.parentId);
      if (!byId.has(parent)) throw new Error('A predecessor is missing from this project.');
      if (parent === id || seen.has(parent)) throw new Error('Choose distinct predecessors other than the task itself.');
      seen.add(parent); edges.get(id).push(parent);
      // The scheduler uses a predecessor group's child summary only when the
      // successor is outside that group. Children may depend on their group's
      // own start without creating a summary→child recursion.
      if (!descendants.get(parent).has(id)) edges.get(id).push(...descendants.get(parent));
    }
  }
  const visiting = new Set(); const complete = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error('These dependencies would create a cycle.');
    if (complete.has(id)) return;
    visiting.add(id); edges.get(id).forEach(visit); visiting.delete(id); complete.add(id);
  };
  byId.forEach((_task, id) => visit(id));
  return true;
}

export function buildPromotionPreview(tasks, draft) {
  validatePromotionGraph(tasks);
  if (!String(draft?.name || '').trim()) throw new Error('Enter a task title.');
  const type = draft.type || 'Task';
  if (!['Task', 'Milestone'].includes(type)) throw new Error('Choose Task or Milestone.');
  const duration = Number(draft.duration);
  if (draft.duration === '' || draft.duration == null || !Number.isSafeInteger(duration) || duration < 0 || duration > 10000 || (type === 'Task' && duration === 0) || (type === 'Milestone' && duration !== 0)) throw new Error('Enter a positive whole-number duration, or choose a zero-day milestone.');
  if (!['independent', 'dependent'].includes(draft.dependencyChoice)) throw new Error('Choose Independent or Depends on other tasks.');
  const selected = draft.dependencyChoice === 'dependent' ? draft.dependencies || [] : [];
  if (draft.dependencyChoice === 'dependent' && !selected.length) throw new Error('Choose at least one predecessor.');
  const dependencies = selected.map((dependency) => {
    if (!['FS', 'SS', 'FF', 'SF'].includes(dependency.depType)) throw new Error('Choose a supported dependency type.');
    const parent = tasks.find((task) => String(task.id) === String(dependency.parentId));
    if (!parent) throw new Error('A predecessor is missing from this project.');
    return { parentId: parent.id, depType: dependency.depType };
  });
  if (!validCalendarDay(draft.start)) throw new Error('Choose a valid start date.');
  const ids = tasks.map((task) => task.id);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('The existing plan needs valid numeric task IDs before promotion.');
  const id = (ids.length ? Math.max(...ids) : 0) + 1;
  if (!Number.isSafeInteger(id)) throw new Error('A safe new task ID could not be allocated.');
  const task = { id, name: String(draft.name).trim(), type, start: draft.start, dur: duration, pct: 0, indent: 0, tracked: true, dependencies, parent: null, depType: dependencies[0]?.depType || 'FS', depLogic: draft.depLogic === 'ANY' ? 'ANY' : 'ALL' };
  const candidate = [...tasks.map((item) => ({ ...item })), task];
  validatePromotionGraph(candidate);
  calculateSchedule(candidate);
  if (tasks.some((item, index) => {
    const original = parseDateValue(item.start); const scheduled = parseDateValue(candidate[index].start);
    return original && scheduled && toISODateString(original) !== toISODateString(scheduled);
  })) throw new Error('The existing plan needs its scheduling changes saved before promotion.');
  if (!validCalendarDay(task.start)) throw new Error('A valid scheduled start could not be calculated.');
  return { task, finish: getFinishDate(task.start, task.dur), tasks: candidate };
}

export function promotionIntent(reference, projectId, draft, preview) {
  if (!reference || !UUID.test(projectId || '')) throw new Error('Select an accessible project.');
  if (reference.projectId && reference.projectId !== projectId) throw new Error('Move this source within its current project.');
  return { source_kind: reference.kind, source_id: reference.id, project_id: projectId, name: preview.task.name, type: preview.task.type, start: draft.start, duration: preview.task.dur, dependency_choice: draft.dependencyChoice, dependencies: preview.task.dependencies, dependency_logic: preview.task.depLogic, confirmed_finish: preview.finish };
}
