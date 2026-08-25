let xlsxModulePromise = null;

export async function loadXLSX() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx').catch((err) => {
      xlsxModulePromise = null;
      throw err;
    });
  }
  const module = await xlsxModulePromise;
  return module.default?.utils ? module.default : module;
}

const COLUMN_MAP_SCHEDULE = {
  id: 'id', name: 'name', type: 'type', parent: 'parent',
  deptype: 'depType', depType: 'depType', dur: 'dur', start: 'start',
  pct: 'pct', indent: 'indent', tracked: 'tracked',
  ID: 'id', Name: 'name', Type: 'type', Parent: 'parent',
  'Dependency Type': 'depType', Duration: 'dur', Start: 'start',
  '% Complete': 'pct', 'Indent Level': 'indent',
  'Start Date': 'start', Progress: 'pct',
  'Job Name': 'name', 'Task Name': 'name'
};

const COLUMN_MAP_RISKS = {
  ID: 'number', Category: 'category', 'Risk Details': 'riskdetails',
  'Mitigating Action': 'mitigatingaction', 'Mitigation Action': 'mitigatingaction', Notes: 'notes',
  Raised: 'raised', Owner: 'owner', Level: 'level', Internal: '_internal'
};

const COLUMN_MAP_ISSUES = {
  ID: 'number', Category: 'category', 'Issue Assigned to': 'issueassignedto',
  Description: 'description', 'Current Status': 'currentstatus',
  Status: 'status', Raised: 'raised', Target: 'target',
  Updated: 'update', Completed: 'completed', Internal: '_internal'
};

const COLUMN_MAP_ACTIONS = {
  ID: 'number', Category: 'category', Description: 'description', Owner: 'actionassignedto',
  'Due Date': 'target', Status: 'status', Internal: '_internal',
  'Action Assigned to': 'actionassignedto', 'Current Status': 'currentstatus',
  Raised: 'raised', Target: 'target', Updated: 'update', Completed: 'completed'
};

const COLUMN_MAP_TODOS = {
  ID: 'id',
  Title: 'title',
  'Task Name': 'title',
  Description: 'title',
  'Due Date': 'dueDate',
  Owner: 'owner',
  Status: 'status',
  Recurrence: 'recurrence',
  Frequency: 'recurrence'
};

const COLUMN_MAP_CHANGES = {
  Number: 'number', ID: 'number',
  Category: 'category',
  'Assigned to': 'assignedto',
  Description: 'description',
  'Impact/Status': 'impactstatus',
  Status: 'status',
  Raised: 'raised',
  Target: 'target',
  Updated: 'updated',
  Complete: 'complete',
  Internal: '_internal'
};

const COLUMN_MAP_COMMS = {
  Number: 'number', ID: 'number',
  Company: 'company',
  Name: 'name',
  Position: 'position',
  Mobile: 'mobile',
  Phone: 'phone',
  Email: 'email',
  Internal: '_internal'
};

const COLUMN_MAP_MINUTES = {
  Number: 'number', ID: 'number',
  'Date Raised': 'dateraised',
  'Minute Description': 'minutedescription',
  Status: 'status',
  Internal: '_internal'
};

const COLUMN_MAP_COSTS = {
  Number: 'number', ID: 'number',
  'Cost Description': 'costdescription',
  'Date Raised': 'dateraised',
  'Site Name': 'sitename',
  Cost: 'cost',
  'To be charged to': 'tobechargedto',
  'Accepted by': 'acceptedby',
  Date: 'date',
  Billing: 'billing',
  Internal: '_internal'
};

const COLUMN_MAP_STAKEHOLDERS = {
  Number: 'number', ID: 'number',
  Name: 'name',
  Organisation: 'organisation',
  Role: 'role',
  Email: 'email',
  Phone: 'phone',
  Mobile: 'mobile',
  'Escalation Level': 'escalationlevel',
  Internal: '_internal'
};

const COLUMN_MAP_COMMSPLAN = {
  Number: 'number', ID: 'number',
  Audience: 'audience',
  'Meeting Type': 'meetingtype',
  'Information Required': 'informationrequired',
  Frequency: 'frequency',
  'Day/Time': 'daytime',
  Method: 'method',
  Owner: 'owner',
  Template: 'template',
  Internal: '_internal'
};

const COLUMN_MAP_ASSUMPTIONS = {
  Number: 'number', ID: 'number',
  Type: 'type',
  Description: 'description',
  'Raised By': 'raisedby',
  'Date Raised': 'dateraised',
  Impact: 'impact',
  Status: 'status',
  'Validation Notes': 'validationnotes', 'Validation/Notes': 'validationnotes',
  Owner: 'owner',
  Internal: '_internal'
};

