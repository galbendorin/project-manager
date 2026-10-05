# Household data backup and isolated restore

Q12 provides a repeatable **data export and local restore rehearsal**. Supabase
dashboard access through GitHub is sufficient. It does not require a password
login to the app, a database password, a paid Supabase plan or another hosted
project. These tools never restore into production.

## Export through the dashboard

1. Run `node scripts/household-backup.mjs --inventory inventory.sql`. Open the
   existing Supabase project, then SQL Editor, and run `inventory.sql`. Export
   as JSON and save its `inventory` object (not the outer result array) as
   `schema.json` in a private backup folder.
2. Identify the intended project owner UUID. Do not use the Supabase dashboard
   account UUID or export every customer's records. This export selects that
   owner's projects, project-linked household rows and personal/Finance rows.
3. Generate the read-only export SQL:

   ```sh
   node scripts/household-backup.mjs schema.json OWNER_UUID export.sql
   ```

4. Run `export.sql` in SQL Editor. It uses one repeatable-read, read-only
   transaction. Choose **Export → Copy as JSON**, then save the complete JSON
   result as `household.json`. Keep row payloads as strings; parsing and
   reserializing their numbers in JavaScript can corrupt bigint/decimal values.
5. Store exports in a private directory (`0700`) with files accessible only to
   you (`0600`). The repository ignores `backups/`; never commit or share the
   backup. Keep another protected copy away from this computer. This tool does
   not set up recurring backups or provide encryption/key management.

## Rehearse a restore

Install the test runtime separately from product dependencies:

```sh
npm install --prefix /tmp/pmw-household-runtime --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE=/tmp/pmw-household-runtime/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/verify-household-restore.mjs household.json restore-report.json
```

The verifier creates a fresh in-memory PostgreSQL database, builds typed tables,
imports the saved rows, compares every table's row count and SHA-256 of canonical
PostgreSQL JSON, and validates primary/unique keys and foreign keys. Composite
household relationships and self-referencing carryovers are included. All state
is discarded when the process closes. No connection URL or persistent database
destination is accepted. Reports contain counts/hashes, not private row content.
Neither the verifier nor exporter executes SQL constraint definitions from a
backup. Invalid identifiers, unsupported types, incomplete manifests, changed
content and missing parents fail.

CI runs an independent source export → restore journey, including Unicode,
JSON task contents, bigint above JavaScript's safe-integer range, exact decimal
values, checked checklist state and negative corruption/orphan controls.

## Coverage and limits

The current allowlist covers 43 public data tables: projects and embedded plan/register
JSON, project sharing/invites, tasks/boards/checklists, Shopping including
receipts/contributions/intents, Meals and grocery batches, Finance including
reconciliations, Baby, Habits, Weight, Timesheets and personal Matrix preferences. Empty tables are still
exported and checked. Auth references use UUID-only identity stubs: these prove
data relationships but cannot recreate logins. Selecting a household does not
claim to back up other project owners' data. Timesheet entries referring to
another owner's shared project are counted as scope gaps and prevent a passed
rehearsal; they cannot silently disappear from otherwise exported headers.
Missing referenced records also fail and require a reviewed expansion of scope.
Matrix exports use format v2; preferences outside the owned-project/manual-task
scope are counted and prevent a passed rehearsal. The verifier still supports
original format v1 backups with 42 public tables. The dated Q12 proof below
remains the historical 42-table result, not a live restore certification of Matrix.

Excluded public tables: user_profiles (billing/entitlements),
billing_checkout_sessions, ai_generation_reservations, api_rate_limits,
push_subscriptions and regenerable meal_ingredient_calorie_cache. The bundle
inventories these tables but exports none of their rows. Newly introduced
tables are not silently included: review coverage after schema changes.

Also excluded: auth credentials/providers/sessions, RLS/policies/grants,
functions/triggers/CHECK expressions, general indexes/defaults/sequences,
Storage object bytes, server secrets/integrations and unsent device-only
drafts. This rehearsal is not a complete Supabase disaster-recovery procedure,
a physical PostgreSQL backup, secure-erasure proof or authorization test.
Database backups also do not contain Storage object bytes; see
[Supabase backup coverage](https://supabase.com/docs/guides/platform/backups).

For an actual incident, first provision and validate a separate compatible
target with the application's reviewed schema/migrations and auth mappings.
Rehearse there before a production cutover. These tools intentionally provide
no production overwrite/cutover command. The older `backup:projects` and
`backup:restore` tools remain project-only and require password auth; their
restore command overwrites an existing live project and is not this rehearsal.

## Verified Q12 baseline — 30 September 2026

The existing production project was exported through authenticated Supabase
SQL Editor using GitHub dashboard sign-in. The private snapshot restored
2,587 rows across 42 public tables and an identity-stub table. All 96 foreign
keys validated, including Q08 composite household links; all table counts and
SHA-256 comparisons passed. Seven owner projects, 941 manual todos, 164 meals,
664 ingredients, 93 meal entries, 8 batches, 10 checklist items and populated
Finance/household records were present. Empty tables have schema/empty-content
evidence only. SQL Editor access is administrative evidence, not an RLS test.
Private exports and detailed verification reports are kept out of Git.
