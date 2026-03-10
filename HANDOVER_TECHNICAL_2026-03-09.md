# Technical Handover — 2026-03-09

## 1) Repository and Runtime
- Repository: `/Users/doringalben/project-manager`
- Branch: `main`
- Production alias: `https://project-manager-app-tau.vercel.app`
- Supabase project ID: `jbmcmtzizlckhgpogbev`
- Admin email (hardcoded): `galben.dorin@yahoo.com`

## 2) What Was Delivered on 2026-03-09

### 2.1 Plan model: Starter / Trial / Pro
- Replaced old `trial → expired` model with `starter → trial (30d) → pro`
- New users get 30-day Pro trial, then drop to Starter
- Starter: 3 projects, 30 tasks (+5 grace), 4 tabs unlocked, no AI, no baseline
- Pro: 10 projects (was unlimited — changed to 10), 500 tasks, all tabs, 100 AI reports/month, baseline, AI assistant
- Team: admin-only tier, unlimited everything
- Pricing: £7.99/month, £67/year

### 2.2 SQL migration
- File: `scripts/sql/2026-03-09_starter_pro_migration.sql`
- Status: **RUN AND VERIFIED** in Supabase SQL Editor
- Added columns: `stripe_customer_id`, `subscription_status`, `subscription_id`, `current_period_end`, `cancel_at_period_end`
- Existing trial users preserved with `plan='trial'`, `subscription_status='trialing'`
- `handle_new_user` trigger updated: new signups get 30-day trial

### 2.3 Files changed (all need to be in latest deployment)

| File | Path | Change |
|------|------|--------|
| PlanContext.jsx | `src/contexts/PlanContext.jsx` | Full rewrite — Starter/Trial/Pro/Team tiers, plan simulator, tab gating, task soft limits, read-only mode |
| App.jsx | `src/App.jsx` | Removed MobileLayout, added BlurOverlay wrapping, plan simulator dropdown, trial/cancellation/read-only banners, task limit enforcement in handleSaveTask, manual tracker wiring |
| BlurOverlay.jsx | `src/components/BlurOverlay.jsx` | **NEW FILE** — renders children behind CSS blur + upgrade overlay |
| Navigation.jsx | `src/components/Navigation.jsx` | Lock icons on gated tabs, opacity reduction |
| Header.jsx | `src/components/Header.jsx` | Gates baseline/import/export/add-entry by plan |
| UpgradeBanner.jsx | `src/components/UpgradeBanner.jsx` | TrialBanner, CancellationBanner, ReadOnlyBanner, LimitBanner (tasks_warning, tasks_hard), PlanBadge updated for all states |
| ScheduleView.jsx | `src/components/ScheduleView.jsx` | Accepts `isMobile` prop — hides Gantt + resizer on mobile; AI banner gated by `canUseAiAssistant` |
| ProjectSelector.jsx | `src/components/ProjectSelector.jsx` | Project limit enforcement, count display ("2 of 3 projects"), upgrade prompt, read-only warning, refreshProjectCount on create/delete |
| TrackerView.jsx | `src/components/TrackerView.jsx` | "+ Add Item" button for manual tracker entries, editable task name for manual items (taskId=null), "Manual" badge |
| useProjectData.js | `src/hooks/useProjectData.js` | New `addManualTrackerItem()` function, exported |

### 2.4 Plan simulator (admin only)
- Purple dropdown in the status bar (only visible for admin emails)
- Options: Real (Admin) | Starter | Trial Day 1 | Trial Day 29 | Trial Expired | Pro | Pro (Cancelling)
- Overrides UI view only — does NOT change database
- Use this to test all plan states from `galben.dorin@yahoo.com`

### 2.5 Mobile approach
- `MobileLayout` component removed entirely (import deleted from App.jsx)
- Single responsive layout: desktop UI on all screen sizes
- ScheduleView: Gantt chart hidden on mobile (`isMobile` prop), grid takes full width
- Mobile folder (`src/components/mobile/`) still exists but is dead code — safe to delete later

### 2.6 Tab gating (Starter plan)
Full access (no blur): `schedule`, `issues`, `actions`, `tracker`
Blurred with upgrade overlay: `statusreport`, `todo`, `risks`, `minutes`, `financials`, `stakeholdersmgmt`, `lessons`, `raci`

