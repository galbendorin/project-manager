# Q04 older Shopping draft recovery

Verified locally on 22 September 2026, on `codex/shopping-legacy-recovery`, based on production `3bbdfbab217e7727b1bbca522fca1a96fc8b2b1d` (PR #66). This candidate is not published. New Shopping stays OFF; no live SQL was applied.

## Implemented behavior

The actual transactional Shopping entry now exposes a collapsed review panel for older saved input. Discovery is read-only and owner/list scoped. Missing storage access is an error, not an empty list. Sources, pointers and receipts are retained, including malformed records and completed acceptance evidence.

Structured generations retain their original item IDs and rich payload. Review checks input receipts (including completed receipts), original journal payloads and accepted transactional batches. Exact prior acceptance is suppressed as fresh input; partial overlap or changed payload is a visible conflict. Submission rechecks evidence and uses the original generation's atomic input receipt. It deliberately does not make an editable imported draft: that would permit ordinary editing to allocate fresh IDs before old acceptance was resolved. Existing pending controls handle subsequent editing/cancellation.

Plaintext has neither list nor acceptance history. The panel explicitly warns about this ambiguity and requires a list choice and confirmation before opening it as new input. A source/owner/list/content digest gives retries the same destination identity. Reopening preserves an already edited or accepted destination; it never replaces the current draft. Source changes during hashing or destination writing produce a conflict, preserving both source and any committed copy. There is no cross-store transaction or universal protection against an old client allocating new IDs: deliberate review remains required.

The owner runtime creates recovery capability only when enabled, and owner replacement fences asynchronous work and UI publication. No storage cleanup, database version change or flag activation is included.

## Verification

- Full app checks: **676 tests passed**, hooks check, lint and production build passed. Lint retains the pre-existing voice-hook dependency warning; no new warning. `git diff --check` passed.
- Fifteen focused tests cover owner/list isolation, lost pointers/history, rich payload normalization against the real legacy writer, completed receipts, partial/changed overlap, journal/accepted-batch evidence, old-client acceptance during reads, lost save confirmation, malformed/unavailable storage, source changes, deterministic plaintext retries, existing edited/accepted destinations and owner replacement.
- Independent review found two issues: legacy normalization could produce a false conflict, and plaintext needed a source comparison after destination commit. Both were fixed with regressions; the reviewer independently reran all 15 tests and reported no remaining blocker for saving this candidate.
- Existing 79 native SQL checks from PR #66 are reused; SQL is unchanged and was not rerun here.

Logs: `/private/tmp/pmw-legacy-recovery-preflight.log` and `/private/tmp/pmw-legacy-recovery-targeted.log` (ephemeral local files).

## Browser evidence

Used `scripts/investigations/shopping-editor-browser/server.mjs` on localhost52232 and its new **Seed older recovery examples** control. This mounts the actual Shopping View/Actions/AuthProvider in StrictMode with native IndexedDB and synthetic upstream/offline adapters. No production data or network operations were used.

- Accepted bread was excluded as fresh input; overlapping bread/rice was blocked visibly.
- Legacy milk appeared pending once with original identity, quantity 2, unit carton and its metadata retained; no structured copy appeared in the ordinary saved-draft picker.
- Plaintext required explicit destination and confirmation. A forced failed write kept the current apples draft and showed a recoverable error; retry opened a separate draft.
- Editing the copied text and reopening its legacy source preserved the edited destination. Reload retained that copy, the original apples draft and accepted-history suppression.
- Account A to B hid A's candidates/copy; returning restored them. Switching Home to Weekend hid Home's structured history while unscoped plaintext still required deliberate selection.
- At 390×844 and 1365×900, document width matched viewport width. Screenshots were inspected for wrapping, readable controls and established visual styling. No browser errors were observed.

The test tab was closed, viewport reset and local server stopped. Synthetic local fixture storage was preserved. These checks are desktop Chromium evidence, not physical iPhone or authenticated hosted evidence.

## Remaining activation gates

Continue this candidate with mixed-version/rollback behavior and pending summary/projection verification. Then complete the migration-specific recoverable snapshot and local restore rehearsal, existing-project hosted SQL/authorization checks and actual iPhone Safari/Home Screen lifecycle checks. Keep all source evidence and compatible readers. Do not start Q05 or label Q04 complete before those gates pass.
