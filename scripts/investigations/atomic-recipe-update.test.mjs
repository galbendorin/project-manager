import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';

// Isolated PostgreSQL only; the fixture never accepts a hosted connection URL.
const db = await createShoppingTestDatabase();
const ids = Object.fromEntries(['owner','member','outsider','project','recipe','ingredient'].map(key => [key,randomUUID()]));
const migrate = async name => db.exec((await readFile(new URL(`../sql/${name}`,import.meta.url),'utf8'))
  .replaceAll('create extension if not exists pgcrypto;','-- Core gen_random_uuid in fixture.'));
let policies;
before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.projects(id uuid primary key,user_id uuid references auth.users(id));
    alter table public.projects add column name text default 'Shopping List',add column created_at timestamptz default now();
    create table public.project_members(project_id uuid references public.projects(id),user_id uuid references auth.users(id));
    create function public.can_access_project(project_id uuid,subject_user uuid) returns boolean
      language sql stable security definer set search_path = '' as $$
      select subject_user is not null and (exists(select 1 from public.projects p where p.id=project_id and p.user_id=subject_user)
        or exists(select 1 from public.project_members m where m.project_id=$1 and m.user_id=subject_user)) $$;
    create table public.manual_todos(id uuid primary key default gen_random_uuid(),project_id uuid);
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid(),public.can_access_project(uuid,uuid) to anon,authenticated;
  `);
  for (const file of ['2026-04-09_add_meal_planner.sql','2026-04-10_add_meal_recipe_batch_settings.sql',
    '2026-04-12_add_meal_ingredient_calories.sql','2026-04-26_add_meal_recipe_nutrition_estimates.sql',
    '2026-04-15_share_meal_planner_with_shopping_list.sql']) await migrate(file);
  await db.exec('grant select,insert,update,delete on all tables in schema public to authenticated,anon');
  await db.query('insert into auth.users(id) values($1),($2),($3)',[ids.owner,ids.member,ids.outsider]);
  await db.query('insert into public.projects(id,user_id) values($1,$2)',[ids.project,ids.owner]);
  await db.query('insert into public.project_members values($1,$2)',[ids.project,ids.member]);
  await db.query("insert into public.meal_library_meals(id,user_id,shopping_project_id,name,meal_slot) values($1,$2,$3,'Synthetic original','dinner')",[ids.recipe,ids.owner,ids.project]);
  await db.query("insert into public.meal_library_ingredients(id,meal_id,ingredient_name,manual_kcal) values($1,$2,'Synthetic original ingredient',150)",[ids.ingredient,ids.recipe]);
  policies = (await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows;
  await migrate('2026-10-01_atomic_recipe_update.sql');
});
after(async () => db.close());

const payload = {name:'Synthetic changed',meal_slot:'dinner',ingredients_raw:'Synthetic replacement'};
const ingredients = [{ingredient_name:'Synthetic replacement',raw_text:'Synthetic replacement',manual_kcal:200,quantity_value:2,quantity_unit:'g'}];
async function probe(user,callback,{role='authenticated',removed=false}={}) {
  await db.exec('begin');
  try {
    if (removed) await db.query('delete from public.project_members where user_id=$1',[ids.member]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user || '']);
    await db.exec(`set local role ${role}`);
    return await callback();
  } finally { await db.exec('rollback'); }
}
const save = (recipe=payload,items=ingredients,id=ids.recipe) => db.query(
  'select public.update_meal_recipe_atomic($1,$2::jsonb,$3::jsonb) id',[id,JSON.stringify(recipe),JSON.stringify(items)]);

for (const [label,user] of [['owner',ids.owner],['member',ids.member]]) {
  test(`${label} saves metadata and replacement ingredients together`,async()=>probe(user,async()=>{
    assert.equal((await save()).rows[0].id,ids.recipe);
    assert.equal((await db.query('select name from public.meal_library_meals where id=$1',[ids.recipe])).rows[0].name,payload.name);
    const rows=(await db.query('select ingredient_name,manual_kcal from public.meal_library_ingredients where meal_id=$1',[ids.recipe])).rows;
    assert.deepEqual(rows,[{ingredient_name:'Synthetic replacement',manual_kcal:200}]);
  }));
}
for (const [label,user,options] of [['outsider',ids.outsider,{}],['removed member',ids.member,{removed:true}],['anonymous','',{role:'anon'}]]) {
  test(`${label} cannot use atomic recipe editing`,async()=>{
    await assert.rejects(probe(user,()=>save(),options),error=>error.code==='42501');
  });
}
test('ingredient failure rolls back metadata and preserves previous structured nutrition',async()=>{
  const beforeRows=(await db.query('select to_jsonb(i) row from public.meal_library_ingredients i')).rows;
  const beforeMeal=(await db.query('select to_jsonb(m) row from public.meal_library_meals m')).rows;
  // Savepoint permits inspecting rollback inside the same owner transaction.
  await probe(ids.owner,async()=>{
    await db.exec('savepoint recipe_failure');
    await assert.rejects(save(payload,[{...ingredients[0],linked_fdc_id:'not-a-number'}]),error=>error.code==='22P02');
    await db.exec('rollback to savepoint recipe_failure');
    assert.deepEqual((await db.query('select to_jsonb(i) row from public.meal_library_ingredients i')).rows,beforeRows);
    assert.deepEqual((await db.query('select to_jsonb(m) row from public.meal_library_meals m')).rows,beforeMeal);
  });
});
test('empty ingredient replacement is intentional and atomic',async()=>probe(ids.owner,async()=>{
  await save(payload,[]);
  assert.equal((await db.query('select id from public.meal_library_ingredients where meal_id=$1',[ids.recipe])).rows.length,0);
}));
test('missing recipe does not acknowledge a successful save',async()=>{
  await assert.rejects(probe(ids.owner,()=>save(payload,ingredients,randomUUID())),error=>error.code==='42501');
});
for (const fields of [{user_id:ids.outsider},{shopping_project_id:randomUUID()},{id:randomUUID()}]) {
  test(`reject identity/ownership field ${Object.keys(fields)[0]}`,async()=>{
    await assert.rejects(probe(ids.owner,()=>save({...payload,...fields})),error=>error.code==='22023');
  });
}
test('RPC keeps existing RLS policies and removes anonymous/public execution',async()=>{
  assert.deepEqual((await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows,policies);
  const result=(await db.query("select prosecdef,has_function_privilege('anon',oid,'execute') anon_execute,has_function_privilege('authenticated',oid,'execute') authenticated_execute from pg_proc where oid='public.update_meal_recipe_atomic(uuid,jsonb,jsonb)'::regprocedure")).rows[0];
  assert.deepEqual(result,{prosecdef:false,anon_execute:false,authenticated_execute:true});
});
