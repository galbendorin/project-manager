# Disaster Recovery Runbook — PM Workspace

This runbook documents PM Workspace backup coverage, recovery objectives, automated verification, and step-by-step recovery procedures. For detailed Q12 household data export and isolated local restore instructions, see [household-backup-restore.md](household-backup-restore.md).

---

## 1. Recovery Objectives & Verification Cadence

| Tier | Target RPO | Target RTO | Source & Schedule |
| --- | --- | --- | --- |
| **Core Supabase database** | Managed Supabase daily backup (or PITR on Pro+) | < 2 hours | Supabase Platform Backups |
| **Project JSON snapshots** | 7 days | < 30 minutes | Automated Sunday 03:00 UTC workflow (`.github/workflows/scheduled-backup.yml`) or `scripts/weekly_backup.sh` |
| **Household full-schema export (Q12)** | Monthly manual export | < 1 hour (isolated target) | `scripts/household-backup.mjs` + `scripts/verify-household-restore.mjs` |
| **Application & serverless runtime** | 0 (Git `main` + Vercel immutable deploys) | < 10 minutes | `vercel rollback` / `git revert` on `main` |

### Automated Weekly Schedule
Every Sunday at **03:00 UTC** (or on manual dispatch via Actions → **Scheduled Backup & DR Rehearsal**):
1. Installs isolated PostgreSQL (`@electric-sql/pglite@0.5.8`) and runs the full Q12 export/restore rehearsal + checksum verification tests (`scripts/household-backup.test.mjs`, `src/utils/backupTools.test.js`).
2. Probes live `https://pmworkspace.com/api/health` (or `vars.PRODUCTION_HEALTH_URL`) to confirm `status === "ok"` and live Supabase connectivity.
3. If the GitHub backup secrets are configured, runs `npm run backup:projects`, validates checksums via `npm run backup:verify`, encrypts the archive (`AES-256-CBC` with PBKDF2 `100000` iterations), deletes plaintext files immediately, and uploads `pmw-projects-backup.tar.gz.enc` with 30-day retention.

---

## 2. Backup & Configuration Inventory

### What Each Backup Covers
| Backup Layer | Covered Data | Not Covered / Limits |
| --- | --- | --- |
| **Supabase Managed Backup / PITR** | Full PostgreSQL cluster (`public.*`, `auth.*`, Storage metadata) | Storage object bytes (file uploads), Vercel/Stripe env vars |
| **Q12 Household Export (`household-backup.mjs`)** | 43 `public` product tables + composite household FKs (`docs/household-backup-restore.md`) | `user_profiles`, `billing_checkout_sessions`, `ai_generation_reservations`, `api_rate_limits`, `push_subscriptions`, `meal_ingredient_calorie_cache`, Auth passwords, Storage bytes |
| **Encrypted Project JSON (`backup:projects`)** | Owned `projects` rows (`tasks`, `registers`, `baseline`, `tracker`, `status_report`, `version`) with SHA-256 `manifest.json` | Collaborative tables outside `projects`, non-project household tools |

### Critical External Configuration (Back Up Secret Values Offline in a Password Manager)
Active Vercel project: **`project-manager-app`** (do **not** use the legacy `project-manager` project):
- `NEXT_PUBLIC_APP_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_CONTACT_EMAIL`
- `PLATFORM_AI_KEY` (set in Production)

---

## 3. Recovery Playbooks

### Playbook A — Single Project Corrupt or Accidentally Deleted Data
Use this when one project's tasks, schedule, registers, or baseline need restoring without touching the rest of the database.

1. **Obtain and decrypt the latest backup**:
   - If using the encrypted GitHub Actions artifact (`pmw-projects-backup-encrypted`):
     ```sh
     mkdir -m 0700 -p backups/recovered-restore
     openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
       -in pmw-projects-backup.tar.gz.enc \
       | tar -xzf - -C backups/recovered-restore
     ```
2. **Verify integrity before restoring**:
   ```sh
   npm run backup:verify -- backups/recovered-restore
   ```
   Confirm exit code `0` and `"ok": true` with the expected file count.
3. **List target owned project IDs**:
   ```sh
   npm run backup:list
   ```
4. **Restore the single project (saving an automatic pre-restore safety snapshot)**:
   ```sh
   node scripts/restore_project.cjs \
     --file backups/recovered-restore/<name>__<project-uuid>.json \
     --backup-current
   ```
   `restore_project.cjs` writes an automatic `_pre_restore_<timestamp>` safety copy first and applies optimistic locking (`version`) on update. Keep decrypted files inside gitignored `backups/` (`0700`/`0600`) and delete temporary copies after verification.

---

### Playbook B — Bad Production Deployment / Client Runtime Error
Use this when `/api/health` fails, `/api/client-error` spikes in Vercel Logs, or a regression ships on `main`.

1. **Check live health immediately**:
   ```sh
   curl -fsS https://pmworkspace.com/api/health
   ```
