import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const DEFAULT_BASE_URL = 'https://pmworkspace.com';
const DEFAULT_VIEWPORT = { width: 1440, height: 1080 };
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_BROWSER_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const parseArgs = (argv) => {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.trim();

    if (!key) continue;

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const nextValue = argv[index + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      options[key] = 'true';
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }

  return options;
};

const args = parseArgs(process.argv.slice(2));
const baseUrl = String(args['base-url'] || process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const smokeEmail = String(args.email || process.env.SMOKE_EMAIL || '').trim();
const smokePassword = String(args.password || process.env.SMOKE_PASSWORD || '').trim();
const smokeProjectName = String(args.project || process.env.SMOKE_PROJECT_NAME || '').trim();
const reportPath = String(args.report || process.env.SMOKE_REPORT_PATH || '').trim();
const screenshotDir = String(args['screenshot-dir'] || process.env.SMOKE_SCREENSHOT_DIR || '').trim();
const executablePath = String(args.browser || process.env.SMOKE_BROWSER_PATH || '').trim();
const headless = String(args.headless || process.env.SMOKE_HEADLESS || 'true').toLowerCase() !== 'false';
const timeoutMs = Number(args.timeout || process.env.SMOKE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

const resolveBrowserPath = async () => {
  const candidates = executablePath
    ? [executablePath]
    : DEFAULT_BROWSER_CANDIDATES;

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next browser candidate.
    }
  }

  throw new Error(
    'No supported browser executable was found. Set SMOKE_BROWSER_PATH or pass --browser with a local Chrome/Chromium path.'
  );
};

const nowIso = () => new Date().toISOString();

