# Supabase Migrations

## Cutover Boundary
- **`scripts/sql/` (Historical Archive & Test Fixtures):** Contains the 63 legacy SQL scripts through `2026-11-23_atomic_recurring_todo_completion.sql` already applied in production, plus PGlite/PostgreSQL test fixtures. Never delete, renumber, or replay those historical scripts against production.
- **`supabase/migrations/` (Tracked Forward Migrations):** All new schema, RLS, RPC, trigger, and grant changes must be added here as timestamped files named `<YYYYMMDDHHMMSS>_<snake_case_slug>.sql`, starting after `20261127000000_baseline_marker.sql`.

## Standard Supabase CLI Workflow

1. Link your project (once per local workspace):
   ```bash
   supabase link --project-ref <PROJECT_REF>
   ```
2. On existing environments where legacy `scripts/sql/` changes are already live, record the baseline marker without re-running historical scripts:
   ```bash
   supabase migration repair --status applied 20261127000000
   ```
3. Preview pending migrations before applying:
   ```bash
   supabase db push --dry-run
   ```
4. Apply tracked migrations:
   ```bash
   supabase db push
   ```
   *(Fallback if CLI access is unavailable: run the new `supabase/migrations/*.sql` file in the Supabase SQL Editor, then run `supabase migration repair --status applied <TIMESTAMP>` when CLI access is available.)*

## Mandatory SQL Safety Checklist
- Wrap migrations in `begin; ... commit;` and use idempotent DDL (`if not exists`, `create or replace`, `drop ... if exists`).
- For every server-only or restricted PostgreSQL function, explicitly revoke from all client roles **before** granting back:
  ```sql
  revoke all on function public.my_fn(...) from public, anon, authenticated;
  grant execute on function public.my_fn(...) to service_role;
  ```
  (`REVOKE EXECUTE ... FROM PUBLIC` alone does **not** remove explicit grants to `anon` or `authenticated` — verified by `npm run check:sql-migrations`.)
- Pin `set search_path = ''` (or `set search_path = public` where required) on `SECURITY DEFINER` and trigger functions.
- Add or update isolated PGlite / PostgreSQL tests under `scripts/investigations/` and wire them into `.github/workflows/ci.yml`.
- Apply required database migrations **before** deploying Vercel server or client code that depends on new columns, RPCs, or RLS policies.
