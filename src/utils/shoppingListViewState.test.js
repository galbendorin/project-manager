import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyShoppingQueueToTodos,
  buildMealPlanShoppingSyncPreview,
  createEmptyShoppingOfflineState,
  findUncertainShoppingCreateMatch,
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

test('pickPreferredShoppingProject keeps the explicitly selected shopping list when it is still available', () => {
  const project = pickPreferredShoppingProject([
    { id: 'private-owned', user_id: 'user-1', created_at: '2026-04-15T10:00:00.000Z', project_members: [] },
    { id: 'shared-owned', user_id: 'user-1', created_at: '2026-04-15T11:00:00.000Z', project_members: [{ user_id: 'user-2' }] },
  ], 'user-1', 'private-owned');

  assert.equal(project?.id, 'private-owned');
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
  assert.equal(plan.preparedItems.length, 1);
  assert.equal(plan.inserts[0].title, 'tomatoes');
  assert.equal(plan.inserts[0].quantityValue, 5);
  assert.equal(plan.preparedItems[0].title, 'tomatoes');
  assert.equal(plan.preparedItems[0].quantityValue, 5);
});

test('planShoppingListAdds still merges repeated adds into one open grocery', () => {
  const plan = planShoppingListAdds({
    existingTodos: [
      {
        _id: 'todo-oats-open',
        title: 'Oats',
        status: 'Open',
        quantityValue: 250,
        quantityUnit: 'g',
        updatedAt: '2026-06-14T08:00:00.000Z',
      },
    ],
    incomingItems: [
      { title: 'oats', quantityValue: 500, quantityUnit: 'g' },
      { title: ' OATS ', quantityValue: 250, quantityUnit: 'g' },
    ],
  });

  assert.equal(plan.addedCount, 0);
  assert.equal(plan.mergedCount, 1);
  assert.equal(plan.updates[0].todoId, 'todo-oats-open');
  assert.equal(plan.updates[0].quantityValue, 1000);
  assert.equal(plan.preparedItems.length, 1);
});

test('planShoppingListAdds keeps prepared items available for live upsert flow', () => {
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
      { title: ' eggs ', quantityValue: 3, quantityUnit: 'pcs', sourceType: 'meal_plan', meta: { weekStartDate: '2026-04-21' } },
      { title: 'Milk', quantityValue: null, quantityUnit: '', sourceType: '', meta: {} },
    ],
  });

  assert.equal(plan.preparedItems.length, 2);
  assert.deepEqual(
    plan.preparedItems.map((item) => item.title),
    ['eggs', 'Milk'],
  );
  assert.equal(plan.preparedItems[0].quantityValue, 3);
  assert.equal(plan.preparedItems[0].sourceType, 'meal_plan');
  assert.deepEqual(plan.preparedItems[0].meta, { weekStartDate: '2026-04-21' });
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
  assert.equal(
    formatShoppingAddSummary({ addedCount: 1, mergedCount: 0, queuedCount: 1 }),
    'Saved 1 grocery change offline. It will sync automatically.'
  );
});

test('findUncertainShoppingCreateMatch avoids repeating a confirmed quantity after a dropped response', () => {
  const match = findUncertainShoppingCreateMatch({
    title: 'Oats',
    quantityValue: 500,
    quantityUnit: 'g',
    uncertainCommit: true,
  }, [{
    _id: 'todo-oats',
    title: ' oats ',
    status: 'Open',
    quantityValue: 500,
    quantityUnit: 'g',
  }]);

  assert.equal(match?._id, 'todo-oats');
});

test('findUncertainShoppingCreateMatch retries when the saved quantity cannot confirm the add', () => {
  assert.equal(findUncertainShoppingCreateMatch({
    title: 'Oats',
    quantityValue: 500,
    quantityUnit: 'g',
    uncertainCommit: true,
  }, [{
    _id: 'todo-oats',
    title: 'Oats',
    status: 'Open',
    quantityValue: 250,
    quantityUnit: 'g',
  }]), null);
});

test('applyShoppingQueueToTodos keeps queued local creates visible after a server refresh', () => {
  const visibleTodos = applyShoppingQueueToTodos({
    projectId: 'shopping-project',
    todos: [
      {
        _id: 'server-milk',
        projectId: 'shopping-project',
        title: 'Milk',
        status: 'Open',
        createdAt: '2026-07-15T08:00:00.000Z',
        updatedAt: '2026-07-15T08:00:00.000Z',
      },
    ],
    queue: [
      {
        kind: 'create',
        targetId: 'offline-todo-oats',
        record: {
          localId: 'offline-todo-oats',
          projectId: 'shopping-project',
          userId: 'user-1',
          title: 'Oats',
          status: 'Open',
          quantityValue: 500,
          quantityUnit: 'g',
          createdAt: '2026-07-15T08:01:00.000Z',
          updatedAt: '2026-07-15T08:01:00.000Z',
        },
      },
    ],
  });

  assert.deepEqual(
    visibleTodos.map((todo) => todo._id),
    ['offline-todo-oats', 'server-milk'],
  );
  assert.equal(visibleTodos[0].title, 'Oats');
  assert.equal(visibleTodos[0].quantityValue, 500);
  assert.equal(visibleTodos[0].quantityUnit, 'g');
});

