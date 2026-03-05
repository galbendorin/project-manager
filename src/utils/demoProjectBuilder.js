import { calculateSchedule, getCurrentDate } from './helpers';
import { cloneDemoSeedPayload } from './demoSeedPayload';

const nowIso = () => new Date().toISOString();

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

export const buildDemoProjectPayload = () => {
  return cloneDemoSeedPayload();
};