2. **Rollback instantly on Vercel** (takes seconds while reverting Git):
   ```sh
   vercel ls project-manager-app
   vercel rollback <previous-ready-deployment-url>
   ```
3. **Follow up in Git**:
   - Revert the offending commit on a branch, verify with `npm run release:preflight -- --skip-smoke`, open a PR, and merge cleanly to `main`.
4. **Mobile PWA Rule**:
   - **Never** instruct users to clear Safari website data or delete/reinstall the Home Screen PWA as a troubleshooting step — PM Workspace preserves offline drafts and sync journals locally in IndexedDB. Pushing a fixed build or rolling back triggers the service worker update prompt cleanly.

---

### Playbook C — SQL Migration or Permission Regression in Supabase
1. **Before running any manual SQL**:
   - Never modify or run archived scripts in `scripts/sql/` (especially legacy `scripts/sql/2026-04-15_share_meal_planner_with_shopping_list.sql` — Q08 household authorization evolved past it).
   - Always create a forward fix in `supabase/migrations/` and run `npm run check:sql-migrations`.
   - For any `SECURITY DEFINER` or trigger/RPC helper, explicitly execute:
     ```sql
     revoke all on function public.<fn_name>(...) from public, anon, authenticated;
     ```
     before granting back only what is required.
2. **If a forward migration must be rolled back**:
   - Write an additive compensating migration under `supabase/migrations/` restoring previous constraints/functions rather than editing applied historical migrations.
   - Install isolated PostgreSQL (`npm install --prefix /tmp/pmw-pglite --no-audit --no-fund @electric-sql/pglite@0.5.8`) and run the SQL regression suites listed in `.github/workflows/ci.yml` (`PGLITE_MODULE=/tmp/pmw-pglite/node_modules/@electric-sql/pglite/dist/index.js node --test scripts/investigations/<suite>.test.mjs`) before re-applying.

---

### Playbook D — Catastrophic Supabase Database Loss
1. Restore the database to the target recovery timestamp in **Supabase Dashboard → Database → Backups** (into the project or a new recovery instance).
2. If validating schema/data compatibility beforehand, export/rehearse the latest Q12 bundle locally using [household-backup-restore.md](household-backup-restore.md).
3. Verify critical schema invariants before opening traffic:
   - Check forward migrations under `supabase/migrations/` (which start at `20261127000000_baseline_marker.sql`) alongside historical baseline scripts in `scripts/sql/`, and confirm critical production RPCs (`check_api_rate_limit`, `apply_shopping_list_add_v3`, `reconcile_shopping_contribution_v1`, `update_meal_recipe_atomic`, `promote_task_to_project_plan_v1`, `claim_ai_generation_allowance`, `begin_checkout_session`).
   - Hit `https://pmworkspace.com/api/health` and confirm `{ "ok": true, "checks": { "supabase": "ok" } }`.
4. Reconcile Stripe subscription state if billing events occurred after the backup point (trigger webhook replay from Stripe Dashboard or inspect `user_profiles.subscription_status`).

---

### Playbook E — Secret / Credential Rotation
| Credential | Where to Rotate | Redeploy Needed? |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API Settings → Vercel `project-manager-app` Production & Preview envs | Yes |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Vercel `project-manager-app` envs | Yes |
| `WEB_PUSH_VAPID_PUBLIC_KEY` / `PRIVATE_KEY` | Generate new VAPID pair → Vercel envs (users re-tap **Enable phone alerts**) | Yes |
| `PLATFORM_AI_KEY` | AI Provider console → Vercel `project-manager-app` Production env | Yes |
| `BACKUP_ENCRYPTION_PASSPHRASE` / `BACKUP_USER_PASSWORD` | Dedicated backup account password + GitHub Repo Secrets | No (next workflow run) |

---

## 4. Setup Checklist for Automated Weekly Backups

### Option 1 — GitHub Actions Encrypted Weekly Artifact (Recommended)
Configure these **GitHub Repository Secrets** (`Settings → Secrets and variables → Actions`):
1. `VITE_SUPABASE_URL` — Supabase project URL
2. `VITE_SUPABASE_ANON_KEY` — Supabase anon public key
3. `BACKUP_USER_EMAIL` — Dedicated/target backup user email
4. `BACKUP_USER_PASSWORD` — Password for that account
5. `BACKUP_ENCRYPTION_PASSPHRASE` — High-entropy passphrase stored in your password manager (required; the workflow refuses to run unencrypted if any backup credential is set)

*(Optional Repository Variable)*:
- `PRODUCTION_HEALTH_URL` — Overrides the default `https://pmworkspace.com/api/health` target probed on weekly runs.

### Option 2 — Local macOS `launchd` Schedule
`scripts/weekly_backup.sh` resolves the repo directory dynamically, keeps the newest 8 timestamped folders under `backups/`, runs `npm run backup:verify`, and logs to `backups/logs/weekly-backup.log` using credentials in `.env` (gitignored).
