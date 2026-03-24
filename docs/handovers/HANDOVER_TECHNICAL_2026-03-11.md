# Technical Handover — Updated 2026-03-24

> This file is the current handover for PM Workspace.
> Use it at the start of a new chat/session to avoid re-discovering project state.

## 0) Quick Context

You are helping Dorin build **PM Workspace / PM OS**, a SaaS project delivery workspace.

- Repo: `/Users/doringalben/project-manager`
- Main branch: `main`
- Production URL: `https://pmworkspace.com`
- Hosting: Vercel
- Auth/DB: Supabase
- Billing: Stripe
- AI: Gemini platform key plus BYOK support

The user is non-technical but highly involved. Prefer implementing changes directly rather than over-explaining. Keep momentum high and avoid reverting unrelated work.

## 1) Important Working Rules

- Use explicit git staging, not broad destructive cleanup.
- Leave unrelated worktree changes alone.
- Prefer `rg` for search.
- Use `apply_patch` for manual edits.
- Run `npm run build` before close-out when code changes are made.
- Vercel auto-deploys from `main`.

## 2) Current Production State

PM Workspace is no longer in the March 11 state. Since then, the following areas were substantially improved and shipped:

### Landing / Public Site
- Hero redesign
- Value bullets redesign with icons
- Trust band
- Live workspace preview redesign
- Sticky nav and footer cleanup
- Focus/contrast cleanup
- Public Privacy and Terms pages

Main files:
- `src/components/AuthPage.jsx`
- `src/components/LegalPage.jsx`
- `src/App.jsx`

### Project Plan
- Better legend
- Better dependency explanations
- Searchable dependency picker
- Clearer dependency summaries/tooltips

Main files:
- `src/components/ScheduleView.jsx`
- `src/components/ScheduleGrid.jsx`

### Registers / Logs
- More filters and sorting
- Risk Log sort by Level
- Issue Log filters for Raised / Update / Completed
- Action Log filters for Raised / Update / Completed
- Lessons Learned filters for Phase and Category

Main files:
- `src/components/RegisterView.jsx`
- `src/components/mobile/MobileRegisterList.jsx`
- `src/utils/registerViewUtils.js`
- `src/utils/constants.js`

### Tasks Tab
- Multi-select filters
- Mobile filter bug fix
- Better mobile readability
- Add Task focuses input immediately
- Quick-add row at the bottom of buckets
- First-column completion tick
- Undo window for accidental tick
- Source-aware completion from Tasks view

Main files:
- `src/components/TodoView.jsx`
- `src/hooks/useProjectData.js`
- `src/hooks/projectData/todoCompletion.js`
- `src/utils/helpers.js`

### Billing / Security
- Billing endpoints now require authenticated Supabase session
- Server no longer trusts client-supplied Stripe identifiers

Main files:
- `api/_auth.js`
- `api/create-checkout-session.js`
- `api/customer-portal.js`
- `src/components/PricingPage.jsx`
- `src/components/BillingScreen.jsx`

### iPhone / PWA
- iPhone home-screen metadata added
- Manifest and icons added
- Standalone iPhone zoom behavior patched

Main files:
- `public/manifest.webmanifest`
- `public/pm-os-icon.svg`
- `public/apple-touch-icon.png`
- `src/main.jsx`
- `src/styles/index.css`
- `src/components/ProjectSelector.jsx`
- `src/components/TodoView.jsx`

## 3) Latest Relevant Commits

Most recent work sequence:

- `9b2b5aa` Fix iPhone standalone zoom behavior
- `d6e6e8a` Prevent iPhone zoom on app inputs
- `d010d40` Add undo window for task completion
- `6dbdb1a` Add bucket quick add and task completion tick
- `8c14b64` Add iPhone web app metadata
- `56a50a9` Improve task filter selection on mobile
- `8a960be` Improve mobile task list readability
- `4f6d517` Harden billing endpoint auth
- `e81fb8a` Improve task add focus flow
- `7af2c5d` Add multi-select task filters
- `87ae823` Hide status report add entry button
- `ab275c0` Expand register filters and risk sorting
- `c2296ea` Clarify dependency summaries
- `8662d5a` Improve schedule help tooltips
- `7a764fa` Add dependency search
- `a2f703e` Improve dependency picker
- `c69f841` Improve schedule guidance
- `8779f03` Add public legal pages

## 4) Current Architecture Reality

