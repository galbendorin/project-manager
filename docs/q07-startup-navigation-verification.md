# Q07 — preserve Shopping through startup

25 September 2026. A reproducible startup race discarded `/shopping` before the saved login and household access finished loading. It also discarded a saved Shopping destination when opening the Home Screen start URL `/`. This explains a return to Projects after reopening, not the owner's unconfirmed physical iPhone blank-screen failure.

The household redirect now waits for signed-in, settled auth. The plan provider also reports loading during the first render for a newly restored user, before its effects start that user's access requests. Without the second change, the previous signed-out `loading=false` value still allowed a premature redirect. Once authenticated access resolves to denied, the normal redirect still applies.

## Evidence

- Four regressions execute the actual App routing effects and PlanProvider, with child-before-parent effect scheduling and deferred backend responses. Before the fix, direct launch, saved Home Screen destination and signed-out sign-in destination failed. With only the auth guard, both restored-user cases still failed at the first signed-in render. With both changes all four pass, including resolved denial.
- The browser fixture uses actual React StrictMode, AuthProvider, PlanProvider and App, with synthetic session/access responses and labelled page stubs. A delayed login retains `/shopping`; delayed access shows the workspace loading state, then the Shopping stub. A root launch restores Shopping from saved navigation. Settled denial returns to the Projects stub at `/`. Checked at the default desktop viewport and 390×844. Deliberately delayed login produced the expected auth-timeout warning; no browser errors were observed.
- `npm run release:preflight -- --skip-smoke` passes: hook imports, lint with the existing voice-hook warning, **687 application tests**, and production build. `git diff --check` passes. Independent code review found no blocking issue.

Run the synthetic browser fixture with `node scripts/investigations/startup-navigation-browser/server.mjs`, then open `http://127.0.0.1:52307/shopping`. Resolve sign-in first, then allow or deny tools. Restart buttons cover direct and saved Home Screen paths. The fixture never uses a live Supabase client; its controls modify only synthetic localhost state.

## Limits and phone follow-up

This verifies startup navigation and preserves existing authorization behavior. It does not establish that the original iPhone blank-page issue is resolved. The earlier service-worker/bootstrap repairs and their saved evidence remain unchanged. Do not clear the affected phone's storage or reinstall the app. On the actual iPhone, check the existing Home Screen installation and normal Safari after an update, reopen and background/resume; record iOS version and whether a blank page still occurs. Q04 remains parked with its new flow OFF and its already-applied SQL intact.
