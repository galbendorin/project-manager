# R2a — asynchronous input-store preparation

13 September 2026, based on production `74cdae6` / PR #59.

## Change and boundary

The workspace now awaits input-store save, list and remove operations. Acceptance callbacks and operation creation wait for save fulfillment. Closing or changing the account while save/list is pending suppresses late callbacks and writes. A reload ticket prevents an older batch-list result or error from replacing a newer result. Existing operation versions still merge monotonically.

The production adapter is still the synchronous `shoppingInputBatches` store. No IndexedDB draft adapter, typed-hook change, recovery UI, schema migration, import or flag activation is included. This is async plumbing preparation, not a complete asynchronous acceptance protocol or user-visible draft recovery feature.

## Verification

- 582 application tests pass, including eight new async input tests. Hooks, lint and production build pass; only the existing voice-hook dependency warning remains.
- New cases cover delayed commitment; rejected save; committed save with lost completion followed by exact-ID recovery; close/account change during save; awaited/rejected removal; stale successful/failed reload; closing during recovery read.
- The existing synchronous input-store tests pass unchanged, including crash/reopen during operation handoff and preserved rich fields.
- Independent read-only review found no merge blocker with the current synchronous adapter; it identified the activation blocker below. Review did not rerun tests.
- Initial preflight reached browser smoke after successful tests/build, but sandboxed Chrome could not launch. The existing smoke command then passed outside the sandbox: live public landing, login panel and signup panel. Authenticated checks were skipped because smoke credentials are absent. This smoke checks the current public deployment, not the new unintegrated async path.
- Logs: `/private/tmp/pmw-r2a-preflight.log` and `/private/tmp/pmw-r2a-smoke.log`. No changed UI requires a new layout test. No physical iPhone or new authenticated household evidence is claimed. SQL source is unchanged; record hosted SQL CI separately during release.

## Required next slice — R2b acceptance outcome and typed-draft controller

**Do not connect an asynchronous acceptance adapter to the current Actions catch path.** A transactional save can commit and then report a timeout. The current catch reports items as unsaved, while background recovery may already transfer the committed batch. Editing the displayed text can allocate new operation IDs and submit duplicates. The new workspace regression proves original-ID recovery, not prevention of this UI-level duplicate scenario.

R2b must distinguish confirmed non-acceptance from indeterminate acceptance. Keep an immutable submission reference (owner/project/draft ID, version, operation IDs and exact normalized payload) while unresolved. Retry or read that exact decision, including after reload; never convert an uncertain submission into fresh failed input. Preserve subsequently typed text separately and prevent submission of the unresolved snapshot as a new identity. Accepted or compacted draft identity must recover its existing batch, including JOURNAL_DRAFT_RETIRED; it cannot become a newly created draft.

Acceptance and saving must share a controller with serialized/coalesced saves. Add waits for the selected revision to commit, and state publication must be fenced by owner/project/session. Resolve the action-layer normalization boundary before acceptance so the stored batch and operation journal agree on quantities, units, source and metadata. Non-typed entrypoints need the same immutable acceptance identity. Batch handoff completion is distinct from server acknowledgement and from safe payload retirement.

Require a regression through the actual typed hook/Actions/View boundary: commit acceptance, lose completion, allow recovery, then attempt an edit/resubmit and reload. Assert one original contribution plus only any independently intended new input, without dropped rich fields or false saved status. Also cover typing during save, failed writes, list/account changes, duplicate tabs and coalesced pending saves. R2c then adds saved-draft selection/recovery UI with phone/desktop checks. R3 mixed-version migration, staging/permissions, authenticated smoke and physical iPhone gates still precede activation.
