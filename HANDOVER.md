# PROJECT HANDOVER — Project Management OS

## OVERVIEW
A full-featured **React + Vite** project management web app with Gantt chart, RAID registers, master tracker, status reporting, and Supabase backend. Deployed on **Vercel** with GitHub auto-deploy.

- **Live URL**: https://project-manager-app-tau.vercel.app
- **GitHub Repo**: User's private repo (auto-deploys to Vercel on push)
- **Canonical Local Path**: `/Users/doringalben/project-manager/`
- **Legacy Local Path (older docs only)**: `~/Downloads/project-manager/`
- **Backend**: Supabase (PostgreSQL + Auth)
- **Stack**: React 18, Vite, Tailwind CSS, Chart.js, xlsx

---

## CURRENT STATE SNAPSHOT (2026-02-24) — FOR NEW CHAT OR NEW LLM (CLAUDE-READY)

This section is the authoritative handoff state for continuing work in a new chat (including Claude or another LLM).

### 1) Repository and deployment state
- **Repo path**: `/Users/doringalben/project-manager`
- **Primary branch**: `main`
- **Current HEAD**: `8fb7617` (`Add optional notes popup before AI report export`)
- **Previous release commit**: `ae29b62` (`Add easy-mode AI report export workbook`)
- **Remote sync**: `main` is synced to `origin/main`
- **Deployed flow**: GitHub push to `main` triggers Vercel auto-deploy
- **Live status**: AI export updates were pushed live from `main` and verified by user

### 2) Historical baseline clarification
- The old implementation plan references baseline commit `5416184`.
- That baseline is historical only.
- **Do not reset to `5416184`**. Continue from current HEAD (`8fb7617`) unless explicitly instructed otherwise.

### 3) Completed implementation sequence (chronological)
From `e0f8bc9` to `8fb7617`, the following has been delivered:

1. `e0f8bc9` — ToDo tab skeleton with manual todos
2. `eea42c1` — Derived ToDo aggregation and deadline bucket grouping
3. `93d999c` — Recurrence support expanded: Weekdays, Weekly, Monthly, Yearly
4. `3adff5f` — Cross-project ToDo filtering + `manual_todos` backend table usage
5. `17aa74d` — Recurring completion follow-up hardening
6. `b58edcf` — Legacy `projects.todos` retirement path + safe backfill/drop SQL
7. `2e17482` — Stability pass (signup metadata fix, import boolean parsing fix, ToDo blur-save reduction, dependency model alignment, helper extraction)
8. `4b029e9` — Import/parsing extraction from `App.jsx` to `src/utils/importParsers.js`
9. `b6484e7` — `useProjectData` split into `loadSave`, `todos`, `registers` helper modules
10. `02f2521` — Transition-focused tests + ESM extension fixes for Node test runner
11. `ead352c` — SQL preflight checks for `manual_todos` rollout
12. `e324b67` — Fast release checklist in handover
13. `3b18f6a` — Detailed 2026-02-23 handoff snapshot for new LLM chats
14. `ae29b62` — Easy-mode single-file AI report export workflow
15. `8fb7617` — Optional notes modal before AI export + pass-through into workbook

### 4) NEW: AI report export capability (Option 1, policy-safe local workflow)
Implemented for strict LLM policy environments (no model API calls from app).

#### User flow
1. Open **Status Report** tab.
2. Select reporting range (Last 7/14/30 days or custom From/To).
3. Click **Download AI Report File**.
4. Optional modal appears:
   - user can enter short context notes
   - click **Continue Download**
5. Upload downloaded `.xlsx` into company-approved LLM workspace.
6. If prompt is needed, use: `Generate report from attached file.`

#### Export output
- Single workbook generated locally (browser-side):  
  `{{project_name}}_project_report_input_YYYY-MM-DD.xlsx`
