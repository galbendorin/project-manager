# Q04 pending Shopping presentation: local visual check

Verified 24 September 2026 on branch `codex/shopping-legacy-recovery` at `b5b74ef`. This check used `scripts/investigations/shopping-editor-browser/`, which mounts the actual Shopping view, actions, auth provider and native IndexedDB with isolated synthetic upstream adapters. No production request or data was involved. No source change was needed.

At a 390 × 844 browser viewport, the Home list displayed 11 durable pending groceries below the **Saved changes** divider. The explanation said they were saved on this device and would join the shared list after sync. Each item showed **Pending addition**, its title and quantity where present, and available Bought/More actions. The quick-add status and list summary both reported 11 pending changes. No horizontal overflow or clipped item controls was seen. The separate empty Weekend list showed zero pending items and no Home-list grocery.

At 1365 × 900, the divider, counts, badges and Edit/Delete actions remained readable in the desktop list. The synthetic bought Yoghurt row stayed under **Bought**, while a distinct pending Yoghurt addition stayed under **Saved changes**; the interface did not merge them by title. The document width matched the viewport at both sizes. The browser error/warning log was empty.

This is a desktop Chromium responsive check, not physical iPhone Safari, hosted Supabase authorization or deployed behavior. It does not prove server reconciliation. Q04's migration backup/restore step is deferred by the owner; the new Shopping flow remains OFF and its SQL unapplied. Continue other independent Q04 checks, then complete backup/restore, hosted permissions/flow and real iPhone lifecycle before activation.
