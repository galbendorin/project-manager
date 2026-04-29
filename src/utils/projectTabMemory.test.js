import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultProjectTab,
  getStoredProjectTab,
  projectTabMemoryKey,
  saveStoredProjectTab,
} from './projectTabMemory.js';

const createMemoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
};

test('project tab memory returns schedule when no project preference exists', () => {
  const storage = createMemoryStorage();

  assert.equal(getStoredProjectTab('project-1', storage), defaultProjectTab);
});

test('project tab memory saves and reads the last tab per project', () => {
  const storage = createMemoryStorage();

  assert.equal(saveStoredProjectTab('project-1', 'todo', storage), true);
  assert.equal(saveStoredProjectTab('project-2', 'tracker', storage), true);

  assert.equal(getStoredProjectTab('project-1', storage), 'todo');
  assert.equal(getStoredProjectTab('project-2', storage), 'tracker');
});

test('project tab memory ignores invalid stored tabs safely', () => {
  const storage = createMemoryStorage();
  storage.setItem(projectTabMemoryKey, JSON.stringify({ 'project-1': 'unknown-tab' }));

  assert.equal(getStoredProjectTab('project-1', storage), defaultProjectTab);
});
