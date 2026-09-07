# Q04 — pending grocery edits and cancellations

Contract proposal and client evidence, 7 September 2026, based on production `923e251` (Q03 / PR #52). Q04-B now has an executable local SQL draft; the client remains unchanged and Q04 is not ready to deploy. See `shopping-contribution-sql-verification.md` for the exact APIs, test evidence and remaining gates.

## User outcome

A grocery added offline can still be renamed or cancelled while its first save is pending. The most recent intent stays recoverable until the server confirms it. Reconnection, a lost response or reopening the app must not silently discard that intent, double quantities or resurrect a cancelled item.

**Proposed default:** before the temporary add is fully reconciled, cancellation means undo this addition, and a title change means move this addition to the newly named grocery. Preserve pre-existing shared items and other people's later changes. This is an engineering/product assumption based on the owner's reliability priority, not a separately confirmed preference. Normal editing/deleting of an already settled shared item keeps its existing meaning.

## What the current contract cannot tell the client

The checked-in `apply_shopping_list_add_v2` can either insert a row or merge quantities into an existing matching open row, then return a `manual_todos` row. A receipt contains the resulting snapshot but no before snapshot or explicit insert-versus-merge outcome. Repeating its operation ID returns the receipt outcome; a changed payload does not apply a new intent. If the row has disappeared, the current function can return its historical response snapshot.

Therefore the client cannot safely infer that the returned ID belongs exclusively to its new add, reconstruct the pre-add quantity from every supported merge, or infer that a returned snapshot means the row still exists. Subtracting a guessed quantity, renaming the returned shared row, or deleting it as compensation is not an adequate repair.

## Executed client evidence

The real hooks and RPC helper run against controlled same-unit merge and operation-receipt responses, modelled from the checked-in SQL. These cases do **not** execute PostgreSQL or deployed policies.

`node --test scripts/investigations/shopping-sync-races.mjs` now reports 19 cases: 11 pass, 8 intentionally fail. The new passing control proves the actual client reuses its operation ID after a committed save's response is lost, with the model applying quantity only once. New desired-behaviour failures prove:

1. Cancelling an in-flight add merged into an existing two-carton Milk row leaves three cartons instead of undoing just the new one.
2. Renaming that pending addition to Oat milk loses the changed title when the response is acknowledged. The pre-existing Milk row is retained, but the later intent disappears.
3. Renaming a new item during a save that commits but loses its response retains the changed draft after the failure, then discards it on receipt replay.

The original two temporary-create failures and three Q05 loader failures also remain. Expected failures stay outside release CI. The model only covers the selected same-unit merge, receipt replay and response-loss cases; it is not a general simulation of SQL merging.

## Client state contract

Persist a Shopping-specific outbox envelope without changing Timesheet/project-task queue semantics:

- Owner user ID, project ID, stable local item ID and original add operation ID.
- Immutable submitted payload once a request can have reached the server.
- Current desired draft plus a monotonically increasing desired revision; cancellation is a durable tombstone, not removal of the submitted record.
- Submission state: queued, submitted/uncertain, acknowledged, reconciling, settled or needs-review; acknowledgement stores the server's operation outcome, item IDs and version evidence.
- The last confirmed intent revision. Only that revision can be removed/settled on acknowledgement; a later edit remains pending.

Before first submission, edits can still compact into the unsent draft and cancellation can remove it. Persist the submitted envelope **before** making the request. Once submitted, later changes update desired intent separately. After an ambiguous response, replay the immutable original operation to establish its outcome, then reconcile the latest desired revision. Never reuse the original operation ID with a changed submitted payload.

An old acknowledgement must not replace the current envelope. Keep the item locally hidden while cancellation is pending. A needs-review result must preserve a readable description of the pending contribution rather than silently clearing it. Avoid automatic retry loops for authorization/conflict results; retry transient transport failures through existing controlled triggers.

## Proposed server contract

Use a new versioned RPC/receipt contract. The draft preserves authorized v2 merge behavior, hardens its replay access checks, and rejects attempts to replay v3 operations through v2. Names and schema below are not deployed APIs.

**Apply-add outcome** needs: original operation ID and authenticated owner/project; outcome `inserted` or `merged`; affected item ID; before and after contribution-relevant state; server-maintained item revision; whether the item currently exists; and an idempotent result snapshot. Keep receipt tables inaccessible directly to browser clients.

**Reconcile pending add** accepts the original operation ID, desired revision, idempotency key for that revision, and desired title/quantity/status or cancellation. The draft returns `applied`, `superseded`, `needs_review` or an authorization/validation failure; retries retain the original outcome with `replayed: true`. It includes affected transaction images and confirmed/latest received revisions. Those images are historical on replay and must never blindly replace newer client state. One transaction must either apply the complete change or leave all rows unchanged. A newer unresolved intent also supersedes older requests, without pretending the newer intent was confirmed.

Required ordering and safety:

1. Authenticate, establish receipt ownership and verify current project access before revealing receipt/item state, including the replay path. A previous grant is not current access. Reject a receipt/project mismatch.
2. Serialize reconciliation for the original operation and acquire affected item locks in a consistent order. Enforce monotonically increasing confirmed intent revisions so a late older request cannot undo a newer result.
3. For an unchanged row inserted exclusively by this operation, cancellation may remove that row. A changed row requires conflict handling unless the operation can prove a safe contribution-only adjustment.
4. For a merged add, restore only this operation's contribution when the before/after/version evidence establishes that doing so is safe. Never blindly delete the shared row. Unit replacement and missing quantities require explicit outcomes; do not pretend every add is a numeric increment.
5. A title change may need undoing the original contribution and applying it to another row. Perform both within one transaction, with normal duplicate/quantity rules and deterministic locking. Do not first rename the old shared row.
6. If another member changed the row after the add, return `needs_review` with no destructive mutation unless a tested contribution-aware operation can safely preserve that intervening change. Start with conservative conflict handling rather than a general merge engine.
7. A deleted row must not be recreated from a historical receipt snapshot. Replaying an already applied revision must not duplicate quantity or mutation.

A robust server revision should advance for all write paths touching these rows, including existing direct updates. Adding such a revision/trigger affects other `manual_todos` consumers, so its compatibility is a deliberate migration test requirement. Comparing only client timestamps is insufficient. Legacy receipts lack required evidence: return a recoverable resolution state for those cases, rather than inventing a before snapshot.

## UI/UX

Keep adding and editing responsive. Show short states such as “Saved on this device”, “Saving changes” and “Cancellation pending”. A confirmed operation becomes an ordinary shared grocery. When a conflict prevents safe undo, explain which pending addition needs attention and offer a clear next action; do not claim “Saved” while desired intent remains unresolved. Preserve keyboard focus and the draft through retry/reconnect. The exact conflict action needs the tested server outcome contract before UI implementation.

## Bounded implementation sequence

**Q04-A — contract and regression evidence (this slice):** record the scenarios and conservative contribution semantics above. Complete; original Q04 remains open.

**Q04-B — executable server contract:** create an isolated PostgreSQL test harness, then write the versioned receipt/reconciliation migration. Local `psql` and Docker commands are unavailable in this workspace session; investigate a suitable isolated runtime (for example an embedded PostgreSQL runtime) before requesting access to an external environment. Do not require production credentials to develop the contract. Test real functions/transactions/roles; mocks alone cannot certify this migration.

**Q04-C — durable client envelope:** implement persistence/migration of queued records, immutable submissions, desired revisions and cancellation tombstones against the verified server contract. Turn the five Q04 client failures green, then add crash/reload and stale-response tests.

**Q04-D — integrated release:** verify staged schema, permission boundaries and mobile UI; deploy server capability before enabling the new client path. A missing capability must retain work and explain the upgrade need. Do not silently fall back to legacy destructive behaviour. Preserve rollback compatibility and unresolved envelopes.

## Required server/integration matrix

- Newly inserted versus merged items; absent/equal/conflicting units; absent/zero/positive quantities.
- Edit/cancel before send, during send, after commit with lost response and after acknowledgement.
- Repeated original operation and repeated desired revision; out-of-order revisions; transaction rollback between undo and replacement add.
- Another member renames, changes quantity, checks off or deletes the item between add and reconcile.
- Two concurrent reconcilers, opposite item lock orders and multiple tabs; no deadlock or duplicate contribution.
- Owner, allowed member, removed member and outsider, including receipt replay after revocation; no unauthorized receipt disclosure or mutation.
- Legacy receipt without before evidence; vanished row; older client during rollout; interrupted client-envelope migration and crash recovery.

The next run should start Q04-B from this document. Q05 remains independent follow-up work after the queue ownership foundation; no Q04 safety claim is warranted until the real database and client checks pass.
