import { useState, useCallback, useEffect, useRef } from 'react';
import { calculateSchedule, getNextId, getCurrentDate, getFinishDate, keyGen, getNextRecurringDueDate } from '../utils/helpers';
import { DEFAULT_TASK, SCHEMAS } from '../utils/constants';
import { buildDemoProjectPayload, buildDemoScheduleTasks } from '../utils/demoProjectBuilder';
import { supabase } from '../lib/supabase';
import { createEmptyRegisters, createEmptyStatusReport } from './projectData/defaults';
import {
  MANUAL_TODO_SELECT,
  createManualTodoId,
  normalizeTodoRecurrence,
  mapManualTodoRow,
  isMissingRelationError
} from './projectData/manualTodoUtils';

// Helper: get ISO timestamp
const now = () => new Date().toISOString();

/**
 * Custom hook for managing project data (tasks, registers, tracker, status report, and todos)
 * With Supabase persistence, baseline support, and timestamps
 */
export const useProjectData = (projectId, userId = null) => {
  const [projectData, setProjectData] = useState([]);
  const [registers, setRegisters] = useState(() => createEmptyRegisters());
  const [tracker, setTracker] = useState([]);
  const [statusReport, setStatusReport] = useState(() => createEmptyStatusReport());
  const [todos, setTodos] = useState([]);
  const [baseline, setBaselineState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const initialLoadDone = useRef(false);
  const saveTimeoutRef = useRef(null);
  const projectVersionRef = useRef(1);
  const supportsManualTodosTableRef = useRef(true);

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
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          createdAt: item.createdAt || item.dateAdded || now(),
          updatedAt: item.updatedAt || item.lastUpdated || now()
        }));
      };

      const backfillTasks = (tasks) => {
        if (!Array.isArray(tasks)) return [];
        return tasks.map(t => ({
          ...t,
          createdAt: t.createdAt || now(),
          updatedAt: t.updatedAt || now()
        }));
      };

      const loadedRegisters = {
        ...createEmptyRegisters(),
        ...(data.registers || {})
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
      setStatusReport(data.status_report || createEmptyStatusReport());

      if (userId && supportsManualTodosTableRef.current) {
        const { data: todoRows, error: todoError } = await supabase
          .from('manual_todos')
          .select(MANUAL_TODO_SELECT)
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (!todoError) {
          setTodos((todoRows || []).map(mapManualTodoRow));
        } else if (isMissingRelationError(todoError, 'manual_todos')) {
          supportsManualTodosTableRef.current = false;
          setTodos([]);
        } else {
          console.error('Failed to load manual todos:', todoError);
          setTodos([]);
        }
      } else {
        setTodos([]);
      }

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
            currentstatus: "Tracked from Project Plan",
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

  // ==================== TODO FUNCTIONS ====================

  const addTodo = useCallback(async (todoData = {}) => {
    const ts = now();
    const normalizedRecurrence = normalizeTodoRecurrence(todoData.recurrence);
    const nextProjectId = Object.prototype.hasOwnProperty.call(todoData, 'projectId')
      ? todoData.projectId
      : projectId;

    const localTodo = {
      _id: createManualTodoId(),
      projectId: nextProjectId || null,
      title: todoData.title || 'New ToDo',
      dueDate: todoData.dueDate || getCurrentDate(),
      owner: todoData.owner || 'PM',
      assigneeUserId: todoData.assigneeUserId || userId || null,
      status: todoData.status === 'Done' ? 'Done' : 'Open',
      recurrence: normalizedRecurrence,
      createdAt: ts,
      updatedAt: ts,
      completedAt: todoData.status === 'Done' ? ts : ''
    };

    if (!userId || !supportsManualTodosTableRef.current) {
      setTodos(prev => [...prev, localTodo]);
      return;
    }

    const { data, error } = await supabase
      .from('manual_todos')
      .insert({
        user_id: userId,
        project_id: localTodo.projectId,
        title: localTodo.title,
        due_date: localTodo.dueDate || null,
        owner_text: localTodo.owner,
        assignee_user_id: localTodo.assigneeUserId,
        status: localTodo.status,
        recurrence: localTodo.recurrence,
        completed_at: localTodo.completedAt || null
      })
      .select(MANUAL_TODO_SELECT)
      .single();

    if (!error && data) {
      setTodos(prev => [...prev, mapManualTodoRow(data)]);
      return;
    }

    if (isMissingRelationError(error, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
    } else if (error) {
      console.error('Failed to create manual todo:', error);
    }
    setTodos(prev => [...prev, localTodo]);
  }, [projectId, userId]);

  const updateTodo = useCallback(async (todoId, key, value) => {
    const todo = todos.find(item => item._id === todoId);
    if (!todo) return;

    const ts = now();
    const normalizedRecurrence = key === 'recurrence'
      ? normalizeTodoRecurrence(value)
      : normalizeTodoRecurrence(todo.recurrence);
    const nextStatus = key === 'status' ? value : todo.status;
    const transitionedToDone = todo.status !== 'Done' && nextStatus === 'Done';

    const localUpdated = {
      ...todo,
      updatedAt: ts
    };

    if (key === 'title') localUpdated.title = value;
    if (key === 'dueDate') localUpdated.dueDate = value;
    if (key === 'owner') localUpdated.owner = value;
    if (key === 'projectId') localUpdated.projectId = value || null;
    if (key === 'assigneeUserId') localUpdated.assigneeUserId = value || null;
    if (key === 'recurrence') localUpdated.recurrence = normalizedRecurrence;
    if (key === 'status') {
      localUpdated.status = value;
      localUpdated.completedAt = value === 'Done' ? (todo.completedAt || ts) : '';
    }

    let followUpLocal = null;
    const nextRecurringDueDate = transitionedToDone && normalizedRecurrence
      ? getNextRecurringDueDate(localUpdated.dueDate, normalizedRecurrence, getCurrentDate())
      : '';
    if (transitionedToDone && normalizedRecurrence) {
      followUpLocal = {
        _id: createManualTodoId(),
        projectId: localUpdated.projectId || null,
        title: localUpdated.title || 'New ToDo',
        dueDate: nextRecurringDueDate,
        owner: localUpdated.owner || 'PM',
        assigneeUserId: localUpdated.assigneeUserId || userId || null,
        status: 'Open',
        recurrence: normalizedRecurrence,
        createdAt: ts,
        updatedAt: ts,
        completedAt: ''
      };
    }

    if (!userId || !supportsManualTodosTableRef.current) {
      setTodos(prev => {
        const next = prev.map(item => item._id === todoId ? localUpdated : item);
        if (followUpLocal) next.push(followUpLocal);
        return next;
      });
      return;
    }

    const patch = { updated_at: ts };
    if (key === 'title') patch.title = value || '';
    if (key === 'dueDate') patch.due_date = value || null;
    if (key === 'owner') patch.owner_text = value || '';
    if (key === 'projectId') patch.project_id = value || null;
    if (key === 'assigneeUserId') patch.assignee_user_id = value || null;
    if (key === 'recurrence') patch.recurrence = normalizedRecurrence;
    if (key === 'status') {
      patch.status = nextStatus === 'Done' ? 'Done' : 'Open';
      patch.completed_at = nextStatus === 'Done' ? (todo.completedAt || ts) : null;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('manual_todos')
      .update(patch)
      .eq('id', todoId)
      .eq('user_id', userId)
      .select(MANUAL_TODO_SELECT)
      .single();

    if (updateError && isMissingRelationError(updateError, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      setTodos(prev => {
        const next = prev.map(item => item._id === todoId ? localUpdated : item);
        if (followUpLocal) next.push(followUpLocal);
        return next;
      });
      return;
    }

    if (updateError || !updatedRow) {
      console.error('Failed to update manual todo:', updateError);
      setTodos(prev => {
        const next = prev.map(item => item._id === todoId ? localUpdated : item);
        if (followUpLocal) next.push(followUpLocal);
        return next;
      });
      return;
    }

    let followUpDbRow = null;
    if (transitionedToDone && normalizedRecurrence) {
      const { data: insertedRow, error: insertError } = await supabase
        .from('manual_todos')
        .insert({
          user_id: userId,
          project_id: localUpdated.projectId || null,
          title: localUpdated.title || 'New ToDo',
          due_date: nextRecurringDueDate || null,
          owner_text: localUpdated.owner || 'PM',
          assignee_user_id: localUpdated.assigneeUserId || userId,
          status: 'Open',
          recurrence: normalizedRecurrence,
          completed_at: null
        })
        .select(MANUAL_TODO_SELECT)
        .single();

      if (!insertError && insertedRow) {
        followUpDbRow = insertedRow;
      } else if (insertError) {
        if (isMissingRelationError(insertError, 'manual_todos')) {
          supportsManualTodosTableRef.current = false;
        }
        console.error('Failed to create recurring follow-up todo:', insertError);
      }
    }

    setTodos(prev => {
      const next = prev.map(item => item._id === todoId ? mapManualTodoRow(updatedRow) : item);
      if (followUpDbRow) {
        next.push(mapManualTodoRow(followUpDbRow));
      } else if (followUpLocal) {
        next.push(followUpLocal);
      }
      return next;
    });
  }, [todos, userId]);

  const deleteTodo = useCallback(async (todoId) => {
    setTodos(prev => prev.filter(todo => todo._id !== todoId));

    if (!userId || !supportsManualTodosTableRef.current) return;

    const { error } = await supabase
      .from('manual_todos')
      .delete()
      .eq('id', todoId)
      .eq('user_id', userId);

    if (error && isMissingRelationError(error, 'manual_todos')) {
      supportsManualTodosTableRef.current = false;
      return;
    }
    if (error) {
      console.error('Failed to delete manual todo:', error);
    }
  }, [userId]);

  // ==================== TEMPLATE ====================

  const loadTemplate = useCallback(() => {
    setProjectData(buildDemoScheduleTasks());
  }, []);

  const loadDemoDataAllTabs = useCallback(() => {
    const demoPayload = buildDemoProjectPayload();
    setProjectData(demoPayload.tasks);
    setRegisters(demoPayload.registers);
    setTracker(demoPayload.tracker);
    setStatusReport(demoPayload.status_report);
    setBaselineState(demoPayload.baseline);
  }, []);

  const resetDemoData = useCallback(() => {
    setProjectData([]);
    setRegisters(createEmptyRegisters());
    setTracker([]);
    setStatusReport(createEmptyStatusReport());
    setBaselineState(null);
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
    todos,
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
    loadDemoDataAllTabs,
    resetDemoData,
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
    addTodo,
    updateTodo,
    deleteTodo,
    reloadProject,
    setProjectData,
    setRegisters,
    setTracker,
    setTodos
  };
};
