import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTodoReorderPosition,
  canReorderTodo,
  getTodoOrderValue,
  sortTodosForManualOrder,
  TODO_ORDER_STEP,
} from './todoManualOrdering.js';

test('canReorderTodo allows open task cards and blocks completed/external views', () => {
  assert.equal(canReorderTodo({ _id: '1', status: 'Open', isDerived: false }), true);
  assert.equal(canReorderTodo({ _id: '1', status: 'Done', isDerived: false }), false);
  assert.equal(canReorderTodo({ _id: '1', status: 'Open', isDerived: true }), true);
  assert.equal(canReorderTodo({ _id: '1', status: 'Open', isDerived: false }, { isExternalView: true }), false);
});

test('sortTodosForManualOrder keeps unpositioned tasks stable and applies saved positions', () => {
  const items = [
    { _id: 'a', title: 'Third', status: 'Open', dueDate: '2026-06-01', kanbanPosition: 3072 },
    { _id: 'b', title: 'First', status: 'Open', dueDate: '2026-06-01', kanbanPosition: 1024 },
    { _id: 'c', title: 'Second', status: 'Open', dueDate: '2026-06-01', kanbanPosition: 2048 },
  ];

  assert.deepEqual(sortTodosForManualOrder(items).map((item) => item._id), ['b', 'c', 'a']);
});

test('getTodoOrderValue falls back to spaced positions', () => {
  assert.equal(getTodoOrderValue({}, 0), TODO_ORDER_STEP);
  assert.equal(getTodoOrderValue({}, 2), TODO_ORDER_STEP * 3);
  assert.equal(getTodoOrderValue({ kanbanPosition: 12.5 }, 2), 12.5);
  assert.equal(getTodoOrderValue({ boardPosition: 8, kanbanPosition: 12.5 }, 2), 8);
});

test('calculateTodoReorderPosition creates a value between neighbouring tasks', () => {
  const items = [
    { _id: 'a', status: 'Open', kanbanPosition: 1024 },
    { _id: 'b', status: 'Open', kanbanPosition: 2048 },
  ];

  assert.equal(calculateTodoReorderPosition(items, 1), 1536);
});

test('calculateTodoReorderPosition creates top and bottom positions', () => {
  const items = [
    { _id: 'a', status: 'Open', kanbanPosition: 1024 },
    { _id: 'b', status: 'Open', kanbanPosition: 2048 },
  ];

  assert.equal(calculateTodoReorderPosition(items, 0), 512);
  assert.equal(calculateTodoReorderPosition(items, 2), 3072);
});
