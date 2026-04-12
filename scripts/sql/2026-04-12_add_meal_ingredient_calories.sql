alter table public.meal_library_ingredients
  add column if not exists estimated_kcal double precision null,
  add column if not exists manual_kcal double precision null,
  add column if not exists kcal_source text null,
  add column if not exists kcal_per_100 double precision null,
  add column if not exists linked_fdc_id bigint null,
  add column if not exists matched_food_label text null;

create table if not exists public.meal_ingredient_calorie_cache (
  cache_key text primary key,
  search_query text not null default '',
  ingredient_name text not null default '',
  raw_text text not null default '',
  quantity_value double precision null,
  quantity_unit text not null default '',
  notes text not null default '',
  resolved boolean not null default false,
  estimated_kcal double precision null,
  quantity_grams double precision null,
  kcal_per_100 double precision null,
  resolution_method text not null default '',
  reason text not null default '',
  fdc_id bigint null,
  matched_food_label text null,
  matched_food_data_type text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_meal_ingredient_calorie_cache_updated_at on public.meal_ingredient_calorie_cache;
create trigger trg_meal_ingredient_calorie_cache_updated_at
before update on public.meal_ingredient_calorie_cache
for each row
execute function public.bump_meal_planner_updated_at();

alter table public.meal_ingredient_calorie_cache enable row level security;

create index if not exists idx_meal_ingredient_calorie_cache_fdc_id
  on public.meal_ingredient_calorie_cache(fdc_id);