- Sheets:
  - `00_INSTRUCTIONS`
  - `01_METADATA`
  - `02_THIS_PERIOD_COMPLETED`
  - `03_NEXT_PERIOD_OPEN`
  - `04_RISK_SIGNALS`
  - `05_ADDITIONAL_NOTES`
  - `06_OUTPUT_TEMPLATE`

### 5) AI export data logic (important for Claude continuity)

#### Reporting windows
- `window_start` = selected `dateFrom`
- `window_end` = selected `dateTo`
- `window_days` = inclusive day count
- `next_period_start` = `window_end + 1 day`
- `next_period_end` = `next_period_start + (window_days - 1)`

#### 02_THIS_PERIOD_COMPLETED
Composed from:
- **Project-scoped manual ToDos** marked done with `completedAt`/`updatedAt` in selected window
- **Action Log** items marked done/completed/closed with completion in selected window
- **Project Plan tasks** with `pct = 100` and `updatedAt` in selected window

#### 03_NEXT_PERIOD_OPEN
Composed from:
- Open project-scoped manual ToDos with `dueDate` in next period
- Open Action Log items with target date in next period
- Open Project Plan tasks whose calculated finish date falls in next period

#### 04_RISK_SIGNALS
Composed from:
- Overdue project-scoped manual ToDos (open, due before window end)
- Open Risk Log entries
- Open Issue Log entries
- Master Tracker items where `rag = Red` or `status = On Hold`

#### 05_ADDITIONAL_NOTES
Includes rows for:
- Overall Status Narrative
- Key Deliverables This Period
- Key Deliverables Next Period
- Main Risks and Issues (combined risks/issues narrative text)
- Additional Notes
- **User Export Notes** (from optional pre-download modal)

#### 06_OUTPUT_TEMPLATE
Fixed section headers expected from LLM output:
- Overall Status Narrative
- Key Deliverables This Period
- Key Deliverables Next Period
- Main Risks and Issues
- Additional Notes

### 6) Files added/changed for AI export feature
- `src/utils/aiReportExport.js` (new)
  - `buildAiReportExportData(...)`
  - section constants and prompt constant
  - deterministic workbook datasets for all required sheets
- `src/utils/aiReportExport.test.js` (new)
  - project-scoped completed ToDo inclusion test
  - next-period/risk-signal generation assertions
  - fallback row assertions
  - user-notes propagation assertion
- `src/App.jsx`
  - added `handleExportAiReport(...)`
  - writes AI workbook sheets via `xlsx`
  - injects selected date window + optional user notes
- `src/components/StatusReportView.jsx`
  - added **Download AI Report File** button
  - added optional **AI Export Notes** modal
  - added post-export helper panel with one-click prompt copy

### 7) Database migration status (manual run in Supabase SQL Editor)
No new SQL migration required for AI export feature (all local/UI/export logic).

Current expected migration set remains:
- `scripts/sql/2026-02-22_add_is_demo_to_projects.sql`
- `scripts/sql/2026-02-22_add_todos_to_projects.sql` (legacy step)
- `scripts/sql/2026-02-23_create_manual_todos.sql`
- `scripts/sql/2026-02-23_backfill_manual_todos_from_projects.sql`
- `scripts/sql/2026-02-23_drop_legacy_projects_todos.sql`
- `scripts/sql/2026-02-23_manual_todos_preflight_checks.sql`

Validation intent:
- `public.manual_todos` exists with required columns, indexes, and RLS policies
- legacy `public.projects.todos` column removed
- recurrence/status data integrity validated
- final preflight summary reports `PASS`

### 8) Current architecture highlights (post-refactor + AI export)
New/important modules:
- `src/hooks/projectData/defaults.js`
- `src/hooks/projectData/manualTodoUtils.js`
- `src/hooks/projectData/loadSave.js`
- `src/hooks/projectData/registers.js`
- `src/hooks/projectData/todos.js`
- `src/utils/importParsers.js`
- `src/utils/aiReportExport.js`

