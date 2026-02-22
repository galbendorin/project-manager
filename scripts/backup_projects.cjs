#!/usr/bin/env node

/**
 * Export all projects for the current user into local JSON backups.
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

function sanitizeName(value) {
  return String(value || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'project';
}

async function main() {
  const root = process.cwd();
  readDotEnv(path.join(root, '.env'));

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

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(root, 'backups', ts);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    userId,
    projectCount: projects.length,
    files: []
  };

  for (const project of projects) {
    const fileName = `${sanitizeName(project.name)}__${project.id}.json`;
    const outPath = path.join(outDir, fileName);
    const payload = {
      backupMeta: {
        exportedAt: new Date().toISOString(),
        source: 'project-manager',
        schema: 'projects-v1'
      },
      project
    };
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    manifest.files.push({
      projectId: project.id,
      name: project.name,
      file: fileName,
      updatedAt: project.updated_at
    });
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Backup complete: ${projects.length} project(s)`);
  console.log(`Folder: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
