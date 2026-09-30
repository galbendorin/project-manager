# Core Shopping release smoke (Q11)

Run `npm run smoke:shopping` after `npm ci`. Install its browser once with
`npx playwright-core install chromium`, or set `SMOKE_BROWSER_PATH` to a local
Chrome/Chromium executable. No account credentials, Supabase secrets, production
project or database setup is needed. The runner starts/stops its own loopback
Vite fixture and checks fresh browser contexts at 390×844 and 1280×720.

The fixture imports the actual `ShoppingListView`, panels, data/action hooks,
transactional editor, journal, registry and workspace. Native IndexedDB saves
the typed draft and accepted operation. Synthetic auth supplies a fresh labelled
owner per page; an in-memory service replaces reads, writes and contribution RPC
responses. Push and live update services are disabled. External network requests
are blocked; environment files are not loaded. The fixture is under `scripts/`,
outside the production entry and bundle. No product/API/SQL/RLS changes.

The shared journey opens Shopping, adds **Q11 synthetic milk**, waits for one
persisted row, edits its name, injects a failed check-off, verifies the grocery
and useful Retry message remain, retries through the real button and confirms
exactly one completed row with the edited name in Bought. It checks service
evidence as well as visible UI, so an optimistic row alone does not pass.

Reports and screenshots go to `tmp/shopping-smoke/` (override with
`SHOPPING_SMOKE_OUTPUT`). Failed runs also save fixture HTML. Each JSON report
lists passed/failed steps and durations. An unavailable browser or fixture is
`unavailable`, exits nonzero and never counts as passed or skipped. Reports do
not contain credentials or browser exception dumps. Each run uses its own
synthetic account/context; closing the context removes its local browser state.

`npm run smoke:shopping -- --prove-failure` leaves check-off failing. Success for
this negative control means **both journeys fail at retry-check-off**; reports
remain `failed` with `expectedFailure: true`. Other failures/unavailability are
not accepted as proof. Use a separate output directory to retain normal evidence.

CI runs the normal journey and this negative control after tests/build, installs
Chromium and uploads both reports/screenshots on success or failure. The older
`smoke:user` / `smoke:local` navigation smoke remains unchanged; an authenticated
path skipped by that runner is not a passed Q11 journey.

For interactive investigation, run `node scripts/shopping-smoke/server.mjs` and
open its printed localhost URL. Controls in the synthetic header arm one failed
save or persistent failure. Reload starts a fresh synthetic account and service.
The exported `runShoppingJourney` also accepts the supported in-app browser's
locator API and a `goto` wrapper, enabling the same steps without launching a
separate browser. Do not aim it at a hosted app: non-loopback URLs are refused.

Scope: repeatable production-source UI/storage regression evidence. Synthetic
auth/transport is **not** hosted authorization, database/RLS, physical Safari,
realtime collaboration, offline recovery, or whole-app certification. Reuse the
earlier Q04/Q07/Q08/Q09 evidence for those independently completed gates. Q10's
physical iPhone check passed by owner report. Q12 backup/restore remains
owner-waived/deferred, not independently verified.
