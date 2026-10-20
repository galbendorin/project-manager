import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db = new PGlite();
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
const privateBaby = '44444444-4444-4444-8444-444444444444', sharedBaby = '55555555-5555-4555-8555-555555555555';
const project = '66666666-6666-4666-8666-666666666666';
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create table public.baby_profiles(id uuid primary key,user_id uuid,household_project_id uuid,archived_at timestamptz);
    create function public.can_access_baby_row(u uuid,p uuid) returns boolean language sql stable as $$ select u=auth.uid() or (p='${project}' and auth.uid() in ('${a}','${b}')) $$;
    alter table public.baby_profiles enable row level security;
    create policy profile_access on public.baby_profiles using(public.can_access_baby_row(user_id,household_project_id));
    grant select on public.baby_profiles to authenticated;
    insert into public.baby_profiles values('${privateBaby}','${a}',null,null),('${sharedBaby}','${a}','${project}',null);`);
  const migration = await readFile(new URL('../sql/2026-10-20_exact_baby_sleep.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
});
after(() => db.close());
async function asUser(user, action, role = 'authenticated') {
  await db.exec('begin');
  try { await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]); await db.exec(`set local role ${role}`); return await action(); }
  finally { await db.exec('rollback'); }
}
const insert = (baby = privateBaby, start = 967, end = 1003, notes = 'Journey interrupted sleep.') => db.query("insert into public.baby_sleep_entries(baby_id,sleep_date,start_minute,end_minute,notes) values($1,'2026-10-20',$2,$3,$4) returning *", [baby,start,end,notes]);
test('exact times and notes persist together; version guards stop stale edits and soft removal retains the record', async () => asUser(a, async () => {
  const row = (await insert()).rows[0];
  assert.equal(row.end_minute - row.start_minute, 36); assert.equal(row.notes, 'Journey interrupted sleep.');
  const updated = (await db.query("update public.baby_sleep_entries set notes='Woke during journey' where id=$1 and version=1 returning *", [row.id])).rows[0];
  assert.equal(updated.version, 2);
  assert.equal((await db.query("update public.baby_sleep_entries set notes='stale' where id=$1 and version=1 returning id", [row.id])).rows.length, 0);
  await db.query('update public.baby_sleep_entries set archived_at=now() where id=$1 and version=2', [row.id]);
  const saved = (await db.query('select * from public.baby_sleep_entries where id=$1', [row.id])).rows[0];
  assert.ok(saved.archived_at); assert.equal(saved.notes, 'Woke during journey');
}));
test('owners and existing household collaborators can use only the referenced accessible profile', async () => {
  await asUser(a, () => insert(privateBaby)); await asUser(b, () => insert(sharedBaby));
  await assert.rejects(asUser(b, () => insert(privateBaby)), error => error.code === '42501');
  await assert.rejects(asUser(c, () => insert(sharedBaby)), error => error.code === '42501');
  await assert.rejects(asUser(a, () => insert(privateBaby), 'anon'), error => error.code === '42501');
  await asUser(a, async () => {
    const row = (await insert()).rows[0];
    await assert.rejects(db.query('update public.baby_sleep_entries set baby_id=$1 where id=$2', [sharedBaby,row.id]), /identity cannot change/);
  });
});
test('database rejects invalid intervals and long notes, but accepts explicit overnight sleep', async () => {
  for (const [start,end,notes] of [[-1,30,''],[1440,1450,''],[967,967,''],[967,2408,''],[967,1003,'x'.repeat(2001)]]) {
    await assert.rejects(asUser(a, () => insert(privateBaby,start,end,notes)), error => error.code === '23514');
  }
  await asUser(a, async () => assert.equal((await insert(privateBaby,1427,1483)).rows[0].end_minute,1483));
});

test('installation verification reports the protected table, constraints, policy and version trigger', async () => {
  const results = await db.exec(await readFile(new URL('../sql/2026-10-20_verify_exact_baby_sleep.sql', import.meta.url), 'utf8'));
  const rows = results.flatMap(result => result.rows);
  // Newer PostgreSQL catalogs also expose NOT NULL constraints here.
  for (const name of ['baby_sleep_entries_pkey','baby_sleep_entries_baby_id_fkey','baby_sleep_entry_interval_check','baby_sleep_entry_version_check']) {
    assert.ok(rows.some(row => row.kind === 'constraint' && row.object_name === name && row.detail.validated));
  }
  assert.equal(rows.filter(row => row.kind === 'policy').length,1);
  assert.equal(rows.filter(row => row.kind === 'trigger').length,1);
  const table = rows.find(row => row.kind === 'table').detail;
  assert.equal(table.rls, true); assert.equal(table.anon_select, false);
  assert.equal(table.authenticated_insert, true); assert.equal(table.authenticated_update, true); assert.equal(table.authenticated_delete, false);
});
