#!/usr/bin/env node

/**
 * Restore a single project from backup JSON.
 *
 * Usage:
 *   node scripts/restore_project.cjs --file backups/<timestamp>/<name>__<id>.json [--backup-current]
 *
 * Requires env:
 *  - VITE_SUPABASE_URL
 *  - VITE_SUPABASE_ANON_KEY
 *  - BACKUP_USER_EMAIL
 *  - BACKUP_USER_PASSWORD
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

function parseArgs(argv) {
  const args = { file: null, backupCurrent: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i] || null;
    else if (a === '--backup-current') args.backupCurrent = true;
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const root = process.cwd();
  readDotEnv(path.join(root, '.env'));

  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error('Missing --file argument. Example: node scripts/restore_project.cjs --file backups/2026-02-21T23-00-00-000Z/my-project__uuid.json');
    process.exit(1);
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.join(root, args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Backup file not found: ${filePath}`);
    process.exit(1);
  }

  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.BACKUP_USER_EMAIL;
  const password = process.env.BACKUP_USER_PASSWORD;

  if (!url || !anon || !email || !password) {
    console.error('Missing env vars. Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, BACKUP_USER_EMAIL, BACKUP_USER_PASSWORD');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const project = raw?.project;
  if (!project?.id || !project?.name) {
    console.error('Invalid backup file format. Expected { project: { id, name, ... } }.');
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

  const { data: current, error: currentError } = await supabase
    .from('projects')
    .select('id, name, user_id, tasks, registers, baseline, tracker, status_report, version, created_at, updated_at')
    .eq('id', project.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (currentError) {
    console.error(`Failed to check current project: ${currentError.message}`);
    process.exit(1);
  }

  if (!current) {
    console.error('Project not found for this user. Restore only supports existing owned project IDs.');
    process.exit(1);
  }

  if (args.backupCurrent) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safetyDir = path.join(root, 'backups', `_pre_restore_${ts}`);
    ensureDir(safetyDir);
    const safetyFile = path.join(safetyDir, `${String(current.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}__${current.id}.json`);
    fs.writeFileSync(safetyFile, `${JSON.stringify({ backupMeta: { exportedAt: new Date().toISOString(), source: 'pre-restore-safety' }, project: current }, null, 2)}\n`, 'utf8');
    console.log(`Safety backup written: ${safetyFile}`);
  }

  const updatePayload = {
    tasks: project.tasks || [],
    registers: project.registers || {
      risks: [], issues: [], actions: [], minutes: [], costs: [], changes: [], comms: []
    },
    baseline: project.baseline || null,
    tracker: project.tracker || [],
    status_report: project.status_report || {},
    updated_at: new Date().toISOString()
  };

  let query = supabase
    .from('projects')
    .update(updatePayload)
    .eq('id', project.id)
    .eq('user_id', userId)
    .select('id, name, updated_at')
    .single();

  if (Number.isInteger(current.version)) {
    query = supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', project.id)
      .eq('user_id', userId)
      .eq('version', current.version)
      .select('id, name, updated_at')
      .single();
  }

  const { data: updated, error: updateError } = await query;

  if (updateError) {
    console.error(`Restore failed: ${updateError.message}`);
    process.exit(1);
  }

  console.log(`Restore complete for project: ${updated.name} (${updated.id})`);
  console.log(`Updated at: ${updated.updated_at}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
