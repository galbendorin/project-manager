import {
  estimateIngredientCarbs,
  estimateIngredientCalories,
  estimateIngredientFiber,
  estimateIngredientProtein,
  normalizeEstimatorUnit,
} from './mealCalorieEstimator.js';

const normalizeSpace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const roundTo = (value, decimals = 1) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  const factor = 10 ** decimals;
  return Math.round(next * factor) / factor;
};

const MEMORY_STOP_WORDS = new Set([
  'and',
  'extra',
  'fresh',
  'large',
  'medium',
  'optional',
  'plain',
  'raw',
  'ripe',
  'small',
  'with',
]);

const MEMORY_UNIT_WORDS = new Set([
  'can',
  'cans',
  'clove',
  'cloves',
  'cup',
  'cups',
  'fillet',
  'fillets',
  'g',
  'gram',
  'grams',
  'item',
  'items',
  'kg',
  'kilogram',
  'kilograms',
  'l',
  'liter',
  'liters',
  'litre',
  'litres',
  'lb',
  'lbs',
  'ml',
  'oz',
  'pc',
  'pcs',
  'piece',
  'pieces',
  'slice',
  'slices',
  'tbsp',
  'teaspoon',
  'teaspoons',
  'tsp',
  'tablespoon',
  'tablespoons',
]);

const TOKEN_NORMALIZERS = {
  almonds: 'almond',
  apples: 'apple',
  avocados: 'avocado',
  bananas: 'banana',
  berries: 'berry',
  beans: 'bean',
  carrots: 'carrot',
  cashews: 'cashew',
  chickpeas: 'chickpea',
  cucumbers: 'cucumber',
  croutons: 'crouton',
  eggs: 'egg',
  grapes: 'grape',
  mushrooms: 'mushroom',
  nuts: 'nut',
  olives: 'olive',
  onions: 'onion',
  peaches: 'peach',
  peppers: 'pepper',
  potatoes: 'potato',
  prawns: 'shrimp',
  raisins: 'raisin',
  strawberries: 'strawberry',
  tomatoes: 'tomato',
  vegetables: 'vegetable',
  walnuts: 'walnut',
};

const toTokens = (value = '') => (
  normalizeSpace(value)
    .toLowerCase()
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/[+/&()]/g, ' ')
    .split(/[^a-z0-9.]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+(?:[.,]\d+)?$/.test(token))
    .filter((token) => !MEMORY_UNIT_WORDS.has(token))
    .filter((token) => !MEMORY_STOP_WORDS.has(token))
    .map((token) => TOKEN_NORMALIZERS[token] || token)
);

export const normalizeIngredientMemoryKey = (value = '') => (
  toTokens(value).join(' ')
);

const buildStarterFood = ({
  description,
  aliases = [],
  kcalPer100,
  proteinPer100 = null,
  carbsPer100 = null,
  fiberPer100 = null,
}) => ({
  description,
  aliases,
  dataType: 'Starter Catalog',
  foodNutrients: [
    {
      nutrient: {
        id: 1008,
        name: 'Energy',
        unitName: 'KCAL',
      },
      amount: kcalPer100,
    },
    ...(proteinPer100 === null ? [] : [{
      nutrient: {
        id: 1003,
        name: 'Protein',
        unitName: 'G',
      },
      amount: proteinPer100,
    }]),
    ...(carbsPer100 === null ? [] : [{
      nutrient: {
        id: 1005,
        name: 'Carbohydrate, by difference',
        unitName: 'G',
      },
      amount: carbsPer100,
    }]),
    ...(fiberPer100 === null ? [] : [{
      nutrient: {
        id: 1079,
        name: 'Fiber, total dietary',
        unitName: 'G',
      },
      amount: fiberPer100,
    }]),
  ],
});

const buildRememberedFood = ({ description, kcalPer100 }) => buildStarterFood({
  description,
  kcalPer100,
});

