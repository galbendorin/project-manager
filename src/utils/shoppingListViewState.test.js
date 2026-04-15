import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyShoppingOfflineState,
  normalizeShoppingOfflineState,
  pickPreferredShoppingProject,
} from './shoppingListViewState.js';

test('normalizeShoppingOfflineState returns a safe empty shape for invalid input', () => {
  assert.deepEqual(normalizeShoppingOfflineState(null), createEmptyShoppingOfflineState());
  assert.deepEqual(normalizeShoppingOfflineState('bad-cache'), createEmptyShoppingOfflineState());
});

test('normalizeShoppingOfflineState keeps only valid array and object fields', () => {
  const normalized = normalizeShoppingOfflineState({
    projects: [{ id: 'project-1' }, null, 'bad-project'],
    selectedProjectId: 'project-1',
    todosByProject: {
      'project-1': [{ _id: 'todo-1', title: 'Milk' }, 'bad-todo', null],
      '': [{ _id: 'todo-2' }],
      'project-2': 'bad-list',
    },
    queue: [{ kind: 'create', targetId: 'todo-1' }, 'bad-op'],
    lastSyncedAt: '2026-04-13T00:00:00.000Z',
  });

  assert.deepEqual(normalized, {
    projects: [{ id: 'project-1' }],
    selectedProjectId: 'project-1',
    todosByProject: {
      'project-1': [{ _id: 'todo-1', title: 'Milk' }],
      'project-2': [],
    },
    queue: [{ kind: 'create', targetId: 'todo-1' }],
    lastSyncedAt: '2026-04-13T00:00:00.000Z',
  });
});

test('pickPreferredShoppingProject prefers the shared household list over a private one', () => {
  const project = pickPreferredShoppingProject([
    { id: 'private-owned', user_id: 'user-1', created_at: '2026-04-15T10:00:00.000Z', project_members: [] },
    { id: 'shared-owned', user_id: 'user-1', created_at: '2026-04-15T11:00:00.000Z', project_members: [{ user_id: 'user-2' }] },
    { id: 'shared-with-me', user_id: 'user-3', created_at: '2026-04-15T09:00:00.000Z', project_members: [{ user_id: 'user-1' }] },
  ], 'user-1');

  assert.equal(project?.id, 'shared-owned');
});

test('pickPreferredShoppingProject prefers a shared incoming list before a private owned one when needed', () => {
  const project = pickPreferredShoppingProject([
    { id: 'private-owned', user_id: 'user-1', created_at: '2026-04-15T10:00:00.000Z', project_members: [] },
    { id: 'shared-with-me', user_id: 'user-3', created_at: '2026-04-15T09:00:00.000Z', project_members: [{ user_id: 'user-1' }] },
  ], 'user-1');

  assert.equal(project?.id, 'shared-with-me');
});
