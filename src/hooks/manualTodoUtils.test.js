import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTodoRecurrence,
  mapManualTodoRow,
  isMissingRelationError
} from './projectData/manualTodoUtils.js';

test('normalizeTodoRecurrence supports aliases and normalizes interval', () => {
  assert.deepEqual(normalizeTodoRecurrence('weekday'), { type: 'weekdays', interval: 1 });
  assert.deepEqual(normalizeTodoRecurrence({ type: 'annual', interval: 3.9 }), { type: 'yearly', interval: 3 });
  assert.deepEqual(normalizeTodoRecurrence({ type: 'weekly', interval: 0 }), { type: 'weekly', interval: 1 });
  assert.equal(normalizeTodoRecurrence({ type: 'unsupported' }), null);
});

test('mapManualTodoRow maps DB fields into UI shape', () => {
  const row = mapManualTodoRow({
    id: 'todo_1',
    project_id: 'project_1',
    title: 'Follow up',
    due_date: '2026-03-01',
    owner_text: 'PM',
    assignee_user_id: 'user_1',
    status: 'Done',
    recurrence: { type: 'monthly', interval: 2 },
    created_at: '2026-02-01T10:00:00.000Z',
    updated_at: '2026-02-01T12:00:00.000Z',
    completed_at: '2026-02-01T12:05:00.000Z'
  });

  assert.equal(row._id, 'todo_1');
  assert.equal(row.projectId, 'project_1');
  assert.equal(row.status, 'Done');
  assert.deepEqual(row.recurrence, { type: 'monthly', interval: 2 });
  assert.equal(row.createdAt, '2026-02-01T10:00:00.000Z');
});

test('isMissingRelationError detects relation-missing failures', () => {
  const relationError = { message: 'relation "public.manual_todos" does not exist' };
  assert.equal(isMissingRelationError(relationError, 'manual_todos'), true);
  assert.equal(isMissingRelationError({ message: 'permission denied' }, 'manual_todos'), false);
});
