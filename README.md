# PM Workspace

Project management and household workspace built with **Vite**, **React 18**, **Tailwind CSS**, **Supabase**, and **Vercel** serverless functions, with offline-capable PWA support.

## Capabilities

### Core Project Workspace
- **Projects & Schedule** — Project selector, Gantt timeline, dependencies (`FS`, `SS`, `FF`, `SF`), and Excel import/export.
- **Registers & Governance** — RAID logs (Risks, Issues, Actions, Decisions), Tracker, Cost/Financials, Change Control, Stakeholders, RACI, External View, and Status Reports.
- **Tasks & Planning** — Personal and project tasks with Eisenhower Matrix, Kanban board, Calendar, checklists, and recurring follow-ups.
- **Timesheets (`/track`)** — Weekly project-linked time tracking with offline queueing.
- **Billing & AI** — Stripe Checkout / Customer Portal (`/api/create-checkout-session`, `/api/customer-portal`, `/api/stripe-webhook`) and AI report/task assistance (`/api/ai-generate`).

### Account-Gated Tools
Gated per account (`household_tools_enabled`, finance access, or account allowlist):
- **Household Finance (`/finance`)**, **Meal Planner (`/meals`)**, **Shopping List (`/shopping`)**, **Baby Care (`/baby`)**, **Habits (`/habits`)**, **Weight (`/weight`)**, and **ITIL Quiz (`/itil-quiz`)**.

## Prerequisites
- **Node.js** 20+ and **npm**
- **Git**

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. Never expose `SUPABASE_SERVICE_ROLE_KEY` or other secrets in `VITE_*` variables.
3. Start the Vite dev server (opens at **http://localhost:3002**):
   ```bash
   npm run dev
   ```
   If testing `/api/*` serverless routes locally, also run `vercel dev --listen 3001` (matching the `/api` proxy in `vite.config.js`).

## Common Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server on port `3002` |
| `npm run build` | Build production bundle into `dist/` and inject PWA precache manifest |
| `npm run preview` | Preview the production build locally |
| `npm run check:react-hooks` | Verify React hook import rules across `src/` |
| `npm run lint` | Run ESLint across `src`, `api`, `scripts`, and config files |
| `npm test` | Run unit tests (`./src/**/*.test.js`) |
| `npm run test:ci` | Run hook checks, ESLint, and unit tests |
| `TZ=Europe/London node --experimental-vm-modules --test scripts/regressions/*.test.mjs` | Run React regression suites |
| `npm run release:preflight -- --skip-smoke` | Run hooks, lint, unit tests, regressions, and production build |
| `npm run smoke:shopping` | Run headless Playwright Shopping smoke test |
| `npm run smoke:local` | Run authenticated browser smoke suite (`.env.smoke.local`) |
| `npm run backup:projects` / `backup:list` / `backup:restore` | Legacy project backup scripts (see `docs/household-backup-restore.md` for Q12 rehearsal) |

## Repository Layout

```text
├── api/                    # Vercel serverless endpoints (auth, billing, AI, push, sharing)
├── docs/                   # Verification notes, checklists, and workflow docs
├── public/                 # Static assets, PWA manifest, and service worker (sw.js)
├── scripts/
│   ├── investigations/     # PGlite / PostgreSQL SQL tests and browser test fixtures
│   ├── regressions/        # React VM-module regression suites
│   └── sql/                # Ordered SQL migrations and verification scripts
├── src/
│   ├── components/         # React views and mobile layouts
│   ├── contexts/           # Auth, Plan, and TaskCompletionSession contexts
│   ├── hooks/              # Feature hooks and projectData persistence/sync
│   ├── lib/                # Supabase client setup
│   ├── styles/             # Tailwind + shared CSS
│   └── utils/              # Pure domain logic, offline stores, and unit tests
├── package.json
├── vercel.json             # Security headers (CSP, HSTS) and SPA rewrites
└── vite.config.js
```

## Deployment & Release Hygiene
- Production deploys automatically from `main` on Vercel (`project-manager-app`).
- Develop changes on dedicated `codex/*` branches, verify locally and via Vercel preview + GitHub Actions CI before merging (see [docs/repo-workflow.md](docs/repo-workflow.md)).
- Apply required SQL migrations from `scripts/sql/` in Supabase before deploying server/client code that depends on new columns, RPCs, or RLS policies.
