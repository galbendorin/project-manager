import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getNextRecurringDueDate } from '../../src/utils/helpers.js';

const { PGlite } = await import(
  process.env.PGLITE_MODULE
    ? pathToFileURL(process.env.PGLITE_MODULE).href
    : '@electric-sql/pglite'
);

const db = new PGlite();

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const userC = '33333333-3333-4333-8333-333333333333';
const sharedProject = '44444444-4444-4444-8444-444444444444';
const otherProject = '55555555-5555-4555-8555-555555555555';

let savepointCounter = 0;

async function asUser(userId, action, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId || '']);
    await db.exec(`set local role ${role}`);
    return await action();
  } finally {
    await db.exec('rollback');
  }
}

async function withSavepoint(action) {
  const name = `sp_${++savepointCounter}`;
  await db.exec(`savepoint ${name}`);
  try {
    const result = await action();
    await db.exec(`release savepoint ${name}`);
    return result;
  } catch (error) {
    await db.exec(`rollback to savepoint ${name}`);
    await db.exec(`release savepoint ${name}`);
    throw error;
  }
}

async function setupBaseSchema(targetDb) {
  await targetDb.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;

    create schema if not exists auth;
    create table auth.users (
      id uuid primary key
    );
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    insert into auth.users(id) values
      ('${userA}'),
      ('${userB}'),
      ('${userC}');

    create table public.projects (
      id uuid primary key,
      user_id uuid not null references auth.users(id) on delete cascade,
      version bigint not null default 1,
      updated_at timestamptz not null default timezone('utc', now())
    );

    insert into public.projects(id, user_id) values
      ('${sharedProject}', '${userA}'),
      ('${otherProject}', '${userC}');

    create table public.project_members (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.projects(id) on delete cascade,
      user_id uuid not null references auth.users(id) on delete cascade,
      member_email text not null,
      role text not null default 'editor',
      invited_by_user_id uuid not null references auth.users(id)
    );

    insert into public.project_members(project_id, user_id, member_email, invited_by_user_id)
    values ('${sharedProject}', '${userB}', 'collab@example.test', '${userA}');

    create table public.task_board_columns (
      id uuid primary key
    );

    create table public.manual_todos (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      project_id uuid null references public.projects(id) on delete cascade,
      title text not null default '',
      due_date date null,
      owner_text text not null default '',
      assignee_user_id uuid null references auth.users(id) on delete set null,
      status text not null default 'Open' check (status in ('Open', 'Done')),
      recurrence jsonb null,
      completed_at timestamptz null,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now()),
      description text not null default '',
      kanban_column_id uuid null references public.task_board_columns(id) on delete set null,
      kanban_position double precision not null default 0,
      source_type text not null default '',
      source_batch_id uuid null,
      meta jsonb not null default '{}'::jsonb
    );

    create or replace function public.project_owner_id(target_project_id uuid)
    returns uuid language sql security definer stable set search_path = public as $$
      select p.user_id from public.projects p where p.id = target_project_id limit 1
    $$;

    create or replace function public.is_project_owner(target_project_id uuid, subject_user uuid)
    returns boolean language sql security definer stable set search_path = public as $$
      select coalesce(public.project_owner_id(target_project_id) = subject_user, false)
    $$;

    create or replace function public.is_project_member(target_project_id uuid, subject_user uuid)
    returns boolean language sql security definer stable set search_path = public as $$
      select exists (
        select 1 from public.project_members pm
        where pm.project_id = target_project_id and pm.user_id = subject_user
      )
    $$;

    create or replace function public.can_access_project(target_project_id uuid, subject_user uuid)
    returns boolean language sql security definer stable set search_path = public as $$
      select coalesce(subject_user is not null, false) and (
        public.is_project_owner(target_project_id, subject_user)
        or public.is_project_member(target_project_id, subject_user)
      )
    $$;

    create or replace function public.can_access_manual_todo(target_project_id uuid, row_user_id uuid, subject_user uuid)
    returns boolean language sql security definer stable set search_path = public as $$
      select case
        when subject_user is null then false
        when target_project_id is null then row_user_id = subject_user
        else public.can_access_project(target_project_id, subject_user)
      end
    $$;

    create or replace function public.can_insert_manual_todo(target_project_id uuid, row_user_id uuid, subject_user uuid)
    returns boolean language sql security definer stable set search_path = public as $$
      select row_user_id = subject_user
        and (target_project_id is null or public.can_access_project(target_project_id, subject_user))
    $$;

    create or replace function public.can_update_manual_todo(
      target_todo_id uuid,
      new_project_id uuid,
      new_user_id uuid,
      subject_user uuid
    ) returns boolean language plpgsql security definer stable set search_path = public as $$
    declare
      existing_user_id uuid;
      existing_project_id uuid;
    begin
      if subject_user is null or target_todo_id is null then return false; end if;
      select mt.user_id, mt.project_id into existing_user_id, existing_project_id
      from public.manual_todos mt where mt.id = target_todo_id;
      if not found then return false; end if;
      if new_user_id is distinct from existing_user_id then return false; end if;
      if existing_project_id is null then
        return new_user_id = subject_user and (new_project_id is null or public.can_access_project(new_project_id, subject_user));
      end if;
      if existing_user_id = subject_user then
        return new_user_id = subject_user and (new_project_id is null or public.can_access_project(new_project_id, subject_user));
      end if;
      return new_project_id is not null and public.can_access_project(new_project_id, subject_user);
    end;
    $$;

    alter table public.manual_todos enable row level security;
    grant select, insert, update, delete on public.manual_todos to authenticated;

    create policy "manual_todos_select_own" on public.manual_todos
      for select using (public.can_access_manual_todo(project_id, user_id, auth.uid()));
    create policy "manual_todos_insert_own" on public.manual_todos
      for insert with check (public.can_insert_manual_todo(project_id, user_id, auth.uid()));
    create policy "manual_todos_update_own" on public.manual_todos
      for update
      using (public.can_access_manual_todo(project_id, user_id, auth.uid()))
      with check (public.can_update_manual_todo(id, project_id, user_id, auth.uid()));
    create policy "manual_todos_delete_own" on public.manual_todos
      for delete using (public.can_access_manual_todo(project_id, user_id, auth.uid()));
  `);
}

let migrationSql = '';

before(async () => {
  await setupBaseSchema(db);

  // Verify upgrade safety over an earlier 4-arg version using p_next_due_date (avoids SQLSTATE 42P13).
  await db.exec(`
    create or replace function public.complete_recurring_manual_todo_v1(
      p_todo_id uuid,
      p_next_due_date date,
      p_completed_at timestamptz default null,
      p_follow_up_id uuid default null
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
  `);

  migrationSql = await readFile(
    new URL('../sql/2026-11-23_atomic_recurring_todo_completion.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migrationSql);
  await db.exec(migrationSql);
});

after(() => db.close());

test('migration locks function grants strictly to authenticated and service_role and respects RLS across owners and collaborators', async () => {
  const privs = (await db.query(`
    select
      has_function_privilege('anon', 'public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid, boolean, timestamptz)', 'execute') as anon_exec,
      has_function_privilege('public', 'public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid, boolean, timestamptz)', 'execute') as public_exec,
      has_function_privilege('authenticated', 'public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid, boolean, timestamptz)', 'execute') as auth_exec,
      has_function_privilege('anon', 'public.next_recurring_todo_due_date_v1(date, jsonb)', 'execute') as date_anon_exec,
      has_function_privilege('public', 'public.next_recurring_todo_due_date_v1(date, jsonb)', 'execute') as date_public_exec,
      has_function_privilege('authenticated', 'public.next_recurring_todo_due_date_v1(date, jsonb)', 'execute') as date_auth_exec,
      has_function_privilege('anon', 'public.recurring_todo_write_context_v1()', 'execute') as ctx_anon_exec,
      has_function_privilege('public', 'public.recurring_todo_write_context_v1()', 'execute') as ctx_public_exec,
      has_function_privilege('authenticated', 'public.recurring_todo_write_context_v1()', 'execute') as ctx_auth_exec,
      has_function_privilege('anon', 'public.guard_manual_todo_recurrence_link_v1()', 'execute') as guard_anon_exec,
      has_function_privilege('public', 'public.guard_manual_todo_recurrence_link_v1()', 'execute') as guard_public_exec,
      has_function_privilege('authenticated', 'public.guard_manual_todo_recurrence_link_v1()', 'execute') as guard_auth_exec
  `)).rows[0];

  assert.equal(privs.anon_exec, false);
  assert.equal(privs.public_exec, false);
  assert.equal(privs.auth_exec, true);
  assert.equal(privs.date_anon_exec, false);
  assert.equal(privs.date_public_exec, false);
  assert.equal(privs.date_auth_exec, true);
  assert.equal(privs.ctx_anon_exec, false);
  assert.equal(privs.ctx_public_exec, false);
  assert.equal(privs.ctx_auth_exec, true);
  assert.equal(privs.guard_anon_exec, false);
  assert.equal(privs.guard_public_exec, false);
  assert.equal(privs.guard_auth_exec, false);

  await asUser(userA, async () => {
    const privateId = '66666666-6666-4666-8666-666666666601';
    const sharedId = '66666666-6666-4666-8666-666666666602';
    await db.query(
      `insert into public.manual_todos(id, user_id, project_id, title, due_date, recurrence)
       values ($1, $2, null, 'Private owner task', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb),
              ($3, $2, $4, 'Shared project task', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb)`,
      [privateId, userA, sharedId, sharedProject]
    );

    await assert.rejects(
      withSavepoint(async () => {
        await db.exec('set local role anon');
        await db.query('select public.complete_recurring_manual_todo_v1($1)', [sharedId]);
      }),
      /permission denied|42501/
    );

    await assert.rejects(
      withSavepoint(async () => {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userC]);
        await db.query('select public.complete_recurring_manual_todo_v1($1)', [privateId]);
      }),
      (err) => err.code === '42501'
    );
    await assert.rejects(
      withSavepoint(async () => {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userC]);
        await db.query('select public.complete_recurring_manual_todo_v1($1)', [sharedId]);
      }),
      (err) => err.code === '42501'
    );

    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userB]);
    const res = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, $2, $3, $4) as payload',
      [sharedId, '2026-10-01', '2026-10-08T12:00:00Z', '77777777-7777-4777-8777-777777777702']
    )).rows[0].payload;

    assert.equal(res.updated_todo.status, 'Done');
    assert.equal(res.follow_up_todo.recurrence_source_todo_id, sharedId);
    assert.equal(res.follow_up_todo.due_date, '2026-10-15');
    assert.equal(res.follow_up_todo.user_id, userB);
  });
});

test('SQL recurrence date calculation matches JS getNextRecurringDueDate across calendar boundaries', async () => {
  const cases = [
    ['2026-10-08', { type: 'weekdays', interval: 1 }],
    ['2026-10-09', { type: 'weekdays', interval: 1 }],
    ['2026-10-08', { type: 'weekdays', interval: 3 }],
    ['2026-10-08', 'weekday'],
    ['2026-10-08', { type: 'weekly', interval: 2 }],
    ['2026-01-31', { type: 'monthly', interval: 1 }],
    ['2024-01-31', { type: 'monthly', interval: 1 }],
    ['2026-03-31', { type: 'monthly', interval: 1 }],
    ['2024-02-29', { type: 'yearly', interval: 1 }],
    ['2024-02-29', { type: 'yearly', interval: 4 }],
    ['2024-02-29', 'annual'],
    ['2026-10-08', { type: 'weekly', interval: 'invalid' }],
  ];

  await asUser(userA, async () => {
    for (const [baseDate, recurrence] of cases) {
      const expected = getNextRecurringDueDate(baseDate, recurrence, baseDate);
      const row = (await db.query(
        'select public.next_recurring_todo_due_date_v1($1::date, $2::jsonb)::text as next_date',
        [baseDate, JSON.stringify(recurrence)]
      )).rows[0];
      assert.equal(row.next_date, expected, `Mismatch for ${baseDate} ${JSON.stringify(recurrence)}`);
    }

    const nullRow = (await db.query(
      "select public.next_recurring_todo_due_date_v1('2026-10-08'::date, null) as r1, public.next_recurring_todo_due_date_v1(null, '{\"type\":\"weekly\"}'::jsonb) as r2"
    )).rows[0];
    assert.equal(nullRow.r1, null);
    assert.equal(nullRow.r2, null);
  });
});

test('Finding 1: rejects unlinked same-id collisions and enforces DB uniqueness across concurrent calls', async () => {
  await asUser(userA, async () => {
    const parentId = '88888888-8888-4888-8888-888888888801';
    const unrelatedId = '88888888-8888-4888-8888-888888888802';
    const otherParentId = '88888888-8888-4888-8888-888888888803';
    const foreignFollowUpId = '88888888-8888-4888-8888-888888888804';

    await db.query(
      `insert into public.manual_todos(id, user_id, project_id, title, due_date, recurrence, meta, recurrence_source_todo_id)
       values
         ($1, $4, $5, 'Parent A', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb, '{}'::jsonb, null),
         ($2, $4, $5, 'Unrelated task in same project', '2026-12-01', null, '{}'::jsonb, null),
         ($3, $4, $5, 'Other parent', '2026-10-01', '{"type":"weekly","interval":1}'::jsonb, '{}'::jsonb, null)`,
      [parentId, unrelatedId, otherParentId, userA, sharedProject]
    );
    await db.query('select public.complete_recurring_manual_todo_v1($1, null, null, $2)', [otherParentId, foreignFollowUpId]);

    // Passing p_follow_up_id colliding with an unrelated task must reject and roll back parent Done.
    await assert.rejects(
      withSavepoint(() =>
        db.query('select public.complete_recurring_manual_todo_v1($1, null, null, $2)', [parentId, unrelatedId])
      ),
      (err) => err.code === '23505'
    );
    assert.equal(
      (await db.query('select status from public.manual_todos where id = $1', [parentId])).rows[0].status,
      'Open'
    );

    // Passing p_follow_up_id colliding with a row linked to a different parent must also reject and roll back.
    await assert.rejects(
      withSavepoint(() =>
        db.query('select public.complete_recurring_manual_todo_v1($1, null, null, $2)', [parentId, foreignFollowUpId])
      ),
      (err) => err.code === '23505'
    );
    assert.equal(
      (await db.query('select status from public.manual_todos where id = $1', [parentId])).rows[0].status,
      'Open'
    );

    // Second call (simulating second tab with a different UUID) returns the exact same single linked follow-up.
    const tab1 = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, null, null, $2) as payload',
      [parentId, '88888888-8888-4888-8888-888888888811']
    )).rows[0].payload;
    const tab2 = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, null, null, $2) as payload',
      [parentId, '88888888-8888-4888-8888-888888888822']
    )).rows[0].payload;

    assert.equal(tab1.follow_up_todo.id, '88888888-8888-4888-8888-888888888811');
    assert.equal(tab2.follow_up_todo.id, '88888888-8888-4888-8888-888888888811');
    assert.equal(tab2.follow_up_todo.recurrence_source_todo_id, parentId);
    assert.equal(
      Number((await db.query('select count(*) from public.manual_todos where recurrence_source_todo_id = $1', [parentId])).rows[0].count),
      1
    );

    // Direct insert attempting to bypass RPC using recurrence_source_todo_id is blocked by trigger (22023).
    await assert.rejects(
      withSavepoint(() =>
        db.query(
          `insert into public.manual_todos(id, user_id, project_id, title, recurrence_source_todo_id)
           values ('88888888-8888-4888-8888-888888888833', $1, $2, 'Dup', $3)`,
          [userA, sharedProject, parentId]
        )
      ),
      (err) => err.code === '22023'
    );
  });
});

test('Finding 2: computes follow-up deadline from locked row after concurrent edits and skips follow-up if recurrence was cleared', async () => {
  await asUser(userA, async () => {
    const editedId = '99999999-9999-4999-8999-999999999901';
    const clearedId = '99999999-9999-4999-8999-999999999902';
    const undatedId = '99999999-9999-4999-8999-999999999903';

    await db.query(
      `insert into public.manual_todos(id, user_id, project_id, title, due_date, recurrence)
       values
         ($1, $4, $5, 'Edited remotely before Done', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb),
         ($2, $4, $5, 'Recurrence cleared remotely', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb),
         ($3, $4, $5, 'Undated recurring', null, '{"type":"weekly","interval":1}'::jsonb)`,
      [editedId, clearedId, undatedId, userA, sharedProject]
    );

    // Concurrent edit updates due_date + recurrence before completion RPC runs.
    await db.query(
      `update public.manual_todos set due_date = '2026-10-20', recurrence = '{"type":"monthly","interval":2}'::jsonb where id = $1`,
      [editedId]
    );
    const editedRes = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, $2, $3, $4) as payload',
      [editedId, '2026-10-08', '2026-10-08T12:00:00Z', '99999999-9999-4999-8999-999999999911']
    )).rows[0].payload;
    assert.equal(editedRes.updated_todo.status, 'Done');
    assert.equal(editedRes.follow_up_todo.due_date, '2026-12-20');
    assert.deepEqual(editedRes.follow_up_todo.recurrence, { type: 'monthly', interval: 2 });

    // Concurrent edit clears recurrence before completion RPC runs -> no follow-up row inserted.
    await db.query('update public.manual_todos set recurrence = null where id = $1', [clearedId]);
    const clearedRes = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, $2, null, $3) as payload',
      [clearedId, '2026-10-08', '99999999-9999-4999-8999-999999999912']
    )).rows[0].payload;
    assert.equal(clearedRes.updated_todo.status, 'Done');
    assert.equal(clearedRes.follow_up_todo, null);
    assert.equal(
      Number((await db.query('select count(*) from public.manual_todos where recurrence_source_todo_id = $1', [clearedId])).rows[0].count),
      0
    );

    // Null due_date uses p_fallback_date + locked recurrence.
    const undatedRes = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, $2, null, $3) as payload',
      [undatedId, '2026-11-24', '99999999-9999-4999-8999-999999999913']
    )).rows[0].payload;
    assert.equal(undatedRes.follow_up_todo.due_date, '2026-12-01');
  });
});

test('Review Finding 1: retry mode rejects reopened or re-completed tasks and never re-completes an Open task', async () => {
  await asUser(userA, async () => {
    const taskId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
    const followId1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11';
    const followId2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12';
    const t1 = '2026-10-08T12:00:00Z';
    const t2 = '2026-10-09T09:30:00Z';

    await db.query(
      `insert into public.manual_todos(id, user_id, project_id, title, due_date, status, completed_at, recurrence)
       values ($1, $2, $3, 'Reopened series', '2026-10-08', 'Done', $4, '{"type":"weekly","interval":1}'::jsonb)`,
      [taskId, userA, sharedProject, t1]
    );

    // User reopens the task in the app.
    await db.query(`update public.manual_todos set status = 'Open', completed_at = null where id = $1`, [taskId]);

    // Stale retry with p_require_already_done = true must fail (40001), leave task Open, and create 0 follow-ups.
    await assert.rejects(
      withSavepoint(() =>
        db.query(
          'select public.complete_recurring_manual_todo_v1($1, $2, $3, $4, true, $3)',
          [taskId, '2026-10-08', t1, followId1]
        )
      ),
      (err) => err.code === '40001'
    );
    const afterReopenRetry = (await db.query('select status, completed_at from public.manual_todos where id = $1', [taskId])).rows[0];
    assert.equal(afterReopenRetry.status, 'Open');
    assert.equal(afterReopenRetry.completed_at, null);
    assert.equal(
      Number((await db.query('select count(*) from public.manual_todos where recurrence_source_todo_id = $1', [taskId])).rows[0].count),
      0
    );

    // User later completes the task again at t2: retry still holding old t1 rejects (40001), retry holding t2 succeeds.
    await db.query(`update public.manual_todos set status = 'Done', completed_at = $2 where id = $1`, [taskId, t2]);
    await assert.rejects(
      withSavepoint(() =>
        db.query(
          'select public.complete_recurring_manual_todo_v1($1, $2, $3, $4, true, $3)',
          [taskId, '2026-10-08', t1, followId1]
        )
      ),
      (err) => err.code === '40001'
    );

    const retryCurrent = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, $2, $3, $4, true, $3) as payload',
      [taskId, '2026-10-08', t2, followId2]
    )).rows[0].payload;
    assert.equal(retryCurrent.updated_todo.status, 'Done');
    assert.equal(retryCurrent.follow_up_todo.id, followId2);
    assert.equal(retryCurrent.follow_up_todo.recurrence_source_todo_id, taskId);
  });
});

test('Review Finding 3: trigger protects links/meta, parent deletion sets null safely, and migration backfill enforces ownership boundaries', async () => {
  await asUser(userA, async () => {
    const parentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
    const followUpId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02';
    const normalId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03';

    await db.query(
      `insert into public.manual_todos(id, user_id, project_id, title, due_date, recurrence)
       values ($1, $3, $4, 'Protected series', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb),
              ($2, $3, $4, 'Normal task', '2026-10-09', null)`,
      [parentId, normalId, userA, sharedProject]
    );
    await db.query('select public.complete_recurring_manual_todo_v1($1, null, null, $2)', [parentId, followUpId]);

    // Direct INSERT with editable meta.recurrenceSourceTodoId is rejected.
    await assert.rejects(
      withSavepoint(() =>
        db.query(
          `insert into public.manual_todos(id, user_id, project_id, title, meta)
           values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10', $1, $2, 'Forged meta insert', jsonb_build_object('recurrenceSourceTodoId', $3::text))`,
          [userA, sharedProject, parentId]
        )
      ),
      (err) => err.code === '22023'
    );

    // Direct UPDATE trying to add/tamper meta.recurrenceSourceTodoId or mutate recurrence_source_todo_id is rejected.
    await assert.rejects(
      withSavepoint(() =>
        db.query(
          `update public.manual_todos set meta = jsonb_build_object('recurrenceSourceTodoId', $2::text) where id = $1`,
          [normalId, parentId]
        )
      ),
      (err) => err.code === '22023'
    );
    await assert.rejects(
      withSavepoint(() =>
        db.query(`update public.manual_todos set meta = '{}'::jsonb where id = $1`, [followUpId])
      ),
      (err) => err.code === '22023'
    );
    await assert.rejects(
      withSavepoint(() =>
        db.query(`update public.manual_todos set recurrence_source_todo_id = null where id = $1`, [followUpId])
      ),
      (err) => err.code === '22023'
    );

    // Ordinary edits to follow-up title, due_date, or moving project succeed without triggering link immutability.
    await db.query(`update public.manual_todos set title = 'Renamed follow-up', due_date = '2026-10-22' where id = $1`, [followUpId]);
    assert.equal(
      (await db.query('select title from public.manual_todos where id = $1', [followUpId])).rows[0].title,
      'Renamed follow-up'
    );

    // Deleting the completed parent triggers ON DELETE SET NULL without hitting trigger immutability.
    await db.query('delete from public.manual_todos where id = $1', [parentId]);
    assert.equal(
      (await db.query('select recurrence_source_todo_id from public.manual_todos where id = $1', [followUpId])).rows[0].recurrence_source_todo_id,
      null
    );
  });

  // Pre-migration database simulation: verify backfill promotes valid same-project & personal rows while rejecting spoofs.
  const preDb = new PGlite();
  try {
    await setupBaseSchema(preDb);

    const projParent = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
    const projValidChild = 'cccccccc-cccc-4ccc-8ccc-cccccccccc02';
    const personalParent = 'cccccccc-cccc-4ccc-8ccc-cccccccccc03';
    const personalValidChild = 'cccccccc-cccc-4ccc-8ccc-cccccccccc04';
    const openParent = 'cccccccc-cccc-4ccc-8ccc-cccccccccc05';
    const openParentChild = 'cccccccc-cccc-4ccc-8ccc-cccccccccc06';
    const crossUserSpoof = 'cccccccc-cccc-4ccc-8ccc-cccccccccc07';
    const crossProjSpoof = 'cccccccc-cccc-4ccc-8ccc-cccccccccc08';
    const olderChild = 'cccccccc-cccc-4ccc-8ccc-cccccccccc09';

    await preDb.query(
      `insert into public.manual_todos(id, user_id, project_id, title, status, completed_at, recurrence, created_at, meta)
       values
         ($1, $10, $13, 'Legacy shared Done', 'Done', '2026-10-01T12:00:00Z', '{"type":"weekly","interval":1}'::jsonb, '2026-10-01T10:00:00Z', '{}'::jsonb),
         ($2, $11, $13, 'Legacy shared follow-up', 'Open', null, '{"type":"weekly","interval":1}'::jsonb, '2026-10-01T12:01:00Z', jsonb_build_object('recurrenceSourceTodoId', $1::text)),
         ($3, $10, null, 'Legacy personal Done', 'Done', '2026-10-02T12:00:00Z', '{"type":"weekly","interval":1}'::jsonb, '2026-10-02T10:00:00Z', '{}'::jsonb),
         ($4, $10, null, 'Legacy personal follow-up', 'Open', null, '{"type":"weekly","interval":1}'::jsonb, '2026-10-02T12:01:00Z', jsonb_build_object('recurrenceSourceTodoId', $3::text)),
         ($5, $10, $13, 'Open parent', 'Open', null, '{"type":"weekly","interval":1}'::jsonb, '2026-10-03T10:00:00Z', '{}'::jsonb),
         ($6, $10, $13, 'Fake child for open parent', 'Open', null, null, '2026-10-03T12:00:00Z', jsonb_build_object('recurrenceSourceTodoId', $5::text)),
         ($7, $11, null, 'Cross-user personal spoof', 'Open', null, null, '2026-10-02T12:05:00Z', jsonb_build_object('recurrenceSourceTodoId', $3::text)),
         ($8, $12, $14, 'Cross-project spoof', 'Open', null, null, '2026-10-01T12:05:00Z', jsonb_build_object('recurrenceSourceTodoId', $1::text)),
         ($9, $10, $13, 'Older than parent spoof', 'Open', null, null, '2026-09-20T10:00:00Z', jsonb_build_object('recurrenceSourceTodoId', $1::text))`,
      [
        projParent, projValidChild, personalParent, personalValidChild,
        openParent, openParentChild, crossUserSpoof, crossProjSpoof, olderChild,
        userA, userB, userC, sharedProject, otherProject,
      ]
    );

    await preDb.exec(migrationSql);

    const links = new Map(
      (await preDb.query('select id, recurrence_source_todo_id from public.manual_todos'))
        .rows.map((r) => [r.id, r.recurrence_source_todo_id])
    );

    assert.equal(links.get(projValidChild), projParent);
    assert.equal(links.get(personalValidChild), personalParent);
    assert.equal(links.get(openParentChild), null);
    assert.equal(links.get(crossUserSpoof), null);
    assert.equal(links.get(crossProjSpoof), null);
    assert.equal(links.get(olderChild), null);
  } finally {
    await preDb.close();
  }
});