test('applyShoppingQueueToTodos reapplies queued edits and deletes over server rows', () => {
  const visibleTodos = applyShoppingQueueToTodos({
    projectId: 'shopping-project',
    todos: [
      {
        _id: 'server-oats',
        projectId: 'shopping-project',
        title: 'Oats',
        status: 'Open',
        quantityValue: 250,
        quantityUnit: 'g',
        createdAt: '2026-07-15T08:00:00.000Z',
        updatedAt: '2026-07-15T08:00:00.000Z',
      },
      {
        _id: 'server-milk',
        projectId: 'shopping-project',
        title: 'Milk',
        status: 'Open',
        createdAt: '2026-07-15T08:00:00.000Z',
        updatedAt: '2026-07-15T08:00:00.000Z',
      },
    ],
    queue: [
      {
        kind: 'update',
        targetId: 'server-oats',
        patch: {
          title: 'Porridge oats',
          quantityValue: 750,
          quantityUnit: 'g',
          updatedAt: '2026-07-15T08:02:00.000Z',
        },
      },
      {
        kind: 'delete',
        targetId: 'server-milk',
      },
    ],
  });

  assert.equal(visibleTodos.length, 1);
  assert.equal(visibleTodos[0]._id, 'server-oats');
  assert.equal(visibleTodos[0].title, 'Porridge oats');
  assert.equal(visibleTodos[0].quantityValue, 750);
});

test('buildMealPlanShoppingSyncPreview flags manual matches without treating them as generated updates', () => {
  const preview = buildMealPlanShoppingSyncPreview({
    batchId: 'batch-1',
    draftItems: [
      { key: 'oats::g', title: 'Oats', quantityValue: 500, quantityUnit: 'g' },
    ],
    existingTodos: [
      {
        _id: 'todo-oats-manual',
        title: 'oats',
        status: 'Open',
        quantityValue: null,
        quantityUnit: '',
        sourceType: '',
        sourceBatchId: null,
      },
    ],
  });

  assert.equal(preview.counts.add, 1);
  assert.equal(preview.counts.update, 0);
  assert.equal(preview.counts.manualMatches, 1);
  assert.equal(preview.manualMatches[0].item.title, 'Oats');
  assert.equal(preview.manualMatches[0].primaryTodo._id, 'todo-oats-manual');
  assert.equal(preview.manualMatches[0].quantityComparison.status, 'manual-missing-quantity');
});

test('buildMealPlanShoppingSyncPreview separates generated updates, removals, hidden items, and bought matches', () => {
  const preview = buildMealPlanShoppingSyncPreview({
    batchId: 'batch-1',
    draftItems: [
      { key: 'eggs::pcs', title: 'Eggs', quantityValue: 6, quantityUnit: 'pcs' },
      { key: 'milk::ml', title: 'Milk', quantityValue: 500, quantityUnit: 'ml' },
    ],
    hiddenDraftItems: [
      { key: 'quorn::g', title: 'Quorn pieces', quantityValue: 300, quantityUnit: 'g' },
    ],
    existingTodos: [
      {
        _id: 'todo-eggs-generated',
        title: 'eggs',
        status: 'Open',
        quantityValue: 4,
        quantityUnit: 'pcs',
        sourceType: 'meal_plan',
        sourceBatchId: 'batch-1',
      },
      {
        _id: 'todo-quorn-generated',
        title: 'Quorn pieces',
        status: 'Open',
        quantityValue: 300,
        quantityUnit: 'g',
        sourceType: 'meal_plan',
        sourceBatchId: 'batch-1',
      },
      {
        _id: 'todo-milk-bought',
        title: 'milk',
        status: 'Done',
        quantityValue: 500,
        quantityUnit: 'ml',
        sourceType: '',
        sourceBatchId: null,
      },
    ],
  });

  assert.equal(preview.counts.add, 1);
  assert.equal(preview.addItems[0].item.title, 'Milk');
  assert.equal(preview.counts.update, 1);
  assert.equal(preview.updateItems[0].item.title, 'Eggs');
  assert.equal(preview.counts.remove, 1);
  assert.equal(preview.removeItems[0].item.title, 'Quorn pieces');
  assert.equal(preview.counts.hidden, 1);
  assert.equal(preview.hiddenItems[0].title, 'Quorn pieces');
  assert.equal(preview.counts.boughtMatches, 1);
  assert.equal(preview.boughtMatches[0].primaryTodo._id, 'todo-milk-bought');
  assert.equal(preview.counts.completedGenerated, 0);
});

test('buildMealPlanShoppingSyncPreview reports bought generated rows separately from shopping history', () => {
  const preview = buildMealPlanShoppingSyncPreview({
    batchId: 'batch-1',
    draftItems: [
      { key: 'eggs::pcs', title: 'Eggs', quantityValue: 6, quantityUnit: 'pcs' },
    ],
    existingTodos: [
      {
        _id: 'todo-eggs-generated-done',
        title: 'Eggs',
        status: 'Done',
        quantityValue: 6,
        quantityUnit: 'pcs',
        sourceType: 'meal_plan',
        sourceBatchId: 'batch-1',
      },
    ],
  });

  assert.equal(preview.counts.update, 1);
  assert.equal(preview.counts.completedGenerated, 1);
  assert.equal(preview.counts.boughtMatches, 0);
});
