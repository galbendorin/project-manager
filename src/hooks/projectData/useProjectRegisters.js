import { useCallback } from 'react';
import { SCHEMAS } from '../../utils/constants';
import { buildProjectSyncOp } from './projectSync';
import {
  buildRegisterItem,
  updateRegisterItemInState,
  deleteRegisterItemFromState,
  toggleRegisterItemPublicInState,
} from './registers';

const STATUS_REPORT_FIELD_LABELS = {
  overallRag: 'Overall RAG',
  overallNarrative: 'Overall narrative',
  mainRisks: 'Main risks',
  mainIssues: 'Main issues',
  deliverablesThisPeriod: 'Deliverables this period',
  deliverablesNextPeriod: 'Deliverables next period',
  additionalNotes: 'Additional notes',
};

export function useProjectRegisters({
  now,
  queueProjectSyncOp,
  registers,
  setRegisters,
  setStatusReport,
}) {
  const updateStatusReport = useCallback((key, value) => {
    setStatusReport((prev) => ({ ...prev, [key]: value }));
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'status-update',
      targetKey: `status:${key}`,
      label: `Updated ${STATUS_REPORT_FIELD_LABELS[key] || key}`,
      detail: 'Will sync to the project summary when saved.',
      payload: { key, value },
    }));
  }, [queueProjectSyncOp, setStatusReport]);

  const addRegisterItem = useCallback((registerType, itemData = {}) => {
    const ts = now();
    const existingItems = Array.isArray(registers[registerType]) ? registers[registerType] : [];
    const createdItem = buildRegisterItem(registerType, existingItems, itemData, ts);
    if (!createdItem) return null;

    setRegisters((prev) => ({
      ...prev,
      [registerType]: [...(prev[registerType] || []), createdItem],
    }));

    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-add',
      targetKey: `register:${registerType}:${createdItem._id}`,
      label: `Added ${title} item`,
      detail: createdItem.description || createdItem.riskdetails || createdItem.decision || createdItem.minutedescription || createdItem.issue || '',
      createdAt: ts,
      payload: {
        registerType,
        itemData: createdItem,
      },
    }));

    return createdItem;
  }, [now, queueProjectSyncOp, registers, setRegisters]);

  const addRegisterItems = useCallback((registerType, itemsData = []) => {
    const entries = Array.isArray(itemsData) ? itemsData : [];
    if (entries.length === 0) return [];

    const ts = now();
    const existingItems = Array.isArray(registers[registerType]) ? [...registers[registerType]] : [];
    const createdItems = [];

    for (const itemData of entries) {
      const nextItem = buildRegisterItem(registerType, [...existingItems, ...createdItems], itemData, ts);
      if (nextItem) createdItems.push(nextItem);
    }

    if (createdItems.length === 0) return [];

    setRegisters((prev) => ({
      ...prev,
      [registerType]: [...(prev[registerType] || []), ...createdItems],
    }));

    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-add',
      targetKey: `register:${registerType}:batch:${createdItems.map((item) => item._id).join(',')}`,
      label: `Added ${createdItems.length} ${title} item${createdItems.length === 1 ? '' : 's'}`,
      detail: createdItems.length === 1
        ? (createdItems[0].description || createdItems[0].riskdetails || createdItems[0].decision || createdItems[0].minutedescription || '')
        : '',
      createdAt: ts,
      payload: {
        registerType,
        itemsData: createdItems,
      },
    }));

    return createdItems;
  }, [now, queueProjectSyncOp, registers, setRegisters]);

  const updateRegisterItem = useCallback((registerType, itemId, key, value) => {
    const ts = now();
    setRegisters((prev) => updateRegisterItemInState(prev, registerType, itemId, key, value, ts));
    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-update',
      targetKey: `register:${registerType}:${itemId}`,
      label: `Updated ${title}`,
      detail: `${key} changed`,
      createdAt: ts,
      payload: {
        registerType,
        itemId,
        patch: {
          [key]: value,
          updatedAt: ts,
        },
      },
    }));
  }, [now, queueProjectSyncOp, setRegisters]);

  const deleteRegisterItem = useCallback((registerType, itemId) => {
    const deletedItem = (registers[registerType] || []).find((item) => item._id === itemId) || null;
    setRegisters((prev) => deleteRegisterItemFromState(prev, registerType, itemId));
    if (deletedItem) {
      const title = SCHEMAS[registerType]?.title || 'Register';
      queueProjectSyncOp(buildProjectSyncOp({
        kind: 'register-delete',
        targetKey: `register:${registerType}:${itemId}:delete`,
        label: `Deleted ${title} item`,
        detail: deletedItem.description || deletedItem.riskdetails || deletedItem.decision || deletedItem.minutedescription || '',
        payload: {
          registerType,
          itemId,
        },
      }));
    }
    return deletedItem;
  }, [queueProjectSyncOp, registers, setRegisters]);

  const restoreRegisterItem = useCallback((registerType, itemData) => {
    if (!itemData?._id) return null;
    if ((registers[registerType] || []).some((item) => item._id === itemData._id)) return itemData;

    const restoredItem = {
      ...itemData,
      updatedAt: now(),
    };

    setRegisters((prev) => ({
      ...prev,
      [registerType]: [...(prev[registerType] || []), restoredItem],
    }));

    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-add',
      targetKey: `register:${registerType}:${restoredItem._id}:restore`,
      label: `Restored ${title} item`,
      detail: restoredItem.description || restoredItem.riskdetails || restoredItem.decision || restoredItem.minutedescription || '',
      payload: {
        registerType,
        itemData: restoredItem,
      },
    }));

    return restoredItem;
  }, [now, queueProjectSyncOp, registers, setRegisters]);

  const toggleItemPublic = useCallback((registerType, itemId) => {
    const ts = now();
    const currentItem = (registers[registerType] || []).find((item) => item._id === itemId) || null;
    setRegisters((prev) => toggleRegisterItemPublicInState(prev, registerType, itemId, ts));
    const title = SCHEMAS[registerType]?.title || 'Register';
    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-update',
      targetKey: `register:${registerType}:${itemId}:visibility`,
      label: `Updated ${title} visibility`,
      detail: 'Visibility changed',
      createdAt: ts,
      payload: {
        registerType,
        itemId,
        patch: {
          public: currentItem ? !currentItem.public : true,
          updatedAt: ts,
        },
      },
    }));
  }, [now, queueProjectSyncOp, registers, setRegisters]);

  const updateRaciData = useCallback((assignments, roles) => {
    const ts = now();
    const currentRaci = registers._raci?.[0] || {};
    const nextRaciItem = {
      ...currentRaci,
      _id: currentRaci._id || 'raci_matrix',
      assignments,
      roles,
      updatedAt: ts,
    };

    setRegisters((prev) => ({
      ...prev,
      _raci: [nextRaciItem],
    }));

    queueProjectSyncOp(buildProjectSyncOp({
      kind: 'register-update',
      targetKey: 'register:_raci:raci_matrix',
      label: 'Updated RACI',
      detail: 'RACI assignments changed',
      createdAt: ts,
      payload: {
        registerType: '_raci',
        itemId: nextRaciItem._id,
        patch: nextRaciItem,
      },
    }));
  }, [now, queueProjectSyncOp, registers, setRegisters]);

  return {
    addRegisterItem,
    addRegisterItems,
    updateRegisterItem,
    deleteRegisterItem,
    restoreRegisterItem,
    toggleItemPublic,
    updateRaciData,
    updateStatusReport,
  };
}
