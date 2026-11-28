#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseVerifyArgs(argv = []) {
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dir') {
      const target = String(argv[i + 1] || '').trim();
      if (!target) throw new Error('Missing value for --dir');
      return target;
    }
    if (!token.startsWith('--')) {
      return token;
    }
  }
  throw new Error('Usage: node scripts/verify-project-backup.mjs <backup-dir>');
}

export async function verifyProjectBackupDir(backupDir) {
  const resolvedDir = path.resolve(String(backupDir || ''));
  const dirStat = await stat(resolvedDir).catch(() => null);
  if (!dirStat?.isDirectory()) {
    throw new Error(`Backup directory not found: ${resolvedDir}`);
  }

  const manifestPath = path.join(resolvedDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid or missing manifest.json: ${error.message}`);
  }

  if (!Array.isArray(manifest?.files)) {
    throw new Error('manifest.json must contain a files array');
  }

  const requiresV1Checksums = manifest.format === 'projects-v1';
  if (requiresV1Checksums && !Number.isInteger(manifest.projectCount)) {
    throw new Error('projects-v1 manifest.json must contain an integer projectCount');
  }
  if (Number.isInteger(manifest.projectCount) && manifest.projectCount !== manifest.files.length) {
    throw new Error(`manifest.projectCount (${manifest.projectCount}) does not match files length (${manifest.files.length})`);
  }

  for (const entry of manifest.files) {
    const relFile = String(entry?.file || '').trim();
    if (!relFile || path.isAbsolute(relFile)) {
      throw new Error(`Invalid backup entry file path: ${relFile || '<empty>'}`);
    }

    const filePath = path.resolve(resolvedDir, relFile);
    if (path.dirname(filePath) !== resolvedDir && !filePath.startsWith(`${resolvedDir}${path.sep}`)) {
      throw new Error(`Backup entry escapes target directory: ${relFile}`);
    }

    const rawBytes = await readFile(filePath);
    const hasSha = typeof entry.sha256 === 'string' && entry.sha256.length > 0;
    if (requiresV1Checksums && !/^[a-f0-9]{64}$/i.test(String(entry.sha256 || ''))) {
      throw new Error(`Missing or invalid sha256 checksum for ${relFile}`);
    }
    if (hasSha) {
      const actualSha256 = createHash('sha256').update(rawBytes).digest('hex');
      if (actualSha256 !== entry.sha256.toLowerCase()) {
        throw new Error(`Checksum mismatch for ${relFile}`);
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(rawBytes.toString('utf8'));
    } catch (error) {
      throw new Error(`Corrupt JSON in ${relFile}: ${error.message}`);
    }

    if (!parsed?.project?.id || parsed.project.id !== entry.projectId) {
      throw new Error(`Project ID mismatch in ${relFile}`);
    }
    if (typeof parsed.project.name !== 'string' || !parsed.project.name.trim()) {
      throw new Error(`Missing project.name in ${relFile}`);
    }
  }

  return {
    ok: true,
    dir: resolvedDir,
    format: manifest.format || 'projects-v1',
    fileCount: manifest.files.length,
    verifiedAt: new Date().toISOString(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const targetDir = parseVerifyArgs(process.argv.slice(2));
    const result = await verifyProjectBackupDir(targetDir);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`Backup verification failed: ${error?.message || error}`);
    process.exit(1);
  }
}
