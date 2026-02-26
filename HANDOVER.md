# PROJECT HANDOVER — Project Management OS

## OVERVIEW
A full-featured **React + Vite** project management web app with Gantt chart, RAID registers, master tracker, status reporting, AI assistant, mobile responsive views, and Supabase backend. Deployed on **Vercel** with GitHub auto-deploy.

- **Live URL**: https://project-manager-app-tau.vercel.app
- **GitHub Repo**: User's private repo (auto-deploys to Vercel on push)
- **Canonical Local Path**: `/Users/doringalben/project-manager/`
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Stack**: React 18, Vite, Tailwind CSS, Chart.js, xlsx
- **Backup Script**: `/Users/doringalben/project-manager/scripts/weekly-backup.sh`

---

## CURRENT STATE SNAPSHOT (2026-02-26) — FOR NEW CHAT OR NEW LLM

This section is the authoritative handoff state for continuing work in a new chat.

### 1) Repository and deployment state
- **Repo path**: `/Users/doringalben/project-manager`
- **Primary branch**: `main`
- **Deployed flow**: GitHub push to `main` triggers Vercel auto-deploy
- **Live status**: UI redesign + mobile implementation deployed and verified

### 2) Session history (2026-02-25 to 2026-02-26)
The following work was completed across multiple sessions:

#### Session 1: AI Integration — BYOK Setup (2026-02-25)
- Added Bring Your Own Key (BYOK) AI integration
- Files: `src/utils/aiClient.js`, `src/utils/aiPrompts.js`, `src/utils/aiSettings.js`
- Components: `src/components/AiSettingsModal.jsx`, `src/components/AiReportPanel.jsx`
- Supports Anthropic (Claude) and OpenAI APIs
- AI-powered status report generation from project data

#### Session 2: AI Plan Assistant + Voice (2026-02-25)
- Conversational AI assistant for project plan creation/editing
- Files: `src/utils/aiPlanAssistant.js`, `src/components/AiAssistantPanel.jsx`
- Speech recognition integration for voice input
- Chat-based interface for natural language plan editing

#### Session 3: Security & Performance Audit (2026-02-25)
Completed 8-item security audit:
1. ✅ CORS lockdown (Supabase dashboard setting)
2. ✅ API key migration (moved from query params to headers)
3. ✅ React.memo optimization on heavy components
4. ✅ XSS elimination (removed dangerouslySetInnerHTML)
5. ✅ beforeunload guard for unsaved changes
6. ✅ Input sanitization on user-facing fields
7. ✅ Supabase RLS policies verified
8. ✅ Email digest modal + AI plan assistant patch-mode fix

#### Session 4: Backup Strategy (2026-02-26)
- Created weekly backup script at `/Users/doringalben/project-manager/scripts/weekly-backup.sh`
- Backs up: Git bundle, Supabase data export, .env files
- Retention: 4 weekly backups

#### Session 5: UI/UX Redesign (2026-02-26)
Complete visual overhaul based on screenshot audit:
- **Phase 1**: Light theme throughout, cleaner toolbar, project health cards
- **Phase 2**: Mobile-first bottom navigation (reverted — done properly in Session 7)
- **Phase 3**: Register tooltips, navigation scroll indicators, wider columns
- Files modified: `Header.jsx`, `Navigation.jsx`, `AuthPage.jsx`, `ProjectSelector.jsx`, `StatusReportView.jsx`, `ScheduleGrid.jsx`, `RegisterView.jsx`, `TrackerView.jsx`, `TodoView.jsx`, `styles/index.css`, `index.css`

#### Session 6: Mobile UX Research + Design Spec (2026-02-26)
- Competitive analysis of Asana, Monday, Smartsheet, ClickUp, Jira mobile approaches
- Created comprehensive mobile design spec with progressive disclosure pattern
- Built interactive React prototype (mobile-prototype.jsx)
- Architecture assessment: mobile adds ~855 lines (~8% increase), shares 100% of data logic

