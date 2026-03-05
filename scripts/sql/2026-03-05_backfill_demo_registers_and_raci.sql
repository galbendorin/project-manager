-- Force-align demo projects to the latest shared baseline:
-- 1) Remove blank Assumptions row #1 (if present)
-- 2) Set starter RACI roles and assignments:
--    Project Manager (R), Technical Architect (C),
--    Delivery Lead, PMO Lead, Business Sponsor

with patched as (
  update public.projects p
  set
    registers = jsonb_set(
      jsonb_set(
        coalesce(p.registers, '{}'::jsonb),
        '{assumptions}',
        (
          select coalesce(jsonb_agg(a), '[]'::jsonb)
          from jsonb_array_elements(
            case
              when jsonb_typeof(coalesce(p.registers, '{}'::jsonb)->'assumptions') = 'array'
                then (coalesce(p.registers, '{}'::jsonb)->'assumptions')
              else '[]'::jsonb
            end
          ) a
          where not (
            btrim(coalesce(a->>'number', '')) = '1'
            and btrim(coalesce(a->>'description', '')) = ''
          )
        ),
        true
      ),
      '{_raci}',
      jsonb_build_array(
        jsonb_build_object(
          'roles', jsonb_build_array(
            'Project Manager',
            'Technical Architect',
            'Delivery Lead',
            'PMO Lead',
            'Business Sponsor'
          ),
          'assignments', jsonb_build_object(
            '_customTasks', jsonb_build_array('Project plan'),
            'custom-0::Project Manager', 'R',
            'custom-0::Technical Architect', 'C'
          ),
          'updatedAt', now()::text
        )
      ),
      true
    ),
    updated_at = now()
  where coalesce(p.is_demo, false) = true
  returning p.id
)
select count(*) as patched_demo_projects
from patched;