Behavior-critical notes:
- ToDo editing for `title`/`owner` commits on `blur` to reduce backend writes
- Recurring completion creates follow-up manual todo automatically
- Dependency normalization (`parent` + `dependencies[]`) is shared across schedule, critical path, and Gantt dependency drawing
- Sign-up metadata flow is normalized (`full_name`)
- AI export is local-only; **no external LLM API call is made by the app**

### 9) Test and build state at handoff
Latest local verification on `8fb7617`:
- `npm run test` -> **28/28 passing**
- `npm run build` -> **passing** (Vite production build completes)

Primary test files:
- `src/utils/helpers.test.js`
- `src/utils/importParsers.test.js`
- `src/hooks/manualTodoUtils.test.js`
- `src/hooks/projectDataFlows.test.js`
- `src/utils/aiReportExport.test.js`

### 10) Operational release process
Use the **RELEASE CHECKLIST (FAST)** section in this file for:
- local verify (`test` + `build`)
- commit + push
- Supabase preflight SQL check
- post-deploy smoke test

### 11) Recommended next engineering step (low service impact)
Add higher-level integration tests around `useProjectData` + AI export boundary behaviors:
- missing-table fallback path (`manual_todos` relation missing)
- recurring follow-up insertion failure fallback
- conflict/reload flow with version mismatch
- AI export correctness for custom date windows with sparse data
- large workbook export performance (>2k rows)

### 12) Copy/paste prompt for starting a new chat with Claude
Use this exact scaffold:

```text
Use /Users/doringalben/project-manager/HANDOVER.md (sections "CURRENT STATE SNAPSHOT (2026-02-24)" and "RELEASE CHECKLIST (FAST)") as source of truth.
Repo: /Users/doringalben/project-manager
Current branch/commit: main @ 8fb7617
Do not roll back to historical baseline commit 5416184; continue from current HEAD.
Respect existing AI export behavior (single-file local workbook + optional export notes modal) and avoid service-impacting backend changes unless explicitly requested.
Before changing code, summarize current state from HANDOVER and propose the lowest-risk next step.
After implementing: run npm run test and npm run build, then provide commit/push commands only.
```

---

## DEPLOYMENT WORKFLOW (CRITICAL — FOLLOW EXACTLY)

> NOTE (2026-02-23): This section describes a legacy chat-file transfer workflow.
> For the current local repo workflow, use **RELEASE CHECKLIST (FAST)** above.

The user cannot run code locally from the chat. The workflow is:

1. **Claude creates files** and provides download links via `present_files`
2. **User downloads** the files to `~/Downloads/`
3. **User runs copy commands** provided by Claude:
   ```bash
   cp ~/Downloads/FileName.jsx ~/Downloads/project-manager/src/components/FileName.jsx
   ```
4. **User deploys** via git:
   ```bash
   cd ~/Downloads/project-manager
   git add -A
   git commit -m "description"
   git push
   ```
5. Vercel auto-deploys from GitHub (takes ~30 seconds)

**IMPORTANT**: Always provide exact `cp` commands with full paths. Files go to `/mnt/user-data/outputs/` for the user to download.

---

## RELEASE CHECKLIST (FAST)

Use this sequence for every release to reduce risk:

1. Local verification:
   ```bash
   cd /Users/doringalben/project-manager
   npm run test
   npm run build
   ```

2. Commit + push:
   ```bash
   cd /Users/doringalben/project-manager
   git add -A
   git commit -m "release message"
   git push origin main
   ```

3. DB preflight (Supabase SQL Editor):
   - Run `scripts/sql/2026-02-23_manual_todos_preflight_checks.sql`
   - Confirm final row shows `overall_status = PASS`

4. Post-deploy smoke test (production):
   - Open existing project and add/update/delete a manual ToDo
   - Mark recurring ToDo as Done and verify next instance appears
   - Import a sample Excel file (Schedule + at least one register)
   - Export workbook and verify expected sheets are present

5. Record release:
   - Save commit SHA and deployment timestamp in your notes

---

## FILE STRUCTURE