export const STARTER_CALORIE_FOODS = [
  buildStarterFood({ description: 'egg', aliases: ['eggs'], kcalPer100: 143, proteinPer100: 12.6, carbsPer100: 0.7, fiberPer100: 0 }),
  buildStarterFood({ description: 'quail egg', aliases: ['quail eggs'], kcalPer100: 158, proteinPer100: 13.1, carbsPer100: 0.4, fiberPer100: 0 }),
  buildStarterFood({ description: 'oats', aliases: ['rolled oats', 'porridge oats'], kcalPer100: 389, proteinPer100: 16.9, carbsPer100: 66.3, fiberPer100: 10.6 }),
  buildStarterFood({ description: 'wholegrain bread', aliases: ['whole grain bread', 'bread', 'toast bread', 'bread croutons'], kcalPer100: 247, proteinPer100: 13.0, carbsPer100: 41.0, fiberPer100: 6.8 }),
  buildStarterFood({ description: 'greek yogurt', aliases: ['greek yoghurt', 'yogurt', 'yoghurt', 'biokefir', 'kefir'], kcalPer100: 97, proteinPer100: 10.0, carbsPer100: 3.6, fiberPer100: 0 }),
  buildStarterFood({ description: 'almond milk', aliases: ['plant milk', 'oat milk', 'milk'], kcalPer100: 17, proteinPer100: 0.6, carbsPer100: 0.3, fiberPer100: 0.4 }),
  buildStarterFood({ description: 'banana', aliases: ['bananas'], kcalPer100: 89, proteinPer100: 1.1, carbsPer100: 22.8, fiberPer100: 2.6 }),
  buildStarterFood({ description: 'avocado', aliases: ['avocados'], kcalPer100: 160, proteinPer100: 2.0, carbsPer100: 8.5, fiberPer100: 6.7 }),
  buildStarterFood({ description: 'berries', aliases: ['blueberries', 'strawberries', 'mixed berries'], kcalPer100: 50, proteinPer100: 0.8, carbsPer100: 12.0, fiberPer100: 4.5 }),
  buildStarterFood({ description: 'mango', aliases: [], kcalPer100: 60, proteinPer100: 0.8, carbsPer100: 15.0, fiberPer100: 1.6 }),
  buildStarterFood({ description: 'pineapple', aliases: [], kcalPer100: 50, proteinPer100: 0.5, carbsPer100: 13.1, fiberPer100: 1.4 }),
  buildStarterFood({ description: 'pomegranate', aliases: [], kcalPer100: 83, proteinPer100: 1.7, carbsPer100: 18.7, fiberPer100: 4.0 }),
  buildStarterFood({ description: 'fruit', aliases: ['fresh fruit', 'seasonal fruit'], kcalPer100: 60, proteinPer100: 0.6, carbsPer100: 15.0, fiberPer100: 2.3 }),
  buildStarterFood({ description: 'honey', aliases: [], kcalPer100: 304, proteinPer100: 0.3, carbsPer100: 82.4, fiberPer100: 0 }),
  buildStarterFood({ description: 'cocoa', aliases: ['cocoa powder'], kcalPer100: 228, proteinPer100: 19.6, carbsPer100: 57.9, fiberPer100: 33.2 }),
  buildStarterFood({ description: 'nut butter', aliases: ['peanut butter', 'almond butter'], kcalPer100: 588, proteinPer100: 22.0, carbsPer100: 20.0, fiberPer100: 6.0 }),
  buildStarterFood({ description: 'chia seeds', aliases: ['chia'], kcalPer100: 486, proteinPer100: 16.5, carbsPer100: 42.1, fiberPer100: 34.4 }),
  buildStarterFood({ description: 'flax seeds', aliases: ['flaxseed'], kcalPer100: 534, proteinPer100: 18.3, carbsPer100: 28.9, fiberPer100: 27.3 }),
  buildStarterFood({ description: 'almonds', aliases: ['almond'], kcalPer100: 579, proteinPer100: 21.2, carbsPer100: 21.6, fiberPer100: 12.5 }),
  buildStarterFood({ description: 'walnuts', aliases: ['walnut'], kcalPer100: 654, proteinPer100: 15.2, carbsPer100: 13.7, fiberPer100: 6.7 }),
  buildStarterFood({ description: 'cashews', aliases: ['cashew'], kcalPer100: 553, proteinPer100: 18.2, carbsPer100: 30.2, fiberPer100: 3.3 }),
  buildStarterFood({ description: 'peanuts', aliases: ['peanut'], kcalPer100: 567, proteinPer100: 25.8, carbsPer100: 16.1, fiberPer100: 8.5 }),
  buildStarterFood({ description: 'nuts', aliases: ['ground nuts'], kcalPer100: 607, proteinPer100: 20.0, carbsPer100: 21.0, fiberPer100: 7.5 }),
  buildStarterFood({ description: 'raisins', aliases: [], kcalPer100: 299, proteinPer100: 3.1, carbsPer100: 79.2, fiberPer100: 3.7 }),
  buildStarterFood({ description: 'dark chocolate', aliases: ['chocolate'], kcalPer100: 598, proteinPer100: 7.8, carbsPer100: 46.4, fiberPer100: 10.9 }),
  buildStarterFood({ description: 'granola', aliases: [], kcalPer100: 470, proteinPer100: 10.0, carbsPer100: 64.0, fiberPer100: 8.0 }),
  buildStarterFood({ description: 'mozzarella', aliases: [], kcalPer100: 280, proteinPer100: 28.0, carbsPer100: 3.1, fiberPer100: 0 }),
  buildStarterFood({ description: 'ricotta', aliases: [], kcalPer100: 174, proteinPer100: 11.3, carbsPer100: 4.0, fiberPer100: 0 }),
  buildStarterFood({ description: 'cottage cheese', aliases: ['cheese', 'cream cheese'], kcalPer100: 98, proteinPer100: 11.1, carbsPer100: 3.4, fiberPer100: 0 }),
  buildStarterFood({ description: 'feta', aliases: ['feta mozzarella'], kcalPer100: 265, proteinPer100: 14.2, carbsPer100: 4.1, fiberPer100: 0 }),
  buildStarterFood({ description: 'parmesan', aliases: ['grated cheese', 'gouda', 'hard cheese'], kcalPer100: 431, proteinPer100: 38.0, carbsPer100: 4.1, fiberPer100: 0 }),
  buildStarterFood({ description: 'semi-salted salmon', aliases: ['salmon'], kcalPer100: 208, proteinPer100: 22.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'tuna in water', aliases: ['tuna'], kcalPer100: 116, proteinPer100: 26.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'chicken breast', aliases: ['chicken', 'minced chicken', 'chicken stew'], kcalPer100: 165, proteinPer100: 31.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'chicken thigh', aliases: ['chicken thighs'], kcalPer100: 209, proteinPer100: 26.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'turkey breast', aliases: ['turkey', 'minced turkey', 'turkey stew'], kcalPer100: 135, proteinPer100: 29.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'beef steak', aliases: ['beef', 'minced meat', 'meatballs'], kcalPer100: 250, proteinPer100: 26.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'rabbit meat', aliases: ['rabbit'], kcalPer100: 173, proteinPer100: 33.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'shrimp', aliases: ['prawns'], kcalPer100: 99, proteinPer100: 24.0, carbsPer100: 0.2, fiberPer100: 0 }),
  buildStarterFood({ description: 'cod', aliases: ['fish', 'white fish', 'dorado', 'trout'], kcalPer100: 105, proteinPer100: 23.0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'tofu', aliases: [], kcalPer100: 144, proteinPer100: 15.7, carbsPer100: 4.3, fiberPer100: 2.3 }),
  buildStarterFood({ description: 'basmati rice dry', aliases: ['rice', 'basmati rice'], kcalPer100: 365, proteinPer100: 7.1, carbsPer100: 80.0, fiberPer100: 1.3 }),
  buildStarterFood({ description: 'quinoa dry', aliases: ['quinoa'], kcalPer100: 368, proteinPer100: 14.1, carbsPer100: 64.2, fiberPer100: 7.0 }),
  buildStarterFood({ description: 'buckwheat dry', aliases: ['buckwheat'], kcalPer100: 343, proteinPer100: 13.3, carbsPer100: 71.5, fiberPer100: 10.0 }),
  buildStarterFood({ description: 'bulgur dry', aliases: ['bulgur'], kcalPer100: 342, proteinPer100: 12.3, carbsPer100: 75.9, fiberPer100: 12.5 }),
  buildStarterFood({ description: 'couscous dry', aliases: ['couscous'], kcalPer100: 376, proteinPer100: 12.8, carbsPer100: 77.4, fiberPer100: 5.0 }),
  buildStarterFood({ description: 'cornmeal dry', aliases: ['polenta', 'cornmeal'], kcalPer100: 370, proteinPer100: 8.1, carbsPer100: 79.5, fiberPer100: 7.3 }),
  buildStarterFood({ description: 'wholegrain pasta dry', aliases: ['wholegrain pasta', 'pasta', 'spaghetti', 'macaroni', 'cannelloni', 'shells'], kcalPer100: 350, proteinPer100: 13.0, carbsPer100: 67.0, fiberPer100: 8.0 }),
  buildStarterFood({ description: 'lentils dry', aliases: ['lentils', 'lentil'], kcalPer100: 353, proteinPer100: 25.8, carbsPer100: 60.1, fiberPer100: 10.7 }),
  buildStarterFood({ description: 'chickpeas dry', aliases: ['chickpeas', 'chickpea'], kcalPer100: 364, proteinPer100: 20.5, carbsPer100: 60.7, fiberPer100: 17.0 }),
  buildStarterFood({ description: 'sweet potato', aliases: ['sweet potatoes'], kcalPer100: 86, proteinPer100: 1.6, carbsPer100: 20.1, fiberPer100: 3.0 }),
  buildStarterFood({ description: 'potato', aliases: ['potatoes'], kcalPer100: 77, proteinPer100: 2.0, carbsPer100: 17.5, fiberPer100: 2.2 }),
  buildStarterFood({ description: 'carrot', aliases: ['carrots'], kcalPer100: 41, proteinPer100: 0.9, carbsPer100: 9.6, fiberPer100: 2.8 }),
  buildStarterFood({ description: 'pepper', aliases: ['bell pepper', 'red pepper'], kcalPer100: 31, proteinPer100: 1.0, carbsPer100: 6.0, fiberPer100: 2.1 }),
  buildStarterFood({ description: 'tomato', aliases: ['tomatoes'], kcalPer100: 18, proteinPer100: 0.9, carbsPer100: 3.9, fiberPer100: 1.2 }),
  buildStarterFood({ description: 'tomato sauce', aliases: ['passata'], kcalPer100: 29, proteinPer100: 1.4, carbsPer100: 6.0, fiberPer100: 1.5 }),
  buildStarterFood({ description: 'cucumber', aliases: ['cucumbers'], kcalPer100: 15, proteinPer100: 0.7, carbsPer100: 3.6, fiberPer100: 0.5 }),
  buildStarterFood({ description: 'onion', aliases: ['red onion'], kcalPer100: 40, proteinPer100: 1.1, carbsPer100: 9.3, fiberPer100: 1.7 }),
  buildStarterFood({ description: 'onion carrot mix', aliases: ['onion carrot', 'onion/carrot', 'carrot onion'], kcalPer100: 40, proteinPer100: 1.0, carbsPer100: 9.5, fiberPer100: 2.2 }),
  buildStarterFood({ description: 'mushrooms', aliases: ['mushroom'], kcalPer100: 22, proteinPer100: 3.1, carbsPer100: 3.3, fiberPer100: 1.0 }),
  buildStarterFood({ description: 'mixed vegetables', aliases: ['vegetables', 'mixed vegetables', 'salad vegetables', 'raw vegetables', 'grilled vegetables', 'side vegetables'], kcalPer100: 30, proteinPer100: 1.8, carbsPer100: 6.5, fiberPer100: 2.8 }),
  buildStarterFood({ description: 'spinach', aliases: ['greens', 'arugula', 'salad greens'], kcalPer100: 23, proteinPer100: 2.9, carbsPer100: 3.6, fiberPer100: 2.2 }),
  buildStarterFood({ description: 'peas', aliases: ['green peas'], kcalPer100: 81, proteinPer100: 5.4, carbsPer100: 14.5, fiberPer100: 5.7 }),
  buildStarterFood({ description: 'corn', aliases: [], kcalPer100: 86, proteinPer100: 3.3, carbsPer100: 19.0, fiberPer100: 2.7 }),
  buildStarterFood({ description: 'broccoli', aliases: [], kcalPer100: 34, proteinPer100: 2.8, carbsPer100: 6.6, fiberPer100: 2.6 }),
  buildStarterFood({ description: 'beetroot', aliases: ['beet'], kcalPer100: 43, proteinPer100: 1.6, carbsPer100: 10.0, fiberPer100: 2.8 }),
  buildStarterFood({ description: 'lemon', aliases: ['lemon juice'], kcalPer100: 29, proteinPer100: 1.1, carbsPer100: 9.3, fiberPer100: 2.8 }),
  buildStarterFood({ description: 'olive oil', aliases: ['oil'], kcalPer100: 884, proteinPer100: 0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'ghee', aliases: ['butter'], kcalPer100: 900, proteinPer100: 0, carbsPer100: 0, fiberPer100: 0 }),
  buildStarterFood({ description: 'hummus', aliases: [], kcalPer100: 166, proteinPer100: 8.0, carbsPer100: 14.3, fiberPer100: 6.0 }),
  buildStarterFood({ description: 'olives', aliases: ['olive'], kcalPer100: 115, proteinPer100: 0.8, carbsPer100: 6.3, fiberPer100: 3.2 }),
  buildStarterFood({ description: 'croutons', aliases: ['bread croutons'], kcalPer100: 407, proteinPer100: 12.0, carbsPer100: 72.0, fiberPer100: 5.0 }),
];

