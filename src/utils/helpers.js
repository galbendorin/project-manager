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
        case 'FS': // Finish to Start
          calculatedStart = new Date(pEnd);
          break;
        case 'SS': // Start to Start
          calculatedStart = new Date(pStart);
          break;
        case 'FF': // Finish to Finish
          calculatedStart = new Date(pEnd);
          calculatedStart.setDate(calculatedStart.getDate() - (task.dur || 0));
          break;
        case 'SF': // Start to Finish
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
