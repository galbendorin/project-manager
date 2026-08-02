import { SCHEMAS } from '../../utils/constants.js';
import {
  keyGen,
  getCurrentDate,
  getFinishDate,
  parseDateValue,
  toISODateString,
} from '../../utils/helpers.js';

export const ACTION_DEADLINE_RISK_WINDOW_DAYS = 3;

const CLOSED_ACTION_STATUS_TOKENS = [
  'done',
  'completed',
  'closed',
  'resolved',
  'cancelled',
];

const AUTO_RISK_SYNC_KEYS = [
  'number',
  'visible',
  'public',
  'rowColor',
  'category',
  'riskdetails',
  'mitigationaction',
  'notes',
  'raised',
  'owner',
  'level',
  'sourceActionId',
  'sourceTaskId',
  'manualPlanLink',
  'deadlineManaged',
  'deadlineDate',
  'deadlineDaysRemaining',
];

const normalizeText = (value = '') => String(value || '').trim();

const getCalendarDayNumber = (value) => {
  const date = parseDateValue(value);
  if (!date) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
};

export const getCalendarDaysUntil = (targetDate, todayDate) => {
  const targetDay = getCalendarDayNumber(targetDate);
  const todayDay = getCalendarDayNumber(todayDate);
  if (targetDay === null || todayDay === null) return null;
  return Math.round((targetDay - todayDay) / 86400000);
};

export const isActionClosed = (action = {}) => {
  if (normalizeText(action.completed)) return true;
  const status = normalizeText(action.status || action.currentstatus).toLowerCase();
  return CLOSED_ACTION_STATUS_TOKENS.some((token) => status.includes(token));
};

export const getTrackedTaskIdFromAction = (action = {}, tasks = []) => {
  if (action.sourceTaskId !== undefined && action.sourceTaskId !== null) {
    return action.sourceTaskId;
  }

  const actionId = normalizeText(action._id);
  if (actionId.startsWith('track_')) {
    const rawTaskId = actionId.slice('track_'.length);
    if (!rawTaskId) return null;
    return /^\d+$/.test(rawTaskId) ? Number(rawTaskId) : rawTaskId;
  }

  const isLegacyPlanLink = normalizeText(action.number).toLowerCase() === 'lnk'
    || normalizeText(action.currentstatus).toLowerCase().includes('tracked from project plan');
  const actionTitle = normalizeText(action.description).toLowerCase();
  if (!isLegacyPlanLink || !actionTitle || !Array.isArray(tasks)) return null;

  const matchingTasks = tasks.filter((task) => (
    normalizeText(task?.name).toLowerCase() === actionTitle
  ));
  return matchingTasks.length === 1 ? matchingTasks[0].id : null;
};

export const getLinkedTaskRiskId = (taskId) => `risk_task_${taskId}`;
export const getActionDeadlineRiskId = (action = {}, tasks = []) => {
  const taskId = getTrackedTaskIdFromAction(action, tasks);
  if (taskId !== null) return getLinkedTaskRiskId(taskId);
  return action._id ? `risk_action_${action._id}` : null;
};

const getDeadlineRiskLevel = (daysRemaining) => (
  daysRemaining <= 1 ? 'High' : 'Medium'
);

const getTaskRiskLevel = (task = {}) => {
  const rag = normalizeText(task.rag).toLowerCase();
  if (rag === 'red') return 'High';
  if (rag === 'amber') return 'Medium';
  if (rag === 'green') return 'Low';
  return 'Medium';
};

const getDeadlineRiskDetails = (action, targetDate, daysRemaining) => {
  const title = normalizeText(action.description) || 'Untitled action';
  if (daysRemaining < 0) {
    return `Overdue action: ${title} was due ${targetDate}.`;
  }
  if (daysRemaining === 0) {
    return `Deadline risk: ${title} is due today (${targetDate}).`;
  }
  const dayLabel = daysRemaining === 1 ? 'day' : 'days';
  return `Deadline risk: ${title} is due in ${daysRemaining} ${dayLabel} (${targetDate}).`;
};