const buildCandidateTexts = (food = {}) => (
  [food.description, ...(food.aliases || [])]
    .map((value) => normalizeSpace(value))
    .filter(Boolean)
);

const getStarterMatchScore = (food = {}, ingredient = {}) => {
  const ingredientText = normalizeSpace(`${ingredient.ingredientName || ingredient.rawText || ''} ${ingredient.notes || ''}`).toLowerCase();
  const ingredientKey = normalizeIngredientMemoryKey(ingredientText);
  const ingredientTokens = new Set(ingredientKey.split(' ').filter(Boolean));

  if (!ingredientKey) return 0;

  let score = 0;
  buildCandidateTexts(food).forEach((candidateText) => {
    const candidateKey = normalizeIngredientMemoryKey(candidateText);
    const candidateTokens = new Set(candidateKey.split(' ').filter(Boolean));

    if (!candidateKey) return;
    if (candidateKey === ingredientKey) score = Math.max(score, 120);
    if (ingredientKey.includes(candidateKey)) score = Math.max(score, 82);
    if (candidateKey.includes(ingredientKey)) score = Math.max(score, 78);

    let tokenMatches = 0;
    ingredientTokens.forEach((token) => {
      if (candidateTokens.has(token)) tokenMatches += 1;
    });

    const tokenScore = tokenMatches * 16;
    if (tokenMatches === ingredientTokens.size && tokenMatches > 0) {
      score = Math.max(score, 62 + tokenScore);
    } else {
      score = Math.max(score, tokenScore);
    }
  });

  if (ingredientTokens.size === 1 && score < 24) {
    return 0;
  }

  return score;
};

const toFiniteNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const toPositiveFiniteNumber = (value) => {
  const next = toFiniteNumber(value);
  return next !== null && next > 0 ? next : null;
};

const buildRememberedMatchedFood = (row = {}, ingredientName = '') => ({
  fdcId: toFiniteNumber(row.linkedFdcId ?? row.linked_fdc_id),
  description: row.matchedFoodLabel
    || row.matched_food_label
    || row.ingredientName
    || row.ingredient_name
    || row.rawText
    || row.raw_text
    || ingredientName,
  dataType: 'Remembered ingredient',
});

const getRememberedMatchScore = (row = {}, ingredient = {}) => {
  const ingredientKey = normalizeIngredientMemoryKey(`${ingredient.ingredientName || ingredient.rawText || ''} ${ingredient.notes || ''}`);
  const rowKey = normalizeIngredientMemoryKey(`${row.ingredientName || row.ingredient_name || row.rawText || row.raw_text || ''} ${row.notes || ''}`);

  if (!ingredientKey || !rowKey || ingredientKey !== rowKey) return 0;

  let score = 100;
  if (toPositiveFiniteNumber(row.kcalPer100 ?? row.kcal_per_100) !== null) score += 24;
  if (toPositiveFiniteNumber(row.manualKcal ?? row.manual_kcal) !== null) score += 12;
  if (toPositiveFiniteNumber(row.estimatedKcal ?? row.estimated_kcal) !== null) score += 6;

  const ingredientUnit = normalizeEstimatorUnit(ingredient.quantityUnit || '');
  const rowUnit = normalizeEstimatorUnit(row.quantityUnit ?? row.quantity_unit ?? '');
  if (ingredientUnit && rowUnit && ingredientUnit === rowUnit) score += 6;

  const ingredientQuantity = toFiniteNumber(ingredient.quantityValue);
  const rowQuantity = toFiniteNumber(row.quantityValue ?? row.quantity_value);
  if (ingredientQuantity !== null && rowQuantity !== null && ingredientQuantity === rowQuantity) score += 6;

  return score;
};

