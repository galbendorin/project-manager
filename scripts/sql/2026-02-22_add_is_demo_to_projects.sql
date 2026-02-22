-- Step 3 migration: add demo-project metadata and enforce one demo per user.

alter table public.projects
  add column if not exists is_demo boolean not null default false;

create index if not exists idx_projects_user_demo
  on public.projects(user_id, is_demo);

-- Backfill one existing SD-WAN demo project per user (most recently updated).
with ranked_demo_projects as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.projects
  where name = 'SD-WAN Demo'
)
update public.projects p
set is_demo = (r.rn = 1)
from ranked_demo_projects r
where p.id = r.id;

create unique index if not exists uq_projects_one_demo_per_user
  on public.projects(user_id)
  where is_demo = true;
