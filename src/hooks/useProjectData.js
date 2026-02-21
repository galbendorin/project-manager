import { useState, useCallback, useEffect, useRef } from 'react';
import { calculateSchedule, getNextId, getCurrentDate, getFinishDate, keyGen } from '../utils/helpers';
import { DEFAULT_TASK, SCHEMAS, DEFAULT_STATUS_REPORT } from '../utils/constants';
import { supabase } from '../lib/supabase';

// Helper: get ISO timestamp
const now = () => new Date().toISOString();

/**
 * Custom hook for managing project data (tasks, registers, tracker, and status report)
 * With Supabase persistence, baseline support, and timestamps
 */
export const useProjectData = (projectId, userId = null) => {
  const [projectData, setProjectData] = useState([]);
  const [registers, setRegisters] = useState({
    risks: [],
    issues: [],
    actions: [],
    minutes: [],
    costs: [],
    changes: [],
    comms: []
  });
  const [tracker, setTracker] = useState([]);
  const [statusReport, setStatusReport] = useState({ ...DEFAULT_STATUS_REPORT });
  const [baseline, setBaselineState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef(null);
  const projectVersionRef = useRef(1);

  // Load project data from Supabase
  const loadProject = useCallback(async () => {
    if (!projectId) return;

    setLoadingData(true);
    initialLoadDone.current = false;
    setSaveConflict(false);
    setSaveError(null);

    let loadQuery = supabase
      .from('projects')
      .select('tasks, registers, baseline, tracker, status_report, version')
      .eq('id', projectId);
    if (userId) loadQuery = loadQuery.eq('user_id', userId);
    const { data, error } = await loadQuery.single();

    if (!error && data) {
      // Backfill timestamps on load for any items missing them
      const backfillTimestamps = (items) => {
        if (!items || !Array.isArray(items)) return items;
        return items.map(item => ({
          ...item,
          createdAt: item.createdAt || item.dateAdded || now(),
          updatedAt: item.updatedAt || item.lastUpdated || now()
        }));
      };

      const backfillTasks = (tasks) => {
        if (!tasks || !Array.isArray(tasks)) return tasks;
        return tasks.map(t => ({
          ...t,
          createdAt: t.createdAt || now(),
          updatedAt: t.updatedAt || now()
        }));
      };

      const loadedRegisters = data.registers || {
        risks: [], issues: [], actions: [],
        minutes: [], costs: [], changes: [], comms: []
      };

      // Backfill all registers
      const backfilledRegisters = {};
      Object.keys(loadedRegisters).forEach(key => {
        backfilledRegisters[key] = backfillTimestamps(loadedRegisters[key]);
      });

      setProjectData(backfillTasks(data.tasks || []));
      setRegisters(backfilledRegisters);
      setBaselineState(data.baseline || null);
      setTracker(backfillTimestamps(data.tracker || []));
      setStatusReport(data.status_report || { ...DEFAULT_STATUS_REPORT });
      projectVersionRef.current = Number.isInteger(data.version) ? data.version : 1;
    } else if (error) {
      setSaveError(`Unable to load project: ${error.message}`);
    }

    setLoadingData(false);
    setTimeout(() => {
      initialLoadDone.current = true;
    }, 500);
  }, [projectId, userId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Auto-save to Supabase (debounced)
  useEffect(() => {
    if (!projectId || !initialLoadDone.current || saveConflict) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const updateData = {
        tasks: projectData,
        registers: registers,
        tracker: tracker,
        status_report: statusReport,
        updated_at: new Date().toISOString()
      };
      if (baseline !== undefined) {
        updateData.baseline = baseline;
      }

      const expectedVersion = projectVersionRef.current;

      let saveQuery = supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .eq('version', expectedVersion)
        .select('version');
      if (userId) saveQuery = saveQuery.eq('user_id', userId);
      const { data, error } = await saveQuery.maybeSingle();

      if (!error && data && Number.isInteger(data.version)) {
        projectVersionRef.current = data.version;
        setLastSaved(new Date());
        setSaveConflict(false);
      } else if (!error && !data) {
        setSaveConflict(true);
        setSaveError('Save conflict detected. This project was changed in another tab or session. Click Reload Latest.');
      } else if (error) {
        setSaveError(`Save failed: ${error.message}`);
      }

      setSaving(false);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectData, registers, tracker, statusReport, baseline, projectId, userId, saveConflict]);

  const reloadProject = useCallback(async () => {
    await loadProject();
  }, [loadProject]);

  // Set baseline
  const setBaseline = useCallback(() => {
    const baselineData = projectData.map(task => ({
      id: task.id,
      start: task.start,
      dur: task.dur,
      finish: getFinishDate(task.start, task.dur)
    }));
    setBaselineState(baselineData);
  }, [projectData]);

  const clearBaseline = useCallback(() => {
    setBaselineState(null);
  }, []);

  // Add a new task — with timestamps
  const addTask = useCallback((taskData, insertAfterId = null) => {
    setProjectData(prev => {
      const newTask = {
        ...DEFAULT_TASK,
        ...taskData,
        id: getNextId(prev),
        createdAt: now(),
        updatedAt: now()
      };

      if (insertAfterId !== null) {
        const idx = prev.findIndex(t => t.id === insertAfterId);
        const newData = [...prev];
        newData.splice(idx + 1, 0, newTask);
        return calculateSchedule(newData);
      }

      return calculateSchedule([...prev, newTask]);
    });
  }, []);

  // Update a task — stamp updatedAt
  const updateTask = useCallback((taskId, updates) => {
    setProjectData(prev => {
      const newData = prev.map(task =>
        task.id === taskId ? { ...task, ...updates, updatedAt: now() } : task
      );
      return calculateSchedule(newData);
    });

    // Also update tracker if this task is tracked
    setTracker(prev => {
      const trackerItem = prev.find(t => t.taskId === taskId);
      if (!trackerItem) return prev;
      return prev.map(item => {
        if (item.taskId === taskId) {
          const updatedItem = { ...item, updatedAt: now(), lastUpdated: getCurrentDate() };
          if (updates.name) updatedItem.taskName = updates.name;
          if (updates.pct !== undefined) {
            if (updates.pct === 100) updatedItem.status = 'Completed';
            else if (updates.pct > 0 && updatedItem.status === 'Not Started') updatedItem.status = 'In Progress';
          }
          return updatedItem;
        }
        return item;
      });
    });
  }, []);

  // Delete a task
  const deleteTask = useCallback((taskId) => {
    setProjectData(prev => prev.filter(t => t.id !== taskId));
    setRegisters(prev => ({
      ...prev,
      actions: prev.actions.filter(a => a._id !== `track_${taskId}`)
    }));
    setTracker(prev => prev.filter(t => t.taskId !== taskId));
  }, []);

  // Modify hierarchy — stamp updatedAt
  const modifyHierarchy = useCallback((taskId, delta) => {
    setProjectData(prev => {
      return prev.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            indent: Math.max(0, (task.indent || 0) + delta),
            updatedAt: now()
          };
        }
        return task;
      });
    });
  }, []);

  // Toggle task tracking (actions register)
  const toggleTrackTask = useCallback((taskId, isTracked) => {
    updateTask(taskId, { tracked: isTracked });
    
    const task = projectData.find(t => t.id === taskId);
    if (!task) return;

    const actionId = `track_${taskId}`;
    
    if (isTracked) {
      setRegisters(prev => {
        const exists = prev.actions.find(a => a._id === actionId);
        if (exists) return prev;
        return {
          ...prev,
          actions: [...prev.actions, {
            _id: actionId,
            number: "Lnk",
            visible: true,
            public: true,
            category: "Task",
            actionassignedto: "PM",
            description: task.name,
            currentstatus: "Tracked from Schedule",
            status: task.pct === 100 ? "Completed" : "In Progress",
            raised: task.start,
            target: getFinishDate(task.start, task.dur),
            update: getCurrentDate(),
            completed: "",
            createdAt: now(),
            updatedAt: now()
          }]
        };
      });
    } else {
      setRegisters(prev => ({
        ...prev,
        actions: prev.actions.filter(a => a._id !== actionId)
      }));
    }
  }, [projectData, updateTask]);

  // Update tracked actions
  const updateTrackedActions = useCallback((task) => {
    setRegisters(prev => {
      const actionId = `track_${task.id}`;
      const newActions = prev.actions.map(action => {
        if (action._id === actionId) {
          return {
            ...action,
            description: task.name,
            raised: task.start,
            target: getFinishDate(task.start, task.dur),
            status: task.pct === 100 ? "Completed" : "In Progress",
            updatedAt: now()
          };
        }
        return action;
      });
      return { ...prev, actions: newActions };
    });
  }, []);

  // ==================== TRACKER FUNCTIONS ====================

  const sendToTracker = useCallback((taskId) => {
    const task = projectData.find(t => t.id === taskId);
    if (!task) return;

    setTracker(prev => {
      if (prev.find(t => t.taskId === taskId)) return prev;
      return [...prev, {
        _id: `tracker_${taskId}_${Date.now()}`,
        taskId: taskId,
        taskName: task.name,
        notes: '',
        status: task.pct === 100 ? 'Completed' : task.pct > 0 ? 'In Progress' : 'Not Started',
        rag: 'Green',
        nextAction: '',
        owner: '',
        dateAdded: getCurrentDate(),
        lastUpdated: getCurrentDate(),
        createdAt: now(),
        updatedAt: now()
      }];
    });
  }, [projectData]);

  const removeFromTracker = useCallback((trackerId) => {
    setTracker(prev => prev.filter(t => t._id !== trackerId));
  }, []);

  const updateTrackerItem = useCallback((trackerId, key, value) => {
    setTracker(prev => prev.map(item =>
      item._id === trackerId
        ? { ...item, [key]: value, lastUpdated: getCurrentDate(), updatedAt: now() }
        : item
    ));
  }, []);

  const isInTracker = useCallback((taskId) => {
    return tracker.some(t => t.taskId === taskId);
  }, [tracker]);

  // ==================== STATUS REPORT FUNCTIONS ====================

  const updateStatusReport = useCallback((key, value) => {
    setStatusReport(prev => ({ ...prev, [key]: value }));
  }, []);

  // ==================== TEMPLATE ====================

  const loadTemplate = useCallback(() => {
    const ts = now();
    const templateData = [
      { id: 1, name: "Project Initiation", type: "Task", start: "2026-03-01", dur: 3, pct: 100, parent: null, depType: 'FS', indent: 0, tracked: false, createdAt: ts, updatedAt: ts },
      { id: 2, name: "Requirements Gathering", type: "Task", start: "2026-03-04", dur: 5, pct: 75, parent: 1, depType: 'FS', indent: 1, tracked: false, createdAt: ts, updatedAt: ts },
      { id: 3, name: "Design Phase", type: "Task", start: "2026-03-09", dur: 7, pct: 50, parent: 2, depType: 'FS', indent: 1, tracked: false, createdAt: ts, updatedAt: ts },
      { id: 4, name: "Development Sprint 1", type: "Task", start: "2026-03-16", dur: 10, pct: 25, parent: 3, depType: 'FS', indent: 1, tracked: false, createdAt: ts, updatedAt: ts },
      { id: 5, name: "Phase 1 Complete", type: "Milestone", start: "2026-03-26", dur: 0, pct: 0, parent: 4, depType: 'FS', indent: 0, tracked: false, createdAt: ts, updatedAt: ts }
    ];
    setProjectData(calculateSchedule(templateData));
  }, []);

  // ==================== REGISTER FUNCTIONS ====================

  // Add register item — with timestamps
  const addRegisterItem = useCallback((registerType, itemData = {}) => {
    setRegisters(prev => {
      const schema = SCHEMAS[registerType];
      if (!schema) return prev;
      
      const newItem = {
        _id: Date.now().toString(),
        public: true,
        visible: true,
        createdAt: now(),
        updatedAt: now()
      };

      schema.cols.forEach(col => {
        const key = keyGen(col);
        if (col === "Visible") return;
        if (col === "Number") {
          newItem[key] = prev[registerType].length + 1;
        } else if (col.toLowerCase().includes("date") || col.toLowerCase().includes("raised")) {
          newItem[key] = getCurrentDate();
        } else {
          newItem[key] = itemData[key] || "...";
        }
      });

      return {
        ...prev,
        [registerType]: [...prev[registerType], newItem]
      };
    });
  }, []);

  // Update register item — stamp updatedAt
  const updateRegisterItem = useCallback((registerType, itemId, key, value) => {
    setRegisters(prev => ({
      ...prev,
      [registerType]: prev[registerType].map(item =>
        item._id === itemId ? { ...item, [key]: value, updatedAt: now() } : item
      )
    }));
  }, []);

  const deleteRegisterItem = useCallback((registerType, itemId) => {
    setRegisters(prev => ({
      ...prev,
      [registerType]: prev[registerType].filter(item => item._id !== itemId)
    }));
  }, []);

  const toggleItemPublic = useCallback((registerType, itemId) => {
    setRegisters(prev => ({
      ...prev,
      [registerType]: prev[registerType].map(item =>
        item._id === itemId ? { ...item, public: !item.public, updatedAt: now() } : item
      )
    }));
  }, []);

  return {
    projectData,
    registers,
    tracker,
    statusReport,
    baseline,
    saving,
    lastSaved,
    loadingData,
    saveConflict,
    saveError,
    addTask,
    updateTask,
    deleteTask,
    modifyHierarchy,
    toggleTrackTask,
    updateTrackedActions,
    loadTemplate,
    setBaseline,
    clearBaseline,
    addRegisterItem,
    updateRegisterItem,
    deleteRegisterItem,
    toggleItemPublic,
    sendToTracker,
    removeFromTracker,
    updateTrackerItem,
    isInTracker,
    updateStatusReport,
    reloadProject,
    setProjectData,
    setRegisters,
    setTracker
  };
};