const createLinkedTaskRisk = (taskId, task, nowIso) => ({
  _id: getLinkedTaskRiskId(taskId),
  number: 'Lnk',
  visible: true,
  public: true,
  rowColor: task.rowColor || null,
  category: 'Project Plan',
  riskdetails: `Delivery risk: ${normalizeText(task.name) || 'Untitled task'}.`,
  mitigationaction: 'Monitor the task and agree a recovery action if delivery is at risk.',
  notes: 'Linked from Project Plan.',
  raised: getCurrentDate(),
  owner: normalizeText(task.owner) || 'PM',
  level: getTaskRiskLevel(task),
  sourceTaskId: taskId,
  sourceActionId: null,
  manualPlanLink: true,
  deadlineManaged: false,
  deadlineDate: '',
  deadlineDaysRemaining: null,
  createdAt: nowIso,
  updatedAt: nowIso,
});

const createActionDeadlineRisk = ({ action, riskId, taskId, targetDate, daysRemaining, todayDate, nowIso }) => ({
  _id: riskId,
  number: 'Auto',
  visible: action.visible !== false,
  public: action.public !== false,
  rowColor: action.rowColor || null,
  category: 'Schedule',
  riskdetails: getDeadlineRiskDetails(action, targetDate, daysRemaining),
  mitigationaction: `Complete the linked action by ${targetDate} or agree a recovery date.`,
  notes: 'Automatically monitored from Action Log. The original action remains in Action Log.',
  raised: todayDate,
  owner: normalizeText(action.actionassignedto) || 'PM',
  level: getDeadlineRiskLevel(daysRemaining),
  sourceActionId: action._id,
  sourceTaskId: taskId,
  manualPlanLink: false,
  deadlineManaged: true,
  deadlineDate: targetDate,
  deadlineDaysRemaining: daysRemaining,
  createdAt: nowIso,
  updatedAt: nowIso,
});

const hasManagedRiskChanges = (current, next) => (
  AUTO_RISK_SYNC_KEYS.some((key) => current?.[key] !== next?.[key])
);

export const getTaskRiskLinkState = (registers, taskId) => {
  const risk = (registers?.risks || []).find((item) => item._id === getLinkedTaskRiskId(taskId));
  return {
    linked: Boolean(risk),
    manual: Boolean(risk?.manualPlanLink),
    automatic: Boolean(risk?.deadlineManaged),
  };
};

export const addLinkedTaskRiskIfMissing = (registers, taskId, task, nowIso) => {
  const riskId = getLinkedTaskRiskId(taskId);
  const existingRisks = registers.risks || [];
  const existingIndex = existingRisks.findIndex((risk) => risk._id === riskId);

  if (existingIndex === -1) {
    return {
      ...registers,
      risks: [...existingRisks, createLinkedTaskRisk(taskId, task, nowIso)],
    };
  }

  const existing = existingRisks[existingIndex];
  if (existing.manualPlanLink) return registers;
  const nextRisks = [...existingRisks];
  nextRisks[existingIndex] = {
    ...existing,
    manualPlanLink: true,
    updatedAt: nowIso,
  };
  return { ...registers, risks: nextRisks };
};

export const removeLinkedTaskRisk = (registers, taskId, nowIso) => {
  const riskId = getLinkedTaskRiskId(taskId);
  const existingRisks = registers.risks || [];
  const existing = existingRisks.find((risk) => risk._id === riskId);
  if (!existing) return registers;

  if (existing.deadlineManaged) {
    if (!existing.manualPlanLink) return registers;
    return {
      ...registers,
      risks: existingRisks.map((risk) => (
        risk._id === riskId
          ? { ...risk, manualPlanLink: false, updatedAt: nowIso }
          : risk
      )),
    };
  }

  return {
    ...registers,
    risks: existingRisks.filter((risk) => risk._id !== riskId),
  };
};

export const removeLinkedRisksForTask = (registers, taskId) => ({
  ...registers,
  risks: (registers.risks || []).filter((risk) => risk.sourceTaskId !== taskId && risk._id !== getLinkedTaskRiskId(taskId)),
});

