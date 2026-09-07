# Q04-B database contract: local verification

7 September 2026. **Draft, not deployed.** No app client is using these RPCs. Base production remains Q03, PR #52 (`923e251`).

## Implemented draft

`scripts/sql/2026-09-07_add_shopping_contribution_contract.sql` is an atomic migration following the July 15 v2 migration. It adds:

- A server-stamped `manual_todos.shopping_revision`. Every insert/update, including existing direct writes and v2 calls, receives a new sequence value. Caller-supplied values are ignored; delete/reinsert cannot reuse evidence. Existing rows begin at zero until written. This affects all manual ToDos and needs staging performance/compatibility checks.
- Private contribution/intent ledgers, with RLS enabled and no browser table access. The private helper mutates exactly the row whose before-image it locked, or inserts its own row. It does not ask v2 to select a second target.
- `apply_shopping_list_add_v3`: binds the original operation ID to immutable input and authenticated owner/project. Returns insert/merge evidence, before/after images, decimal-string revision, confirmed intent revision and current row existence. Missing or moved rows never become current data through historical snapshots.
- `reconcile_shopping_contribution_v1`: undoes only an unchanged contribution; restores exact merged quantity/unit/source/meta, or deletes its exclusive inserted row. A move undoes and re-adds atomically. Completion cannot mark an existing shared item done. A post-selection check also rolls back the move if a late destination would merge during completion.
- Intent IDs and revisions are immutable. Replays return stored outcomes; newer received revisions supersede older ones even when unresolved. `needs_review` does not advance the confirmed revision. A subsequent cancellation uses evidence for the latest successful move.
- v2 replay hardening in the same migration: current project access and requested/receipt project equality are checked before disclosure; current row reads stay in the receipt project. v2-originated operations retain their authorized merge/replay behavior, including the historical missing-row response. v3-originated IDs cannot be applied through v2. Client capability downgrade must preserve pending work instead of falling back.

Results include `affected_items` and `removed_row_ids` for successful reconciliation. These are transaction images, not permission to overwrite later local edits. Replayed results are historical. Q04-C must interpret them through the matching operation/desired revision, preserve newer intent and avoid resurrecting rows from old responses.

## Executed evidence

**49/49 PostgreSQL tests pass** in `scripts/investigations/shopping-contribution-sql.test.mjs`, using PostgreSQL 18.3 / PGlite 0.5.8 in an isolated in-memory database. No product dependency or account data was added. The fixture loads checked-in manual-ToDo/shared-access migrations and exact shopping column/normalization definitions. It supplies minimal auth/users/projects/batches infrastructure, a test JWT-sub function and representative grants; it is not a copy of the deployed Supabase schema.

Tests execute actual SQL, PL/pgSQL, transactions, grants and RLS. They cover owner/member/outsider/removed-member access; both replay versions; direct receipt/helper/sequence denial; immutable IDs; insert and merge undo across missing/equal/conflicting units, zero/null/rounded quantities and metadata; move then cancel; older requests and unresolved newer intent; deleted/moved/reinserted rows; direct and v2 updates; replacement failure rollback; completion conflict rollback; and repeat migration application. One trigger-injection test exercises the late-destination rollback branch; it is not a native concurrency test.

Full ordinary app preflight also passes: **432 tests, lint, hook-import checks and production build**. Authenticated browser smoke was skipped because household credentials are unavailable. No UI source changed; no new phone-browser verification is claimed. The separate client race investigation still has its expected Q04/Q05 failures because client integration has not started.

An independent review found two real draft issues: replay could bypass current access through v2, and a second merge-target lookup could corrupt contribution ownership. The draft now hardens v2 replay and performs capture/mutation against one target. The review also prompted explicit highest-received revision handling. A final bounded read-only pass confirmed those fixes and found no further blocker within its scope; concurrency and staging remain open gates.

## Reproduce locally

Install the test runtime outside the application:

```sh
npm install --prefix /private/tmp/pmw-q04-postgres --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE=/private/tmp/pmw-q04-postgres/node_modules/@electric-sql/pglite/dist/index.js \
  node --test scripts/investigations/shopping-contribution-sql.test.mjs
npm run release:preflight -- --skip-smoke
```

The standalone SQL suite is intentionally separate from ordinary `npm test` until the native database/CI harness is chosen. Evidence logs: `/private/tmp/pmw-q04-sql-tests.log` and `/private/tmp/pmw-q04-sql-preflight.log`. Do not silently skip this suite when revising SQL.

## Remaining release gates and next task

1. **Native multi-session PostgreSQL:** PGlite permits one exclusive connection, so these tests cannot certify concurrent lock ordering or visibility. Establish a disposable native database or isolated CI PostgreSQL service. Add controlled concurrent add/reconcile retries, opposite-title moves, v2/v3 overlap, direct insert/rename between target selection and write, and membership revocation around transaction boundaries. Assert ownership evidence, no lost quantities, bounded completion and rollback/retry behavior. Do not use a production database for fixture setup: it creates/truncates synthetic tables.
2. Review the final concurrency-tested SQL, including trigger cost, migration locking, deployed RLS/grants/schema drift and rollback compatibility. Keep the conservative conflict behavior; do not remove checks to make races pass.
3. Q04-C: implement the durable Shopping-only submitted envelope and latest desired revision/tombstone, then run the existing actual-hook regressions and new RPC capability/recovery cases. Legacy receipts need an explicit recoverable path, not guessed ownership.
4. Q04-D: staged migration, real owner/member/revoked-member checks, authenticated household flow, iPhone Safari/Home Screen verification, rollout and live checks. The user has authorized publishing after successful verification; no further blanket confirmation is required. These technical gates remain unfinished.

Next useful workload: finish gate 1 and resolve any failures. Do not start unrelated design work, regenerate the agency plan, or claim Q04 is fixed for users yet.