export const findStarterCalorieFoodMatch = (ingredient = {}) => {
  const ranked = STARTER_CALORIE_FOODS
    .map((food) => ({
      ...food,
      _starterScore: getStarterMatchScore(food, ingredient),
    }))
    .filter((food) => food._starterScore >= 24)
    .sort((left, right) => right._starterScore - left._starterScore);

  return ranked[0] || null;
};

export const estimateIngredientFiberFromStarterCatalog = (ingredient = {}) => {
  const starterFoodMatch = findStarterCalorieFoodMatch(ingredient);
  if (!starterFoodMatch) return null;

  const fiberResult = estimateIngredientFiber({
    ingredient,
    food: starterFoodMatch,
  });

  return fiberResult.resolved && Number.isFinite(fiberResult.estimatedFiberG)
    ? fiberResult
    : null;
};

export const estimateIngredientNutritionFromStarterCatalog = (ingredient = {}) => {
  const starterFoodMatch = findStarterCalorieFoodMatch(ingredient);
  if (!starterFoodMatch) return null;

  const proteinResult = estimateIngredientProtein({
    ingredient,
    food: starterFoodMatch,
  });
  const carbsResult = estimateIngredientCarbs({
    ingredient,
    food: starterFoodMatch,
  });
  const fiberResult = estimateIngredientFiber({
    ingredient,
    food: starterFoodMatch,
  });

  return {
    proteinG: Number.isFinite(proteinResult?.estimatedProteinG) ? proteinResult.estimatedProteinG : 0,
    carbsG: Number.isFinite(carbsResult?.estimatedCarbsG) ? carbsResult.estimatedCarbsG : 0,
    fiberG: Number.isFinite(fiberResult?.estimatedFiberG) ? fiberResult.estimatedFiberG : 0,
  };
};

