const title = 'Q11 synthetic milk';
const edited = 'Q11 synthetic fresh milk';

// Shared by the CLI and the supported in-app browser. All mutations go through
// actual product controls; DOM-visible service evidence verifies persistence.
export async function runShoppingJourney(page, { baseUrl, timeoutMs = 12000, proveFailure = false, timeoutKey = 'timeoutMs' } = {}) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/') {
    throw new Error('Shopping smoke accepts only its isolated loopback fixture.');
  }
  const report = { scope: 'isolated-browser-shopping', startedAt: new Date().toISOString(), status: 'running', steps: [] };
  const waitOptions = state => ({ state, [timeoutKey]: timeoutMs });
  const visible = locator => locator.waitFor(waitOptions('visible'));
  const read = async () => {
    const text = (await page.getByLabel('Synthetic service evidence').allTextContents())[0];
    return text ? JSON.parse(text) : null;
  };
  const until = async (predicate, message) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await read();
      if (state && predicate(state)) return state;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(message);
  };
  const step = async (name, action) => {
    const started = Date.now();
    try { await action(); report.steps.push({ name, status: 'passed', durationMs: Date.now() - started }); }
    catch (cause) {
      // Do not serialize browser errors, request headers or tokens.
      report.steps.push({ name, status: 'failed', durationMs: Date.now() - started });
      throw cause;
    }
  };
  try {
    await step('open', async () => {
      await page.goto(baseUrl);
      await visible(page.getByRole('heading', { name: 'Q11 isolated Shopping release smoke', exact: true }));
      await visible(page.getByRole('textbox', { name: 'Groceries', exact: true }));
      await until(state => state.rows.length === 0, 'Fixture did not start empty.');
    });
    await step('add', async () => {
      await page.getByRole('textbox', { name: 'Groceries', exact: true }).fill(title);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await until(state => state.adds === 1 && state.rows.length === 1 && state.rows[0].title === title,
        'Add did not persist exactly one grocery.');
      await visible(page.locator('[data-shopping-open-todo-id]').filter({ hasText: title }));
    });
    await step('edit', async () => {
      const state = await read();
      const row = page.locator(`[data-shopping-open-todo-id="${state.rows[0].id}"]`);
      const more = row.getByRole('button', { name: 'More', exact: true });
      if (await more.isVisible()) await more.click();
      await row.getByRole('button', { name: 'Edit', exact: true }).click();
      await row.getByRole('textbox').fill(edited);
      await row.getByRole('button', { name: 'Save', exact: true }).click();
      await until(state => state.edits === 1 && state.rows[0]?.title === edited,
        'Edited grocery did not reach the service.');
      await visible(page.locator('[data-shopping-open-todo-id]').filter({ hasText: edited }));
    });
    await step('failed-save-retained', async () => {
      await page.getByRole('button', { name: 'Fail next check-off', exact: true }).click();
      if (proveFailure) await page.getByRole('button', { name: 'Keep check-off failing', exact: true }).click();
      await page.getByRole('button', { name: `Mark ${edited} as bought`, exact: true }).click();
      await until(state => state.failures === 1 && state.completions === 0 && state.rows[0]?.status === 'Open',
        'Injected failure did not retain the grocery.');
      const row = page.locator('[data-shopping-open-todo-id]').filter({ hasText: edited });
      await visible(row.getByText('Q11 synthetic save failed. Retry this grocery.', { exact: true }));
      await visible(row.getByRole('button', { name: 'Retry', exact: true }));
    });
    await step('retry-check-off', async () => {
      const row = page.locator('[data-shopping-open-todo-id]').filter({ hasText: edited });
      await row.getByRole('button', { name: 'Retry', exact: true }).click();
      await until(state => state.failures === 1 && state.completions === 1 && state.rows.length === 1
        && state.rows[0].title === edited && state.rows[0].status === 'Done', 'Retry did not complete the retained grocery exactly once.');
      await row.waitFor(waitOptions('hidden'));
      const showBought = page.getByRole('button', { name: 'Show bought (1)', exact: true });
      if (await showBought.isVisible()) await showBought.click();
      await visible(page.getByText(edited, { exact: true }));
    });
    report.status = 'passed';
  } catch {
    report.status = 'failed';
    report.failureStep = report.steps.find(item => item.status === 'failed')?.name || 'setup';
  }
  report.finishedAt = new Date().toISOString();
  return report;
}
