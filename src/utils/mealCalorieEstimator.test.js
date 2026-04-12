import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIngredientSearchQuery,
  estimateIngredientCalories,
  estimateIngredientWeightGrams,
  getFoodEnergyPer100,
  normalizeEstimatorUnit,
  pickBestFoodMatch,
  summarizeRecipeCalorieEstimate,
} from './mealCalorieEstimator.js';

test('normalizeEstimatorUnit folds common aliases together', () => {
  assert.equal(normalizeEstimatorUnit('Pieces'), 'pcs');
  assert.equal(normalizeEstimatorUnit('tablespoons'), 'tbsp');
  assert.equal(normalizeEstimatorUnit('cup'), 'cup');
  assert.equal(normalizeEstimatorUnit('g'), 'g');
});

test('buildIngredientSearchQuery keeps the ingredient readable for USDA search', () => {
  assert.equal(
    buildIngredientSearchQuery({ ingredientName: 'olive oil/tahini', notes: 'for dressing' }),
    'olive oil tahini for dressing'
  );
});

test('getFoodEnergyPer100 prefers kcal energy nutrients', () => {
  assert.equal(getFoodEnergyPer100({
    foodNutrients: [
      { nutrient: { id: 1008, name: 'Energy', unitName: 'KCAL' }, amount: 143 },
      { nutrient: { id: 1003, name: 'Protein', unitName: 'G' }, amount: 12.6 },
    ],
  }), 143);
});

test('estimateIngredientWeightGrams handles direct mass, volumes, and pieces', () => {
  assert.deepEqual(
    estimateIngredientWeightGrams({
      ingredient: { ingredientName: 'oats', quantityValue: 60, quantityUnit: 'g' },
      food: {},
    }),
    { grams: 60, method: 'direct-mass', reason: '' }
  );

  assert.deepEqual(
    estimateIngredientWeightGrams({
      ingredient: { ingredientName: 'Greek yogurt', quantityValue: 2, quantityUnit: 'tbsp' },
      food: {},
    }),
    { grams: 31.2, method: 'volume-conversion', reason: '' }
  );

  assert.deepEqual(
    estimateIngredientWeightGrams({
      ingredient: { ingredientName: 'egg', quantityValue: 2, quantityUnit: 'pcs' },
      food: {},
    }),
    { grams: 100, method: 'piece-estimate', reason: '' }
  );
});

test('estimateIngredientWeightGrams uses USDA portion matches when present', () => {
  assert.deepEqual(
    estimateIngredientWeightGrams({
      ingredient: { ingredientName: 'banana', quantityValue: 1, quantityUnit: 'small' },
      food: {
        foodPortions: [
          { amount: 1, gramWeight: 101, modifier: 'small banana' },
        ],
      },
    }),
    { grams: 101, method: 'usda-portion', reason: '' }
  );
});

test('pickBestFoodMatch favors simple raw foods over branded noise', () => {
  const foods = [
    { description: 'Banana chips, sweetened', dataType: 'Branded', fdcId: 1 },
    { description: 'Bananas, raw', dataType: 'Foundation', fdcId: 2 },
    { description: 'Banana muffin', dataType: 'Survey (FNDDS)', fdcId: 3 },
  ];

  assert.equal(
    pickBestFoodMatch(foods, { ingredientName: 'banana' })?.fdcId,
    2
  );
});

test('estimateIngredientCalories returns a resolved ingredient summary', () => {
  assert.deepEqual(
    estimateIngredientCalories({
      ingredient: { ingredientName: 'egg', rawText: 'egg 2 pcs', quantityValue: 2, quantityUnit: 'pcs' },
      food: {
        fdcId: 123,
        description: 'Egg, whole, raw',
        dataType: 'Foundation',
        foodNutrients: [
          { nutrient: { id: 1008, name: 'Energy', unitName: 'KCAL' }, amount: 143 },
        ],
      },
    }),
    {
      ingredientName: 'egg',
      rawText: 'egg 2 pcs',
      quantityValue: 2,
      quantityUnit: 'pcs',
      estimatedKcal: 143,
      quantityGrams: 100,
      kcalPer100: 143,
      resolutionMethod: 'piece-estimate',
      resolved: true,
      reason: '',
      matchedFood: {
        fdcId: 123,
        description: 'Egg, whole, raw',
        dataType: 'Foundation',
      },
    }
  );
});

test('summarizeRecipeCalorieEstimate returns batch and review metadata', () => {
  const summary = summarizeRecipeCalorieEstimate({
    ingredientResults: [
      { estimatedKcal: 300, resolved: true, ingredientName: 'oats' },
      { estimatedKcal: 120, resolved: true, ingredientName: 'milk' },
      { estimatedKcal: null, resolved: false, ingredientName: 'berries' },
    ],
    yieldMode: 'batch',
    batchYieldPortions: 4,
  });

  assert.equal(summary.totalKcal, 420);
  assert.equal(summary.perServingKcal, 105);
  assert.equal(summary.resolvedIngredientCount, 2);
  assert.equal(summary.unresolvedIngredientCount, 1);
  assert.equal(summary.warnings[0], '1 ingredient needs manual review.');
  assert.equal(summary.batchYieldPortions, 4);
});
