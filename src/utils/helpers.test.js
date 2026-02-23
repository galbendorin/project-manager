import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateValue,
  toISODateString,
  formatDateDDMMMyy,
  addBusinessDays,
  countBusinessDays,
  getFinishDate,
  calculateParentSummaries,
  calculateSchedule,
  getVisibleTaskIndices,
  buildVisibleTasks,
  hasDependencies,
  collectDerivedTodos,
  bucketByDeadline,
  getNextRecurringDueDate
} from './helpers.js';

test('date parsing supports ISO and DD-MMM-YY formats', () => {
  const iso = parseDateValue('2026-06-26');
  const dmyShort = parseDateValue('26-Jun-26');
  const dmyLong = parseDateValue('26-Jun-2026');

  assert.equal(toISODateString(iso), '2026-06-26');
  assert.equal(toISODateString(dmyShort), '2026-06-26');
  assert.equal(toISODateString(dmyLong), '2026-06-26');
  assert.equal(formatDateDDMMMyy('2026-06-26'), '26-Jun-26');
  assert.equal(parseDateValue('') , null);
  assert.equal(parseDateValue('not-a-date'), null);
});

test('business day helpers skip weekends consistently', () => {
  // Friday + 1 business day => Monday
  assert.equal(toISODateString(addBusinessDays('2026-01-09', 1)), '2026-01-12');

  // Between Fri and Mon there is 1 business day (Mon)
  assert.equal(countBusinessDays('2026-01-09', '2026-01-12'), 1);

  // Duration 0 is milestone style finish (same day)
  assert.equal(getFinishDate('2026-01-09', 0), '2026-01-09');
});

test('parent summary dates use earliest child start and latest child finish', () => {
  const tasks = [
    { id: 1, name: 'Group', indent: 0, start: '2026-01-01', dur: 0 },
    { id: 2, name: 'Child A', indent: 1, start: '2026-01-05', dur: 2 },
    { id: 3, name: 'Child B', indent: 1, start: '2026-01-08', dur: 1 }
  ];

  const summaries = calculateParentSummaries(tasks);
  const summary = summaries.get(0);

  assert.ok(summary);
  assert.equal(summary.start, '2026-01-05');
  assert.equal(summary.finish, '2026-01-09');
  assert.equal(summary.dur, 4);
});

test('calculateSchedule supports ALL and ANY dependency logic', () => {
  const tasks = [
    { id: 1, name: 'Parent 1', start: '2026-01-05', dur: 2, parent: null, depType: 'FS', indent: 0 },
    { id: 2, name: 'Parent 2', start: '2026-01-08', dur: 2, parent: null, depType: 'FS', indent: 0 },
    {
      id: 3,
      name: 'Wait All',
      start: '2026-01-01',
      dur: 1,
      dependencies: [{ parentId: 1, depType: 'FS' }, { parentId: 2, depType: 'FS' }],
      depLogic: 'ALL',
      parent: null,
      depType: 'FS',
      indent: 0
    },
    {
      id: 4,
      name: 'Wait Any',
      start: '2026-01-01',
      dur: 1,
      dependencies: [{ parentId: 1, depType: 'FS' }, { parentId: 2, depType: 'FS' }],
      depLogic: 'ANY',
      parent: null,
      depType: 'FS',
      indent: 0
    }
  ];

  const scheduled = calculateSchedule(JSON.parse(JSON.stringify(tasks)));
  const allTask = scheduled.find(t => t.id === 3);
  const anyTask = scheduled.find(t => t.id === 4);

  assert.equal(allTask.start, '2026-01-12');
  assert.equal(anyTask.start, '2026-01-07');
});

test('dependency to group row uses group summary timing', () => {
  const tasks = [
    { id: 1, name: 'Group', start: '2026-01-01', dur: 0, parent: null, depType: 'FS', indent: 0 },
    { id: 2, name: 'Child A', start: '2026-01-05', dur: 2, parent: null, depType: 'FS', indent: 1 },
    { id: 3, name: 'Child B', start: '2026-01-08', dur: 1, parent: null, depType: 'FS', indent: 1 },
    { id: 4, name: 'Gate', start: '2026-01-01', dur: 0, parent: 1, depType: 'FS', indent: 0 }
  ];

  const scheduled = calculateSchedule(JSON.parse(JSON.stringify(tasks)));
  const gate = scheduled.find(t => t.id === 4);

  // Group summary finish is 2026-01-09, so FS milestone starts 2026-01-09.
  assert.equal(gate.start, '2026-01-09');
});

