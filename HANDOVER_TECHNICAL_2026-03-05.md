# Technical Handover - 2026-03-05

## 1) Repository and Runtime
- Repository: `/Users/doringalben/project-manager`
- Branch: `main`
- Latest production commit: `367c6d0`
- Previous relevant commit: `0c757b2`
- Production alias: `https://project-manager-app-tau.vercel.app`
- Last production deployment URL: `https://project-manager-mihn93k09-dorin-galbens-projects.vercel.app`

## 2) What Was Delivered

### 2.1 New-account demo seeding
- New users are auto-seeded with the full demo payload from `src/utils/demoSeedPayload.js`.
- Seeding is one-time per account using:
  - auth metadata flag: `default_demo_seed_v1`
  - local fallback key: `pm_demo_seeded_<userId>`
- Primary logic lives in `src/components/ProjectSelector.jsx`.

### 2.2 Demo payload source
- `buildDemoProjectPayload()` now returns a deep clone of `DEMO_SEED_PAYLOAD`.
- File: `src/utils/demoProjectBuilder.js`
- Canonical payload file: `src/utils/demoSeedPayload.js`

### 2.3 Import/export and parser fixes
- Register parser now handles spreadsheet booleans for `Internal` correctly.
- Issue/Action sheet `Updated` column maps to UI field `update`.
- RACI import support added:
  - sheet candidates: `RACI`, `RACI Matrix`
  - imported values support combined assignments like `R/A`
- RACI export support added.
- Files:
  - `src/utils/importParsers.js`
  - `src/App.jsx`
  - `src/utils/importParsers.test.js`

### 2.4 RACI behavior
- UI now supports multiple assignments in the same role cell (for example `R/A`).
- Interaction changed from cycle to picker (toggle `R`, `A`, `C`, `I`).
- Default role list aligned to:
  - `Project Manager`
  - `Technical Architect`
  - `Delivery Lead`
  - `PMO Lead`
  - `Business Sponsor`
- File: `src/components/RACIView.jsx`

### 2.5 Demo baseline specifics requested
- Starter RACI row is:
  - Activity: `Project plan`
  - `Project Manager = R`
  - `Technical Architect = C`
- Blank Assumptions row `#1` is removed if present.

## 3) Data Backfill for Existing Accounts

### SQL script to run in Supabase SQL Editor
- Path: `scripts/sql/2026-03-05_backfill_demo_registers_and_raci.sql`
- Scope: updates all `is_demo = true` projects.
- Current behavior of this script:
  - removes blank Assumptions row #1
  - force-sets `_raci` starter baseline to 5 roles + `PM=R`, `Technical Architect=C`

### Verification query
```sql
select
  id,
  name,
  jsonb_array_length(registers->'_raci'->0->'roles') as role_count,
  registers->'_raci'->0->'roles' as roles,
  registers->'_raci'->0->'assignments'->>'custom-0::Project Manager' as pm_value,
  registers->'_raci'->0->'assignments'->>'custom-0::Technical Architect' as tech_value
from public.projects
where coalesce(is_demo, false) = true;
```

Expected:
- `role_count = 5`
- `pm_value = 'R'`
- `tech_value = 'C'`

## 4) Demo Excel Artifact
- Updated import-ready workbook:
  - `/Users/doringalben/Downloads/Demo 3_2026-03-05_import-ready.xlsx`
- Also mirrored in workspace:
  - `/Users/doringalben/Documents/New project 2/Demo 3_2026-03-05_import-ready.xlsx`
- Includes RACI sheet with starter row and corrected Assumptions row.

## 5) Quality Checks Run
- `npm run test` passed.
- `npm run build` passed.
- `vercel --prod --yes` completed successfully and alias points to latest deployment.

## 6) Important Continuation Notes for Any AI Coding Tool
- Treat code and database state as source of truth; use this handover as operational context only.
- Do not use broad staging (`git add -A`) in this repo; stage explicit files.
- If touching RACI persistence, ensure compatibility with existing string values (`R`, `A`, `C`, `I`) and combined values (`R/A`, etc.).
- If changing demo bootstrap logic, preserve one-time seeding behavior in `ProjectSelector.jsx`.
- If changing import format, update both parser tests and spreadsheet templates together.

## 7) Quick Commands
```bash
# local
cd /Users/doringalben/project-manager
npm run dev
npm run test
npm run build

# deploy
vercel --cwd /Users/doringalben/project-manager --prod --yes
```
