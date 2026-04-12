const ENERGY_NUTRIENT_IDS = new Set([1008, 2047, 2048]);
const PROTEIN_NUTRIENT_IDS = new Set([1003]);
const CARB_NUTRIENT_IDS = new Set([1005]);
const FIBER_NUTRIENT_IDS = new Set([1079]);

const MASS_UNIT_TO_GRAMS = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  milligram: 0.001,
  milligrams: 0.001,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

const VOLUME_UNIT_TO_ML = {
  ml: 1,
  millilitre: 1,
  millilitres: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  litre: 1000,
  litres: 1000,
  liter: 1000,
  liters: 1000,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  cup: 240,
  cups: 240,
};

const UNIT_ALIASES = {
  pcs: ['pc', 'pcs', 'piece', 'pieces', 'whole', 'item', 'items'],
  tsp: ['tsp', 'teaspoon', 'teaspoons'],
  tbsp: ['tbsp', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups'],
  slice: ['slice', 'slices'],
  clove: ['clove', 'cloves'],
  can: ['can', 'cans'],
  fillet: ['fillet', 'fillets', 'filet', 'filets'],
};

const SIZE_MULTIPLIERS = {
  small: 0.75,
  medium: 1,
  large: 1.25,
};

const STOP_WORDS = new Set([
  'and',
  'for',
  'fresh',
  'mixed',
  'optional',
  'plain',
  'raw',
  'ripe',
  'with',
]);

const DENSITY_RULES = [
  { keywords: ['olive oil', 'oil', 'ghee', 'butter'], gramsPerMl: 0.92 },
  { keywords: ['honey', 'syrup', 'jam'], gramsPerMl: 1.35 },
  { keywords: ['greek yogurt', 'yogurt', 'yoghurt', 'kefir'], gramsPerMl: 1.04 },
  { keywords: ['milk', 'almond milk', 'plant milk', 'oat milk'], gramsPerMl: 1.03 },
  { keywords: ['peanut butter', 'nut butter', 'almond paste', 'tahini'], gramsPerMl: 1.08 },
  { keywords: ['flour'], gramsPerMl: 0.53 },
  { keywords: ['oats', 'granola', 'rice', 'quinoa', 'bulgur', 'couscous'], gramsPerMl: 0.42 },
];

const PIECE_WEIGHT_RULES = [
  { keywords: ['quail egg'], grams: 9 },
  { keywords: ['egg'], grams: 50 },
  { keywords: ['banana'], grams: 118 },
  { keywords: ['apple'], grams: 182 },
  { keywords: ['pear'], grams: 178 },
  { keywords: ['peach'], grams: 150 },
  { keywords: ['kiwi'], grams: 75 },
  { keywords: ['mango'], grams: 200 },
  { keywords: ['avocado'], grams: 150 },
  { keywords: ['tomato'], grams: 123 },
  { keywords: ['pepper'], grams: 150 },
  { keywords: ['cucumber'], grams: 150 },
  { keywords: ['onion'], grams: 110 },
  { keywords: ['carrot'], grams: 60 },
  { keywords: ['sweet potato'], grams: 180 },
  { keywords: ['potato'], grams: 173 },
  { keywords: ['garlic clove'], grams: 5 },
  { keywords: ['garlic'], grams: 5 },
  { keywords: ['bread slice'], grams: 32 },
  { keywords: ['bread'], grams: 32 },
];

const normalizeSpace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const roundTo = (value, decimals = 1) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return null;
  const factor = 10 ** decimals;
  return Math.round(next * factor) / factor;
};

export const normalizeEstimatorUnit = (value = '') => {
  const unit = normalizeSpace(value).toLowerCase();
  if (!unit) return '';
  const mappedAlias = Object.entries(UNIT_ALIASES).find(([, aliases]) => aliases.includes(unit));
  if (mappedAlias) return mappedAlias[0];
  return unit;
};

const getSearchTokens = (value = '') => (
  normalizeSpace(value)
    .toLowerCase()
    .replace(/[+/]/g, ' ')
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part && !STOP_WORDS.has(part))
);

