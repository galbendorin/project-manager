import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrossProjectTodoUpdateData } from './crossProjectTodoCompletion.js';

test('buildCrossProjectTodoUpdateData patches tracker rows for cross-project completions', () => {
  const nowIso = '2026-04-14T10:00:00.000Z';
  const project = {
    id: 'project-alison',
    tracker: [
      { _id: 'tracker_1', status: 'In Progress', lastUpdated: '2026-04-13' },
      { _id: 'tracker_2', status: 'Not Started', lastUpdated: '2026-04-13' },
    ],
  };

  const result = buildCrossProjectTodoUpdateData(project, {
    kind: 'tracker',
    trackerId: 'tracker_1',
    patch: {
      status: 'Completed',
      lastUpdated: '2026-04-14',
      updatedAt: nowIso,
    },
  }, nowIso);

  assert.equal(result.updateData.updated_at, nowIso);
  assert.equal(result.updateData.tracker[0].status, 'Completed');
  assert.equal(result.nextProject.tracker[1].status, 'Not Started');
});

test('buildCrossProjectTodoUpdateData patches register items for cross-project completions', () => {
  const nowIso = '2026-04-14T10:00:00.000Z';
  const project = {
    id: 'project-alison',
    registers: {
      actions: [
        { _id: 'action_1', status: 'Open', completed: '', update: '2026-04-13' },
      ],
    },
  };

  const result = buildCrossProjectTodoUpdateData(project, {
    kind: 'register',
    registerType: 'actions',
    itemId: 'action_1',
    patch: {
      status: 'Completed',
      completed: '2026-04-14',
      update: '2026-04-14',
    },
  }, nowIso);

  assert.equal(result.updateData.registers.actions[0].status, 'Completed');
  assert.equal(result.updateData.registers.actions[0].updatedAt, nowIso);
});

test('buildCrossProjectTodoUpdateData patches schedule tasks for cross-project completions', () => {
  const nowIso = '2026-04-14T10:00:00.000Z';
  const project = {
    id: 'project-alison',
    tasks: [
      { id: 4, name: 'Task A', pct: 20, updatedAt: '2026-04-13T08:00:00.000Z' },
      { id: 5, name: 'Task B', pct: 0, updatedAt: '2026-04-13T08:00:00.000Z' },
    ],
  };

  const result = buildCrossProjectTodoUpdateData(project, {
    kind: 'schedule',
    taskId: 4,
    patch: {
      pct: 100,
    },
  }, nowIso);

  assert.equal(result.updateData.tasks[0].pct, 100);
  assert.equal(result.updateData.tasks[0].updatedAt, nowIso);
  assert.equal(result.nextProject.tasks[1].pct, 0);
});
