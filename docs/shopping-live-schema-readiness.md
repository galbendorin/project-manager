# Q04 existing database readiness

22 September 2026. Production source `c7bbc619236e07a04cc6802f5944ced8c418f22c`; candidate branch `codex/shopping-activation-readiness`.

The owner explicitly chose the existing Supabase project. No separate hosted project is required. These checks used the signed-in dashboard SQL editor for `project-manager` / `jbmcmtzizlckhgpogbev`, main Production. Queries were catalog-only SELECTs inside `BEGIN READ ONLY; ... COMMIT;`. No application rows, credentials, grants, schema or rollout settings were changed. One editor replacement initially left preceding query text and produced a syntax error; clearing the editor and rerunning corrected it. Only successful results below count as evidence.

## Confirmed prerequisites and differences

| Check | Observed result | Implication |
| --- | --- | --- |
| Existing tables | `projects`, `project_members`, `manual_todos`, `shopping_list_operation_receipts` exist with RLS enabled | Necessary prerequisites exist; RLS enablement alone does not prove permission behavior |
| Contribution objects | No `shopping_contributions`, `shopping_contribution_intents`, v3/reconcile RPCs or `shopping_revision` column | Contribution migration has not been installed |
| Existing add RPC | v2 has the expected eight arguments and is owned by postgres, SECURITY DEFINER, `search_path=public` | Preserve older authenticated clients when replacing it |
| v2 body comparison | Live and July15 source have whitespace-stripped MD5 `9d428be9573d31deb64a3d84a8532d6b`; original whitespace differs | Reviewed body matches the older contract apart from whitespace; this is not a full schema fingerprint |
| v2 explicit ACL | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `REVOKE ... FROM PUBLIC` alone leaves anon's direct grant |
| Receipt access | anon SELECT false; authenticated SELECT/INSERT/UPDATE/DELETE false; no receipt RLS policies in the inspected catalog | Existing browser table access is restricted; do not expose it for testing |
| Normal table grants | anon SELECT true; authenticated CRUD true on manual todos and project members | Access relies on RLS helpers; table grants alone do not establish data exposure |
| Todo policies | SELECT/DELETE use `can_access_manual_todo`; INSERT uses `can_insert_manual_todo`; UPDATE uses `can_access_manual_todo` and `can_update_manual_todo` | Hosted behavioral checks remain necessary |
| Membership policies | Owner insert/delete; owner or subject select; only editor role allowed | No separate read-only membership role was observed |
| Project access helper | Non-null subject AND (`is_project_owner` OR `is_project_member`); member helper checks matching project/user | Consistent with the contribution lock helper's intended membership rule; not a real-token test |
| Todo defaults | UUID id; Open status; empty owner/description/unit/source; `{}` meta; zero kanban position; timestamp defaults | New contribution inserts can omit these fields |
| Extra todo fields | `description`, `kanban_column_id`, `kanban_position` exist in production | Original minimal native fixture is not a complete deployed schema clone |
| Todo relationships | User/project/assignee, source batch and kanban column FKs; Open/Done status constraint | Test ordinary todo compatibility and existing metadata when rehearsing migration |
| Todo triggers | No non-internal triggers returned | New revision trigger introduces behavior on all manual todos, not just Shopping |

The live v2 function checks for a null `auth.uid()` before reading receipts or writing. The anonymous EXECUTE grant is an unnecessary permission, **not evidence that anonymous writes succeeded**. Existing replay checks and their pending contribution-migration hardening remain separately covered by the SQL suite.

## Narrow candidate correction

The September7 migration now revokes PUBLIC, anon and authenticated EXECUTE on v2, then restores authenticated EXECUTE. PostgreSQL retains old explicit grants during CREATE OR REPLACE; this removes anon while leaving the pre-existing service_role grant intact. v3 and private helpers already use explicit role revocations.

The isolated native fixture now seeds direct default function grants for anon, authenticated and service_role, matching the relevant observed ACL condition. The permissions test checks actual anonymous v2 invocation fails at the privilege boundary and asserts anon=false, authenticated=true, service_role=true. Existing v2 behavior, replay and concurrency tests continue to exercise legitimate callers. This is an isolated loopback PostgreSQL cluster and accepts no external database URL.

Before the SQL correction, the new behavioral assertion failed with `AUTHENTICATION_REQUIRED` instead of `permission denied`, reproducing the retained-grant issue. Logs: `/private/tmp/pmw-q04-live-acl-before.log`; final suite: `/private/tmp/pmw-q04-live-acl-after.log`; build: `/private/tmp/pmw-q04-readiness-build.log`. Independent review approved the narrow correction and requested the explicit legitimate-role assertions, which were added. No hosted migration or RPC behavior is claimed from this local result.

Final verification: **79/79 native PostgreSQL tests pass**, including the role assertions and existing v2/replay/concurrency tests; `npm run build`, targeted ESLint and `git diff --check` pass. Client UI was unchanged, so prior661-test/editor evidence was reused rather than rerun. This candidate has not been pushed, deployed or applied to the live database.

## Backup boundary

The existing project dashboard states that its Free plan does not include project backups. No upgrade or account change was made. The repository's `scripts/backup_projects.cjs` exports selected `projects` columns only; it omits manual todos, Shopping receipts, memberships, related meal/batch tables, function definitions and grants. Its output is not sufficient for this migration. No new backup has been taken or restoration proved in this run.

Before live SQL, establish a recoverable snapshot of affected data and schema, including the old v2 definition/ACL, and verify the restoration method in an isolated local database. Do not request passwords in chat, reset credentials, or treat a schema-only export as a data backup. Restore a rehearsal locally; do not restore over live user data. Completing the product-wide backup audit remains Q12.

## Remaining activation work

1. Complete the legacy draft review/recovery journey, mixed-version rollback checks, and batch summary/projection behavior together in this activation candidate.
2. Establish the migration-specific backup and rehearse against the affected deployed schema, including extra todo fields and observed grants.
3. Apply the verified migration to the existing project under the owner's authorization, with labelled synthetic records for hosted checks. Preserve real records and keep new-create OFF until evidence passes.
4. Run authenticated hosted Shopping/permission checks and actual iPhone Safari/Home Screen lifecycle checks. Admin catalog inspection is not equivalent to real user-token tests.

Do not publish this as another standalone foundation release, mark Q04 complete, or begin Q05 from these results.
