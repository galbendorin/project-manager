import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBooleanLike,
  parseScheduleSheet,
  parseTodoSheet,
  parseRegisterSheet,
  parseRaciSheet,
  parseStatusReportSheet,
  parseTrackerSheet,
  parseWorkspaceJsonImport,
  findSheet,
  REGISTER_IMPORT_COLUMN_MAPS
} from './importParsers.js';

test('parseBooleanLike handles common spreadsheet values', () => {
  assert.equal(parseBooleanLike(true), true);
  assert.equal(parseBooleanLike(1), true);
  assert.equal(parseBooleanLike('YES'), true);
  assert.equal(parseBooleanLike('x'), true);
  assert.equal(parseBooleanLike('0'), false);
  assert.equal(parseBooleanLike('unchecked'), false);
  assert.equal(parseBooleanLike('random'), false);
});

test('parseScheduleSheet maps and normalizes schedule fields', () => {
  const parsed = parseScheduleSheet([
    {
      ID: '10',
      Name: 'Kickoff',
      Type: 'Milestone',
      Parent: '2',
      'Dependency Type': 'SS',
      Duration: '0',
      Start: '2026-03-01',
      '% Complete': '100',
      'Indent Level': '1',
      tracked: 'yes'
    }
  ]);

  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], {
    id: 10,
    name: 'Kickoff',
    type: 'Milestone',
    parent: 2,
    depType: 'SS',
    dur: 0,
    start: '2026-03-01',
    pct: 100,
    indent: 1,
    tracked: true
  });
});

test('parseTodoSheet maps manual todo fields and normalizes status', () => {
  const parsed = parseTodoSheet([
    {
      ID: '7',
      'Task Name': 'Buy fresh milk',
      'Due Date': '2026-03-20',
      Owner: 'Couple B',
      Status: 'Completed',
      Recurrence: 'weekly'
    },
    {
      Title: '   ',
      'Due Date': '2026-03-21'
    }
  ]);

  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0], {
    title: 'Buy fresh milk',
    dueDate: '2026-03-20',
    owner: 'Couple B',
    status: 'Done',
    recurrence: 'weekly'
  });
});

test('parseTrackerSheet restores linked tracker rows safely', () => {
  const parsed = parseTrackerSheet([{
    ID: 'tracker_12',
    'Task ID': '12',
    'Task Name': 'Approve SD-WAN high-level design',
    Notes: 'Security review pending',
    Status: 'In Progress',
    RAG: 'Amber',
    'Next Action': 'Book design authority',
    Owner: 'Technical Architect',
    'Date Added': '2026-09-08',
    'Last Updated': '2026-09-10'
  }], { nowIso: '2026-09-10T12:00:00.000Z' });

  assert.deepEqual(parsed[0], {
    _id: 'tracker_12',
    taskId: 12,
    taskName: 'Approve SD-WAN high-level design',
    rowColor: null,
    notes: 'Security review pending',
    status: 'In Progress',
    rag: 'Amber',
    nextAction: 'Book design authority',
    owner: 'Technical Architect',
    dateAdded: '2026-09-08',
    lastUpdated: '2026-09-10',
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z'
  });
});

test('parseStatusReportSheet maps the exported summary fields', () => {
  assert.deepEqual(parseStatusReportSheet([{
    'Overall RAG': 'Amber',
    'Overall Narrative': 'Pilot readiness is progressing.',
    'Main Risks': 'Carrier lead time',
    'Main Issues': 'One site survey delayed',
    'Deliverables This Period': 'HLD approved',
    'Deliverables Next Period': 'Pilot cutover',
    'Additional Notes': 'Executive checkpoint Friday'
  }]), {
    overallRag: 'Amber',
    overallNarrative: 'Pilot readiness is progressing.',
    mainRisks: 'Carrier lead time',
    mainIssues: 'One site survey delayed',
    deliverablesThisPeriod: 'HLD approved',
    deliverablesNextPeriod: 'Pilot cutover',
    additionalNotes: 'Executive checkpoint Friday'
  });
});

