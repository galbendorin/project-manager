-- Install before deploying the recipe-edit client. No existing data changes.
-- One invoker transaction preserves existing RLS and Q08 household constraints.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.update_meal_recipe_atomic(
  target_recipe_id uuid,
  target_recipe jsonb,
  target_ingredients jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  existing public.meal_library_meals%rowtype;
  next_recipe public.meal_library_meals%rowtype;
  affected integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if target_recipe_id is null
    or jsonb_typeof(target_recipe) is distinct from 'object'
    or jsonb_typeof(target_ingredients) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'RECIPE_INPUT_INVALID';
  end if;
  -- Do not permit this RPC to change identity, ownership or household links.
  if target_recipe - array['external_id','source_pdf','suggested_day','meal_slot',
    'name','ingredients_raw','how_to_make','estimated_kcal','estimated_protein_g',
    'estimated_carbs_g','estimated_fiber_g','image_ref','recipe_origin',
    'yield_mode','batch_yield_portions']::text[] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'RECIPE_FIELDS_INVALID';
  end if;
  if exists(select 1 from jsonb_array_elements(target_ingredients) item
    where jsonb_typeof(item) is distinct from 'object'
      or item - array['raw_text','ingredient_name','quantity_value','quantity_unit',
        'notes','parse_confidence','estimated_kcal','manual_kcal','kcal_source',
        'kcal_per_100','linked_fdc_id','matched_food_label']::text[] <> '{}'::jsonb) then
    raise exception using errcode = '22023', message = 'RECIPE_INGREDIENT_FIELDS_INVALID';
  end if;

  select * into existing from public.meal_library_meals
    where id = target_recipe_id for update;
  if not found or existing.shopping_project_id is null
    or not public.can_access_project(existing.shopping_project_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'RECIPE_ACCESS_REQUIRED';
  end if;
  next_recipe := jsonb_populate_record(existing, target_recipe);
  update public.meal_library_meals set
    external_id = next_recipe.external_id,
    source_pdf = next_recipe.source_pdf,
    suggested_day = next_recipe.suggested_day,
    meal_slot = next_recipe.meal_slot,
    name = next_recipe.name,
    ingredients_raw = next_recipe.ingredients_raw,
    how_to_make = next_recipe.how_to_make,
    estimated_kcal = next_recipe.estimated_kcal,
    estimated_protein_g = next_recipe.estimated_protein_g,
    estimated_carbs_g = next_recipe.estimated_carbs_g,
    estimated_fiber_g = next_recipe.estimated_fiber_g,
    image_ref = next_recipe.image_ref,
    recipe_origin = next_recipe.recipe_origin,
    yield_mode = next_recipe.yield_mode,
    batch_yield_portions = next_recipe.batch_yield_portions
  where id = target_recipe_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception using errcode = '42501', message = 'RECIPE_NOT_SAVED';
  end if;

  delete from public.meal_library_ingredients where meal_id = target_recipe_id;
  insert into public.meal_library_ingredients (
    meal_id,raw_text,ingredient_name,quantity_value,quantity_unit,notes,
    parse_confidence,estimated_kcal,manual_kcal,kcal_source,kcal_per_100,
    linked_fdc_id,matched_food_label
  ) select target_recipe_id,coalesce(i.raw_text,''),coalesce(i.ingredient_name,''),
    i.quantity_value,coalesce(i.quantity_unit,''),coalesce(i.notes,''),
    coalesce(i.parse_confidence,0),i.estimated_kcal,i.manual_kcal,i.kcal_source,
    i.kcal_per_100,i.linked_fdc_id,i.matched_food_label
    from jsonb_to_recordset(target_ingredients) as i(
      raw_text text,ingredient_name text,quantity_value double precision,
      quantity_unit text,notes text,parse_confidence double precision,
      estimated_kcal double precision,manual_kcal double precision,kcal_source text,
      kcal_per_100 double precision,linked_fdc_id bigint,matched_food_label text
    );
  get diagnostics affected = row_count;
  if affected <> jsonb_array_length(target_ingredients) then
    raise exception using errcode = '42501', message = 'RECIPE_INGREDIENTS_NOT_SAVED';
  end if;
  return target_recipe_id;
end;
$$;

revoke all on function public.update_meal_recipe_atomic(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.update_meal_recipe_atomic(uuid,jsonb,jsonb) to authenticated, service_role;
commit;