### Frontend
- React 18
- Vite
- Tailwind
- Single responsive app shell
- No separate native mobile app
- PWA-style iPhone home-screen support added

### Backend / Data
- Supabase auth and Postgres
- Project data is still largely project-scoped in app state and not yet normalized for high-scale collaboration
- Manual todos exist as their own table
- App code and backup/restore scripts expect `projects.version` for optimistic locking, but the repo does not currently include a tracked SQL migration for `projects.version` / `projects` RLS hardening
- There is still no full shared-project/member model

### Billing
- Stripe Checkout and Customer Portal are live
- Trial offer is 90-day free trial
- Production domain is `pmworkspace.com`

### AI
- Platform AI route uses Gemini
- BYOK AI support exists for OpenAI / Anthropic / Gemini
- AI report features are in app, but some GDPR/legal wording still needs tighter production alignment

## 5) Known Open Items

These are the main unfinished areas:

### Highest Product Gap
- **Shared projects / shared shopping lists are not built**
- Two separate accounts cannot yet collaborate in one project the way the user wants for shopping/checklist use

### Security / Data
- Core RLS / tenant isolation for `projects`, `user_profiles`, and related tables has not been fully verified from production
- `projects.version` is assumed by live app code and backup/restore scripts, but the repo currently does not contain a tracked migration for that schema change
- This is still one of the biggest unresolved technical/security tasks

### GDPR / Trust
- Privacy and Terms pages are live
- But privacy/data request flow is still not built
- Yahoo is still the support/privacy email path in production copy
- Domain mailbox is not set up yet

### Mobile
- Latest iPhone zoom fix was shipped, but user confirmation is still needed
- More mobile QA is still worthwhile after confirmation

### Collaboration
- No `project_members` model yet
- No invitation flow
- Manual todos are not yet truly shared between multiple accounts

## 6) Recommended Next Priority

If continuing development, the strongest next move is:

### Shared Project Access MVP
Build shared project collaboration so two accounts can use one project together.

Suggested MVP:
1. Add `project_members` table
2. Let owner invite another user
3. Make manual todos project-scoped for shared projects
4. Keep the existing Tasks mobile checklist behavior for shopping-style use

This solves the real user need:
- one project
- two accounts
- both can add/check items

## 7) Other Strong Next Steps

After shared access:

1. Verify/enforce RLS for `projects`, `user_profiles`, and related workspace tables
2. Replace Yahoo with `support@pmworkspace.com` / `privacy@pmworkspace.com` once mail exists
3. Add privacy/data request flow
4. Continue mobile QA
5. Consider a simple onboarding video for Project Plan / dependencies

## 8) Support / Legal Reality

Current live realities that matter:

- Production domain: `https://pmworkspace.com`
- Support/privacy contact is still effectively `galben.dorin@yahoo.com`
- Public Privacy and Terms pages exist
- DPA/subprocessor/legal draft review work was started, but not all legal wording is fully aligned to verified production reality yet

## 9) Files Worth Knowing

### Core app shell
- `src/App.jsx`
- `src/contexts/AuthContext.jsx`
- `src/contexts/PlanContext.jsx`

### Tasks / mobile productivity
- `src/components/TodoView.jsx`
- `src/hooks/useProjectData.js`
- `src/hooks/projectData/todoCompletion.js`
- `src/utils/helpers.js`

### Planning
- `src/components/ScheduleView.jsx`
- `src/components/ScheduleGrid.jsx`
- `src/components/TrackerView.jsx`

### Registers
- `src/components/RegisterView.jsx`
- `src/components/mobile/MobileRegisterList.jsx`
- `src/utils/registerViewUtils.js`

### Landing / legal
- `src/components/AuthPage.jsx`
- `src/components/LegalPage.jsx`

### API routes
- `api/_auth.js`
- `api/ai-generate.js`
- `api/create-checkout-session.js`
- `api/customer-portal.js`
- `api/stripe-webhook.js`

## 10) Build / Deploy

Standard local check:

```bash
cd /Users/doringalben/project-manager
npm run build
```

Push to production:

```bash
git push origin main
```

Vercel auto-deploys.

## 11) Worktree Notes

Current known unrelated worktree changes that should not be reverted casually:

- deleted: `HANDOVER_TECHNICAL_2026-03-09.md`
- untracked: `HANDOVER_TECHNICAL_2026-03-11.md`

If the user asks “what’s next?”, the best answer is:

- shared project members / shared tasks first
- RLS verification second
- privacy/data request flow third
