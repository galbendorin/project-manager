# Shopping draft retention and recovery contract

9 September 2026. Based on released PR #57 / `6eb361f`. This is an investigation and implementation contract, not a completed cleanup feature. The durable-create flag remains OFF. No production data, schema, storage cleanup or application behavior changed in this slice.

## Confirmed behavior

Run `node --test scripts/investigations/shopping-draft-retention.test.mjs`.

The suite uses the actual input store with deterministic in-memory local/session storage. It produces **seven tests: two expected requirement failures, five passing hazard demonstrations/controls**. It is intentionally outside ordinary application CI. These are storage protocol reproductions, not physical Safari or simultaneous browser-process tests.

| Case | Result on PR #57 | Meaning |
| --- | --- | --- |
| 100 edits in one draft | 101 localStorage keys; required bound fails | Superseded full payloads accumulate with typing. The test's ten-key ceiling is a loose regression bound, not an eviction policy. |
| Tab A leaves Milk unsent; tab B submits Bread; all tab sessions are lost | Fresh session shows empty input; discoverability requirement fails | Milk still exists but the UI cannot find it through its current fallback. |
| Delete only the completed batch receipt | Milk reappears as unsent | Receipt completion means journal handoff, not safe deletion or server settlement. |
| Delete receipt and draft, then resume a tab holding the old draft | Tab repersists Milk; editing it allocates new IDs | Exact-ID retry protection does not protect fresh IDs allocated from resurrected text. |
| Scanner observes a superseded generation, then another tab republishes its captured pointer | Deleting that generation loses the second tab's recoverable draft | A scan of localStorage keys/pointers is not a transaction. |
| Keep acceptance evidence | Accepted text stays suppressed before/after batch drain | Preserve this guarantee through any migration or retention change. |
| Keep separate existing tab pointers | Milk and Bread reopen separately; another owner sees neither | Preserve account/project isolation and existing-tab recovery. |

## Decision

Do not add an age-based sweep, an arbitrary oldest-entry limit, or a scan-and-delete helper to the current localStorage protocol. Do not infer acceptance by matching titles. Independent review agrees that complete cleanup needs serialized decisions covering draft heads, acceptance evidence and deletion. A single-writer pruning protocol could reduce some payloads, but would introduce additional ownership rules while leaving complete recovery unresolved.

Use a transactional input lifecycle for the next implementation. Prefer extending the existing IndexedDB boundary rather than introducing a second locking mechanism around localStorage. Keep protocol decisions and callbacks independent of React rendering. The existing operation journal, immutable initial payloads, server receipts and owner fences remain authoritative for operation replay.

## Required invariants

1. **Saved means committed.** Acknowledge a draft save or accepted batch only after its transaction completes. A timeout is an unknown outcome; retry the exact identity and payload. Retain in-memory input on failure.
2. **One atomic acceptance decision.** The submitted draft revision, accepted input and operation identities must agree in one transaction. A render or crash must not expose both accepted text as fresh input and its submitted batch.
3. **Current input remains discoverable.** Keep one current full payload for each unresolved draft lineage; expose all such drafts for the selected owner/project even when sessionStorage is gone. Treat recovery as choosing an existing draft, preserving its operation IDs and rich fields. Do not automatically merge drafts or submit them.
4. **Stale writers cannot restore retired state.** Replace unconditional upserts with explicit creation and expected-version updates. Missing/consumed/superseded state is a conflict, never permission to recreate the old draft. A duplicated tab must fork a new editing lineage on an explicit new edit, or receive a clear conflict; it cannot silently overwrite the other tab.
5. **Cleanup and writers serialize.** Determine eligibility and delete/compact in the same transaction as the relevant head/acceptance checks. A scanner's prior observation is insufficient. A newer draft, unresolved operation, failed handoff or conflict remains untouched.
6. **Retirement evidence survives cleanup.** Removing payloads must not make an old generation look new. Choose and test a bounded retirement/version protocol before deleting tombstones. A candidate is an owner-scoped monotonic epoch plus compare-and-swap heads; this is a design candidate, not a verified implementation. Keep conservative evidence until the stale-create and stale-update tests pass.
7. **Bound work without discarding obligations.** Coalesce obsolete intermediate edits, and cap cleanup work per transaction/run. Never impose a hard count limit by dropping unresolved drafts. Completed history may compact only when the retirement rules prove it safe.
8. **Preserve isolation.** Every lookup, cursor, mutation, migration and cleanup is owner/project scoped. Sign-out or owner change fences pending completions and cannot write to the next user's UI or storage scope.

