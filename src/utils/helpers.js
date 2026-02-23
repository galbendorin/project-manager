/**
 * Utility functions for project management
 * All duration calculations use business days (Mon-Fri), skipping weekends.
 */

const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

/**
 * Parse supported date formats safely:
 * - YYYY-MM-DD
 * - DD-MMM-YY
 * - DD-MMM-YYYY
 * - ISO timestamps
 */
export const parseDateValue = (value) => {
  if (!value && value !== 0) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;

    // Fast path for canonical project format.
    const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDate) {
      const y = parseInt(isoDate[1], 10);
      const m = parseInt(isoDate[2], 10) - 1;
      const d = parseInt(isoDate[3], 10);
      const dt = new Date(y, m, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }

    // Support imported "09-Nov-28" / "09-Nov-2028" values.
    const dmy = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
    if (dmy) {
      const day = parseInt(dmy[1], 10);
      const mon = MONTH_INDEX[dmy[2].toLowerCase()];
      if (mon !== undefined) {
        const yearRaw = dmy[3];
        const year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);
        const dt = new Date(year, mon, day);
        return Number.isNaN(dt.getTime()) ? null : dt;
      }
    }

    // Fallback for full ISO timestamps and any browser-parseable value.
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export const toISODateString = (value) => {
  const dt = parseDateValue(value);
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDateDDMMMyy = (value) => {
  const dt = parseDateValue(value);
  if (!dt) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(dt.getDate()).padStart(2, '0');
  const month = months[dt.getMonth()];
  const year = String(dt.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

/**
 * Add business days to a date, skipping Sat/Sun.
 * Returns a new Date object.
 */
export const addBusinessDays = (startDate, days) => {
  const parsed = parseDateValue(startDate);
  if (!parsed) return new Date(NaN);
  const date = new Date(parsed);
  let remaining = Math.abs(parseInt(days) || 0);
  const direction = days >= 0 ? 1 : -1;

  if (remaining === 0) return date;

  while (remaining > 0) {
    date.setDate(date.getDate() + direction);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }
  return date;
};

/**
 * Count business days between two dates (exclusive of start, inclusive of end).
 */
export const countBusinessDays = (start, end) => {
  const s = parseDateValue(start);
  const e = parseDateValue(end);
  if (!s || !e) return 0;
  if (e <= s) return 0;
  let count = 0;
  const d = new Date(s);
  while (d < e) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
};

/**
 * Get finish date by adding business days to start date.
 */
export const getFinishDate = (startDate, duration) => {
  if (!startDate) return "";
  const start = parseDateValue(startDate);
  if (!start) return "";
  const dur = parseInt(duration) || 0;
  if (dur === 0) return toISODateString(start);
  const finish = addBusinessDays(start, dur);
  return toISODateString(finish);
};

/**
 * Get calendar days span for a task (used for Gantt bar width).
 * This converts business days duration to actual calendar days.
 */
export const getCalendarSpan = (startDate, businessDays) => {
  if (!startDate || !businessDays) return businessDays || 0;
  const start = parseDateValue(startDate);
  if (!start) return 0;
  const finish = addBusinessDays(startDate, businessDays);
  if (Number.isNaN(finish.getTime())) return 0;
  return Math.round((finish - start) / 86400000);
};

export const keyGen = (str) => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = parseDateValue(dateStr);
  if (!date) return "";
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const getCurrentDate = () => {
  return toISODateString(new Date());
};

export const getProjectDateRange = (tasks) => {
  if (tasks.length === 0) {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    return { minDate: today, maxDate: future };
  }

  const startDates = tasks
    .map(t => parseDateValue(t.start))
    .filter(Boolean);

  if (startDates.length === 0) {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    return { minDate: today, maxDate: future };
  }

  const minDate = new Date(Math.min(...startDates.map(d => d.getTime())));

  const finishDates = tasks
    .map(t => addBusinessDays(t.start, t.dur || 1))
    .filter(d => !Number.isNaN(d.getTime()));

  const maxDate = finishDates.length > 0
    ? new Date(Math.max(...finishDates.map(d => d.getTime())))
    : new Date(Math.max(...startDates.map(d => d.getTime())));

  maxDate.setDate(maxDate.getDate() + 14);
  return { minDate, maxDate };
};

/**
 * Determine parent-child relationships based on indent levels.
 */
export const getHierarchyMap = (tasks) => {
  const parentChildren = new Map();
  const isParent = new Set();
  const directChildCount = new Map();

  for (let i = 0; i < tasks.length; i++) {
    const myIndent = tasks[i].indent || 0;
    const children = [];
    let directCount = 0;

    for (let j = i + 1; j < tasks.length; j++) {
      const childIndent = tasks[j].indent || 0;
      if (childIndent > myIndent) {
        children.push(j);
        if (childIndent === myIndent + 1) directCount++;
      } else {
        break;
      }
    }

    if (children.length > 0) {
      parentChildren.set(i, children);
      isParent.add(i);
      directChildCount.set(i, directCount);
    }
  }

  return { parentChildren, isParent, directChildCount };
};

/**
 * Calculate summary dates/duration for parent tasks.
 * Duration is in business days.
 */
export const calculateParentSummaries = (tasks) => {
  const { parentChildren, isParent } = getHierarchyMap(tasks);
  const summaries = new Map();

  const parentIndices = [...isParent].sort((a, b) => b - a);

  for (const pIdx of parentIndices) {
    const childIndices = parentChildren.get(pIdx);
    if (!childIndices || childIndices.length === 0) continue;

    let earliestStart = null;
    let latestFinish = null;

    for (const cIdx of childIndices) {
      const child = tasks[cIdx];
      const childSummary = summaries.get(cIdx);
      const cStart = childSummary ? childSummary.start : child.start;
      const cFinish = childSummary ? childSummary.finish : getFinishDate(child.start, child.dur);

      if (!cStart) continue;

      const startDate = parseDateValue(cStart);
      const finishDate = parseDateValue(cFinish);
      if (!startDate || !finishDate) continue;

      if (!earliestStart || startDate < earliestStart) earliestStart = startDate;
      if (!latestFinish || finishDate > latestFinish) latestFinish = finishDate;
    }

    if (earliestStart && latestFinish) {
      const startStr = toISODateString(earliestStart);
      const finishStr = toISODateString(latestFinish);
      const durDays = countBusinessDays(earliestStart, latestFinish);
      const calendarDays = Math.round((latestFinish - earliestStart) / 86400000);
      summaries.set(pIdx, {
        start: startStr,
        finish: finishStr,
        dur: durDays,
        _calendarDays: calendarDays
      });
    }
  }

  return summaries;
};

/**
 * Get visible task indices based on collapsed state.
 */
export const getVisibleTaskIndices = (tasks, collapsedIndices) => {
  if (!collapsedIndices || collapsedIndices.size === 0) {
    return tasks.map((_, i) => i);
  }

  const { parentChildren } = getHierarchyMap(tasks);
  const hiddenIndices = new Set();

  for (const collapsedIdx of collapsedIndices) {
    const children = parentChildren.get(collapsedIdx);
    if (children) {
      children.forEach(childIdx => hiddenIndices.add(childIdx));
    }
  }

  return tasks.map((_, i) => i).filter(i => !hiddenIndices.has(i));
};

/**
 * Build visible tasks array with summary overrides for parent rows.
 */
export const buildVisibleTasks = (tasks, collapsedIndices) => {
  const visibleIndices = getVisibleTaskIndices(tasks, collapsedIndices);
  const summaries = calculateParentSummaries(tasks);
  const { isParent } = getHierarchyMap(tasks);

  return visibleIndices.map(idx => {
    const task = tasks[idx];
    const summary = summaries.get(idx);
    if (isParent.has(idx) && summary) {
      return { ...task, start: summary.start, dur: summary.dur, _calendarDays: summary._calendarDays, _isParent: true, _originalIndex: idx };
    }
    return { ...task, _calendarDays: getCalendarSpan(task.start, task.dur), _isParent: false, _originalIndex: idx };
  });
};

/**
 * Schedule calculation — dependency-based start date resolution.
 * Uses business days for finish date calculations.
 * Supports multiple dependencies per task with individual dependency types.
 */
export const calculateSchedule = (tasks) => {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const idToIndex = new Map(tasks.map((t, idx) => [t.id, idx]));
  const { parentChildren } = getHierarchyMap(tasks);
  const parentSummaries = calculateParentSummaries(tasks);
  const resolved = new Set();

  const isDescendantOf = (ancestorId, childId) => {
    const ancestorIdx = idToIndex.get(ancestorId);
    const childIdx = idToIndex.get(childId);
    if (ancestorIdx === undefined || childIdx === undefined) return false;
    const descendants = parentChildren.get(ancestorIdx);
    return !!(descendants && descendants.includes(childIdx));
  };

  function resolve(task) {
    if (!task || resolved.has(task.id)) return;
    
    // Handle both old (parent/depType) and new (dependencies array) format
    const deps = task.dependencies || (task.parent ? [{ parentId: task.parent, depType: task.depType || 'FS' }] : []);
    
    if (deps.length > 0) {
      const depLogic = task.depLogic || 'ALL'; // Default to ALL (wait for all parents)
      let calculatedStarts = [];
      
      for (const dep of deps) {
        const parent = taskMap.get(dep.parentId);
        if (!parent) continue;
        
        resolve(parent);

        // Use computed summary timing for group dependencies, but avoid
        // descendant->ancestor loops (child depending on its own summary parent).
        let parentStart = parent.start;
        let parentDur = parent.dur || 0;
        const parentIdx = idToIndex.get(parent.id);
        const parentSummary = parentIdx !== undefined ? parentSummaries.get(parentIdx) : null;
        if (parentSummary && !isDescendantOf(parent.id, task.id)) {
          parentStart = parentSummary.start;
          parentDur = parentSummary.dur;
        }

        const pStart = parseDateValue(parentStart);
        const pEnd = addBusinessDays(parentStart, parentDur);
        if (!pStart || Number.isNaN(pEnd.getTime())) continue;
        let calculatedStart;
        
        switch (dep.depType || 'FS') {
          case 'FS': calculatedStart = new Date(pEnd); break;
          case 'SS': calculatedStart = new Date(pStart); break;
          case 'FF':
            calculatedStart = addBusinessDays(toISODateString(pEnd), -(task.dur || 0));
            break;
          case 'SF':
            calculatedStart = addBusinessDays(toISODateString(pStart), -(task.dur || 0));
            break;
          default: calculatedStart = new Date(pEnd);
        }
        if (!calculatedStart || Number.isNaN(calculatedStart.getTime())) continue;
        
        // If calculated start falls on weekend, move to next Monday
        const dow = calculatedStart.getDay();
        if (dow === 0) calculatedStart.setDate(calculatedStart.getDate() + 1);
        if (dow === 6) calculatedStart.setDate(calculatedStart.getDate() + 2);
        
        calculatedStarts.push(calculatedStart);
      }
      
      if (calculatedStarts.length > 0) {
        // Apply dependency logic
        const finalStart = depLogic === 'ANY' 
          ? new Date(Math.min(...calculatedStarts)) // Earliest - start when ANY parent allows
          : new Date(Math.max(...calculatedStarts)); // Latest - wait for ALL parents (default)
        
        task.start = toISODateString(finalStart);
      }
    }
    resolved.add(task.id);
  }

  tasks.forEach(t => resolve(t));

  return tasks;
};

/**
 * Critical path calculation using calendar day positions for Gantt.
 */
export const calculateCriticalPath = (tasks) => {
  if (!tasks || tasks.length === 0) return new Set();

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const startTimes = tasks
    .map(t => parseDateValue(t.start))
    .filter(Boolean)
    .map(d => d.getTime());

  if (startTimes.length === 0) return new Set();

  const projectStart = Math.min(...startTimes);
  const msPerDay = 86400000;

  const toDayNum = (dateStr) => {
    const dt = parseDateValue(dateStr);
    if (!dt) return 0;
    return Math.round((dt.getTime() - projectStart) / msPerDay);
  };

  const nodes = new Map();
  tasks.forEach(t => {
    const es = toDayNum(t.start);
    const calDays = getCalendarSpan(t.start, t.dur) || 0;
    nodes.set(t.id, {
      id: t.id, dur: calDays, es, ef: es + calDays,
      ls: Infinity, lf: Infinity, float: 0,
      predecessorId: t.parent || null,
      depType: t.depType || 'FS'
    });
  });

  const successors = new Map();
  tasks.forEach(t => {
    if (t.parent && taskMap.has(t.parent)) {
      if (!successors.has(t.parent)) successors.set(t.parent, []);
      successors.get(t.parent).push(t.id);
    }
  });

  nodes.forEach(node => { node.ef = node.es + node.dur; });

  let projectEnd = 0;
  nodes.forEach(node => { if (node.ef > projectEnd) projectEnd = node.ef; });

  nodes.forEach((node, id) => {
    if (!successors.has(id) || successors.get(id).length === 0) {
      node.lf = projectEnd;
      node.ls = node.lf - node.dur;
    }
  });

  const sortedByEF = [...nodes.values()].sort((a, b) => b.ef - a.ef);

  for (let pass = 0; pass < tasks.length; pass++) {
    let changed = false;
    sortedByEF.forEach(node => {
      if (successors.has(node.id)) {
        const succs = successors.get(node.id);
        let minConstraint = Infinity;
        succs.forEach(succId => {
          const succNode = nodes.get(succId);
          if (!succNode) return;
          const depType = succNode.depType || 'FS';
          let constraint;
          switch (depType) {
            case 'FS': constraint = succNode.ls; break;
            case 'SS': constraint = succNode.ls + node.dur; break;
            case 'FF': constraint = succNode.lf; break;
            case 'SF': constraint = succNode.lf; break;
            default: constraint = succNode.ls;
          }
          if (constraint < minConstraint) minConstraint = constraint;
        });
        if (minConstraint < node.lf) {
          node.lf = minConstraint;
          node.ls = node.lf - node.dur;
          changed = true;
        }
      }
    });
    if (!changed) break;
  }

  for (let pass = 0; pass < tasks.length; pass++) {
    nodes.forEach(node => {
      if (node.predecessorId && nodes.has(node.predecessorId)) {
        const predNode = nodes.get(node.predecessorId);
        const depType = node.depType || 'FS';
        let predLF;
        switch (depType) {
          case 'FS': predLF = node.ls; break;
          case 'SS': predLF = node.ls + predNode.dur; break;
          case 'FF': predLF = node.lf; break;
          case 'SF': predLF = node.lf; break;
          default: predLF = node.ls;
        }
        if (predLF < predNode.lf) {
          predNode.lf = predLF;
          predNode.ls = predNode.lf - predNode.dur;
        }
      }
    });
  }

  const criticalTaskIds = new Set();
  nodes.forEach(node => {
    node.float = node.ls - node.es;
    if (Math.abs(node.float) < 0.5) criticalTaskIds.add(node.id);
  });

  if (criticalTaskIds.size === 0 && tasks.length > 0) {
    let endTask = null;
    nodes.forEach(node => { if (node.ef === projectEnd) endTask = node; });
    if (endTask) {
      let current = endTask;
      while (current) {
        criticalTaskIds.add(current.id);
        current = current.predecessorId ? nodes.get(current.predecessorId) : null;
      }
    }
  }

  return criticalTaskIds;
};

export const getNextId = (items) => {
  if (items.length === 0) return 1;
  return Math.max(...items.map(item => item.id)) + 1;
};

export const filterBySearch = (items, searchQuery) => {
  if (!searchQuery) return items;
  const query = searchQuery.toLowerCase();
  return items.filter(item =>
    Object.values(item).some(val => String(val).toLowerCase().includes(query))
  );
};

const TODO_DONE_TERMS = ['done', 'complete', 'closed', 'resolved', 'implemented', 'cancelled', 'canceled'];

const normalizeTodoStatus = (statusValue) => {
  const value = String(statusValue || '').trim().toLowerCase();
  if (!value) return 'Open';
  return TODO_DONE_TERMS.some(term => value.includes(term)) ? 'Done' : 'Open';
};

const startOfDay = (value) => {
  const dt = parseDateValue(value);
  if (!dt) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

const addCalendarDays = (value, days) => {
  const dt = new Date(value);
  dt.setDate(dt.getDate() + days);
  return dt;
};

const getMondayStart = (value) => {
  const dt = startOfDay(value);
  if (!dt) return null;
  const day = dt.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addCalendarDays(dt, offset);
};

const normalizeRecurrence = (recurrence) => {
  if (!recurrence) return null;
  if (typeof recurrence === 'string') {
    return {
      type: recurrence.toLowerCase(),
      interval: 1
    };
  }
  const rawType = String(recurrence.type || '').toLowerCase();
  if (!rawType) return null;
  const intervalRaw = Number(recurrence.interval);
  const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.floor(intervalRaw) : 1;
  return { type: rawType, interval };
};

const addWeekdays = (baseDate, businessDays) => {
  const result = new Date(baseDate);
  let remaining = Math.max(1, parseInt(businessDays, 10) || 1);

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return result;
};

const addMonthsClamped = (baseDate, monthCount) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();

  const absoluteMonth = month + monthCount;
  const targetYear = year + Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const lastDayOfTarget = new Date(targetYear, targetMonth + 1, 0).getDate();

  return new Date(targetYear, targetMonth, Math.min(day, lastDayOfTarget));
};

const addYearsClamped = (baseDate, yearCount) => {
  const targetYear = baseDate.getFullYear() + yearCount;
  const month = baseDate.getMonth();
  const day = baseDate.getDate();
  const lastDayOfTarget = new Date(targetYear, month + 1, 0).getDate();
  return new Date(targetYear, month, Math.min(day, lastDayOfTarget));
};

export const getNextRecurringDueDate = (
  dueDate,
  recurrence,
  fallbackDate = toISODateString(new Date())
) => {
  const normalized = normalizeRecurrence(recurrence);
  if (!normalized) return '';
  const baseDate = startOfDay(dueDate || fallbackDate);
  if (!baseDate) return '';

  switch (normalized.type) {
    case 'weekdays':
    case 'weekday':
      return toISODateString(addWeekdays(baseDate, normalized.interval));
    case 'weekly':
      return toISODateString(addCalendarDays(baseDate, normalized.interval * 7));
    case 'monthly':
      return toISODateString(addMonthsClamped(baseDate, normalized.interval));
    case 'yearly':
    case 'annual':
      return toISODateString(addYearsClamped(baseDate, normalized.interval));
    default:
      return '';
  }
};

const safeDueDate = (value) => {
  const iso = toISODateString(value);
  return iso || '';
};

const makeDerivedTodo = ({
  id,
  source,
  title,
  owner,
  dueDate,
  status,
  createdAt,
  updatedAt,
  completedAt,
  publicValue = true
}) => ({
  _id: id,
  title: title || 'Untitled',
  dueDate: safeDueDate(dueDate),
  owner: owner || '',
  status: normalizeTodoStatus(status),
  recurrence: null,
  createdAt: createdAt || new Date().toISOString(),
  updatedAt: updatedAt || new Date().toISOString(),
  completedAt: completedAt || '',
  isDerived: true,
  source,
  public: publicValue !== false
});

/**
 * Build derived ToDo items from registers and tracking data.
 * These entries are computed at runtime and are not stored in project.todos.
 */
export const collectDerivedTodos = (projectData = [], registers = {}, tracker = []) => {
  const actions = Array.isArray(registers.actions) ? registers.actions : [];
  const issues = Array.isArray(registers.issues) ? registers.issues : [];
  const changes = Array.isArray(registers.changes) ? registers.changes : [];
  const trackerItems = Array.isArray(tracker) ? tracker : [];
  const tasks = Array.isArray(projectData) ? projectData : [];

  const actionTodos = actions
    .filter(item => item && (item.description || item.currentstatus || item.target))
    .map((item, idx) => makeDerivedTodo({
      id: `action_${item._id || idx}`,
      source: 'Action Log',
      title: item.description || item.currentstatus || `Action ${idx + 1}`,
      owner: item.actionassignedto,
      dueDate: item.target,
      status: item.status || item.currentstatus,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || item.update,
      completedAt: item.completed,
      publicValue: item.public
    }));

  const issueTodos = issues
    .filter(item => item && (item.description || item.currentstatus || item.target))
    .map((item, idx) => makeDerivedTodo({
      id: `issue_${item._id || idx}`,
      source: 'Issue Log',
      title: item.description || item.currentstatus || `Issue ${idx + 1}`,
      owner: item.issueassignedto,
      dueDate: item.target,
      status: item.status || item.currentstatus,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || item.update,
      completedAt: item.completed,
      publicValue: item.public
    }));

  const changeTodos = changes
    .filter(item => item && (item.description || item.impactstatus || item.target))
    .map((item, idx) => makeDerivedTodo({
      id: `change_${item._id || idx}`,
      source: 'Change Log',
      title: item.description || item.impactstatus || `Change ${idx + 1}`,
      owner: item.assignedto,
      dueDate: item.target,
      status: item.status || item.impactstatus,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || item.updated,
      completedAt: item.complete,
      publicValue: item.public
    }));

  const taskById = new Map(tasks.map(task => [task.id, task]));
  const trackerTaskIds = new Set();

  const trackerTodos = trackerItems
    .filter(item => item && item.taskName)
    .map((item, idx) => {
      if (item.taskId !== undefined && item.taskId !== null) {
        trackerTaskIds.add(item.taskId);
      }
      const linkedTask = taskById.get(item.taskId);
      const dueDate = linkedTask
        ? getFinishDate(linkedTask.start, linkedTask.dur || 0)
        : '';

      return makeDerivedTodo({
        id: `tracker_${item._id || idx}`,
        source: 'Master Tracker',
        title: item.taskName,
        owner: item.owner,
        dueDate,
        status: item.status,
        createdAt: item.createdAt || item.dateAdded,
        updatedAt: item.updatedAt || item.lastUpdated,
        completedAt: item.status === 'Completed' ? (item.updatedAt || item.lastUpdated || '') : '',
        publicValue: item.public
      });
    });

  // Optional schedule-derived todos: tracked tasks with due dates not already represented in tracker.
  const scheduleTodos = tasks
    .filter(task => task && task.tracked && !trackerTaskIds.has(task.id))
    .map((task, idx) => makeDerivedTodo({
      id: `schedule_${task.id || idx}`,
      source: 'Project Plan',
      title: task.name || `Tracked task ${idx + 1}`,
      owner: '',
      dueDate: getFinishDate(task.start, task.dur || 0),
      status: Number(task.pct) >= 100 ? 'Done' : 'Open',
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: Number(task.pct) >= 100 ? (task.updatedAt || '') : '',
      publicValue: true
    }));

  return [
    ...actionTodos,
    ...issueTodos,
    ...changeTodos,
    ...trackerTodos,
    ...scheduleTodos
  ];
};

export const TODO_BUCKETS = [
  { key: 'overdue', label: 'Passed deadline' },
  { key: 'this_week', label: 'This week' },
  { key: 'next_week', label: 'Next week' },
  { key: 'in_2_weeks', label: 'In 2 weeks' },
  { key: 'weeks_3_4', label: 'Weeks 3-4' },
  { key: 'later', label: 'Later / no deadline' }
];

/**
 * Group todo-like items into time buckets relative to `today`.
 */
export const bucketByDeadline = (items = [], today = getCurrentDate()) => {
  const todayDate = startOfDay(today) || startOfDay(new Date());
  const thisWeekStart = getMondayStart(todayDate);
  const thisWeekEnd = addCalendarDays(thisWeekStart, 6);
  const nextWeekStart = addCalendarDays(thisWeekEnd, 1);
  const nextWeekEnd = addCalendarDays(nextWeekStart, 6);
  const inTwoWeeksStart = addCalendarDays(nextWeekEnd, 1);
  const inTwoWeeksEnd = addCalendarDays(inTwoWeeksStart, 6);
  const weeksThreeToFourStart = addCalendarDays(inTwoWeeksEnd, 1);
  const weeksThreeToFourEnd = addCalendarDays(weeksThreeToFourStart, 13);

  const getBucketKey = (dueDateValue) => {
    const dueDate = startOfDay(dueDateValue);
    if (!dueDate) return 'later';
    if (dueDate < todayDate) return 'overdue';
    if (dueDate >= thisWeekStart && dueDate <= thisWeekEnd) return 'this_week';
    if (dueDate >= nextWeekStart && dueDate <= nextWeekEnd) return 'next_week';
    if (dueDate >= inTwoWeeksStart && dueDate <= inTwoWeeksEnd) return 'in_2_weeks';
    if (dueDate >= weeksThreeToFourStart && dueDate <= weeksThreeToFourEnd) return 'weeks_3_4';
    return 'later';
  };

  const compareItems = (a, b) => {
    if (a.status !== b.status) {
      return a.status === 'Open' ? -1 : 1;
    }
    if (a.dueDate && b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return String(a.title || '').localeCompare(String(b.title || ''));
  };

  const bucketMap = new Map(TODO_BUCKETS.map(bucket => [bucket.key, []]));

  items.forEach(item => {
    const bucketKey = getBucketKey(item?.dueDate);
    const withDefaults = {
      ...item,
      status: normalizeTodoStatus(item?.status),
      dueDate: safeDueDate(item?.dueDate)
    };
    bucketMap.get(bucketKey).push(withDefaults);
  });

  return TODO_BUCKETS.map(bucket => ({
    ...bucket,
    items: bucketMap.get(bucket.key).sort(compareItems)
  }));
};

export const sortRegisterItems = (items, sortKey, sortDirection = 'asc') => {
  if (!sortKey || !items || items.length === 0) return items;
  return [...items].sort((a, b) => {
    const aVal = a[sortKey] ?? '';
    const bVal = b[sortKey] ?? '';
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const comparison = String(aVal).localeCompare(String(bVal));
    return sortDirection === 'asc' ? comparison : -comparison;
  });
};

/**
 * Format dependencies for display in grid
 * Returns string like "1FS, 5SS, 10FF"
 */
export const formatDependencies = (task) => {
  if (task.dependencies && task.dependencies.length > 0) {
    return task.dependencies.map(d => `${d.parentId}${d.depType}`).join(', ');
  }
  if (task.parent) {
    return `${task.parent}${task.depType || 'FS'}`;
  }
  return '–';
};

/**
 * Check if task has any dependencies
 */
export const hasDependencies = (task) => {
  return (task.dependencies && task.dependencies.length > 0) || (task.parent !== null && task.parent !== undefined);
};
