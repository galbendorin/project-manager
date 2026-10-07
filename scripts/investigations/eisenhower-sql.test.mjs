import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, after, test } from "node:test";
import { createShoppingTestDatabase } from "./shopping-test-database.mjs";
const db = await createShoppingTestDatabase();
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  c = "33333333-3333-4333-8333-333333333333";
const project = "44444444-4444-4444-8444-444444444444",
  todo = "55555555-5555-4555-8555-555555555555";
before(async () => {
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
  create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.projects(id uuid primary key,user_id uuid);
  create table public.project_members(project_id uuid,user_id uuid);
  create function public.can_access_project(target uuid,subject uuid) returns boolean language sql security definer set search_path='' as $$select subject is not null and (exists(select 1 from public.projects p where p.id=target and p.user_id=subject) or exists(select 1 from public.project_members m where m.project_id=target and m.user_id=subject))$$;
  create table public.manual_todos(id uuid primary key,user_id uuid,project_id uuid references public.projects(id));
  alter table public.manual_todos enable row level security;
  create policy manual_access on public.manual_todos for all to authenticated using((project_id is null and user_id=auth.uid()) or public.can_access_project(project_id,auth.uid()));
  grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid(),public.can_access_project(uuid,uuid) to authenticated;
  grant select on public.manual_todos to authenticated;
  insert into auth.users values('${a}'),('${b}'),('${c}');
  insert into public.projects values('${project}','${a}');insert into public.project_members values('${project}','${b}');
  insert into public.manual_todos values('${todo}','${a}','${project}');`);
  await db.exec(
    await readFile(
      new URL(
        "../sql/2026-10-05_add_task_eisenhower_preferences.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(await readFile(new URL('../sql/2026-10-05_add_personal_task_planned_day.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../sql/2026-10-07_task_quadrant_choice_day.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../sql/2026-10-07_task_quadrant_choice_day.sql', import.meta.url), 'utf8'));
});
after(() => db.close());
async function probe(user, fn, role = "authenticated") {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    await db.exec(`set local role ${role}`);
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}
const insert = (user = a) =>
  db.query(
    "insert into public.task_eisenhower_preferences(user_id,manual_todo_id,manual_quadrant) values($1,$2,'not_urgent_important') returning *",
    [user, todo],
  );
test('personal work-day writes preserve priority and priority writes preserve the date through CAS', async () => probe(a, async () => {
  const row = (await insert()).rows[0];
  const planned = (await db.query("update public.task_eisenhower_preferences set planned_day='2026-10-05' where id=$1 and version=1 returning planned_day::text,manual_quadrant,version", [row.id])).rows[0];
  assert.equal(planned.planned_day, '2026-10-05'); assert.equal(planned.manual_quadrant, 'not_urgent_important'); assert.equal(planned.version, 2);
  const moved = (await db.query("update public.task_eisenhower_preferences set manual_quadrant='urgent_not_important' where id=$1 and version=2 returning planned_day::text,version", [row.id])).rows[0];
  assert.equal(moved.planned_day, '2026-10-05'); assert.equal(moved.version, 3);
  assert.equal((await db.query("update public.task_eisenhower_preferences set planned_day=null where id=$1 and version=2 returning id", [row.id])).rows.length, 0);
}));
test('another account cannot read or replace a personal work day', async () => probe(a, async () => {
  const row = (await insert()).rows[0];
  await db.query("update public.task_eisenhower_preferences set planned_day='2026-10-05' where id=$1", [row.id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [b]);
  assert.equal((await db.query('update public.task_eisenhower_preferences set planned_day=null where id=$1 returning id', [row.id])).rows.length, 0);
  assert.equal((await db.query('select * from public.task_eisenhower_preferences where id=$1', [row.id])).rows.length, 0);
}));
test("personal owner/member placements are separately visible with server-derived keys", async () =>
  probe(a, async () => {
    const row = (await insert()).rows[0];
    assert.equal(row.task_key, `manual:${todo}`);
    assert.equal(row.version, 1);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [b]);
    assert.equal(
      (await db.query("select * from public.task_eisenhower_preferences")).rows
        .length,
      0,
    );
    assert.equal((await insert(b)).rows.length, 1);
  }));
test("outsider cannot classify an inaccessible manual task", async () =>
  assert.rejects(
    probe(c, () => insert(c)),
    (e) => e.code === "42501",
  ));
test("member cannot write another user preference", async () =>
  assert.rejects(
    probe(b, () => insert(a)),
    (e) => e.code === "42501",
  ));
test("anonymous cannot read or write priorities", async () =>
  assert.rejects(
    probe(
      "",
      () => db.query("select * from public.task_eisenhower_preferences"),
      "anon",
    ),
    (e) => e.code === "42501",
  ));
test("CAS acknowledges once and a stale write returns zero rows", async () =>
  probe(a, async () => {
    const row = (await insert()).rows[0];
    assert.equal(
      (
        await db.query(
          "update public.task_eisenhower_preferences set manual_quadrant='urgent_important',version=99 where id=$1 and version=1 returning version",
          [row.id],
        )
      ).rows[0].version,
      2,
    );
    assert.equal(
      (
        await db.query(
          "update public.task_eisenhower_preferences set manual_quadrant='urgent_not_important' where id=$1 and version=1 returning id",
          [row.id],
        )
      ).rows.length,
      0,
    );
  }));
test("identity cannot be reassigned by an update", async () =>
  assert.rejects(
    probe(a, async () => {
      const row = (await insert()).rows[0];
      await db.query(
        "update public.task_eisenhower_preferences set project_id=$1,manual_todo_id=null,card_key=$2 where id=$3",
        [project, "schedule:1", row.id],
      );
    }),
    (e) => e.code === "22023",
  ));
test("revoked membership hides its private preference", async () => {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [b]);
    await db.exec("set local role authenticated");
    await insert(b);
    await db.exec("reset role");
    await db.query("delete from public.project_members where user_id=$1", [b]);
    await db.exec("set local role authenticated");
    assert.equal(
      (await db.query("select * from public.task_eisenhower_preferences")).rows
        .length,
      0,
    );
  } finally {
    await db.exec("rollback");
  }
});
test("same derived source in different projects does not collide", async () => {
  await db.exec("begin");
  try {
    await db.query("insert into public.projects values($1,$2)", [c, a]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [a]);
    await db.exec("set local role authenticated");
    const rows = (
      await db.query(
        "insert into public.task_eisenhower_preferences(user_id,project_id,card_key,manual_quadrant) values($1,$2,'schedule:1','urgent_important'),($1,$3,'schedule:1','not_urgent_important') returning task_key",
        [a, project, c],
      )
    ).rows;
    assert.notEqual(rows[0].task_key, rows[1].task_key);
  } finally {
    await db.exec("rollback");
  }
});
test("manual priority follows its task between projects and requires current source access", async () => {
  await db.exec("begin");
  try {
    await db.query("insert into public.projects values($1,$2)", [c, a]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [a]);
    await db.exec("set local role authenticated");
    await insert();
    await db.exec("reset role");
    await db.query("update public.manual_todos set project_id=$1 where id=$2", [
      c,
      todo,
    ]);
    await db.exec("set local role authenticated");
    assert.equal(
      (
        await db.query(
          "select task_key from public.task_eisenhower_preferences",
        )
      ).rows[0].task_key,
      `manual:${todo}`,
    );
    await db.exec("reset role");
    await db.query("update public.projects set user_id=$1 where id=$2", [c, c]);
    await db.exec("set local role authenticated");
    assert.equal(
      (await db.query("select id from public.task_eisenhower_preferences")).rows
        .length,
      0,
    );
  } finally {
    await db.exec("rollback");
  }
});
test('quadrant choice day survives personal-day edits and stays private', async () => probe(a, async () => {
 const row=(await insert()).rows[0];
 await db.query("update public.task_eisenhower_preferences set manual_quadrant_day='2026-10-07',manual_quadrant='urgent_not_important' where id=$1 and version=1",[row.id]);
 const saved=(await db.query("update public.task_eisenhower_preferences set planned_day='2026-10-08' where id=$1 and version=2 returning manual_quadrant_day::text,manual_quadrant,version",[row.id])).rows[0];
 assert.equal(saved.manual_quadrant_day,'2026-10-07');assert.equal(saved.manual_quadrant,'urgent_not_important');assert.equal(saved.version,3);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);
 assert.equal((await db.query('select * from public.task_eisenhower_preferences where id=$1',[row.id])).rows.length,0);
 assert.equal((await db.query("update public.task_eisenhower_preferences set manual_quadrant_day='2026-10-08' where id=$1 returning id",[row.id])).rows.length,0);
}));
