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
  Updated: 'updated', Completed: 'completed', Internal: '_internal'
};

const COLUMN_MAP_ACTIONS = {
  ID: 'number', Description: 'description', Owner: 'actionassignedto',
  'Due Date': 'target', Status: 'status', Internal: '_internal',
  'Action Assigned to': 'actionassignedto', 'Current Status': 'currentstatus',
  Raised: 'raised', Target: 'target', Completed: 'completed'
};

const COLUMN_MAP_CHANGES = {
  ID: 'number', Description: 'description', 'Raised By': 'raisedby',
  Cost: 'cost', 'Time Impact': 'timeimpact', Status: 'status', Internal: '_internal'
};

const COLUMN_MAP_COMMS = {
  ID: 'number', Stakeholder: 'stakeholder', 'Info Required': 'inforequired',
  Frequency: 'frequency', Method: 'method', Provider: 'provider', Internal: '_internal'
};

export const REGISTER_IMPORT_COLUMN_MAPS = {
  risks: COLUMN_MAP_RISKS,
  issues: COLUMN_MAP_ISSUES,
  actions: COLUMN_MAP_ACTIONS,
  changes: COLUMN_MAP_CHANGES,
  comms: COLUMN_MAP_COMMS
};

export const REGISTER_IMPORT_SHEET_CANDIDATES = {
  risks: ['Risks', 'Risk Log', 'Risk Register'],
  issues: ['Issues', 'Issue Log', 'Issue Register'],
  actions: ['Actions', 'Action Log', 'Action Register'],
  changes: ['Changes', 'Change Log', 'Change Register'],
  comms: ['Comms', 'Comms Plan', 'Communications']
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

export function parseRegisterSheet(rows, columnMap) {
  return rows.map((row, idx) => {
    const mapped = mapRow(row, columnMap);
    const isInternal = mapped._internal;
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

export function findSheet(sheetNames, candidates) {
  const lower = sheetNames.map(s => s.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return sheetNames[idx];
  }
  return null;
}