export const buildIngredientSearchQuery = (ingredient = {}) => (
  normalizeSpace(
    `${ingredient.ingredientName || ingredient.rawText || ''} ${ingredient.notes || ''}`
      .replace(/[+/]/g, ' ')
      .replace(/\s+/g, ' ')
  )
);

const getDensityForIngredient = (ingredientName = '') => {
  const normalizedName = normalizeSpace(ingredientName).toLowerCase();
  const match = DENSITY_RULES.find((rule) => (
    rule.keywords.some((keyword) => normalizedName.includes(keyword))
  ));
  return match?.gramsPerMl || 1;
};

const getSizeMultiplier = (unit = '', notes = '') => {
  const combined = `${normalizeEstimatorUnit(unit)} ${normalizeSpace(notes).toLowerCase()}`;
  if (combined.includes('large')) return SIZE_MULTIPLIERS.large;
  if (combined.includes('small')) return SIZE_MULTIPLIERS.small;
  return SIZE_MULTIPLIERS.medium;
};

const getEstimatedPieceWeight = ({ ingredientName = '', unit = '', notes = '' } = {}) => {
  const normalizedName = normalizeSpace(ingredientName).toLowerCase();
  const rule = PIECE_WEIGHT_RULES.find((candidate) => (
    candidate.keywords.some((keyword) => normalizedName.includes(keyword))
  ));
  if (!rule) return null;
  return rule.grams * getSizeMultiplier(unit, notes);
};

const getFoodNutrients = (food = {}) => (
  Array.isArray(food.foodNutrients)
    ? food.foodNutrients
    : Array.isArray(food.nutrients)
      ? food.nutrients
      : []
);

const getFoodNutrientPer100 = ({
  food = {},
  nutrientIds = new Set(),
  isMatch = () => false,
  labelNutrientKeys = [],
} = {}) => {
  const nutrients = getFoodNutrients(food);

  let bestMatch = null;
  for (const nutrient of nutrients) {
    const nutrientMeta = nutrient.nutrient || {};
    const nutrientId = Number(
      nutrientMeta.id
      ?? nutrient.nutrientId
      ?? nutrient.number
      ?? nutrient.id
    );
    const nutrientName = normalizeSpace(
      nutrientMeta.name
      ?? nutrient.nutrientName
      ?? nutrient.name
    ).toLowerCase();
    const unitName = normalizeSpace(
      nutrientMeta.unitName
      ?? nutrient.unitName
      ?? nutrient.unit
    ).toUpperCase();
    const amount = Number(nutrient.amount ?? nutrient.value);

    if (!Number.isFinite(amount) || amount < 0) continue;

    const looksLikeMatch = nutrientIds.has(nutrientId) || isMatch({
      nutrientId,
      nutrientName,
      unitName,
    });

    if (!looksLikeMatch) continue;

    const priority = nutrientIds.has(nutrientId)
      ? Array.from(nutrientIds).indexOf(nutrientId)
      : 9;

    if (!bestMatch || priority < bestMatch.priority) {
      bestMatch = { amount, priority };
    }
  }

  if (bestMatch) {
    return roundTo(bestMatch.amount, 1);
  }

  const labelValue = labelNutrientKeys
    .map((key) => Number(food.labelNutrients?.[key]?.value))
    .find((value) => Number.isFinite(value) && value >= 0);
  const servingSize = Number(food.servingSize);
  const servingSizeUnit = normalizeEstimatorUnit(food.servingSizeUnit);
  if (
    Number.isFinite(labelValue)
    && Number.isFinite(servingSize)
    && servingSize > 0
    && (servingSizeUnit === 'g' || servingSizeUnit === 'ml')
  ) {
    const density = servingSizeUnit === 'ml'
      ? getDensityForIngredient(food.description || '')
      : 1;
    const servingGrams = servingSizeUnit === 'ml'
      ? servingSize * density
      : servingSize;
    return roundTo((labelValue / servingGrams) * 100, 1);
  }

  return null;
};

export const getFoodEnergyPer100 = (food = {}) => {
  return getFoodNutrientPer100({
    food,
    nutrientIds: ENERGY_NUTRIENT_IDS,
    isMatch: ({ nutrientName, unitName }) => (
      unitName === 'KCAL' && nutrientName.includes('energy')
    ),
    labelNutrientKeys: ['calories'],
  });
};

