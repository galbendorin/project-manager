import { calculateSchedule, getCurrentDate, getFinishDate, parseDateValue, toISODateString } from './helpers.js';
import { cloneDemoSeedPayload } from './demoSeedPayload.js';

const nowIso = () => new Date().toISOString();
const DEMO_SEED_START_DATE = '2025-04-07';
const DEFAULT_DEMO_ANCHOR_DATE = '2026-03-16';
const DEFAULT_DEMO_START_OFFSET_DAYS = -14;

const addCalendarDays = (value, days) => {
  const parsed = parseDateValue(value);
  if (!parsed) return '';
  const shifted = new Date(parsed);
  shifted.setDate(shifted.getDate() + days);
  return toISODateString(shifted);
};

const diffCalendarDays = (fromValue, toValue) => {
  const from = parseDateValue(fromValue);
  const to = parseDateValue(toValue);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
};

const toMiddayTimestamp = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return '';
  const stamp = new Date(parsed);
  stamp.setHours(12, 0, 0, 0);
  return stamp.toISOString();
};

const shiftNamedFields = (item, fields, offsetDays) => {
  const next = { ...item };
  fields.forEach((field) => {
    if (next[field]) {
      next[field] = addCalendarDays(next[field], offsetDays);
    }
  });
  return next;
};

const normalizeDemoTasks = (tasks, anchorDate, offsetDays) => {
  return tasks.map((task) => {
    const shiftedStart = addCalendarDays(task.start, offsetDays);
    const finishDate = getFinishDate(shiftedStart, task.dur);
    const lookbackDays = Math.max(1, Math.min(5, Number(task.dur) || 1));
    const createdDate = addCalendarDays(shiftedStart, -lookbackDays);

    let updatedDate = createdDate;
    if (Number(task.pct) === 100) {
      updatedDate = finishDate || shiftedStart;
    } else if (Number(task.pct) > 0) {
      updatedDate = shiftedStart <= anchorDate ? anchorDate : shiftedStart;
    }

    return {
      ...task,
      start: shiftedStart,
      createdAt: toMiddayTimestamp(createdDate),
      updatedAt: toMiddayTimestamp(updatedDate)
    };
  });
};

const normalizeDemoRegisters = (registers, anchorDate, offsetDays) => {
  const next = { ...registers };
  const completedActionOffsets = [-12, -8, -4];
  const upcomingActionOffsets = [3, 7, 11, 16];
  let completedActionIndex = 0;
  let upcomingActionIndex = 0;

  next.risks = (registers.risks || []).map((risk) => {
    const shifted = shiftNamedFields(risk, ['raised'], offsetDays);
    const createdDate = shifted.raised || anchorDate;
    return {
      ...shifted,
      createdAt: toMiddayTimestamp(createdDate),
      updatedAt: toMiddayTimestamp(createdDate)
    };
  });

  next.issues = (registers.issues || []).map((issue) => {
    const shifted = shiftNamedFields(issue, ['raised', 'target', 'completed', 'update'], offsetDays);
    const createdDate = shifted.raised || addCalendarDays(shifted.target || anchorDate, -7) || anchorDate;
    const updatedDate = shifted.update || shifted.completed || shifted.target || createdDate;
    return {
      ...shifted,
      createdAt: toMiddayTimestamp(createdDate),
      updatedAt: toMiddayTimestamp(updatedDate)
    };
  });

  next.actions = (registers.actions || []).map((action) => {
    const shifted = shiftNamedFields(action, ['raised', 'target', 'completed'], offsetDays);
    const normalizedStatus = String(shifted.status || '').toLowerCase();
    const isCompleted = ['completed', 'closed', 'done'].includes(normalizedStatus);

    let targetDate = shifted.target || anchorDate;
    if (isCompleted && completedActionIndex < completedActionOffsets.length) {
      targetDate = addCalendarDays(anchorDate, completedActionOffsets[completedActionIndex++]);
    } else if (!isCompleted && upcomingActionIndex < upcomingActionOffsets.length) {
      targetDate = addCalendarDays(anchorDate, upcomingActionOffsets[upcomingActionIndex++]);
    }

    const createdDate = shifted.raised || addCalendarDays(targetDate, -7) || anchorDate;
    const normalizedCompleted = isCompleted
      ? (shifted.completed || targetDate || createdDate)
      : shifted.completed;
    const updatedDate = normalizedCompleted || (normalizedStatus === 'in progress' ? anchorDate : targetDate) || createdDate;

    return {
      ...shifted,
      target: targetDate,
      raised: shifted.raised || createdDate,
      completed: normalizedCompleted || '',
      createdAt: toMiddayTimestamp(createdDate),
      updatedAt: toMiddayTimestamp(updatedDate)
    };
  });

  next.changes = (registers.changes || []).map((change) => {
    const shifted = shiftNamedFields(change, ['raised', 'target', 'updated', 'complete'], offsetDays);
    const createdDate = shifted.raised || anchorDate;
    const updatedDate = shifted.updated || shifted.complete || shifted.target || createdDate;
    return {
      ...shifted,
      createdAt: toMiddayTimestamp(createdDate),
      updatedAt: toMiddayTimestamp(updatedDate)
    };
  });

  next.minutes = (registers.minutes || []).map((minute) => shiftNamedFields(minute, ['dateraised'], offsetDays));
  next.costs = (registers.costs || []).map((cost) => shiftNamedFields(cost, ['dateraised', 'date'], offsetDays));
  next.assumptions = (registers.assumptions || []).map((item) => shiftNamedFields(item, ['dateraised'], offsetDays));
  next.decisions = (registers.decisions || []).map((item) => shiftNamedFields(item, ['dateraised', 'datedecided'], offsetDays));
  next.lessons = (registers.lessons || []).map((lesson) => shiftNamedFields(lesson, ['date'], offsetDays));

  next._raci = (registers._raci || []).map((entry) => ({
    ...entry,
    updatedAt: nowIso()
  }));

  return next;
};