export const syncLinkedRiskFromTask = (registers, task, nowIso) => {
  const riskId = getLinkedTaskRiskId(task.id);
  const existingRisks = registers.risks || [];
  const existing = existingRisks.find((risk) => risk._id === riskId);
  if (!existing?.manualPlanLink) return registers;

  const nextRisk = {
    ...existing,
    rowColor: existing.rowColor ?? task.rowColor ?? null,
    riskdetails: `Delivery risk: ${normalizeText(task.name) || 'Untitled task'}.`,
    owner: normalizeText(task.owner) || existing.owner || 'PM',
    level: getTaskRiskLevel(task),
    updatedAt: nowIso,
  };
  if (!hasManagedRiskChanges(existing, nextRisk)) return registers;
  return {
    ...registers,
    risks: existingRisks.map((risk) => (risk._id === riskId ? nextRisk : risk)),
  };
};

export const reconcileActionDeadlineRisks = (
  registers,
  {
    todayDate = getCurrentDate(),
    nowIso = new Date().toISOString(),
    windowDays = ACTION_DEADLINE_RISK_WINDOW_DAYS,
    tasks = [],
  } = {}
) => {
  const actions = Array.isArray(registers?.actions) ? registers.actions : [];
  const currentRisks = Array.isArray(registers?.risks) ? registers.risks : [];
  const desiredById = new Map();

  actions.forEach((action) => {
    if (!action?._id || isActionClosed(action)) return;
    const targetDate = toISODateString(action.target);
    const daysRemaining = getCalendarDaysUntil(targetDate, todayDate);
    if (!targetDate || daysRemaining === null || daysRemaining > windowDays) return;

    const riskId = getActionDeadlineRiskId(action, tasks);
    if (!riskId) return;
    const taskId = getTrackedTaskIdFromAction(action, tasks);
    const existing = currentRisks.find((risk) => risk._id === riskId);
    const automaticRisk = createActionDeadlineRisk({
      action,
      riskId,
      taskId,
      targetDate,
      daysRemaining,
      todayDate,
      nowIso,
    });

    desiredById.set(riskId, existing?.manualPlanLink
      ? {
          ...existing,
          sourceActionId: action._id,
          sourceTaskId: taskId,
          deadlineManaged: true,
          deadlineDate: targetDate,
          deadlineDaysRemaining: daysRemaining,
          updatedAt: nowIso,
        }
      : {
          ...existing,
          ...automaticRisk,
          visible: existing?.visible ?? automaticRisk.visible,
          public: existing?.public ?? automaticRisk.public,
          category: existing?.category ?? automaticRisk.category,
          mitigationaction: existing?.mitigationaction ?? automaticRisk.mitigationaction,
          notes: existing?.notes ?? automaticRisk.notes,
          createdAt: existing?.createdAt || automaticRisk.createdAt,
        });
  });

  const changes = [];
  const nextRisks = [];

  currentRisks.forEach((risk) => {
    const desired = desiredById.get(risk._id);
    if (desired) {
      desiredById.delete(risk._id);
      if (hasManagedRiskChanges(risk, desired)) {
        nextRisks.push(desired);
        changes.push({ type: 'update', item: desired });
      } else {
        nextRisks.push(risk);
      }
      return;
    }

    if (!risk.deadlineManaged) {
      nextRisks.push(risk);
      return;
    }

    if (risk.manualPlanLink) {
      const retained = {
        ...risk,
        sourceActionId: null,
        deadlineManaged: false,
        deadlineDate: '',
        deadlineDaysRemaining: null,
        updatedAt: nowIso,
      };
      nextRisks.push(retained);
      changes.push({ type: 'update', item: retained });
      return;
    }

    changes.push({ type: 'delete', item: risk });
  });

  desiredById.forEach((risk) => {
    nextRisks.push(risk);
    changes.push({ type: 'add', item: risk });
  });

  if (changes.length === 0) return { registers, changes };
  return {
    registers: { ...registers, risks: nextRisks },
    changes,
  };
};

export const getTrackedActionId = (taskId) => `track_${taskId}`;

export const createTrackedAction = (taskId, task, nowIso) => ({
  _id: getTrackedActionId(taskId),
  number: 'Lnk',
  visible: true,
  public: true,
  rowColor: task.rowColor || null,
  category: 'Task',
  actionassignedto: 'PM',
  description: task.name,
  currentstatus: 'Tracked from Project Plan',
  status: task.pct === 100 ? 'Completed' : 'In Progress',
  raised: task.start,
  target: getFinishDate(task.start, task.dur),
  update: getCurrentDate(),
  completed: '',
  sourceTaskId: taskId,
  createdAt: nowIso,
  updatedAt: nowIso
});

