import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMealNamePayload,
  isNameOnlyMeal,
  persistMealName,
  validateMealNameInput,
} from './mealNamePlanning.js';
import { buildMealPlanPreview, parseIngredientText } from './mealPlanner.js';
import { estimateRecipeNutritionFromStarterCatalog } from './mealCalorieCatalog.js';

const MEAL_ID = '049a7b16-571a-4d5b-83e1-e963d2029aaa';
const INPUT = { id: MEAL_ID, name: '  Pasta with whatever is in the fridge  ', mealSlot: 'dinner' };
const buildPayload = () => buildMealNamePayload({ ...INPUT, userId: 'user-1', shoppingProjectId: 'project-1' });

const createMealStore = ({ missingFields = [], responseLost = false, failure = null } = {}) => {
  const rows = new Map();
  const attempts = [];
  let loseNextResponse = responseLost;
  const client = {
    from(table) {
      assert.equal(table, 'meal_library_meals');
      return {
        upsert(payload, options) {
          assert.deepEqual(options, { onConflict: 'id', ignoreDuplicates: true });
          attempts.push({ ...payload });
          return {
            select() {
              return {
                async maybeSingle() {
                  if (failure) return { data: null, error: failure };
                  const missingField = missingFields.find((field) => Object.hasOwn(payload, field));
                  if (missingField) {
                    return { data: null, error: { code: 'PGRST204', message: `Could not find the '${missingField}' column in the schema cache` } };
                  }
                  if (rows.has(payload.id)) return { data: null, error: null };
                  rows.set(payload.id, { ...payload });
                  if (loseNextResponse) {
                    loseNextResponse = false;
                    return { data: null, error: { message: 'Connection closed before the response arrived.' } };
                  }
                  return { data: rows.get(payload.id), error: null };
                },
              };
            },
          };
        },
        select() {
          return {
            eq(field, value) {
              assert.equal(field, 'id');
              return { async maybeSingle() { return { data: rows.get(value) || null, error: null }; } };
            },
          };
        },
      };
    },
  };
  return { client, rows, attempts };
};

test('meal names require a trimmed name, a supported slot and a stable UUID', () => {
  assert.deepEqual(validateMealNameInput(INPUT), { ...INPUT, name: INPUT.name.trim() });
  assert.equal(validateMealNameInput({ ...INPUT, name: '🍲 Grandma’s soup / leftovers' }).name, '🍲 Grandma’s soup / leftovers');
  assert.equal(validateMealNameInput({ ...INPUT, name: 'x'.repeat(200) }).name.length, 200);
  for (const name of ['', ' \n\t ', null, 'x'.repeat(201)]) {
    assert.throws(() => validateMealNameInput({ ...INPUT, name }), /meal name/);
  }
  assert.throws(() => validateMealNameInput({ ...INPUT, mealSlot: 'brunch' }), /meal slot/);
  assert.throws(() => validateMealNameInput({ ...INPUT, id: '' }), /prepare this meal/);
  assert.throws(() => buildMealNamePayload(INPUT), /Sign in/);
});

test('a name-only meal stores no invented recipe or nutrition and adds no groceries', () => {
  const payload = buildPayload();
  assert.equal(payload.name, INPUT.name.trim());
  assert.equal(payload.recipe_origin, 'manual');
  assert.equal(payload.yield_mode, 'flexible');
  assert.equal(payload.ingredients_raw, '');
  assert.equal(payload.how_to_make, '');
  for (const field of ['estimated_kcal', 'estimated_protein_g', 'estimated_carbs_g', 'estimated_fiber_g', 'batch_yield_portions']) {
    assert.equal(payload[field], null);
  }
  const recipe = { id: payload.id, name: payload.name, ingredients: [], ingredientsRaw: '', howToMake: '' };
  const entry = { id: 'entry-1', mealId: recipe.id, date: '2026-09-07', mealSlot: 'dinner', audience: 'all', servingMultiplier: 1 };
  assert.equal(isNameOnlyMeal(recipe), true);
  assert.deepEqual(buildMealPlanPreview({ recipes: [recipe], entries: [entry] }).groceryDraft, []);

  const riceRecipe = { id: 'rice', name: 'Rice bowl', ingredients: [parseIngredientText('rice 100g')] };
  const preview = buildMealPlanPreview({
    recipes: [recipe, riceRecipe],
    entries: [entry, { ...entry, id: 'entry-2', mealId: 'rice' }],
  });
  assert.equal(preview.groceryDraft.length, 1);
  assert.equal(preview.groceryDraft[0].quantityValue, 100);
});