const formatDuration = (ms) => `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;

const sanitizeFilePart = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const ensureDir = async (dirPath) => {
  if (!dirPath) return;
  await fs.mkdir(dirPath, { recursive: true });
};

const report = {
  baseUrl,
  startedAt: nowIso(),
  steps: [],
  warnings: [],
};

const pushWarning = (message) => {
  report.warnings.push(message);
  console.warn(`WARN ${message}`);
};

const recordStep = async (name, fn, { optional = false } = {}) => {
  const startedAt = Date.now();

  try {
    const detail = await fn();
    const durationMs = Date.now() - startedAt;
    report.steps.push({ name, status: 'passed', durationMs, detail: detail || '' });
    console.log(`PASS ${name} (${formatDuration(durationMs)})${detail ? ` — ${detail}` : ''}`);
    return detail;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const detail = error?.message || String(error);
    report.steps.push({ name, status: optional ? 'warning' : 'failed', durationMs, detail });
    const prefix = optional ? 'WARN' : 'FAIL';
    console.error(`${prefix} ${name} (${formatDuration(durationMs)}) — ${detail}`);
    if (!optional) throw error;
    return '';
  }
};

const screenshotOnFailure = async (page, stepName) => {
  if (!screenshotDir) return '';

  await ensureDir(screenshotDir);
  const fileName = `${Date.now()}-${sanitizeFilePart(stepName || 'failure')}.png`;
  const absolutePath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: absolutePath, fullPage: true });
  return absolutePath;
};

const gotoAndWait = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
};

const waitForAny = async (promises) => Promise.any(promises.map((promise) => promise.catch((error) => { throw error; })));

const openProjectsFromUtilityShell = async (page) => {
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor({ timeout: timeoutMs });
};

const clickProjectTab = async (page, label) => {
  const navShell = page.locator('.nav-shell');
  const directButton = navShell.getByRole('button', { name: label, exact: true }).first();

  if (await directButton.isVisible().catch(() => false)) {
    await directButton.click();
    return;
  }

  const moreButton = navShell.getByRole('button', { name: /More/i }).first();
  if (await moreButton.isVisible().catch(() => false)) {
    await moreButton.click();
    const menuButton = page.getByRole('button', { name: label, exact: true }).last();
    await menuButton.waitFor({ timeout: timeoutMs });
    await menuButton.click();
    return;
  }

  throw new Error(`Could not find the "${label}" project tab.`);
};

const waitForProjectView = async (page, label, contentLocator) => {
  await clickProjectTab(page, label);
  await contentLocator.waitFor({ timeout: timeoutMs });
};

const findUtilityCardButton = (page, headingText) => page
  .locator('div')
  .filter({
    has: page.getByText(headingText, { exact: true }),
  })
  .filter({
    has: page.getByRole('button', { name: 'Open', exact: true }),
  })
  .first()
  .getByRole('button', { name: 'Open', exact: true });

const openNamedProject = async (page) => {
  const projectCards = page.locator('.pm-list-shell [role="button"]');
  const totalProjects = await projectCards.count();

  if (totalProjects === 0) {
    throw new Error('No project cards were visible on the project home.');
  }

  let targetCard = projectCards.first();
  let projectLabel = 'first visible project';

  if (smokeProjectName) {
    const namedCard = projectCards.filter({ hasText: smokeProjectName }).first();
    if (await namedCard.count()) {
      targetCard = namedCard;
      projectLabel = smokeProjectName;
    } else {
      pushWarning(`Project "${smokeProjectName}" was not visible, so the smoke test opened the first project instead.`);
    }
  } else {
    const headingText = await targetCard.locator('h4').first().textContent().catch(() => '');
    if (headingText?.trim()) projectLabel = headingText.trim();
  }

  await targetCard.click();
  await waitForAny([
    page.getByRole('button', { name: /Projects/i }).waitFor({ timeout: timeoutMs }),
    page.locator('.nav-shell').waitFor({ timeout: timeoutMs }),
  ]);

  return projectLabel;
};

const maybeWriteReport = async () => {
  report.finishedAt = nowIso();
  report.passed = report.steps.filter((step) => step.status === 'passed').length;
  report.failed = report.steps.filter((step) => step.status === 'failed').length;
  report.warned = report.steps.filter((step) => step.status === 'warning').length;

  if (!reportPath) return;

  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.resolve(process.cwd(), reportPath);

  await ensureDir(path.dirname(absolutePath));
  await fs.writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`REPORT ${absolutePath}`);
};

let browser;
let page;

try {
  const browserPath = await resolveBrowserPath();
  browser = await chromium.launch({
    executablePath: browserPath,
    headless,
  });

  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
  });

  page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  await recordStep('Landing page loads', async () => {
    await gotoAndWait(page, baseUrl);
    await page.getByRole('button', { name: 'Log in', exact: true }).waitFor({ timeout: timeoutMs });
    return 'Public landing shell rendered.';
  });

  await recordStep('Login panel opens', async () => {
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByPlaceholder('you@company.com').waitFor({ timeout: timeoutMs });
    await page.getByRole('button', { name: 'Sign in to workspace', exact: true }).waitFor({ timeout: timeoutMs });
    return 'Email + password fields are visible.';
  });

  await recordStep('Signup panel opens', async () => {
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByPlaceholder('Jane Smith').waitFor({ timeout: timeoutMs });
    await page.getByRole('button', { name: 'Create account', exact: true }).waitFor({ timeout: timeoutMs });
    await page.getByRole('button', { name: 'Sign in instead', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in to workspace', exact: true }).waitFor({ timeout: timeoutMs });
    return 'Sign-up mode is reachable and returns to sign-in cleanly.';
  });

  if (!smokeEmail || !smokePassword) {
    pushWarning('Authenticated navigation was skipped because SMOKE_EMAIL and SMOKE_PASSWORD were not both provided.');
    await maybeWriteReport();
    process.exitCode = 0;
  } else {
    await recordStep('Sign in succeeds', async () => {
      await page.getByPlaceholder('you@company.com').fill(smokeEmail);
      await page.getByPlaceholder('Minimum 6 characters').fill(smokePassword);
      await page.getByRole('button', { name: 'Sign in to workspace', exact: true }).click();
      await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor({ timeout: timeoutMs });
      return 'Project home opened after sign-in.';
    });

    await recordStep('Shopping List opens from project home', async () => {
      const button = findUtilityCardButton(page, 'Shopping List');
      await button.click();
      await page.getByRole('heading', { name: 'Shopping List', exact: true }).waitFor({ timeout: timeoutMs });
      await page.getByRole('button', { name: 'Projects', exact: true }).waitFor({ timeout: timeoutMs });
      await openProjectsFromUtilityShell(page);
      return 'Shopping List opened and returned to project home.';
    });

    await recordStep('Timesheet opens from project home', async () => {
      const button = findUtilityCardButton(page, 'Timesheets');
      await button.click();
      await page.getByRole('heading', { name: 'Timesheet', exact: true }).waitFor({ timeout: timeoutMs });
      await page.getByRole('button', { name: 'Projects', exact: true }).waitFor({ timeout: timeoutMs });
      await openProjectsFromUtilityShell(page);
      return 'Timesheet opened and returned to project home.';
    });

    const openedProjectName = await recordStep('A project opens from project home', async () => {
      const projectLabel = await openNamedProject(page);
      return `Opened ${projectLabel}.`;
    });

    await recordStep('Status Report tab opens', async () => {
      await waitForProjectView(
        page,
        'Status Report',
        page.getByText('Overall RAG', { exact: true })
      );
      return `Verified Status Report inside ${openedProjectName || 'the selected project'}.`;
    });

    await recordStep('Action Log tab opens', async () => {
      await waitForProjectView(
        page,
        'Action Log',
        page.getByText('Action Log', { exact: true }).last()
      );
      return 'Action Log view rendered.';
    });

    await recordStep('Tasks tab opens', async () => {
      await waitForProjectView(
        page,
        'Tasks',
        page.getByPlaceholder('Search tasks...')
      );
      return 'Tasks view rendered.';
    });

    await recordStep('Risk Log tab opens', async () => {
      await waitForProjectView(
        page,
        'Risk Log',
        page.getByText('Risk Log', { exact: true }).last()
      );
      return 'Risk Log view rendered.';
    });

    await recordStep('Return to project home works', async () => {
      await page.getByRole('button', { name: /Projects/i }).first().click();
      await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor({ timeout: timeoutMs });
      return 'Project home reopened from the main workspace.';
    });

    await maybeWriteReport();
    process.exitCode = 0;
  }
} catch (error) {
  if (page) {
    try {
      const failureShot = await screenshotOnFailure(page, report.steps.at(-1)?.name || 'smoke-failure');
      if (failureShot) {
        pushWarning(`Failure screenshot saved to ${failureShot}`);
      }
    } catch (screenshotError) {
      pushWarning(`Could not save a failure screenshot: ${screenshotError.message || screenshotError}`);
    }
  }

  report.finishedAt = nowIso();
  report.error = error?.message || String(error);
  await maybeWriteReport().catch(() => {});
  console.error(`\nSmoke test failed: ${report.error}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