```
src/
├── App.jsx                    # Main app: routing, import/export, tab switching
├── main.jsx                   # Entry point
├── index.css                  # Global styles (grid-table, nav-tabs, cell-clamp, tooltips)
├── components/
│   ├── AuthPage.jsx           # Login/signup with Supabase Auth
│   ├── ProjectSelector.jsx    # Multi-project dashboard
│   ├── Header.jsx             # Top bar: actions, baseline, view mode, export/import
│   ├── Navigation.jsx         # Tab bar (TABS from constants)
│   ├── ScheduleView.jsx       # Split-pane: ScheduleGrid (left) + GanttChart (right)
│   ├── ScheduleGrid.jsx       # Editable task table (fixed header + scrollable body)
│   ├── GanttChart.jsx         # Chart.js Gantt with plugins (today line, weekends, baselines, dependencies)
│   ├── TaskModal.jsx          # Add/edit task modal
│   ├── RegisterView.jsx       # Generic RAID register table (risks, issues, actions, etc.)
│   ├── TrackerView.jsx        # Master Tracker tab (tracked tasks with RAG, notes, status)
│   ├── StatusReportView.jsx   # Status Report tab (RAG, completion gauge, date filtering, milestones, AI export trigger)
│   └── TodoView.jsx           # Cross-project ToDo view (manual + derived, filters, recurring controls)
├── hooks/
│   ├── useProjectData.js      # Core data hook: all CRUD, Supabase sync, timestamps
│   └── projectData/
│       ├── defaults.js        # Empty state builders
│       ├── loadSave.js        # Load normalization + project payload builder
│       ├── manualTodoUtils.js # ToDo mapping + recurrence normalization helpers
│       ├── registers.js       # Register state transforms + tracked action helpers
│       └── todos.js           # Manual ToDo local/db transition logic
├── contexts/
│   └── AuthContext.jsx        # Supabase auth context provider
├── lib/
│   └── supabase.js            # Supabase client init
└── utils/
    ├── constants.js            # SCHEMAS, TABS, TRACKER_COLS, DEFAULT_TASK, DEFAULT_STATUS_REPORT, ICONS
    ├── helpers.js              # Date math (business days), schedule calc, critical path, hierarchy, todo bucketing
    ├── importParsers.js        # Excel import parser helpers and sheet maps
    └── aiReportExport.js       # Easy-mode AI report workbook dataset builder
```

---

## DATABASE (SUPABASE)

### Table: `projects`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Project name |
| user_id | uuid | Owner (from auth) |
| tasks | jsonb | Array of task objects |
| registers | jsonb | Object with keys: risks, issues, actions, minutes, costs, changes, comms |
| baseline | jsonb | Snapshot of task dates for variance tracking |
| tracker | jsonb | Array of tracked items |
| status_report | jsonb | Status report fields (RAG, narrative, deliverables, etc.) |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto-updated on save |

### Auth
- Supabase Auth with email/password
- Row-level security: users see only their own projects

---

## KEY ARCHITECTURAL PATTERNS

### 1. Auto-save with Debounce
`useProjectData.js` watches all state changes and auto-saves to Supabase after 1.5s of inactivity. The `initialLoadDone` ref prevents save-on-load loops.

### 2. Timestamps
Every task, register item, and tracker item has `createdAt` and `updatedAt` (ISO strings). These are set automatically:
- `createdAt` — set once when item is created
- `updatedAt` — refreshed on every edit
- Existing items without timestamps get **backfilled on load** with `now()`

### 3. Business Days
All scheduling uses **business days** (Mon-Fri). Key functions in `helpers.js`:
- `addBusinessDays(startDate, days)` — skips weekends
- `countBusinessDays(start, end)` — counts working days
- `getFinishDate(start, dur)` — finish date using business days
- `getCalendarSpan(start, businessDays)` — converts to calendar days for Gantt bar width
- `calculateSchedule(tasks)` — resolves dependency chains, snaps starts to weekdays