## Small implementation sequence

### R1a — Transactional storage boundary, no cleanup or UI activation

- Define draft/head, accepted-batch and retirement records with explicit versions and strict JSON validation. Keep the actual schema and database upgrade within the existing journal's owner and timeout discipline.
- Implement create/read/list, expected-version draft updates and atomic acceptance. Deletion remains out of scope for this slice.
- Test transaction aborts and uncertain completion, exact retries, concurrent duplicate tabs, update-versus-acceptance, owner change, and native database reopen.
- Decide migration/version fencing first. An old localStorage-writing tab must not race an importer into destructive cleanup. Initially copy/reconcile conservatively, retain legacy source evidence and keep activation OFF; do not blindly enumerate legacy keystrokes as separate recoverable drafts.
- Exit: deterministic tests prove the implemented save/acceptance invariants, independent review passes, and there is a concrete migration/rollback contract. No feature activation yet.

### R1b — Retirement fencing and bounded cleanup

- Specify the retirement protocol and prove that stale create/update requests cannot restore retired generations. Keep payloads until those tests pass.
- Then implement one bounded cleanup operation. Determine eligibility and delete within the same transaction; never use a previous scan as deletion authority.
- Test cleanup-versus-update/acceptance, retirement-versus-stale creation, interrupted cleanup/reopen, unresolved input preservation, and repeated cleanup idempotency.
- Exit: superseded payloads compact safely, all unsent draft heads remain discoverable, and remaining evidence has a documented storage bound or an explicit justified retention requirement. Independent review must pass before integration.

### R2 — Existing entry flow and recovery UI

- Wire asynchronous persistence into the typed hook without clearing uncommitted input. Coalesce keystrokes while keeping the latest in-memory revision; Add waits for the exact prepared revision to commit.
- Show a compact “Saved drafts” recovery option when other unresolved drafts exist. Display enough text to identify each draft, preserve current input on selection conflicts, and distinguish saved locally from shared successfully.
- Preserve quantities/units/source/metadata for rich inputs. Account/list changes and late voice callbacks must remain fenced.
- Exercise phone and desktop keyboard, error, retry, reload, duplicate-tab and recovery flows with actual components. Require a physical iPhone/Safari/Home Screen pass before activation.

### R3 — Migration and staged activation

- Prove import idempotency and interrupted import recovery using snapshots from PR #57, including accepted generations, uncertain batches and older unsent tabs. Preserve ambiguous legacy records for explicit recovery; do not guess which historic keystrokes were intended as separate drafts.
- Verify retention against both active and sleeping older clients, rollback and mixed-version sessions. Keep legacy evidence if version fencing cannot be proved.
- Then complete existing SQL staging, household permissions, sync-summary/projection UX, authenticated smoke and physical-device gates. Publish source separately from activating the new flow.

## Scope and evidence limits

No cleanup implementation is approved by these tests; the deliberately unsafe mutations exist only in synthetic test storage. Ordinary CI should remain green while the two desired-behavior failures stay visible in this separate investigation suite. Do not change those failing assertions to match current behavior or label them fixed without an implementation.

The solution cannot promise recovery after the browser deletes all origin storage or the user clears website data. This contract concerns controlled application lifecycle and retention decisions. It does not claim deployed household policy coverage, backup/restore coverage, or real-device persistence guarantees.
