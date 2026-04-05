import { useCallback } from 'react';
import {
  calculateSchedule,
  getNextId,
  getCurrentDate,
  getFinishDate,
} from '../../utils/helpers';
import { DEFAULT_TASK } from '../../utils/constants';
import {
  addTrackedActionIfMissing,
  removeTrackedAction,
  syncTrackedActionFromTask,
} from './registers';

export function useProjectTasksTracker({
  now,
  projectData,
  setBaselineState,
  setProjectData,
  setRegisters,
  setTracker,
  tracker,
}) {
  const setBaseline = useCallback(() => {
    const baselineData = projectData.map((task) => ({
      id: task.id,
      start: task.start,
      dur: task.dur,
      finish: getFinishDate(task.start, task.dur),
    }));
    setBaselineState(baselineData);
  }, [projectData, setBaselineState]);

  const clearBaseline = useCallback(() => {
    setBaselineState(null);
  }, [setBaselineState]);

  const addTask = useCallback((taskData, insertAfterId = null) => {
    setProjectData((prev) => {
      const newTask = {
        ...DEFAULT_TASK,
        ...taskData,
        id: getNextId(prev),
        createdAt: now(),
        updatedAt: now(),
      };

      if (insertAfterId !== null) {
        const idx = prev.findIndex((t) => t.id === insertAfterId);
        const newData = [...prev];
        newData.splice(idx + 1, 0, newTask);
        return calculateSchedule(newData);
      }

      return calculateSchedule([...prev, newTask]);
    });
  }, [now, setProjectData]);

  const updateTask = useCallback((taskId, updates) => {
    setProjectData((prev) => {
      const newData = prev.map((task) => (
        task.id === taskId ? { ...task, ...updates, updatedAt: now() } : task
      ));
      return calculateSchedule(newData);
    });

    setTracker((prev) => {
      const trackerItem = prev.find((item) => item.taskId === taskId);
      if (!trackerItem) return prev;

      return prev.map((item) => {
        if (item.taskId !== taskId) return item;
        const updatedItem = { ...item, updatedAt: now(), lastUpdated: getCurrentDate() };
        if (updates.name) updatedItem.taskName = updates.name;
        if (updates.pct !== undefined) {
          if (updates.pct === 100) updatedItem.status = 'Completed';
          else if (updates.pct > 0 && updatedItem.status === 'Not Started') updatedItem.status = 'In Progress';
        }
        return updatedItem;
      });
    });
  }, [now, setProjectData, setTracker]);

  const deleteTask = useCallback((taskId) => {
    setProjectData((prev) => prev.filter((task) => task.id !== taskId));
    setRegisters((prev) => ({
      ...prev,
      actions: prev.actions.filter((action) => action._id !== `track_${taskId}`),
    }));
    setTracker((prev) => prev.filter((item) => item.taskId !== taskId));
  }, [setProjectData, setRegisters, setTracker]);

  const modifyHierarchy = useCallback((taskId, delta) => {
    setProjectData((prev) => prev.map((task) => (
      task.id === taskId
        ? { ...task, indent: Math.max(0, (task.indent || 0) + delta), updatedAt: now() }
        : task
    )));
  }, [now, setProjectData]);

  const toggleTrackTask = useCallback((taskId, isTracked) => {
    updateTask(taskId, { tracked: isTracked });

    const task = projectData.find((item) => item.id === taskId);
    if (!task) return;

    if (isTracked) {
      setRegisters((prev) => addTrackedActionIfMissing(prev, taskId, task, now()));
    } else {
      setRegisters((prev) => removeTrackedAction(prev, taskId));
    }
  }, [now, projectData, setRegisters, updateTask]);

  const updateTrackedActions = useCallback((task) => {
    setRegisters((prev) => syncTrackedActionFromTask(prev, task, now()));
  }, [now, setRegisters]);

  const sendToTracker = useCallback((taskId) => {
    const task = projectData.find((item) => item.id === taskId);
    if (!task) return;

    setTracker((prev) => {
      if (prev.find((item) => item.taskId === taskId)) return prev;
      return [...prev, {
        _id: `tracker_${taskId}_${Date.now()}`,
        taskId,
        taskName: task.name,
        rowColor: task.rowColor || null,
        notes: '',
        status: task.pct === 100 ? 'Completed' : task.pct > 0 ? 'In Progress' : 'Not Started',
        rag: 'Green',
        nextAction: '',
        owner: '',
        dateAdded: getCurrentDate(),
        lastUpdated: getCurrentDate(),
        createdAt: now(),
        updatedAt: now(),
      }];
    });
  }, [now, projectData, setTracker]);

  const addManualTrackerItem = useCallback((name = 'New Item') => {
    setTracker((prev) => [...prev, {
      _id: `tracker_manual_${Date.now()}`,
      taskId: null,
      taskName: name,
      rowColor: null,
      notes: '',
      status: 'Not Started',
      rag: 'Green',
      nextAction: '',
      owner: '',
      dateAdded: getCurrentDate(),
      lastUpdated: getCurrentDate(),
      createdAt: now(),
      updatedAt: now(),
    }]);
  }, [now, setTracker]);

  const removeFromTracker = useCallback((trackerId) => {
    setTracker((prev) => prev.filter((item) => item._id !== trackerId));
  }, [setTracker]);

  const updateTrackerItem = useCallback((trackerId, key, value) => {
    setTracker((prev) => prev.map((item) => (
      item._id === trackerId
        ? { ...item, [key]: value, lastUpdated: getCurrentDate(), updatedAt: now() }
        : item
    )));
  }, [now, setTracker]);

  const reorderTrackerItems = useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;

    setTracker((prev) => {
      const sourceIndex = prev.findIndex((item) => item._id === sourceId);
      const targetIndex = prev.findIndex((item) => item._id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      const [movedItem] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return next;
    });
  }, [setTracker]);

  const isInTracker = useCallback((taskId) => (
    tracker.some((item) => item.taskId === taskId)
  ), [tracker]);

  return {
    addManualTrackerItem,
    addTask,
    clearBaseline,
    deleteTask,
    isInTracker,
    modifyHierarchy,
    removeFromTracker,
    reorderTrackerItems,
    sendToTracker,
    setBaseline,
    toggleTrackTask,
    updateTask,
    updateTrackedActions,
    updateTrackerItem,
  };
}
