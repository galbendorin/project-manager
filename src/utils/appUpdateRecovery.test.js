import test from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyChunkLoadFailure } from './appUpdateRecovery.js';

test('isLikelyChunkLoadFailure detects common dynamic import failures', () => {
  assert.equal(isLikelyChunkLoadFailure('TypeError: Failed to fetch dynamically imported module'), true);
  assert.equal(isLikelyChunkLoadFailure('Importing a module script failed.'), true);
  assert.equal(isLikelyChunkLoadFailure('ChunkLoadError: Loading chunk 42 failed'), true);
});

test('isLikelyChunkLoadFailure ignores unrelated errors', () => {
  assert.equal(isLikelyChunkLoadFailure('Network request failed'), false);
  assert.equal(isLikelyChunkLoadFailure({ message: 'Something else went wrong' }), false);
});
