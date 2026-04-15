import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGroceryDraftExclusions,
  buildMealIngredientRecords,
  getAdultServingTotal,
  buildNextDayCopyPrompt,
  buildGroceryDraftSourceSignature,
  buildMealPlanPreview,
  buildGroceryDraft,
  getAudienceServingMultiplier,
  getDefaultServingMultiplier,
  getGroceryDraftItemSourceSignatures,
  getHiddenGroceryDraftItems,
  getWeekDayEntries,
  normalizeMealAudience,
  parseIngredientText,
  parseRecipeImportText,
  splitIngredientList,
} from './mealPlanner.js';

test('buildMealIngredientRecords keeps per-ingredient calorie metadata', () => {
  const [row] = buildMealIngredientRecords([
    {
      rawText: 'egg 2 pcs',
      ingredientName: 'egg',
      quantityValue: 2,
      quantityUnit: 'pcs',
      notes: '',
      estimatedKcal: 143,
      manualKcal: 150,
      kcalSource: 'manual',
      kcalPer100: 143,
      linkedFdcId: 123,
      matchedFoodLabel: 'Egg, whole, raw',
      parseConfidence: 1,
    },
  ]);

  assert.equal(row.estimated_kcal, 143);
  assert.equal(row.manual_kcal, 150);
  assert.equal(row.kcal_source, 'manual');
  assert.equal(row.kcal_per_100, 143);
  assert.equal(row.linked_fdc_id, 123);
  assert.equal(row.matched_food_label, 'Egg, whole, raw');
});

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

test('buildGroceryDraft supports household portion totals plus kids', () => {
  const draft = buildGroceryDraft({
    recipes: [
      {
        id: 'meal_eggs',
        name: 'Eggs for household',
        ingredients: splitIngredientList('eggs 2'),
      },
    ],
    entries: [
      { id: 'entry_household', mealId: 'meal_eggs', mealSlot: 'breakfast', date: '2026-04-13', servingMultiplier: null, audience: 'all' },
    ],
    adultPortionTotal: 1.75,
    kidCount: 1,
  });

  assert.equal(draft.find((item) => item.title === 'eggs')?.quantityValue, 4.5);
});

test('grocery draft exclusions remove only the matching meal source and keep new sources visible', () => {
  const draft = buildGroceryDraft({
    recipes: [
      {
        id: 'meal_tuesday',
        name: 'Tuesday eggs',
        ingredients: splitIngredientList('eggs 2, bread 50g'),
      },
      {
        id: 'meal_friday',
        name: 'Friday eggs',
        ingredients: splitIngredientList('eggs 2'),
      },
    ],
    entries: [
      { id: 'entry_tuesday', mealId: 'meal_tuesday', mealSlot: 'breakfast', date: '2026-04-14', servingMultiplier: 1, audience: 'all', entryPosition: 0 },
      { id: 'entry_friday', mealId: 'meal_friday', mealSlot: 'breakfast', date: '2026-04-17', servingMultiplier: 1, audience: 'all', entryPosition: 0 },
    ],
    adultCount: 1,
    kidCount: 0,
  });

  const eggs = draft.find((item) => item.title === 'eggs');
  const bread = draft.find((item) => item.title === 'bread');

  assert.ok(eggs);
  assert.ok(bread);

  const tuesdayEggSignature = buildGroceryDraftSourceSignature(
    eggs.key,
    eggs.sourceMeals.find((meal) => meal.date === '2026-04-14')
  );

  const filtered = applyGroceryDraftExclusions(draft, [tuesdayEggSignature]);
  const hidden = getHiddenGroceryDraftItems(draft, [tuesdayEggSignature]);
  const filteredEggs = filtered.find((item) => item.title === 'eggs');
  const hiddenEggs = hidden.find((item) => item.title === 'eggs');

  assert.equal(filteredEggs?.quantityValue, 2);
  assert.equal(filteredEggs?.occurrenceCount, 1);
  assert.equal(filteredEggs?.sourceMeals[0]?.date, '2026-04-17');
  assert.equal(hiddenEggs?.quantityValue, 2);
  assert.equal(hiddenEggs?.occurrenceCount, 1);
  assert.equal(hiddenEggs?.sourceMeals[0]?.date, '2026-04-14');
  assert.equal(filtered.find((item) => item.title === 'bread')?.quantityValue, 50);
});

