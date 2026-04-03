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
