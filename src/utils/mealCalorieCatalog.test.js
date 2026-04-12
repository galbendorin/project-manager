import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findRememberedIngredientEstimate,
  findStarterCalorieFoodMatch,
  normalizeIngredientMemoryKey,
} from './mealCalorieCatalog.js';

test('normalizeIngredientMemoryKey strips quantities and keeps the ingredient concept stable', () => {
  assert.equal(normalizeIngredientMemoryKey('buckwheat 50g dry'), 'buckwheat dry');
  assert.equal(normalizeIngredientMemoryKey('Eggs'), 'egg');
  assert.equal(normalizeIngredientMemoryKey('onion/carrot 100g'), 'onion carrot');
});

test('findStarterCalorieFoodMatch resolves common household ingredients from the starter library', () => {
  assert.equal(
    findStarterCalorieFoodMatch({ ingredientName: 'Egg', notes: '' })?.description,
    'egg'
  );

  assert.equal(
    findStarterCalorieFoodMatch({ ingredientName: 'Greek yogurt', notes: '' })?.description,
    'greek yogurt'
  );

  assert.equal(
    findStarterCalorieFoodMatch({ ingredientName: 'wholegrain bread', notes: '' })?.description,
    'wholegrain bread'
  );

  assert.equal(
    findStarterCalorieFoodMatch({ ingredientName: 'mixed vegetables', notes: '' })?.description,
    'mixed vegetables'
  );
});

test('findRememberedIngredientEstimate scales from saved per-100 values', () => {
  const result = findRememberedIngredientEstimate({
    ingredient: {
      ingredientName: 'oats',
      rawText: 'oats 60g',
      quantityValue: 60,
      quantityUnit: 'g',
      notes: '',
    },
    rememberedRows: [
      {
        ingredient_name: 'oats',
        quantity_value: 40,
        quantity_unit: 'g',
        estimated_kcal: 155.6,
        kcal_per_100: 389,
        matched_food_label: 'Oats',
        updated_at: '2026-04-12T08:00:00Z',
      },
    ],
  });

  assert.equal(result?.lookupSource, 'remembered');
  assert.equal(result?.resolutionMethod, 'remembered-direct-mass');
  assert.equal(result?.estimatedKcal, 233.4);
  assert.equal(result?.matchedFood?.dataType, 'Remembered ingredient');
});

test('findRememberedIngredientEstimate can reuse an exact manual match when per-100 data is missing', () => {
  const result = findRememberedIngredientEstimate({
    ingredient: {
      ingredientName: 'homemade pesto',
      rawText: 'homemade pesto 2 tbsp',
      quantityValue: 2,
      quantityUnit: 'tbsp',
      notes: '',
    },
    rememberedRows: [
      {
        ingredient_name: 'homemade pesto',
        quantity_value: 2,
        quantity_unit: 'tbsp',
        manual_kcal: 180,
        matched_food_label: 'Homemade pesto',
        updated_at: '2026-04-12T08:00:00Z',
      },
    ],
  });

  assert.equal(result?.lookupSource, 'remembered');
  assert.equal(result?.resolutionMethod, 'remembered-exact');
  assert.equal(result?.estimatedKcal, 180);
});
