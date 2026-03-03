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

## CURRENT STATE SNAPSHOT (2026-02-28) — FOR NEW CHAT OR NEW LLM

This section is the authoritative handoff state for continuing work in a new chat.

### 1) Repository and deployment state
- **Repo path**: `/Users/doringalben/project-manager`
- **Primary branch**: `main`
- **Deployed flow**: GitHub push to `main` triggers Vercel auto-deploy
- **Live status**: UI redesign + mobile implementation deployed. Monetisation files created but NOT yet deployed.

### 2) BUGS — STATUS (discovered 2026-02-28)

#### Bug A: Mobile — Cannot type new project name (CRASH) — ✅ FIXED
- **Fix applied**: Wrapped input in `<form>` element (mobile keyboard "Go" works), stabilised onChange with `useCallback`, added `autoComplete="off"`, `autoCorrect="off"`, `spellCheck="false"`, `enterKeyHint="go"`. Added `inputRef` for focus recovery on error.
- **File**: `ProjectSelector.jsx` (replaced entirely)

#### Bug B: Supabase cold start causes "No projects" on first load — ✅ FIXED
- **Fix applied**: Auto-retry with 3s delay when first fetch fails. Progressive loading: "Loading projects..." → "Waking up the database..." → "Setting up your workspace...". Animated spinner instead of plain text.
- **File**: `ProjectSelector.jsx` (replaced entirely)

#### Bug C: New signups don't receive email verification — ⚠️ NOT FIXED (dashboard config)
- **Root cause**: Supabase built-in email = ~3 emails/hour, unreliable
- **Fix needed**: Set up **Resend** (free: 100/day) or **Brevo** (300/day free) as SMTP
- **How**: Supabase Dashboard → Authentication → Settings → SMTP → enter credentials
- **Workaround**: Manually confirm users in Dashboard → Authentication → Users → Confirm
- **Resend setup**: https://resend.com → Get API key → Add domain → Configure in Supabase SMTP settings

#### Bug D: Demo project not seeded for new accounts — ✅ FIXED
- **Fix applied**: `seedDemoProject()` retries up to 2 times with 3s delays. Combined with Bug B cold start retry, new accounts reliably get demo project.
- **File**: `ProjectSelector.jsx` (replaced entirely)

### 3) MONETISATION LAYER — PARTIALLY APPLIED

#### Files ready to deploy (all in monetisation-step1-complete.zip):
- `src/contexts/PlanContext.jsx` — plan state, limits, gating functions ✅
- `src/components/UpgradeBanner.jsx` — trial banner, limit banners, plan badge ✅
- `src/main.jsx` — updated entry point (wraps with PlanProvider) ✅
- `src/App.jsx` — TrialBanner + export/AI/baseline gating ✅ APPLIED
- `src/components/Header.jsx` — PlanBadge added ✅ APPLIED
- `src/components/ProjectSelector.jsx` — Bug fixes + light theme ✅ APPLIED

#### Still TODO (SQL migration only):

**SQL Migration** — Run in Supabase SQL Editor:
- File: `supabase-migration.sql` (in the monetisation-step1.zip or can be recreated)
- Creates `user_profiles` table with plan, trial_start, trial_ends, ai_reports_used
- Adds trigger to auto-create profile on signup
- Backfills existing users
- Adds RLS policies

**All code edits have been applied** in the files inside `monetisation-step1-complete.zip`.
Just copy the files and deploy.

#### Plan limits (for reference):

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

#### Table: `user_profiles` (NEW — not yet created, needs SQL migration)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK, references auth.users |
| plan | text | trial / pro / team |
| trial_start | timestamptz | When trial began |
| trial_ends | timestamptz | trial_start + 30 days |
| ai_reports_used | integer | Counter, resets monthly for paid |
| ai_reports_reset_at | timestamptz | Last reset date |
| stripe_customer_id | text | Nullable, for future Stripe |
| stripe_subscription_id | text | Nullable, for future Stripe |
| created_at / updated_at | timestamptz | Auto |

**RLS**: All tables have row-level security. Users see only their own data.
**Auth**: Supabase Auth with email/password. "Confirm sign up" is now enabled.

