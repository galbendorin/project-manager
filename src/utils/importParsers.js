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
  'Mitigating Action': 'mitigatingaction', Notes: 'notes',
  Raised: 'raised', Owner: 'owner', Level: 'level', Internal: '_internal'
};

const COLUMN_MAP_ISSUES = {
  ID: 'number', Category: 'category', 'Issue Assigned to': 'issueassignedto',
  Description: 'description', 'Current Status': 'currentstatus',
  Status: 'status', Raised: 'raised', Target: 'target',
  Updated: 'update', Completed: 'completed', Internal: '_internal'
};

const COLUMN_MAP_ACTIONS = {
  ID: 'number', Description: 'description', Owner: 'actionassignedto',
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
  'Validation Notes': 'validationnotes',
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
