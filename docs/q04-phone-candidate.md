# Q04 phone verification candidate — do not merge

## Candidate 6 update notice fix

The 28 September 14:22 physical screenshot confirms an installed waiting worker on the Home Screen Shopping page. App omitted its update notice from the standalone-tool route branch. Candidate6 includes the route fix and mount/subscription race check described in `update-notice-verification.md`. It uses a new diagnostic asset URL to avoid the stale candidate4 diagnostic being shown alongside candidate5 HTML. The diagnostic label identifies its own version.

The old loaded App cannot render the corrected notice until it loads the new JavaScript. After deployment, close Q04 Test fully and reopen once, retain the saved draft and confirm candidate6. This bootstrap step is not an update-prompt pass. If an update is waiting, use Update now and verify the retained draft; otherwise prepare one subsequent same-origin marker update while the fixed candidate remains loaded. Public production remains OFF; this temporary preview branch must not be merged.

## Candidate 4 diagnostic (historical)

Physical Home Screen testing stayed on candidate2 with a retained draft and no update prompt, including a repeat with20seconds in the background and30seconds after returning. The cause is unconfirmed. Candidate4 adds a collapsible **Q04 update check** section only to this preview. **Check update** shows browser/standalone mode, online state, worker states, the HTTP status/content type of `/sw.js`, worker version, bounded update-check results and worker state transitions. It neither activates workers nor reloads pages. It does not inspect credentials, user records, browser storage or cookies; it writes no application data. No registration is created by the diagnostic itself.

The current installed page cannot show newly added diagnostics until it loads the new document. After deployment, a deliberate full close/reopen of the test shortcut can load that document while retaining the saved draft. Treat that as diagnosis, not as proof the missing update prompt works. If candidate2 persists, stop and record it. Never clear site data, uninstall the shortcut or disable deployment protection to force a result.

Local real-browser validation on a production build confirmed an active controller, HTTP200 JavaScript worker response, parsed worker version and successful manual check. This local fixture intentionally lacks Supabase config; it verifies the independent update diagnostics only, not authenticated Shopping. Product startup/update source is unchanged.

This branch prepares a separate HTTPS preview for the remaining Q04 iPhone checks. It is not a production activation or a new product milestone.

Only Vercel **preview** builds of `codex/q04-phone-candidate` enable durable Shopping creates. The same preview replaces Shopping's list name with `Q04 TEST - hosted verification` and displays a visible test banner. All other builds, including production builds of this branch, retain their existing flag configuration and normal list name. Source changes to the expected list declaration fail the preview build instead of losing isolation silently. Existing Supabase authentication and authorization remain in effect; no credentials or database changes are included.

Use Shopping only on this candidate. Other tools still use the account's ordinary data. Do not merge this branch; activation will be a separate reviewed decision after the remaining gates pass.

## Evidence already obtained

Current product base `bf592123`: actual authenticated owner create, pending edit/cancel, lost-response exact retry, member/outsider checks, cross-user operation isolation, numeric merge/cancel4→6→4 and post-removal read/write/replay denial pass against the existing Supabase project, using a labelled synthetic list. Owner sharing shows zero editors. The removed account reads zero rows and receives PROJECT_ACCESS_REQUIRED on old add/edit replays and a fresh add.

On27 September, local candidate operation `ed19f7a8-b321-4a55-a7d5-bcc39e31ea59` saved Q04 TEST Rollback Kiwi to the hosted database; the test wrapper held its success confirmation. The tab closed without releasing it. The same origin reopened on compatible source with the flag OFF, replayed the original operation and received already_applied. Fresh read showed one row `a71eca4c-ba3e-4c90-868e-d686b5cf4c55`, with the prior five rows unchanged. Re-enabling the candidate preserved the unsubmitted Q04 TEST Unsent Guava draft in Saved drafts; selecting it restored its exact text. This proves native Chromium storage recovery with hosted reconciliation, not a physical Safari or deployed service-worker update.

Verification of this preview-only build change: production and candidate builds pass; ESLint and diff checks pass. Four configuration cases prove activation only for the exact preview/branch pair. The normal build retains its ordinary Shopping list; the candidate build contains the test banner and isolated list name. No prior application tests were repeated for unchanged product behavior; CI verifies the submitted branch.

## Remaining physical-device session

Record iOS version and whether the candidate is opened in Safari or as a separate Home Screen shortcut. Keep the existing production shortcut and Safari data intact.

1. Sign into the candidate using the ordinary owner account. Confirm the test banner and list name. Saved synthetic groceries should load.
2. Type Q04 TEST Phone draft, background Safari, lock/unlock and return; close/reopen and recover the draft from Saved drafts if needed.
3. With the candidate loaded, disconnect Wi-Fi/mobile data. Add Q04 TEST Phone apple, edit the pending name, and add then cancel another labelled item. Reopen while disconnected if available; record behavior without clearing storage.
4. Reconnect. Confirm one renamed item and no cancelled item; a fresh signed-in browser read must corroborate the rows.
5. Check keyboard visibility, touch actions, draft selection and retry text. There should be no horizontal page overflow or inaccessible Add button.
6. For update evidence, keep the same candidate origin/shortcut and stored draft while a second verified preview is deployed. Accept its update prompt, reopen and confirm rendering and retained data. Test the compatible feature-OFF update on that same origin; do not reinstall or clear storage.

If Vercel deployment protection requires sign-in, use the owner's normal Vercel login. Do not disable protection or share tokens to avoid it. Public production remains OFF until the required evidence is recorded.
