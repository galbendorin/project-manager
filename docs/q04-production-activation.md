# Q04 production activation — 28 September 2026

## Release behavior

Shopping now uses the retained-draft editor and durable create/edit/cancel flow by default. Both the authenticated draft owner and Shopping screen use the same switch: unset or `VITE_SHOPPING_DURABLE_CREATES=true` enables it; `false`, empty or an unexpected value disables it. Authentication, household authorization and ordinary list selection are unchanged. Unsubmitted input remains available through Saved drafts; opening a page need not automatically select an old draft.

The release also renders Update ready on standalone tool routes, including Shopping, and handles a pending worker arriving between render and event subscription. Reload still waits for successful worker activation. The button has a 44px minimum touch height.

This branch starts at production `bf592123`, includes the product-only update fix from phone candidate commit54e8b96, and changes the two rollout defaults. It excludes preview PR69's list replacement, candidate banner, diagnostics and Vite override. No SQL, account membership, records or credentials are changed by this release. Contribution SQL was already applied by the owner; do not reapply it.

## Evidence used for activation

| Area | Evidence and boundary |
| --- | --- |
| Local concurrency, recovery and UI | Existing draft, journal, owner, handoff, migration, pending projection and editor suites; release CI passes698 tests, hooks, lint and production build. Default activation authenticates the owner before acquiring a writer; explicit OFF and unexpected flag values retain disabled behavior. |
| Existing Supabase project | Owner-applied SQL metadata postcheck passed. Actual signed-in owner/member/outsider/revoked-member checks, exact-operation replay, numeric merge/cancel, private-table denial and reload passed using labelled synthetic data. These were user-session requests, not admin authorization simulations. Evidence remains in the investigation's hosted verification record and checkpoint. |
| Uncertain accepted write during rollback | Native Chromium with hosted transport held an accepted response; compatible OFF recovered the exact operation with already_applied, one Kiwi row and no duplicate. Unsent Guava survived ON→OFF→ON. This is not a physical iPhone uncertain-write test. |
| Physical iPhone Safari | Owner confirmed loading, retained drafts through interruptions, offline pending rename/reconnect and offline cancellation/reconnect. Fresh authenticated reads corroborated one Offline pear, no peach/banana and retained earlier rows. |
| Physical Home Screen update | Candidate6 showed Update now. Owner reports normal opening after using it, with the original Home Screen draft restored by selection; supplied screenshot corroborates the returned text. No automatic editor restoration claim. |
| Physical compatible rollback | Owner confirmed candidate7 OFF loading with8test groceries retained, then candidate8 ON loading and recovery of the original saved Home Screen draft. Latest reply did not independently recount all rows. This verifies retained unsent input across rollback, not an uncertain queued phone write. |
| Default and OFF build verification | Default bundle includes the saved-draft editor; explicit-false build excludes it. Both use ordinary Shopping list selection and contain no candidate HTML/diagnostics. Native browser using actual App components and synthetic upstream services saved input with no feature override. Prior phone/desktop layout evidence is reused. |
| Review | Independent review found no release blocker: matching predicates, owner/account fencing, compatible OFF readers, update activation ordering and absence of preview controls. |
| Backup limitation | Owner explicitly waived backup/restore testing. Independent restoration is not verified. No backup was claimed from the failed pg_dump. |

All physical observations above are owner reports/screenshots. Browser fixtures and native database tests supplement them without being labelled physical-device certification. Generic restore testing remains outside the waived Q04 gate. Legacy data and uncertain input remain retained; no cleanup was added.

## Deployment and rollback

Merge only this clean activation PR after CI and preview deployments pass; never merge temporary PR69. Verify both production deployments and the live default editor bundle after merge, because a configured explicit-false Vercel value overrides the new default. If it remains OFF, record activation incomplete and resolve that configuration rather than claiming success from a merge alone.

To roll back, set `VITE_SHOPPING_DURABLE_CREATES=false` for production and redeploy this compatible source. If environment administration is unavailable, change the fallback `'true'` to `'false'` in both AuthContext and ShoppingListView, verify the OFF artifact and publish that narrow rollback. This disables new-flow entry while retaining compatible readers, journals, accepted batches and old draft evidence. Existing accepted work may still reconcile. Never downgrade to code pinning IndexedDB version1, clear Safari data or reinstall to hide a failure.

Post-deployment verification should use read-only production loading/artifact checks and reused hosted synthetic evidence. Do not insert test groceries into the owner's ordinary Shopping list. Keep PR69's separate synthetic preview available while the release is verified. Record exact release SHA, deployment results and any remaining access limitation in CHECKPOINT.md before moving to Q05.
