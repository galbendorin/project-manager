import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaskChecklistScopeKey,
  calculateTaskChecklistPosition,
  parseChecklistItemLines,
  sortTaskChecklistItems,
  summarizeTaskChecklists,
} from './taskCardChecklists.js';

test('buildTaskChecklistScopeKey keeps project and personal task cards separate', () => {
  assert.equal(buildTaskChecklistScopeKey('project-1', 'manual:todo-1'), 'project-1::manual:todo-1');
  assert.equal(buildTaskChecklistScopeKey(null, 'manual:todo-1'), 'personal::manual:todo-1');
});

test('parseChecklistItemLines accepts plain, bullet, numbered, and checkbox pasted lines', () => {
  assert.deepEqual(
    parseChecklistItemLines('First\n- Second\n2. Third\n[x] Fourth\n\n'),
    ['First', 'Second', 'Third', 'Fourth']
  );
});

test('sortTaskChecklistItems uses numeric position before creation time', () => {
  const ordered = sortTaskChecklistItems([
    { id: 'b', position: 2048, createdAt: '2026-05-02T10:00:00.000Z' },
    { id: 'a', position: 1024, createdAt: '2026-05-02T11:00:00.000Z' },
  ]);

  assert.deepEqual(ordered.map((item) => item.id), ['a', 'b']);
});

test('calculateTaskChecklistPosition inserts between neighboring items', () => {
  assert.equal(calculateTaskChecklistPosition([], 0), 1024);
  assert.equal(calculateTaskChecklistPosition([{ position: 1024 }], 0), 0);
  assert.equal(calculateTaskChecklistPosition([{ position: 1024 }], 1), 2048);
  assert.equal(calculateTaskChecklistPosition([{ position: 1024 }, { position: 2048 }], 1), 1536);
});

test('summarizeTaskChecklists returns total, completed, percent and complete flag', () => {
  assert.deepEqual(
    summarizeTaskChecklists([
      { items: [{ checked: true }, { checked: false }] },
      { items: [{ checked: true }] },
    ]),
    { completed: 2, total: 3, percent: 67, isComplete: false }
  );

  assert.deepEqual(
    summarizeTaskChecklists([{ items: [{ checked: true }] }]),
    { completed: 1, total: 1, percent: 100, isComplete: true }
  );
});
