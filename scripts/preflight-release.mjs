import { spawn } from 'node:child_process';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const shouldSkipSmoke = args.has('--skip-smoke') || process.env.PREFLIGHT_SKIP_SMOKE === '1';

const commands = [
  ['npm', ['run', 'check:react-hooks']],
  ['npm', ['run', 'lint']],
  ['npm', ['test']],
  ['npm', ['run', 'build']],
  ...(
    shouldSkipSmoke
      ? []
      : [['npm', ['run', 'smoke:user']]]
  ),
];

const runCommand = (command, commandArgs) => new Promise((resolve, reject) => {
  const label = [command, ...commandArgs].join(' ');
  console.log(`\n> ${label}`);

  const child = spawn(command, commandArgs, {
    env: process.env,
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
  for (const [command, commandArgs] of commands) {
    await runCommand(command, commandArgs);
  }

  if (shouldSkipSmoke) {
    console.log('\nSmoke test skipped. Run `npm run smoke:user` with SMOKE_* env vars before pushing live when credentials are available.');
  }

  console.log('\nPreflight complete.');
} catch (error) {
  console.error(`\nPreflight failed: ${error.message || error}`);
  process.exitCode = 1;
}
