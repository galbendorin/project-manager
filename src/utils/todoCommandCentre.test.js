import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TODO_FOCUS_VIEWS,
  getTodoFocusCounts,
  isShoppingListProject,
  matchesTodoFocusView,
  mergeManualTodoCollections,
  normalizeTodoFocusView,
} from './todoCommandCentre.js';

test('normalizeTodoFocusView rejects unsupported saved values', () => {
  assert.equal(normalizeTodoFocusView(TODO_FOCUS_VIEWS.today), TODO_FOCUS_VIEWS.today);
  assert.equal(normalizeTodoFocusView('unknown'), TODO_FOCUS_VIEWS.all);
});

test('today focus includes overdue and due-today tasks only', () => {
  const options = { today: '2026-07-15' };
  assert.equal(matchesTodoFocusView({ dueDate: '2026-07-14' }, TODO_FOCUS_VIEWS.today, options), true);
  assert.equal(matchesTodoFocusView({ dueDate: '2026-07-15' }, TODO_FOCUS_VIEWS.today, options), true);
  assert.equal(matchesTodoFocusView({ dueDate: '2026-07-16' }, TODO_FOCUS_VIEWS.today, options), false);
  assert.equal(matchesTodoFocusView({ dueDate: '' }, TODO_FOCUS_VIEWS.today, options), false);
});

test('next seven days includes today through day six', () => {
  const options = { today: '2026-07-15' };
  assert.equal(matchesTodoFocusView({ dueDate: '2026-07-15' }, TODO_FOCUS_VIEWS.nextSevenDays, options), true);
  assert.equal(matchesTodoFocusView({ dueDate: '2026-07-21' }, TODO_FOCUS_VIEWS.nextSevenDays, options), true);
  assert.equal(matchesTodoFocusView({ dueDate: '2026-07-22' }, TODO_FOCUS_VIEWS.nextSevenDays, options), false);
});

test('my work matches stable user ids and owner names', () => {
  const options = { currentUserId: 'user-1', currentUserName: 'Dorin Alben' };
  assert.equal(matchesTodoFocusView({ assigneeUserId: 'user-1' }, TODO_FOCUS_VIEWS.mine, options), true);
  assert.equal(matchesTodoFocusView({ owner: ' dorin alben ' }, TODO_FOCUS_VIEWS.mine, options), true);
  assert.equal(matchesTodoFocusView({ owner: 'Someone Else' }, TODO_FOCUS_VIEWS.mine, options), false);
});

test('focus counts provide predictable preset badges', () => {
  const items = [
    { dueDate: '2026-07-14', owner: 'Dorin Alben' },
    { dueDate: '2026-07-15', assigneeUserId: 'user-1' },
    { dueDate: '2026-07-18', owner: 'Someone Else' },
    { dueDate: '', owner: 'Someone Else' },
  ];
  const counts = getTodoFocusCounts(items, {
    today: '2026-07-15',
    currentUserId: 'user-1',
    currentUserName: 'Dorin Alben',
  });

  assert.deepEqual(counts, {
    today: 2,
    mine: 2,
    'next-seven-days': 2,
    all: 4,
  });
});

test('Shopping List projects stay out of the professional task command centre', () => {
  assert.equal(isShoppingListProject({ name: 'Shopping List' }), true);
  assert.equal(isShoppingListProject({ name: ' shopping list ' }), true);
  assert.equal(isShoppingListProject({ name: 'Client rollout' }), false);
});

test('manual task collections merge by id with newer collections winning', () => {
  assert.deepEqual(
    mergeManualTodoCollections(
      [{ _id: 'one', title: 'Old' }, { _id: 'two', title: 'Two' }],
      [{ _id: 'one', title: 'New' }]
    ),
    [{ _id: 'one', title: 'New' }, { _id: 'two', title: 'Two' }]
  );
});
