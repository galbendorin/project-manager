export const MEAL_NAME_MAX_LENGTH = 200;

const MEAL_SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTIONAL_FIELD_GROUPS = [
  ['estimated_protein_g', 'estimated_carbs_g', 'estimated_fiber_g'],
  ['yield_mode', 'batch_yield_portions'],
  ['shopping_project_id'],
];

export const validateMealNameInput = ({ name, mealSlot, id } = {}) => {
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (!trimmedName) throw new Error('Enter a meal name.');
  if (trimmedName.length > MEAL_NAME_MAX_LENGTH) {
    throw new Error(`Keep the meal name to ${MEAL_NAME_MAX_LENGTH} characters or fewer.`);
  }
  if (!MEAL_SLOTS.has(mealSlot)) throw new Error('Choose a valid meal slot.');
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new Error('Unable to prepare this meal. Close the picker and try again.');
  }
  return { name: trimmedName, mealSlot, id };
};

export const buildMealNamePayload = ({ userId, shoppingProjectId = '', ...input } = {}) => {
  const { id, name, mealSlot } = validateMealNameInput(input);
  if (!userId) throw new Error('Sign in before adding a meal.');

  return {
    id,
    user_id: userId,
    ...(shoppingProjectId ? { shopping_project_id: shoppingProjectId } : {}),
    external_id: null,
    source_pdf: '',
    suggested_day: null,
    meal_slot: mealSlot,
    name,
    ingredients_raw: '',
    how_to_make: '',
    estimated_kcal: null,
    estimated_protein_g: null,
    estimated_carbs_g: null,
    estimated_fiber_g: null,
    image_ref: '',
    recipe_origin: 'manual',
    yield_mode: 'flexible',
    batch_yield_portions: null,
  };
};

export const isNameOnlyMeal = (recipe) => Boolean(
  recipe
  && !String(recipe.ingredientsRaw || '').trim()
  && !String(recipe.howToMake || '').trim()
  && !(recipe.ingredients || []).some((ingredient) => (
    String(ingredient?.ingredientName || '').trim() || String(ingredient?.rawText || '').trim()
  ))
);

const getMissingOptionalFields = (error, payload) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const isMissingColumn = error?.code === '42703'
    || error?.code === 'PGRST204'
    || (!error?.code && /does not exist|could not find|schema cache/.test(message));
  if (!isMissingColumn) return null;
  return OPTIONAL_FIELD_GROUPS.find((fields) => fields.some((field) => (
    Object.hasOwn(payload, field) && message.includes(field)
  ))) || null;
};

// A caller keeps the same UUID until the meal has been added to the plan.
// Ignoring a duplicate preserves any recipe details added after the first save.
export const persistMealName = async ({ supabaseClient, payload }) => {
  let nextPayload = { ...payload };
  let sharedFieldMissing = false;

  while (true) {
    const result = await supabaseClient
      .from('meal_library_meals')
      .upsert(nextPayload, { onConflict: 'id', ignoreDuplicates: true })
      .select('*')
      .maybeSingle();

    if (result.error) {
      const missingFields = getMissingOptionalFields(result.error, nextPayload);
      if (!missingFields) throw result.error;
      sharedFieldMissing ||= missingFields.includes('shopping_project_id');
      nextPayload = Object.fromEntries(Object.entries(nextPayload).filter(([field]) => (
        !missingFields.includes(field)
      )));
      continue;
    }

    if (result.data) return { row: result.data, sharedFieldMissing };

    const existingResult = await supabaseClient
      .from('meal_library_meals')
      .select('*')
      .eq('id', payload.id)
      .maybeSingle();
    if (existingResult.error) throw existingResult.error;
    if (!existingResult.data) throw new Error('Unable to find the saved meal. Try again.');
    return { row: existingResult.data, sharedFieldMissing };
  }
};
