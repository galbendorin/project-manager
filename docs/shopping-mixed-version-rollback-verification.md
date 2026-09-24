# Q04 mixed-version and rollback verification

24 September 2026. Local storage regression added to `src/utils/shoppingDraftBatchRecovery.test.js`. The new Shopping flow remains disabled in production, and the contribution SQL has not been applied.

## Verified local sequence

1. A version-1 client saves an operation, a pending local input batch, and older plain text.
2. A version-2 writer upgrades the same IndexedDB, accepts a new draft, and leaves another draft unsent. The old operation and new accepted draft deliberately share the title Milk with separate operation IDs.
3. The sleeping version-1 client closes on `versionchange`. Its later pinned-version open fails with `VersionError`; it cannot silently write into the upgraded database.
4. A compatible feature-off reader opens the existing database without requesting a downgrade. It reads the old operation and accepted version-2 batch, then the offline workspace hands off both batches using their original operation IDs. No network call occurs.
5. A second recovery pass leaves exactly the same three operation records and pending count. The retained batch marker, older plain text, accepted batch, and unsent transactional draft remain available.

The local test passed with 15/15 tests in the focused recovery file. ESLint, the production build, and `git diff --check` passed. Existing tests already cover a blocked version-2 upgrade, interrupted handoff, lost completion, duplicate titles, owner/project isolation, and a sleeping tab trying to edit a compacted accepted draft. No application or database behavior was changed in this slice.

## Rollback boundary

Production source `3bbdfbab` opens existing IndexedDB without pinning version 1 and can read accepted version-2 batches with the feature off. Earlier source `6eb361f` pins version 1; after a version-2 upgrade it fails on reopening. The safe rollback target is a compatible versionless reader such as `3bbdfbab` or a later build. Keep its recovery reader and all device storage. Disabling new submissions does not downgrade IndexedDB.

This proves the local storage and offline handoff path under `fake-indexeddb`. It does not prove old mobile Safari tab behavior, a deployed update, server reconciliation, or restore from a device loss. Those remain part of the hosted and physical iPhone activation gates. No universal fence exists across localStorage and IndexedDB for already-running older code; retained old input must still be reviewed when its acceptance history is ambiguous.