### 2.7 Task limit enforcement
- Starter: soft limit 30, hard limit 35 (30 + 5 grace)
- Tasks 31–35: alert warning but task still adds
- Task 36+: blocked with alert
- Logic in `App.jsx` → `handleSaveTask`

### 2.8 Project limit enforcement
- Starter: 3 projects, Pro: 10
- Create button disabled + "Limit reached" when at cap
- Read-only mode activates when downgraded user has more projects than allowed

### 2.9 Manual tracker items
- "+ Add Item" button in TrackerView header
- Creates tracker entry with `taskId: null`
- Task name is editable inline (click to edit)
- Shows "Manual" badge to distinguish from linked tasks
- Header "Add Entry" button hidden on tracker tab

## 3) Deployment Status

**CHECK BEFORE NEXT SESSION:** Verify all files from section 2.3 are deployed. Run:
```bash
cd /Users/doringalben/project-manager
git status
git log --oneline -5
```

If uncommitted changes exist:
```bash
git add src/App.jsx src/contexts/PlanContext.jsx src/components/BlurOverlay.jsx src/components/Navigation.jsx src/components/Header.jsx src/components/UpgradeBanner.jsx src/components/ScheduleView.jsx src/components/ProjectSelector.jsx src/components/TrackerView.jsx src/hooks/useProjectData.js
git commit -m "feat: Starter/Pro split, blur overlay, plan simulator, mobile layout, manual tracker, task limits"
git push origin main
```

## 4) Decisions Document
- File: `PM_OS_Plan_Decisions_2026-03-08.md` (uploaded to this session)
- Contains all questionnaire answers, pricing, tab access matrix, downgrade behaviour, admin/testing requirements
- **Upload this to the next Claude session as context**

## 5) Updated Project Plan
- File: `MyApp_2026-03-08_updated.xlsx`
- 63 tasks across 6 phases, target: April 1 launch
- 8 risks, 3 issues, 6 actions, 5 change controls
- **Import this into PM OS to replace the current Schedule**

## 6) What's Next (Priority Order)

### Phase 2 remaining (payments):
1. **Create Stripe account** — set up Pro product with £7.99/mo + £67/yr prices
2. **Edge Function: create-checkout-session** — Supabase Edge Function that creates a Stripe Checkout session
3. **Edge Function: stripe-webhook** — handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; updates `user_profiles` columns
4. **Edge Function: customer-portal** — returns Stripe Customer Portal URL for managing billing
5. **PricingPage.jsx** — Starter vs Pro comparison with monthly/annual toggle; research best SaaS comparison pages
6. **BillingScreen.jsx** — current plan, renewal date, manage billing link
7. **Wire UpgradeBanner** — all "Upgrade to Pro" buttons → real Stripe checkout (currently `window.open('/pricing')` placeholder)
8. **Card verification at trial start** — Stripe `setup_intent` flow with subtle skip option

### Phase 2 remaining (non-Stripe):
9. **Responsive CSS polish** — ensure desktop layout reads well on narrow mobile screens (text wrapping, horizontal scroll on tabs)
10. **Downgrade flow testing** — use plan simulator to verify read-only + export works

### Phase 3:
11. Landing page
12. Demo video
13. Marketing copy

## 7) Key Patterns for AI Coding Tool

- **Do not use `git add -A`** — stage explicit files only
- **Plan simulator** is UI-only — never writes to DB
- **BlurOverlay** wraps any tab view; pass `tabId` and it checks `hasTabAccess()`
- **`fullAccessTabs: null`** means all tabs unlocked (Pro/Trial/Team)
- **`taskId: null`** on tracker items means manual entry (not linked to Schedule)
- **Supabase cold starts** can cause blank screens — retry logic exists in ProjectSelector
- **Admin check:** `isAdminEmail()` in PlanContext — hardcoded array, not DB
- All `window.open('/pricing')` calls are **placeholders** — will be replaced with Stripe checkout URLs

## 8) Quick Commands
```bash
# Local dev
cd /Users/doringalben/project-manager
npm run dev
npm run test
npm run build

# Deploy
git push origin main   # Vercel auto-deploys

# Check deployment
# Visit: https://project-manager-app-tau.vercel.app
```
