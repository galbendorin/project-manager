# Q04-C4 — durable Shopping integration

Verified locally 8 September 2026. Production activation remains disabled.

## Behavior

`VITE_SHOPPING_DURABLE_CREATES=true` routes new typed, voice and Add again entries through owner-scoped IndexedDB before dispatch. Pending additions remain separate contributions, including when the server merges them into a shared grocery. Rename, completion and cancellation use the persisted intent controller. An editor opened while pending retains contribution semantics if the acknowledgement arrives before Save.

The workspace resumes pending work on opening, online/focus and owner-specific cross-tab signals. Each automatic drain cycle attempts failing records only once, including across batches larger than 100. Errors preserve local work. Current rows are fetched separately from immutable transaction receipts. Legacy queues cannot persist or match durable projections. Existing journal entries recover even when new-create rollout is disabled.

REST dispatch captures and verifies the owner's access token immediately before fetch. Session replacement aborts and permanently closes the old runtime; retained UI, voice and workspace callbacks cannot use a replacement account/session/list. Partial entry failures return only failed inputs to the entry box with stable operation IDs for an unchanged in-session retry.

## Evidence

- Full preflight: 533 application tests, hook-import check, ESLint and production build pass. Authenticated smoke omitted because smoke credentials are unavailable.
- 14 actual Shopping action/workspace integration regressions: all five Q04 race cases; commit-before-send; partial storage failure; rollout-off recovery; legacy temporary-row guard; edit spanning acknowledgement; mixed legacy/durable cache isolation; >100 successful operations; >100 persistent failures stopping and explicitly retrying.
- Three UI/hook regressions exercise failed-entry restoration, retained account callbacks including A→B→A, voice partial failure and list/session replacement.
- Six direct transport tests cover captured-token identity, owner changes, aborts, late responses and project validation.
- Native PostgreSQL 18.3: 79 tests pass, including two new workspace→IndexedDB→real SQL scenarios that rename/cancel a captured pending contribution after its merged acknowledgement. Existing multi-session RLS/transaction/concurrency tests remain passing.
- Real ShoppingListView at 390×844 and 1440×1000 in the in-app browser, using a synthetic account/data/REST fixture: pending rename across acknowledgement retained typed text, rename preserved the original Milk quantity, phone cancellation displayed recovery controls and preserved shared Milk. No browser errors observed. Voice recognition itself is mocked in the browser fixture; hook callbacks are covered separately.
- Independent review identified legacy projection leakage, stale account callbacks, partial voice recovery, project switching and unbounded failure continuation. Fixes and regressions added; final bounded review found no remaining blocker.

Logs: `/private/tmp/pmw-q04-integration-preflight.log`, `/private/tmp/pmw-q04-durable-actions-tests.log`, `/private/tmp/pmw-q04-operation-native.log`.

## Release boundaries and next work

The new-create flag defaults OFF. SQL `2026-09-07_add_shopping_contribution_contract.sql` is still unapplied. Publishing this integration does not activate the completed Q04 flow. Do not enable the flag until isolated staging migration, real owner/member/revoked access, mixed old/new clients and phone lifecycle checks pass. Production auth/household smoke and physical iPhone Safari/Home Screen testing remain unverified.

Q05 stale list-response ordering remains a separate task. Journal retention/pruning is not enabled; unresolved entries must never be deleted. Failed-entry operation IDs survive an unchanged retry within the mounted screen; the entry text survives reload, but those failure IDs are not yet a durable draft contract. Verify ambiguous IndexedDB timeout/reload behavior before activation. No browser persistence strategy guarantees survival if the user or OS removes website data.

Next bounded workload: finish hosted PR checks/release if pending, then Q04-D staging and activation readiness. Confirm schema access and staging environment without exposing secret credentials; preserve default-off production until that evidence exists.
