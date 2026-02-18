/**
 * Utility functions for project management
 */

/**
 * Calculate finish date based on start date and duration
 */
export const getFinishDate = (startDate, duration) => {
  if (!startDate) return "";
  const date = new Date(startDate);
  date.setDate(date.getDate() + (parseInt(duration) || 0));
  return date.toISOString().split('T')[0];
};

/**
 * Generate a key from a string (lowercase, alphanumeric only)
 */
export const keyGen = (str) => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
};

/**
 * Format date to display format
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

/**
 * Get current date in ISO format
 */
export const getCurrentDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Calculate project date range
 */
export const getProjectDateRange = (tasks) => {
  if (tasks.length === 0) {
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    return { minDate: today, maxDate: future };
  }

  const minDate = new Date(Math.min(...tasks.map(t => new Date(t.start))));
  const maxDate = new Date(Math.max(...tasks.map(t => {
    const finish = new Date(t.start);
    finish.setDate(finish.getDate() + (t.dur || 1));
    return finish;
  })));
  
  // Add padding
  maxDate.setDate(maxDate.getDate() + 14);
  
  return { minDate, maxDate };
};

/**
 * Calculate schedule based on dependencies
 */
export const calculateSchedule = (tasks) => {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const resolved = new Set();

  function resolve(task) {
    if (!task || resolved.has(task.id)) return;
    
    if (task.parent && taskMap.has(task.parent)) {
      const parent = taskMap.get(task.parent);
      resolve(parent);
      
      const pStart = new Date(parent.start);
      const pEnd = new Date(parent.start);
      pEnd.setDate(pEnd.getDate() + (parent.dur || 0));
      
      let calculatedStart = new Date(task.start);
      
      switch (task.depType) {
        case 'FS':
          calculatedStart = new Date(pEnd);
          break;
        case 'SS':
          calculatedStart = new Date(pStart);
          break;
        case 'FF':
          calculatedStart = new Date(pEnd);
          calculatedStart.setDate(calculatedStart.getDate() - (task.dur || 0));
          break;
        case 'SF':
          calculatedStart = new Date(pStart);
          calculatedStart.setDate(calculatedStart.getDate() - (task.dur || 0));
          break;
      }
      
      task.start = calculatedStart.toISOString().split('T')[0];
    }
    
    resolved.add(task.id);
  }
  
  tasks.forEach(t => resolve(t));
  return tasks;
};

/**
 * Calculate Critical Path using CPM (Critical Path Method)
 * Returns a Set of task IDs that are on the critical path
 */
export const calculateCriticalPath = (tasks) => {
  if (!tasks || tasks.length === 0) return new Set();

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const projectStart = Math.min(...tasks.map(t => new Date(t.start).getTime()));
  const msPerDay = 86400000;

  const toDayNum = (dateStr) => {
    return Math.round((new Date(dateStr).getTime() - projectStart) / msPerDay);
  };

  // Build node data
  const nodes = new Map();
  tasks.forEach(t => {
    const es = toDayNum(t.start);
    const dur = t.dur || 0;
    nodes.set(t.id, {
      id: t.id,
      dur: dur,
      es: es,
      ef: es + dur,
      ls: Infinity,
      lf: Infinity,
      float: 0,
      predecessorId: t.parent || null,
      depType: t.depType || 'FS'
    });
  });

  // Build successor map
  const successors = new Map();
  tasks.forEach(t => {
    if (t.parent && taskMap.has(t.parent)) {
      if (!successors.has(t.parent)) {
        successors.set(t.parent, []);
      }
      successors.get(t.parent).push(t.id);
    }
  });

  // Forward pass
  nodes.forEach(node => {
    node.ef = node.es + node.dur;
  });

  // Find project end
  let projectEnd = 0;
  nodes.forEach(node => {
    if (node.ef > projectEnd) projectEnd = node.ef;
  });

  // Backward pass - end tasks first
  nodes.forEach((node, id) => {
    if (!successors.has(id) || successors.get(id).length === 0) {
      node.lf = projectEnd;
      node.ls = node.lf - node.dur;
    }
  });

  // Propagate backward
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
            case 'FS':
              constraint = succNode.ls;
              break;
            case 'SS':
              constraint = succNode.ls + node.dur;
              break;
            case 'FF':
              constraint = succNode.lf;
              break;
            case 'SF':
              constraint = succNode.lf;
              break;
            default:
              constraint = succNode.ls;
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

  // Also propagate through predecessor chain
  for (let pass = 0; pass < tasks.length; pass++) {
    nodes.forEach(node => {
      if (node.predecessorId && nodes.has(node.predecessorId)) {
        const predNode = nodes.get(node.predecessorId);
        const depType = node.depType || 'FS';

        let predLF;
        switch (depType) {
          case 'FS':
            predLF = node.ls;
            break;
          case 'SS':
            predLF = node.ls + predNode.dur;
            break;
          case 'FF':
            predLF = node.lf;
            break;
          case 'SF':
            predLF = node.lf;
            break;
          default:
            predLF = node.ls;
        }

        if (predLF < predNode.lf) {
          predNode.lf = predLF;
          predNode.ls = predNode.lf - predNode.dur;
        }
      }
    });
  }

  // Calculate float
  const criticalTaskIds = new Set();
  nodes.forEach(node => {
    node.float = node.ls - node.es;
    if (Math.abs(node.float) < 0.5) {
      criticalTaskIds.add(node.id);
    }
  });

  // Fallback: if nothing critical, trace longest chain
  if (criticalTaskIds.size === 0 && tasks.length > 0) {
    let endTask = null;
    nodes.forEach(node => {
      if (node.ef === projectEnd) endTask = node;
    });
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

/**
 * Generate next ID for a list
 */
export const getNextId = (items) => {
  if (items.length === 0) return 1;
  return Math.max(...items.map(item => item.id)) + 1;
};

/**
 * Filter items based on search query
 */
export const filterBySearch = (items, searchQuery) => {
  if (!searchQuery) return items;
  const query = searchQuery.toLowerCase();
  return items.filter(item => 
    Object.values(item).some(val => 
      String(val).toLowerCase().includes(query)
    )
  );
};

/**
 * Sort register items by a given key
 */
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
