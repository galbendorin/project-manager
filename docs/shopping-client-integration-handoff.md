# Q04-C: next bounded implementation

7 September 2026. Q04-B native SQL and CI are verified in draft PR #53. The Shopping client still uses v2 and still has the five Q04 failures in the actual-hook investigation. This is a source-grounded implementation handoff, not completed client code.

## Start with durable submission evidence

`offlineState.writeLocalJson` returns only the synchronous localStorage result and launches IndexedDB writing without awaiting it. `saveShoppingOfflineState` discards that result and returns the state object. `ShoppingListView`'s persistence callback and sync's `commitCurrentState` therefore cannot prove a submitted envelope survives reopening. Do not label a record durably submitted and send the RPC just because these existing functions returned.

The first manageable client slice should provide a Shopping-specific durable journal/persistence acknowledgement and its recovery tests. Confirm at least one durable store committed before sending; make failure/timeout explicit and keep the user's draft recoverable. Account for localStorage denial/quota errors, delayed/failed IndexedDB transactions, interrupted writes, and stale hydration. Prefer a separate versioned journal for creation operations so old whole-list cache writes cannot erase submitted evidence. Define how mutations are serialized across overlapping callbacks/tabs, and how sign-out/user change fences a pending save. Avoid a broad rewrite of shared storage or the Timesheets/project-task queue.

Only wire transmission once this boundary is demonstrably reliable. The existing cache API can continue serving display snapshots; display success is not proof of journal durability.

## Integration points already inspected

- `useShoppingListActions.queueShoppingPlan` creates temporary rows/operation IDs and calls shared `enqueueCreate`. `queueTodoPatch` uses `enqueueUpdate`, which merges edits directly into the create record. `deleteTodo` uses `enqueueDelete`, which removes temporary creates entirely. Route these pending-create actions through a Shopping-only immutable submitted payload plus desired revision/tombstone.
- `useShoppingListActions.addItems` has a separate **online** `Promise.all` RPC path. It creates a queue record only after a transport failure. New online additions also need durable evidence before their first request; fixing only the offline sync hook leaves a crash/lost-response gap.
- `useShoppingListOfflineSync` refreshes, may infer an uncertain create from a row match, then calls v2. Its current acknowledgement removes matching creates by kind/target and remaps the temporary ID. v3 must use receipt ownership and matching desired revision, preserve newer edits, and never infer exclusive ownership from a returned shared row.
- `shoppingListRpc` currently permits automatic legacy fallback and recognizes missing RPCs broadly from message text. A submitted v3 operation must never fall back to v2/upsert. Use explicit new RPC handling, narrowly distinguish unavailable capability from auth/validation/conflict/transport errors, and preserve the journal on all unconfirmed outcomes.
- `applyShoppingQueueToTodos` reconstructs visible creates from `record.title` and ignores cancellation evidence. Render the latest desired draft while keeping a cancellation hidden. Do not overwrite the pre-existing shared row while the contribution is unresolved.
- `useShoppingListData` has asynchronous hydration/refresh paths, and `ShoppingListView` writes display state back to cache. The dedicated journal must survive these existing writers. Q05's broader stale-refresh repair remains a separate roadmap item, but Q04 cannot let these paths erase its submission/intent evidence.

## State and server response rules

Persist owner/project/local ID/original operation ID; immutable submitted title/quantity/unit/source/meta; latest desired revision and intent ID; cancellation; and the server's latest confirmed evidence. Persist a revision's exact intent before sending it, and reuse its ID/payload after response uncertainty. Later edits create newer desired revisions, never mutate an already-submitted intent.

The SQL returns revision values as decimal strings. Avoid lossy numeric conversion of server counters. `applied`/`superseded`/`needs_review` with `replayed` are distinct outcomes; unresolved newer intent also supersedes older requests without becoming confirmed. Add replay may report no current row or the latest successful moved contribution. Reconciliation images are historical on replay. An old result must not replace newer local intent or revive a cancelled/missing item.

If a user edits again while an intent is being reconciled, first preserve the new desired revision, then reconcile it after the earlier result. Surface recoverable conflict/permission states instead of automatically retrying forever. Complete/notify only the matching confirmed work; retain Q03's current-state commits and release of the busy flag before notification delivery.

## Legacy migration needs explicit treatment

An old create with `uncertainCommit: false` is **not proof it was never sent**: the offline sync path can lose its response after a server commit. Do not upgrade every legacy record as an unsent v3 add or fabricate a before-image from its current row. The SQL deliberately refuses cross-version duplicate application. Existing v2 receipts lack the evidence needed to undo a contribution safely.

Decide and test the recoverable legacy path before enabling v3 for existing queues. A matching title alone is inadequate. New journal records and old queue entries need an explicit version boundary; an older client must not silently consume a newer submitted envelope. SQL rollout precedes client activation, and an unavailable new RPC must preserve v3 work without downgrade.

## Completion evidence

1. Storage tests prove no network request precedes durable evidence; denied storage, timeout, reopen, competing writes and owner switch retain or explicitly block intent without duplication.
2. Extend the actual-hook harness to run v3 responses: the five existing Q04 expected failures become passes for temporary edit/cancel, merged edit/cancel and changed intent after a lost committed response. Preserve Q01/Q03 controls and keep Q05 failures labelled separately.
3. Exercise online first submission, partial multi-add success, same-intent retry, a newer edit during acknowledgement/reconciliation, row disappearance, needs_review, revoked access and unavailable RPC. Test legacy migration/downgrade explicitly.
4. Verify actual React components at phone and desktop widths, including a hidden pending cancellation and an understandable conflict/retry state. Run app preflight and the native SQL workflow before staging. Real household/deployed-schema and physical iPhone checks remain Q04-D gates.

Next action: implement the durable Shopping journal boundary with focused failure/recovery tests, then integrate create actions and sync in a separate reviewable slice. Keep PR #53 draft until client/staging requirements are met; the owner has already authorized publishing after successful verification.
