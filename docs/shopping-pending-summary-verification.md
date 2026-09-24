# Q04 pending counts and recovery display

Completed locally 24 September 2026 after the 23 September heartbeat. Continues `codex/shopping-legacy-recovery` from `c798fe8`; production remains `3bbdfbab` / PR #66. No publication, SQL application or feature activation.

## Change

Saved acceptance batches previously did not contribute to Shopping's pending count until their items reached the operation journal. A failed handoff could show no pending changes or a partial count while the recovery panel repeated already represented groceries.

`shoppingCreatePendingState` now counts unique pending operation IDs plus accepted batch IDs not represented in the selected list's journal. It uses all scoped journal records, including settled and locally cancelled ones, to prevent a retained receipt reviving completed work. The recovery display shows only missing items; full stored batches are unchanged and still undergo exact-identity validation. Batch identity collisions keep an explicit message naming the affected grocery even if its ID is excluded from the count. Batch, operation and refresh errors are scoped to the current list.

The same count feeds the list summary, quick-add status/action, sync center, phone-cache message and empty-list state. Additions, edits and cancellations are described as grocery changes. A simultaneous legacy queue remains visible in the list summary; its network/persistence protocol is unchanged. Quick-add Sync now works when only the durable queue has pending work.

## Verification

- `npm run ci`: **682 tests pass**, hooks/lint/build pass. Only the existing voice-hook dependency warning remains. Final `git diff --check` passed.
- Six new tests: interrupted handoff at first/middle/last grocery, including duplicate receipts, cancellation and settled stale receipts; project/error scoping; labelled identity conflict after the old operation becomes terminal; actual legacy hook phone-cache status with additional durable work and no queue mutation.
- Existing session-isolation hook tests updated to use the real summary helper.
- Independent review identified missing durable-only quick-add action wiring and insufficient conflict context/project scoping. All corrected; final review found no remaining blocker and independently passed 41 relevant tests.
- Logs: `/private/tmp/pmw-pending-summary-preflight.log` (final complete run); `/private/tmp/pmw-pending-summary-targeted.log` (earlier 34-test focused run before final additions). A preliminary `npm run check` was a nonexistent script; it was corrected to the repository's `npm run ci`, not counted as validation.

## Actual browser checks

Localhost52232 runs the actual View/Actions/AuthProvider/workspace/native IndexedDB with synthetic upstream adapters. New fixture controls stop handoff at a named grocery and toggle a synthetic connection indicator; the transport never contacts a server.

With eight pre-existing synthetic pending groceries, accepted milk/bread/rice raised the count to eleven even when handoff failed before the first item. Allowing milk through while blocking bread retained eleven and reduced the recovery panel to bread/rice; milk appeared once in the list. Reload recovered the remaining two without changing the total. Existing fixture records were preserved.

Phone inspection exposed the separate cache-status sentence still saying no waiting changes; it now reports eleven. After server restart/reload with final source, the phone quick-add Sync now button was enabled with an empty legacy queue. Clicking it produced exactly eleven isolated synthetic transport attempts, retained all pending records after injected failures and displayed recoverable errors. No browser errors occurred.

Switching to the empty Weekend list showed zero pending groceries and no errors from Home. Checked 390×844 and 1365×900 layouts: document width matched viewport, phone recovery controls wrapped/read correctly, desktop empty state retained the existing styling. Screenshots visually inspected. These are desktop Chromium viewport checks, not physical iPhone evidence.

Tab closed, viewport reset and fixture server stopped. Synthetic fixture data remains; do not delete user/browser storage to repeat tests.

## Remaining Q04 work

This fixes acceptance-to-journal counts and repeated recovery text. It does **not** solve server-row/pending-contribution presentation or certify mixed-version rollback. Keep those next within the same activation candidate. Never merge/hide shared rows by title or subtract quantities using historical receipts. Preserve authoritative server rows; pending intentions need distinct presentation, linked only by verified contribution row identity where available.

Migration-specific recoverable snapshot/local restore rehearsal, existing-project hosted SQL/authorization/flow checks and real iPhone Safari/Home Screen tests still precede activation. SQL unchanged; reuse prior SQL evidence. Q05 has not started.
