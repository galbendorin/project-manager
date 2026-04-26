alter table public.meal_library_meals
  add column if not exists estimated_protein_g double precision null,
  add column if not exists estimated_carbs_g double precision null,
  add column if not exists estimated_fiber_g double precision null;

