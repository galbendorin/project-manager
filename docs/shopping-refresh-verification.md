# Q05: preserve newer Shopping changes during refresh

Base: production `0b2e3d0` (Q04 PR70). The three saved Q02/Q05 delayed item-success, item-failure and project-refresh reproductions still failed on this base. A late response replaced `Newest milk` with `Milk` or persisted an older queue.

## Repair

- Account lifetime and separate project/item request generations reject obsolete callbacks and responses, including unmount and list switches.
- List selection and its cached rows change together. Project refresh writes current cache/queue, preserving newer selection on failure too.
- Item reads compare current local revision and cached rows/queue with the dispatch snapshot. An acknowledged local write remains protected after its queue drains. Active optimistic mutations prevent another read from resetting their UI.
- Durable-create list confirmations share the same acceptance fence. A discarded read does not mark terminal journal versions refreshed; normal retry/foreground refresh can finish confirmation. Current durable refresh failures remain visible even when they supersede the ordinary loader.
- Delayed IndexedDB hydration cannot replace a newer synchronous write. Shopping hydration is read-only until the owning hook accepts it. Account-keyed Shopping mounting prevents previous account state entering a replacement account's cache.
- A refresh with outstanding legacy queue entries does not advance the last-sync timestamp as evidence those entries reached the server.

## Verification, 29 September 2026

`npm run ci`: **723 tests pass**, hooks import check, lint and production build pass. The original three Q05 reproductions now run in normal CI. Focused coverage includes overlapping success/failure, a drained queue, pending actual action callback, stale callback entry, selection changes, unmount, delayed hydration, cold durable selection, loading-state cancellation, parallel ordinary/durable failure, rejected terminal confirmation and successful retry. Existing Q04 integration/recovery coverage remains passing. Independent reviewer findings were addressed with regressions.

Native Chromium browser fixture: `node scripts/investigations/shopping-refresh-browser/server.mjs`, `http://127.0.0.1:52233/`. Uses actual React StrictMode data/actions hooks and the product cache-effect pattern; only the network and in-memory synthetic cache are replaced. Verified old read success after an edit, old read failure after another edit, refresh during a held write, and list switching before old response completion. The newest names remained visible and persisted to the correct synthetic list. Repeated stale-success interaction at390px; no browser console errors/warnings. This is interaction evidence, not a physical iPhone or hosted authorization test. No production data was written.

No product layout, SQL, auth grants, storage schema, contribution protocol or feature flag changes. Existing Q04 hosted and owner phone evidence is reused, not repeated or relabelled. Backup/restore remains owner-waived.

## Limits and release

Rejected stale reads leave current state intact and rely on existing refresh/retry events for another read; they do not create unbounded retries. This change does not claim general cross-tab transactions or resolve every concurrent server write. Durable journal guarantees and existing queue reconciliation continue to handle their own protocols.

Publish through the normal checked PR and verify both production deployments before marking Q05 complete. Temporary Q04 preview PR69 remains excluded. The existing explicit durable-creates OFF override remains available; it is not changed by this repair.
