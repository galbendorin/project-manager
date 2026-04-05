import { createEmptyRegisters, createEmptyStatusReport } from './defaults.js';
import {
  deleteRegisterItemFromState,
  patchRegisterItemInState,
} from './registers.js';

const createProjectSyncOpId = () => (
  typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `project-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const upsertRegisterItemInState = (registers, registerType, itemData = {}) => {
  if (!registerType || !itemData?._id) return registers;

  const items = Array.isArray(registers[registerType]) ? [...registers[registerType]] : [];
  const existingIndex = items.findIndex((item) => item._id === itemData._id);

  if (existingIndex === -1) {
    items.push(itemData);
  } else {
    items[existingIndex] = {
      ...items[existingIndex],
      ...itemData,
    };
  }

  return {
    ...registers,
    [registerType]: items,
  };
};

const hasRegisterItem = (registers, registerType, itemId) => (
  Array.isArray(registers[registerType]) && registers[registerType].some((item) => item._id === itemId)
);

export const buildProjectSyncOp = ({ kind, targetKey, label, detail = '', createdAt = new Date().toISOString(), payload = null }) => ({
  id: createProjectSyncOpId(),
  kind,
  targetKey,
  label,
  detail,
  createdAt,
  payload,
});

export const enqueueProjectSyncOp = (queue = [], op) => {
  const nextQueue = Array.isArray(queue) ? [...queue] : [];
  if (!op?.targetKey) return [...nextQueue, op];

  const replaceableKinds = new Set(['register-update', 'status-update']);
  if (replaceableKinds.has(op.kind)) {
    const existingIndex = nextQueue.findIndex((item) => item.targetKey === op.targetKey && item.kind === op.kind);
    if (existingIndex !== -1) {
      nextQueue[existingIndex] = {
        ...nextQueue[existingIndex],
        ...op,
        id: nextQueue[existingIndex].id,
      };
      return nextQueue;
    }
  }

  return [...nextQueue, op];
};

export const applyProjectSyncQueueToState = (state = {}, queue = []) => {
  let nextRegisters = {
    ...createEmptyRegisters(),
    ...(state.registers || {}),
  };
  let nextStatusReport = {
    ...createEmptyStatusReport(),
    ...(state.statusReport || state.status_report || {}),
  };

  for (const op of Array.isArray(queue) ? queue : []) {
    if (!op?.kind || !op?.payload) continue;

    if (op.kind === 'status-update') {
      const { key, value } = op.payload;
      if (key) {
        nextStatusReport = {
          ...nextStatusReport,
          [key]: value,
        };
      }
      continue;
    }

    if (op.kind === 'register-add') {
      const { registerType, itemData, itemsData } = op.payload;
      if (!registerType) continue;

      if (Array.isArray(itemsData)) {
        for (const item of itemsData) {
          nextRegisters = upsertRegisterItemInState(nextRegisters, registerType, item);
        }
      } else if (itemData) {
        nextRegisters = upsertRegisterItemInState(nextRegisters, registerType, itemData);
      }
      continue;
    }

    if (op.kind === 'register-update') {
      const { registerType, itemId, patch } = op.payload;
      if (!registerType || !itemId || !patch) continue;
      if (hasRegisterItem(nextRegisters, registerType, itemId)) {
        nextRegisters = patchRegisterItemInState(
          nextRegisters,
          registerType,
          itemId,
          patch,
          patch.updatedAt || op.createdAt || new Date().toISOString()
        );
      } else {
        nextRegisters = upsertRegisterItemInState(nextRegisters, registerType, {
          _id: itemId,
          ...patch,
        });
      }
      continue;
    }

    if (op.kind === 'register-delete') {
      const { registerType, itemId } = op.payload;
      if (!registerType || !itemId) continue;
      nextRegisters = deleteRegisterItemFromState(nextRegisters, registerType, itemId);
    }
  }

  return {
    ...state,
    registers: nextRegisters,
    statusReport: nextStatusReport,
    status_report: nextStatusReport,
  };
};
