# PROJECT HANDOVER — Project Management OS

## OVERVIEW
A full-featured **React + Vite** project management web app with Gantt chart, RAID registers, master tracker, status reporting, and Supabase backend. Deployed on **Vercel** with GitHub auto-deploy.

- **Live URL**: https://project-manager-app-tau.vercel.app
- **GitHub Repo**: User's private repo (auto-deploys to Vercel on push)
- **Local Path**: `~/Downloads/project-manager/`
- **Backend**: Supabase (PostgreSQL + Auth)
- **Stack**: React 18, Vite, Tailwind CSS, Chart.js, xlsx

---

## DEPLOYMENT WORKFLOW (CRITICAL — FOLLOW EXACTLY)

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
│   └── StatusReportView.jsx   # Status Report tab (RAG, completion gauge, date filtering, milestones)
├── hooks/
│   └── useProjectData.js      # Core data hook: all CRUD, Supabase sync, timestamps
├── contexts/
│   └── AuthContext.jsx        # Supabase auth context provider
├── lib/
│   └── supabase.js            # Supabase client init
└── utils/
    ├── constants.js            # SCHEMAS, TABS, TRACKER_COLS, DEFAULT_TASK, DEFAULT_STATUS_REPORT, ICONS
    └── helpers.js              # Date math (business days), schedule calc, critical path, hierarchy
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

---

## REMAINING ROADMAP

| Feature | Priority | Notes |
|---------|----------|-------|
| **8d: Code optimization** | Medium | Bundle size, lazy loading, memoization review |
| **8f: AI auto-generated reports** | High | Send date-filtered data to Claude API, auto-generate narrative fields in Status Report |
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

**Modifying Gantt visuals:**
- Plugins are in GanttChart.jsx: `rowStripesPlugin`, `todayLinePlugin`, `weekendShadingPlugin`, `ganttOverlayPlugin`
- Bar colors set in the dataset's `backgroundColor` callback
- Summary bars, baselines, and dependency arrows are all in `ganttOverlayPlugin.afterDatasetsDraw`