const normalizeDemoTracker = (tracker, anchorDate) => {
  return (tracker || []).map((item, index) => {
    const dateAdded = addCalendarDays(anchorDate, -(6 - Math.min(index, 5)));
    const lastUpdated = addCalendarDays(anchorDate, -(2 + index));
    return {
      ...item,
      dateAdded,
      lastUpdated,
      createdAt: toMiddayTimestamp(dateAdded),
      updatedAt: toMiddayTimestamp(lastUpdated)
    };
  });
};

export const buildDemoScheduleTasks = ({ timestamp = nowIso(), startDate = getCurrentDate() } = {}) => {
  const templateData = [];
  let nextId = 1;

  const addTemplateTask = (overrides = {}) => {
    const task = {
      id: nextId++,
      name: 'New Task',
      type: 'Task',
      start: startDate,
      dur: 1,
      pct: 0,
      parent: null,
      depType: 'FS',
      indent: 0,
      tracked: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides
    };
    templateData.push(task);
    return task.id;
  };

  // 1) Program Mobilization
  addTemplateTask({ name: 'Program Mobilization', indent: 0 });
  const contractSignatureId = addTemplateTask({
    name: 'Contract signature and commercial approval',
    type: 'Milestone',
    dur: 0,
    pct: 100,
    indent: 1
  });
  const kickoffId = addTemplateTask({
    name: 'Kickoff meeting with client, delivery, and carrier teams',
    type: 'Milestone',
    dur: 0,
    pct: 100,
    parent: contractSignatureId,
    depType: 'FS',
    indent: 1
  });
  addTemplateTask({
    name: 'Governance cadence, RAID ownership, and reporting cadence agreed',
    dur: 2,
    pct: 100,
    parent: kickoffId,
    depType: 'FS',
    indent: 1
  });

  // 2) Discovery and Design
  addTemplateTask({ name: 'Discovery and Design', indent: 0 });
  const siteDataPackId = addTemplateTask({
    name: 'Site data packs collected for 10 locations',
    dur: 5,
    pct: 60,
    rowColor: 'amber',
    parent: kickoffId,
    depType: 'FS',
    indent: 1
  });
  const hldApprovedId = addTemplateTask({
    name: 'High-level SD-WAN design approved',
    type: 'Milestone',
    dur: 0,
    pct: 25,
    parent: siteDataPackId,
    depType: 'FS',
    indent: 1
  });
  const securityPolicyApprovedId = addTemplateTask({
    name: 'Security and segmentation policy approved',
    type: 'Milestone',
    dur: 0,
    pct: 0,
    parent: hldApprovedId,
    depType: 'FS',
    indent: 1
  });
  const orchestratorTemplateId = addTemplateTask({
    name: 'SD-WAN controller templates and policy objects built',
    dur: 4,
    pct: 0,
    parent: securityPolicyApprovedId,
    depType: 'FS',
    indent: 1,
    tracked: true
  });

  // 3) Carrier Ordering
  addTemplateTask({ name: 'Carrier Ordering', indent: 0 });
  const submitOrdersId = addTemplateTask({
    name: 'Submit 10 Ethernet circuit orders',
    type: 'Milestone',
    dur: 0,
    pct: 0,
    parent: hldApprovedId,
    depType: 'FS',
    indent: 1
  });
  const orderValidationId = addTemplateTask({
    name: 'Validate order references, addresses, and target RFS dates',
    dur: 3,
    pct: 0,
    rowColor: 'brown',
    parent: submitOrdersId,
    depType: 'FS',
    indent: 1,
    tracked: true
  });

  // 4) Ethernet Circuit Delivery (10 sites)
  addTemplateTask({ name: 'Ethernet Circuit Delivery (10 sites)', indent: 0 });
  const circuitInstallIds = [];

  for (let i = 1; i <= 10; i++) {
    const surveyId = addTemplateTask({
      name: `Site ${i} - Access survey and LOA confirmed`,
      dur: 2,
      pct: 0,
      parent: orderValidationId,
      depType: 'FS',
      indent: 1
    });

    const installId = addTemplateTask({
      name: `Site ${i} - Ethernet circuit install and light-level test`,
      dur: 3,
      pct: i === 1 ? 100 : i === 2 ? 45 : 0,
      rowColor: i === 4 ? 'red' : undefined,
      parent: surveyId,
      depType: 'FS',
      indent: 1,
      tracked: true
    });

    circuitInstallIds.push(installId);
  }

  const circuitsDeliveredId = addTemplateTask({
    name: 'All 10 Ethernet circuits delivered',
    type: 'Milestone',
    dur: 0,
    pct: 0,
    indent: 1,
    dependencies: circuitInstallIds.map((installId) => ({ parentId: installId, depType: 'FS' })),
    depLogic: 'ALL'
  });

  // 5) SD-WAN Migration and Handover
  addTemplateTask({ name: 'SD-WAN Migration and Handover', indent: 0 });
  const migrationReadinessId = addTemplateTask({
    name: 'Migration readiness gate (templates + circuits complete)',
    type: 'Milestone',
    dur: 0,
    pct: 0,
    indent: 1,
    dependencies: [
      { parentId: orchestratorTemplateId, depType: 'FS' },
      { parentId: circuitsDeliveredId, depType: 'FS' }
    ],
    depLogic: 'ALL'
  });
  const pilotCutoverId = addTemplateTask({
    name: 'Pilot site cutover and rollback validation',
    dur: 2,
    pct: 0,
    parent: migrationReadinessId,
    depType: 'FS',
    indent: 1,
    tracked: true
  });
  const waveOneCutoverId = addTemplateTask({
    name: 'Cutover Wave 1 (4 sites)',
    dur: 4,
    pct: 0,
    parent: pilotCutoverId,
    depType: 'FS',
    indent: 1,
    tracked: true
  });
  const waveTwoCutoverId = addTemplateTask({
    name: 'Cutover Wave 2 (6 sites)',
    dur: 6,
    pct: 0,
    parent: waveOneCutoverId,
    depType: 'FS',
    indent: 1,
    tracked: true
  });
  const serviceAcceptanceId = addTemplateTask({
    name: 'Service acceptance signed by customer',
    type: 'Milestone',
    dur: 0,
    pct: 0,
    parent: waveTwoCutoverId,
    depType: 'FS',
    indent: 1
  });
  addTemplateTask({
    name: 'Hypercare complete and handover to BAU operations',
    type: 'Milestone',
    dur: 0,
    pct: 0,
    parent: serviceAcceptanceId,
    depType: 'FS',
    indent: 1
  });

  return calculateSchedule(templateData);
};

export const buildDemoProjectPayload = ({
  anchorDate = DEFAULT_DEMO_ANCHOR_DATE,
  startOffsetDays = DEFAULT_DEMO_START_OFFSET_DAYS
} = {}) => {
  const payload = cloneDemoSeedPayload();
  const demoStartDate = addCalendarDays(anchorDate, startOffsetDays);
  const offsetDays = diffCalendarDays(DEMO_SEED_START_DATE, demoStartDate);

  payload.tasks = normalizeDemoTasks(payload.tasks || [], anchorDate, offsetDays);
  payload.registers = normalizeDemoRegisters(payload.registers || {}, anchorDate, offsetDays);
  payload.tracker = normalizeDemoTracker(payload.tracker || [], anchorDate);

  return payload;
};