#### Session 7: Mobile UI Implementation (2026-02-26)
- 11 new mobile components (1,458 lines total)
- Delivered as `mobile-implementation.zip` then `mobile-fix-1.zip` (bug fixes)
- Bottom navigation, card-based layouts, slide-up detail sheets
- Shared data architecture — mobile calls same `useProjectData` hook as desktop
- Key files added to `src/components/mobile/`:
  - `MobileLayout.jsx`, `BottomNav.jsx`, `MobileHeader.jsx`
  - `MobileHome.jsx`, `MobilePlan.jsx`, `MobileTodo.jsx`
  - `MobileLogs.jsx`, `MobileMore.jsx`
  - `TaskCard.jsx`, `TaskDetailSheet.jsx`, `RegisterCard.jsx`
- Bug fixes: Bottom nav height (safe area), "Untitled" cards in logs

#### Session 8: Market Research + Monetisation Strategy (2026-02-26)
- Comprehensive PM software market research (2025-2026 data)
- Competitive pricing analysis (Smartsheet, Monday, Asana, Trello, Teamwork)
- SaaS conversion benchmarks (freemium vs free trial data)
- Indie/micro-SaaS revenue metrics and timelines
- Delivered as `monetisation-plan.docx` (22KB, 8 sections)
- **Recommended model**: 30-day free trial (not freemium) — 10-25% conversion vs 2-5%
- **Pricing**: Pro £8/user/mo (3 projects, 100 tasks, 5 AI/mo), Team £15/user/mo (unlimited)

#### Session 9: Monetisation Implementation — Step 1 (2026-02-26, current)
- User enabled Supabase email confirmation (Confirm sign up toggle)
- Created monetisation code layer:
  - `supabase-migration.sql` — user_profiles table + trigger + RLS
  - `src/contexts/PlanContext.jsx` — plan state, limits, gating functions
  - `src/components/UpgradeBanner.jsx` — trial banner, limit banners, plan badge
  - `src/main.jsx` — updated to wrap with PlanProvider
  - `INTEGRATION-GUIDE.md` — step-by-step apply instructions
- **Status**: Files created, NOT YET DEPLOYED. User needs to:
  1. Run SQL migration in Supabase
  2. Copy new files into project
  3. Apply 4 small edits to App.jsx, ProjectSelector.jsx, Header.jsx
  4. Commit and push

### 3) Monetisation layer — plan limits

| Feature           | Trial (30 days) | Pro (£8/mo) | Team (£15/mo) | Expired |
|-------------------|-----------------|-------------|----------------|---------|
| Projects          | Unlimited       | 3           | Unlimited      | 1       |
| Tasks per project | Unlimited       | 100         | Unlimited      | 30      |
| AI reports        | 5 total         | 5/month     | Unlimited      | 0       |
| Export            | ✓               | ✗           | ✓              | ✗       |
| Baseline          | ✓               | ✗           | ✓              | ✗       |
| Mobile            | ✓               | ✓           | ✓              | ✓       |

### 4) Database schema

#### Table: `projects`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Project name |
| user_id | uuid | Owner (from auth) |
| is_demo | boolean | Demo project flag |
| tasks | jsonb | Array of task objects |
| registers | jsonb | 7 RAID register arrays |
| baseline | jsonb | Snapshot for variance tracking |
| tracker | jsonb | Master tracker items |
| status_report | jsonb | Status report fields |
| created_at / updated_at | timestamptz | Auto |

#### Table: `manual_todos`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| project_id | uuid | Nullable (null = Other) |
| title, owner, due_date | text/date | Core fields |
| status | text | Open / Done |
| recurrence | jsonb | Nullable, type + interval |
| created_at / updated_at / completed_at | timestamptz | Timestamps |

#### Table: `user_profiles` (NEW — from monetisation migration)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK, references auth.users |
| plan | text | trial / pro / team |
| trial_start | timestamptz | When trial began |
| trial_ends | timestamptz | trial_start + 30 days |
| ai_reports_used | integer | Counter, resets monthly for paid |
| ai_reports_reset_at | timestamptz | Last reset date |
| stripe_customer_id | text | Nullable, for Stripe integration |
| stripe_subscription_id | text | Nullable, for Stripe integration |
| created_at / updated_at | timestamptz | Auto |