test('recipe details can be added later; nutrition alone does not supply a recipe', () => {
  assert.equal(isNameOnlyMeal(null), false);
  assert.equal(isNameOnlyMeal({ ingredients: [{ ingredientName: '  ', rawText: '' }] }), true);
  assert.equal(isNameOnlyMeal({ estimatedKcal: 450, estimatedProteinG: 20 }), true);
  assert.equal(isNameOnlyMeal({ ingredientsRaw: 'rice 100g' }), false);
  assert.equal(isNameOnlyMeal({ howToMake: 'Cook the rice.' }), false);
  assert.equal(isNameOnlyMeal({ ingredients: [{ ingredientName: 'rice' }] }), false);
  assert.equal(isNameOnlyMeal({ ingredients: [{ ingredientName: ' ', rawText: 'rice 100g' }] }), false);
});

test('named meals retain manually supplied nutrition without inventing groceries', () => {
  const recipe = {
    id: MEAL_ID,
    name: 'Lunch out',
    ingredients: [],
    ingredientsRaw: '',
    howToMake: '',
    estimatedKcal: 450,
    estimatedProteinG: 25,
    estimatedCarbsG: 40,
    estimatedFiberG: 6,
  };
  assert.equal(isNameOnlyMeal(recipe), true);
  const nutrition = estimateRecipeNutritionFromStarterCatalog(recipe);
  assert.equal(nutrition.proteinG, 25);
  assert.equal(nutrition.carbsG, 40);
  assert.equal(nutrition.fiberG, 6);
  assert.deepEqual(buildMealPlanPreview({
    recipes: [recipe],
    entries: [{ id: 'entry-1', mealId: MEAL_ID, date: '2026-09-07', mealSlot: 'lunch', servingMultiplier: 1 }],
  }).groceryDraft, []);
});

test('retry after an ambiguous insert reuses one meal and preserves later recipe edits', async () => {
  const store = createMealStore({ responseLost: true });
  const payload = buildPayload();
  await assert.rejects(persistMealName({ supabaseClient: store.client, payload }), (error) => /Connection closed/.test(error.message));
  assert.equal(store.rows.size, 1);
  const saved = store.rows.get(MEAL_ID);
  saved.ingredients_raw = 'pasta 100g';
  saved.how_to_make = 'Boil the pasta.';
  const retried = await persistMealName({ supabaseClient: store.client, payload });
  assert.equal(retried.row.id, MEAL_ID);
  assert.equal(retried.row.ingredients_raw, 'pasta 100g');
  assert.equal(retried.row.how_to_make, 'Boil the pasta.');
  assert.equal(store.rows.size, 1);
});

test('concurrent attempts using the same request ID return the same saved meal', async () => {
  const store = createMealStore();
  const options = { supabaseClient: store.client, payload: buildPayload() };
  const results = await Promise.all([persistMealName(options), persistMealName(options)]);
  assert.equal(store.rows.size, 1);
  assert.equal(results[0].row.id, results[1].row.id);
});

test('optional nutrition and batch fallbacks preserve shared-project ownership', async () => {
  const store = createMealStore({ missingFields: ['estimated_protein_g', 'batch_yield_portions'] });
  const result = await persistMealName({ supabaseClient: store.client, payload: buildPayload() });
  assert.equal(store.attempts.length, 3);
  for (const attempt of store.attempts) {
    assert.equal(attempt.shopping_project_id, 'project-1');
    assert.equal(attempt.id, MEAL_ID);
  }
  assert.equal(result.sharedFieldMissing, false);
  assert.equal(result.row.shopping_project_id, 'project-1');
});

test('private fallback occurs only when the shared-project column itself is absent', async () => {
  const store = createMealStore({ missingFields: ['shopping_project_id', 'estimated_protein_g'] });
  const result = await persistMealName({ supabaseClient: store.client, payload: buildPayload() });
  assert.equal(result.sharedFieldMissing, true);
  assert.equal(result.row.shopping_project_id, undefined);
  assert.equal(result.row.user_id, 'user-1');
  assert.equal(store.rows.size, 1);
});

test('permission failures mentioning optional fields do not trigger a weaker retry', async () => {
  const failure = { code: '42501', message: 'Permission denied for shopping_project_id.' };
  const store = createMealStore({ failure });
  await assert.rejects(persistMealName({ supabaseClient: store.client, payload: buildPayload() }), (error) => error === failure);
  assert.equal(store.attempts.length, 1);
  assert.equal(store.attempts[0].shopping_project_id, 'project-1');
});
