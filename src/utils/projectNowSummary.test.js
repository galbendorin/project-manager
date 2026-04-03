import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectNowSummary } from './projectNowSummary.js';

test('buildProjectNowSummary combines attention, due soon, and next item signals', () => {
  const summary = buildProjectNowSummary({
    today: '2026-04-03',
    tasks: [
      { id: 1, name: 'Design sign-off', start: '2026-04-06', dur: 2, pct: 40, updatedAt: '2026-04-02' },
      { id: 2, name: 'Completed task', start: '2026-04-01', dur: 1, pct: 100, updatedAt: '2026-04-01' },
    ],
    registers: {
      actions: [
        { _id: 'a1', description: 'Confirm rollout window', status: 'Open', target: '2026-04-05', updatedAt: '2026-04-03' },
      ],
      issues: [
        { _id: 'i1', description: 'Access blocked', status: 'Open', updatedAt: '2026-04-02' },
      ],
      risks: [
        { _id: 'r1', level: 'High', updatedAt: '2026-04-01' },
      ],
    },
    tracker: [
      { _id: 't1', rag: 'Red', status: 'In Progress', updatedAt: '2026-04-03' },
    ],
    statusReport: {
      overallRag: 'Amber',
      overallNarrative: 'Main workstream remains on track with one dependency being watched.',
    },
    todos: [
      { _id: 'todo1', title: 'Send notes', dueDate: '2026-04-04', status: 'Open', updatedAt: '2026-04-03' },
    ],
  });

  assert.equal(summary.rag, 'Amber');
  assert.equal(summary.attentionCount, 3);
  assert.equal(summary.dueSoonCount, 3);
  assert.match(summary.summaryLine, /3 need attention/);
  assert.match(summary.summaryLine, /3 due this week/);
  assert.match(summary.summaryLine, /Next:/);
  assert.match(summary.narrative, /Main workstream remains on track/);
});

test('buildProjectNowSummary handles calm projects without due dates', () => {
  const summary = buildProjectNowSummary({
    today: '2026-04-03',
    tasks: [{ id: 1, name: 'Completed', start: '2026-04-01', dur: 1, pct: 100 }],
    registers: { actions: [], issues: [], risks: [] },
    tracker: [],
    statusReport: { overallRag: 'Green' },
    todos: [],
  });

  assert.equal(summary.attentionCount, 0);
  assert.equal(summary.dueSoonCount, 0);
  assert.equal(summary.overdueCount, 0);
  assert.match(summary.summaryLine, /No major blockers are showing/);
});
