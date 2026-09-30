# Household authorization and meal relationships

Q08's bounded repair preserves existing personal meal-plan writes, household
recipe sharing, Shopping RPC signatures and RLS policies. It prevents browser
calls to the server-only invitation and raw owner lookup, including historical
explicit role grants that a PUBLIC-only revocation leaves effective.

The database derives an entry's household from its visible parent week. Composite
foreign keys bind batches to weeks, entries to weeks/recipes, leftovers to their
source and Shopping provenance to batches within the same household. These also
protect privileged writes and parent household changes. Existing cascade and
set-null behaviour remains in place. Backfilling the derived entry field preserves
existing modification timestamps and every existing task/recipe/plan field.

The migration is transactional and refuses existing inconsistent links or entries
in legacy unlinked weeks. Such a refusal requires investigation; it does not
authorize deleting or automatically rewriting user data. Empty unlinked weeks
and unreferenced legacy recipes remain unchanged. Reapplication is safe and tested.

## Reproduce locally

Use an isolated PGlite installation or the native runtime in the existing SQL
workflow. The database helper accepts no hosted connection URL.

```sh
PMW_NATIVE_POSTGRES_MODULE=/absolute/path/to/embedded-postgres/dist/index.js \
  node --test scripts/investigations/household-access-baseline.test.mjs

PMW_NATIVE_POSTGRES_MODULE=/absolute/path/to/embedded-postgres/dist/index.js \
  Q08_REPAIR=1 node --test scripts/investigations/household-access-baseline.test.mjs
```

The fixture reproduces the owner-supplied 30 September catalog's personal-week
policies and indexes, which differ from the older shared-week source migration.
Seven helper/RPC body fingerprints match the inspected deployment. It creates
only labelled synthetic accounts/data, uses real database roles and rolls back
individual probes. It does not claim to exercise real Supabase JWT sessions.

Native PostgreSQL 18.3 passed 64 baseline and 81 repair checks. PGlite passed 64
baseline and 80 repair checks before the native-only contention test was added.
Targeted ESLint, diff checks and the production build passed. Existing CI now runs
both Q08 modes alongside Q04 SQL regressions.

Coverage includes allowed owner/member operations; denied outsider, anonymous and
removed-member access; own-plan restrictions and retained personal-plan reading;
protected service invitations; invalid reference insert/update; forged derived
values; same-household carryover; current Shopping v2/v3 provenance; ordinary adds;
meal approval's existing table fallback; parent edits, deletion cascades and
provenance clearing; policy/timestamp preservation; reapplication and safe abort.
The native contention test observes a blocked parent update, commits a valid
batch creation, and confirms the parent cannot then orphan it.

## Rollout

Apply the reviewed SQL in the existing project and verify all six new constraints
are validated, the entry household is non-null and consistent with its week,
both entry triggers are enabled, and invitation/raw owner EXECUTE is false for
anon/authenticated and true for service_role. Retain the server-only sharing
guard if the relationship step refuses legacy/inconsistent data.

Recheck signed-in Shopping and Meals using labelled synthetic data. Reuse Q04
real-user authorization evidence, but distinguish it from isolated SQL role tests
and privileged catalog inspection. Exact deployed permissions require live
verification; publication of the migration file does not apply it to Supabase.

The existing grocery replacement RPC accepts text-array exclusions whereas the
inspected column is JSONB. The client already has a table-write fallback, covered
here. This repair does not silently change that separate legacy signature or
claim that RPC's complete happy path was exercised. Other exposed boolean
permission helpers have not received a blanket redesign or security certification.
