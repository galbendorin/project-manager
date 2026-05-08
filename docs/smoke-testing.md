# Smoke Testing

Use smoke tests before merging changes that could affect login, project navigation, household tools, or mobile shopping flows.

## One-time local setup

1. Create or choose a dedicated smoke-test user. Do not use real customer data.
2. Make sure the account has at least one safe test project, ideally named `Smoke Test Project`.
3. Enable `household_tools_enabled` for that account only if Shopping List and Meal Planner should be covered.
4. Copy the example file:

```bash
cp .env.smoke.example .env.smoke.local
```

5. Fill `.env.smoke.local` with the smoke account email/password. The file is ignored by git.

## Run smoke locally

```bash
npm run smoke:local
```

The wrapper loads `.env.smoke.local`, writes reports under the system temp folder, and prefers a Playwright headless browser when one is already installed.

To watch the run:

```bash
SMOKE_HEADLESS=false npm run smoke:local
```

To target a Vercel preview:

```bash
SMOKE_BASE_URL="https://your-preview-url.vercel.app" npm run smoke:local
```

## Browser notes

Codex's sandbox can block Chromium launches on macOS. If smoke fails inside Codex with a `bootstrap_check_in` permission error, run the same command in a normal Terminal window.

If no browser is found, install a local Playwright browser cache:

```bash
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/ms-playwright npm_config_cache=/private/tmp/pmworkspace-npm-cache npx -y playwright@1.59.1 install chromium
```

Then rerun `npm run smoke:local`.

## Release preflight

For a full local preflight:

```bash
npm run release:preflight
```

For fast local iteration when smoke credentials or browser access are not available:

```bash
npm run release:preflight -- --skip-smoke
```