export const getFoodFiberPer100 = (food = {}) => (
  getFoodNutrientPer100({
    food,
    nutrientIds: FIBER_NUTRIENT_IDS,
    isMatch: ({ nutrientName, unitName }) => (
      unitName === 'G' && (nutrientName.includes('fiber') || nutrientName.includes('fibre'))
    ),
    labelNutrientKeys: ['fiber', 'dietaryFiber'],
  })
);

export const getFoodProteinPer100 = (food = {}) => (
  getFoodNutrientPer100({
    food,
    nutrientIds: PROTEIN_NUTRIENT_IDS,
    isMatch: ({ nutrientName, unitName }) => (
      unitName === 'G' && nutrientName.includes('protein')
    ),
    labelNutrientKeys: ['protein'],
  })
);

export const getFoodCarbsPer100 = (food = {}) => (
  getFoodNutrientPer100({
    food,
    nutrientIds: CARB_NUTRIENT_IDS,
    isMatch: ({ nutrientName, unitName }) => (
      unitName === 'G' && (nutrientName.includes('carbohydrate') || nutrientName.includes('carbohydrates') || nutrientName.includes('carbs'))
    ),
    labelNutrientKeys: ['carbohydrates', 'carbs'],
  })
);

const getPortionCandidates = (food = {}) => {
  const portionCollections = [
    ...(Array.isArray(food.foodPortions) ? food.foodPortions : []),
    ...(Array.isArray(food.foodMeasures) ? food.foodMeasures : []),
  ];

  return portionCollections
    .map((portion) => {
      const gramWeight = Number(portion.gramWeight ?? portion.gram_weight);
      const amount = Number(portion.amount ?? portion.portionAmount ?? 1) || 1;
      const label = normalizeSpace([
        portion.portionDescription,
        portion.modifier,
        portion.measureUnit?.name,
        portion.measureUnitName,
      ].filter(Boolean).join(' ')).toLowerCase();

      if (!Number.isFinite(gramWeight) || gramWeight <= 0) return null;

      return {
        gramWeight,
        amount,
        label,
      };
    })
    .filter(Boolean);
};

const getPortionMatchTerms = (unit = '') => {
  const normalizedUnit = normalizeEstimatorUnit(unit);
  return [normalizedUnit, ...(UNIT_ALIASES[normalizedUnit] || [])].filter(Boolean);
};

