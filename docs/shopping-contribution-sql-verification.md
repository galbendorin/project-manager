# Q04-B database contract: local verification

7 September 2026. **SQL source merged in PR #53; migration not applied.** Production source includes `15e1fb6`. No app client is using these RPCs. The native multi-session gate is complete; client integration and staging remain unfinished. Subsequent client adapter integration coverage brings the native suite to 71 cases; see [client boundary verification](shopping-client-boundary-verification.md).

## Implemented draft

`scripts/sql/2026-09-07_add_shopping_contribution_contract.sql` is an atomic migration following the July 15 v2 migration. It adds:

- A server-stamped `manual_todos.shopping_revision`. Every insert/update, including existing direct writes and v2 calls, receives a new sequence value. Caller-supplied values are ignored; delete/reinsert cannot reuse evidence. Existing rows begin at zero until written. This affects all manual ToDos and needs staging performance/compatibility checks.
- Private contribution/intent ledgers, with RLS enabled and no browser table access. The private helper mutates exactly the row whose before-image it locked, or inserts its own row. It does not ask v2 to select a second target.
- All three RPCs lock the caller's auth row, project authority and (for collaborators) membership before operation/receipt/title/item locks. Revocation, ownership transfer and deletion either win admission first, or wait for an already-authorized transaction. This prevents writes completing after a revocation has committed, and avoids reversing tested cascade lock order.
- `apply_shopping_list_add_v3`: binds the original operation ID to immutable input and authenticated owner/project. Returns insert/merge evidence, before/after images, decimal-string revision, confirmed intent revision and current row existence. Missing or moved rows never become current data through historical snapshots.
- `reconcile_shopping_contribution_v1`: undoes only an unchanged contribution; restores exact merged quantity/unit/source/meta, or deletes its exclusive inserted row. A move undoes and re-adds atomically. Completion cannot mark an existing shared item done. A post-selection check also rolls back the move if a late destination would merge during completion.
- Intent IDs and revisions are immutable. Replays return stored outcomes; newer received revisions supersede older ones even when unresolved. `needs_review` does not advance the confirmed revision. A subsequent cancellation uses evidence for the latest successful move.
- v2 replay hardening in the same migration: current project access and requested/receipt project equality are checked before disclosure; current row reads stay in the receipt project. v2-originated operations retain their authorized merge/replay behavior, including the historical missing-row response. v3-originated IDs cannot be applied through v2. Client capability downgrade must preserve pending work instead of falling back.

Results include `affected_items` and `removed_row_ids` for successful reconciliation. These are transaction images, not permission to overwrite later local edits. Replayed results are historical. Q04-C must interpret them through the matching operation/desired revision, preserve newer intent and avoid resurrecting rows from old responses.

## Executed evidence

**69/69 native PostgreSQL tests pass** in `scripts/investigations/shopping-contribution-sql.test.mjs`, using PostgreSQL 18.3 through embedded-postgres 18.3.0-beta.17. The same suite passes 49 sequential cases in PGlite 0.5.8 and explicitly skips its 20 native-only cases. No product dependency or account data was added. The fixture loads checked-in manual-ToDo/shared-access migrations and exact shopping column/normalization definitions. It supplies minimal auth/users/projects/batches infrastructure, a test JWT-sub function and representative grants; it is not a copy of the deployed Supabase schema.

Tests execute actual SQL, PL/pgSQL, transactions, grants and RLS. They cover owner/member/outsider/removed-member access; both replay versions; direct receipt/helper/sequence denial; immutable IDs; insert and merge undo across missing/equal/conflicting units, zero/null/rounded quantities and metadata; move then cancel; older requests and unresolved newer intent; deleted/moved/reinserted rows; direct and v2 updates; replacement failure rollback; completion conflict rollback; and repeat migration application. One trigger-injection test exercises the late-destination rollback branch; it is not a native concurrency test.

Full ordinary app preflight also passes: **432 tests, lint, hook-import checks and production build**. Authenticated browser smoke was skipped because household credentials are unavailable. No UI source changed; no new phone-browser verification is claimed. The separate client race investigation still has its expected Q04/Q05 failures because client integration has not started.

