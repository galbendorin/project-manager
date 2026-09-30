# Q09 account/cache ownership verification

## Verified repair: legacy sign-out cleanup

An IndexedDB open/scan can outlast a quick sign-in. Previously, cleanup scanned
first and then removed shared navigation/identity keys and user caches. This
could erase a replacement identity or fresh same-account writes. Moving local
deletion earlier also requires rejecting a pending durable read, otherwise it
can restore an IndexedDB-only signed-out cache into localStorage.

Cleanup now removes the leaving account's local data synchronously, checks
whether shared navigation belongs to that account, and scans/deletes durable
legacy keys in one readwrite transaction ordered before subsequent writes.
Per-user cleanup epochs reject reads started before that cleanup. The cached
identity helper leaves another account's active pointer intact.

Six added regressions exercise real storage operations with fake-indexeddb:
replacement account and navigation, fresh same-account intent, pending durable
read, seeded two-store cleanup and other-account/preferences preservation,
identity-pointer ownership, and unavailable database startup. Native browser
IndexedDB/localStorage checks also passed on a synthetic isolated localhost
fixture. These are storage checks, not hosted JWT or physical Safari evidence.

737 application tests, hook checks, lint and production build passed. Two
pre-existing hook warnings remain. Focused independent review identified the
pending-read issue; re-review of the corrected boundary found no blockers.

No UI, SQL, RLS, API, authentication protocol or storage schema changes. The
existing durable Shopping journal remains retained and account/project scoped;
this repair does not delete unsent durable drafts or add new retention rules.
Storage failure/deadlines can leave durable bytes behind; this is not a secure
disk erasure guarantee. A new account cannot load another account's scoped keys.

## Verified repair: legacy Shopping sync lifetime

A controlled actual-hook probe showed two persistence calls after unmount and
sign-out cache clearance. The obsolete update reply recreated an empty cache
and successful-sync timestamp. This proves a local lifecycle failure, not a
hosted cross-account mutation.

Legacy sync now checks AuthProvider's immutable, revocable owner capability
without opening the durable journal. Unmount/replay cancels each run by epoch
and abort signal. Queued reads, adds, updates and deletes use a Supabase client
with a captured, identity-checked bearer token; it cannot acquire a replacement
account's token internally. Late responses cannot acknowledge, persist, publish
UI errors or start follow-up work. Add notifications also verify the expected
account and current lineage after session acquisition. An already dispatched
server operation may have committed; response cancellation does not undo it.
Existing operation identities and retry contracts remain authoritative.

757 tests/hooks/lint/build passed, including 20 new lifecycle/transport/notify
checks. Review identified a StrictMode mutex issue; epoch/abort-aware exclusion
and a held-acquisition replay regression resolve it. Final review found no
blockers. Actual React hook plus real Supabase SDK browser checks at desktop and
390x844 retained only account B rows after a delayed account A reply: one A-token
request, zero post-close persistence. Synthetic replies/accounts, no hosted
writes or physical Safari evidence. Feature-OFF legacy queue control also passes.

## Verified repair: account-owned application state

An actual PlanProvider controlled-response probe and native React browser
reproduction both showed delayed account A replies replacing account B's
profile, admin display, project count and household access. The provider then
saved A's household-access result under B's cache key. This is a frontend
ownership failure; it does not demonstrate a server authorization bypass.

AccountAppBoundary now sits below the retained AuthProvider and above
PlanProvider/App. Changing the account or accepted sign-in lineage remounts that
account-owned tree, including cached tool views and project selection. Late A
setters target an unmounted provider; they cannot update B or run B's cache
persistence effect. A batched sign-out/sign-in to the same account also starts
fresh. Same-owner token refresh keeps its immutable scope, preserving typed
text and the mounted view. Durable draft ownership remains above the boundary.

Native React StrictMode checks with the actual boundary and PlanProvider passed
at desktop and 390x844. Sequence: hold A's replies, switch to B, release B's
replies, then A's; B remains non-admin, count zero, household access false, and
its cached boolean remains false. The unbounded baseline yields A/admin/count20
and cachedB=true. A child input survives same-owner token refresh without a
remount, resets on fresh same-account sign-in, and sign-out leaves empty profile
and access state. These are synthetic auth/HTTP fixtures, not physical Safari
or hosted identity evidence. The existing 757 tests, hook checks, lint and build
pass; independent boundary review found no blockers. No new SQL is required.

Remounting isolates React state/effects; it does not undo requests already sent
or fence every unrelated external side effect. Shopping's transport/completion
fences above separately address its queued work. This is not whole-app security
certification or a promise of secure erasure.

## Q09 retention and revocation assessment

| Case | Verified behavior and evidence |
| --- | --- |
| Explicit sign-out | AuthProvider revokes the capability before asynchronous cleanup. Legacy user caches and active identity/navigation are cleared; obsolete reads/completions cannot restore them. Storage failures can leave disk bytes. Cleanup regressions/native storage and Shopping lifecycle checks cover the boundary. |
| Direct A-to-B replacement | Account-owned provider/view state remounts; account/project cache keys remain separate. Old Shopping callbacks cannot dispatch with B's token or persist/acknowledge old work. Native metadata and queued-sync checks cover delayed completions. A's durable drafts remain retained for A. |
| Same-account refresh versus fresh sign-in | Refresh reuses the capability and preserves text/runtime; a sign-out/re-sign-in creates a fresh capability and tree. Existing shoppingDraftOwner and actual-hook tests cover stale acquired/unacquired callbacks and retained durable drafts; native boundary checks cover transient UI. |
| Offline/expired-session startup | Existing authBootstrap tests distinguish unresolved/error/timeout fallback from a resolved signed-out session and ensure sign-out wins over late bootstrap. AuthProvider permits cached-owner offline fallback, not remote write authority. A real authenticated token for the expected owner is required at Shopping dispatch. Reused bootstrap/transport tests; no new hosted expiry experiment. |
| Project membership removed while offline | Previously cached data/drafts can remain on the device until it reconnects; local state cannot know a remote revocation immediately. Server authorization determines reads/writes. Reused Q04 real removed-member evidence: reads returned zero rows, old add/edit replays and fresh adds returned PROJECT_ACCESS_REQUIRED. Those real-user results are separate from Q08 privileged metadata and local role tests. |
| Failed/uncertain queued write | Durable requests keep stable operation identity and retained retry evidence; feature-OFF legacy queue failures keep pending intent. Closed owners cannot continue or borrow another account's token. Already-dispatched writes can have committed and must use existing recovery/replay contracts, not assumed rollback. Existing journal/session/operation and Q09 lifecycle tests cover this. |

The three separately reproduced repairs complete the original bounded Q09
assessment. No retention expiry, global storage wipe or new deletion policy was
introduced. Continue Q10/Q11 in order; Q12 backup/restore remains explicitly
owner-waived/deferred, not verified.
