import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWeeks,
  buildProjectDurationSummary,
  buildTimesheetReportFileName,
  buildTimesheetReportRows,
  buildTimeEntryPayload,
  formatDurationMinutes,
  formatHoursFromMinutes,
  formatWeekRange,
  getTrackProjectColor,
  getVisibleHourRange,
  getWeekDateRange,
  getWeekDates,
  minutesToTimeInput,
  parseTimeInputToMinutes,
  startOfIsoWeek,
  sumEntryDurationMinutes,
  toWeekStartIso,
} from './timesheets.js';

test('startOfIsoWeek normalizes a mid-week date to Monday', () => {
  const result = startOfIsoWeek('2026-03-25T15:30:00Z');
  assert.equal(result.toISOString().slice(0, 10), '2026-03-23');
});

test('toWeekStartIso and addWeeks keep ISO week boundaries stable', () => {
  const start = toWeekStartIso('2026-03-25');
  assert.equal(start, '2026-03-23');
  assert.equal(addWeeks(start, 1).toISOString().slice(0, 10), '2026-03-30');
});

test('formatWeekRange and getWeekDateRange render the expected human and query ranges', () => {
  assert.equal(formatWeekRange('2026-03-23'), '23 Mar - 29 Mar 2026');
  assert.deepEqual(getWeekDateRange('2026-03-23'), {
    start: '2026-03-23',
    endInclusive: '2026-03-29',
  });
});

test('getWeekDates returns a full Monday-to-Sunday model', () => {
  const days = getWeekDates('2026-03-23');
  assert.equal(days.length, 7);
  assert.equal(days[0].iso, '2026-03-23');
  assert.equal(days[6].iso, '2026-03-29');
});

test('time conversion helpers round-trip clock values', () => {
  assert.equal(parseTimeInputToMinutes('09:30'), 570);
  assert.equal(parseTimeInputToMinutes('25:00'), null);
  assert.equal(minutesToTimeInput(570), '09:30');
});

test('duration helpers format minutes and hours for the track UI', () => {
  assert.equal(formatDurationMinutes(75), '1h 15m');
  assert.equal(formatDurationMinutes(45), '45m');
  assert.equal(formatHoursFromMinutes(150), '2.5h');
});

test('entry aggregation helpers summarize totals by project and visible hour range', () => {
  const entries = [
    { project_id: 'a', start_minutes: 540, duration_minutes: 90 },
    { project_id: 'a', start_minutes: 780, duration_minutes: 60 },
    { project_id: 'b', start_minutes: 420, duration_minutes: 30 },
  ];

  assert.equal(sumEntryDurationMinutes(entries), 180);
  assert.deepEqual(
    buildProjectDurationSummary(entries, [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ]),
    [
      { projectId: 'a', totalMinutes: 150, project: { id: 'a', name: 'Alpha' } },
      { projectId: 'b', totalMinutes: 30, project: { id: 'b', name: 'Beta' } },
    ]
  );
  assert.deepEqual(getVisibleHourRange(entries), {
    startMinutes: 420,
    endMinutes: 1140,
  });
});

test('buildTimeEntryPayload validates the required fields', () => {
  assert.deepEqual(buildTimeEntryPayload({
    projectId: 'project_1',
    userId: 'user_1',
    entryDate: '2026-03-25',
    startTime: '10:15',
    durationMinutes: '90',
    description: 'Weekly planning',
  }), {
    project_id: 'project_1',
    user_id: 'user_1',
    entry_date: '2026-03-25',
    start_minutes: 615,
    duration_minutes: 90,
    description: 'Weekly planning',
  });

  assert.equal(buildTimeEntryPayload({
    projectId: '',
    userId: 'user_1',
    entryDate: '2026-03-25',
    startTime: '10:15',
    durationMinutes: '90',
    description: '',
  }), null);
});

test('buildTimesheetReportRows returns spreadsheet-friendly rows in date order', () => {
  const rows = buildTimesheetReportRows([
    { id: 'b', project_id: 'beta', entry_date: '2026-03-25', start_minutes: 600, duration_minutes: 30, description: 'Follow-up call' },
    { id: 'a', project_id: 'alpha', entry_date: '2026-03-24', start_minutes: 540, duration_minutes: 90, description: 'Weekly planning' },
  ], [
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
  ]);

  assert.deepEqual(rows, [
    { Date: '2026-03-24', Project: 'Alpha', Duration: 1.5, 'Task Worked On': 'Weekly planning' },
    { Date: '2026-03-25', Project: 'Beta', Duration: 0.5, 'Task Worked On': 'Follow-up call' },
  ]);
});

test('buildTimesheetReportFileName includes the week, project scope, and view', () => {
  assert.equal(
    buildTimesheetReportFileName({
      weekStart: '2026-03-23',
      selectedProject: { name: 'Alpha Launch' },
      selectedProjectId: 'project_1',
      viewMode: 'team',
    }),
    'timesheet-report_2026-03-23_to_2026-03-29_alpha-launch_team.xlsx'
  );
});

test('getTrackProjectColor is stable for a given project id', () => {
  assert.deepEqual(getTrackProjectColor('project_1'), getTrackProjectColor('project_1'));
});
