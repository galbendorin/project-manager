import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startShoppingSmokeServer } from './shopping-smoke/server.mjs';
import { runShoppingJourney } from './shopping-smoke/journey.mjs';

const output = path.resolve(process.env.SHOPPING_SMOKE_OUTPUT || 'tmp/shopping-smoke');
const proveFailure = process.argv.includes('--prove-failure');
const report = { scope: 'isolated-browser-shopping', status: 'unavailable', expectedFailure: proveFailure, runs: [] };
let server, browser;
try {
  await fs.mkdir(output, { recursive: true });
  server = await startShoppingSmokeServer({ port: 0 });
  const address = server.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch({ headless: true, ...(process.env.SMOKE_BROWSER_PATH
    ? { executablePath: process.env.SMOKE_BROWSER_PATH } : {}) });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', () => errors.push('Unhandled page error'));
    // Defence in depth: no external requests, even if fixture aliases regress.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(baseUrl).origin ? route.continue() : route.abort();
    });
    const run = await runShoppingJourney(page, { baseUrl, proveFailure, timeoutMs: proveFailure ? 2500 : 12000, timeoutKey: 'timeout' });
    if (errors.length) { run.status = 'failed'; run.pageErrors = errors; }
    run.viewport = viewport;
    run.screenshot = `${viewport.width}.png`;
    await page.screenshot({ path: path.join(output, run.screenshot), fullPage: true });
    if (run.status === 'failed') await fs.writeFile(path.join(output, `${viewport.width}-failure.html`), await page.content());
    report.runs.push(run);
    await context.close();
  }
  report.status = report.runs.every(run => run.status === 'passed') ? 'passed' : 'failed';
} catch {
  report.status = 'unavailable';
  report.reason = 'Browser or isolated fixture unavailable. Install Chromium with npx playwright-core install chromium, or set SMOKE_BROWSER_PATH. Check the local server port and permissions.';
} finally {
  await browser?.close();
  await server?.close();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
const passed = proveFailure
  ? report.runs.length === 2 && report.runs.every(run => run.status === 'failed'
    && run.failureStep === 'retry-check-off' && !run.pageErrors?.length)
  : report.status === 'passed';
console.log(`${passed ? 'PASS' : 'FAIL'} Shopping ${proveFailure ? 'failure detection' : 'release smoke'}: ${path.join(output, 'report.json')}`);
process.exitCode = passed ? 0 : 1;
