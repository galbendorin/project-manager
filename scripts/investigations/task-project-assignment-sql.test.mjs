import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';
const db = await createShoppingTestDatabase();
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
const project = '44444444-4444-4444-8444-444444444444';
const privateProject = '99999999-9999-4999-8999-999999999999';
const task = '55555555-5555-4555-8555-555555555555';
const checklist = '66666666-6666-4666-8666-666666666666';
const item = '77777777-7777-4777-8777-777777777777';
const raceItem = '88888888-8888-4888-8888-888888888888';
const raceChecklist = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
before(async () => {
  await db.exec(`create role authenticated nologin; create role anon nologin; create role service_role nologin;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.projects(id uuid primary key,user_id uuid,name text,tasks jsonb default '[]');
  create table public.project_members(project_id uuid,user_id uuid);
  create function public.can_access_project(target_project_id uuid,subject_user uuid) returns boolean language sql stable security definer set search_path='' as $$select subject_user is not null and(exists(select 1 from public.projects p where p.id=target_project_id and p.user_id=subject_user) or exists(select 1 from public.project_members m where m.project_id=target_project_id and m.user_id=subject_user))$$;
  create table public.manual_todos(id uuid primary key,user_id uuid references auth.users(id),project_id uuid references public.projects(id),title text,description text,due_date date,status text,meta jsonb default '{}',kanban_column_id uuid,updated_at timestamptz default now());
  create function public.can_access_manual_todo(target_project_id uuid,row_user_id uuid,subject_user uuid) returns boolean language sql stable security definer set search_path='' as $$select subject_user is not null and(case when target_project_id is null then row_user_id=subject_user else public.can_access_project(target_project_id,subject_user) end)$$;
  create function public.can_update_manual_todo(target_todo_id uuid,new_project_id uuid,new_user_id uuid,subject_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare existing_user_id uuid;existing_project_id uuid;begin
    if subject_user is null or target_todo_id is null then return false;end if;
    select user_id,project_id into existing_user_id,existing_project_id from public.manual_todos where id=target_todo_id;
    if not found or new_user_id is distinct from existing_user_id then return false;end if;
    if existing_project_id is null or existing_user_id=subject_user then return new_user_id=subject_user and(new_project_id is null or public.can_access_project(new_project_id,subject_user));end if;
    return new_project_id is not null and public.can_access_project(new_project_id,subject_user);end;$$;
  alter table public.manual_todos enable row level security;
  create policy manual_select on public.manual_todos for select to authenticated using(public.can_access_manual_todo(project_id,user_id,auth.uid()));
  create policy manual_update on public.manual_todos for update to authenticated using(public.can_access_manual_todo(project_id,user_id,auth.uid())) with check(public.can_update_manual_todo(id,project_id,user_id,auth.uid()));
  grant usage on schema public,auth to authenticated,anon;grant select,update on public.manual_todos to authenticated;
  insert into auth.users values('${owner}'),('${member}'),('${outsider}');
  insert into public.projects values('${project}','${owner}','Synthetic IKO project','[]'),('${privateProject}','${outsider}','Unshared project','[]');
  insert into public.project_members values('${project}','${member}');
  insert into public.manual_todos(id,user_id,title,description,due_date,status,meta) values('${task}','${owner}','Synthetic task','Retained notes','2026-10-11','Open','{"retained":true}');`);
  const checklistSchema = await readFile(new URL('../sql/2026-05-31_add_task_card_checklists.sql', import.meta.url),'utf8');
  await db.exec(db.native ? checklistSchema : checklistSchema.replace('create extension if not exists pgcrypto;', ''));
  await db.exec(`grant select on public.projects to authenticated;grant select,insert,update on public.task_card_checklists,public.task_card_checklist_items to authenticated;
  insert into public.task_card_checklists(id,user_id,card_key,title) values('${checklist}','${owner}','manual:${task}','Retained checklist');
  insert into public.task_card_checklist_items(id,checklist_id,user_id,title,checked) values('${item}','${checklist}','${owner}','Retained item',true);`);
  await db.exec(await readFile(new URL('../sql/2026-10-07_preserve_task_project_checklists.sql', import.meta.url),'utf8'));
});
after(() => db.close());
async function probe(actor, fn) {
  await db.exec('begin');
  try { await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.exec('set local role authenticated');return await fn(); }
  finally { await db.exec('rollback'); }
}
async function move(destination, connection = db) { return connection.query('update public.manual_todos set project_id=$1,kanban_column_id=null,updated_at=now() where id=$2 returning *',[destination,task]); }
async function scopes(connection = db) { return (await connection.query('select t.project_id as task_project,c.project_id as checklist_project,i.project_id as item_project from public.manual_todos t join public.task_card_checklists c on c.card_key=$1 join public.task_card_checklist_items i on i.checklist_id=c.id where t.id=$2',[`manual:${task}`,task])).rows; }
test('Other assignment retains task/checklist IDs, text, checked state and leaves schedule empty', async () => probe(owner, async () => {
  const result = await move(project); assert.equal(result.rows[0].id,task);assert.equal(result.rows[0].description,'Retained notes');assert.equal(result.rows[0].meta.retained,true);
  const retained = (await db.query('select c.id,c.title,i.id as item_id,i.title as item_title,i.checked from public.task_card_checklists c join public.task_card_checklist_items i on i.checklist_id=c.id')).rows[0];
  assert.equal(retained.id,checklist);assert.equal(retained.item_id,item);assert.equal(retained.checked,true);assert.equal(retained.title,'Retained checklist');assert.equal(retained.item_title,'Retained item');
  assert.deepEqual((await scopes())[0],{task_project:project,checklist_project:project,item_project:project});
  assert.equal((await db.query('select jsonb_array_length(tasks) as count from public.projects where id=$1',[project])).rows[0].count,0);
}));
test('assigned task can return to Other while retaining its checklist', async () => probe(owner, async () => {
  await move(project);await move(null);assert.deepEqual((await scopes())[0],{task_project:null,checklist_project:null,item_project:null});
}));
test('outsider and shared-project member cannot move another user’s private Other task', async () => {
  for(const actor of [member,outsider])await probe(actor,async()=>assert.equal((await move(project)).rows.length,0));
  assert.equal((await scopes())[0].task_project,null);
});
test('inaccessible destination rejects and rolls back all checklist scopes', async () => {
  await assert.rejects(probe(owner,async()=>move(privateProject)),error=>error.code==='42501');
  assert.deepEqual((await scopes())[0],{task_project:null,checklist_project:null,item_project:null});
});
test('checklist write failure rolls back the task project update', async () => {
  await db.exec("create function public.synthetic_failure() returns trigger language plpgsql as $$begin raise exception 'Synthetic child failure';end;$$; create trigger synthetic_failure before update on public.task_card_checklist_items for each row execute function public.synthetic_failure()");
  try {await assert.rejects(probe(owner,async()=>move(project)),/Synthetic child failure/);assert.equal((await scopes())[0].task_project,null);}
  finally {await db.exec('drop trigger synthetic_failure on public.task_card_checklist_items;drop function public.synthetic_failure()');}
});
test('scope guard rejects mismatched items and trigger helpers are not callable by browser roles', async () => {
  await assert.rejects(probe(owner,async()=>db.query('insert into public.task_card_checklist_items(id,checklist_id,user_id,project_id,title) values($1,$2,$3,$4,$5)',[raceItem,checklist,owner,project,'Wrong scope'])),error=>error.code==='23514');
  const grants=(await db.query("select has_function_privilege('authenticated','public.move_manual_task_checklists_v1()','EXECUTE') as move,has_function_privilege('authenticated','public.guard_checklist_item_project_v1()','EXECUTE') as guard,has_function_privilege('authenticated','public.guard_manual_checklist_project_v1()','EXECUTE') as parent_guard,has_function_privilege('anon','public.move_manual_task_checklists_v1()','EXECUTE') as anon")).rows[0];
  assert.deepEqual(grants,{move:false,guard:false,parent_guard:false,anon:false});
});
test('checklist creation cannot attach to another user’s private task', async () => {
  await assert.rejects(probe(outsider,()=>db.query('insert into public.task_card_checklists(id,user_id,card_key,title) values($1,$2,$3,$4)',[raceChecklist,outsider,`manual:${task}`,'Unauthorized parent'])),error=>error.code==='42501');
});
test('concurrent old-scope item insert waits for assignment and rejects without creating an orphan', {skip:!db.native}, async () => {
  const a=await db.connection();const b=await db.connection();
  try {
    await a.exec('begin');await move(project,a);
    await b.exec('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await b.exec('set local role authenticated');
    let settled=false;const insert=b.query('insert into public.task_card_checklist_items(id,checklist_id,user_id,title) values($1,$2,$3,$4)',[raceItem,checklist,owner,'Concurrent old scope']).then(()=>{settled=true;return null;},error=>{settled=true;return error;});
    await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false);await a.exec('commit');
    assert.equal((await insert).code,'23514');await b.exec('rollback');assert.equal((await scopes()).length,1);
  } finally {await a.exec('rollback');await b.exec('rollback');await move(null);await a.close();await b.close();}
});
test('concurrent old-scope checklist creation waits for assignment and rejects', {skip:!db.native}, async () => {
  const a=await db.connection();const b=await db.connection();
  try {
    await a.exec('begin');await move(project,a);
    await b.exec('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await b.exec('set local role authenticated');
    let settled=false;const insert=b.query('insert into public.task_card_checklists(id,user_id,card_key,title) values($1,$2,$3,$4)',[raceChecklist,owner,`manual:${task}`,'Concurrent checklist']).then(()=>{settled=true;return null;},error=>{settled=true;return error;});
    await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false);await a.exec('commit');assert.equal((await insert).code,'23514');await b.exec('rollback');
    assert.equal((await db.query('select count(*)::int as count from public.task_card_checklists where id=$1',[raceChecklist])).rows[0].count,0);
  } finally {await a.exec('rollback');await b.exec('rollback');await move(null);await a.close();await b.close();}
});
test('a checklist creation that starts first is included in the subsequent assignment', {skip:!db.native}, async () => {
  const a=await db.connection();const b=await db.connection();
  try {
    await b.exec('begin');await b.query('insert into public.task_card_checklists(id,user_id,card_key,title) values($1,$2,$3,$4)',[raceChecklist,owner,`manual:${task}`,'Created first']);
    await a.exec('begin');let settled=false;const moving=move(project,a).then(result=>{settled=true;return result;});
    await new Promise(resolve=>setTimeout(resolve,100));assert.equal(settled,false);await b.exec('commit');await moving;await a.exec('commit');
    assert.equal((await db.query('select project_id from public.task_card_checklists where id=$1',[raceChecklist])).rows[0].project_id,project);
  } finally {await a.exec('rollback');await b.exec('rollback');await move(null);await db.query('delete from public.task_card_checklists where id=$1',[raceChecklist]);await a.close();await b.close();}
});
