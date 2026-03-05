-- One-time backfill for existing demo projects.
-- Adds starter data only when a target section is missing or empty:
--   - registers.assumptions
--   - registers.decisions
--   - registers.lessons
--   - registers._raci
--
-- Safe behavior:
-- - Only touches rows where is_demo = true
-- - Does not overwrite non-empty sections

with demo_source as (
  select
    id,
    coalesce(registers, '{}'::jsonb) as reg
  from public.projects
  where coalesce(is_demo, false) = true
),
assumptions_patch as (
  select
    id,
    case
      when jsonb_typeof(reg->'assumptions') = 'array'
           and jsonb_array_length(reg->'assumptions') > 0
        then reg
      else jsonb_set(
        reg,
        '{assumptions}',
        jsonb_build_array(
          jsonb_build_object(
            '_id', 'assumption_demo_backfill_1',
            'number', 1,
            'visible', true,
            'public', true,
            'type', 'Assumption',
            'description', 'Service desk is available for Wave 3 cutover nights.',
            'raisedby', 'Project Manager',
            'dateraised', '2025-08-05',
            'impact', 'Operational readiness',
            'status', 'Validated',
            'validationnotes', 'Rota and escalation contacts confirmed by CAB-2.',
            'owner', 'Project Manager'
          )
        ),
        true
      )
    end as reg
  from demo_source
),
decisions_patch as (
  select
    id,
    case
      when jsonb_typeof(reg->'decisions') = 'array'
           and jsonb_array_length(reg->'decisions') > 0
        then reg
      else jsonb_set(
        reg,
        '{decisions}',
        jsonb_build_array(
          jsonb_build_object(
            '_id', 'decision_demo_backfill_1',
            'number', 1,
            'visible', true,
            'public', true,
            'decision', 'Use a single change freeze calendar across all migration waves.',
            'decidedby', 'Programme Board',
            'dateraised', '2025-08-07',
            'datedecided', '2025-08-12',
            'rationale', 'Prevents conflicting production changes during network cutovers.',
            'impact', 'Lower operational risk',
            'status', 'Approved'
          )
        ),
        true
      )
    end as reg
  from assumptions_patch
),
lessons_patch as (
  select
    id,
    case
      when jsonb_typeof(reg->'lessons') = 'array'
           and jsonb_array_length(reg->'lessons') > 0
        then reg
      else jsonb_set(
        reg,
        '{lessons}',
        jsonb_build_array(
          jsonb_build_object(
            '_id', 'lesson_demo_backfill_1',
            'number', 1,
            'visible', true,
            'public', true,
            'date', '2025-08-19',
            'phase', 'Wave Planning',
            'category', 'Governance',
            'description', 'Cross-team handoff quality improved after pre-wave dry runs.',
            'whatwentwell', 'Ownership was clear and defect triage was faster.',
            'whatcouldimprove', 'Dependency updates were sometimes posted too late.',
            'recommendation', 'Publish readiness checklist sign-off 48h before each wave.',
            'owner', 'PMO',
            'status', 'In Progress'
          )
        ),
        true
      )
    end as reg
  from decisions_patch
),
raci_patch as (
  select
    id,
    case
      when jsonb_typeof(reg->'_raci') = 'array'
           and jsonb_array_length(reg->'_raci') > 0
        then reg
      else jsonb_set(
        reg,
        '{_raci}',
        jsonb_build_array(
          jsonb_build_object(
            'roles', jsonb_build_array('Project Manager'),
            'assignments', jsonb_build_object(
              '_customTasks', jsonb_build_array('Project plan'),
              'custom-0::Project Manager', 'R'
            ),
            'updatedAt', '2026-03-05T00:00:00.000Z'
          )
        ),
        true
      )
    end as reg
  from lessons_patch
),
applied as (
  update public.projects p
  set
    registers = r.reg,
    updated_at = now()
  from raci_patch r
  where p.id = r.id
    and p.registers is distinct from r.reg
  returning p.id
)
select count(*) as patched_demo_projects
from applied;