**RLS**: All tables have row-level security. Users see only their own data.
**Trigger**: `on_auth_user_created` auto-creates a `user_profiles` row on signup.

### 5) File structure (current)

```
src/
├── App.jsx                    # Main app: routing, import/export, tab switching
├── main.jsx                   # Entry point (wraps AuthProvider + PlanProvider)
├── index.css                  # Global styles
├── styles/index.css           # Tailwind + component styles
├── components/
│   ├── AuthPage.jsx           # Login/signup
│   ├── ProjectSelector.jsx    # Multi-project dashboard
│   ├── Header.jsx             # Top bar: actions, baseline, export/import
│   ├── Navigation.jsx         # Tab bar
│   ├── ScheduleView.jsx       # Split-pane: grid + Gantt
│   ├── ScheduleGrid.jsx       # Editable task table
│   ├── GanttChart.jsx         # Chart.js Gantt with plugins
│   ├── TaskModal.jsx          # Add/edit task modal
│   ├── RegisterView.jsx       # RAID register table
│   ├── TrackerView.jsx        # Master Tracker tab
│   ├── StatusReportView.jsx   # Status Report + AI export trigger
│   ├── TodoView.jsx           # Cross-project ToDo view
│   ├── DemoBenefitsModal.jsx  # Demo benefits modal
│   ├── AiReportPanel.jsx      # AI report generation panel
│   ├── AiAssistantPanel.jsx   # Conversational AI plan assistant
│   ├── AiSettingsModal.jsx    # BYOK API key settings
│   ├── EmailDigestModal.jsx   # Email digest composer
│   ├── Icons.jsx              # SVG icon components
│   ├── UpgradeBanner.jsx      # NEW: Trial/limit banners, PlanBadge
│   └── mobile/                # NEW: Mobile responsive components
│       ├── MobileLayout.jsx
│       ├── BottomNav.jsx
│       ├── MobileHeader.jsx
│       ├── MobileHome.jsx
│       ├── MobilePlan.jsx
│       ├── MobileTodo.jsx
│       ├── MobileLogs.jsx
│       ├── MobileMore.jsx
│       ├── TaskCard.jsx
│       ├── TaskDetailSheet.jsx
│       └── RegisterCard.jsx
├── hooks/
│   ├── useProjectData.js      # Core data hook: all CRUD, Supabase sync
│   └── projectData/
│       ├── defaults.js
│       ├── loadSave.js
│       ├── manualTodoUtils.js
│       ├── registers.js
│       └── todos.js
├── contexts/
│   ├── AuthContext.jsx         # Supabase auth context
│   └── PlanContext.jsx         # NEW: Plan state, limits, gating
├── lib/
│   └── supabase.js            # Supabase client
└── utils/
    ├── constants.js            # Schemas, tabs, column configs
    ├── helpers.js              # Date math, schedule calc, hierarchy
    ├── importParsers.js        # Excel import helpers
    ├── demoProjectBuilder.js   # Demo data generator
    ├── aiClient.js             # BYOK AI API client
    ├── aiPrompts.js            # AI prompt templates
    ├── aiSettings.js           # AI settings persistence
    ├── aiPlanAssistant.js      # Conversational plan editing logic
    └── aiReportExport.js       # AI report workbook builder
```

### 6) Test and build state
- `npm run test` → **28/28 passing** (as of last verified build)
- `npm run build` → **passing**
- Primary test files: helpers.test.js, importParsers.test.js, manualTodoUtils.test.js, projectDataFlows.test.js, aiReportExport.test.js

### 7) Copy/paste prompt for starting a new chat

```text
Use /Users/doringalben/project-manager/HANDOVER.md as source of truth.
Repo: /Users/doringalben/project-manager
Branch: main
Stack: React 18, Vite, Tailwind CSS, Supabase (PostgreSQL + Auth + RLS)

Key context:
- App has desktop + mobile responsive views (shared data layer)
- Monetisation layer in progress: PlanContext + UpgradeBanner + user_profiles table
- AI features: BYOK report generation + conversational plan assistant
- 7 RAID registers, Gantt chart, master tracker, status reports, todos

Before changing code, read HANDOVER.md and summarise current state.
After implementing: run npm run test and npm run build, then provide commit/push commands.
```

