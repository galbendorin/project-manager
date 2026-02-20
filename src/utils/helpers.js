/**
 * Utility functions for project management
 * All duration calculations use business days (Mon-Fri), skipping weekends.
 */

/**
 * Add business days to a date, skipping Sat/Sun.
 * Returns a new Date object.
 */
export const addBusinessDays = (startDate, days) => {
  const date = new Date(startDate);
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
  const s = new Date(start);
  const e = new Date(end);
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
  const dur = parseInt(duration) || 0;
  if (dur === 0) return startDate;
  const finish = addBusinessDays(startDate, dur);
  return finish.toISOString().split('T')[0];
};

/**
 * Get calendar days span for a task (used for Gantt bar width).
 * This converts business days duration to actual calendar days.
 */
export const getCalendarSpan = (startDate, businessDays) => {
  if (!startDate || !businessDays) return businessDays || 0;
  const start = new Date(startDate);
  const finish = addBusinessDays(startDate, businessDays);
  return Math.round((finish - start) / 86400000);
};

export const keyGen = (str) => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0];
};

export const getProjectDateRange = (tasks) => {
  if (tasks.length === 0) {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    return { minDate: today, maxDate: future };
  }

  const minDate = new Date(Math.min(...tasks.map(t => new Date(t.start))));
  const maxDate = new Date(Math.max(...tasks.map(t => {
    const finish = addBusinessDays(t.start, t.dur || 1);
    return finish;
  })));
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

      const startDate = new Date(cStart);
      const finishDate = new Date(cFinish);

      if (!earliestStart || startDate < earliestStart) earliestStart = startDate;
      if (!latestFinish || finishDate > latestFinish) latestFinish = finishDate;
    }

    if (earliestStart && latestFinish) {
      const startStr = earliestStart.toISOString().split('T')[0];
      const finishStr = latestFinish.toISOString().split('T')[0];
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
  const resolved = new Set();

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
        const pStart = new Date(parent.start);
        const pEnd = addBusinessDays(parent.start, parent.dur || 0);
        let calculatedStart;
        
        switch (dep.depType || 'FS') {
          case 'FS': calculatedStart = new Date(pEnd); break;
          case 'SS': calculatedStart = new Date(pStart); break;
          case 'FF':
            calculatedStart = addBusinessDays(pEnd.toISOString().split('T')[0], -(task.dur || 0));
            break;
          case 'SF':
            calculatedStart = addBusinessDays(pStart.toISOString().split('T')[0], -(task.dur || 0));
            break;
          default: calculatedStart = new Date(pEnd);
        }
        
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
        
        task.start = finalStart.toISOString().split('T')[0];
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
  const projectStart = Math.min(...tasks.map(t => new Date(t.start).getTime()));
  const msPerDay = 86400000;

  const toDayNum = (dateStr) => Math.round((new Date(dateStr).getTime() - projectStart) / msPerDay);

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
  return (task.dependencies && task.dependencies.length > 0) || task.parent !== null;
};
