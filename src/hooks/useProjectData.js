import { useState, useCallback, useEffect, useRef } from 'react';
import { calculateSchedule, getNextId, getCurrentDate, getFinishDate, keyGen } from '../utils/helpers';
import { DEFAULT_TASK, SCHEMAS } from '../utils/constants';
import { supabase } from '../lib/supabase';

/**
 * Custom hook for managing project data (tasks and registers)
 * With Supabase persistence and baseline support
 */
export const useProjectData = (projectId) => {
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
  const [baseline, setBaselineState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef(null);

  // Load project data from Supabase
  useEffect(() => {
    if (!projectId) return;

    const loadProject = async () => {
      setLoadingData(true);
      initialLoadDone.current = false;

      const { data, error } = await supabase
        .from('projects')
        .select('tasks, registers, baseline')
        .eq('id', projectId)
        .single();

      if (!error && data) {
        setProjectData(data.tasks || []);
        setRegisters(data.registers || {
          risks: [], issues: [], actions: [],
          minutes: [], costs: [], changes: [], comms: []
        });
        setBaselineState(data.baseline || null);
      }

      setLoadingData(false);
      setTimeout(() => {
        initialLoadDone.current = true;
      }, 500);
    };

    loadProject();
  }, [projectId]);

  // Auto-save to Supabase (debounced)
  useEffect(() => {
    if (!projectId || !initialLoadDone.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true);
      const updateData = {
        tasks: projectData,
        registers: registers,
        updated_at: new Date().toISOString()
      };
      // Only include baseline if it exists
      if (baseline !== undefined) {
        updateData.baseline = baseline;
      }

      const { error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId);

      if (!error) {
        setLastSaved(new Date());
      }
      setSaving(false);
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [projectData, registers, baseline, projectId]);

  // Set baseline - snapshot current task dates
  const setBaseline = useCallback(() => {
    const baselineData = projectData.map(task => ({
      id: task.id,
      start: task.start,
      dur: task.dur,
      finish: getFinishDate(task.start, task.dur)
    }));
    setBaselineState(baselineData);
  }, [projectData]);

  // Clear baseline
  const clearBaseline = useCallback(() => {
    setBaselineState(null);
  }, []);

  // Add a new task
  const addTask = useCallback((taskData, insertAfterId = null) => {
    setProjectData(prev => {
      const newTask = {
        ...DEFAULT_TASK,
        ...taskData,
        id: getNextId(prev)
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

  // Update an existing task
  const updateTask = useCallback((taskId, updates) => {
    setProjectData(prev => {
      const newData = prev.map(task =>
        task.id === taskId ? { ...task, ...updates } : task
      );
      return calculateSchedule(newData);
    });
  }, []);

  // Delete a task
  const deleteTask = useCallback((taskId) => {
    setProjectData(prev => prev.filter(t => t.id !== taskId));
    
    setRegisters(prev => ({
      ...prev,
      actions: prev.actions.filter(a => a._id !== `track_${taskId}`)
    }));
  }, []);

  // Modify task hierarchy (indent/outdent)
  const modifyHierarchy = useCallback((taskId, delta) => {
    setProjectData(prev => {
      const newData = prev.map(task => {
        if (task.id === taskId) {
          return {
            ...task,
            indent: Math.max(0, (task.indent || 0) + delta)
          };
        }
        return task;
      });
      return newData;
    });
  }, []);

  // Toggle task tracking
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
            completed: ""
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

  // Update tracked actions when task changes
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
            status: task.pct === 100 ? "Completed" : "In Progress"
          };
        }
        return action;
      });

      return { ...prev, actions: newActions };
    });
  }, []);

  // Load template data
  const loadTemplate = useCallback(() => {
    const templateData = [
      {
        id: 1,
        name: "Project Initiation",
        type: "Task",
        start: "2026-03-01",
        dur: 3,
        pct: 100,
        parent: null,
        depType: 'FS',
        indent: 0,
        tracked: false
      },
      {
        id: 2,
        name: "Requirements Gathering",
        type: "Task",
        start: "2026-03-04",
        dur: 5,
        pct: 75,
        parent: 1,
        depType: 'FS',
        indent: 1,
        tracked: false
      },
      {
        id: 3,
        name: "Design Phase",
        type: "Task",
        start: "2026-03-09",
        dur: 7,
        pct: 50,
        parent: 2,
        depType: 'FS',
        indent: 1,
        tracked: false
      },
      {
        id: 4,
        name: "Development Sprint 1",
        type: "Task",
        start: "2026-03-16",
        dur: 10,
        pct: 25,
        parent: 3,
        depType: 'FS',
        indent: 1,
        tracked: false
      },
      {
        id: 5,
        name: "Phase 1 Complete",
        type: "Milestone",
        start: "2026-03-26",
        dur: 0,
        pct: 0,
        parent: 4,
        depType: 'FS',
        indent: 0,
        tracked: false
      }
    ];

    setProjectData(calculateSchedule(templateData));
  }, []);

  // Register management functions
  const addRegisterItem = useCallback((registerType, itemData = {}) => {
    setRegisters(prev => {
      const schema = SCHEMAS[registerType];
      if (!schema) return prev;
      
      const newItem = {
        _id: Date.now().toString(),
        public: true,
        visible: true
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

  const updateRegisterItem = useCallback((registerType, itemId, key, value) => {
    setRegisters(prev => ({
      ...prev,
      [registerType]: prev[registerType].map(item =>
        item._id === itemId ? { ...item, [key]: value } : item
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
        item._id === itemId ? { ...item, public: !item.public } : item
      )
    }));
  }, []);

  return {
    projectData,
    registers,
    baseline,
    saving,
    lastSaved,
    loadingData,
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
    setProjectData,
    setRegisters
  };
};
