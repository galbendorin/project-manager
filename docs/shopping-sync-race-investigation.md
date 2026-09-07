# Q02 — Shopping sync race investigation

Q02 completed 6 September 2026 against production source `656d1a26486f101db8a5ae310fdda3c3664d5f57` (PR #51). The investigation itself made no production change. Q03 subsequently implements current-state acknowledgement in this branch; the historical findings below describe the Q02 baseline.

## Q03 implementation update — 7 September 2026

Each completed operation now commits against current storage. An update is removed only if the current patch still matches its submitted fields and values. Newer queued work stays present and is processed by the running drain. Failure refreshes overlay the latest queue. Notification delivery runs after releasing the sync lock, so slow delivery cannot block a subsequent sync trigger.

The maintained CI entry `src/hooks/shoppingSyncConcurrency.test.js` runs ten controls/Q03 cases, including successive acknowledgements, a newer delete, a mixed create/update queue, and slow notification delivery. Q01's five matching-ID/empty/error/retry tests remain green. Full preflight passes 431 tests, lint, hook-import check and build. A reviewer found no new release blockers; real-device and authenticated household coverage remain separate.

The standalone investigation command now has fifteen cases: ten pass and five Q04/Q05 assertions intentionally remain red. It is still outside normal CI. Existing temporary-item create/merge semantics remain for Q04; this patch does not claim to fix those or external loader/hydration races.

## Decision

Proceed with Q03: preserve newer existing-item edits when an older queued update completes or fails. Keep temporary-create handling (Q04) and delayed loaders (Q05) separate. A successful server acknowledgement is necessary (Q01) but does not authorize replacing all current local state with the snapshot from before the request.

The controlled suite reproduces eight distinct failure scenarios. Three controls pass. This establishes an actionable source-level defect; it does not measure its frequency on the owner's iPhone.

## Reproduce

From this worktree, with Node available:

```sh
node --test scripts/investigations/shopping-sync-races.mjs
node --test --test-name-pattern='control:' scripts/investigations/shopping-sync-races.mjs
```

On the original Q02 baseline, the first command exited 1: 11 tests, 3 passing controls, 8 failing desired-behaviour assertions. See the Q03 update above for current counts. Known-failure reproductions live outside `src/**/*.test.js`; the new CI entry selects only repaired Q03 cases and controls. The second command runs only controls. Later repairs should promote the corresponding Q04/Q05 assertions into maintained regression coverage.

The harness executes the actual sync, data and action hooks plus the real queue, view-state, mapping and RPC helpers. It replaces React scheduling, network responses and storage with controlled in-memory dependencies. A deferred promise holds a specific request; the real edit/delete callback runs; the response is released. No timing sleeps, database, browser session or Supabase credentials are needed. State slots persist across explicit rerenders. Refresh cases assert that the new edit is visible in the data hook before the delayed response arrives, to exclude a disconnected-test-state false positive.

Existing-item edits use the offline action branch while the earlier sync request remains pending: for example, signal is lost after an upload starts. Temporary items take that branch even while online. Effects, actual browser storage, multiple tabs, operating-system suspension and deployed RPC/policy behaviour are not simulated. The ordinary online direct-write path is not covered by these races.

## Observed failures

| Next task | Controlled ordering | Observed baseline result |
| --- | --- | --- |
| Q03 | Upload edit A; enqueue an edit to B; acknowledge A | B's pending edit disappears; B reverts in cache and visible state; queue becomes empty and sync time advances |
| Q03 | Upload first edit to A; rename A again; acknowledge first edit | Newest title disappears; server/cache/visible state retain the first edit; queue becomes empty |
| Q03 | Upload first edit to A; rename A again; return a network failure | Queue retains the old patch, replacing the newer one; failure refresh also shows the older title |
| Q04 | Send create; edit its temporary item; return saved ID | Saved ID replaces the temporary item, but its later title change disappears |
| Q04 | Send create; delete its temporary item; return saved ID | Deleted item reappears under the server ID with no pending delete |
| Q05 | Begin item refresh; queue a rename; finish refresh | Rename disappears from queue/cache and visible list; refresh advances sync time |
| Q05 | Begin project refresh; queue a rename; finish refresh | Queue/cache lose the rename; the optimistic title can remain visible temporarily, masking lost durability |
| Q05 | Begin item refresh; queue a rename; return a network failure | Latest queued patch remains durable, but visible state reverts to the older cached title |

Controls: uncontested update saves and drains; uncontested create maps its temporary ID and drains; uncontested item refresh displays server data. Diagnostic output records queue, cached/visible/server titles, sync time and request ordering using synthetic groceries.

## Where ownership breaks

- `src/hooks/useShoppingListOfflineSync.js:39` captures queue/cache before any network await. Acknowledgements remove from that local queue; the final persistence at line 209 replaces current state with it. Its busy ref prevents overlapping runs of that hook instance, but does not prevent user actions or loaders from writing.
- `src/hooks/useShoppingListActions.js:189` reads current cache and queues edits; title edits at line 656 and temporary deletions at line 558 can legitimately run while sync waits.
- `src/utils/offlineQueue.js:12` compacts newer updates into an existing create or update. Therefore target ID, queue length and operation position do not identify the exact submitted intent. Temporary deletion removes its create entirely at line 68.
- `src/components/ShoppingListView.jsx:187` persists replacement state without reconciling it. Its effect at line 288 can persist visible rows back to cache, so a stale visible-state write may have consequences beyond the screen. This effect's full scheduling was not tested here.
- `src/hooks/useShoppingListData.js:157` and line 282 capture cache before requests; project persistence at line 239 and item persistence at line 350 later reuse it. The network-error branch uses older `cachedVisibleTodos` too.
- `src/utils/shoppingListViewState.js:860` also performs asynchronous durable-cache hydration. Its potential overlap is a source-level follow-up for Q05, not one of the eight executed reproductions. Timestamp preference alone is not a safe ordering contract for local edits.

## Smallest repair design

### Q03 — existing-item acknowledgements

1. Introduce one Shopping-specific synchronous state-update boundary: read the latest user-owned state, apply a mutation to it, persist it and publish the resulting visible state. No await inside that mutation. A read before the network request is never the completion write base. This guarantees ordering within one running JS context; cross-tab atomicity requires separate evidence/design.
2. Keep an immutable submitted-operation snapshot. On matching server acknowledgement, remove only the current operation whose kind, target and complete normalized patch still equal that submitted snapshot. If the current patch changed, retain it for a subsequent idempotent update. Never remove all work with the same target, or assume an unchanged queue length means no edit happened.
3. For this bounded repair, normalized patch comparison can avoid redesigning every consumer's queue format. A later versioned outbox can use stable local operation IDs/revisions. `offlineQueue.js` is shared with Timesheets and project tasks: keep Shopping-specific reconciliation local and preserve their contract.
4. Derive visible rows from the latest cache and remaining intent. Do not overwrite newer optimistic fields with the acknowledged older patch. Failure refreshes must also preserve current queued intent; otherwise the third Q03 reproduction still fails.
5. Advance the successful-sync marker only when the current queue is actually drained. Failed/ambiguous requests keep the latest operation. Preserve Q01's matching-ID requirement and error/retry behaviour. Keep current authenticated client and policies.
6. Ensure retained newer work gets another sync opportunity after the active run finishes. The current sync callback does not depend on queue contents, so preserving a new patch alone does not guarantee an immediate rerun. Use a controlled drain or explicit follow-up scheduling; verify this without an endless retry loop on failed operations.

Acceptance: all three Q03 race assertions, the ordinary controls and Q01's five acknowledgement regressions pass. Add focused cases for a newer delete superseding an update and edits arriving across two successive acknowledgements when implementing. Review mixed create/update queues explicitly; Q04/Q05 may still fail until their own repair, so do not describe Q03 as solving all sync loss. Run required CI/build and release checks once the actual repair is complete.

### Q04 — new-item edits and cancellation

Preserve the submitted create separately from later intent, including a cancellation marker. Do not compact new input into the immutable payload whose operation ID may already have a server receipt. After acknowledgement, reconcile against current state, map later edits to the saved ID and preserve them for a separate update. Keep cancellation intent until its outcome is resolved. Lost responses/reload require durable records, not only an in-memory flag.

**Constraint requiring a separate implementation decision:** `scripts/sql/2026-07-15_add_shopping_list_idempotent_add.sql:15` shows that `apply_shopping_list_add_v2` may add quantity to an existing matching open grocery and return that row. Retrying an operation ID returns its receipt outcome. Consequently:

- Changing the create payload and replaying the same operation ID does not apply the later edit.
- A returned ID does not establish that this operation created a new row.
- Automatically deleting or renaming that row as compensation could affect an existing shared grocery. The executed create tests intentionally use the newly-created-row case; merge and receipt-replay cases must be added before Q04 is considered safe.

Define whether cancellation means undoing this contribution or deleting the shared item. Prefer preserving the contribution boundary. If safe undo needs richer receipt metadata and a transactional server operation, split Q04 into a contract/migration task and a client task. Do not invent an unsafe client-only reversal to fit the allowance. Retain auth/access checks, operation idempotency and household gates.

### Q05 — refreshes and hydration

Project loads should update project metadata against current state without writing an old queue or old item map. Item loads should merge server rows with the current queue at completion. Use per-user/project request generations and a local mutation revision to discard obsolete responses; a latest-started response can still predate a completed local write. Network failure should retain the current optimistic/cached list, not the pre-request fallback. Invalidate old user/project callbacks on context changes. Check hydration and the view's cache-persistence effect under the same ownership contract.

Acceptance: the three Q05 reproductions pass; add overlapping-refresh and delayed-hydration cases, plus a completed local write arriving before an older read response. Do not use the time of a read as proof that every queued write was saved.

## Validation and handoff

The final reproduction run has 3 controls passing and 8 expected failures, all at the intended value assertions, with no timeout or dependency error. The changed harness passes repository lint. Full ordinary preflight passes: 421 tests, hook-import check, lint and build; authenticated smoke skipped because credentials are unavailable. No application source file changed, so no UI/deployment verification is claimed or needed for this investigation artifact.

Next run: Q03 only, starting from this evidence. Preserve this baseline harness and convert the relevant assertions into regression tests as the repair is made. Do not repeat the agency inventory, browse market material, implement Q04/Q05 or publish this diagnostic branch as an app change. No security audit or physical iPhone pass is claimed.
