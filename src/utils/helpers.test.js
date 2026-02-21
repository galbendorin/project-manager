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
  hasDependencies
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