const COLUMN_MAP_DECISIONS = {
  Number: 'number', ID: 'number',
  Decision: 'decision',
  'Decided By': 'decidedby',
  'Date Raised': 'dateraised',
  'Date Decided': 'datedecided',
  Rationale: 'rationale',
  Impact: 'impact',
  Status: 'status',
  Internal: '_internal'
};

const COLUMN_MAP_LESSONS = {
  Number: 'number', ID: 'number',
  Date: 'date',
  Phase: 'phase',
  Category: 'category',
  Description: 'description',
  'What Went Well': 'whatwentwell',
  'What Could Improve': 'whatcouldimprove',
  Recommendation: 'recommendation',
  Owner: 'owner',
  Status: 'status',
  Internal: '_internal'
};

const COLUMN_MAP_TRACKER = {
  ID: '_id',
  'Task ID': 'taskId',
  'Task Name': 'taskName',
  Notes: 'notes',
  Status: 'status',
  RAG: 'rag',
  'Next Action': 'nextAction',
  Owner: 'owner',
  'Date Added': 'dateAdded',
  'Last Updated': 'lastUpdated'
};

const COLUMN_MAP_STATUS_REPORT = {
  'Overall RAG': 'overallRag',
  'Overall Narrative': 'overallNarrative',
  'Main Risks': 'mainRisks',
  'Main Issues': 'mainIssues',
  'Deliverables This Period': 'deliverablesThisPeriod',
  'Deliverables Next Period': 'deliverablesNextPeriod',
  'Additional Notes': 'additionalNotes'
};

export const REGISTER_IMPORT_COLUMN_MAPS = {
  risks: COLUMN_MAP_RISKS,
  issues: COLUMN_MAP_ISSUES,
  actions: COLUMN_MAP_ACTIONS,
  changes: COLUMN_MAP_CHANGES,
  comms: COLUMN_MAP_COMMS,
  minutes: COLUMN_MAP_MINUTES,
  costs: COLUMN_MAP_COSTS,
  stakeholders: COLUMN_MAP_STAKEHOLDERS,
  commsplan: COLUMN_MAP_COMMSPLAN,
  assumptions: COLUMN_MAP_ASSUMPTIONS,
  decisions: COLUMN_MAP_DECISIONS,
  lessons: COLUMN_MAP_LESSONS
};

export const REGISTER_IMPORT_SHEET_CANDIDATES = {
  risks: ['Risks', 'Risk Log', 'Risk Register'],
  issues: ['Issues', 'Issue Log', 'Issue Register'],
  actions: ['Actions', 'Action Log', 'Action Register'],
  changes: ['Changes', 'Change Log', 'Change Register'],
  comms: ['Comms', 'Comms Plan', 'Communications'],
  minutes: ['Minutes', 'Minutes Log', 'Meeting Minutes'],
  costs: ['Costs', 'Cost Register', 'Cost Log'],
  stakeholders: ['Stakeholders', 'Stakeholder Register', 'Stakeholder Log'],
  commsplan: ['Comms Plan', 'Communication Plan', 'Communications Plan'],
  assumptions: ['Assumptions', 'Assumptions Log', 'Assumptions & Dependencies'],
  decisions: ['Decisions', 'Decision Log', 'Decision Register'],
  lessons: ['Lessons Learned', 'Lessons', 'Lessons Log']
};

export const TODO_IMPORT_SHEET_CANDIDATES = ['ToDo', 'Todo', 'To Do', 'Task List', 'Manual Tasks'];

export const RACI_IMPORT_SHEET_CANDIDATES = ['RACI', 'RACI Matrix'];

export const TRACKER_IMPORT_SHEET_CANDIDATES = ['Master Tracker', 'Tracker'];

export const STATUS_REPORT_IMPORT_SHEET_CANDIDATES = ['Status Report', 'Project Status'];

export const PM_WORKSPACE_IMPORT_FORMAT = 'pmworkspace-project-import-v1';

const WORKSPACE_REGISTER_KEYS = [
  'risks', 'issues', 'actions', 'minutes', 'costs', 'changes',
  'stakeholders', 'commsplan', 'assumptions', 'decisions', 'lessons'
];

const STATUS_REPORT_KEYS = [
  'overallRag', 'overallNarrative', 'mainRisks', 'mainIssues',
  'deliverablesThisPeriod', 'deliverablesNextPeriod', 'additionalNotes'
];

const RACI_ACTIVITY_COLUMN_CANDIDATES = [
  'Activity',
  'Activity / Deliverable',
  'Task',
  'Task Name',
  'Deliverable'
];

const RACI_IMPORT_KEYS = ['R', 'A', 'C', 'I'];