const findMatchingFoodPortion = ({ food = {}, ingredient = {} } = {}) => {
  const quantity = Number(ingredient.quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const unit = normalizeEstimatorUnit(ingredient.quantityUnit);
  const notes = normalizeSpace(ingredient.notes).toLowerCase();
  const candidates = getPortionCandidates(food);
  if (candidates.length === 0) return null;

  const sizeHint = ['small', 'medium', 'large'].find((value) => (
    unit === value || notes.includes(value)
  ));

  const terms = getPortionMatchTerms(unit);
  const rankedCandidates = candidates
    .map((candidate) => {
      let score = 0;
      if (sizeHint && candidate.label.includes(sizeHint)) score += 12;
      if (!sizeHint && (candidate.label.includes('medium') || candidate.label.includes('small') || candidate.label.includes('large'))) {
        score += 1;
      }
      if (terms.some((term) => candidate.label.includes(term))) score += 16;
      if (unit === 'pcs' && candidate.label.includes('whole')) score += 12;
      if (unit === 'slice' && candidate.label.includes('slice')) score += 12;
      return {
        ...candidate,
        score,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!rankedCandidates.length) return null;

  const best = rankedCandidates[0];
  return {
    grams: (quantity / best.amount) * best.gramWeight,
    method: 'usda-portion',
    note: best.label || 'USDA portion',
  };
};

export const estimateIngredientWeightGrams = ({ ingredient = {}, food = {} } = {}) => {
  const quantity = Number(ingredient.quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      grams: null,
      method: 'unresolved',
      reason: 'Add a quantity to estimate calories for this ingredient.',
    };
  }

  const unit = normalizeEstimatorUnit(ingredient.quantityUnit);
  const ingredientName = ingredient.ingredientName || ingredient.rawText || '';

  const massFactor = MASS_UNIT_TO_GRAMS[unit];
  if (massFactor) {
    return {
      grams: roundTo(quantity * massFactor, 1),
      method: 'direct-mass',
      reason: '',
    };
  }

  const volumeMl = VOLUME_UNIT_TO_ML[unit];
  if (volumeMl) {
    return {
      grams: roundTo(quantity * volumeMl * getDensityForIngredient(ingredientName), 1),
      method: 'volume-conversion',
      reason: '',
    };
  }

  const portionMatch = findMatchingFoodPortion({ food, ingredient });
  if (portionMatch?.grams) {
    return {
      grams: portionMatch.grams,
      method: portionMatch.method,
      reason: '',
    };
  }

  if (!unit || unit === 'pcs' || unit === 'slice' || unit === 'clove' || unit === 'small' || unit === 'medium' || unit === 'large') {
    const estimatedPieceWeight = getEstimatedPieceWeight({
      ingredientName,
      unit,
      notes: ingredient.notes,
    });
    if (estimatedPieceWeight) {
      return {
        grams: roundTo(quantity * estimatedPieceWeight, 1),
        method: 'piece-estimate',
        reason: '',
      };
    }
  }

  return {
    grams: null,
    method: 'unresolved',
    reason: `Could not convert "${ingredient.quantityUnit || 'this unit'}" into grams yet.`,
  };
};

const getDataTypeScore = (food = {}) => {
  const dataType = normalizeSpace(food.dataType).toLowerCase();
  if (dataType.includes('foundation')) return 40;
  if (dataType.includes('sr legacy')) return 34;
  if (dataType.includes('survey')) return 28;
  if (dataType.includes('experimental')) return 22;
  if (dataType.includes('branded')) return 8;
  return 0;
};

export const pickBestFoodMatch = (foods = [], ingredient = {}) => {
  if (!Array.isArray(foods) || foods.length === 0) return null;

  const ingredientName = normalizeSpace(ingredient.ingredientName || ingredient.rawText || '').toLowerCase();
  const ingredientTokens = getSearchTokens(ingredientName);

  const ranked = foods
    .map((food) => {
      const description = normalizeSpace(food.description).toLowerCase();
      const descriptionTokens = new Set(getSearchTokens(description));

      let score = getDataTypeScore(food);
      if (description === ingredientName) score += 70;
      if (description.startsWith(ingredientName)) score += 36;
      if (description.includes(ingredientName)) score += 22;

      ingredientTokens.forEach((token) => {
        if (descriptionTokens.has(token) || description.includes(token)) {
          score += 8;
        }
      });

      if (description.includes('raw')) score += 5;
      if (description.includes('plain')) score += 4;
      if (description.includes('without')) score += 1;
      if (description.includes('prepared') || description.includes('restaurant')) score -= 6;

      return {
        ...food,
        _matchScore: score,
      };
    })
    .sort((left, right) => (
      right._matchScore - left._matchScore
      || String(left.description || '').localeCompare(String(right.description || ''))
    ));

  return ranked[0] || null;
};

export const estimateIngredientCalories = ({ ingredient = {}, food = {} } = {}) => {
  const energyPer100 = getFoodEnergyPer100(food);
  if (energyPer100 === null) {
    return {
      ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
      rawText: ingredient.rawText || ingredient.ingredientName || '',
      quantityValue: ingredient.quantityValue ?? null,
      quantityUnit: ingredient.quantityUnit || '',
      estimatedKcal: null,
      quantityGrams: null,
      kcalPer100: null,
      resolutionMethod: 'unresolved',
      resolved: false,
      reason: 'No usable calorie data was returned for the matched food.',
      matchedFood: {
        fdcId: food.fdcId || null,
        description: food.description || '',
        dataType: food.dataType || '',
      },
    };
  }

  const weightEstimate = estimateIngredientWeightGrams({ ingredient, food });
  if (weightEstimate.grams === null) {
    return {
      ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
      rawText: ingredient.rawText || ingredient.ingredientName || '',
      quantityValue: ingredient.quantityValue ?? null,
      quantityUnit: ingredient.quantityUnit || '',
      estimatedKcal: null,
      quantityGrams: null,
      kcalPer100: energyPer100,
      resolutionMethod: 'unresolved',
      resolved: false,
      reason: weightEstimate.reason,
      matchedFood: {
        fdcId: food.fdcId || null,
        description: food.description || '',
        dataType: food.dataType || '',
      },
    };
  }

  const estimatedKcal = (weightEstimate.grams / 100) * energyPer100;
  return {
    ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
    rawText: ingredient.rawText || ingredient.ingredientName || '',
    quantityValue: ingredient.quantityValue ?? null,
    quantityUnit: ingredient.quantityUnit || '',
    estimatedKcal: roundTo(estimatedKcal, 1),
    quantityGrams: roundTo(weightEstimate.grams, 1),
    kcalPer100: energyPer100,
    resolutionMethod: weightEstimate.method,
    resolved: true,
    reason: '',
    matchedFood: {
      fdcId: food.fdcId || null,
      description: food.description || '',
      dataType: food.dataType || '',
    },
  };
};

export const estimateIngredientFiber = ({ ingredient = {}, food = {} } = {}) => {
  const fiberPer100 = getFoodFiberPer100(food);
  if (fiberPer100 === null) {
    return {
      ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
      rawText: ingredient.rawText || ingredient.ingredientName || '',
      quantityValue: ingredient.quantityValue ?? null,
      quantityUnit: ingredient.quantityUnit || '',
      estimatedFiberG: null,
      quantityGrams: null,
      fiberPer100: null,
      resolutionMethod: 'unresolved',
      resolved: false,
      reason: 'No usable fiber data was returned for the matched food.',
      matchedFood: {
        fdcId: food.fdcId || null,
        description: food.description || '',
        dataType: food.dataType || '',
      },
    };
  }

  const weightEstimate = estimateIngredientWeightGrams({ ingredient, food });
  if (weightEstimate.grams === null) {
    return {
      ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
      rawText: ingredient.rawText || ingredient.ingredientName || '',
      quantityValue: ingredient.quantityValue ?? null,
      quantityUnit: ingredient.quantityUnit || '',
      estimatedFiberG: null,
      quantityGrams: null,
      fiberPer100,
      resolutionMethod: 'unresolved',
      resolved: false,
      reason: weightEstimate.reason,
      matchedFood: {
        fdcId: food.fdcId || null,
        description: food.description || '',
        dataType: food.dataType || '',
      },
    };
  }

  const estimatedFiberG = (weightEstimate.grams / 100) * fiberPer100;
  return {
    ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
    rawText: ingredient.rawText || ingredient.ingredientName || '',
    quantityValue: ingredient.quantityValue ?? null,
    quantityUnit: ingredient.quantityUnit || '',
    estimatedFiberG: roundTo(estimatedFiberG, 1),
    quantityGrams: roundTo(weightEstimate.grams, 1),
    fiberPer100,
    resolutionMethod: weightEstimate.method,
    resolved: true,
    reason: '',
    matchedFood: {
      fdcId: food.fdcId || null,
      description: food.description || '',
      dataType: food.dataType || '',
    },
  };
};

const estimateIngredientNutrient = ({
  ingredient = {},
  food = {},
  nutrientPer100 = null,
  nutrientKey = 'estimatedNutrient',
  nutrientPer100Key = 'nutrientPer100',
  missingReason = 'No usable nutrient data was returned for the matched food.',
} = {}) => {
  if (nutrientPer100 === null) {
    return {
      ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
      rawText: ingredient.rawText || ingredient.ingredientName || '',
      quantityValue: ingredient.quantityValue ?? null,
      quantityUnit: ingredient.quantityUnit || '',
      [nutrientKey]: null,
      quantityGrams: null,
      [nutrientPer100Key]: null,
      resolutionMethod: 'unresolved',
      resolved: false,
      reason: missingReason,
      matchedFood: {
        fdcId: food.fdcId || null,
        description: food.description || '',
        dataType: food.dataType || '',
      },
    };
  }

  const weightEstimate = estimateIngredientWeightGrams({ ingredient, food });
  if (weightEstimate.grams === null) {
    return {
      ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
      rawText: ingredient.rawText || ingredient.ingredientName || '',
      quantityValue: ingredient.quantityValue ?? null,
      quantityUnit: ingredient.quantityUnit || '',
      [nutrientKey]: null,
      quantityGrams: null,
      [nutrientPer100Key]: nutrientPer100,
      resolutionMethod: 'unresolved',
      resolved: false,
      reason: weightEstimate.reason,
      matchedFood: {
        fdcId: food.fdcId || null,
        description: food.description || '',
        dataType: food.dataType || '',
      },
    };
  }

  const estimatedNutrient = (weightEstimate.grams / 100) * nutrientPer100;
  return {
    ingredientName: ingredient.ingredientName || ingredient.rawText || 'Ingredient',
    rawText: ingredient.rawText || ingredient.ingredientName || '',
    quantityValue: ingredient.quantityValue ?? null,
    quantityUnit: ingredient.quantityUnit || '',
    [nutrientKey]: roundTo(estimatedNutrient, 1),
    quantityGrams: roundTo(weightEstimate.grams, 1),
    [nutrientPer100Key]: nutrientPer100,
    resolutionMethod: weightEstimate.method,
    resolved: true,
    reason: '',
    matchedFood: {
      fdcId: food.fdcId || null,
      description: food.description || '',
      dataType: food.dataType || '',
    },
  };
};

export const estimateIngredientProtein = ({ ingredient = {}, food = {} } = {}) => (
  estimateIngredientNutrient({
    ingredient,
    food,
    nutrientPer100: getFoodProteinPer100(food),
    nutrientKey: 'estimatedProteinG',
    nutrientPer100Key: 'proteinPer100',
    missingReason: 'No usable protein data was returned for the matched food.',
  })
);

export const estimateIngredientCarbs = ({ ingredient = {}, food = {} } = {}) => (
  estimateIngredientNutrient({
    ingredient,
    food,
    nutrientPer100: getFoodCarbsPer100(food),
    nutrientKey: 'estimatedCarbsG',
    nutrientPer100Key: 'carbsPer100',
    missingReason: 'No usable carbohydrate data was returned for the matched food.',
  })
);

export const summarizeRecipeCalorieEstimate = ({
  ingredientResults = [],
  yieldMode = 'flexible',
  batchYieldPortions = null,
} = {}) => {
  const totalKcalRaw = ingredientResults.reduce((sum, item) => (
    sum + (Number.isFinite(item.estimatedKcal) ? item.estimatedKcal : 0)
  ), 0);
  const resolvedIngredients = ingredientResults.filter((item) => item.resolved);
  const unresolvedIngredients = ingredientResults.filter((item) => !item.resolved);
  const normalizedYieldMode = String(yieldMode || 'flexible') === 'batch' ? 'batch' : 'flexible';
  const normalizedBatchYield = Number(batchYieldPortions);
  const canCalculatePerServing = (
    normalizedYieldMode !== 'batch'
    || (Number.isFinite(normalizedBatchYield) && normalizedBatchYield > 0)
  );
  const perServingKcalRaw = normalizedYieldMode === 'batch'
    ? (canCalculatePerServing ? totalKcalRaw / normalizedBatchYield : null)
    : totalKcalRaw;

  const warnings = [];
  if (unresolvedIngredients.length > 0) {
    warnings.push(`${unresolvedIngredients.length} ingredient${unresolvedIngredients.length === 1 ? ' needs' : ' need'} manual review.`);
  }
  if (normalizedYieldMode === 'batch' && !canCalculatePerServing) {
    warnings.push('Add the batch yield so the app can estimate calories per serving.');
  }

  const coverage = ingredientResults.length > 0
    ? resolvedIngredients.length / ingredientResults.length
    : 0;

  return {
    totalIngredients: ingredientResults.length,
    resolvedIngredientCount: resolvedIngredients.length,
    unresolvedIngredientCount: unresolvedIngredients.length,
    ingredientResults,
    unresolvedIngredients,
    totalKcal: roundTo(totalKcalRaw, 0) || 0,
    perServingKcal: perServingKcalRaw === null ? null : roundTo(perServingKcalRaw, 0),
    yieldMode: normalizedYieldMode,
    batchYieldPortions: Number.isFinite(normalizedBatchYield) && normalizedBatchYield > 0
      ? normalizedBatchYield
      : null,
    coverage,
    warnings,
  };
};
