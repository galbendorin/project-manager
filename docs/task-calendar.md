# Personal Calendar

Calendar adds a Monday–Sunday 06:00–23:00 half-hour grid and selected-day task pool.
Desktop has a side pool; phones have a day strip and pool above a single-day grid.
Tasks stay in the pool after scheduling. Day membership is personal planned day,
or the genuine deadline when no personal day exists. Undated/unplanned tasks stay
in List/Matrix. Project, source, owner, recurrence and search filters apply;
Today/Tomorrow/bucket filters do not determine Calendar membership.

One private reservation per stable task identity uses the existing preference
row. Drag a card or its visible handle, resize the bottom edge, or use the time
editor with keyboard/touch. A fresh drop reserves 30 minutes; moving a reserved
task retains duration. Every block ends by23:00. Scheduling changes only personal
day/time, never deadline, recurrence or Matrix priority. Elapsed incomplete blocks
stay for manual replanning. Overlaps use side-by-side lanes and warnings, including
filter-hidden tasks within the explicit workspace scope.

`planned_start_minute` and `planned_duration_minutes` are nullable integer wall-clock
minutes, attached to `planned_day` in the browser's local calendar (same model as
existing personal planning; no timezone conversion or external calendar sync).
Day/time/duration save in one version-checked write. Day-only moves carry timing;
removing personal day clears timing on the server, including older clients.
Remove time clears timing only and keeps the confirmed day. Recurring follow-up
tasks do not inherit a time reservation automatically.

Reads/writes retain existing owner/access/key/version guards. A Calendar-only
schema probe disables Calendar writes if migration is missing without blocking
ordinary personal planning. Exact timing is included in acknowledgement, retry
and paired deadline/personal-day snapshots. Failed gesture/editor drafts persist
across closing and view changes while Tasks remains mounted. Reload/account
changes do not provide durable draft storage. Offline shows confirmed in-memory
data and disables writes; remote revocation is learned on reconnect.

Rollout: install `scripts/sql/2026-10-16_personal_task_calendar.sql` in the existing
project-manager Supabase project after local review, then run the accompanying
read-only verification query. Publish only after installation is confirmed.
Rollback to the previous client leaves additive columns harmless; do not remove
them or reapply prior migrations. Existing auth/RLS and production data stay intact.