### 5) Session history (2026-02-25 to 2026-02-26)

#### Session 1: AI Integration — BYOK Setup (2026-02-25)
- BYOK AI integration (Anthropic + OpenAI)
- Files: aiClient.js, aiPrompts.js, aiSettings.js, AiSettingsModal.jsx, AiReportPanel.jsx

#### Session 2: AI Plan Assistant + Voice (2026-02-25)
- Conversational AI plan creation with speech recognition
- Files: aiPlanAssistant.js, AiAssistantPanel.jsx

#### Session 3: Security & Performance Audit (2026-02-25)
- 8-item audit: CORS, API key headers, React.memo, XSS fix, beforeunload, sanitisation, RLS, email digest

#### Session 4: Backup Strategy (2026-02-26)
- Weekly backup script at scripts/weekly-backup.sh

#### Session 5: UI/UX Redesign (2026-02-26)
- Light theme, cleaner toolbar, project health cards, register tooltips, navigation scroll indicators

#### Session 6: Mobile UX Research + Design Spec (2026-02-26)
- Competitive analysis, design spec, interactive prototype

#### Session 7: Mobile UI Implementation (2026-02-26)
- 11 components in src/components/mobile/ (1,458 lines)
- Shared data architecture with desktop

#### Session 8: Market Research + Monetisation Strategy (2026-02-26)
- Full market research, pricing strategy, go-to-market plan
- Delivered as monetisation-plan.docx

#### Session 9: Monetisation Step 1 (2026-02-28)
- Created PlanContext, UpgradeBanner, migration SQL
- Discovered bugs B/C/D (cold start, SMTP, demo seed)
- Files copied but not deployed. Edits not yet applied.

### 6) File structure

```
src/
├── App.jsx                    # Main app: routing, import/export, tab switching
├── main.jsx                   # Entry point (PlanProvider added but not deployed)
├── styles/index.css           # Tailwind + component styles
├── components/
│   ├── AuthPage.jsx           # Login/signup
│   ├── ProjectSelector.jsx    # Multi-project dashboard (HAS MOBILE BUG)
│   ├── Header.jsx             # Top bar
│   ├── Navigation.jsx         # Tab bar
│   ├── ScheduleView.jsx       # Split-pane: grid + Gantt
│   ├── ScheduleGrid.jsx       # Editable task table
│   ├── GanttChart.jsx         # Chart.js Gantt
│   ├── TaskModal.jsx          # Add/edit task modal
│   ├── RegisterView.jsx       # RAID register table
│   ├── TrackerView.jsx        # Master Tracker
│   ├── StatusReportView.jsx   # Status Report + AI export
│   ├── TodoView.jsx           # Cross-project ToDo
│   ├── DemoBenefitsModal.jsx  # Demo benefits modal
│   ├── AiReportPanel.jsx      # AI report generation
│   ├── AiAssistantPanel.jsx   # AI plan assistant
│   ├── AiSettingsModal.jsx    # BYOK settings
│   ├── EmailDigestModal.jsx   # Email digest
│   ├── Icons.jsx              # SVG icons
│   ├── UpgradeBanner.jsx      # NEW (copied, not deployed)
│   └── mobile/
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
│   ├── useProjectData.js
│   └── projectData/
│       ├── defaults.js
│       ├── loadSave.js
│       ├── manualTodoUtils.js
│       ├── registers.js
│       └── todos.js
├── contexts/
│   ├── AuthContext.jsx
│   └── PlanContext.jsx         # NEW (copied, not deployed)
├── lib/
│   └── supabase.js
└── utils/
    ├── constants.js
    ├── helpers.js
    ├── importParsers.js
    ├── demoProjectBuilder.js
    ├── aiClient.js
    ├── aiPrompts.js
    ├── aiSettings.js
    ├── aiPlanAssistant.js
    └── aiReportExport.js
```

### 7) PRIORITY ORDER FOR NEXT SESSION

