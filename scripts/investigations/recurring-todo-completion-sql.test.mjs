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

before(async () => {
  await db.exec(`
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

  // Verify upgrade safety over an earlier 4-arg version using p_next_due_date (avoids SQLSTATE 42P13).
  await db.exec(`
    create or replace function public.complete_recurring_manual_todo_v1(
      p_todo_id uuid,
      p_next_due_date date,
      p_completed_at timestamptz default null,
      p_follow_up_id uuid default null
    ) returns jsonb language sql as $$ select '{}'::jsonb $$;
  `);

  const migration = await readFile(
    new URL('../sql/2026-11-23_atomic_recurring_todo_completion.sql', import.meta.url),
    'utf8'
  );
  await db.exec(migration);
  await db.exec(migration);
});

after(() => db.close());

test('migration locks function grants strictly to authenticated and service_role and respects RLS across owners and collaborators', async () => {
  const privs = (await db.query(`
    select
      has_function_privilege('anon', 'public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid)', 'execute') as anon_exec,
      has_function_privilege('public', 'public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid)', 'execute') as public_exec,
      has_function_privilege('authenticated', 'public.complete_recurring_manual_todo_v1(uuid, date, timestamptz, uuid)', 'execute') as auth_exec,
      has_function_privilege('anon', 'public.next_recurring_todo_due_date_v1(date, jsonb)', 'execute') as date_anon_exec,
      has_function_privilege('public', 'public.next_recurring_todo_due_date_v1(date, jsonb)', 'execute') as date_public_exec,
      has_function_privilege('authenticated', 'public.next_recurring_todo_due_date_v1(date, jsonb)', 'execute') as date_auth_exec
  `)).rows[0];

  assert.equal(privs.anon_exec, false);
  assert.equal(privs.public_exec, false);
  assert.equal(privs.auth_exec, true);
  assert.equal(privs.date_anon_exec, false);
  assert.equal(privs.date_public_exec, false);
  assert.equal(privs.date_auth_exec, true);

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

test('Finding 1: rejects unlinked same-id collisions, recovers verified legacy meta rows once, and enforces DB uniqueness', async () => {
  await asUser(userA, async () => {
    const parentId = '88888888-8888-4888-8888-888888888801';
    const unrelatedId = '88888888-8888-4888-8888-888888888802';
    const otherParentId = '88888888-8888-4888-8888-888888888803';
    const foreignFollowUpId = '88888888-8888-4888-8888-888888888804';
    const legacyParentId = '88888888-8888-4888-8888-888888888805';
    const legacyFollowUpId = '88888888-8888-4888-8888-888888888806';

    await db.query(
      `insert into public.manual_todos(id, user_id, project_id, title, due_date, recurrence, meta, recurrence_source_todo_id)
       values
         ($1, $7, $8, 'Parent A', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb, '{}'::jsonb, null),
         ($2, $7, $8, 'Unrelated task in same project', '2026-12-01', null, '{}'::jsonb, null),
         ($3, $7, $8, 'Other parent', '2026-10-01', '{"type":"weekly","interval":1}'::jsonb, '{}'::jsonb, null),
         ($4, $7, $8, 'Foreign follow-up', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb, '{}'::jsonb, $3),
         ($5, $7, $8, 'Legacy parent', '2026-10-08', '{"type":"weekly","interval":1}'::jsonb, '{}'::jsonb, null),
         ($6, $7, $8, 'Legacy follow-up', '2026-10-15', '{"type":"weekly","interval":1}'::jsonb, jsonb_build_object('recurrenceSourceTodoId', $5::text), null)`,
      [parentId, unrelatedId, otherParentId, foreignFollowUpId, legacyParentId, legacyFollowUpId, userA, sharedProject]
    );

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

    // Pre-migration legacy row with verified meta.recurrenceSourceTodoId is recovered and promoted to recurrence_source_todo_id.
    const legacyRes = (await db.query(
      'select public.complete_recurring_manual_todo_v1($1, null, null, $2) as payload',
      [legacyParentId, '88888888-8888-4888-8888-888888888899']
    )).rows[0].payload;
    assert.equal(legacyRes.updated_todo.status, 'Done');
    assert.equal(legacyRes.follow_up_todo.id, legacyFollowUpId);
    assert.equal(legacyRes.follow_up_todo.recurrence_source_todo_id, legacyParentId);

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

    // Direct duplicate insert violating idx_manual_todos_unique_recurrence_source fails with 23505.
    await assert.rejects(
      withSavepoint(() =>
        db.query(
          `insert into public.manual_todos(id, user_id, project_id, title, recurrence_source_todo_id)
           values ('88888888-8888-4888-8888-888888888833', $1, $2, 'Dup', $3)`,
          [userA, sharedProject, parentId]
        )
      ),
      (err) => err.code === '23505'
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
