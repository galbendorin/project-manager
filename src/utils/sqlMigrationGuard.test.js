import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BASELINE_FILENAME,
  stripSqlComments,
  validateMigrationFiles,
} from '../../scripts/check-sql-migrations.mjs';

test('stripSqlComments removes line and block comments while preserving string literals', () => {
  const input = [
    '-- REVOKE EXECUTE ON FUNCTION public.foo() FROM PUBLIC;',
    '/* multi-line',
    '   /* nested */ comment',
    '   REVOKE ALL ON FUNCTION public.bar() FROM PUBLIC;',
    '*/',
    "select '-- keep me', '/* and me */';",
    'revoke all on function public.baz() from public, anon, authenticated;',
  ].join('\n');

  const stripped = stripSqlComments(input);
  assert.match(stripped, /select '-- keep me', '\/\* and me \*\/';/);
  assert.match(stripped, /revoke all on function public\.baz\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(stripped, /public\.foo/);
  assert.doesNotMatch(stripped, /public\.bar/);
});

test('validateMigrationFiles passes for valid baseline and safe REVOKE statement', () => {
  const result = validateMigrationFiles([
    { name: BASELINE_FILENAME, content: '-- baseline\nselect 1;\n' },
    { name: '.gitkeep', content: '' },
    {
      name: '20261128120000_add_safe_rpc.sql',
      content: [
        'begin;',
        'revoke all',
        '  on function public.my_rpc(uuid)',
        '  from public, anon, authenticated;',
        'grant execute on function public.my_rpc(uuid) to service_role;',
        'commit;',
      ].join('\n'),
    },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.checkedCount, 2);
});

test('validateMigrationFiles ignores commented-out and string-literal REVOKE examples', () => {
  const result = validateMigrationFiles([
    { name: BASELINE_FILENAME, content: 'select 1;' },
    {
      name: '20261128120001_commented_example.sql',
      content: [
        '-- Do not use: REVOKE EXECUTE ON FUNCTION public.x() FROM PUBLIC;',
        '/* REVOKE ALL ON FUNCTION public.y() FROM PUBLIC; */',
        "select 'REVOKE ALL ON FUNCTION public.z() FROM PUBLIC;';",
      ].join('\n'),
    },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateMigrationFiles rejects missing baseline, bad names, duplicate timestamps, and non-SQL files', () => {
  const result = validateMigrationFiles([
    { name: '2026-11-28_bad_date.sql', content: 'select 1;' },
    { name: '20261128120000_first.sql', content: 'select 1;' },
    { name: '20261128120000_second.sql', content: 'select 1;' },
    { name: 'notes.txt', content: 'unexpected' },
  ]);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('Invalid migration filename')));
  assert.ok(result.errors.some((e) => e.includes('Duplicate migration timestamp "20261128120000"')));
  assert.ok(result.errors.some((e) => e.includes('Unexpected non-SQL file')));
  assert.ok(result.errors.some((e) => e.includes(`Missing required baseline marker: ${BASELINE_FILENAME}`)));
});

test('validateMigrationFiles rejects REVOKE ... ON FUNCTION ... FROM PUBLIC without anon and authenticated', () => {
  const missingBoth = validateMigrationFiles([
    { name: BASELINE_FILENAME, content: 'select 1;' },
    {
      name: '20261128120002_unsafe_revoke.sql',
      content: 'REVOKE EXECUTE ON FUNCTION public.secret_fn(uuid) FROM PUBLIC;',
    },
  ]);
  assert.equal(missingBoth.ok, false);
  assert.ok(missingBoth.errors.some((e) => e.includes('20261128120002_unsafe_revoke.sql')));

  const missingAuthenticated = validateMigrationFiles([
    { name: BASELINE_FILENAME, content: 'select 1;' },
    {
      name: '20261128120003_partial_revoke.sql',
      content: 'REVOKE ALL ON FUNCTION public.secret_fn(uuid) FROM PUBLIC, anon;',
    },
  ]);
  assert.equal(missingAuthenticated.ok, false);
  assert.ok(missingAuthenticated.errors.some((e) => e.includes('20261128120003_partial_revoke.sql')));
});

test('workspace supabase/migrations passes validateMigrationFiles', async () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => ({
        name: entry.name,
        content: await readFile(path.join(migrationsDir, entry.name), 'utf8'),
      }))
  );

  const result = validateMigrationFiles(files);
  assert.equal(result.ok, true);
  assert.equal(result.checkedCount, 1);
});
