import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGroceryDraft,
  getDefaultServingMultiplier,
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

test('getDefaultServingMultiplier treats kids as half portions', () => {
  assert.equal(getDefaultServingMultiplier({ adultCount: 1, kidCount: 1 }), 1.5);
  assert.equal(getDefaultServingMultiplier({ adultCount: 2, kidCount: 0 }), 2);
});
