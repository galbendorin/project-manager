import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSmartCaptureInput, suggestCaptureRoute, summarizeCaptureRoutes } from './smartCapture.js';

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

test('suggestCaptureRoute detects richer date and owner defaults', () => {
  const action = suggestCaptureRoute(
    'Chase supplier next Monday for team',
    'task',
    { today: '2026-04-03' }
  );

  assert.equal(action.type, 'action');
  assert.equal(action.dueDate, '2026-04-06');
  assert.equal(action.ownerText, 'Team');
  assert.equal(action.confidence, 'medium');

  const task = suggestCaptureRoute(
    'Update launch checklist in 2 weeks for client',
    'task',
    { today: '2026-04-03' }
  );

  assert.equal(task.type, 'task');
  assert.equal(task.dueDate, '2026-04-17');
  assert.equal(task.ownerText, 'Client');
  assert.equal(task.confidence, 'low');
});

test('splitSmartCaptureInput breaks rough notes into structured items', () => {
  const items = splitSmartCaptureInput(
    'meeting: weekly steerco\nrisk: supplier delay by Friday\ndecision: move pilot to May\nChase client sign-off tomorrow',
    'task',
    { today: '2026-04-03' }
  );

  assert.equal(items.length, 4);
  assert.deepEqual(items.map((item) => item.type), ['meeting', 'risk', 'decision', 'action']);
  assert.equal(items[1].dueDate, '2026-04-03');
  assert.equal(summarizeCaptureRoutes(items), '1 Meeting note, 1 Risk, 1 Decision, 1 Action');
});
