import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChunkRecoveryUrl,
  CHUNK_LOAD_GUARD_KEY,
  CHUNK_RECOVERY_QUERY_PARAM,
  isLikelyChunkLoadFailure,
  shouldAttemptChunkRecoveryReload,
  stripChunkRecoveryParam,
} from './appUpdateRecovery.js';

test('isLikelyChunkLoadFailure detects common dynamic import failures', () => {
  assert.equal(isLikelyChunkLoadFailure('TypeError: Failed to fetch dynamically imported module'), true);
  assert.equal(isLikelyChunkLoadFailure('Importing a module script failed.'), true);
  assert.equal(isLikelyChunkLoadFailure('ChunkLoadError: Loading chunk 42 failed'), true);
});

test('isLikelyChunkLoadFailure ignores unrelated errors', () => {
  assert.equal(isLikelyChunkLoadFailure('Network request failed'), false);
  assert.equal(isLikelyChunkLoadFailure({ message: 'Something else went wrong' }), false);
});

test('shouldAttemptChunkRecoveryReload only allows likely failures once per session', () => {
  const storage = {
    values: new Map(),
    getItem(key) {
      return this.values.has(key) ? this.values.get(key) : null;
    },
    setItem(key, value) {
      this.values.set(key, value);
    }
  };

  assert.equal(
    shouldAttemptChunkRecoveryReload('TypeError: Failed to fetch dynamically imported module', storage, true),
    true
  );

  storage.setItem(CHUNK_LOAD_GUARD_KEY, '1');
  assert.equal(
    shouldAttemptChunkRecoveryReload('TypeError: Failed to fetch dynamically imported module', storage, true),
    false
  );
  assert.equal(
    shouldAttemptChunkRecoveryReload('TypeError: Failed to fetch dynamically imported module', { getItem: () => null }, false),
    false
  );
});

test('buildChunkRecoveryUrl adds a cache-busting recovery parameter', () => {
  const url = buildChunkRecoveryUrl({
    origin: 'https://pmworkspace.com',
    pathname: '/shopping',
    search: '?foo=bar',
    hash: '#list'
  }, 123);

  assert.match(url, /pmw-recover=123/);
  assert.match(url, /foo=bar/);
  assert.match(url, /#list$/);
});

test('stripChunkRecoveryParam removes the recovery query parameter only', () => {
  const cleaned = stripChunkRecoveryParam({
    origin: 'https://pmworkspace.com',
    pathname: '/shopping',
    search: `?foo=bar&${CHUNK_RECOVERY_QUERY_PARAM}=123`,
    hash: '#list'
  });

  assert.equal(cleaned, '/shopping?foo=bar#list');
});
