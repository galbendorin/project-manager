import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineDescription, matrixPlacement } from './todoEisenhower.js';
import { matchesTodoFocusView } from './todoCommandCentre.js';
import { readCompleteTodoRows } from './todoSourceLoading.js';
import { normalizeMatrixHeights } from './todoMatrixLayout.js';
import { shouldClearUserOfflineKey } from './offlineState.js';
const id = '11111111-1111-4111-8111-111111111111';
const todo = { _id: id, dueDate: '2026-11-20', status: 'Open' };
test('a future or undated task personally planned today appears without changing its deadline/priority', () => {
  const preferences = { [`manual:${id}`]: { planned_day: '2026-10-05', manual_quadrant: 'urgent_not_important' } };
  for (const dueDate of [todo.dueDate, '']) {
    const task = { ...todo, dueDate };
    assert.equal(matchesTodoFocusView(task, 'today', { today: '2026-10-05', preferences }), true);
    assert.equal(matrixPlacement(task, preferences[`manual:${id}`], '2026-10-05').quadrant, 'urgent_not_important');
    assert.equal(matchesTodoFocusView(task, 'today', { today: '2026-10-06', preferences }), false);
  }
  assert.equal(todo.dueDate, '2026-11-20');
});
test('removing personal selection cannot hide due work, and strict invalid dates do not become deadlines', () => {
  assert.equal(matchesTodoFocusView({ ...todo, dueDate: '2026-10-01' }, 'today', { today: '2026-10-05' }), true);
  assert.equal(matrixPlacement({ ...todo, dueDate: '2026-10-05' }, null, '2026-10-05').deadlinePriority, true);
  assert.equal(matchesTodoFocusView({ ...todo, dueDate: '2026-02-31' }, 'today', { today: '2026-10-05' }), false);
  assert.equal(matchesTodoFocusView(todo, 'today', { today: '2026-10-05', preferences: { [`manual:${id}`]: { planned_day: '2026-02-31' } } }), false);
});
test('deadline wording distinguishes due today and uses calendar days across daylight saving', () => {
  assert.match(deadlineDescription({ ...todo, dueDate: '2026-10-05' }, '2026-10-05'), /^Due today/);
  assert.match(deadlineDescription({ ...todo, dueDate: '2026-10-24' }, '2026-10-26'), /2 days late$/);
  assert.match(deadlineDescription({ ...todo, dueDate: '2026-10-04' }, '2026-10-05'), /1 day late$/);
  assert.equal(deadlineDescription({ ...todo, dueDate: '' }, '2026-10-05'), 'No deadline');
});
test('complete reads page past a smaller server cap, and reject changed/duplicate/missing counts', async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `${i}` }));
  const ranges = [];
  const result = await readCompleteTodoRows(() => ({ range(a) { ranges.push(a); return { data: rows.slice(a, a + 2), count: rows.length }; } }));
  assert.deepEqual(result.data, rows); assert.deepEqual(ranges, [0, 2, 4, 6]);
  assert.ok((await readCompleteTodoRows(() => ({ range() { return { data: [], count: null }; } }))).error);
  assert.ok((await readCompleteTodoRows(() => ({ range() { return { data: [rows[0]], count: 2 }; } }))).error);
  assert.ok((await readCompleteTodoRows(() => ({ range(a) { return { data: [rows[a]], count: a ? 3 : 2 }; } }))).error);
  assert.ok((await readCompleteTodoRows(() => ({ range() { throw new Error('Network failure'); } }))).error);
});
test('layout storage validates numbers, separates limits and only clears the leaving owner', () => {
  const raw = { urgent_important: 650, not_urgent_important: Infinity, urgent_not_important: '500', not_urgent_not_important: 1 };
  assert.deepEqual(Object.values(normalizeMatrixHeights(raw, true)), [600, 340, 340, 240]);
  assert.deepEqual(Object.values(normalizeMatrixHeights(raw, false)), [650, 420, 420, 240]);
  assert.equal(shouldClearUserOfflineKey(`pmworkspace:todo-matrix-layout:v1:${id}`, id), true);
  assert.equal(shouldClearUserOfflineKey('pmworkspace:todo-matrix-layout:v1:someone-else', id), false);
});