test('getGroceryDraftItemSourceSignatures builds stable review signatures from meal sources', () => {
  const [eggs] = buildGroceryDraft({
    recipes: [
      {
        id: 'meal_eggs',
        name: 'Eggs',
        ingredients: splitIngredientList('eggs 2'),
      },
    ],
    entries: [
      { id: 'entry_eggs', mealId: 'meal_eggs', mealSlot: 'breakfast', date: '2026-04-14', servingMultiplier: 1, audience: 'kids', entryPosition: 0 },
    ],
    adultCount: 1,
    kidCount: 0,
  });

  const signatures = getGroceryDraftItemSourceSignatures(eggs);
  assert.equal(signatures.length, 1);
  assert.match(signatures[0], /^eggs::pcs::2026-04-14\|breakfast\|meal_eggs\|kids$/);
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

test('buildMealPlanPreview reserves explicit carryover for its child entry instead of auto-consuming it earlier', () => {
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
      { id: 'entry_monday', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-13', servingMultiplier: null, audience: 'all', entryPosition: 0, entryKind: 'planned' },
      { id: 'entry_tuesday', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-14', servingMultiplier: null, audience: 'kids', entryPosition: 0, entryKind: 'planned' },
      { id: 'entry_wednesday_carryover', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-15', servingMultiplier: null, audience: 'all', entryPosition: 0, entryKind: 'carryover', carryoverSourceEntryId: 'entry_monday' },
    ],
    adultCount: 2,
    kidCount: 1,
  });

  assert.equal(preview.entryUsageById.entry_monday.reservedCarryoverPortions, 1.5);
  assert.equal(preview.entryUsageById.entry_monday.createdCarryoverPortions, 0);
  assert.equal(preview.entryUsageById.entry_monday.carryoverChildDate, '2026-04-15');
  assert.equal(preview.entryUsageById.entry_tuesday.usedCarryoverPortions, 0);
  assert.equal(preview.entryUsageById.entry_tuesday.cookedBatchCount, 1);
  assert.equal(preview.entryUsageById.entry_wednesday_carryover.carryoverStatus, 'active');
  assert.equal(preview.entryUsageById.entry_wednesday_carryover.carryoverPortions, 1.5);

  assert.equal(preview.groceryDraft.find((item) => item.title === 'eggs')?.quantityValue, 8);
  assert.equal(preview.groceryDraft.find((item) => item.title === 'flour')?.quantityValue, 400);
});

test('buildMealPlanPreview keeps explicit carryover nutrition-only when the source still has leftover', () => {
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
      { id: 'entry_monday', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-13', servingMultiplier: null, audience: 'all', entryPosition: 0, entryKind: 'planned' },
      { id: 'entry_tuesday_carryover', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-14', servingMultiplier: null, audience: 'all', entryPosition: 0, entryKind: 'carryover', carryoverSourceEntryId: 'entry_monday' },
    ],
    adultCount: 2,
    kidCount: 1,
  });

  assert.equal(preview.entryUsageById.entry_monday.cookedBatchCount, 1);
  assert.equal(preview.entryUsageById.entry_monday.reservedCarryoverPortions, 1.5);
  assert.equal(preview.entryUsageById.entry_tuesday_carryover.carryoverStatus, 'active');
  assert.equal(preview.entryUsageById.entry_tuesday_carryover.contributesToNutrition, true);
  assert.equal(preview.entryUsageById.entry_tuesday_carryover.contributesToGroceries, false);
  assert.equal(preview.entryUsageById.entry_tuesday_carryover.carryoverPortions, 1.5);
  assert.equal(preview.groceryDraft.find((item) => item.title === 'eggs')?.quantityValue, 4);
});

test('buildMealPlanPreview keeps carryover cards in warning state when the source no longer has leftover', () => {
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
      { id: 'entry_monday', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-13', servingMultiplier: 4, audience: 'all', entryPosition: 0, entryKind: 'planned' },
      { id: 'entry_tuesday_carryover', mealId: 'meal_cake', mealSlot: 'snack', date: '2026-04-14', servingMultiplier: null, audience: 'all', entryPosition: 0, entryKind: 'carryover', carryoverSourceEntryId: 'entry_monday' },
    ],
    adultCount: 2,
    kidCount: 1,
  });

  assert.equal(preview.entryUsageById.entry_monday.leftoverAfterPortions, 0);
  assert.equal(preview.entryUsageById.entry_tuesday_carryover.carryoverStatus, 'warning');
  assert.equal(preview.entryUsageById.entry_tuesday_carryover.contributesToNutrition, false);
  assert.match(preview.entryUsageById.entry_tuesday_carryover.warningMessage, /No leftover/i);
  assert.equal(preview.groceryDraft.find((item) => item.title === 'eggs')?.quantityValue, 4);
});

test('getDefaultServingMultiplier treats kids as half portions', () => {
  assert.equal(getDefaultServingMultiplier({ adultCount: 1, kidCount: 1 }), 1.5);
  assert.equal(getDefaultServingMultiplier({ adultCount: 2, kidCount: 0 }), 2);
  assert.equal(getDefaultServingMultiplier({ adultPortionTotal: 1.75, kidCount: 1 }), 2.25);
});

test('normalizeMealAudience and getAudienceServingMultiplier support all, adults, and kids', () => {
  assert.equal(normalizeMealAudience('adult'), 'adults');
  assert.equal(normalizeMealAudience('children'), 'kids');
  assert.equal(normalizeMealAudience('anything else'), 'all');

  assert.equal(getAudienceServingMultiplier({ audience: 'all', adultCount: 2, kidCount: 1 }), 2.5);
  assert.equal(getAudienceServingMultiplier({ audience: 'adults', adultCount: 2, kidCount: 1 }), 2);
  assert.equal(getAudienceServingMultiplier({ audience: 'kids', adultCount: 2, kidCount: 1 }), 0.5);
  assert.equal(getAudienceServingMultiplier({ audience: 'adults', adultPortionTotal: 1.75, kidCount: 2 }), 1.75);
  assert.equal(getAudienceServingMultiplier({ audience: 'all', adultPortionTotal: 1.75, kidCount: 2 }), 2.75);
});

test('getAdultServingTotal prefers explicit adult portion totals and falls back safely', () => {
  assert.equal(getAdultServingTotal({ adultPortionTotal: 1.75 }), 1.75);
  assert.equal(getAdultServingTotal({ adultCount: 2 }), 2);
  assert.equal(getAdultServingTotal({ partnerServingMultiplier: 0.75 }), 1.75);
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
