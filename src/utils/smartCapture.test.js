import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCaptureRoute } from './smartCapture.js';

test('suggestCaptureRoute respects explicit prefixes', () => {
  const decision = suggestCaptureRoute('decision: move pilot to May');
  assert.equal(decision.type, 'decision');
  assert.equal(decision.cleanedText, 'move pilot to May');
  assert.equal(decision.meta.destination, 'Decision Log');

  const risk = suggestCaptureRoute('risk - supplier delay on routers');
  assert.equal(risk.type, 'risk');
  assert.equal(risk.cleanedText, 'supplier delay on routers');
});

test('suggestCaptureRoute detects keyword-based routing', () => {
  const meeting = suggestCaptureRoute('Call with supplier about revised timeline');
  assert.equal(meeting.type, 'meeting');

  const action = suggestCaptureRoute('Chase client sign-off tomorrow');
  assert.equal(action.type, 'action');

  const issue = suggestCaptureRoute('Blocked because test access failed');
  assert.equal(issue.type, 'issue');
});

test('suggestCaptureRoute falls back to task for general notes', () => {
  const task = suggestCaptureRoute('Update the RAID summary', 'task');
  assert.equal(task.type, 'task');
  assert.equal(task.cleanedText, 'Update the RAID summary');
});

test('suggestCaptureRoute extracts due date and self owner details', () => {
  const action = suggestCaptureRoute(
    'Chase client sign-off tomorrow for me',
    'task',
    { today: '2026-04-03', selfOwnerName: 'Dorin Galben' }
  );

  assert.equal(action.type, 'action');
  assert.equal(action.cleanedText, 'Chase client sign-off');
  assert.equal(action.dueDate, '2026-04-04');
  assert.equal(action.ownerText, 'Dorin Galben');
});

test('suggestCaptureRoute extracts weekday due dates from captures', () => {
  const risk = suggestCaptureRoute(
    'risk: supplier delay by Friday',
    'task',
    { today: '2026-04-01' }
  );

  assert.equal(risk.type, 'risk');
  assert.equal(risk.cleanedText, 'supplier delay');
  assert.equal(risk.dueDate, '2026-04-03');
});

test('suggestCaptureRoute extracts named owners from captures', () => {
  const decision = suggestCaptureRoute(
    'decision: move pilot to May for Alison',
    'task',
    { today: '2026-04-03' }
  );

  assert.equal(decision.type, 'decision');
  assert.equal(decision.cleanedText, 'move pilot to May');
  assert.equal(decision.ownerText, 'Alison');
});