test('parseWorkspaceJsonImport restores a complete project workspace', () => {
  const parsed = parseWorkspaceJsonImport({
    format: 'pmworkspace-project-import-v1',
    tasks: [{ id: 1, name: 'SD-WAN kickoff', type: 'Milestone', start: '2026-09-07' }],
    registers: {
      risks: [{ number: 1, riskdetails: 'Carrier delay', public: false }],
      _raci: [{
        roles: ['Project Manager', 'Sponsor'],
        assignments: {
          _customTasks: ['Approve HLD'],
          'custom-0::Project Manager': 'R',
          'custom-0::Sponsor': 'A'
        }
      }]
    },
    tracker: [{ taskId: 1, taskName: 'SD-WAN kickoff', status: 'In Progress', rag: 'Amber' }],
    status_report: { overallRag: 'Amber', overallNarrative: 'Pilot preparation underway.' },
    todos: [{ title: 'Confirm pilot site', status: 'Open' }]
  }, { nowIso: '2026-09-07T12:00:00.000Z' });

  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.registers.risks[0].riskdetails, 'Carrier delay');
  assert.equal(parsed.registers.risks[0].public, false);
  assert.equal(parsed.registers._raci[0].assignments['custom-0::Sponsor'], 'A');
  assert.equal(parsed.tracker[0].taskId, 1);
  assert.equal(parsed.statusReport.overallRag, 'Amber');
  assert.equal(parsed.todos[0].title, 'Confirm pilot site');
});

test('parseWorkspaceJsonImport rejects unrelated JSON files', () => {
  assert.throws(
    () => parseWorkspaceJsonImport({ tasks: [] }),
    /Unsupported PM Workspace import file/
  );
});

test('parseRegisterSheet respects Internal visibility mapping', () => {
  const parsed = parseRegisterSheet(
    [{ ID: '1', Description: 'Fix API', Internal: true }],
    REGISTER_IMPORT_COLUMN_MAPS.actions
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].number, '1');
  assert.equal(parsed[0].description, 'Fix API');
  assert.equal(parsed[0].public, false);
  assert.equal(parsed[0].visible, true);
});

test('parseRegisterSheet treats spreadsheet FALSE as external-visible', () => {
  const parsed = parseRegisterSheet(
    [{ ID: '2', Description: 'Client note', Internal: 'FALSE' }],
    REGISTER_IMPORT_COLUMN_MAPS.actions
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].number, '2');
  assert.equal(parsed[0].public, true);
});

test('parseRaciSheet maps activity rows and role assignments', () => {
  const parsed = parseRaciSheet([
    { Activity: 'Project plan', 'Project Manager': 'R/A', Sponsor: 'A' },
    { Activity: 'Steering update', 'Project Manager': 'A', Sponsor: 'I' }
  ]);

  assert.ok(parsed);
  assert.deepEqual(parsed.roles, ['Project Manager', 'Sponsor']);
  assert.deepEqual(parsed.assignments._customTasks, ['Project plan', 'Steering update']);
  assert.equal(parsed.assignments['custom-0::Project Manager'], 'R/A');
  assert.equal(parsed.assignments['custom-0::Sponsor'], 'A');
  assert.equal(parsed.assignments['custom-1::Project Manager'], 'A');
  assert.equal(parsed.assignments['custom-1::Sponsor'], 'I');
});

test('parseRaciSheet returns null when role columns are missing', () => {
  const parsed = parseRaciSheet([{ Activity: 'Only activity column' }]);
  assert.equal(parsed, null);
});

test('findSheet resolves sheet names case-insensitively', () => {
  const selected = findSheet(
    ['Summary', 'risk log', 'Tasks'],
    ['Risks', 'Risk Log', 'Risk Register']
  );
  assert.equal(selected, 'risk log');
});
