import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  parseVerifyArgs,
  verifyProjectBackupDir,
} from '../../scripts/verify-project-backup.mjs';

const require = createRequire(import.meta.url);
const {
  computeSha256,
  parseBackupArgs,
  pruneBackupDirectories,
} = require('../../scripts/backup_projects.cjs');

test('backup_projects CLI argument parsing supports --out-dir and validates --keep', () => {
  assert.deepEqual(parseBackupArgs([]), { outDir: null, keep: null });
  assert.deepEqual(
    parseBackupArgs(['--out-dir', '/tmp/pmw-out', '--keep', '4']),
    { outDir: '/tmp/pmw-out', keep: 4 },
  );

  assert.deepEqual(
    parseBackupArgs(['--out-dir=/tmp/pmw-out', '--keep=6']),
    { outDir: '/tmp/pmw-out', keep: 6 },
  );

  assert.throws(() => parseBackupArgs(['--out-dir']), /Missing value for --out-dir/);
  assert.throws(() => parseBackupArgs(['--keep', '0']), /positive integer/);
  assert.throws(() => parseBackupArgs(['--keep', 'abc']), /positive integer/);
  assert.throws(() => parseBackupArgs(['--unknown-flag']), /Unknown backup flag/);
});

test('pruneBackupDirectories retains newest N ISO backup directories and preserves logs and pre-restore folders', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pmw-prune-'));
  try {
    const names = [
      '2026-10-01T03-00-00-000Z',
      '2026-10-08T03-00-00-000Z',
      '2026-10-15T03-00-00-000Z',
      '2026-10-22T03-00-00-000Z',
      '_pre_restore_2026-10-23T01-00-00-000Z',
      'logs',
    ];
    await Promise.all(names.map((name) => mkdir(path.join(root, name), { recursive: true })));

    const result = pruneBackupDirectories(root, 2);
    assert.deepEqual(result.removed, [
      '2026-10-01T03-00-00-000Z',
      '2026-10-08T03-00-00-000Z',
    ]);
    assert.deepEqual(result.kept, [
      '2026-10-15T03-00-00-000Z',
      '2026-10-22T03-00-00-000Z',
    ]);

    const { readdirSync } = await import('node:fs');
    const remaining = readdirSync(root).sort();
    assert.deepEqual(remaining, [
      '2026-10-15T03-00-00-000Z',
      '2026-10-22T03-00-00-000Z',
      '_pre_restore_2026-10-23T01-00-00-000Z',
      'logs',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyProjectBackupDir validates manifest, sha256 checksums, project IDs, and blocks tampering or traversal', async () => {
  const backupDir = await mkdtemp(path.join(os.tmpdir(), 'pmw-verify-'));
  try {
    const projectContent = `${JSON.stringify({
      backupMeta: { exportedAt: '2026-11-28T03:00:00.000Z', schema: 'projects-v1' },
      project: { id: 'proj-1', name: 'Household Plan', tasks: [] },
    }, null, 2)}\n`;
    const fileName = 'household-plan__proj-1.json';
    await writeFile(path.join(backupDir, fileName), projectContent, 'utf8');

    const manifest = {
      format: 'projects-v1',
      generatedAt: '2026-11-28T03:00:00.000Z',
      projectCount: 1,
      files: [
        {
          projectId: 'proj-1',
          name: 'Household Plan',
          file: fileName,
          sha256: computeSha256(projectContent),
          updatedAt: '2026-11-28T02:00:00.000Z',
        },
      ],
    };
    await writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    assert.equal(parseVerifyArgs(['--dir', backupDir]), backupDir);
    assert.equal(parseVerifyArgs([backupDir]), backupDir);

    const ok = await verifyProjectBackupDir(backupDir);
    assert.equal(ok.ok, true);
    assert.equal(ok.fileCount, 1);

    // Tampered file fails SHA-256 verification.
    await writeFile(path.join(backupDir, fileName), `${projectContent}\n`, 'utf8');
    await assert.rejects(() => verifyProjectBackupDir(backupDir), /Checksum mismatch/);

    // Missing checksum in projects-v1 manifest must fail instead of skipping verification.
    await writeFile(path.join(backupDir, fileName), projectContent, 'utf8');
    const missingShaManifest = {
      ...manifest,
      files: [{ ...manifest.files[0], sha256: '' }],
    };
    await writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(missingShaManifest), 'utf8');
    await assert.rejects(() => verifyProjectBackupDir(backupDir), /Missing or invalid sha256 checksum/);

    // Path traversal rejection.
    const traversalManifest = {
      ...manifest,
      files: [{ ...manifest.files[0], file: '../outside.json' }],
    };
    await writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(traversalManifest), 'utf8');
    await assert.rejects(() => verifyProjectBackupDir(backupDir), /escapes target directory/);

    // Missing manifest fails.
    await rm(path.join(backupDir, 'manifest.json'));
    await assert.rejects(() => verifyProjectBackupDir(backupDir), /Invalid or missing manifest\.json/);
  } finally {
    await rm(backupDir, { recursive: true, force: true });
  }
});
