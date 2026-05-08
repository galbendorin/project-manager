import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localEnvPath = path.join(repoRoot, '.env.smoke.local');
const smokeOutputDir = path.join(os.tmpdir(), 'pmworkspace-smoke');

const parseEnvValue = (rawValue = '') => {
  const trimmed = rawValue.trim();
  if (trimmed.length < 2) return trimmed;

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const readLocalSmokeEnv = () => {
  if (!fs.existsSync(localEnvPath)) return {};

  const env = {};
  const lines = fs.readFileSync(localEnvPath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalizedLine.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    env[key] = parseEnvValue(normalizedLine.slice(separatorIndex + 1));
  }

  return env;
};

const canExecute = (candidate) => {
  if (!candidate) return false;

  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveBrowserPath = (env) => {
  if (env.SMOKE_BROWSER_PATH) return env.SMOKE_BROWSER_PATH;

  const candidates = [
    path.join(os.tmpdir(), 'ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  return candidates.find(canExecute) || '';
};

const localEnv = readLocalSmokeEnv();
const childEnv = {
  ...process.env,
  ...localEnv,
};

childEnv.SMOKE_BASE_URL = childEnv.SMOKE_BASE_URL || 'https://pmworkspace.com';
childEnv.SMOKE_REPORT_PATH = childEnv.SMOKE_REPORT_PATH || path.join(smokeOutputDir, 'smoke-report.json');
childEnv.SMOKE_SCREENSHOT_DIR = childEnv.SMOKE_SCREENSHOT_DIR || path.join(smokeOutputDir, 'screens');
childEnv.SMOKE_BROWSER_PATH = resolveBrowserPath(childEnv);

console.log(`Smoke base URL: ${childEnv.SMOKE_BASE_URL}`);
console.log(`Smoke account: ${childEnv.SMOKE_EMAIL ? 'configured' : 'missing'}`);
console.log(`Smoke project: ${childEnv.SMOKE_PROJECT_NAME || 'first visible project'}`);
console.log(`Smoke browser: ${childEnv.SMOKE_BROWSER_PATH || 'auto-detect in smoke runner'}`);
console.log(`Smoke report: ${childEnv.SMOKE_REPORT_PATH}`);

if (!fs.existsSync(localEnvPath)) {
  console.warn('No .env.smoke.local file found. Copy .env.smoke.example to .env.smoke.local for authenticated smoke tests.');
}

if (!childEnv.SMOKE_EMAIL || !childEnv.SMOKE_PASSWORD) {
  console.warn('SMOKE_EMAIL and SMOKE_PASSWORD are not both set, so authenticated smoke steps will be skipped.');
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(npmCommand, ['run', 'smoke:user'], {
    cwd: repoRoot,
    env: childEnv,
    stdio: 'inherit',
  });

  child.on('error', reject);
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`Smoke runner stopped with signal ${signal}.`);
      resolve(1);
      return;
    }

    resolve(code ?? 1);
  });
});

process.exitCode = exitCode;
