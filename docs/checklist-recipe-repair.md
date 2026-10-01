# Checklist recovery and atomic recipe edits

The 1 October code inspection reproduced lost checklist input, unrecoverable
temporary checklist loading errors, unchecked zero-row write results, and partial
recipe saves. This repair keeps failed/newer drafts, provides loading retry,
requires checklist row acknowledgement, and saves recipe metadata and ingredients
in one transaction.

## Database rollout

Run `scripts/sql/2026-10-01_atomic_recipe_update.sql` in the existing Supabase
project **before deploying this client**. It adds only
`update_meal_recipe_atomic(uuid,jsonb,jsonb)`, with invoker security and an empty
search path. Existing table policies, household links and data remain unchanged.
Authenticated owner/member access is enforced by existing RLS; anonymous
execution is denied. Payloads cannot change recipe identity, owner or household.

If the function is absent, recipe editing fails with a useful database-update
message and makes no direct writes. There is deliberately no fallback to the
old delete-then-insert edit path. Creation/import flows are outside this bounded
repair. Existing recipe refresh failures after a confirmed commit can still need
a reload; a lost network response cannot independently certify whether a server
transaction committed.

Optional read-only installation check:

```sql
select p.proname, p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'execute') as anon_execute,
       has_function_privilege('authenticated',p.oid,'execute') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='update_meal_recipe_atomic';
```

Expected: one row, `security_definer=false`, `anon_execute=false`,
`authenticated_execute=true`. This is metadata evidence, not a real-user
authorization test.

## Behavior

Checklist checking, editing, deleting and moving now change confirmed state
after the intended row is returned. Pending changes show a saving status.
Same-row writes are serialized; failures keep previously confirmed state and
show a retryable message. Old loads and old account completions cannot replace
newer confirmed state. Retained checklist data after transport failure is cached
evidence; remote access revocation still requires reconnecting successfully.

The composer clears only acknowledged, unchanged input. Failed additions and
multiline paste remain editable; newer input/title edits survive delayed saves.
An in-flight addition prevents another submission without blocking text editing.
Desktop and mobile task details both expose the loading retry callback. Their
existing scrolling layout and completed/read-only restrictions are preserved.

## Automated verification

```sh
npm run ci
node --experimental-vm-modules --test scripts/regressions/checklist-recipe.test.mjs
PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test scripts/investigations/atomic-recipe-update.test.mjs
```

The React tests exercise actual components/hooks with synthetic Supabase
transport, including delayed results, failed/empty acknowledgements, account
change and desktop/mobile component wiring. They do not assert CSS class strings.
The isolated SQL tests use actual meal migrations and shared meal RLS, test
owner/member success and outsider/removed/anonymous denial, preserve previous
rows on a replacement failure, and verify grants/policies. They accept no hosted
connection URL. CI runs both suites and existing Shopping release smoke.

Phone component tests are not physical Safari or visual geometry checks. The
owner requested code tests and retains hands-on app testing.
