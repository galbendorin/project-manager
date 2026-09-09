# Q04-D R1a — transactional draft repository

9 September 2026. R1a is implemented and verified as an **unintegrated storage boundary**. It does not activate the new Shopping sync, import localStorage drafts, delete records or apply SQL. The existing draft/acceptance UI still uses the previous protocol, so its two separate retention investigation failures remain expected.

## Implemented behavior

`createShoppingCreateJournal({ includeDrafts: true, ... })` exposes `journal.drafts`: create, read, list unresolved drafts, expected-version update, accept and list accepted batches. Draft IDs and item operation IDs are supplied by the caller and must remain stable for retries. Values retain full JSON grocery data, including quantity, unit, source and metadata.

Each draft has one current version and its immutable initial payload. Updates replace the current value rather than retaining every keystroke. Exact creation retries return current state, including acceptance, without restoring initial text. An immediate identical update retry returns its committed version; an older version after intervening work conflicts. Accepted drafts cannot be updated.

Acceptance checks the expected draft version, inserts its immutable batch and marks the draft accepted in **one IndexedDB transaction**. A unique multi-entry index reserves each owner/operation identity across accepted batches, including batches in different projects. Duplicate IDs within an input are rejected before writing. This is local input acceptance only: it neither writes operation-journal entries nor proves server sync. The later integration must hand off the exact batch identities through the existing operation journal before network dispatch, and reconcile any legacy operation identities during migration.

The existing transaction-completion, timeout, abort, strict durability and owner guards cover both stores. No acknowledgement occurs on request success alone. A completed transaction with a lost completion event can time out; exact replay reads the committed state. Missing records and stale versions never become implicit upserts. There is no delete or automatic conflict-to-fresh-draft operation.

## Verification

- **560 application tests pass**, including 17 new draft-repository cases; hook imports, lint and production build pass. The pre-existing voice hook lint warning remains.
- **37 focused repository/journal tests pass.** They cover duplicate editor conflicts, both initiation orders of edit versus acceptance, concurrent exact acceptance, operation uniqueness/rollback, project/account isolation, transaction abort after request success, lost completion after commit, owner change before completion, both schema opening orders, blocked upgrade recovery, strict JSON and empty-input rejection.
- **79 native PostgreSQL tests pass** for the existing operation/journal/server contract. This suite does not exercise the new draft repository itself. The first local attempt was blocked by sandbox shared-memory restrictions; the isolated suite was rerun under its existing approved execution permission.
- A native browser fixture on dedicated localhost port52222 preserved an existing operation across the opt-in upgrade, performed100 versioned updates without adding draft heads, accepted the latest Milk draft twice into one batch, and retained Bread as discoverable unsent input after full-page reload. A second-connection edit racing acceptance was rejected with the accepted batch intact. The fixture displayed actual stored results through its UI; no production data or credentials were used. Its synthetic database was removed, tab closed and server stopped.
- Independent read-only review found no blocker to source publication with v2 initiation opt-in. No app UI change occurred; this is not a physical iPhone Safari/Home Screen or authenticated household smoke result.

Logs: `/private/tmp/pmw-q04-draft-repository-preflight.log`, `/private/tmp/pmw-q04-draft-repository-tests.log`, `/private/tmp/pmw-q04-operation-native.log`.

## Schema, migration and rollback contract

Only `includeDrafts: true` requests database version2 and creates `draft_heads` and `accepted_draft_batches`. Normal app callers retain the default false and do not initiate that upgrade. They now open the existing database without pinning a version, allowing operation-only use after an opt-in upgrade. Existing operation stores and rows remain intact. Connections close on version change; a blocked or abandoned upgrade fails closed and can be retried.

There is deliberately no localStorage importer. Keep old draft generations, input batches and receipts untouched. A future importer must be idempotent, preserve uncertain operation IDs, reconcile acceptance evidence, and fence older localStorage writers before any source deletion. Historical keystrokes cannot be assumed to represent separate intended drafts.

**Before enabling v2 in the app**, establish a compatible deployment floor: older builds that pin journal version1 cannot reopen a version2 database. Turning the feature flag OFF does not downgrade IndexedDB. Roll back to a build that supports opening the latest schema, retain both old and new data, and never delete the database to regain old-code compatibility. Mixed-version/sleeping clients and physical-device upgrade behavior remain activation tests.

R1a retains initial/current draft payloads and accepted batches indefinitely. It bounds per-keystroke copies within this repository, not total storage across draft lifetimes. **R1b** must specify and test retirement fencing before implementing cleanup; **R2** must wire asynchronous persistence and recovery UI; **R3** must prove migration, permissions and staged activation. SQL remains unapplied and the new-create flag stays OFF.
