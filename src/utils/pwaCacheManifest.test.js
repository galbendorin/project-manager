import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPrecacheUrls,
  injectServiceWorkerManifest,
} from './pwaCacheManifest.js';

test('buildPrecacheUrls normalizes, sorts, and excludes service worker build files', () => {
  assert.deepEqual(buildPrecacheUrls([
    'assets/app-123.js',
    '/index.html',
    './manifest.webmanifest',
    'assets/app-123.js',
    'sw.js',
    'assets/app-123.js.map',
  ]), [
    '/assets/app-123.js',
    '/index.html',
    '/manifest.webmanifest',
  ]);
});

test('injectServiceWorkerManifest writes a valid version and precache list', () => {
  const source = [
    "const PRECACHE_VERSION = '__PM_CACHE_VERSION__';",
    'const PRECACHE_URLS = /* __PM_PRECACHE_MANIFEST__ */ [];',
  ].join('\n');

  const result = injectServiceWorkerManifest(source, {
    version: 'abc123',
    urls: ['index.html', 'assets/app.js'],
  });

  assert.match(result, /const PRECACHE_VERSION = "abc123";/);
  assert.match(result, /\["\/assets\/app\.js","\/index\.html"\]/);
  assert.doesNotMatch(result, /__PM_CACHE_VERSION__|__PM_PRECACHE_MANIFEST__/);
});

test('injectServiceWorkerManifest fails closed when the source template is invalid', () => {
  assert.throws(
    () => injectServiceWorkerManifest('const cache = [];', { version: 'abc', urls: [] }),
    /placeholders are missing/
  );
});
