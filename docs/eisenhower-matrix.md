# Personal Eisenhower Matrix

Tasks has a fourth view, Matrix. Placements are private to the signed-in user.
They apply to manual project/Other tasks and stable source items from the plan,
registers and tracker. Assigning a quadrant changes personal priority only.

Do is Urgent & Important; Plan is Important, Not Urgent; Delegate is Urgent,
Not Important; Defer is neither. New unclassified tasks appear in Plan. Drag a
desktop handle or use Move to… on desktop, keyboard or phone. The phone view
stacks quadrants with count navigation; desktop uses a two-by-two grid.

An open task with a valid deadline earlier than the local calendar day appears
in Do automatically. Due today is not overdue until local midnight. Auto:
deadline passed explains a promotion; already-manual Do shows Overdue. An
overdue card cannot be moved out until completed or rescheduled. The saved manual
quadrant remains intact and returns when its date is extended or removed.
The app refreshes its shared calendar day at midnight and on focus/pageshow/
visibility resume, including daylight-saving transitions. No background writer
or invented historical movement timestamp is involved.

Matrix first entry uses All Work within current scope, preserving explicit
filters. It remembers personal Matrix focus and the previous view's focus.
Calendar presentation's hidden future months do not hide Matrix tasks. Existing
task details, checklist summaries and completion/Undo remain available.

## Database and access

Install `scripts/sql/2026-10-05_add_task_eisenhower_preferences.sql` once before
deploying the client. The owner reported this installation succeeded on 5 October
2026. This is owner-reported installation, not independent hosted authorization
evidence. The isolated SQL tests model current task/project access and exercise
the new table's actual policies and trigger.

`task_eisenhower_preferences` uses owner plus server-derived task key uniqueness,
immutable identity, server-stamped versions and version-checked updates. Manual
preferences follow their UUID through project changes; access is derived from
the task's current location. Derived keys include project and stable source key.
Owner-only RLS also requires current task/project access. Anonymous table access
is revoked. Foreign keys remove preferences on deletion of their parent.

Reads are batched to relevant keys and paginated with exact counts and stable
ordering. Duplicate/inconsistent responses fail visibly. Loads and callbacks
are fenced by owner/session; known task coverage survives task-set changes so
completion Undo is not hidden by background reloads. Writes require the intended
row, quadrant and next version. Conflicts keep the confirmed quadrant and offer
reload. The app does not silently treat unknown saved priorities as unclassified.

Offline mode retains in-memory confirmed placements and disables moves until
reconnect. No additional offline write queue is added. Remote revocation can only
be learned on reconnect. Legacy source rows without a stable ID and unsynced
manual tasks appear with deadline automation, but placement saving is unavailable
until they have a persistent source identity. External views do not read private
placements or allow priority writes.

## Export and verification

The household exporter writes format v2, including scoped Matrix preferences.
Out-of-scope shared-project preferences cause an explicit scope-gap refusal;
they are not silently omitted as complete recovery evidence. The verifier still
accepts original v1 backups. No old private backup was read or changed here.

Run `npm run ci`, the React regression suites with `TZ=Europe/London` and
`--experimental-vm-modules`, and the isolated
`scripts/investigations/eisenhower-sql.test.mjs` with `PGLITE_MODULE` pointing to
a local PGlite install. CI runs these plus existing Shopping smoke. Synthetic
browser checks cover responsive layout and interaction; phone-width checks
remain separate from physical Safari testing.

Rollback uses the previous client, which ignores the additive table. Do not
reapply unrelated earlier migrations or erase device/app data.
