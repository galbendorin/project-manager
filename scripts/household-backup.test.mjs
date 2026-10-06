import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { coveredTables, exportSql, identifier, columnType } from './household-backup.mjs';
import { verifyBackup } from './verify-household-restore.mjs';

const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const owner = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const item = '33333333-3333-4333-8333-333333333333';
const parent = '44444444-4444-4444-8444-444444444444';
let bundle;

test('read-only export independently restores exact bigint, decimal, JSON and relationships', async () => {
  const source = new PGlite();
  try {
    await source.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY)');
    for (const name of coveredTables) {
      const extra = {
        projects: ', tasks jsonb, version bigint',
        manual_todos: ', project_id uuid REFERENCES public.projects(id), title text, quantity_value numeric, shopping_revision bigint',
        task_card_checklists: ', project_id uuid REFERENCES public.projects(id)',
        task_eisenhower_preferences: ', project_id uuid REFERENCES public.projects(id), manual_todo_id uuid REFERENCES public.manual_todos(id), task_key text, manual_quadrant text',
        task_card_checklist_items: ', project_id uuid REFERENCES public.projects(id), checklist_id uuid, checked boolean',
        meal_library_ingredients: ', meal_id uuid', meal_library_meals: ', shopping_project_id uuid',
        shopping_contributions: ', operation_id uuid UNIQUE, project_id uuid',
        shopping_contribution_intents: ', operation_id uuid, intent_id uuid',
        weekly_timesheet_entries: ', project_id uuid, timesheet_id uuid', finance_household_members: ', owner_user_id uuid',
      }[name] || '';
      // projects must exist before dependent tables in the fixture's creation order.
      if (name === 'projects') continue;
      await source.exec(`CREATE TABLE public.${identifier(name)}(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id)${extra.replaceAll(' REFERENCES public.projects(id)','')})`);
    }
    await source.exec('CREATE TABLE public.projects(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),tasks jsonb,version bigint)');
    for (const name of ['manual_todos','task_card_checklists','task_card_checklist_items']) {
      await source.exec(`ALTER TABLE public.${name} ADD FOREIGN KEY(project_id) REFERENCES public.projects(id)`);
    }
    await source.exec('ALTER TABLE public.task_card_checklist_items ADD FOREIGN KEY(checklist_id) REFERENCES public.task_card_checklists(id)');
    await source.query('INSERT INTO auth.users VALUES ($1)',[owner]);
    await source.query(`INSERT INTO public.projects VALUES ($1,$2,$3::jsonb,9007199254740993)`,[project,owner,'[{"title":"Cumpărături","done":false,"amount":9007199254740993}]']);
    await source.query(`INSERT INTO public.manual_todos VALUES ($1,$2,$3,'Lapte',123456789.123456789,9007199254740993)`,[item,owner,project]);
    const link = { version: 1, projectId: project, taskId: 1, sourceKind: 'manual', sourceId: item, sourceKey: `manual:${item}`, operationId: parent, originalDeadline: '2026-10-02' };
    await source.exec('ALTER TABLE public.manual_todos ADD COLUMN meta jsonb; ALTER TABLE public.projects ADD COLUMN registers jsonb; ALTER TABLE public.projects ADD COLUMN tracker jsonb');
    await source.query("UPDATE public.projects SET tasks=jsonb_set(tasks,'{0,originRef}',$1::jsonb),registers=$2::jsonb,tracker=$3::jsonb", [JSON.stringify(link), JSON.stringify({ actions: [{ _id: 'retained-action', projectPlanOperationIds: [parent], projectPlanLastLink: link }] }), JSON.stringify([{ _id: 'retained-tracker', projectPlanLastReturn: { operationId: parent, link }, dueDate: '2026-10-14' }])]);
    await source.query('UPDATE public.manual_todos SET meta=$1::jsonb', [JSON.stringify({ projectPlanLink: link, projectPlanOperationIds: [parent], retainedNote: 'Original notes' })]);
    await source.query('INSERT INTO public.profiles(id,user_id) VALUES ($1,$1)',[owner]);
    await source.query('INSERT INTO public.task_card_checklists VALUES ($1,$2,$3)',[parent,owner,project]);
    await source.query('INSERT INTO public.task_card_checklist_items VALUES ($1,$2,$3,$4,true)',[item,owner,project,parent]);
    await source.exec('ALTER TABLE public.task_eisenhower_preferences ADD COLUMN planned_day date');
    await source.query("INSERT INTO public.task_eisenhower_preferences(id,user_id,manual_todo_id,task_key,manual_quadrant,planned_day) VALUES($1,$2,$3,$4,'urgent_important','2026-10-05')",[item,owner,item,`manual:${item}`]);
    const tables = (await source.query(`SELECT c.relname AS name,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('kind',con.contype,'columns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.num),'parent_schema',pn.nspname,'parent_table',pc.relname,'parent_columns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.num))), '[]'::jsonb) FROM pg_constraint con LEFT JOIN pg_class pc ON pc.oid=con.confrelid LEFT JOIN pg_namespace pn ON pn.oid=pc.relnamespace WHERE con.conrelid=c.oid) AS constraints
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`)).rows;
    const sql = exportSql({tables},owner);
    assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
    const result = await source.exec(sql);
    bundle = result.flatMap(r=>r.rows).find(r=>r.household_backup)?.household_backup;
    assert.ok(bundle);
    assert.match(bundle.tables.find(t=>t.name==='task_eisenhower_preferences').rows_json, /2026-10-05/);
    assert.match(bundle.tables.find(t=>t.name==='manual_todos').rows_json,/9007199254740993/);
    assert.match(bundle.tables.find(t=>t.name==='manual_todos').rows_json,/123456789\.123456789/);
    const report = await verifyBackup(bundle,()=>new PGlite());
    assert.equal(report.status,'passed');
    assert.equal(report.totalRows,7);
    assert.ok(report.relationships>4);
    const legacy=structuredClone(bundle);legacy.format='pmw-household-v1';
    legacy.tables=legacy.tables.filter(t=>t.name!=='task_eisenhower_preferences');
    legacy.schema=legacy.schema.filter(t=>t.name!=='task_eisenhower_preferences');
    assert.equal((await verifyBackup(legacy,()=>new PGlite())).totalRows,6);
    // A shared-project entry cannot silently disappear from an owned timesheet.
    const otherOwner = '55555555-5555-4555-8555-555555555555';
    const externalProject = '66666666-6666-4666-8666-666666666666';
    await source.query('INSERT INTO auth.users VALUES ($1)',[otherOwner]);
    await source.query('INSERT INTO public.projects(id,user_id) VALUES ($1,$2)',[externalProject,otherOwner]);
    await source.query("INSERT INTO public.task_eisenhower_preferences(id,user_id,project_id,task_key,manual_quadrant) VALUES($1,$2,$3,$4,'urgent_important')",[parent,owner,externalProject,`project:${externalProject}:schedule:1`]);
    const matrixPartial=(await source.exec(sql)).flatMap(r=>r.rows).find(r=>r.household_backup).household_backup;
    assert.equal(matrixPartial.scope_gaps.matrix_preferences_outside_owned_scope,1);
    await assert.rejects(verifyBackup(matrixPartial,()=>new PGlite()),/matrix preference scope/);
    await source.query('DELETE FROM public.task_eisenhower_preferences WHERE id=$1',[parent]);
    await source.query('INSERT INTO public.weekly_timesheets(id,user_id) VALUES ($1,$2)',[parent,owner]);
    await source.query('INSERT INTO public.weekly_timesheet_entries(id,user_id,project_id,timesheet_id) VALUES ($1,$2,$3,$4)',[item,owner,externalProject,parent]);
    const partialResults = await source.exec(sql);
    const partialExport = partialResults.flatMap(r=>r.rows).find(r=>r.household_backup).household_backup;
    assert.equal(partialExport.scope_gaps.timesheet_entries_outside_owned_projects,1);
    await assert.rejects(verifyBackup(partialExport,()=>new PGlite()),/Incomplete timesheet scope/);
  } finally { await source.close(); }
});

