import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const shouldSkipSmoke = args.has('--skip-smoke') || process.env.PREFLIGHT_SKIP_SMOKE === '1';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const regressionsDir = path.join(scriptDir, 'regressions');

const regressionEntries = await readdir(regressionsDir, { withFileTypes: true });
const regressionTestFiles = regressionEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map((entry) => path.relative(repoRoot, path.join(regressionsDir, entry.name)))
  .sort();

if (regressionTestFiles.length === 0) {
  throw new Error(`No regression test files found in ${regressionsDir}`);
}

const commands = [
  ['npm', ['run', 'check:react-hooks']],
  ['npm', ['run', 'lint']],
  ['npm', ['test']],
  ['node', ['--experimental-vm-modules', '--test', ...regressionTestFiles], { TZ: 'Europe/London' }],
  ['npm', ['run', 'build']],
  ...(
    shouldSkipSmoke
      ? []
      : [['npm', ['run', 'smoke:local']]]
  ),
];

const runCommand = (command, commandArgs, extraEnv = {}) => new Promise((resolve, reject) => {
  const label = [command, ...commandArgs].join(' ');
  console.log(`\n> ${label}`);

  const child = spawn(command, commandArgs, {
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`${label} exited with code ${code}`));
  });
});

try {
  for (const [command, commandArgs, extraEnv] of commands) {
    await runCommand(command, commandArgs, extraEnv);
  }

  if (shouldSkipSmoke) {
    console.log('\nSmoke test skipped. Run `npm run smoke:local` with .env.smoke.local or SMOKE_* env vars before pushing live when credentials are available.');
  }

  console.log('\nPreflight complete.');
} catch (error) {
  console.error(`\nPreflight failed: ${error.message || error}`);
  process.exitCode = 1;
}
