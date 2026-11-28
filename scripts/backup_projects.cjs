#!/usr/bin/env node

/**
 * Export all projects for the current user into local JSON backups.
 *
 * Usage:
 *   node scripts/backup_projects.cjs [--out-dir <dir>] [--keep <N>]
 *
 * Requires env:
 *  - VITE_SUPABASE_URL
 *  - VITE_SUPABASE_ANON_KEY
 *  - BACKUP_USER_EMAIL
 *  - BACKUP_USER_PASSWORD
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const ISO_BACKUP_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3}Z)?$/;

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function sanitizeName(value) {
  return String(value || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'project';
}

function parseBackupArgs(argv = []) {
  const args = { outDir: null, keep: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--out-dir' || token.startsWith('--out-dir=')) {
      const value = (token.startsWith('--out-dir=') ? token.slice('--out-dir='.length) : String(argv[i + 1] || '')).trim();
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --out-dir');
      }
      args.outDir = value;
      if (token === '--out-dir') i += 1;
    } else if (token === '--keep' || token.startsWith('--keep=')) {
      const rawKeep = (token.startsWith('--keep=') ? token.slice('--keep='.length) : String(argv[i + 1] || '')).trim();
      const parsed = Number(rawKeep);
      if (!rawKeep || !Number.isInteger(parsed) || parsed < 1) {
        throw new Error('--keep requires a positive integer >= 1');
      }
      args.keep = parsed;
      if (token === '--keep') i += 1;
    } else if (token.startsWith('--')) {
      throw new Error(`Unknown backup flag: ${token}`);
    }
  }
  return args;
}

function computeSha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function pruneBackupDirectories(backupsRoot, keepCount) {
  if (!Number.isInteger(keepCount) || keepCount < 1 || !fs.existsSync(backupsRoot)) {
    return { kept: [], removed: [] };
  }

  const dirs = fs.readdirSync(backupsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ISO_BACKUP_DIR_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (dirs.length <= keepCount) {
    return { kept: dirs, removed: [] };
  }

  const splitIndex = dirs.length - keepCount;
  const removed = dirs.slice(0, splitIndex);
  const kept = dirs.slice(splitIndex);

  for (const name of removed) {
    fs.rmSync(path.join(backupsRoot, name), { recursive: true, force: true });
  }

  return { kept, removed };
}

function writeSecureFile(filePath, content) {
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

async function main() {
  const root = process.cwd();
  readDotEnv(path.join(root, '.env'));

  const args = parseBackupArgs(process.argv.slice(2));
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.BACKUP_USER_EMAIL;
  const password = process.env.BACKUP_USER_PASSWORD;

  if (!url || !anon || !email || !password) {
    console.error('Missing env vars. Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, BACKUP_USER_EMAIL, BACKUP_USER_PASSWORD');
    process.exit(1);
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError || !authData?.user) {
    console.error(`Login failed: ${authError ? authError.message : 'Unknown auth error'}`);
    process.exit(1);
  }

  const userId = authData.user.id;

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, user_id, tasks, registers, baseline, tracker, status_report, version, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  const backupsRoot = path.join(root, 'backups');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = args.outDir
    ? (path.isAbsolute(args.outDir) ? args.outDir : path.join(root, args.outDir))
    : path.join(backupsRoot, ts);

  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outDir, 0o700);

  const exportedAt = new Date().toISOString();
  const manifest = {
    format: 'projects-v1',
    generatedAt: exportedAt,
    userId,
    projectCount: projects.length,
    files: []
  };

  for (const project of projects) {
    const fileName = `${sanitizeName(project.name)}__${project.id}.json`;
    const outPath = path.join(outDir, fileName);
    const payload = {
      backupMeta: {
        exportedAt,
        source: 'project-manager',
        schema: 'projects-v1'
      },
      project
    };
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    writeSecureFile(outPath, serialized);
    manifest.files.push({
      projectId: project.id,
      name: project.name,
      file: fileName,
      sha256: computeSha256(serialized),
      updatedAt: project.updated_at
    });
  }

  writeSecureFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (!args.outDir && args.keep) {
    const pruned = pruneBackupDirectories(backupsRoot, args.keep);
    if (pruned.removed.length > 0) {
      console.log(`Pruned ${pruned.removed.length} older backup folder(s).`);
    }
  }

  console.log(`Backup complete: ${projects.length} project(s)`);
  console.log(`Folder: ${outDir}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  ISO_BACKUP_DIR_PATTERN,
  computeSha256,
  main,
  parseBackupArgs,
  pruneBackupDirectories,
  sanitizeName,
};
