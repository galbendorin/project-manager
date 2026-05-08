import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectReadiness, formatFocusDateLabel } from './projectReadiness.js';

test('buildProjectReadiness prioritizes overdue and near-term focus items', () => {
  const readiness = buildProjectReadiness({
    today: '2026-05-08',
    tasks: [
      { id: 1, name: 'Future task', start: '2026-05-12', dur: 1, pct: 0, owner: 'PM' },
      { id: 2, name: 'Late task', start: '2026-05-04', dur: 1, pct: 50, owner: '' },
    ],
    registers: {
      actions: [
        { _id: 'a1', description: 'Today action', target: '2026-05-08', status: 'Open', actionassignedto: 'Ops' },
      ],
      issues: [
        { _id: 'i1', description: 'Blocked issue', target: '2026-05-09', status: 'Blocked', issueassignedto: 'Delivery' },
      ],
      risks: [],
    },
    tracker: [],
    statusReport: { overallNarrative: '' },
    todos: [],
  });

  assert.deepEqual(
    readiness.focusItems.map((item) => item.title),
    ['Late task', 'Today action', 'Blocked issue']
  );
  assert.equal(readiness.focusItems[0].dateLabel, '3 days late');
  assert.equal(readiness.isReady, false);
  assert.ok(readiness.checks.some((check) => check.key === 'owners' && check.status === 'warn'));
  assert.ok(readiness.checks.some((check) => check.key === 'blockers' && check.status === 'warn'));
});

test('buildProjectReadiness reports ready when open work has owners, dates, and context', () => {
  const readiness = buildProjectReadiness({
    today: '2026-05-08',
    tasks: [
      { id: 1, name: 'Prepare pack', start: '2026-05-08', dur: 1, pct: 10, owner: 'Dorin' },
    ],
    registers: {
      actions: [
        { _id: 'a1', description: 'Send update', target: '2026-05-10', status: 'Open', actionassignedto: 'Dorin' },
      ],
      issues: [],
      risks: [],
    },
    tracker: [],
    statusReport: { overallStatus: 'On track for the next client update.' },
    todos: [],
  });

  assert.equal(readiness.scoreLabel, '5/5');
  assert.equal(readiness.isReady, true);
  assert.equal(readiness.focusItems.length, 2);
});

test('formatFocusDateLabel handles common mobile labels', () => {
  assert.equal(formatFocusDateLabel(null), 'No date');
  assert.equal(formatFocusDateLabel(-1), '1 day late');
  assert.equal(formatFocusDateLabel(0), 'Today');
  assert.equal(formatFocusDateLabel(1), 'Tomorrow');
  assert.equal(formatFocusDateLabel(4), 'In 4 days');
});
