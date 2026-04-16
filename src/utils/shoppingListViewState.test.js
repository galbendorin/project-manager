import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyShoppingOfflineState,
  formatShoppingAddSummary,
  groupCompletedShoppingTodos,
  mergeShoppingItemQuantity,
  normalizeShoppingOfflineState,
  normalizeBoughtTodoTitle,
  planShoppingListAdds,
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

test('normalizeBoughtTodoTitle keeps duplicate grocery names on one memory key', () => {
  assert.equal(normalizeBoughtTodoTitle('  Eggs  '), 'eggs');
  assert.equal(normalizeBoughtTodoTitle('eggS'), 'eggs');
  assert.equal(normalizeBoughtTodoTitle('Whole   milk'), 'whole milk');
});

test('groupCompletedShoppingTodos collapses repeated bought groceries into one reusable memory row', () => {
  const groups = groupCompletedShoppingTodos([
    {
      _id: 'todo-eggs-older',
      title: 'Eggs',
      status: 'Done',
      createdAt: '2026-04-15T08:00:00.000Z',
      updatedAt: '2026-04-15T08:00:00.000Z',
      completedAt: '2026-04-15T08:00:00.000Z',
    },
    {
      _id: 'todo-milk',
      title: 'Milk',
      status: 'Done',
      createdAt: '2026-04-15T09:00:00.000Z',
      updatedAt: '2026-04-15T09:00:00.000Z',
      completedAt: '2026-04-15T09:00:00.000Z',
    },
    {
      _id: 'todo-eggs-latest',
      title: ' eggs ',
      status: 'Done',
      createdAt: '2026-04-15T10:00:00.000Z',
      updatedAt: '2026-04-15T10:00:00.000Z',
      completedAt: '2026-04-15T10:00:00.000Z',
    },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].primaryTodo._id, 'todo-eggs-latest');
  assert.equal(groups[0].count, 2);
  assert.equal(groups[1].primaryTodo._id, 'todo-milk');
  assert.equal(groups[1].count, 1);
});

test('mergeShoppingItemQuantity sums matching quantity units and keeps one row', () => {
  const merged = mergeShoppingItemQuantity(
    { quantityValue: 2, quantityUnit: 'pcs' },
    { quantityValue: 3, quantityUnit: 'pcs' },
  );

  assert.equal(merged.quantityValue, 5);
  assert.equal(merged.quantityUnit, 'pcs');
});

test('planShoppingListAdds merges duplicate incoming groceries into existing open rows', () => {
  const plan = planShoppingListAdds({
    existingTodos: [
      {
        _id: 'todo-eggs-open',
        title: 'Eggs',
        status: 'Open',
        quantityValue: 2,
        quantityUnit: 'pcs',
        updatedAt: '2026-04-16T08:00:00.000Z',
      },
    ],
    incomingItems: [
      { title: ' eggs ', quantityValue: 3, quantityUnit: 'pcs' },
      { title: 'Milk', quantityValue: null, quantityUnit: '' },
    ],
  });

  assert.equal(plan.addedCount, 1);
  assert.equal(plan.mergedCount, 1);
  assert.equal(plan.updates[0].todoId, 'todo-eggs-open');
  assert.equal(plan.updates[0].quantityValue, 5);
  assert.equal(plan.inserts[0].title, 'Milk');
});

test('planShoppingListAdds collapses duplicate incoming groceries before insert', () => {
  const plan = planShoppingListAdds({
    existingTodos: [],
    incomingItems: [
      { title: 'Tomatoes', quantityValue: 2, quantityUnit: 'pcs' },
      { title: ' tomatoes ', quantityValue: 3, quantityUnit: 'pcs' },
    ],
  });

  assert.equal(plan.addedCount, 1);
  assert.equal(plan.mergedCount, 0);
  assert.equal(plan.inserts[0].title, 'tomatoes');
  assert.equal(plan.inserts[0].quantityValue, 5);
});

test('formatShoppingAddSummary reports mixed add and merge outcomes clearly', () => {
  assert.equal(
    formatShoppingAddSummary({ addedCount: 1, mergedCount: 2 }),
    'Added 1 new grocery and merged 2 into the open list.'
  );
  assert.equal(
    formatShoppingAddSummary({ addedCount: 0, mergedCount: 1 }),
    'Merged 1 grocery into the open list.'
  );
});
