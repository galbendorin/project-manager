alter table public.meal_plan_grocery_batches
  add column if not exists excluded_draft_signatures jsonb not null default '[]'::jsonb;