test('changed content, omitted tables and orphaned relationships cannot pass', async () => {
  assert.ok(bundle,'roundtrip fixture must complete');
  const changed = structuredClone(bundle);
  changed.tables.find(t=>t.name==='manual_todos').rows_json = changed.tables.find(t=>t.name==='manual_todos').rows_json.replace('Lapte','Altered');
  await assert.rejects(verifyBackup(changed,()=>new PGlite()),/Content\/count mismatch/);
  const missing = structuredClone(bundle);
  missing.tables.pop();
  await assert.rejects(verifyBackup(missing,()=>new PGlite()),/Incomplete/);
  const partial = structuredClone(bundle);
  partial.scope_gaps.timesheet_entries_outside_owned_projects = 1;
  await assert.rejects(verifyBackup(partial,()=>new PGlite()),/Incomplete timesheet scope/);
  const orphan = structuredClone(bundle);
  const data = orphan.tables.find(t=>t.name==='task_card_checklists');
  data.rows_json = '[]'; data.count = 0;
  data.sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  await assert.rejects(verifyBackup(orphan,()=>new PGlite()),/foreign key/i);
});

test('SQL metadata injection and remote restore arguments are rejected', async () => {
  assert.throws(()=>identifier('projects; DROP TABLE projects'),/Invalid/);
  assert.throws(()=>columnType('text); SELECT pg_sleep(100);--'),/Unsupported/);
  assert.throws(()=>exportSql({tables:[]},'not-a-uuid'),/UUID/);
  const injected = structuredClone(bundle);
  injected.schema.find(t=>t.name==='projects').columns[0].type='text); DROP SCHEMA public CASCADE;--';
  await assert.rejects(verifyBackup(injected,()=>new PGlite()),/Unsupported/);
  await assert.rejects(promisify(execFile)(process.execPath,
    ['scripts/verify-household-restore.mjs','backup.json','report.json','postgres://remote/db']),
  error=>/Usage:.*no remote targets/.test(error.stderr));
});