1. **Run SQL migration** — Create user_profiles table (paste supabase-migration.sql into SQL Editor)
2. **Copy all files from zip** — Replace ProjectSelector.jsx, App.jsx, Header.jsx, main.jsx + add PlanContext.jsx, UpgradeBanner.jsx
3. **Commit + deploy** — `git add -A && git commit -m "Bug fixes + monetisation layer" && git push`
4. **Set up Resend SMTP** — Fix email verification (Bug C) — 15 min in Supabase dashboard
5. **Test** — New signup flow end-to-end (phone + desktop)
6. **Next feature**: Stripe Checkout integration for paid plans

### 8) Copy/paste prompt for starting a new chat

```text
Use /Users/doringalben/project-manager/HANDOVER.md as source of truth.
Repo: /Users/doringalben/project-manager
Branch: main
Stack: React 18, Vite, Tailwind CSS, Supabase (PostgreSQL + Auth + RLS)

Recent changes (just deployed or about to deploy):
- Bug fixes: mobile input crash, cold start retry, demo seed retry (all in ProjectSelector.jsx)
- Monetisation layer: PlanContext, UpgradeBanner, gating in App.jsx/Header.jsx
- SQL migration for user_profiles table may still need to be run in Supabase

Next priorities:
1. Set up Resend SMTP for email verification
2. Stripe Checkout integration for paid plans
3. Landing page with pricing

Please read the codebase from my uploaded src.zip before making changes.
```

### 9) REMAINING ROADMAP

| Feature | Priority | Status |
|---------|----------|--------|
| **Fix mobile bugs (A, B)** | CRITICAL | ✅ Fixed in zip |
| **SMTP setup (Resend)** | CRITICAL | Not started (dashboard config) |
| **Monetisation edits + SQL** | HIGH | ✅ Code done, SQL migration pending |
| **Stripe integration** | HIGH | Not started — pricing page + Checkout + webhooks |
| **Trial expiry emails** | MEDIUM | Needs Edge Functions + SMTP |
| **Landing page** | MEDIUM | Public-facing pricing page |
| **Cron ping to keep DB warm** | LOW | cron-job.org free, 5 min setup |
| **Loading skeleton** | LOW | Branded spinner instead of blank screen |

### 10) OPERATIONAL NOTES

- **Supabase free tier**: DB pauses after ~10 min inactivity. Causes cold start delays.
- **SMTP limit**: Built-in email = ~3/hour. Must set up Resend/Brevo before launch.
- **Stripe not integrated**: `window.open('/pricing')` calls in UpgradeBanner are placeholders.
- **Task count gating**: Limit defined in PlanContext (100 for Pro) but not enforced in addTask yet.
- **Weekly backup**: Run `/Users/doringalben/project-manager/scripts/weekly-backup.sh`

---

## KEY ARCHITECTURAL PATTERNS

### Auto-save with Debounce
`useProjectData.js` watches all state and auto-saves to Supabase after 1.5s of inactivity.

### Business Days
All scheduling uses Mon-Fri business days. Key functions in `helpers.js`.

### Mobile Architecture
Mobile components in `src/components/mobile/` are alternative renderers of the same data. Detection: `useMediaQuery('(max-width: 768px)')` in App.jsx. Desktop components are NOT modified.

### Plan Gating
`PlanContext.jsx` provides `usePlan()` hook with gating booleans: `canCreateProject`, `canUseAiReport`, `canExport`, `canBaseline`. Components check these before allowing actions.

### Gantt Chart
Two Chart.js instances (axis header + scrollable body). Custom plugins: rowStripes, todayLine, weekendShading, ganttOverlay.

---

## STYLE CONVENTIONS

- **Tailwind CSS** utility-first
- Font sizes: `text-[10px]` labels, `text-[11px]` small data, `text-[12.5px]` body
- Colors: Indigo primary, Emerald success, Amber warnings, Rose errors
- All components are functional with hooks (no class components)

---

## RELEASE CHECKLIST (FAST)

```bash
cd /Users/doringalben/project-manager
npm run test
npm run build
git add -A
git commit -m "release message"
git push origin main
```

Post-deploy: check desktop + mobile, verify trial banner, test new signup flow.