### 4. Gantt Chart Architecture
- **Two Chart.js instances**: axis header (fixed) + body (scrollable)
- **Custom plugins**: rowStripes, todayLine, todayLineAxis, weekendShading, ganttOverlay
- `ganttOverlay` draws: summary bracket bars, baseline ghost bars, dependency arrows
- Tasks carry `_calendarDays` for bar width and `_isParent` for summary rendering
- **ScheduleGrid has its header outside the scroll area** (matching Gantt architecture for row alignment) — `GRID_HEADER_HEIGHT = 34` in ScheduleGrid, `HEADER_HEIGHT = 34` in GanttChart. These MUST match.

### 5. Hierarchy System
- Tasks have `indent` (0, 1, 2...) — determines parent/child via `getHierarchyMap()`
- Parent tasks are auto-detected (next task has higher indent)
- Parent dates/duration auto-calculated from children via `calculateParentSummaries()`
- Parents show as GROUP with bracket bars; they're not directly editable for dates/duration
- Collapsible with `collapsedIndices` Set

### 6. Text Cells — Clamp + Tooltip
Long text in registers and tracker uses CSS-only approach:
- `.cell-clamp` — 2-line clamp with ellipsis
- `.cell-with-tooltip` + `.cell-tooltip` — dark popup on hover, scrollable if content is long
- Only activates for cells with 30+ characters

---

## TABS & FEATURES

### Schedule Tab
- Split pane: grid (left, 55%) + Gantt chart (right)
- Draggable splitter between panels
- Synchronized vertical scrolling
- Editable fields: Name, Dep (parent ID), Type, Duration, Start Date, Progress
- Duration disabled for parents (auto-calc) and milestones (always 0)
- Actions per row: Outdent ←, Indent →, Insert +, Send to Tracker ▸, Delete ×
- Baseline support: set/clear via header, shows ghost bars on Gantt
- Critical path highlighting (purple CP badge + purple dependency lines)
- View modes: 1 Week, 2 Week, Month
- Task type: Task or Milestone (diamond on Gantt)

### Master Tracker Tab
- Tasks sent from Schedule via ▸ button
- Columns: Task Name (link back to schedule), Notes, Status (dropdown), RAG (Green/Amber/Red), Next Action, Owner, Date Added, Last Updated
- Summary cards: Total, In Progress, Completed, Amber count, Red count
- Filter by status, search

### Status Report Tab
- **Date range picker** at top: presets (Last 7/14/30 days, This month) + custom From/To
- Overall RAG selector (clickable Green/Amber/Red circles)
- Project completion gauge (auto-calculated from all task percentages)
- Task summary cards (total/completed/in progress/not started)
- **Period Activity** section: counts new + updated items in the date range across tasks, risks, issues, actions, changes, tracker
- **Collapsible Period Detail** at bottom: expands to show individual items that changed
- Narrative sections: Overall Status, Additional Notes, Deliverables This/Next Period
- Top 5 open risks and issues auto-pulled from registers
- Milestone comparison table: baseline vs actual with variance (days early/late)
- **Download AI Report File** action for single-file local workbook export
- Optional pre-download notes modal (captured as `User Export Notes` in workbook)
- Post-export helper panel with copyable prompt text (`Generate report from attached file.`)

### Register Tabs (7 registers)
- Risks, Issues, Actions, Minutes, Costs, Changes, Comms Plan
- Each has schema-driven columns defined in `SCHEMAS` (constants.js)
- Inline editable cells
- Visibility toggle (eye icon) — public/internal for external view
- Search filter
- Delete button per row
- Long text cells show 2-line clamp with hover tooltip

### Import/Export
- Excel export: creates multi-sheet .xlsx (Schedule + all registers + Status Report)
- Excel import: reads Schedule and register sheets, maps column names via COLUMN_MAP objects in App.jsx
- AI export (Status Report): creates a single AI-ready workbook with instruction/metadata/data/template sheets

---

## CURRENT STATE — WHAT'S BEEN BUILT

