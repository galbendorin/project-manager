import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNextDayCopyPrompt,
  buildMealPlanPreview,
  buildGroceryDraft,
  getAudienceServingMultiplier,
  getDefaultServingMultiplier,
  getWeekDayEntries,
  normalizeMealAudience,
  parseIngredientText,
  parseRecipeImportText,
  splitIngredientList,
} from './mealPlanner.js';

test('parseIngredientText parses simple quantity and unit combinations', () => {
  assert.deepEqual(parseIngredientText('oats 60g'), {
    rawText: 'oats 60g',
    ingredientName: 'oats',
    quantityValue: 60,
    quantityUnit: 'g',
    notes: '',
    parseConfidence: 0.94,
  });

  assert.deepEqual(parseIngredientText('Greek yogurt 2 tbsp'), {
    rawText: 'Greek yogurt 2 tbsp',
    ingredientName: 'Greek yogurt',
    quantityValue: 2,
    quantityUnit: 'tbsp',
    notes: '',
    parseConfidence: 0.9,
  });
});

test('parseIngredientText keeps fuzzy ingredients safe for review', () => {
  const parsed = parseIngredientText('mushrooms 2-3');
  assert.equal(parsed.quantityValue, null);
  assert.equal(parsed.ingredientName, 'mushrooms 2-3');
  assert.ok(parsed.parseConfidence < 0.2);
});

test('parseRecipeImportText converts menu rows into recipe records', () => {
  const rawText = `id|source_pdf|day|name|ingredients|how_to_make|estimated_kcal|image_ref
D1_B1|Dieta1|Mon|Bruschetta|wholegrain bread 70g, avocado 70g|Toast bread|400|D1_R1`;

  const { rows, errors } = parseRecipeImportText(rawText, 'breakfast');
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mealSlot, 'breakfast');
  assert.equal(rows[0].sourcePdf, 'Dieta1');
  assert.equal(rows[0].suggestedDay, 'mon');
  assert.equal(rows[0].ingredientLines.length, 2);
});

test('buildGroceryDraft aggregates repeated meals by ingredient and unit', () => {
  const recipes = [
    {
      id: 'meal_1',
      name: 'Porridge',
      ingredients: splitIngredientList('oats 60g, almond milk 250ml'),
    },
  ];

  const entries = [
    { id: 'entry_1', mealId: 'meal_1', mealSlot: 'breakfast', date: '2026-04-13', servingMultiplier: 1 },
    { id: 'entry_2', mealId: 'meal_1', mealSlot: 'breakfast', date: '2026-04-14', servingMultiplier: 1.5 },
  ];

  const draft = buildGroceryDraft({
    recipes,
    entries,
    adultCount: 1,
    kidCount: 1,
  });

  const oats = draft.find((item) => item.title === 'oats');
  const milk = draft.find((item) => item.title === 'almond milk');

  assert.equal(oats.quantityValue, 150);
  assert.equal(oats.quantityUnit, 'g');
  assert.equal(milk.quantityValue, 625);
  assert.equal(milk.quantityUnit, 'ml');
});

test('buildGroceryDraft uses the household default multiplier when serving multiplier is unset', () => {
  const recipes = [
    {
      id: 'meal_eggs',
      name: 'Toast with egg and pepper',
      ingredients: splitIngredientList('eggs 2, wholegrain bread 50g, greens'),
    },
  ];

  const draft = buildGroceryDraft({
    recipes,
    entries: [
      { id: 'entry_eggs', mealId: 'meal_eggs', mealSlot: 'breakfast', date: '2026-04-13', servingMultiplier: null },
    ],
    adultCount: 2,
    kidCount: 1,
  });

  const eggs = draft.find((item) => item.title === 'eggs');
  const bread = draft.find((item) => item.title === 'wholegrain bread');
  const greens = draft.find((item) => item.title === 'greens');

  assert.equal(eggs.quantityValue, 5);
  assert.equal(eggs.quantityUnit, 'pcs');
  assert.equal(bread.quantityValue, 125);
  assert.equal(bread.quantityUnit, 'g');
  assert.equal(greens.quantityValue, null);
});

test('buildGroceryDraft scales meals by audience tags', () => {
  const recipes = [
    {
      id: 'meal_shared',
      name: 'Family eggs',
      ingredients: splitIngredientList('eggs 2'),
    },
    {
      id: 'meal_adults',
      name: 'Adults yogurt',
      ingredients: splitIngredientList('Greek yogurt 100g'),
    },
    {
      id: 'meal_kids',
      name: 'Kids berries',
      ingredients: splitIngredientList('berries 40g'),
    },
  ];

  const draft = buildGroceryDraft({
    recipes,
    entries: [
      { id: 'entry_all', mealId: 'meal_shared', mealSlot: 'breakfast', date: '2026-04-13', servingMultiplier: null, audience: 'all' },
      { id: 'entry_adults', mealId: 'meal_adults', mealSlot: 'lunch', date: '2026-04-13', servingMultiplier: null, audience: 'adults' },
      { id: 'entry_kids', mealId: 'meal_kids', mealSlot: 'snack', date: '2026-04-13', servingMultiplier: null, audience: 'kids' },
    ],
    adultCount: 2,
    kidCount: 2,
  });

  assert.equal(draft.find((item) => item.title === 'eggs')?.quantityValue, 6);
  assert.equal(draft.find((item) => item.title === 'Greek yogurt')?.quantityValue, 200);
  assert.equal(draft.find((item) => item.title === 'berries')?.quantityValue, 40);
});

