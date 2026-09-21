# Q04 Shopping entry integration

Verified locally 16–20 September 2026. The actual Shopping View now routes typed input, voice additions and Add back through retained draft sessions when `VITE_SHOPPING_DURABLE_CREATES=true`. The production switch remains OFF. This is an integrated editor milestone, not completion or activation of Q04.

## Behavior

- Names are split on commas, semicolons and newlines. Stable item matches keep their operation IDs, quantities and source details; exact title matches are reserved before rename matching, preventing metadata from moving to a different grocery.
- Rich inputs are normalized and validated before acceptance. Invalid quantities, non-UUID operation/source-batch identities, duplicate identities and malformed metadata remain unsubmitted.
- Uncertain acceptance freezes the original submission. Retry checks that same submission; it does not restore failed items into the legacy add path.
- A saved-draft picker combines persisted drafts with newer retained memory. Navigation detaches the editor, preserving failed writes and unresolved submissions until the authenticated owner changes.
- Voice review opens a separate draft, preserving typed input. Only the selected accepted session advances to an empty editor, so delayed incoming completion cannot redirect another selected draft.
- The legacy draft initializer is inactive behind the new editor. The feature-OFF path retains its existing behavior.
- At the registry capacity limit, only detached accepted sessions release their RAM. Their immutable acceptance evidence remains in IndexedDB; unsent and uncertain sessions are not evicted.

## Automated checks

`npm run ci`: **661 tests pass**, React hook import check and build pass, no lint errors. One pre-existing `useShoppingListVoiceCapture` dependency warning remains. Seven new regression tests cover item/quantity matching, duplicate labels, rich-input normalization/invalid input, capacity retention and inactive legacy storage callbacks. Existing session/registry/hook fixtures use valid operation UUIDs to exercise pre-acceptance validation.

Independent review of the editor/View wiring found no remaining blocker for a feature-OFF release and independently passed 56 targeted tests. Its auth-revocation listing finding was fixed: both initial and fallback RAM reads are guarded, and a closed owner is not re-read in the error handler.

## Native browser evidence

Reproduce with `node scripts/investigations/shopping-editor-browser/server.mjs` and open `http://127.0.0.1:52232`. This fixture renders the actual Shopping View, Actions, voice hook, Quick Add, transactional entry, AuthProvider under React StrictMode, registry, draft repository and operation workspace. It replaces upstream auth/project/live-update/network services with synthetic data and an offline indicator; IndexedDB is native. Its controls inject write failures and held/lost acceptance confirmations. No production credentials, RPCs or user records are used.

Observed through the rendered interface and the fixture's visible evidence panel:

1. Added Milk and Eggs; renamed pending Milk to Oat milk; cancelled pending Eggs. Reload retained Oat milk and kept Eggs hidden, with its original operation marked cancelled.
2. Forced a save failure, typed Bread for tomorrow, left Shopping and returned. The exact input remained; allowing writes and Retry saved it.
3. Lost Bread's acceptance confirmation after commit. The editor stayed locked. Created a separate Apples draft, selected the uncertain Bread draft and retried. The two acceptance requests were identical and produced one Bread operation; Apples remained separately selectable.
4. An uncertain voice phrase opened its own review draft while Apples remained available. Confident Oranges/Pears voice input produced the two pending additions. Synthetic speech callbacks verify UI integration, not microphone/device speech recognition.
5. Add back on a bought Yoghurt preserved quantity `2 pot`. Visible evidence showed four accepted batches and six operation records at that point, including the cancelled Eggs record; no unhandled promise errors.
6. Reload restored five visible pending groceries and both unsent drafts from native storage. An immediate snapshot during asynchronous recovery was not treated as settled evidence.
7. Held acceptance for Carrots, switched to Weekend and typed Weekend berries, then released the old confirmation. Weekend input was unchanged. Returning Home recovered exactly one Carrots operation.
8. At 390×844, selected Apples, renamed it Green apples and submitted. Switching A→B hid A's drafts and operations; B's evidence panel showed zero records and accepted batches. Returning A recovered Green apples with the other six pending groceries.
9. Checked 390×844 and 1365×900 layouts and screenshots: no horizontal overflow, readable editor/picker controls and usable add flow. Empty editor now says “Ready for groceries,” rather than incorrectly asking users to wait for an empty draft to save. Final browser error log was empty.

## Limits and next gate

An acceptance completing after leaving its list is durable, but handoff may wait until that list is opened again. The return-to-list path above is verified; do not claim immediate background synchronization across lists.

Remaining Q04 activation gates: legacy draft migration/recovery policy, real staging SQL and household authorization checks, authenticated hosted end-to-end sync/refresh, and physical iPhone Safari/Home Screen update/reopen checks. Phone-width desktop Chromium is not physical iPhone evidence. No SQL migration was applied and no new-create flag was enabled during this work.

The current fixture exercises offline create/edit/cancel and local recovery, not real server acknowledgement or real network interruption. Existing controller and SQL contract tests are supporting evidence only. Keep these distinctions visible in release notes and the delivery checkpoint.