| Feature | Status |
|---------|--------|
| Multi-project + Auth | ✅ Complete |
| Schedule tab (grid + Gantt) | ✅ Complete |
| All 7 RAID registers | ✅ Complete |
| Master Tracker tab | ✅ Complete |
| Status Report tab | ✅ Complete |
| Baseline support | ✅ Complete |
| Critical path | ✅ Complete |
| Business day scheduling | ✅ Complete |
| Editable duration from grid | ✅ Complete |
| Timestamps on all items | ✅ Complete |
| Date range filtering (Status Report) | ✅ Complete |
| Collapsible period detail | ✅ Complete |
| Text clamp + hover tooltips | ✅ Complete |
| Weekend shading on Gantt | ✅ Complete |
| Row alignment (grid ↔ Gantt) | ✅ Fixed (split header architecture) |
| ToDo tab (manual + derived + cross-project + recurring) | ✅ Complete |
| AI easy-mode report export (single workbook + notes modal) | ✅ Complete |

---

## REMAINING ROADMAP

| Feature | Priority | Notes |
|---------|----------|-------|
| **8d: Code optimization** | Medium | Bundle size, lazy loading, memoization review |
| **8f: AI report automation (phase 2)** | High | Phase 1 complete (local single-file export). Next: optional BYOK API mode + optional in-app generation flow. |
| **Gantt row alignment fine-tuning** | Medium | May need pixel-level adjustment if still slightly off after last fix |
| **Task reordering persistence** | Low | Drag-and-drop works but order may not persist perfectly |
| **Dashboard/home page** | Low | Cross-project overview |

---

## KNOWN ISSUES / THINGS TO WATCH

1. **Gantt ↔ Grid row alignment**: Was recently fixed by splitting the grid header outside the scroll area. Both use `HEADER_HEIGHT = 34`. If user reports misalignment, adjust this value (it must match the grid-table th computed height).

2. **ScheduleView props**: If adding new props to ScheduleGrid (like `onSendToTracker`, `isInTracker`), they must also be threaded through ScheduleView.jsx which sits between App.jsx and ScheduleGrid.

3. **Register timestamps**: The `addRegisterItem` and `updateRegisterItem` in useProjectData.js now auto-stamp `createdAt`/`updatedAt`. Don't remove these.

4. **Business days**: The `dur` field on tasks means BUSINESS days everywhere. The Gantt uses `_calendarDays` (computed via `getCalendarSpan`) for visual bar width. Never use `dur * 86400000` directly for Gantt positioning — always convert.

5. **Status Report date filtering**: Uses `isInRange()` which compares date strings (YYYY-MM-DD). It handles both ISO timestamps and date-only strings.

6. **Supabase columns**: If adding new top-level data, you need to run an `ALTER TABLE` migration in Supabase SQL Editor before deploying code that references the new column.

7. **AI export scope**: `02_THIS_PERIOD_COMPLETED` uses project-scoped manual todos (`todo.projectId === currentProject.id`). `Other` todos are intentionally excluded from project-specific report exports.

8. **AI export is local-only**: Current implementation does not call external model APIs. If introducing BYOK/API mode later, keep it feature-flagged and preserve local export as default policy-safe mode.

---

## STYLE CONVENTIONS

- **Tailwind CSS** for all styling (utility-first)
- Font sizes: `text-[10px]` labels, `text-[11px]` small data, `text-[12.5px]` body text
- Colors: Indigo for primary, Emerald for success, Amber for warnings, Rose for errors
- RAG: Green = `bg-emerald-500`, Amber = `bg-amber-500`, Red = `bg-rose-500`
- Cards: `bg-white rounded-xl border border-slate-200 shadow-sm p-5`
- Section labels: `text-[10px] font-bold text-slate-400 uppercase tracking-widest`
- All components are functional with hooks (no class components)

---

## QUICK REFERENCE — FILE MODIFICATION PATTERNS

