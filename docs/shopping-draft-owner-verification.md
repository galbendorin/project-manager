# Authenticated draft owner verification

15 September 2026. R2c2b binds retained draft sessions to the actual AuthProvider lifetime above application routes. Based on production `a6e6b05`.

## Final behavior

`AuthProvider` now owns a storage-free `shoppingDraftOwner` manager. Its existing bootstrap, accepted-session, offline fallback and auth-event paths publish an immutable `shoppingDraftScope` capability. Same-user refresh preserves the capability and acquired writer. Sign-out or account replacement invalidates it immediately and closes both retained registry and journal, even when sign-out and same-account sign-in occur before React renders.

Only an enabled capability's `acquire()` creates the stable journal and registry. With the new-create flag OFF, even attempted acquisition rejects without constructing a journal. No legacy draft import, database upgrade, network request or draft write occurs just because AuthProvider mounts or accepts a user. A journal itself opens IndexedDB only when its methods need storage.

`useShoppingDraftRuntime` is the opt-in consumer for the next editor slice. It acquires from the current capability, exposes unavailable state/retry, fences old callbacks and detaches without closing the owner on route unmount. AuthProvider cleanup closes the owner; StrictMode replay publishes a fresh capability so consumers can reacquire instead of remaining stuck on a closed one.

Both ordinary sign-out and password-recovery sign-out now guard delayed success and device-cleanup completions. Those older completions cannot erase or revoke an intervening sign-in. This is an auth behavior correction beyond the inactive Shopping seam; it does not change which accounts can sign in or the existing offline fallback decision.

The actual Shopping View/Actions and typed editor are still unchanged. The new-create flag remains OFF; SQL remains unapplied.

## Verification

- `npm run ci`: **654 app tests**, React hook check, lint and production build pass. Only the pre-existing voice-hook lint warning remains. Log: `/private/tmp/pmw-draft-owner-preflight.log`.
- Seven owner-manager tests cover disabled/lazy acquisition, stable refresh, acquired/unacquired stale capabilities, A→B→A, owner closure, durable-vs-RAM recovery, observer reentrancy, construction failure and cleanup failure.
- Ten tests execute the actual AuthProvider body with actual auth bootstrap and deterministic hook slots. They cover online cached-user exclusion, offline cached-owner continuity, token refresh, immediate sign-out/account revocation before render, effect replay, sign-out failure, and delayed response/cleanup after intervening sign-in for both sign-out methods.
- Two actual runtime-hook tests cover flag gating, navigation retention, scope callback fences, acquisition error and explicit retry. Existing session/registry suites remain part of the full run.
- Independent review found no implementation blocker. Initial review independently ran35 owner/AuthProvider/bootstrap/registry tests; final review includes the consumer and browser evidence.
- Native browser fixture uses the **actual AuthProvider, auth bootstrap, runtime hook, session hook and React StrictMode**. Only Supabase/auth cache are synthetic, and the journal wrapper injects write failure around native IndexedDB. No credentials, real accounts or production data are used.
- Online start: failed Oat milk survived leaving/returning to Shopping and same-user refresh with the original draft ID; one writer constructed, none closed. Sign-out followed by sign-in to A in one event handler invalidated the previous capability and produced a fresh draft identity: two writers, one closed. Switching to B again rejected the previous capability and displayed empty input. Sign-out closed all three acquired writers.
- Explicit simulated-offline start: the fixture replaces only the provider's offline indicator. Recorded `setup:owner-a:capability`, cleanup, setup and two constructed writers with one closed, proving actual StrictMode reacquisition. The new capability saved Offline milk and preserved it across editor remount. Final sign-out closed both writers. This is not a physical offline/device test. An earlier Vite define attempt left the indicator online; it is excluded from this offline evidence.
- Browser tabs and fixture server closed. Synthetic native IndexedDB data may remain at localhost52230. No full Shopping editor UI, authenticated hosted journey, deployed policy or physical iPhone claim.

Reproduce the fixture with `node scripts/investigations/shopping-draft-owner-browser/server.mjs`; add `--offline` for the explicit offline-indicator simulation. Restart the fixture server after changes to ensure transformed modules are refreshed. Use its visible fault, auth, navigation and writer-lifetime controls.

## Next integration

Connect the actual typed editor to `useShoppingDraftRuntime` and `useShoppingDraftSession`. Combine stored picker entries with retained RAM; validate/normalize rich groceries before atomic acceptance; hand accepted batches directly to recovery; retain visible voice/Add again failure recovery and distinguish unknown/conflict/not-submitted results without new operation IDs. Never mount the enabled legacy initializer behind the transactional editor. Handle capacity and acquisition errors. Actual View/Actions concurrency/navigation/reload tests and phone/desktop UI verification still precede activation, followed by migration/staging permissions and physical iPhone checks.

RAM retention applies only within the current owner runtime. It deliberately does not transfer RAM after sign-out, and it cannot preserve an unpersisted draft through process loss or storage eviction. Durable recovery remains scoped to the original owner in IndexedDB.