const normalizeRaciValue = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  const selected = RACI_IMPORT_KEYS.filter((key) => normalized.includes(key));
  return selected.join('/');
};

function mapRow(row, columnMap) {
  const mapped = {};
  Object.entries(row).forEach(([key, value]) => {
    const mappedKey = columnMap[key] || columnMap[key.trim()];
    if (mappedKey) {
      mapped[mappedKey] = value;
    }
  });
  return mapped;
}

export function parseBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (['true', 'yes', 'y', '1', 'x', 'checked'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'off', 'unchecked'].includes(normalized)) return false;
  return false;
}

export function parseScheduleSheet(rows) {
  return rows.map((row, idx) => {
    const mapped = mapRow(row, COLUMN_MAP_SCHEDULE);
    return {
      id: parseInt(mapped.id) || (idx + 1),
      name: String(mapped.name || `Task ${idx + 1}`),
      type: mapped.type === 'Milestone' ? 'Milestone' : 'Task',
      parent: mapped.parent ? parseInt(mapped.parent) : null,
      depType: mapped.depType || 'FS',
      dur: parseInt(mapped.dur) || 0,
      start: String(mapped.start || new Date().toISOString().split('T')[0]),
      pct: parseInt(mapped.pct) || 0,
      indent: parseInt(mapped.indent) || 0,
      tracked: parseBooleanLike(mapped.tracked)
    };
  }).filter(t => t.name && t.name.trim());
}

const normalizeTodoStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['done', 'complete', 'completed', 'closed', 'resolved'].includes(normalized) ? 'Done' : 'Open';
};

export function parseTodoSheet(rows) {
  return rows.map((row) => {
    const mapped = mapRow(row, COLUMN_MAP_TODOS);
    const title = String(mapped.title || '').trim();
    if (!title) return null;

    return {
      title,
      dueDate: mapped.dueDate ? String(mapped.dueDate).trim() : '',
      owner: mapped.owner ? String(mapped.owner).trim() : '',
      status: normalizeTodoStatus(mapped.status),
      recurrence: mapped.recurrence ? String(mapped.recurrence).trim() : null
    };
  }).filter(Boolean);
}