export const addTrackedActionIfMissing = (registers, taskId, task, nowIso) => {
  const actionId = getTrackedActionId(taskId);
  const existing = (registers.actions || []).find((action) => action._id === actionId);
  if (existing) return registers;

  return {
    ...registers,
    actions: [...(registers.actions || []), createTrackedAction(taskId, task, nowIso)]
  };
};

export const removeTrackedAction = (registers, taskId) => ({
  ...registers,
  actions: (registers.actions || []).filter((action) => action._id !== getTrackedActionId(taskId))
});

export const syncTrackedActionFromTask = (registers, task, nowIso) => {
  const actionId = getTrackedActionId(task.id);
  const existing = (registers.actions || []).find((action) => action._id === actionId);
  if (!existing) return registers;
  const nextActions = (registers.actions || []).map((action) => {
    if (action._id !== actionId) return action;
    return {
      ...action,
      description: task.name,
      rowColor: action.rowColor ?? task.rowColor ?? null,
      raised: task.start,
      target: getFinishDate(task.start, task.dur),
      status: task.pct === 100 ? 'Completed' : 'In Progress',
      sourceTaskId: task.id,
      updatedAt: nowIso
    };
  });
  return { ...registers, actions: nextActions };
};

export const buildRegisterItem = (registerType, existingItems = [], itemData = {}, nowIso) => {
  const schema = SCHEMAS[registerType];
  if (!schema) return null;

  const newItem = {
    _id: itemData._id || Date.now().toString(),
    public: Object.prototype.hasOwnProperty.call(itemData, 'public') ? itemData.public : true,
    visible: Object.prototype.hasOwnProperty.call(itemData, 'visible') ? itemData.visible : true,
    rowColor: itemData.rowColor || null,
    createdAt: itemData.createdAt || nowIso,
    updatedAt: itemData.updatedAt || nowIso
  };

  schema.cols.forEach((col) => {
    const key = keyGen(col);
    if (col === 'Visible') return;
    if (col === 'Number') {
      newItem[key] = Object.prototype.hasOwnProperty.call(itemData, key)
        ? itemData[key]
        : existingItems.length + 1;
    } else if (col.toLowerCase().includes('date') || col.toLowerCase().includes('raised')) {
      newItem[key] = Object.prototype.hasOwnProperty.call(itemData, key)
        ? itemData[key]
        : getCurrentDate();
    } else {
      newItem[key] = Object.prototype.hasOwnProperty.call(itemData, key)
        ? itemData[key]
        : '...';
    }
  });

  return newItem;
};

export const addRegisterItemToState = (registers, registerType, itemData, nowIso) => {
  const schema = SCHEMAS[registerType];
  if (!schema) return registers;

  const existingItems = registers[registerType] || [];
  const newItem = buildRegisterItem(registerType, existingItems, itemData, nowIso);

  return {
    ...registers,
    [registerType]: [...existingItems, newItem]
  };
};

export const updateRegisterItemInState = (registers, registerType, itemId, key, value, nowIso) => ({
  ...registers,
  [registerType]: (registers[registerType] || []).map((item) => (
    item._id === itemId ? { ...item, [key]: value, updatedAt: nowIso } : item
  ))
});

export const patchRegisterItemInState = (registers, registerType, itemId, patch, nowIso) => ({
  ...registers,
  [registerType]: (registers[registerType] || []).map((item) => (
    item._id === itemId ? { ...item, ...patch, updatedAt: nowIso } : item
  ))
});

export const deleteRegisterItemFromState = (registers, registerType, itemId) => ({
  ...registers,
  [registerType]: (registers[registerType] || []).filter((item) => item._id !== itemId)
});

export const toggleRegisterItemPublicInState = (registers, registerType, itemId, nowIso) => ({
  ...registers,
  [registerType]: (registers[registerType] || []).map((item) => (
    item._id === itemId ? { ...item, public: !item.public, updatedAt: nowIso } : item
  ))
});
