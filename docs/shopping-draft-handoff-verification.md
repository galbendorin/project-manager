# R2c1 — accepted-draft handoff and rollback recovery

14 September 2026. Based on production `ab309324` / PR #61. This bounded prerequisite connects accepted draft storage to the existing workspace and pending-groceries panel. It does not connect the new typed editor or add a saved-draft picker. New transactional submissions remain disabled and SQL unapplied.

## Behavior

Ordinary journal clients expose `readAcceptedDrafts(projectId)`. They open the current database version and return an empty list when draft stores do not exist; they do not initiate the v2 upgrade or expose a draft writer. Existing v2 batches remain readable after the new-create flag is switched OFF.

For the selected owner/project, the workspace checks accepted batch items against operation journal records. A completed handoff requires the same owner, project, operation ID, local ID and immutable initial payload; current desired edits are not compared as the original payload. The initial payload builder is shared with operation creation without changing its validation semantics. Current operation state must also validate. Missing operations are created through the existing exact replay boundary, retaining their original IDs and rich fields. Matching operations are left alone, including later edits/cancellations.

Each pass creates at most100 missing operations; larger offline batches schedule a continuation. A write failure stops the pass and leaves the batch for explicit retry. Batch payloads and acceptance markers are retained; there is no new deletion or retirement protocol. Handoff completion means durable operation creation, not server acknowledgement. Grocery projections still come only from operation records.

The actual durable hook wakes recovery when the selected project changes, including while rollout is OFF. The existing pending-groceries panel shows missing items and recovery errors, even if no operation rows exist. Account changes fence delayed reads and writes. Recovery currently visits the selected project; opening another project wakes its recovery. It does not promise background processing for every project.

## Verification

- **617 app tests**, hooks, lint and production build pass.14 new handoff tests and one actual-hook regression were added. Existing voice-hook warning remains. Log: `/private/tmp/pmw-r2c-handoff-preflight.log`.
- Fresh ordinary DB stays v1; existing accepted/compacted v2 batches reopen without a writer. Tests cover owner/project isolation, replacement during read, exact duplicate-title identities, concurrent tabs, partial handoff followed by an edit and reopen, lost operation completion, scope/local-ID/payload collisions, missing immutable history, invalid accepted input and103-item offline continuation.
- The actual hook harness verifies selected-project wake and flag-OFF error visibility with no operations or pending rows. These are deterministic hook-body tests, not browser auth sessions.
- Independent bounded review found no release blocker and requested the hook coverage above; that regression is now included.
- Native IndexedDB browser fixture uses the actual workspace and `ShoppingPendingAdds`, with the journal writer disabled. Injected partial handoff showed one completed Milk operation and retained Bread; Retry sync completed exactly the second operation. The panel disappeared and a full reload retained exactly two operation records. Component content widths390 and1200 were visually inspected; this was not a full phone viewport or physical-device check.
- Reusable fixture: `node scripts/investigations/shopping-handoff-browser/server.mjs`, localhost52226. Browser tab/server closed after verification; synthetic data may remain on that isolated origin. No production household data was changed. No actual full Shopping View journey, authenticated hosted smoke or physical iPhone claim. SQL source is unchanged; record hosted SQL CI during release.

## Remaining R2c editor work

The initial integration review found three gates which must be solved with the editor rather than hidden by this handoff repair:

1. Protect failed/uncertain RAM input through saved-draft selection, project selectors, external project changes and route lifecycle. Guard controlled switches or retain owner-scoped unresolved sessions; effect cleanup cannot await a save. Do not discard the old editor merely because the selected project changes.
2. Normalize and validate items before transactional acceptance against the operation/RPC boundary, including quantity, unit, status, source and metadata. The generic draft repository can hold shapes operation creation rejects. This handoff fails closed and retains such batches; it does not retroactively fix invalid accepted data.
3. Wire typed acceptance directly to its controller outcome, avoiding the existing Actions catch that restores rejected promises as fresh items. Preserve uncertain submission identities, independent new input and voice/Add again failure restoration. Do not mount the enabled legacy initializer behind the new editor, because it imports/removes legacy plaintext.

Then add the saved-draft picker and require actual View/Actions regressions for save-timeout navigation, acceptance-timeout reload/rollback, concurrent acceptance, rich-input recovery and visible non-typed failures. R3 migration/rollback, staging permissions, sync/projection UX, authenticated smoke and physical iPhone Safari/Home Screen verification still precede activation. Full batch retirement remains deferred.
