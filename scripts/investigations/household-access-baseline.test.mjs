// Q08 isolated baseline/repair investigation, not a whole-system certification.
// PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test <this file>
// Q08_REPAIR=1 verifies the repaired state; native mode also tests FK contention.
// This helper never accepts a hosted connection URL. Every probe rolls back.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createShoppingTestDatabase } from './shopping-test-database.mjs';

const db = await createShoppingTestDatabase();
const repaired = process.env.Q08_REPAIR === '1';
const gapLabel = repaired ? 'REPAIR DENIES' : 'BASELINE GAP';
let originalEntries;
let originalPolicies;
const ids = Object.fromEntries(['owner', 'member', 'outsider', 'project', 'otherProject',
  'meal', 'otherMeal', 'ingredient', 'week', 'memberWeek', 'otherWeek',
  'entry', 'memberEntry', 'otherEntry', 'batch'].map(key => [key, randomUUID()]));
const sql = name => readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
const migrate = async name => db.exec((await sql(name))
  .replaceAll('create extension if not exists pgcrypto;', '-- Isolated fixture uses core gen_random_uuid.'));

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    create table public.projects(id uuid primary key, user_id uuid references auth.users(id),
      name text default 'Q08 TEST', created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.profiles(id uuid primary key references auth.users(id), email text, created_at timestamptz default now());
  `);
  await migrate('2026-02-23_create_manual_todos.sql');
  await migrate('2026-03-24_add_project_members_and_shared_access.sql');
  await migrate('2026-03-30_expand_project_sharing_and_pending_invites.sql');
  await migrate('2026-04-09_add_meal_planner.sql');
  await migrate('2026-04-10_expand_meal_planner_slot_entries.sql');
  await migrate('2026-04-15_share_meal_planner_with_shopping_list.sql');
  await migrate('2026-04-15_add_meal_plan_carryover_entries.sql');
  await migrate('2026-04-15_add_meal_plan_grocery_exclusions.sql');
  // The follow-up live catalog has personal user/week uniqueness, not the
  // older household/week uniqueness. Match it so other errors cannot hide FKs.
  await db.exec(`drop index public.idx_meal_plan_weeks_project_week;
    drop index public.idx_meal_plan_weeks_legacy_user_week;
    create unique index idx_meal_plan_weeks_user_week_unique on public.meal_plan_weeks(user_id,week_start_date)`);
  const entitlementSql = await sql('2026-04-18_harden_server_entitlements_and_checkout.sql');
  for (const name of ['normalize_shopping_title', 'upsert_shopping_list_item', 'project_collaborator_seat_limit',
    'enforce_project_collaborator_seat_cap', 'invite_project_member']) {
    await db.exec(entitlementSql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0]);
  }
  await db.exec(`create trigger trg_project_members_enforce_seat_cap before insert or update on public.project_members
    for each row execute function public.enforce_project_collaborator_seat_cap()`);

  // Live catalog supplied by the owner on 30 September differs from the old
  // shared-week migration. Model its CURRENT personal-write/shared-read rules,
  // not the older source policies. This is not a migration to run in production.
  const { rows } = await db.query(`select tablename, policyname from pg_policies where schemaname='public'
    and tablename in ('meal_plan_weeks','meal_plan_entries','meal_plan_grocery_batches')`);
  for (const row of rows) await db.exec(`drop policy "${row.policyname}" on public.${row.tablename}`);
  await db.exec(`
    create policy meal_plan_weeks_select_own on public.meal_plan_weeks for select using (auth.uid()=user_id);
    create policy meal_plan_weeks_select_shared_visible on public.meal_plan_weeks for select
      using (shopping_project_id is not null and public.can_access_project(shopping_project_id,auth.uid()));
    create policy meal_plan_weeks_insert_own on public.meal_plan_weeks for insert with check
      (auth.uid()=user_id and (shopping_project_id is null or public.can_access_project(shopping_project_id,auth.uid())));
    create policy meal_plan_weeks_update_own on public.meal_plan_weeks for update using (auth.uid()=user_id) with check
      (auth.uid()=user_id and (shopping_project_id is null or public.can_access_project(shopping_project_id,auth.uid())));
    create policy meal_plan_weeks_delete_own on public.meal_plan_weeks for delete using (auth.uid()=user_id);
    create policy meal_plan_entries_select_own on public.meal_plan_entries for select using
      (exists(select 1 from public.meal_plan_weeks w where w.id=week_id and w.user_id=auth.uid()));
    create policy meal_plan_entries_select_shared_visible on public.meal_plan_entries for select using
      (exists(select 1 from public.meal_plan_weeks w where w.id=week_id and w.shopping_project_id is not null
        and public.can_access_project(w.shopping_project_id,auth.uid())));
    create policy meal_plan_entries_delete_own on public.meal_plan_entries for delete using
      (exists(select 1 from public.meal_plan_weeks w where w.id=week_id and w.user_id=auth.uid()));
    create policy meal_plan_entries_insert_personal_week_shared_library on public.meal_plan_entries for insert with check
      (exists(select 1 from public.meal_plan_weeks w join public.meal_library_meals m on m.id=meal_id
        where w.id=week_id and w.user_id=auth.uid() and w.shopping_project_id is not null
          and m.shopping_project_id=w.shopping_project_id and public.can_access_project(w.shopping_project_id,auth.uid())));
    create policy meal_plan_entries_update_personal_week_shared_library on public.meal_plan_entries for update using
      (exists(select 1 from public.meal_plan_weeks w where w.id=week_id and w.user_id=auth.uid())) with check
      (exists(select 1 from public.meal_plan_weeks w join public.meal_library_meals m on m.id=meal_id
        where w.id=week_id and w.user_id=auth.uid() and w.shopping_project_id is not null
          and m.shopping_project_id=w.shopping_project_id and public.can_access_project(w.shopping_project_id,auth.uid())));
    create policy meal_plan_grocery_batches_select_own on public.meal_plan_grocery_batches for select using (auth.uid()=user_id);
    create policy meal_plan_grocery_batches_delete_own on public.meal_plan_grocery_batches for delete using (auth.uid()=user_id);
    create policy meal_plan_grocery_batches_insert_own on public.meal_plan_grocery_batches for insert
      with check (auth.uid()=user_id and public.can_access_project(shopping_project_id,auth.uid()));
    create policy meal_plan_grocery_batches_update_own on public.meal_plan_grocery_batches for update using (auth.uid()=user_id)
      with check (auth.uid()=user_id and public.can_access_project(shopping_project_id,auth.uid()));
    alter table public.projects force row level security;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant execute on all functions in schema public to anon, authenticated;
  `);
  await db.query('insert into auth.users(id) values ($1),($2),($3)', [ids.owner, ids.member, ids.outsider]);
  await db.query(`insert into public.profiles(id,email) values($1,'q08-owner@example.test'),
    ($2,'q08-member@example.test'),($3,'q08-outsider@example.test')`, [ids.owner, ids.member, ids.outsider]);
  await db.query('insert into public.projects(id,user_id) values ($1,$2),($3,$4)',
    [ids.project, ids.owner, ids.otherProject, ids.outsider]);
  await db.query(`insert into public.project_members(project_id,user_id,member_email,invited_by_user_id)
    values ($1,$2,'q08-member@example.test',$3)`, [ids.project, ids.member, ids.owner]);
  await db.query(`insert into public.meal_library_meals(id,user_id,shopping_project_id,meal_slot,name)
    values ($1,$2,$3,'dinner','Q08 TEST Recipe'),($4,$5,$6,'dinner','Q08 TEST Other')`,
  [ids.meal, ids.owner, ids.project, ids.otherMeal, ids.outsider, ids.otherProject]);
  await db.query('insert into public.meal_library_ingredients(id,meal_id,ingredient_name) values($1,$2,$3)',
    [ids.ingredient, ids.meal, 'Q08 TEST Ingredient']);
  // Each member has their own week under the deployed personal-plan model.
  await db.query(`insert into public.meal_plan_weeks(id,user_id,shopping_project_id,week_start_date)
    values($1,$2,$3,'2026-09-28'),($4,$5,$3,'2026-10-05'),($6,$7,$8,'2026-09-28')`,
  [ids.week, ids.owner, ids.project, ids.memberWeek, ids.member, ids.otherWeek, ids.outsider, ids.otherProject]);
  await db.query(`insert into public.meal_plan_entries(id,week_id,meal_id,date,meal_slot)
    values($1,$2,$3,'2026-09-28','dinner'),($4,$5,$3,'2026-10-05','dinner'),($6,$7,$8,'2026-09-28','dinner')`,
  [ids.entry, ids.week, ids.meal, ids.memberEntry, ids.memberWeek, ids.otherEntry, ids.otherWeek, ids.otherMeal]);
  await db.query(`insert into public.meal_plan_grocery_batches(id,user_id,week_id,shopping_project_id)
    values($1,$2,$3,$4)`, [ids.batch, ids.member, ids.memberWeek, ids.project]);
  // Current live Q04 write paths must remain compatible with the new constraints.
  await migrate('2026-07-15_add_shopping_list_idempotent_add.sql');
  await migrate('2026-09-07_add_shopping_contribution_contract.sql');
  originalEntries = (await db.query('select to_jsonb(e) entry from public.meal_plan_entries e order by id')).rows;
  originalPolicies = (await db.query("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows;
  if (repaired) await migrate('2026-09-30_guard_household_meal_relationships.sql');
});
after(async () => db.close());

async function probe(user, query, params = [], { removed = false, anon = false, service = false } = {}) {
  await db.exec('begin');
  try {
    if (removed) await db.query('delete from public.project_members where project_id=$1 and user_id=$2', [ids.project, ids.member]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [anon ? '' : user]);
    await db.exec(service ? 'set local role service_role' : anon ? 'set local role anon' : 'set local role authenticated');
    return await (typeof query === 'function' ? query(db) : db.query(query, params));
  } finally { await db.exec('rollback'); }
}

async function unsafeProbe(attempt, check, codes = ['23503']) {
  if (repaired) await assert.rejects(attempt, error => codes.includes(error.code));
  else check(await attempt);
}

for (const [label, user, options, expected] of [
  ['owner', ids.owner, {}, 1], ['member', ids.member, {}, 1],
  ['outsider', ids.outsider, {}, 0], ['removed member', ids.member, { removed: true }, 0],
  ['anonymous', '', { anon: true }, 0],
]) {
  for (const [table, id] of [['meal_library_meals', ids.meal], ['meal_library_ingredients', ids.ingredient],
    ['meal_plan_weeks', ids.week], ['meal_plan_entries', ids.entry]]) {
    test(`${label} read ${table}: ${expected ? 'allowed' : 'denied'}`, async () => {
      const result = await probe(user, `select id from public.${table} where id=$1`, [id], options);
      assert.equal(result.rows.length, expected);
    });
  }
  test(`${label} edit shared recipe: ${expected ? 'allowed' : 'denied'}`, async () => {
    const result = await probe(user, 'update public.meal_library_meals set name=$1 where id=$2 returning id',
      ['Q08 TEST Edited', ids.meal], options);
    assert.equal(result.rows.length, expected);
  });
  test(`${label} create shared recipe: ${expected ? 'allowed' : 'denied'}`, async () => {
    const attempt = probe(user, `insert into public.meal_library_meals(user_id,shopping_project_id,meal_slot,name)
      values($1,$2,'dinner','Q08 TEST Added') returning id`, [user || ids.owner, ids.project], options);
    if (expected) assert.equal((await attempt).rows.length, 1);
    else await assert.rejects(attempt, error => error.code === '42501');
  });
  test(`${label} edit shared ingredient: ${expected ? 'allowed' : 'denied'}`, async () => {
    assert.equal((await probe(user, 'update public.meal_library_ingredients set ingredient_name=$1 where id=$2 returning id',
      ['Q08 TEST Edited', ids.ingredient], options)).rows.length, expected);
  });
  test(`${label} delete shared ingredient: ${expected ? 'allowed' : 'denied'}`, async () => {
    assert.equal((await probe(user, 'delete from public.meal_library_ingredients where id=$1 returning id',
      [ids.ingredient], options)).rows.length, expected);
  });
}

for (const [label, user, week, entry] of [
  ['owner', ids.owner, ids.week, ids.entry], ['member', ids.member, ids.memberWeek, ids.memberEntry],
]) {
  test(`${label} edits own planned entry`, async () => {
    assert.equal((await probe(user, 'update public.meal_plan_entries set serving_multiplier=2 where id=$1 returning id', [entry])).rows.length, 1);
  });
  test(`${label} adds entry using shared household recipe`, async () => {
    assert.equal((await probe(user, `insert into public.meal_plan_entries(week_id,meal_id,date,meal_slot)
      values($1,$2,'2026-10-06','dinner') returning id`, [week, ids.meal])).rows.length, 1);
  });
  test(`${label} cannot use recipe from another household`, async () => {
    await assert.rejects(probe(user, `insert into public.meal_plan_entries(week_id,meal_id,date,meal_slot)
      values($1,$2,'2026-10-06','dinner') returning id`, [week, ids.otherMeal]), error => error.code === '42501');
  });
}
test('member cannot edit owner personal plan', async () => {
  assert.equal((await probe(ids.member, 'update public.meal_plan_entries set serving_multiplier=2 where id=$1 returning id', [ids.entry])).rows.length, 0);
});
test('owner cannot edit member personal plan', async () => {
  assert.equal((await probe(ids.owner, 'update public.meal_plan_entries set serving_multiplier=2 where id=$1 returning id', [ids.memberEntry])).rows.length, 0);
});
test('removed member retains own plan reading under the deployed own-data policy', async () => {
  assert.equal((await probe(ids.member, 'select id from public.meal_plan_entries where id=$1', [ids.memberEntry], { removed: true })).rows.length, 1);
});
test('removed member cannot continue editing using the shared library', async () => {
  await assert.rejects(probe(ids.member, 'update public.meal_plan_entries set serving_multiplier=2 where id=$1 returning id',
    [ids.memberEntry], { removed: true }), error => error.code === '42501');
});

// Baseline captures the inspected pre-repair acceptance. Repair mode requires
// each unsafe attempt to fail; passing baseline alone does NOT mean it is safe.
test(`${gapLabel}: outsider attaches own batch to inaccessible household week`, async () => {
  await unsafeProbe(probe(ids.outsider, `insert into public.meal_plan_grocery_batches(user_id,week_id,shopping_project_id)
    values($1,$2,$3) returning id`, [ids.outsider, ids.week, ids.otherProject]), result => assert.equal(result.rows.length, 1));
});
test(`${gapLabel}: member redirects own batch to another household week`, async () => {
  await unsafeProbe(probe(ids.member, `update public.meal_plan_grocery_batches set week_id=$1 where id=$2 returning id`,
    [ids.otherWeek, ids.batch]), result => assert.equal(result.rows.length, 1));
});
test(`${gapLabel}: outsider attaches carryover to inaccessible source entry`, async () => {
  await unsafeProbe(probe(ids.outsider, `insert into public.meal_plan_entries(week_id,meal_id,date,meal_slot,entry_kind,carryover_source_entry_id)
    values($1,$2,'2026-09-29','dinner','carryover',$3) returning id`, [ids.otherWeek, ids.otherMeal, ids.entry]), result => assert.equal(result.rows.length, 1));
});
test(`${gapLabel}: member redirects carryover source across households`, async () => {
  await unsafeProbe(probe(ids.member, `update public.meal_plan_entries set entry_kind='carryover',carryover_source_entry_id=$1
    where id=$2 returning id`, [ids.otherEntry, ids.memberEntry]), result => assert.equal(result.rows.length, 1));
});
test(`${gapLabel}: anonymous helper reveals owner UUID for a known inaccessible project`, async () => {
  await unsafeProbe(probe('', 'select public.project_owner_id($1) as owner', [ids.project], { anon: true }),
    result => assert.equal(result.rows[0].owner, ids.owner), ['42501']);
});
test('source RPC and project helper bodies match the owner-supplied live fingerprints', async () => {
  const fingerprints = {
    can_access_project: 'ea6863e62fe40f1c0aab8a7edf928a79',
    is_project_member: 'd6359dbdbb6733dca50aa4c067e5f2ba',
    is_project_owner: 'e509cf518d1944d15130ff9f2ddd4fae',
    project_owner_id: '7b771bcd7ce40fb81bf2943c78d5882b',
    upsert_shopping_list_item: '0f612ef1f618a83a6625ed45a3a93ec0',
    enforce_project_collaborator_seat_cap: '624429076e0861988cd0af2f79426514',
    invite_project_member: '9f67fc89bb2235e0e49c3143f6a69db1',
  };
  const result = await db.query(`select p.proname,md5(regexp_replace(p.prosrc,'\\s+','','g')) fingerprint
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1)`,
  [Object.keys(fingerprints)]);
  assert.equal(result.rows.length, Object.keys(fingerprints).length);
  for (const row of result.rows) assert.equal(row.fingerprint, fingerprints[row.proname], row.proname);
});
test('anonymous shopping RPC remains authentication guarded despite its EXECUTE grant', async () => {
  await assert.rejects(probe('', 'select public.upsert_shopping_list_item($1,$2)', [ids.project, 'Q08 TEST Added'], { anon: true }),
    error => error.message === 'AUTHENTICATION_REQUIRED');
});
test('outsider shopping RPC cannot write into another household project', async () => {
  await assert.rejects(probe(ids.outsider, 'select public.upsert_shopping_list_item($1,$2)', [ids.project, 'Q08 TEST Added']),
    error => error.message === 'PROJECT_ACCESS_REQUIRED');
});
test(`${gapLabel}: shopping RPC accepts a batch reference from an inaccessible household`, async () => {
  await unsafeProbe(probe(ids.outsider, `select (public.upsert_shopping_list_item($1,$2,null,'','meal_plan',$3)).source_batch_id batch`,
    [ids.otherProject, 'Q08 TEST Cross-batch', ids.batch]), result => assert.equal(result.rows[0].batch, ids.batch));
});

for (const [label, user, options] of [['anonymous', '', { anon: true }], ['outsider', ids.outsider, {}]]) {
  test(`${gapLabel}: ${label} invokes server-only invite using supplied owner ID`, async () => {
    await unsafeProbe(probe(user, async tx => {
      const invited = await tx.query('select public.invite_project_member($1,$2,$3) result',
        [ids.project, 'q08-outsider@example.test', ids.owner]);
      assert.equal(invited.rows[0].result.ok, true);
      return tx.query('select public.can_access_project($1,$2) allowed', [ids.project, ids.outsider]);
    }, [], options), result => assert.equal(result.rows[0].allowed, true), ['42501']);
  });
}
test('protected service-role invitation remains available and validates the supplied owner', async () => {
  const valid = await probe('', 'select public.invite_project_member($1,$2,$3) result',
    [ids.project, 'q08-outsider@example.test', ids.owner], { service: true });
  assert.equal(valid.rows[0].result.ok, true);
  const invalid = await probe('', 'select public.invite_project_member($1,$2,$3) result',
    [ids.project, 'q08-outsider@example.test', ids.member], { service: true });
  assert.equal(invalid.rows[0].result.code, 'forbidden');
});

if (repaired) {
  const privilegedProbe = async (query, params = []) => {
    await db.exec('begin');
    try { return await db.query(query, params); } finally { await db.exec('rollback'); }
  };
  test('repair preserves every existing entry field and its modification timestamp', async () => {
    const current = (await db.query("select to_jsonb(e)-'shopping_project_id' entry from public.meal_plan_entries e order by id")).rows;
    assert.deepEqual(current, originalEntries);
  });
  test('repair leaves every existing RLS policy unchanged', async () => {
    assert.deepEqual((await db.query("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows, originalPolicies);
  });
  test('repair reapplication preserves data and policies', async () => {
    await migrate('2026-09-30_guard_household_meal_relationships.sql');
    assert.deepEqual((await db.query("select to_jsonb(e)-'shopping_project_id' entry from public.meal_plan_entries e order by id")).rows, originalEntries);
  });
  test('entry household is derived, ignoring a forged household value', async () => {
    const result = await probe(ids.member, 'update public.meal_plan_entries set shopping_project_id=$1 where id=$2 returning shopping_project_id',
      [ids.otherProject, ids.memberEntry]);
    assert.equal(result.rows[0].shopping_project_id, ids.project);
  });
  test('member can create carryover from a visible plan in the SAME household', async () => {
    const result = await probe(ids.member, `insert into public.meal_plan_entries(week_id,meal_id,date,meal_slot,entry_kind,carryover_source_entry_id)
      values($1,$2,'2026-10-06','dinner','carryover',$3) returning id`, [ids.memberWeek, ids.meal, ids.entry]);
    assert.equal(result.rows.length, 1);
  });
  test('legitimate shopping RPC batch provenance remains usable', async () => {
    const result = await probe(ids.member, `select (public.upsert_shopping_list_item($1,$2,null,'','meal_plan',$3)).source_batch_id batch`,
      [ids.project, 'Q08 TEST Valid batch', ids.batch]);
    assert.equal(result.rows[0].batch, ids.batch);
  });
  test('ordinary shopping add without a batch remains usable', async () => {
    const result = await probe(ids.member, 'select (public.upsert_shopping_list_item($1,$2)).title title', [ids.project, 'Q08 TEST Normal']);
    assert.equal(result.rows[0].title, 'Q08 TEST Normal');
  });
  test('personal todo cannot evade batch boundary with a null project', async () => {
    await assert.rejects(probe(ids.outsider, `insert into public.manual_todos(user_id,title,source_batch_id)
      values($1,'Q08 TEST Null-project',$2) returning id`, [ids.outsider, ids.batch]), error => error.code === '23514');
  });
  test('authenticated outsider cannot call raw owner lookup directly', async () => {
    await assert.rejects(probe(ids.outsider, 'select public.project_owner_id($1)', [ids.project]), error => error.code === '42501');
  });
  for (const [table, row] of [['meal_plan_weeks', ids.week], ['meal_library_meals', ids.meal]]) {
    test(`privileged parent household change cannot invalidate ${table} dependants`, async () => {
      await assert.rejects(privilegedProbe(`update public.${table} set shopping_project_id=$1 where id=$2`,
        [ids.otherProject, row]), error => error.code === '23503');
    });
  }
  test('deleting a batch retains its shopping row and clears provenance as before', async () => {
    await probe(ids.member, async tx => {
      await tx.query(`select public.upsert_shopping_list_item($1,'Q08 TEST Batch delete',null,'','meal_plan',$2)`, [ids.project, ids.batch]);
      await tx.query('delete from public.meal_plan_grocery_batches where id=$1', [ids.batch]);
      const result = await tx.query("select source_batch_id from public.manual_todos where title='Q08 TEST Batch delete'");
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].source_batch_id, null);
    });
  });
  test('same-household carryover still cascades when its source is deleted', async () => {
    await probe(ids.member, async tx => {
      const created = await tx.query(`insert into public.meal_plan_entries(week_id,meal_id,date,meal_slot,entry_kind,carryover_source_entry_id)
        values($1,$2,'2026-10-06','dinner','carryover',$3) returning id`, [ids.memberWeek, ids.meal, ids.memberEntry]);
      await tx.query('delete from public.meal_plan_entries where id=$1', [ids.memberEntry]);
      assert.equal((await tx.query('select id from public.meal_plan_entries where id=$1', [created.rows[0].id])).rows.length, 0);
    });
  });
  for (const version of [2, 3]) {
    test(`current Shopping v${version} accepts same-household batch provenance`, async () => {
      const result = await probe(ids.member, `select to_jsonb(public.apply_shopping_list_add_v${version}($1,$2,$3,null,'','meal_plan',$4)) result`,
        [randomUUID(), ids.project, `Q08 TEST v${version}`, ids.batch]);
      const row = version === 3 ? result.rows[0].result.current_item : result.rows[0].result;
      assert.equal(row.source_batch_id, ids.batch);
    });
    test(`current Shopping v${version} rejects cross-household batch provenance`, async () => {
      await assert.rejects(probe(ids.outsider, `select public.apply_shopping_list_add_v${version}($1,$2,$3,null,'','meal_plan',$4)`,
        [randomUUID(), ids.otherProject, `Q08 TEST Cross v${version}`, ids.batch]), error => error.code === '23503');
    });
  }
  test('Meal grocery approval fallback can replace a valid batch using existing table permissions', async () => {
    await probe(ids.member, async tx => {
      await tx.query(`insert into public.meal_plan_grocery_batches(id,user_id,week_id,shopping_project_id,status)
        values($1,$2,$3,$4,'approved') on conflict(week_id) do update set status='approved'`,
      [ids.batch, ids.member, ids.memberWeek, ids.project]);
      await tx.query('delete from public.manual_todos where source_batch_id=$1', [ids.batch]);
      const result = await tx.query(`insert into public.manual_todos(user_id,project_id,title,source_type,source_batch_id)
        values($1,$2,'Q08 TEST Approved','meal_plan',$3) returning id`, [ids.member, ids.project, ids.batch]);
      assert.equal(result.rows.length, 1);
    });
  });
  test('native FK prevents a concurrent household move while a valid batch is being created', { skip: !db.native }, async () => {
    const week = randomUUID();
    await db.query(`insert into public.meal_plan_weeks(id,user_id,shopping_project_id,week_start_date)
      values($1,$2,$3,'2027-01-04')`, [week, ids.owner, ids.project]);
    const child = await db.connection();
    const parent = await db.connection();
    try {
      await child.exec('begin');
      await child.query("select set_config('request.jwt.claim.sub',$1,true)", [ids.owner]);
      await child.exec('set local role authenticated');
      await child.query(`insert into public.meal_plan_grocery_batches(user_id,week_id,shopping_project_id)
        values($1,$2,$3)`, [ids.owner, week, ids.project]);
      await parent.exec('begin');
      const pid = (await parent.query('select pg_backend_pid() pid')).rows[0].pid;
      const move = parent.query('update public.meal_plan_weeks set shopping_project_id=$1 where id=$2', [ids.otherProject, week])
        .then(() => ({ allowed: true }), error => ({ error }));
      const deadline = Date.now() + 4000;
      let blocked = false;
      while (Date.now() < deadline) {
        const status = await db.query('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
        if (status.rows[0]?.wait_event_type === 'Lock') { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true, 'parent update must wait for the child FK lock');
      await child.exec('commit');
      assert.equal((await move).error?.code, '23503', 'committed child cannot become orphaned');
    } finally {
      await child.exec('rollback');
      await parent.exec('rollback');
      await child.close();
      await parent.close();
      await db.query('delete from public.meal_plan_weeks where id=$1', [week]);
    }
  });
}

if (!repaired) {
  test('dirty existing links abort the entire migration without applying schema or ACL changes', async () => {
    const badBatch = randomUUID();
    await db.query(`insert into public.meal_plan_grocery_batches(id,user_id,week_id,shopping_project_id)
      values($1,$2,$3,$4)`, [badBatch, ids.outsider, ids.week, ids.otherProject]);
    try {
      await assert.rejects(migrate('2026-09-30_guard_household_meal_relationships.sql'), error => error.message.startsWith('Q08_RELATIONSHIP_MISMATCH'));
    } finally { await db.exec('rollback'); }
    assert.equal((await db.query(`select count(*)::int count from information_schema.columns where table_schema='public'
      and table_name='meal_plan_entries' and column_name='shopping_project_id'`)).rows[0].count, 0);
    assert.equal((await probe('', 'select public.project_owner_id($1) owner', [ids.project], { anon: true })).rows[0].owner, ids.owner);
    await db.query('delete from public.meal_plan_grocery_batches where id=$1', [badBatch]);
  });
  test('legacy unlinked plans abort safely instead of changing or deleting personal data', async () => {
    await db.query('update public.meal_plan_weeks set shopping_project_id=null where id=$1', [ids.week]);
    try {
      await assert.rejects(migrate('2026-09-30_guard_household_meal_relationships.sql'), error => error.message.startsWith('Q08_LEGACY_UNLINKED_ENTRIES'));
    } finally { await db.exec('rollback'); }
    assert.equal((await db.query('select id from public.meal_plan_entries where id=$1', [ids.entry])).rows.length, 1);
    await db.query('update public.meal_plan_weeks set shopping_project_id=$1 where id=$2', [ids.project, ids.week]);
  });
}
