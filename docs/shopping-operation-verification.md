# Q04-C3 durable pending-create controller

8 September 2026. This slice implements the pending-operation state machine on top of the C1 journal and C2 RPC adapters. It is not connected to the Shopping screen yet, and it does not apply the SQL migration. The five Q04 actual-hook failures remain open until integration.

## Behavior

`createShoppingCreateOperations` exposes create, read, edit and syncOnce. The journal's desired document now has an explicit protocol version, latest draft and decimal-string revision, source fields, add acknowledgement, immutable intent requests with their outcomes, and an explicitly reviewed server watermark. Generic C1 records without this protocol are rejected rather than silently migrated.

An Open draft can be compacted before submission. The frozen submission records its exact item and local baseline revision. A pre-send cancellation remains a local tombstone and sends nothing. Since add v3 always produces an Open row, pre-send Done has no confirmed baseline: completion needs a separate reconciliation intent.

After submission, edits retain their own desired revision and never rewrite the frozen item. Each reconciliation ID, revision and payload is durably committed before dispatch. Concurrent controllers adopt the winning stored intent. Response loss and failed acknowledgement storage leave that request available for exact replay after reopening. One syncOnce call sends at most one RPC; it does not contain an automatic retry loop.

Acknowledgements merge through journal compare-and-set against current state. Older replies do not erase newer drafts or lower known confirmation/replay counters. Only matching confirmed intent settles an operation. A returned grocery image is contribution evidence, not permission to replace the list; every acknowledged operation requires a current-data refresh at integration.

Unknown server revisions require review even if the local draft already has a larger revision. A subsequent explicit edit records which server watermark it observed and advances beyond both local and observed revisions. This review watermark stays fixed across that edit's CAS retries: a reply discovered during retry cannot become an implicit review. Missing grocery evidence and server needs_review/superseded outcomes remain recoverable states. Saved acknowledgements are revalidated with the same decoders as fresh RPC responses. Invalid ownership, revisions or impossible receipt combinations fail closed.

## Executed checks

- 30 controller tests exercise pre-send compaction/cancellation/completion, in-flight edit/cancel, lost add and intent replies, separate connections, stale edits, delayed duplicate acknowledgements, failed acknowledgement persistence, unknown server counters above JavaScript's safe integer range, explicit review races, missing rows, malformed durable records and account changes.
- The native PostgreSQL suite passes 77 cases, including six controller/journal scenarios against actual SQL. They demonstrate preservation of shared quantities after edit/cancel, reopen after lost committed add and move responses, household conflict retention, and pre-send completion without marking a pre-existing shared row Done.
- Full app preflight: 510 tests, lint, React hook checks and production build. The SQL workflow installs locked client test dependencies and watches journal/controller changes.
- A synthetic fixture in the Codex browser, using native IndexedDB and production controller modules, recovered a frozen add plus later cancellation after a full page reload and completed the cancellation. Competing desired edits and pre-send completion also passed. Synthetic data was removed afterward.
- Independent review identified the pre-send Done distinction, unknown-server review marker, saved-response validation and a review-marker CAS race; all were addressed with regressions.

Logs: `/private/tmp/pmw-q04-operation-tests.log`, `/private/tmp/pmw-q04-operation-preflight.log`, `/private/tmp/pmw-q04-operation-native.log`. Browser fixture: `/private/tmp/pmw-q04-operation-fixture/`.

These are isolated tests. Authenticated household smoke credentials, deployed-schema access and physical iPhone testing remain unavailable. Browser eviction can still remove local storage; the journal is not a backup.

## Integration contract and next task

1. Instantiate the controller with the owner-scoped journal, a session-bound transport and a synchronous current-owner guard. Close the journal on sign-out/session replacement. The guard immediately precedes adapter entry; Supabase transport must also prevent authentication changes during its own awaits before HTTP dispatch.
2. Route new online adds and offline pending-create actions through durable controller operations. Keep legacy v2 queues explicitly separate; uncertainty flags do not prove a legacy request was unsent. Never migrate ambiguous v2 work by inventing contribution evidence or falling back from v3.
3. UI edits pass the last displayed desired revision. A stale revision raises SHOPPING_DESIRED_CONFLICT; refresh the draft instead of overwriting newer input. SHOPPING_OPERATION_SETTLED means the pending-create lifecycle has ended; normal shared-item edits require the normal item path, with fresh row data.
4. Schedule syncOnce through bounded existing retry/reconnect triggers, drain further pending work after the active run, retain failure state, and stop on needs_review. Preserve Q03's current-state acknowledgement rules. Keep cancellation hidden while pending, with recoverable wording for conflicts and storage failures.
5. Do not use contribution.after or historical affected_items to hydrate the list. Reconcile current desired state with a current refresh, and handle loss of access without exposing another owner's journal. Explicit conflict recovery must come from user action, not repeated automatic edit calls.
6. Pass all five Q04 actual-hook scenarios and online/partial-multi-add/legacy tests, then inspect real components at phone and desktop widths. Stage SQL against actual schema, policies and triggers before activation; deploy the capability before enabling v3. Q05 delayed refresh is still separate, but no refresh may erase operation evidence.

Settlement is retained in the journal; no pruning, archival or backup policy is implemented in this slice. Integrating list/cache settlement and safe retention is part of the next bounded task, not permission to delete unresolved records.
