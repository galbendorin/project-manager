# Q04-C1/C2 Shopping client boundaries

7 September 2026. This release adds independently verified storage and RPC helpers. The Shopping screen does not import them yet. It does not activate the Q04 SQL migration or fix the five pending-create investigation failures by itself.

## Implemented

`shoppingCreateJournal.js` uses a separate, owner-scoped IndexedDB store for operation/project/local identity, immutable original submission and editable desired state. Writes resolve only after transaction completion. Compare-and-set versions prevent competing callbacks or tabs from silently overwriting each other. Quota, denied storage, abort, blocked open and timeouts fail explicitly before sending. Closing permanently fences an instance; owner changes are checked at requests, transaction completion and callback entry. Browser eviction remains possible; this is not a backup.

`shoppingContributionRpc.js` calls only add v3 and reconcile v1. It validates acknowledgement identities, contribution evidence, current-row consistency, revision strings and affected-item scope. It preserves `needs_review` and `superseded`, and exposes historical replay information. It never falls back to v2 or direct writes. The caller must durably record an exact request before calling these adapters and bind authentication at actual dispatch, including after transport awaits.

The only added package is test-only `fake-indexeddb@6.2.5`.

## Verification

- 48 focused tests pass: 20 journal fault/recovery/concurrency tests and 28 RPC validation cases.
- Full preflight passes 480 tests, lint, React hook checks and production build.
- Native PostgreSQL 18.3 passes 71 cases without failures or skips, including the existing 20 multi-session cases. Two additional tests run the real client validators against actual SQL add/merge/move/cancel/replay/conflict/superseded responses. CI now watches adapter changes too.
- A synthetic fixture in the Codex browser passed six native IndexedDB checks: commit before send, competing connections, request success followed by abort, immutable submission after edit/cancel, lost-response reopen/retry, and owner/session fencing. A full page reload recovered both the original submission and later cancellation.
- Independent pre-push review found no blocker in the unintegrated journal or adapters. Its transaction-completion owner-switch test and requested real-SQL response cases were added.

Local logs: `/private/tmp/pmw-q04-client-boundary-tests.log`, `/private/tmp/pmw-q04-client-release-preflight.log`, `/private/tmp/pmw-q04-client-native-tests.log`.

Authenticated smoke credentials are unavailable. These checks do not establish physical iPhone Safari behavior, live Supabase schema compatibility or a complete user-facing Shopping repair.

## Next bounded task

Implement and test the pending-create state machine before wiring the UI: persist every immutable intent/revision before sending, retain newer desired edits while older acknowledgements arrive, keep cancellation tombstones, store confirmed contribution evidence, and settle only matching work. The journal's desired document is currently generic; it is not that complete state machine or an intent ledger.

Then route both online adds and offline queue actions through it, project current desired state into the list, fence authentication at dispatch, and give legacy ambiguous operations a recoverable path. Preserve Q03 controls and make all five Q04 actual-hook reproductions pass. Stage the SQL against actual schema/policies before activation, then verify account journeys and iPhone Safari. Q05's three delayed-refresh cases remain separate.