An independent review found two real draft issues: replay could bypass current access through v2, and a second merge-target lookup could corrupt contribution ownership. The draft now hardens v2 replay and performs capture/mutation against one target. The review also prompted explicit highest-received revision handling. That bounded read-only pass confirmed those fixes before the native testing below.

The first native run passed 58/59 cases and exposed a further authorization race: an add checked access, waited for a title lock, then wrote after membership removal committed. The authority-lock helper fixes this by ordering authorization against removal. The test now proves both legitimate orders instead of assuming revocation always wins. Further native tests cover duplicate add/intent retries, v2/v3 overlap, opposite-title moves, direct insert/rename during capture, later direct updates, both project-deletion orders, ownership transfer, caller deletion and forced backend termination between undo and replacement. The interrupted transaction rolls back and accepts the same intent on retry. Explicit lock barriers and observed PostgreSQL wait states establish overlap; timing delays only poll bounded deadlines.

Independent review of the final helper, ordering and runner found no additional blocker for the local Q04-B gate. Tests do not prove all possible interleavings or deployed triggers/policies. Staging must confirm the live schema does not add child-to-parent update triggers that invalidate this lock order. No physical iPhone or deployed database result is claimed.

## Reproduce locally

Install the test runtime outside the application:

```sh
npm install --prefix /private/tmp/pmw-q04-postgres --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE=/private/tmp/pmw-q04-postgres/node_modules/@electric-sql/pglite/dist/index.js \
  node --test scripts/investigations/shopping-contribution-sql.test.mjs
npm run release:preflight -- --skip-smoke
```

For the full multi-session suite:

```sh
npm install --prefix /private/tmp/pmw-q04-postgres --no-audit --no-fund embedded-postgres@18.3.0-beta.17
PMW_NATIVE_POSTGRES_MODULE=/private/tmp/pmw-q04-postgres/node_modules/embedded-postgres/dist/index.js \
  node --test scripts/investigations/shopping-contribution-sql.test.mjs
```

The native runner always creates a fresh local cluster on a loopback-only dynamic port, with generated credentials and an eight-second statement timeout. It accepts no external database URL, creates no OS account/service, and stops the server/removes its database directory at completion; a log remains in its generated temp directory. If the sandbox blocks PostgreSQL shared memory, request normal execution escalation rather than changing protections. GitHub workflow `shopping-sql.yml` runs the full suite on Node 20 when SQL, the harness or its workflow changes. Native evidence: `/private/tmp/pmw-q04-native-tests.log`; PGlite: `/private/tmp/pmw-q04-pglite-tests.log`; full app preflight: `/private/tmp/pmw-q04-native-preflight.log`. Do not silently substitute the sequential run for native validation.

## Remaining release gates and next task

1. **Native multi-session PostgreSQL: complete locally and in CI.** All 69 cases pass, including 20 concurrency cases. Linux/Node 20 [CI run 34123979736](https://github.com/galbendorin/project-manager/actions/runs/34123979736) confirms 69 passes, zero failures and zero skips at source head `8e3ffb7`. The PR-triggered SQL run and both app checks/previews also pass. Keep the fixture isolated; it creates/truncates synthetic tables.
2. Review the final concurrency-tested SQL, including trigger cost, migration locking, deployed RLS/grants/schema drift and rollback compatibility. Keep the conservative conflict behavior; do not remove checks to make races pass.
3. Q04-C: implement the durable Shopping-only submitted envelope and latest desired revision/tombstone, then run the existing actual-hook regressions and new RPC capability/recovery cases. Legacy receipts need an explicit recoverable path, not guessed ownership.
4. Q04-D: staged migration, real owner/member/revoked-member checks, authenticated household flow, iPhone Safari/Home Screen verification, rollout and live checks. The user has authorized publishing after successful verification; no further blanket confirmation is required. These technical gates remain unfinished.

Next useful workload: implement Q04-C's durable client envelope and capability handling, starting with `shopping-client-integration-handoff.md`. Draft PR: https://github.com/galbendorin/project-manager/pull/53. Do not start unrelated design work, regenerate the agency plan, or claim Q04 is fixed for users yet. SQL remains a staged release dependency.