test('collapsed hierarchy hides children and buildVisibleTasks preserves index mapping', () => {
  const tasks = [
    { id: 1, name: 'Group', type: 'Task', start: '2026-01-05', dur: 1, indent: 0 },
    { id: 2, name: 'Child A', type: 'Task', start: '2026-01-06', dur: 1, indent: 1 },
    { id: 3, name: 'Child B', type: 'Task', start: '2026-01-07', dur: 1, indent: 1 },
    { id: 4, name: 'Sibling', type: 'Task', start: '2026-01-08', dur: 1, indent: 0 }
  ];

  const visibleIndices = getVisibleTaskIndices(tasks, new Set([0]));
  assert.deepEqual(visibleIndices, [0, 3]);

  const visibleTasks = buildVisibleTasks(tasks, new Set([0]));
  assert.equal(visibleTasks.length, 2);
  assert.equal(visibleTasks[0]._isParent, true);
  assert.equal(visibleTasks[0]._originalIndex, 0);
  assert.equal(visibleTasks[1]._originalIndex, 3);
});

test('hasDependencies handles null and undefined parent safely', () => {
  assert.equal(hasDependencies({ dependencies: [{ parentId: 1, depType: 'FS' }] }), true);
  assert.equal(hasDependencies({ parent: 7 }), true);
  assert.equal(hasDependencies({ parent: null, dependencies: null }), false);
  assert.equal(hasDependencies({ parent: undefined, dependencies: [] }), false);
});

test('collectDerivedTodos merges action, issue, change, tracker, and tracked schedule sources', () => {
  const projectData = [
    { id: 1, name: 'Tracked Site Cutover', start: '2026-02-23', dur: 2, tracked: true, pct: 0 }
  ];
  const registers = {
    actions: [{ _id: 'a1', description: 'Send status update', actionassignedto: 'PM', target: '2026-02-24', status: 'Open' }],
    issues: [{ _id: 'i1', description: 'Resolve firewall rule', issueassignedto: 'SecOps', target: '2026-02-25', status: 'In Progress' }],
    changes: [{ _id: 'c1', description: 'Approve maintenance window', assignedto: 'CAB', target: '2026-02-26', status: 'Approved' }]
  };
  const tracker = [];

  const derived = collectDerivedTodos(projectData, registers, tracker);
  const sources = new Set(derived.map(item => item.source));

  assert.equal(derived.length, 4);
  assert.equal(sources.has('Action Log'), true);
  assert.equal(sources.has('Issue Log'), true);
  assert.equal(sources.has('Change Log'), true);
  assert.equal(sources.has('Project Plan'), true);
});

test('bucketByDeadline places todos in expected deadline buckets', () => {
  const items = [
    { _id: '1', title: 'Late', dueDate: '2026-02-22', status: 'Open' },       // Sunday before today
    { _id: '2', title: 'This Week', dueDate: '2026-02-27', status: 'Open' },  // Friday
    { _id: '3', title: 'Next Week', dueDate: '2026-03-03', status: 'Open' },  // Tuesday next week
    { _id: '4', title: 'In 2 Weeks', dueDate: '2026-03-10', status: 'Open' }, // Tuesday week+2
    { _id: '5', title: 'Weeks 3-4', dueDate: '2026-03-20', status: 'Open' },  // Week 3-4 window
    { _id: '6', title: 'Later', dueDate: '2026-04-10', status: 'Open' },
    { _id: '7', title: 'No date', dueDate: '', status: 'Open' }
  ];

  const buckets = bucketByDeadline(items, '2026-02-23'); // Monday
  const byKey = Object.fromEntries(buckets.map(bucket => [bucket.key, bucket.items.length]));

  assert.equal(byKey.overdue, 1);
  assert.equal(byKey.this_week, 1);
  assert.equal(byKey.next_week, 1);
  assert.equal(byKey.in_2_weeks, 1);
  assert.equal(byKey.weeks_3_4, 1);
  assert.equal(byKey.later, 2);
});

test('getNextRecurringDueDate handles weekdays, weekly, monthly, and yearly recurrence', () => {
  assert.equal(
    getNextRecurringDueDate('2026-03-06', { type: 'weekdays', interval: 1 }), // Friday -> Monday
    '2026-03-09'
  );
  assert.equal(
    getNextRecurringDueDate('2026-03-01', { type: 'weekly', interval: 1 }),
    '2026-03-08'
  );
  assert.equal(
    getNextRecurringDueDate('2026-03-01', { type: 'weekly', interval: 2 }),
    '2026-03-15'
  );
  assert.equal(
    getNextRecurringDueDate('', { type: 'weekly', interval: 1 }, '2026-02-23'),
    '2026-03-02'
  );
  assert.equal(
    getNextRecurringDueDate('2026-01-31', { type: 'monthly', interval: 1 }),
    '2026-02-28'
  );
  assert.equal(
    getNextRecurringDueDate('2024-02-29', { type: 'yearly', interval: 1 }),
    '2025-02-28'
  );
  assert.equal(
    getNextRecurringDueDate('2026-03-01', null),
    ''
  );
});
