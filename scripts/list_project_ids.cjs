#!/usr/bin/env node

/**
 * List project IDs for the currently authenticated backup user.
 * Useful before restore.
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

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error(`Fetch failed: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No projects found for this user.');
    return;
  }

  console.log('Projects:');
  for (const p of data) {
    console.log(`- ${p.name} | ${p.id} | updated ${p.updated_at}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
