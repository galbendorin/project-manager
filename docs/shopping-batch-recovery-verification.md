# Q04-D input recovery verification

9 September 2026. This repair is suitable for source publication with `VITE_SHOPPING_DURABLE_CREATES` OFF. It does not authorize activating the new flow or applying SQL to production.

## Problem and change

A page closing during sequential grocery creation could lose the remaining input. A committed journal create followed by a timeout could instead restore fresh input and duplicate it on retry. Typed draft clearing also happened after batch acceptance, leaving a crash window that could resurrect accepted text.

The workspace now persists each complete owner/project-scoped input batch under stable operation IDs before acknowledging acceptance. Journal creation can resume after reopening, including offline; the batch remains until every creation is acknowledged. Network dispatch still requires the separate IndexedDB operation journal. Its immutable `initialDesired` permits an exact creation replay after subsequent edits without resetting those edits or acknowledgements.

Typed input uses immutable draft generations and per-tab pointers, with an origin-wide reopening fallback. Batch acceptance uses the draft generation as its identity. A completed batch retains acceptance evidence in the same atomic key, so hydration suppresses precisely that accepted generation even if React never cleared the entry box. A newer draft with the same words is independent. Failed rich inputs preserve operation IDs, quantity, unit, source and metadata through structured restoration.

Storage failure leaves input in the entry box or the retained batch and prevents premature acknowledgement. Strict JSON validation rejects lossy values. Owner and component-scope guards reject stale callbacks. With the flag OFF, normal typed input continues using the legacy plaintext draft.

## Evidence

- Full release preflight: **543 application tests pass**, hook import check, lint and production build pass. The existing voice hook dependency warning remains; no new lint warning.
- **79 native PostgreSQL tests pass** using disposable local PostgreSQL 18.3. The SQL migration itself is unchanged.
- Regression tests reopen during first/middle journal writes, retry a committed-create timeout after a later edit, reject storage denial before acknowledgement, and isolate batches across tabs/accounts. The timeout is injected at the controller boundary, not a delayed real IndexedDB transaction event.
- Actual typed-draft hook tests cover the persisted snapshot after acceptance and before React clearing, both before and after batch drain; newer identical text; separate existing tab pointers; failed persistence retry; and rich failed-input restoration through reopening.
- Actual ShoppingListView local browser fixture checked at **390×844 and 1440×1000**. A three-item batch survived reload while its first committed response was held, then appeared once per item. An unsent phone draft survived reload and submission. With journal writes deliberately denied, the full two-item batch appeared in the recovery panel, survived reload, and completed once per item after recovery; accepted text did not reappear. Desktop and phone entry controls, empty state and recovery panel were inspected. Full-page screenshot stitching showed browser-tool artifacts; DOM and ordinary viewport inspection supported the interaction checks.
- Independent read-only final review found no blocker to merging with the flag OFF. Multi-draft recovery, retention and staging remain activation gates.

Browser fixture uses synthetic data and mocked auth/data/voice/REST; journal, controller, input storage, actions and View are real. It is not an authenticated hosted smoke test or physical iPhone Safari/PWA test. The synthetic server represents missing quantities as zero; that is fixture behavior, not SQL verification. While a response is held, a server row and its pending projection can temporarily both be visible; this existing projection ambiguity remains a pre-activation UX item.

Local logs: `/private/tmp/pmw-q04-draft-final-preflight.log`, `/private/tmp/pmw-q04-batch-native.log`. No application dependency was added.

## Remaining activation gates

1. **Retention and draft recovery.** Immutable draft generations and accepted receipts currently accumulate. Add bounded, crash-safe cleanup without deleting unresolved inputs or acceptance evidence still referenced by drafts. After losing all tab sessions, only the latest origin fallback is surfaced; older unsent tab drafts remain stored but have no recovery UI. Do not claim recovery of all unsent drafts until this is designed and tested.
2. **Storage and UI.** New durable acceptance requires working localStorage and IndexedDB; structured drafts also require sessionStorage. Test denial/quota/eviction behavior on real iPhone Safari and Home Screen. Batch-only recovery is visible in its panel, but aggregate sync summaries still count journal records; include unresolved batch items without double counting and verify pending projection ambiguity before activation.
3. **Staging and permissions.** Apply the SQL in a separate verified test project, exercise real household/member/revocation flows and authenticated hosted smoke tests, then verify physical iPhone update/background/reopen behavior. Staging access and smoke credentials have not been available here.
4. **Controlled rollout.** Keep the new-create flag OFF until these gates pass. Preserve existing journal evidence on rollback. Review activation and recovery evidence before enabling production; publishing this source alone does not change the live server contract.