**Adding a new field to Status Report:**
1. Add default value to `DEFAULT_STATUS_REPORT` in constants.js
2. Add textarea/input in StatusReportView.jsx with `handleFieldChange('fieldName', value)`
3. It auto-saves via useProjectData → Supabase (no migration needed, it's inside the jsonb)

**Adding a new register column:**
1. Add column name to the relevant `SCHEMAS[registerType].cols` array in constants.js
2. RegisterView auto-renders it — no component changes needed

**Adding a new tab:**
1. Add to `TABS` array in constants.js
2. Create component in `src/components/`
3. Import in App.jsx
4. Add routing in the main render conditional chain in App.jsx
5. Add to Excel export if needed

**Changing AI report export content:**
1. Update sheet logic in `src/utils/aiReportExport.js` (`buildAiReportExportData`)
2. If adding a new sheet, append it in `handleExportAiReport` inside `src/App.jsx`
3. If changing user interaction, update `src/components/StatusReportView.jsx` (button/modal/help panel)
4. Add or update assertions in `src/utils/aiReportExport.test.js`
5. Run:
   - `npm run test`
   - `npm run build`

**Modifying Gantt visuals:**
- Plugins are in GanttChart.jsx: `rowStripesPlugin`, `todayLinePlugin`, `weekendShadingPlugin`, `ganttOverlayPlugin`
- Bar colors set in the dataset's `backgroundColor` callback
- Summary bars, baselines, and dependency arrows are all in `ganttOverlayPlugin.afterDatasetsDraw`

---

## NEXT-WEEK IMPLEMENTATION PLAN (2026-02-22)

### Current reality (important)
- Primary working repo is now: `/Users/doringalben/project-manager/`
- Local dev server currently runs at: `http://localhost:3002/`
- Recent demo commits:
  - `5416184` demo visuals + MT/AL quick actions
  - `4bdc441` merged Fill Tabs into SD-WAN Demo
  - `f33dd56` demo benefits modal + all-tabs loader
  - `fb3cd0f` SD-WAN template

### Goal A: Auto Demo Project for new users (efficient + low memory)

#### Business behavior
1. First login for a user with zero projects:
   - auto-create one project: `SD-WAN Demo`
   - this project includes demo schedule/registers/tracker/status data
2. When user creates a new project:
   - new project is blank (no demo data)
3. Demo-only controls are shown only inside demo project (optional but recommended):
   - `SD-WAN Demo`, `Reset Demo`, `Free Benefits`

#### Technical design (optimized)
- Add project metadata flag instead of duplicating logic by name:
  - `is_demo boolean not null default false`
- Keep only one demo project per user:
  - optional partial unique index on `(user_id)` where `is_demo = true`
- Extract demo payload generation into a shared utility:
  - new file suggestion: `src/utils/demoProjectBuilder.js`
  - output: `{ tasks, registers, tracker, status_report, baseline }`
  - used by:
    - `useProjectData.loadDemoDataAllTabs()`
    - `ProjectSelector` first-login auto-seed
- Memory strategy:
  - no additional static data in DB besides one demo project per user
  - new projects remain empty JSON structures
  - ToDo aggregation (below) will be derived at runtime to avoid duplicate storage

#### Files to touch
- `src/components/ProjectSelector.jsx`
  - detect zero projects and seed demo project once
  - include `is_demo` in select
  - set `is_demo: false` for user-created projects
- `src/App.jsx`
  - pass project `is_demo` to header (if hiding demo buttons by project type)
- `src/components/Header.jsx`
  - optionally gate demo buttons based on `is_demo`
- `src/hooks/useProjectData.js`
  - replace inline demo seed duplication with shared builder
- `src/utils/demoProjectBuilder.js` (new)
- Supabase SQL migration (manual run in SQL editor)

#### DB migration draft
```sql
alter table public.projects
  add column if not exists is_demo boolean not null default false;

create index if not exists idx_projects_user_demo
  on public.projects(user_id, is_demo);

create unique index if not exists uq_projects_one_demo_per_user
  on public.projects(user_id)
  where is_demo = true;
```

### Goal B: Add ToDo tab (aggregated + manual + recurring)

#### Business behavior
- New tab: `ToDo`
- Shows one action list merged from:
  - Action Log
  - Issue Log
  - Change Log
  - (optional) tracked schedule tasks / tracker items with due dates
- Grouping buckets:
  - `Passed deadline`
  - `This week`
  - `Next week`
  - `In 2 weeks`
  - `Weeks 3-4`
  - `Later / no deadline` (recommended for edge cases)
- Users can add manual ToDo items (not part of Action Log)
- Manual ToDo supports recurring reminders:
  - `Weekdays`
  - `Weekly`
  - `Monthly`
  - `Yearly`

#### Data model (lean)
- Manual todos are stored in `public.manual_todos` (not in `public.projects`).
- Aggregated register/schedule items are computed in memory at render time.
- Proposed manual todo shape:
```js
{
  _id: "todo_...",
  projectId: "uuid | null", // null => Other
  title: "Send weekly report",
  dueDate: "YYYY-MM-DD",
  owner: "PM",
  assigneeUserId: "uuid | null",
  status: "Open" | "Done",
  recurrence: null | {
    type: "weekdays" | "weekly" | "monthly" | "yearly",
    interval: 1
  },
  createdAt: "...",
  updatedAt: "...",
  completedAt: "..." // optional
}
```

#### Implementation blocks
1. Create `manual_todos` table + RLS + indexes
2. Add helper functions:
   - `collectDerivedTodos(projectData, registers, tracker)`
   - `bucketByDeadline(items, today)`
3. New component:
   - `src/components/TodoView.jsx`
4. Add tab entry in `src/utils/constants.js`
5. Route tab in `src/App.jsx`
6. Recurring logic:
   - when recurring todo marked done, create next due item automatically
   - supports `Weekdays`, `Weekly`, `Monthly`, `Yearly`
7. Optional legacy backfill + cleanup:
   - backfill from `projects.todos` to `manual_todos`
   - drop `projects.todos` after validation

#### Testing focus
- New unit tests in `src/utils/helpers.test.js`:
  - bucket boundaries for all groups
  - overdue behavior
  - recurring next date generation (`Weekdays`, `Weekly`, `Monthly`, `Yearly`)

#### Legacy migration note (safe sequence)
Run these SQL scripts in order:
1. `scripts/sql/2026-02-23_create_manual_todos.sql`
2. `scripts/sql/2026-02-23_backfill_manual_todos_from_projects.sql` (only needed if legacy `projects.todos` data exists)
3. `scripts/sql/2026-02-23_drop_legacy_projects_todos.sql` (after validation)
4. `scripts/sql/2026-02-23_manual_todos_preflight_checks.sql` (recommended final verification)

### Goal C: Rename Schedule tab label to Project Plan
- Keep tab id as `schedule` (do not change key; avoids regressions)
- Change only label in `src/utils/constants.js`:
  - from `"Schedule"` to `"Project Plan"`
- Also update user-facing text/tooltips where relevant

### Suggested execution order (low risk)
1. Rename tab label (quick win, very low risk)
2. Extract shared demo builder + first-login demo auto-seed
3. Add `is_demo` DB column + UI gating for demo controls
4. Add ToDo tab skeleton (manual items only)
5. Add derived action aggregation + bucket grouping
6. Add recurring weekly behavior + tests

### Effort estimate
- A) Auto demo onboarding + cleanup: 0.5 to 1 day
- B) ToDo tab full v1 (manual + aggregation + buckets + recurring): 1.5 to 2.5 days
- C) Rename Schedule to Project Plan: < 1 hour

### Rollout approach
- Implement in small commits and test locally first (`npm run dev`, `npm run test`, `npm run build`)
- Push only after each phase passes local checks
- Keep one short validation checklist per phase in commit message body

### Channel continuity note
- This chat is still usable right now, but it is already very long.
- Before starting the next coding block, start a fresh thread and reference this section plus commit `5416184` as your baseline.