test('buildMealPlanPreview carries batch leftovers into later days before adding new groceries', () => {
  const preview = buildMealPlanPreview({
    recipes: [
      {
        id: 'meal_cake',
        name: 'Cake',
        yieldMode: 'batch',
        batchYieldPortions: 4,
        ingredients: splitIngredientList('eggs 4, flour 200g'),
      },
    ],
    entries: [
      { id: 'entry_day_1', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-13', servingMultiplier: null, audience: 'all', entryPosition: 0 },
      { id: 'entry_day_2', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-14', servingMultiplier: null, audience: 'all', entryPosition: 0 },
    ],
    adultCount: 2,
    kidCount: 1,
  });

  assert.equal(preview.entryUsageById.entry_day_1.requiredPortions, 2.5);
  assert.equal(preview.entryUsageById.entry_day_1.cookedBatchCount, 1);
  assert.equal(preview.entryUsageById.entry_day_1.createdCarryoverPortions, 1.5);

  assert.equal(preview.entryUsageById.entry_day_2.usedCarryoverPortions, 1.5);
  assert.equal(preview.entryUsageById.entry_day_2.carryoverSourceDate, '2026-04-13');
  assert.equal(preview.entryUsageById.entry_day_2.cookedBatchCount, 1);

  const eggs = preview.groceryDraft.find((item) => item.title === 'eggs');
  const flour = preview.groceryDraft.find((item) => item.title === 'flour');

  assert.equal(eggs.quantityValue, 8);
  assert.equal(eggs.quantityUnit, 'pcs');
  assert.equal(flour.quantityValue, 400);
  assert.equal(flour.quantityUnit, 'g');
});

test('buildGroceryDraft keeps one batch when later kid servings are fully covered by carryover', () => {
  const draft = buildGroceryDraft({
    recipes: [
      {
        id: 'meal_muffins',
        name: 'Muffins',
        yieldMode: 'batch',
        batchYieldPortions: 4,
        ingredients: splitIngredientList('eggs 2, oats 120g'),
      },
    ],
    entries: [
      { id: 'entry_monday', mealId: 'meal_muffins', mealSlot: 'snack', date: '2026-04-13', servingMultiplier: null, audience: 'kids', entryPosition: 0 },
      { id: 'entry_tuesday', mealId: 'meal_muffins', mealSlot: 'snack', date: '2026-04-14', servingMultiplier: null, audience: 'kids', entryPosition: 0 },
    ],
    adultCount: 2,
    kidCount: 1,
  });

  assert.equal(draft.find((item) => item.title === 'eggs')?.quantityValue, 2);
  assert.equal(draft.find((item) => item.title === 'oats')?.quantityValue, 120);
});

test('getDefaultServingMultiplier treats kids as half portions', () => {
  assert.equal(getDefaultServingMultiplier({ adultCount: 1, kidCount: 1 }), 1.5);
  assert.equal(getDefaultServingMultiplier({ adultCount: 2, kidCount: 0 }), 2);
});

test('normalizeMealAudience and getAudienceServingMultiplier support all, adults, and kids', () => {
  assert.equal(normalizeMealAudience('adult'), 'adults');
  assert.equal(normalizeMealAudience('children'), 'kids');
  assert.equal(normalizeMealAudience('anything else'), 'all');

  assert.equal(getAudienceServingMultiplier({ audience: 'all', adultCount: 2, kidCount: 1 }), 2.5);
  assert.equal(getAudienceServingMultiplier({ audience: 'adults', adultCount: 2, kidCount: 1 }), 2);
  assert.equal(getAudienceServingMultiplier({ audience: 'kids', adultCount: 2, kidCount: 1 }), 0.5);
});

test('buildNextDayCopyPrompt only suggests copying forward for breakfast, lunch, and dinner with a following day', () => {
  const weekDays = getWeekDayEntries('2026-04-13');

  assert.deepEqual(
    buildNextDayCopyPrompt({
      weekDays,
      dateKey: '2026-04-14',
      mealSlot: 'breakfast',
      recipeId: 'recipe_1',
      sourceEntryId: 'entry_1',
      audience: 'adults',
    }),
    {
      dateKey: '2026-04-14',
      mealSlot: 'breakfast',
      recipeId: 'recipe_1',
      sourceEntryId: 'entry_1',
      audience: 'adults',
    }
  );

  assert.equal(
    buildNextDayCopyPrompt({
      weekDays,
      dateKey: '2026-04-14',
      mealSlot: 'snack',
      recipeId: 'recipe_1',
    }),
    null
  );

  assert.equal(
    buildNextDayCopyPrompt({
      weekDays,
      dateKey: '2026-04-19',
      mealSlot: 'dinner',
      recipeId: 'recipe_1',
    }),
    null
  );
});