---

## RELEASE CHECKLIST (FAST)

1. Local verification:
   ```bash
   cd /Users/doringalben/project-manager
   npm run test
   npm run build
   ```

2. Commit + push:
   ```bash
   git add -A
   git commit -m "release message"
   git push origin main
   ```

3. Post-deploy smoke test (production):
   - Open existing project, check desktop + mobile views
   - Verify trial banner shows for trial users
   - Test AI report generation (check counter increments)
   - Test export (should work during trial)

---

## REMAINING ROADMAP

| Feature | Priority | Status |
|---------|----------|--------|
| **Monetisation: Stripe integration** | HIGH | Next — pricing page + Checkout + webhooks |
| **Monetisation: Task count gating** | HIGH | Limit defined (100 Pro), needs wiring into addTask |
| **Monetisation: Trial expiry emails** | MEDIUM | Needs Supabase Edge Functions + Resend/SMTP |
| **Monetisation: Landing page** | MEDIUM | Public-facing pricing + feature comparison |
| **Monetisation: Template library** | LOW | Paid add-ons (£15-30 each) for Phase 4 |
| **AI report automation (Phase 2)** | MEDIUM | Optional in-app generation (BYOK mode exists) |
| **Code optimization** | LOW | Bundle size, lazy loading review |

### Go-to-market timeline (from monetisation plan)
- **Weeks 1-2**: Apply monetisation code + Stripe integration
- **Weeks 3-4**: Landing page + Product Hunt listing prep
- **Week 5**: LAUNCH (Product Hunt + LinkedIn + Reddit)
- **Months 2-4**: First revenue target £100+ MRR
- **Month 12**: Target 50+ paying customers, £500+ MRR

---

## KEY ARCHITECTURAL PATTERNS

### Auto-save with Debounce
`useProjectData.js` watches all state and auto-saves to Supabase after 1.5s of inactivity.

### Business Days
All scheduling uses Mon-Fri business days. Key functions in `helpers.js`: `addBusinessDays`, `countBusinessDays`, `getFinishDate`, `calculateSchedule`.

### Mobile Architecture
Mobile components in `src/components/mobile/` are **alternative renderers** of the same data. They receive the same props and call the same `useProjectData` functions as desktop components. Detection: `useMediaQuery('(max-width: 768px)')` in App.jsx.

### Plan Gating
`PlanContext.jsx` provides `usePlan()` hook with gating booleans: `canCreateProject`, `canUseAiReport`, `canExport`, `canBaseline`, `getTaskLimit()`. Components check these before allowing actions. The `TrialBanner` component shows countdown and upgrade prompts.

### Gantt Chart
Two Chart.js instances (axis header + scrollable body). Custom plugins: rowStripes, todayLine, weekendShading, ganttOverlay (draws summary bars, baselines, dependency arrows).

---

## STYLE CONVENTIONS

- **Tailwind CSS** for all styling (utility-first)
- Font sizes: `text-[10px]` labels, `text-[11px]` small data, `text-[12.5px]` body
- Colors: Indigo primary, Emerald success, Amber warnings, Rose errors
- RAG: Green `bg-emerald-500`, Amber `bg-amber-500`, Red `bg-rose-500`
- Cards: `bg-white rounded-xl border border-slate-200 shadow-sm p-5`
- All components are functional with hooks (no class components)

---

## KNOWN ISSUES / THINGS TO WATCH

1. **Gantt ↔ Grid row alignment**: Both use `HEADER_HEIGHT = 34`. Must match.
2. **SMTP rate limit**: Supabase built-in email = ~3/hour. Set up Resend/Brevo before launch.
3. **Monetisation not yet deployed**: Files created but need manual apply + SQL migration.
4. **Stripe not yet integrated**: `window.open('/pricing')` calls are placeholders.
5. **Task count gating**: Limit defined in PlanContext but not yet enforced in addTask flow.
6. **AI export is local-only by default**: BYOK mode exists but is optional.
