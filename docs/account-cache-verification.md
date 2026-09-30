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

## Remaining Q09 assessment

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

## Remaining Q09 assessment

Verify delayed plan metadata, cached tool mounting, expired-session fallback and
membership revocation. Existing durable
Shopping owner, transport and registry tests and Q04 real-user revocation
evidence should be reused. A source suspicion is not a reproduced failure.
Offline data already cached on a device cannot learn about a remote revocation
until reconnection; server authorization remains authoritative for writes.

This bounded cleanup repair alone does not mark all Q09 complete. Preserve the
original Q09/Q10/Q11 order and the owner-waived Q12 backup/restore scope.