export const estimateRecipeNutritionFromStarterCatalog = (recipe = {}) => {
  const totals = (recipe.ingredients || []).reduce((sum, ingredient) => {
    const nutrientResult = estimateIngredientNutritionFromStarterCatalog(ingredient);
    if (!nutrientResult) return sum;
    return {
      proteinG: sum.proteinG + nutrientResult.proteinG,
      carbsG: sum.carbsG + nutrientResult.carbsG,
      fiberG: sum.fiberG + nutrientResult.fiberG,
    };
  }, {
    proteinG: 0,
    carbsG: 0,
    fiberG: 0,
  });

  return {
    proteinG: roundTo(totals.proteinG, 1) ?? 0,
    carbsG: roundTo(totals.carbsG, 1) ?? 0,
    fiberG: roundTo(totals.fiberG, 1) ?? 0,
  };
};

export const findRememberedIngredientEstimate = ({ ingredient = {}, rememberedRows = [] } = {}) => {
  const rankedRows = rememberedRows
    .map((row) => ({
      row,
      score: getRememberedMatchScore(row, ingredient),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => (
      right.score - left.score
      || (toPositiveFiniteNumber(right.row.manualKcal ?? right.row.manual_kcal) ? 1 : 0) - (toPositiveFiniteNumber(left.row.manualKcal ?? left.row.manual_kcal) ? 1 : 0)
      || `${right.row.updatedAt || right.row.updated_at || ''}`.localeCompare(`${left.row.updatedAt || left.row.updated_at || ''}`)
    ));

  const best = rankedRows[0]?.row;
  if (!best) return null;

  const kcalPer100 = toPositiveFiniteNumber(best.kcalPer100 ?? best.kcal_per_100);
  if (kcalPer100 !== null) {
    const rememberedEstimate = estimateIngredientCalories({
      ingredient,
      food: buildRememberedFood({
        description: best.matchedFoodLabel
          || best.matched_food_label
          || best.ingredientName
          || best.ingredient_name
          || ingredient.ingredientName
          || ingredient.rawText
          || 'Remembered ingredient',
        kcalPer100,
      }),
    });

    if (rememberedEstimate.resolved) {
      return {
        ...rememberedEstimate,
        resolutionMethod: `remembered-${rememberedEstimate.resolutionMethod}`,
        matchedFood: buildRememberedMatchedFood(best, ingredient.ingredientName || ingredient.rawText || ''),
        lookupSource: 'remembered',
      };
    }
  }

  const ingredientQuantity = toFiniteNumber(ingredient.quantityValue);
  const ingredientUnit = normalizeEstimatorUnit(ingredient.quantityUnit || '');
  const rowQuantity = toFiniteNumber(best.quantityValue ?? best.quantity_value);
  const rowUnit = normalizeEstimatorUnit(best.quantityUnit ?? best.quantity_unit ?? '');
  const rememberedKcal = toPositiveFiniteNumber(best.manualKcal ?? best.manual_kcal) ?? toPositiveFiniteNumber(best.estimatedKcal ?? best.estimated_kcal);

  if (
    rememberedKcal !== null
    && ingredientQuantity !== null
    && rowQuantity !== null
    && ingredientQuantity === rowQuantity
    && ingredientUnit
    && rowUnit
    && ingredientUnit === rowUnit
  ) {
    return {
      ingredientName: ingredient.ingredientName,
      rawText: ingredient.rawText,
      quantityValue: ingredient.quantityValue,
      quantityUnit: ingredient.quantityUnit,
      estimatedKcal: rememberedKcal,
      quantityGrams: null,
      kcalPer100: kcalPer100,
      resolutionMethod: 'remembered-exact',
      resolved: true,
      reason: '',
      matchedFood: buildRememberedMatchedFood(best, ingredient.ingredientName || ingredient.rawText || ''),
      lookupSource: 'remembered',
    };
  }

  return null;
};
