# Draft navigation retention verification

15 September 2026. R2c2a closes the draft-session lifetime gap before editor integration. Based on production `b958122`.

## Change and scope

The previous unused `useShoppingDraftSession` owned and closed its session on every project/draft change and component unmount. Failed saves could leave the newest text only in RAM; closing discarded that text and the exact pending write or uncertain acceptance context.

`createShoppingDraftRegistry` retains one session per project/draft under a stable authenticated owner. Editor attachments only subscribe/detach. Navigation does not reread an older head, allocate a replacement submission, abandon an in-flight save, or rely on asynchronous React cleanup. Default and explicit selection resolve to the same lineage; separately created drafts remain independent. `list(projectId)` exposes retained RAM snapshots, including drafts absent from storage after a failed first write.

The hook now requires this registry, fences old callbacks and late async results after navigation, and surfaces attachment failures as disabled state. Each subscriber receives independent snapshots; a publication revision prevents nested edits from delivering older text afterward. Closing clears session-held pending requests and submission references and publishes an empty, closed editor.

The registry permits at most 100 retained sessions by default. At capacity it rejects new lineages without evicting existing input. This bounds session count, not payload bytes or IndexedDB history. No retirement policy is introduced.

**No production View, Actions, auth provider, route, SQL or feature flag is changed.** This hook remains an opt-in integration seam. The existing draft-session browser fixture was adapted to its new registry dependency.

## Verification

- `npm run ci`: **635 app tests**, React hook check, lint and production build pass. Only the existing voice-hook lint warning remains. Log: `/private/tmp/pmw-draft-navigation-preflight.log`.
- Fourteen registry regressions cover failed/held writes, newer RAM, list/draft navigation, unknown acceptance and exact retry after compaction, observer isolation/reentrancy, capacity, identity collisions, recovery failure and owner closure.
- Four actual-hook regressions cover project changes, full component remount, draft selection, unknown acceptance, late completion rejection, auth closure and attachment error presentation. Targeted log: `/private/tmp/pmw-draft-navigation-tests.log`.
- Independent reviewer reproduced nested observer publication regression; repaired with a regression. Final review found no blocker for this inactive seam and independently passed 47 registry/hook/session tests.
- Native IndexedDB with the actual React hook in StrictMode: synthetic fixture at `http://127.0.0.1:52228/`; failed Oat milk remained present after editor leave/return and Home→Trip→Home. Trip's Bread remained separate. Storage inspection showed the Home draft existed only in RAM while storage writes failed. Allowing writes and retrying preserved its identity and rich fields.
- Acceptance was committed and then its completion deliberately lost. After creating a separate Rice draft, selecting Oat milk and remounting the editor, the original submission remained locked. Exact retry produced one accepted Oat milk batch while Rice remained separately saved. Inspected screenshots at 390 and 1200 content widths; these are fixture content widths, not an iPhone viewport or full Shopping UI verification.
- Owner closure while a fresh reload was opening produced a disabled empty editor. Synthetic storage may remain on this dedicated localhost origin; no production household data was used.
- A separate complete reload restored Oat milk as accepted with the original draft/operation identity. Browser tabs and fixture server were closed after verification.

Reproduce: `node scripts/investigations/shopping-draft-navigation-browser/server.mjs`, then use the clearly labelled fault, navigation, retained-draft and record-inspection controls. Its owner runtime sits above Editor; it does not implement the production auth lifecycle.

## Required before activation

1. Create the stable registry/journal at authenticated-owner lifetime above routes, and explicitly close both on sign-out or session replacement. A pull-only owner getter cannot observe an A→B→A transition between reads. Do not tie that getter to project or editor mount state, and do not replace the repository under retained sessions.
2. Connect the actual typed editor and picker, combining persisted drafts with retained RAM without replacing newer failed input. Surface registry capacity/attachment errors with recovery of existing drafts.
3. Validate and normalize rich input before atomic acceptance, then hand accepted batches directly to recovery. Preserve voice/Add again failure recovery; never let uncertain text become fresh operation IDs or mount the enabled legacy initializer behind the new editor.
4. Gate final View/Actions navigation, reload, concurrent acceptance, delayed failures and phone/desktop interaction. R3 migration, staging permissions and physical iPhone lifecycle checks remain.

RAM preservation covers in-app navigation within the same owner runtime. Browser/process loss or origin-storage eviction while persistence is failing remains outside this guarantee; the product must accurately present unsaved state before activation. No new localStorage fallback, cross-owner RAM recovery or network authority is added.
