import test from 'node:test';
import assert from 'node:assert/strict';
import { readAppShortcutIntent } from './appShortcutIntent.js';

test('readAppShortcutIntent returns tasks intent', () => {
  assert.deepEqual(readAppShortcutIntent('?shortcut=tasks'), {
    key: 'tasks',
    initialTab: 'todo',
    openQuickCapture: false,
  });
});

test('readAppShortcutIntent returns capture intent', () => {
  assert.deepEqual(readAppShortcutIntent('?shortcut=capture'), {
    key: 'capture',
    initialTab: 'todo',
    openQuickCapture: true,
  });
});

test('readAppShortcutIntent ignores unknown shortcuts', () => {
  assert.equal(readAppShortcutIntent('?shortcut=unknown'), null);
  assert.equal(readAppShortcutIntent(''), null);
});