export function parseTrackerSheet(rows, { nowIso = new Date().toISOString() } = {}) {
  return rows.map((row, idx) => {
    const mapped = mapRow(row, COLUMN_MAP_TRACKER);
    const taskName = String(mapped.taskName || '').trim();
    if (!taskName) return null;

    const normalizedStatus = String(mapped.status || '').trim();
    const normalizedRag = String(mapped.rag || '').trim();
    const taskId = parseInt(mapped.taskId, 10);

    return {
      _id: String(mapped._id || `tracker_import_${idx + 1}`),
      taskId: Number.isFinite(taskId) ? taskId : null,
      taskName,
      rowColor: null,
      notes: String(mapped.notes || '').trim(),
      status: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'].includes(normalizedStatus)
        ? normalizedStatus
        : 'Not Started',
      rag: ['Green', 'Amber', 'Red'].includes(normalizedRag) ? normalizedRag : 'Green',
      nextAction: String(mapped.nextAction || '').trim(),
      owner: String(mapped.owner || '').trim(),
      dateAdded: String(mapped.dateAdded || '').trim(),
      lastUpdated: String(mapped.lastUpdated || '').trim(),
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }).filter(Boolean);
}

export function parseStatusReportSheet(rows) {
  const firstRow = Array.isArray(rows) ? rows[0] : null;
  if (!firstRow || typeof firstRow !== 'object') return null;

  const mapped = mapRow(firstRow, COLUMN_MAP_STATUS_REPORT);
  if (Object.keys(mapped).length === 0) return null;

  return Object.fromEntries(
    Object.entries(mapped).map(([key, value]) => [key, String(value ?? '').trim()])
  );
}

export function parseWorkspaceJsonImport(payload, { nowIso = new Date().toISOString() } = {}) {
  if (!payload || typeof payload !== 'object' || payload.format !== PM_WORKSPACE_IMPORT_FORMAT) {
    throw new Error('Unsupported PM Workspace import file.');
  }

  const tasks = parseScheduleSheet(Array.isArray(payload.tasks) ? payload.tasks : []);
  if (tasks.length === 0) {
    throw new Error('The PM Workspace import file has no schedule tasks.');
  }

  const sourceRegisters = payload.registers && typeof payload.registers === 'object'
    ? payload.registers
    : {};
  const registers = Object.fromEntries(WORKSPACE_REGISTER_KEYS.map((key) => {
    const rows = Array.isArray(sourceRegisters[key]) ? sourceRegisters[key] : [];
    return [key, rows
      .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
      .map((row, idx) => ({
        ...row,
        _id: String(row._id || row.number || `${key}_${idx + 1}`),
        number: parseInt(row.number, 10) || (idx + 1),
        visible: row.visible !== false,
        public: row.public !== false,
      }))];
  }));

  const sourceRaci = Array.isArray(sourceRegisters._raci) ? sourceRegisters._raci[0] : null;
  const roles = Array.isArray(sourceRaci?.roles)
    ? sourceRaci.roles.map((role) => String(role || '').trim()).filter(Boolean)
    : [];
  const customTasks = Array.isArray(sourceRaci?.assignments?._customTasks)
    ? sourceRaci.assignments._customTasks.map((task) => String(task || '').trim()).filter(Boolean)
    : [];
  registers._raci = roles.length > 0 && customTasks.length > 0
    ? [{
        _id: String(sourceRaci?._id || 'raci_matrix'),
        roles,
        assignments: {
          ...(sourceRaci.assignments || {}),
          _customTasks: customTasks,
        },
        updatedAt: nowIso,
      }]
    : [];

  const tracker = (Array.isArray(payload.tracker) ? payload.tracker : [])
    .filter((item) => item && typeof item === 'object' && String(item.taskName || '').trim())
    .map((item, idx) => {
      const taskId = parseInt(item.taskId, 10);
      return {
        _id: String(item._id || `tracker_import_${idx + 1}`),
        taskId: Number.isFinite(taskId) ? taskId : null,
        taskName: String(item.taskName).trim(),
        rowColor: item.rowColor || null,
        notes: String(item.notes || '').trim(),
        status: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'].includes(item.status)
          ? item.status
          : 'Not Started',
        rag: ['Green', 'Amber', 'Red'].includes(item.rag) ? item.rag : 'Green',
        nextAction: String(item.nextAction || '').trim(),
        owner: String(item.owner || '').trim(),
        dateAdded: String(item.dateAdded || '').trim(),
        lastUpdated: String(item.lastUpdated || '').trim(),
        createdAt: item.createdAt || nowIso,
        updatedAt: item.updatedAt || nowIso,
      };
    });

  const sourceStatusReport = payload.status_report && typeof payload.status_report === 'object'
    ? payload.status_report
    : {};
  const statusReport = Object.fromEntries(STATUS_REPORT_KEYS.map((key) => [
    key,
    String(sourceStatusReport[key] ?? '').trim()
  ]));

  const todos = (Array.isArray(payload.todos) ? payload.todos : [])
    .map((item) => {
      const title = String(item?.title || '').trim();
      if (!title) return null;
      return {
        title,
        dueDate: String(item.dueDate || '').trim(),
        owner: String(item.owner || '').trim(),
        status: normalizeTodoStatus(item.status),
        recurrence: item.recurrence ? String(item.recurrence).trim() : null,
      };
    })
    .filter(Boolean);

  return {
    tasks,
    registers,
    tracker,
    statusReport,
    todos,
  };
}

export function parseRegisterSheet(rows, columnMap) {
  return rows.map((row, idx) => {
    const mapped = mapRow(row, columnMap);
    const isInternal = parseBooleanLike(mapped._internal);
    delete mapped._internal;
    return {
      _id: String(mapped.number || Date.now() + idx),
      number: parseInt(mapped.number) || (idx + 1),
      visible: true,
      public: !isInternal,
      ...mapped
    };
  });
}

export function parseRaciSheet(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const firstRow = rows.find((row) => row && typeof row === 'object');
  if (!firstRow) return null;

  const headers = Object.keys(firstRow);
  if (headers.length === 0) return null;

  const activityHeader = headers.find((header) => {
    const normalized = String(header || '').trim().toLowerCase();
    return RACI_ACTIVITY_COLUMN_CANDIDATES.some((candidate) => candidate.toLowerCase() === normalized);
  }) || headers[0];

  const roles = headers
    .filter((header) => header !== activityHeader)
    .map((header) => String(header || '').trim())
    .filter(Boolean);

  if (roles.length === 0) return null;

  const customTasks = [];
  const assignments = {};

  rows.forEach((row) => {
    const rawTask = row?.[activityHeader];
    const taskName = String(rawTask ?? '').trim();
    if (!taskName) return;

    const taskId = `custom-${customTasks.length}`;
    customTasks.push(taskName);

    roles.forEach((role) => {
      const value = normalizeRaciValue(row?.[role]);
      if (value) assignments[`${taskId}::${role}`] = value;
    });
  });

  if (customTasks.length === 0) return null;

  assignments._customTasks = customTasks;

  return {
    roles,
    assignments
  };
}

export function findSheet(sheetNames, candidates) {
  const lower = sheetNames.map(s => s.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return sheetNames[idx];
  }
  return null;
}
