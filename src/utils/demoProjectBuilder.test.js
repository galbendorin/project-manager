import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoProjectPayload } from './demoProjectBuilder.js';
import { buildAiReportExportData } from './aiReportExport.js';

test('buildDemoProjectPayload rebases demo dates around the current period and supports AI report windows', () => {
  const payload = buildDemoProjectPayload({ anchorDate: '2026-03-15' });
  const earliestTaskStart = payload.tasks.reduce((earliest, task) => {
    if (!earliest || task.start < earliest) return task.start;
    return earliest;
  }, '');

  assert.equal(earliestTaskStart, '2026-03-01');
  assert.match(payload.tasks[0].createdAt, /^2026-/);
  assert.match(payload.tasks[0].updatedAt, /^2026-/);
  assert.match(payload.tracker[0].updatedAt, /^2026-/);

  const exportData = buildAiReportExportData({
    project: { id: 'demo', name: 'Network Transformation Demo' },
    tasks: payload.tasks,
    registers: payload.registers,
    tracker: payload.tracker,
    statusReport: payload.status_report,
    todos: [],
    dateFrom: '2026-03-01',
    dateTo: '2026-03-15'
  });

  assert.notEqual(
    exportData.thisPeriodCompletedRows[0].Title,
    'No completed items found in selected period'
  );
  assert.notEqual(
    exportData.keyDeliverablesNextPeriodRows[0].Title,
    'No due items found for next period'
  );
});
