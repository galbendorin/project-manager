import { calculateSchedule, getCurrentDate } from './helpers';
import { DEFAULT_STATUS_REPORT } from './constants';

const nowIso = () => new Date().toISOString();

const plusDaysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const makeRegisterItem = (id, data, timestamp) => ({
  _id: id,
  public: true,
  visible: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...data
});

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

export const buildDemoProjectPayload = ({ timestamp = nowIso(), today = getCurrentDate() } = {}) => {
  const tasks = buildDemoScheduleTasks({ timestamp, startDate: today });

  const registers = {
    risks: [
      makeRegisterItem('risk_demo_1', {
        number: 1,
        category: 'Carrier',
        riskdetails: 'RFS dates for 3 circuits may slip due to access permit constraints at customer sites.',
        mitigationaction: 'Escalate permits weekly and hold backup cutover windows in migration plan.',
        notes: 'Top risk for delivery timeline.',
        raised: today,
        owner: 'Delivery Manager',
        level: 'High'
      }, timestamp),
      makeRegisterItem('risk_demo_2', {
        number: 2,
        category: 'Technical',
        riskdetails: 'Incorrect LAN segmentation mapping could impact policy rollout consistency.',
        mitigationaction: 'Run design checkpoint and pre-cutover policy validation in lab.',
        notes: 'Linked to design sign-off.',
        raised: plusDaysFromNow(1),
        owner: 'Network Architect',
        level: 'Medium'
      }, timestamp),
      makeRegisterItem('risk_demo_3', {
        number: 3,
        category: 'Operational',
        riskdetails: 'Local site contacts may be unavailable during planned change windows.',
        mitigationaction: 'Confirm contacts in Comms Plan and send 72h/24h reminders.',
        notes: 'Can delay same-day cutovers.',
        raised: plusDaysFromNow(2),
        owner: 'Project Manager',
        level: 'Medium'
      }, timestamp)
    ],
    issues: [
      makeRegisterItem('issue_demo_1', {
        number: 1,
        issueassignedto: 'Carrier Service Desk',
        description: 'Site 4 handoff device delivered with wrong port profile.',
        currentstatus: 'Replacement requested and ETA confirmed.',
        status: 'In Progress',
        raised: today,
        target: plusDaysFromNow(3),
        update: plusDaysFromNow(1),
        completed: ''
      }, timestamp),
      makeRegisterItem('issue_demo_2', {
        number: 2,
        issueassignedto: 'Customer Firewall Team',
        description: 'NAT exemption missing for orchestrator API reachability from pilot site.',
        currentstatus: 'Change request approved and scheduled.',
        status: 'Open',
        raised: plusDaysFromNow(1),
        target: plusDaysFromNow(4),
        update: plusDaysFromNow(2),
        completed: ''
      }, timestamp),
      makeRegisterItem('issue_demo_3', {
        number: 3,
        issueassignedto: 'Field Engineer',
        description: 'Site 2 CPE rack space blocked by legacy equipment.',
        currentstatus: 'Relocation completed and install resumed.',
        status: 'Completed',
        raised: plusDaysFromNow(-2),
        target: today,
        update: today,
        completed: today
      }, timestamp)
    ],
    actions: [
      makeRegisterItem('action_demo_1', {
        number: 1,
        category: 'Delivery',
        actionassignedto: 'PMO',
        description: 'Publish weekly circuit readiness dashboard to steering team.',
        currentstatus: 'Drafted',
        status: 'In Progress',
        raised: today,
        target: plusDaysFromNow(2),
        update: plusDaysFromNow(1),
        completed: ''
      }, timestamp),
      makeRegisterItem('action_demo_2', {
        number: 2,
        category: 'Design',
        actionassignedto: 'Network Architect',
        description: 'Finalize QoS profile mapping for voice and business-critical apps.',
        currentstatus: 'Awaiting customer confirmation.',
        status: 'Open',
        raised: plusDaysFromNow(1),
        target: plusDaysFromNow(5),
        update: plusDaysFromNow(1),
        completed: ''
      }, timestamp),
      makeRegisterItem('action_demo_3', {
        number: 3,
        category: 'Cutover',
        actionassignedto: 'Operations Lead',
        description: 'Run pilot rollback drill and evidence capture.',
        currentstatus: 'Executed in lab.',
        status: 'Completed',
        raised: plusDaysFromNow(-1),
        target: today,
        update: today,
        completed: today
      }, timestamp)
    ],
    minutes: [
      makeRegisterItem('minutes_demo_1', {
        number: 1,
        dateraised: today,
        minutedescription: 'Steering committee approved two-wave migration model and freeze window.',
        status: 'Approved'
      }, timestamp),
      makeRegisterItem('minutes_demo_2', {
        number: 2,
        dateraised: plusDaysFromNow(2),
        minutedescription: 'Carrier confirmed expedited delivery for Sites 1, 2, and 3.',
        status: 'Noted'
      }, timestamp)
    ],
    costs: [
      makeRegisterItem('cost_demo_1', {
        number: 1,
        costdescription: 'Out-of-hours migration support - Wave 1',
        dateraised: today,
        sitename: 'Regional Hub',
        cost: '1800',
        tobechargedto: 'Project Budget',
        acceptedby: 'Finance Controller',
        date: plusDaysFromNow(2),
        billing: 'Pending'
      }, timestamp),
      makeRegisterItem('cost_demo_2', {
        number: 2,
        costdescription: 'Additional site survey visit',
        dateraised: plusDaysFromNow(1),
        sitename: 'Site 4',
        cost: '450',
        tobechargedto: 'Change Budget',
        acceptedby: 'Project Sponsor',
        date: plusDaysFromNow(3),
        billing: 'Approved'
      }, timestamp),
      makeRegisterItem('cost_demo_3', {
        number: 3,
        costdescription: 'Temporary LTE backup during circuit delay',
        dateraised: plusDaysFromNow(2),
        sitename: 'Site 7',
        cost: '320',
        tobechargedto: 'Operations',
        acceptedby: 'Service Manager',
        date: plusDaysFromNow(4),
        billing: 'In Review'
      }, timestamp)
    ],
    changes: [
      makeRegisterItem('change_demo_1', {
        number: 1,
        category: 'Scope',
        assignedto: 'Project Manager',
        description: 'Include guest Wi-Fi breakout policy in phase 2 rollout.',
        impactstatus: 'Low time impact, medium design impact.',
        status: 'Under Review',
        raised: today,
        target: plusDaysFromNow(5),
        updated: plusDaysFromNow(1),
        complete: ''
      }, timestamp),
      makeRegisterItem('change_demo_2', {
        number: 2,
        category: 'Schedule',
        assignedto: 'Delivery Manager',
        description: 'Move Wave 2 cutover from Friday to Sunday maintenance window.',
        impactstatus: 'No cost impact, improved business continuity.',
        status: 'Approved',
        raised: plusDaysFromNow(1),
        target: plusDaysFromNow(6),
        updated: plusDaysFromNow(2),
        complete: ''
      }, timestamp),
      makeRegisterItem('change_demo_3', {
        number: 3,
        category: 'Technical',
        assignedto: 'Network Architect',
        description: 'Raise underlay MTU baseline from 1500 to 1600 for encapsulation overhead.',
        impactstatus: 'Requires edge validation at 2 pilot sites.',
        status: 'Implemented',
        raised: plusDaysFromNow(-1),
        target: today,
        updated: today,
        complete: today
      }, timestamp)
    ],
    comms: [
      makeRegisterItem('comms_demo_1', {
        company: 'Customer IT',
        name: 'Emma Lewis',
        position: 'Program Sponsor',
        mobile: '+44 7700 900101',
        phone: '+44 20 7000 0001',
        email: 'emma.lewis@example.com'
      }, timestamp),
      makeRegisterItem('comms_demo_2', {
        company: 'Carrier One',
        name: 'Amit Patel',
        position: 'Service Delivery Lead',
        mobile: '+44 7700 900102',
        phone: '+44 20 7000 0002',
        email: 'amit.patel@example.com'
      }, timestamp),
      makeRegisterItem('comms_demo_3', {
        company: 'Delivery Partner',
        name: 'Sara Ahmed',
        position: 'Project Manager',
        mobile: '+44 7700 900103',
        phone: '+44 20 7000 0003',
        email: 'sara.ahmed@example.com'
      }, timestamp)
    ]
  };

  const tracker = [
    {
      _id: 'tracker_demo_1',
      taskId: 9,
      taskName: 'SD-WAN controller templates and policy objects built',
      notes: 'Policy package v0.9 ready for customer review.',
      status: 'In Progress',
      rag: 'Amber',
      nextAction: 'Close open app-priority mapping questions.',
      owner: 'Network Architect',
      dateAdded: today,
      lastUpdated: plusDaysFromNow(1),
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      _id: 'tracker_demo_2',
      taskId: 15,
      taskName: 'Site 1 - Ethernet circuit install and light-level test',
      notes: 'Waiting for carrier final acceptance report.',
      status: 'On Hold',
      rag: 'Red',
      nextAction: 'Carrier escalation on delayed closure note.',
      owner: 'Carrier Delivery Lead',
      dateAdded: plusDaysFromNow(-1),
      lastUpdated: today,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      _id: 'tracker_demo_3',
      taskId: 37,
      taskName: 'Pilot site cutover and rollback validation',
      notes: 'Cutover checklist approved by CAB.',
      status: 'Not Started',
      rag: 'Green',
      nextAction: 'Run pre-check 24h before pilot window.',
      owner: 'Operations Lead',
      dateAdded: plusDaysFromNow(1),
      lastUpdated: plusDaysFromNow(1),
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];

  const status_report = {
    ...DEFAULT_STATUS_REPORT,
    overallRag: 'Amber',
    overallNarrative: 'Program is on track with active carrier dependency management across remaining circuits.',
    mainRisks: 'Access permit and carrier RFS variability remain the key schedule risks.',
    mainIssues: 'One pilot-site hardware mismatch and one firewall policy dependency are being managed.',
    deliverablesThisPeriod: 'Design sign-off, ordering validation, and first install completions.',
    deliverablesNextPeriod: 'Complete remaining installs and execute pilot cutover.',
    additionalNotes: 'Demo dataset loaded for client walkthrough.'
  };

  return {
    tasks,
    registers,
    tracker,
    status_report,
    baseline: null
  };
};
