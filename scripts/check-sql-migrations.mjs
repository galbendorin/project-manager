import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const BASELINE_FILENAME = '20261127000000_baseline_marker.sql';
export const MIGRATION_FILENAME_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/;

/**
 * Strip SQL `--` line comments and nested block comments while preserving
 * single-quoted string literals.
 * @param {string} sql
 * @returns {string}
 */
export function stripSqlComments(sql) {
  const source = String(sql || '');
  let out = '';
  let i = 0;
  let inSingleQuote = false;
  let blockDepth = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (blockDepth > 0) {
      if (ch === '/' && next === '*') {
        blockDepth += 1;
        i += 2;
        continue;
      }
      if (ch === '*' && next === '/') {
        blockDepth -= 1;
        i += 2;
        if (blockDepth === 0) out += ' ';
        continue;
      }
      if (ch === '\n') out += '\n';
      i += 1;
      continue;
    }

    if (inSingleQuote) {
      out += ch;
      if (ch === '\'' && next === '\'') {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '\'') {
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (ch === '\'') {
      inSingleQuote = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      i += 2;
      while (i < source.length && source[i] !== '\n') {
        i += 1;
      }
      out += ' ';
      continue;
    }

    if (ch === '/' && next === '*') {
      blockDepth = 1;
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

const maskSingleQuotedStrings = (sql) => String(sql || '').replace(/'(?:''|[^'])*'/g, "''");

const REVOKE_FUNCTION_PATTERN = /\bREVOKE\b[^;]*?\bON\s+FUNCTION\b[^;]*?\bFROM\s+([^;]+)/gi;

/**
 * Validate a list of `{ name, content }` migration file entries.
 * @param {Array<{ name: string, content?: string }>} files
 * @returns {{ ok: boolean, errors: string[], checkedCount: number }}
 */
export function validateMigrationFiles(files = []) {
  const errors = [];
  const seenTimestamps = new Map();
  let sawBaseline = false;
  let checkedCount = 0;

  for (const file of files) {
    const name = String(file?.name || '');
    if (!name || name.startsWith('.')) continue;

    if (!name.endsWith('.sql')) {
      errors.push(`Unexpected non-SQL file in supabase/migrations/: ${name}`);
      continue;
    }

    checkedCount += 1;
    const match = MIGRATION_FILENAME_PATTERN.exec(name);
    if (!match) {
      errors.push(
        `Invalid migration filename "${name}". Expected <14-digit-timestamp>_<snake_case>.sql.`
      );
      continue;
    }

    const timestamp = match[1];
    if (seenTimestamps.has(timestamp)) {
      errors.push(
        `Duplicate migration timestamp "${timestamp}" in "${name}" and "${seenTimestamps.get(timestamp)}".`
      );
    } else {
      seenTimestamps.set(timestamp, name);
    }

    if (name === BASELINE_FILENAME) {
      sawBaseline = true;
    }

    const uncommented = stripSqlComments(file?.content || '');
    const executableSql = maskSingleQuotedStrings(uncommented);
    REVOKE_FUNCTION_PATTERN.lastIndex = 0;

    for (const revokeMatch of executableSql.matchAll(REVOKE_FUNCTION_PATTERN)) {
      const roleClause = String(revokeMatch[1] || '');
      const hasPublic = /\bpublic\b/i.test(roleClause);
      if (!hasPublic) continue;

      const hasAnon = /\banon\b/i.test(roleClause);
      const hasAuthenticated = /\bauthenticated\b/i.test(roleClause);
      if (!hasAnon || !hasAuthenticated) {
        errors.push(
          `${name}: REVOKE ... ON FUNCTION ... FROM PUBLIC must explicitly revoke from PUBLIC, anon, and authenticated.`
        );
      }
    }
  }

  if (!sawBaseline) {
    errors.push(`Missing required baseline marker: ${BASELINE_FILENAME}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    checkedCount,
  };
}

const main = async () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  let entries;
  try {
    entries = await readdir(migrationsDir, { withFileTypes: true });
  } catch (error) {
    console.error(`SQL migration check failed: unable to read ${migrationsDir}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isFile()) {
      console.error(`SQL migration check failed: unexpected directory/entry "${entry.name}" in supabase/migrations/`);
      process.exitCode = 1;
      return;
    }
    const content = entry.name.endsWith('.sql')
      ? await readFile(path.join(migrationsDir, entry.name), 'utf8')
      : '';
    files.push({ name: entry.name, content });
  }

  files.sort((a, b) => a.name.localeCompare(b.name));
  const result = validateMigrationFiles(files);
  if (!result.ok) {
    console.error('SQL migration check failed:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`SQL migration check passed (${result.checkedCount} migration file(s) checked).`);
};

const invokedHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedHref === import.meta.url) {
  await main();
}
