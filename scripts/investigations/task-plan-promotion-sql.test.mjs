import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';
const db = await createShoppingTestDatabase();
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const project = '44444444-4444-4444-8444-444444444444';
const sourceId = '55555555-5555-4555-8555-555555555555';
const operation = '66666666-6666-4666-8666-666666666666';
const checklistId = '77777777-7777-4777-8777-777777777777';
const itemId = '88888888-8888-4888-8888-888888888888';
before(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.projects(id uuid primary key,user_id uuid,name text,tasks jsonb default '[]',registers jsonb default '{}',tracker jsonb default '[]',version bigint default 1,updated_at timestamptz);
  create table public.project_members(project_id uuid,user_id uuid);
  create function public.can_access_project(target uuid,subject uuid) returns boolean language sql stable security definer set search_path='' as $$select subject is not null and(exists(select 1 from public.projects where id=target and user_id=subject) or exists(select 1 from public.project_members where project_id=target and user_id=subject))$$;
  create function public.can_access_manual_todo(target_project_id uuid,row_user_id uuid,subject_user uuid) returns boolean language sql stable security definer set search_path='' as $$select subject_user is not null and(case when target_project_id is null then row_user_id=subject_user else public.can_access_project(target_project_id,subject_user) end)$$;
  create function public.can_write_project(target uuid,owner_id uuid,subject uuid) returns boolean language sql stable security definer set search_path='' as $$select public.can_access_project(target,subject) and exists(select 1 from public.projects where id=target and user_id=owner_id)$$;
  create function public.bump_version() returns trigger language plpgsql as $$begin new.version:=old.version+1; return new; end$$;
  create trigger version before update on public.projects for each row execute function public.bump_version();
  alter table public.projects enable row level security;
  create policy projects on public.projects to authenticated using(public.can_access_project(id,auth.uid())) with check(public.can_write_project(id,user_id,auth.uid()));
  create table public.manual_todos(id uuid primary key,user_id uuid,project_id uuid references public.projects(id),title text,due_date date,status text default 'Open',completed_at timestamptz,recurrence jsonb,source_batch_id uuid,source_type text default '',meta jsonb default '{}',updated_at timestamptz);
  alter table public.manual_todos enable row level security;
  create policy manual on public.manual_todos to authenticated using((project_id is null and user_id=auth.uid()) or public.can_access_project(project_id,auth.uid())) with check((project_id is null and user_id=auth.uid()) or public.can_access_project(project_id,auth.uid()));
  grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid(),public.can_access_project(uuid,uuid),public.can_write_project(uuid,uuid,uuid) to authenticated;
  grant select,update,insert,delete on public.projects,public.manual_todos to authenticated;
  insert into auth.users values('${owner}'),('${member}'),('${outsider}');
  insert into public.projects(id,user_id,name) values('${project}','${owner}','Synthetic project');
  insert into public.project_members values('${project}','${member}');
  insert into public.manual_todos(id,user_id,title,due_date,meta) values('${sourceId}','${owner}','Synthetic task','2026-10-02','{"retainedNote":"Synthetic existing meta"}');`);
  const checklist = (await readFile(new URL('../sql/2026-05-31_add_task_card_checklists.sql', import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '');
  await db.exec(checklist);
  await db.exec(`grant select,insert,update,delete on public.task_card_checklists,public.task_card_checklist_items to authenticated;
  insert into public.task_card_checklists(id,user_id,card_key,title) values('${checklistId}','${owner}','manual:${sourceId}','Synthetic retained checklist');
  insert into public.task_card_checklist_items(id,user_id,checklist_id,title) values('${itemId}','${owner}','${checklistId}','Synthetic retained item');`);
  await db.exec(await readFile(new URL('../sql/2026-10-06_atomic_task_plan_promotion.sql', import.meta.url), 'utf8'));
  // The already-installed draft receives only these reviewed function changes.
  // This also verifies its guarded idempotent rollout against the final bodies.
  await db.exec(await readFile(new URL('../sql/2026-10-06_task_plan_promotion_review_corrections.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../sql/2026-10-06_task_plan_promotion_metadata_guard.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../sql/2026-10-07_preserve_task_project_checklists.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
async function probe(user, fn, role = 'authenticated') {
  await db.exec('begin');
  try { await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]); await db.exec(`set local role ${role}`); return await fn(); }
  finally { await db.exec('rollback'); }
}
const intent = { name: 'Synthetic scheduled task', type: 'Task', start: '2026-10-09', duration: 2, dependency_choice: 'independent', dependencies: [], dependency_logic: 'ALL', confirmed_finish: '2026-10-13' };
async function snapshot() { return (await db.query('select to_jsonb(source) as value from public.manual_todos source where id=$1', [sourceId])).rows[0]?.value; }
async function promote(expected, payload = intent, op = operation, kind = 'manual', id = sourceId, version = 1) {
  return (await db.query('select public.promote_task_to_project_plan_v1($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) as value', [project, kind, id, version, JSON.stringify(expected), op, JSON.stringify(payload)])).rows[0].value;
}
test('promotion commits one plan row, same manual ID and retained checklist scopes together', async () => probe(owner, async () => {
  const expected = await snapshot(); const result = await promote(expected);
  assert.equal(result.ok, true); assert.equal(result.task_id, 1);
  assert.equal(result.source.id, sourceId); assert.equal(result.source.user_id, owner); assert.equal(result.source.project_id, project);
  assert.equal(result.source.meta.retainedNote, 'Synthetic existing meta'); assert.equal(result.source.status, 'Open');
  assert.equal(result.project.tasks.length, 1); assert.equal(result.task.originRef.sourceKey, `manual:${sourceId}`);
  const parent = (await db.query('select id,project_id,user_id from public.task_card_checklists where id=$1',[checklistId])).rows[0];
  const item = (await db.query('select id,project_id,user_id from public.task_card_checklist_items where id=$1',[itemId])).rows[0];
  assert.equal(parent.project_id, project); assert.equal(item.project_id, project); assert.equal(parent.user_id, owner); assert.equal(item.user_id, owner);
}));
test('response-loss replay with stale version/source returns the existing row and rejects changed intent', async () => probe(owner, async () => {
  const expected = await snapshot(); const first = await promote(expected); const replay = await promote(expected);
  assert.equal(replay.existing, true); assert.equal(replay.task_id, first.task_id); assert.equal(replay.project.tasks.length, 1);
  await assert.rejects(promote(expected, { ...intent, name: 'Changed replay' }), (error) => error.message.includes('PLAN_OPERATION_REPLAY_MISMATCH'));
}));
test('outsider and anonymous cannot promote work', async () => {
  await assert.rejects(probe(outsider, async () => promote({})), (error) => error.code === '42501');
  await assert.rejects(probe('', async () => promote({}), 'anon'), (error) => error.code === '42501');
});
test('stale version and invalid finish/duration/dependency roll back source and project', async () => {
  for (const payload of [{ ...intent, duration: 0 }, { ...intent, confirmed_finish: '2026-10-14' }, { ...intent, dependency_choice: '' }]) {
    await assert.rejects(probe(owner, async () => promote(await snapshot(), payload)));
    assert.equal((await db.query('select jsonb_array_length(tasks) as count from public.projects where id=$1',[project])).rows[0].count, 0);
  }
  await assert.rejects(probe(owner, async () => promote(await snapshot(), intent, operation, 'manual', sourceId, 0)), (error) => error.code === '40001');
});
test('calendar preview keeps existing business-day convention and milestone zero duration', async () => probe(owner, async () => {
  assert.equal((await db.query("select public.task_plan_business_day_v1('2026-10-09',2)::text as finish")).rows[0].finish, '2026-10-13');
  const result = await promote(await snapshot(), { ...intent, type: 'Milestone', duration: 0, confirmed_finish: '2026-10-09' });
  assert.equal(result.task.dur, 0); assert.equal(result.task.type, 'Milestone');
}));

test('normal inserts cannot fabricate reserved manual links or replay history', async () => {
  for (const meta of [{ projectPlanLink: null }, { projectPlanOperationIds: [] }]) {
    await assert.rejects(probe(owner, () => db.query('insert into public.manual_todos(id,user_id,title,meta) values($1,$2,$3,$4::jsonb)', ['99999999-9999-4999-8999-999999999999', owner, 'Synthetic forgery', JSON.stringify(meta)])), /PLAN_LINK_RESERVED/);
  }
});

test('copied provenance cannot append a second linked plan task', async () => {
  await assert.rejects(probe(owner, async () => {
    const result = await promote(await snapshot());
    await db.query('update public.projects set tasks=tasks||$1::jsonb where id=$2', [JSON.stringify([{ ...result.task, id: 2 }]), project]);
  }), /PLAN_ORIGIN_INVALID/);
});

test('normal writes cannot erase provenance, delete a linked source, or alter source scheduling', async () => {
  for (const query of [
    "update public.manual_todos set meta=meta-'projectPlanLink' where id=$1",
    'delete from public.manual_todos where id=$1',
    "update public.manual_todos set due_date='2026-10-20' where id=$1",
  ]) {
    await assert.rejects(probe(owner, async () => { await promote(await snapshot()); await db.query(query, [sourceId]); }), /PLAN_LINK_IMMUTABLE|PLAN_SOURCE_LINKED_RETURN_FIRST|PLAN_SOURCE_FIELDS_READ_ONLY/);
  }
});

test('legacy forged replay must have a reciprocal plan origin', async () => probe(owner, async () => {
  // Simulate a pre-migration imported bad link as the fixture administrator.
  // Every fixture change remains inside the rollback transaction.
  await db.exec('reset role; alter table public.manual_todos disable trigger trg_manual_task_plan_link_guard_v1');
  const link = { version: 1, projectId: project, taskId: 1, sourceKind: 'manual', sourceId, sourceKey: `manual:${sourceId}`, operationId: operation, intent };
  await db.query('update public.manual_todos set project_id=$1,meta=meta||$2::jsonb where id=$3', [project, JSON.stringify({ projectPlanLink: link }), sourceId]);
  await db.query('update public.projects set tasks=$1::jsonb where id=$2', [JSON.stringify([{ id: 1, name: 'Unrelated task', start: '2026-10-09', dur: 2 }]), project]);
  await db.exec('alter table public.manual_todos enable trigger trg_manual_task_plan_link_guard_v1; set local role authenticated');
  await assert.rejects(promote(await snapshot()), /PLAN_LINK_UNAVAILABLE/);
}));

test('group weekend milestone predecessor matches existing FS and FF scheduling', async () => {
  const tasks = [
    { id: 1, name: 'Synthetic group', start: '2026-10-09', dur: 0, indent: 0 },
    { id: 2, name: 'Friday milestone', start: '2026-10-09', dur: 0, indent: 1 },
    { id: 3, name: 'Sunday milestone', start: '2026-10-11', dur: 0, indent: 1 },
  ];
  for (const [depType, finish] of [['FS', '2026-10-12'], ['FF', '2026-10-09']]) {
    await probe(owner, async () => {
      await db.query('update public.projects set tasks=$1::jsonb where id=$2', [JSON.stringify(tasks), project]);
      const result = await promote(await snapshot(), { ...intent, duration: 1, dependency_choice: 'dependent', dependencies: [{ parentId: 1, depType }], confirmed_finish: finish }, operation, 'manual', sourceId, 2);
      assert.equal(result.task.dur, 1);
      assert.equal((await db.query('select public.task_plan_business_day_v1($1::date,1)::text as finish', [result.task.start])).rows[0].finish, finish);
    });
  }
});

test('ordinary action and tracker saves cannot manufacture reciprocal provenance pairs', async () => {
  for (const kind of ['action', 'tracker']) {
    await assert.rejects(probe(owner, async () => {
      const id = `synthetic-${kind}`;
      const link = { version: 1, projectId: project, taskId: 1, sourceKind: kind, sourceId: id, sourceKey: `project:${project}${kind === 'action' ? ':register:actions:' : ':tracker:'}${id}`, operationId: operation, intent };
      const source = { _id: id, projectPlanLink: link, projectPlanOperationIds: [operation] };
      await db.query('update public.projects set tasks=$1::jsonb,registers=$2::jsonb,tracker=$3::jsonb where id=$4', [JSON.stringify([{ id: 1, originRef: link }]), JSON.stringify(kind === 'action' ? { actions: [source] } : {}), JSON.stringify(kind === 'tracker' ? [source] : []), project]);
    }), /PLAN_LINK_RESERVED/);
  }
});

const returnOperation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function returnToSource(result, op = returnOperation) {
  return (await db.query('select public.return_task_from_project_plan_v1($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) as value', [project, result.task.originRef.sourceKind, result.task.originRef.sourceId, result.project.version, JSON.stringify(result.source), JSON.stringify(result.task.originRef), op])).rows[0].value;
}
test('explicit return preserves source and checklist IDs, latest plan values and retired replay receipts', async () => probe(owner, async () => {
  const original = await snapshot();
  let result = await promote(original);
  const edited = { ...result.task, name: 'Latest scheduled title', dur: 3, pct: 100 };
  result.project = (await db.query('update public.projects set tasks=$1::jsonb where id=$2 returning to_jsonb(projects.*) as value', [JSON.stringify([edited]), project])).rows[0].value;
  const returned = await returnToSource(result);
  assert.equal(returned.source.id, sourceId); assert.equal(returned.source.project_id, project);
  assert.equal(returned.source.title, edited.name); assert.equal(returned.source.status, 'Done'); assert.ok(returned.source.completed_at);
  assert.equal(returned.source.due_date, '2026-10-14'); assert.equal(returned.source.meta.retainedNote, 'Synthetic existing meta');
  assert.equal(returned.source.meta.projectPlanLink, undefined); assert.equal(returned.project.tasks.length, 0);
  assert.deepEqual(returned.source.meta.projectPlanOperationIds, [operation, returnOperation]);
  assert.equal((await db.query('select id from public.task_card_checklist_items where id=$1', [itemId])).rows[0].id, itemId);
  const replay = await returnToSource(result); assert.equal(replay.existing, true); assert.equal(replay.project.tasks.length, 0);
  await assert.rejects(promote(original), /PLAN_OPERATION_RETIRED/);
}));

test('return refuses incoming dependencies without unlinking the source or dropping plan tasks', async () => {
  await assert.rejects(probe(owner, async () => {
    const result = await promote(await snapshot());
    result.project = (await db.query('update public.projects set tasks=tasks||$1::jsonb where id=$2 returning to_jsonb(projects.*) as value', [JSON.stringify([{ id: 2, name: 'Dependent task', start: '2026-10-13', dur: 1, parent: 1 }]), project])).rows[0].value;
    await returnToSource(result);
  }), /PLAN_RETURN_DEPENDENTS_EXIST/);
  assert.equal((await snapshot()).project_id, null);
});

test('action and manually captured tracker promotions and returns retain their original identities', async () => {
  for (const kind of ['action', 'tracker']) await probe(member, async () => {
    const id = `synthetic-${kind}`;
    const source = kind === 'action' ? { _id: id, description: 'Synthetic action', target: '2026-10-02', status: 'Open', notes: 'Retained notes' } : { _id: id, taskName: 'Synthetic tracker', status: 'Open', notes: 'Retained notes', rag: 'Amber' };
    await db.query('update public.projects set registers=$1::jsonb,tracker=$2::jsonb where id=$3', [JSON.stringify(kind === 'action' ? { actions: [source] } : {}), JSON.stringify(kind === 'tracker' ? [source] : []), project]);
    const result = await promote(source, intent, operation, kind, id, 2);
    assert.equal(result.project.version, 4); assert.equal(result.source._id, id); assert.equal(result.source.notes, source.notes);
    const returned = await returnToSource(result);
    assert.equal(returned.source._id, id); assert.equal(returned.source.notes, source.notes); assert.equal(returned.project.tasks.length, 0);
    assert.equal(returned.source.projectPlanLink, undefined);
    assert.equal(returned.source[kind === 'action' ? 'description' : 'taskName'], intent.name);
    if (kind === 'tracker') { assert.equal(returned.source.rag, 'Amber'); assert.equal(returned.source.dueDate, intent.confirmed_finish); }
    await db.query('update public.projects set registers=$1::jsonb,tracker=$2::jsonb where id=$3', ['{}', '[]', project]);
  });
});

test('duplicate source IDs are rejected instead of choosing an ambiguous action', async () => {
  await assert.rejects(probe(owner, async () => {
    const source = { _id: 'synthetic-action', description: 'Synthetic action', status: 'Open' };
    await db.query('update public.projects set registers=$1::jsonb where id=$2', [JSON.stringify({ actions: [source, source] }), project]);
    await promote(source, intent, operation, 'action', source._id, 2);
  }), /PLAN_SOURCE_ID_INVALID/);
});

test('quota-trigger rejection rolls back both plan creation and the source link', async () => {
  await db.exec("create function public.synthetic_quota() returns trigger language plpgsql as $$begin if jsonb_array_length(new.tasks)>0 then raise exception using errcode='P0001',message='PROJECT_TASK_LIMIT_REACHED'; end if; return new; end$$; create trigger synthetic_quota before update of tasks on public.projects for each row execute function public.synthetic_quota()");
  try {
    await assert.rejects(probe(owner, async () => promote(await snapshot())), /PROJECT_TASK_LIMIT_REACHED/);
    assert.equal((await snapshot()).project_id, null); assert.equal((await snapshot()).meta.projectPlanLink, undefined);
    assert.equal((await db.query('select jsonb_array_length(tasks) as count from public.projects where id=$1', [project])).rows[0].count, 0);
  } finally { await db.exec('drop trigger synthetic_quota on public.projects; drop function public.synthetic_quota()'); }
});

test('return refuses successors of a containing summary group to avoid stale starts', async () => {
  await assert.rejects(probe(owner, async () => {
    const result = await promote(await snapshot());
    const tasks = [{ id: 2, name: 'Containing summary', start: '2026-10-09', dur: 2, indent: 0 }, { ...result.task, indent: 1 }, { id: 3, name: 'Summary successor', start: '2026-10-13', dur: 1, indent: 0, parent: 2 }];
    result.project = (await db.query('update public.projects set tasks=$1::jsonb where id=$2 returning to_jsonb(projects.*) as value', [JSON.stringify(tasks), project])).rows[0].value;
    await returnToSource(result);
  }), /PLAN_RETURN_DEPENDENTS_EXIST/);
});

test('returned tracker uses supported progress status and preserves its deadline on re-promotion', async () => probe(owner, async () => {
  const row = { _id: 'synthetic-return-tracker', taskName: 'Captured tracker', status: 'Not Started' };
  await db.query('update public.projects set tracker=$1::jsonb where id=$2', [JSON.stringify([row]), project]);
  const first = await promote(row, intent, operation, 'tracker', row._id, 2);
  first.project = (await db.query('update public.projects set tasks=$1::jsonb where id=$2 returning to_jsonb(projects.*) as value', [JSON.stringify([{ ...first.task, pct: 50 }]), project])).rows[0].value;
  const returned = await returnToSource(first);
  assert.equal(returned.source.status, 'In Progress'); assert.equal(returned.source.dueDate, intent.confirmed_finish);
  const again = await promote(returned.source, intent, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'tracker', row._id, returned.project.version);
  assert.equal(again.task.originRef.originalDeadline, returned.source.dueDate);
}));
test('non-object manual metadata cannot leave a plan row without a reciprocal source link', async () => {
  await assert.rejects(probe(owner, async () => {
    await db.query("update public.manual_todos set meta='[]'::jsonb where id=$1", [sourceId]);
    await promote(await snapshot());
  }), /PLAN_SOURCE_METADATA_INVALID/);
  assert.equal((await db.query('select jsonb_array_length(tasks) as count from public.projects where id=$1', [project])).rows[0].count, 0);
  assert.equal((await snapshot()).meta.projectPlanLink, undefined);
});
test('return cannot leave a legacy forwarding alias dangling after removing the plan row', async () => {
  await assert.rejects(probe(owner, async () => {
    const result = await promote(await snapshot());
    result.project = (await db.query('update public.projects set tracker=$1::jsonb where id=$2 returning to_jsonb(projects.*) as value', [JSON.stringify([{ _id: 'legacy-forwarded', taskId: result.task_id, taskName: 'Legacy alias' }]), project])).rows[0].value;
    await returnToSource(result);
  }), /PLAN_RETURN_ALIAS_EXISTS/);
});

const nativeTest = db.native ? test : test.skip;
async function waitForLock(pid) {
  const until = Date.now() + 2500;
  while (Date.now() < until) {
    if ((await db.query('select wait_event_type from pg_stat_activity where pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('The competing native transaction did not wait on the source/project lock.');
}
async function resetNativeFixture() {
  // This helper is reachable only in the fresh local fixture, never a URL.
  await db.exec(`begin;
    alter table public.projects disable trigger trg_project_task_plan_link_guard_v1;
    alter table public.projects disable trigger version;
    alter table public.manual_todos disable trigger trg_manual_task_plan_link_guard_v1;
    update public.projects set tasks='[]',registers='{}',tracker='[]',version=1;
    update public.manual_todos set project_id=null,title='Synthetic task',due_date='2026-10-02',status='Open',completed_at=null,meta='{"retainedNote":"Synthetic existing meta"}';
    update public.task_card_checklists set project_id=null;
    update public.task_card_checklist_items set project_id=null;
    alter table public.projects enable trigger trg_project_task_plan_link_guard_v1;
    alter table public.projects enable trigger version;
    alter table public.manual_todos enable trigger trg_manual_task_plan_link_guard_v1;
    commit;`);
}
nativeTest('simultaneous same-source promotion waits, replays and commits only one plan row', async () => {
  const first = await db.connection(); const second = await db.connection();
  try {
    const expected = await snapshot();
    for (const client of [first, second]) { await client.query('begin'); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]); await client.query('set local role authenticated'); }
    const args = [project, 'manual', sourceId, 1, JSON.stringify(expected), operation, JSON.stringify(intent)];
    const query = 'select public.promote_task_to_project_plan_v1($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) as value';
    const one = (await first.query(query, args)).rows[0].value;
    const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    const pending = second.query(query, args).then((result) => ({ result }), (error) => ({ error }));
    await waitForLock(pid); await first.query('commit');
    const two = await pending; if (two.error) throw two.error;
    assert.equal(two.result.rows[0].value.existing, true); assert.equal(two.result.rows[0].value.task_id, one.task_id);
    await second.query('commit');
    assert.equal((await db.query('select jsonb_array_length(tasks) as count from public.projects where id=$1', [project])).rows[0].count, 1);
  } finally { await Promise.allSettled([first.query('rollback'), second.query('rollback')]); await first.close(); await second.close(); await resetNativeFixture(); }
});
nativeTest('competing target projects serialize one Other source without splitting its checklist', async () => {
  const target = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await db.query('insert into public.projects(id,user_id,name) values($1,$2,$3)', [target, owner, 'Synthetic competing project']);
  const first = await db.connection(); const second = await db.connection();
  try {
    const expected = await snapshot();
    for (const client of [first, second]) { await client.query('begin'); await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]); await client.query('set local role authenticated'); }
    const query = 'select public.promote_task_to_project_plan_v1($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) as value';
    await first.query(query, [project, 'manual', sourceId, 1, JSON.stringify(expected), operation, JSON.stringify(intent)]);
    const pid = (await second.query('select pg_backend_pid() as pid')).rows[0].pid;
    const pending = second.query(query, [target, 'manual', sourceId, 1, JSON.stringify(expected), operation, JSON.stringify(intent)]).then((result) => ({ result }), (error) => ({ error }));
    await waitForLock(pid); await first.query('commit');
    const outcome = await pending; assert.match(outcome.error?.message || '', /PLAN_SOURCE_PROJECT_MISMATCH/);
    await second.query('rollback');
    assert.equal((await snapshot()).project_id, project);
    assert.equal((await db.query('select project_id from public.task_card_checklist_items where id=$1', [itemId])).rows[0].project_id, project);
    assert.equal((await db.query('select jsonb_array_length(tasks) as count from public.projects where id=$1', [target])).rows[0].count, 0);
  } finally { await Promise.allSettled([first.query('rollback'), second.query('rollback')]); await first.close(); await second.close(); await resetNativeFixture(); await db.query('delete from public.projects where id=$1', [target]); }
});
