import { createEmptyRegisters, createEmptyStatusReport } from './defaults';

export const backfillTimestampedItems = (items, nowFn) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    createdAt: item.createdAt || item.dateAdded || nowFn(),
    updatedAt: item.updatedAt || item.lastUpdated || nowFn()
  }));
};

export const backfillTasks = (tasks, nowFn) => {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => ({
    ...task,
    createdAt: task.createdAt || nowFn(),
    updatedAt: task.updatedAt || nowFn()
  }));
};

export const normalizeLoadedProjectState = (data, nowFn) => {
  const loadedRegisters = {
    ...createEmptyRegisters(),
    ...(data?.registers || {})
  };

  const registers = {};
  Object.keys(loadedRegisters).forEach((key) => {
    registers[key] = backfillTimestampedItems(loadedRegisters[key], nowFn);
  });

  return {
    tasks: backfillTasks(data?.tasks || [], nowFn),
    registers,
    baseline: data?.baseline || null,
    tracker: backfillTimestampedItems(data?.tracker || [], nowFn),
    statusReport: data?.status_report || createEmptyStatusReport(),
    version: Number.isInteger(data?.version) ? data.version : 1
  };
};

export const buildProjectUpdatePayload = ({
  projectData,
  registers,
  tracker,
  statusReport,
  baseline
}) => {
  const updateData = {
    tasks: projectData,
    registers,
    tracker,
    status_report: statusReport,
    updated_at: new Date().toISOString()
  };

  if (baseline !== undefined) {
    updateData.baseline = baseline;
  }
  return updateData;
};
