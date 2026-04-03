import { SCHEMAS } from '../../utils/constants.js';
import { keyGen, getCurrentDate, getFinishDate } from '../../utils/helpers.js';

export const getTrackedActionId = (taskId) => `track_${taskId}`;

const createTrackedAction = (taskId, task, nowIso) => ({
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
  const nextActions = (registers.actions || []).map((action) => {
    if (action._id !== actionId) return action;
    return {
      ...action,
      description: task.name,
      rowColor: action.rowColor ?? task.rowColor ?? null,
      raised: task.start,
      target: getFinishDate(task.start, task.dur),
      status: task.pct === 100 ? 'Completed' : 'In Progress',
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
