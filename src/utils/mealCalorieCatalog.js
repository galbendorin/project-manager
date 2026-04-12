import {
  estimateIngredientCalories,
  normalizeEstimatorUnit,
} from './mealCalorieEstimator.js';

const normalizeSpace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

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
  ],
});

const buildRememberedFood = ({ description, kcalPer100 }) => buildStarterFood({
  description,
  kcalPer100,
});

export const STARTER_CALORIE_FOODS = [
  buildStarterFood({ description: 'egg', aliases: ['eggs'], kcalPer100: 143 }),
  buildStarterFood({ description: 'quail egg', aliases: ['quail eggs'], kcalPer100: 158 }),
  buildStarterFood({ description: 'oats', aliases: ['rolled oats', 'porridge oats'], kcalPer100: 389 }),
  buildStarterFood({ description: 'wholegrain bread', aliases: ['whole grain bread', 'bread', 'toast bread', 'bread croutons'], kcalPer100: 247 }),
  buildStarterFood({ description: 'greek yogurt', aliases: ['greek yoghurt', 'yogurt', 'yoghurt', 'biokefir', 'kefir'], kcalPer100: 97 }),
  buildStarterFood({ description: 'almond milk', aliases: ['plant milk', 'oat milk', 'milk'], kcalPer100: 17 }),
  buildStarterFood({ description: 'banana', aliases: ['bananas'], kcalPer100: 89 }),
  buildStarterFood({ description: 'avocado', aliases: ['avocados'], kcalPer100: 160 }),
  buildStarterFood({ description: 'berries', aliases: ['blueberries', 'strawberries', 'mixed berries'], kcalPer100: 50 }),
  buildStarterFood({ description: 'mango', aliases: [], kcalPer100: 60 }),
  buildStarterFood({ description: 'pineapple', aliases: [], kcalPer100: 50 }),
  buildStarterFood({ description: 'pomegranate', aliases: [], kcalPer100: 83 }),
  buildStarterFood({ description: 'fruit', aliases: ['fresh fruit', 'seasonal fruit'], kcalPer100: 60 }),
  buildStarterFood({ description: 'honey', aliases: [], kcalPer100: 304 }),
  buildStarterFood({ description: 'cocoa', aliases: ['cocoa powder'], kcalPer100: 228 }),
  buildStarterFood({ description: 'nut butter', aliases: ['peanut butter', 'almond butter'], kcalPer100: 588 }),
  buildStarterFood({ description: 'chia seeds', aliases: ['chia'], kcalPer100: 486 }),
  buildStarterFood({ description: 'flax seeds', aliases: ['flaxseed'], kcalPer100: 534 }),
  buildStarterFood({ description: 'almonds', aliases: ['almond'], kcalPer100: 579 }),
  buildStarterFood({ description: 'walnuts', aliases: ['walnut'], kcalPer100: 654 }),
  buildStarterFood({ description: 'cashews', aliases: ['cashew'], kcalPer100: 553 }),
  buildStarterFood({ description: 'peanuts', aliases: ['peanut'], kcalPer100: 567 }),
  buildStarterFood({ description: 'nuts', aliases: ['ground nuts'], kcalPer100: 607 }),
  buildStarterFood({ description: 'raisins', aliases: [], kcalPer100: 299 }),
  buildStarterFood({ description: 'dark chocolate', aliases: ['chocolate'], kcalPer100: 598 }),
  buildStarterFood({ description: 'granola', aliases: [], kcalPer100: 470 }),
  buildStarterFood({ description: 'mozzarella', aliases: [], kcalPer100: 280 }),
  buildStarterFood({ description: 'ricotta', aliases: [], kcalPer100: 174 }),
  buildStarterFood({ description: 'cottage cheese', aliases: ['cheese', 'cream cheese'], kcalPer100: 98 }),
  buildStarterFood({ description: 'feta', aliases: ['feta mozzarella'], kcalPer100: 265 }),
  buildStarterFood({ description: 'parmesan', aliases: ['grated cheese', 'gouda', 'hard cheese'], kcalPer100: 431 }),
  buildStarterFood({ description: 'semi-salted salmon', aliases: ['salmon'], kcalPer100: 208 }),
  buildStarterFood({ description: 'tuna in water', aliases: ['tuna'], kcalPer100: 116 }),
  buildStarterFood({ description: 'chicken breast', aliases: ['chicken', 'minced chicken', 'chicken stew'], kcalPer100: 165 }),
  buildStarterFood({ description: 'chicken thigh', aliases: ['chicken thighs'], kcalPer100: 209 }),
  buildStarterFood({ description: 'turkey breast', aliases: ['turkey', 'minced turkey', 'turkey stew'], kcalPer100: 135 }),
  buildStarterFood({ description: 'beef steak', aliases: ['beef', 'minced meat', 'meatballs'], kcalPer100: 250 }),
  buildStarterFood({ description: 'rabbit meat', aliases: ['rabbit'], kcalPer100: 173 }),
  buildStarterFood({ description: 'shrimp', aliases: ['prawns'], kcalPer100: 99 }),
  buildStarterFood({ description: 'cod', aliases: ['fish', 'white fish', 'dorado', 'trout'], kcalPer100: 105 }),
  buildStarterFood({ description: 'tofu', aliases: [], kcalPer100: 144 }),
  buildStarterFood({ description: 'basmati rice dry', aliases: ['rice', 'basmati rice'], kcalPer100: 365 }),
  buildStarterFood({ description: 'quinoa dry', aliases: ['quinoa'], kcalPer100: 368 }),
  buildStarterFood({ description: 'buckwheat dry', aliases: ['buckwheat'], kcalPer100: 343 }),
  buildStarterFood({ description: 'bulgur dry', aliases: ['bulgur'], kcalPer100: 342 }),
  buildStarterFood({ description: 'couscous dry', aliases: ['couscous'], kcalPer100: 376 }),
  buildStarterFood({ description: 'cornmeal dry', aliases: ['polenta', 'cornmeal'], kcalPer100: 370 }),
  buildStarterFood({ description: 'wholegrain pasta dry', aliases: ['wholegrain pasta', 'pasta', 'spaghetti', 'macaroni', 'cannelloni', 'shells'], kcalPer100: 350 }),
  buildStarterFood({ description: 'lentils dry', aliases: ['lentils', 'lentil'], kcalPer100: 353 }),
  buildStarterFood({ description: 'chickpeas dry', aliases: ['chickpeas', 'chickpea'], kcalPer100: 364 }),
  buildStarterFood({ description: 'sweet potato', aliases: ['sweet potatoes'], kcalPer100: 86 }),
  buildStarterFood({ description: 'potato', aliases: ['potatoes'], kcalPer100: 77 }),
  buildStarterFood({ description: 'carrot', aliases: ['carrots'], kcalPer100: 41 }),
  buildStarterFood({ description: 'pepper', aliases: ['bell pepper', 'red pepper'], kcalPer100: 31 }),
  buildStarterFood({ description: 'tomato', aliases: ['tomatoes'], kcalPer100: 18 }),
  buildStarterFood({ description: 'tomato sauce', aliases: ['passata'], kcalPer100: 29 }),
  buildStarterFood({ description: 'cucumber', aliases: ['cucumbers'], kcalPer100: 15 }),
  buildStarterFood({ description: 'onion', aliases: ['red onion'], kcalPer100: 40 }),
  buildStarterFood({ description: 'onion carrot mix', aliases: ['onion carrot', 'onion/carrot', 'carrot onion'], kcalPer100: 40 }),
  buildStarterFood({ description: 'mushrooms', aliases: ['mushroom'], kcalPer100: 22 }),
  buildStarterFood({ description: 'mixed vegetables', aliases: ['vegetables', 'mixed vegetables', 'salad vegetables', 'raw vegetables', 'grilled vegetables', 'side vegetables'], kcalPer100: 30 }),
  buildStarterFood({ description: 'spinach', aliases: ['greens', 'arugula', 'salad greens'], kcalPer100: 23 }),
  buildStarterFood({ description: 'peas', aliases: ['green peas'], kcalPer100: 81 }),
  buildStarterFood({ description: 'corn', aliases: [], kcalPer100: 86 }),
  buildStarterFood({ description: 'broccoli', aliases: [], kcalPer100: 34 }),
  buildStarterFood({ description: 'beetroot', aliases: ['beet'], kcalPer100: 43 }),
  buildStarterFood({ description: 'lemon', aliases: ['lemon juice'], kcalPer100: 29 }),
  buildStarterFood({ description: 'olive oil', aliases: ['oil'], kcalPer100: 884 }),
  buildStarterFood({ description: 'ghee', aliases: ['butter'], kcalPer100: 900 }),
  buildStarterFood({ description: 'hummus', aliases: [], kcalPer100: 166 }),
  buildStarterFood({ description: 'olives', aliases: ['olive'], kcalPer100: 115 }),
  buildStarterFood({ description: 'croutons', aliases: ['bread croutons'], kcalPer100: 407 }),
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
  if (toFiniteNumber(row.kcalPer100 ?? row.kcal_per_100) !== null) score += 24;
  if (toFiniteNumber(row.manualKcal ?? row.manual_kcal) !== null) score += 12;
  if (toFiniteNumber(row.estimatedKcal ?? row.estimated_kcal) !== null) score += 6;

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

export const findRememberedIngredientEstimate = ({ ingredient = {}, rememberedRows = [] } = {}) => {
  const rankedRows = rememberedRows
    .map((row) => ({
      row,
      score: getRememberedMatchScore(row, ingredient),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => (
      right.score - left.score
      || (toFiniteNumber(right.row.manualKcal ?? right.row.manual_kcal) ? 1 : 0) - (toFiniteNumber(left.row.manualKcal ?? left.row.manual_kcal) ? 1 : 0)
      || `${right.row.updatedAt || right.row.updated_at || ''}`.localeCompare(`${left.row.updatedAt || left.row.updated_at || ''}`)
    ));

  const best = rankedRows[0]?.row;
  if (!best) return null;

  const kcalPer100 = toFiniteNumber(best.kcalPer100 ?? best.kcal_per_100);
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
  const rememberedKcal = toFiniteNumber(best.manualKcal ?? best.manual_kcal) ?? toFiniteNumber(best.estimatedKcal ?? best.estimated_kcal);

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
