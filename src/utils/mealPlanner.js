const DAY_TO_INDEX = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

const SLOT_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const SLOT_SORT_ORDER = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

const AUDIENCE_LABELS = {
  all: 'Household',
  adults: 'You + Partner',
  kids: 'Kids',
};

const RECIPE_YIELD_MODE_LABELS = {
  flexible: 'Flexible portions',
  batch: 'Batch recipe',
};

const SIZE_WORDS = new Set(['small', 'medium', 'large']);

const normalizeSpace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const toNullableFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

export const normalizeMealSlot = (value = '') => {
  const key = normalizeSpace(value).toLowerCase();
  if (key.startsWith('break')) return 'breakfast';
  if (key.startsWith('lunch')) return 'lunch';
  if (key.startsWith('dinner')) return 'dinner';
  if (key.startsWith('snack')) return 'snack';
  return '';
};

export const getMealSlotLabel = (slot) => SLOT_LABELS[slot] || 'Meal';

export const normalizeMealAudience = (value = '') => {
  const key = normalizeSpace(value).toLowerCase();
  if (key === 'adults' || key === 'adult') return 'adults';
  if (key === 'kids' || key === 'kid' || key === 'children' || key === 'child') return 'kids';
  return 'all';
};

export const getMealAudienceLabel = (audience) => AUDIENCE_LABELS[normalizeMealAudience(audience)] || 'All';

export const normalizeRecipeYieldMode = (value = '') => {
  const key = normalizeSpace(value).toLowerCase();
  return key === 'batch' ? 'batch' : 'flexible';
};

export const getRecipeYieldModeLabel = (yieldMode) => (
  RECIPE_YIELD_MODE_LABELS[normalizeRecipeYieldMode(yieldMode)] || 'Flexible portions'
);

export const normalizeSuggestedDay = (value = '') => {
  const key = normalizeSpace(value).slice(0, 3).toLowerCase();
  return Object.prototype.hasOwnProperty.call(DAY_TO_INDEX, key) ? key : '';
};

const toNumber = (rawValue = '') => {
  const value = String(rawValue || '').trim().replace(',', '.');
  if (!value) return null;
  if (value.includes('-')) return null;
  if (value.includes('/')) {
    const [numerator, denominator] = value.split('/');
    const next = Number(numerator) / Number(denominator);
    return Number.isFinite(next) ? next : null;
  }
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const parseStartQuantityIngredient = (rawText) => {
  const match = rawText.match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?)\s+([a-zA-Z]+)\s+(.+)$/);
  if (!match) return null;

  const quantityValue = toNumber(match[1]);
  if (quantityValue === null) return null;

  return {
    rawText,
    ingredientName: normalizeSpace(match[3]),
    quantityValue,
    quantityUnit: normalizeSpace(match[2]),
    notes: '',
    parseConfidence: 0.72,
  };
};

const parseEndQuantityIngredient = (rawText) => {
  const combinedMatch = rawText.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)([a-zA-Z]+)$/);
  if (combinedMatch) {
    const quantityValue = toNumber(combinedMatch[2]);
    if (quantityValue !== null) {
      return {
        rawText,
        ingredientName: normalizeSpace(combinedMatch[1]),
        quantityValue,
        quantityUnit: normalizeSpace(combinedMatch[3]),
        notes: '',
        parseConfidence: 0.94,
      };
    }
  }

  const separatedMatch = rawText.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?(?:\/\d+)?)\s+([a-zA-Z]+)$/);
  if (separatedMatch) {
    const quantityValue = toNumber(separatedMatch[2]);
    if (quantityValue !== null) {
      return {
        rawText,
        ingredientName: normalizeSpace(separatedMatch[1]),
        quantityValue,
        quantityUnit: normalizeSpace(separatedMatch[3]),
        notes: '',
        parseConfidence: 0.9,
      };
    }
  }

  const countWithSizeMatch = rawText.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?(?:\/\d+)?)\s+([a-zA-Z]+)$/);
  if (countWithSizeMatch && SIZE_WORDS.has(countWithSizeMatch[3].toLowerCase())) {
    const quantityValue = toNumber(countWithSizeMatch[2]);
    if (quantityValue !== null) {
      return {
        rawText,
        ingredientName: normalizeSpace(countWithSizeMatch[1]),
        quantityValue,
        quantityUnit: normalizeSpace(countWithSizeMatch[3]),
        notes: '',
        parseConfidence: 0.62,
      };
    }
  }

  const countOnlyMatch = rawText.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?(?:\/\d+)?)$/);
  if (countOnlyMatch) {
    const quantityValue = toNumber(countOnlyMatch[2]);
    if (quantityValue !== null) {
      return {
        rawText,
        ingredientName: normalizeSpace(countOnlyMatch[1]),
        quantityValue,
        quantityUnit: 'pcs',
        notes: '',
        parseConfidence: 0.68,
      };
    }
  }

  return null;
};

export const parseIngredientText = (rawText = '') => {
  const normalized = normalizeSpace(rawText);
  if (!normalized || normalized.toLowerCase() === 'none') {
    return {
      rawText: normalized || 'none',
      ingredientName: normalized || 'none',
      quantityValue: null,
      quantityUnit: '',
      notes: '',
      parseConfidence: 0,
    };
  }

  if (/^\d+\s*-\s*\d+/.test(normalized) || /\d+\s*-\s*\d+[a-zA-Z]+$/.test(normalized)) {
    return {
      rawText: normalized,
      ingredientName: normalized,
      quantityValue: null,
      quantityUnit: '',
      notes: '',
      parseConfidence: 0.12,
    };
  }

  return parseStartQuantityIngredient(normalized)
    || parseEndQuantityIngredient(normalized)
    || {
      rawText: normalized,
      ingredientName: normalized,
      quantityValue: null,
      quantityUnit: '',
      notes: '',
      parseConfidence: 0.08,
    };
};

export const splitIngredientList = (value = '') => (
  String(value || '')
    .split(',')
    .map((part) => normalizeSpace(part))
    .filter(Boolean)
    .map((rawText) => parseIngredientText(rawText))
);

export const parseRecipeImportText = (rawText = '', mealSlot = '') => {
  const normalizedSlot = normalizeMealSlot(mealSlot);
  const rows = [];
  const errors = [];

  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dataLines = lines.filter((line, index) => (
    index !== 0 || !line.toLowerCase().startsWith('id|source_pdf|day|name|ingredients|how_to_make|estimated_kcal|image_ref')
  ));

  dataLines.forEach((line, index) => {
    const parts = line.split('|');
    if (parts.length < 8) {
      errors.push(`Row ${index + 1} could not be parsed.`);
      return;
    }

    const [externalId, sourcePdf, day, name, ingredients, howToMake, estimatedKcal, imageRef] = parts;
    const ingredientLines = splitIngredientList(ingredients);
    rows.push({
      externalId: normalizeSpace(externalId),
      sourcePdf: normalizeSpace(sourcePdf),
      suggestedDay: normalizeSuggestedDay(day),
      mealSlot: normalizedSlot,
      name: normalizeSpace(name),
      ingredientsRaw: normalizeSpace(ingredients),
      howToMake: normalizeSpace(howToMake),
      estimatedKcal: toNullableFiniteNumber(estimatedKcal),
      imageRef: normalizeSpace(imageRef),
      ingredientLines,
    });
  });

  return {
    rows,
    errors,
  };
};

export const serializeIngredientLines = (ingredientLines = []) => (
  ingredientLines
    .map((ingredient) => normalizeSpace(ingredient?.rawText || ingredient?.ingredientName || ''))
    .filter(Boolean)
    .join(', ')
);

export const getWeekStartMonday = (value = new Date()) => {
  const date = new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + diff);
  return date;
};

export const formatDateKey = (value) => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getWeekDayEntries = (weekStartDate) => {
  const start = getWeekStartMonday(weekStartDate);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      index,
      key: formatDateKey(date),
      date,
      shortLabel: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      dayLabel: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
    };
  });
};

export const getAdultServingTotal = ({
  adultCount = null,
  adultPortionTotal = null,
  partnerServingMultiplier = null,
} = {}) => {
  const explicitAdultPortionTotal = toNullableFiniteNumber(adultPortionTotal);
  if (explicitAdultPortionTotal !== null) {
    return Math.max(0, explicitAdultPortionTotal);
  }

  const explicitAdultCount = toNullableFiniteNumber(adultCount);
  if (explicitAdultCount !== null) {
    return Math.max(0, explicitAdultCount);
  }

  const resolvedPartnerMultiplier = toNullableFiniteNumber(partnerServingMultiplier);
  return Math.max(0, 1 + (resolvedPartnerMultiplier ?? 0.75));
};

export const getDefaultServingMultiplier = ({
  adultCount = null,
  adultPortionTotal = null,
  partnerServingMultiplier = null,
  kidCount = 0,
} = {}) => (
  Math.max(
    0.5,
    getAdultServingTotal({ adultCount, adultPortionTotal, partnerServingMultiplier })
      + (Number(kidCount || 0) * 0.5)
  )
);

export const getAudienceServingMultiplier = ({
  audience = 'all',
  adultCount = null,
  adultPortionTotal = null,
  partnerServingMultiplier = null,
  kidCount = 0,
} = {}) => {
  const normalizedAudience = normalizeMealAudience(audience);
  if (normalizedAudience === 'adults') {
    return getAdultServingTotal({ adultCount, adultPortionTotal, partnerServingMultiplier });
  }
  if (normalizedAudience === 'kids') {
    return Math.max(0, Number(kidCount || 0) * 0.5);
  }
  return getDefaultServingMultiplier({ adultCount, adultPortionTotal, partnerServingMultiplier, kidCount });
};

export const buildNextDayCopyPrompt = ({
  weekDays = [],
  dateKey = '',
  mealSlot = '',
  recipeId = '',
  sourceEntryId = '',
  audience = 'all',
} = {}) => {
  if (normalizeMealSlot(mealSlot) === 'snack') {
    return null;
  }

  const currentIndex = weekDays.findIndex((day) => day.key === dateKey);
  if (currentIndex < 0 || currentIndex >= weekDays.length - 1) {
    return null;
  }

  return {
    dateKey,
    mealSlot,
    recipeId,
    sourceEntryId,
    audience: normalizeMealAudience(audience),
  };
};

const normalizeIngredientKey = (value = '') => normalizeSpace(value).toLowerCase();
const normalizeUnitKey = (value = '') => normalizeSpace(value).toLowerCase();

const roundQuantity = (value) => {
  if (!Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
};

const toPositiveFiniteNumber = (value) => {
  const next = toNullableFiniteNumber(value);
  return next !== null && next > 0 ? next : null;
};

const sortMealEntriesForPreview = (entries = []) => (
  [...entries].sort((left, right) => (
    `${left.date}`.localeCompare(`${right.date}`)
    || ((SLOT_SORT_ORDER[left.mealSlot] ?? 99) - (SLOT_SORT_ORDER[right.mealSlot] ?? 99))
    || ((Number(left.entryPosition) || 0) - (Number(right.entryPosition) || 0))
    || `${left.id || ''}`.localeCompare(`${right.id || ''}`)
  ))
);

const getEntryServingMultiplier = (
  entry = {},
  {
    adultCount = null,
    adultPortionTotal = null,
    partnerServingMultiplier = null,
    kidCount = 0,
  } = {}
) => {
  const explicitMultiplier = toNullableFiniteNumber(entry.servingMultiplier);
  if (explicitMultiplier !== null) {
    return explicitMultiplier;
  }
  return getAudienceServingMultiplier({
    audience: entry.audience,
    adultCount,
    adultPortionTotal,
    partnerServingMultiplier,
    kidCount,
  });
};

const getRecipeBatchYieldPortions = (recipe = {}) => (
  toPositiveFiniteNumber(recipe.batchYieldPortions)
);

const isBatchRecipe = (recipe = {}) => (
  normalizeRecipeYieldMode(recipe.yieldMode) === 'batch'
  && getRecipeBatchYieldPortions(recipe) !== null
);

const addIngredientToDraft = ({
  draftMap,
  ingredient,
  entry,
  recipe,
  scalingFactor,
  sourceMeta = {},
}) => {
  const ingredientName = normalizeSpace(ingredient.ingredientName || ingredient.rawText || '');
  const quantityUnit = normalizeSpace(ingredient.quantityUnit || '');
  const hasParsedQuantity = toNullableFiniteNumber(ingredient.quantityValue) !== null;
  const key = hasParsedQuantity && ingredientName
    ? `${normalizeIngredientKey(ingredientName)}::${normalizeUnitKey(quantityUnit)}`
    : `raw::${normalizeIngredientKey(ingredient.rawText || ingredientName)}`;

  const current = draftMap.get(key) || {
    key,
    title: ingredientName || ingredient.rawText || 'Unknown ingredient',
    rawText: ingredient.rawText || ingredientName || '',
    quantityValue: null,
    quantityUnit,
    occurrenceCount: 0,
    sourceMeals: [],
    parseConfidence: ingredient.parseConfidence || 0,
  };

  current.occurrenceCount += 1;
  current.sourceMeals.push({
    entryId: entry.id,
    recipeId: recipe.id,
    recipeName: recipe.name,
    date: entry.date,
    mealSlot: entry.mealSlot,
    ...sourceMeta,
  });

  const parsedQuantity = toNullableFiniteNumber(ingredient.quantityValue);
  if (parsedQuantity !== null) {
    const nextQuantity = Number(current.quantityValue || 0) + (parsedQuantity * scalingFactor);
    current.quantityValue = roundQuantity(nextQuantity);
    current.quantityUnit = quantityUnit;
  }

  draftMap.set(key, current);
};

export const buildMealLibraryRecords = (rows = [], origin = 'imported') => (
  rows.map((row) => ({
    external_id: row.externalId || null,
    source_pdf: row.sourcePdf || '',
    suggested_day: row.suggestedDay || null,
    meal_slot: normalizeMealSlot(row.mealSlot),
    name: row.name || '',
    ingredients_raw: row.ingredientsRaw || serializeIngredientLines(row.ingredientLines),
    how_to_make: row.howToMake || '',
    estimated_kcal: toNullableFiniteNumber(row.estimatedKcal),
    image_ref: row.imageRef || '',
    recipe_origin: origin,
    yield_mode: normalizeRecipeYieldMode(row.yieldMode),
    batch_yield_portions: toPositiveFiniteNumber(row.batchYieldPortions),
  }))
);

export const buildMealIngredientRecords = (ingredientLines = []) => (
  ingredientLines.map((ingredient) => ({
    raw_text: ingredient.rawText || ingredient.ingredientName || '',
    ingredient_name: ingredient.ingredientName || ingredient.rawText || '',
    quantity_value: toNullableFiniteNumber(ingredient.quantityValue),
    quantity_unit: ingredient.quantityUnit || '',
    notes: ingredient.notes || '',
    estimated_kcal: toNullableFiniteNumber(ingredient.estimatedKcal),
    manual_kcal: toNullableFiniteNumber(ingredient.manualKcal),
    kcal_source: normalizeSpace(ingredient.kcalSource || '') || null,
    kcal_per_100: toNullableFiniteNumber(ingredient.kcalPer100),
    linked_fdc_id: toNullableFiniteNumber(ingredient.linkedFdcId),
    matched_food_label: normalizeSpace(ingredient.matchedFoodLabel || '') || null,
    parse_confidence: toNullableFiniteNumber(ingredient.parseConfidence) ?? 0,
  }))
);

export const buildMealPlanPreview = ({
  recipes = [],
  entries = [],
  adultCount = null,
  adultPortionTotal = null,
  partnerServingMultiplier = null,
  kidCount = 0,
}) => {
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const draftMap = new Map();
  const carryoverLedger = new Map();
  const entryUsageById = {};

  for (const entry of sortMealEntriesForPreview(entries)) {
    const recipe = recipeMap.get(entry.mealId);
    if (!recipe) continue;

    const requiredPortions = getEntryServingMultiplier(entry, {
      adultCount,
      adultPortionTotal,
      partnerServingMultiplier,
      kidCount,
    });
    if (requiredPortions <= 0) continue;

    const roundedRequiredPortions = roundQuantity(requiredPortions) ?? requiredPortions;
    const usage = {
      entryId: entry.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      requiredPortions: roundedRequiredPortions,
      usedCarryoverPortions: 0,
      carryoverSourceDate: '',
      cookedBatchCount: 0,
      batchYieldPortions: null,
      createdCarryoverPortions: 0,
      leftoverAfterPortions: 0,
      effectiveIngredientMultiplier: roundedRequiredPortions,
      yieldMode: normalizeRecipeYieldMode(recipe.yieldMode),
    };

    if (isBatchRecipe(recipe)) {
      const batchYieldPortions = getRecipeBatchYieldPortions(recipe);
      const ledger = carryoverLedger.get(recipe.id) || {
        remainingPortions: 0,
        sourceDate: '',
      };
      const availableCarryover = ledger.remainingPortions || 0;
      const usedCarryoverPortions = Math.min(availableCarryover, requiredPortions);
      const remainingNeed = requiredPortions - usedCarryoverPortions;
      const cookedBatchCount = remainingNeed > 0
        ? Math.ceil(remainingNeed / batchYieldPortions)
        : 0;
      const producedPortions = cookedBatchCount * batchYieldPortions;
      const leftoverAfterPortions = Math.max(
        0,
        (availableCarryover - usedCarryoverPortions) + (producedPortions - remainingNeed)
      );

      usage.usedCarryoverPortions = roundQuantity(usedCarryoverPortions) ?? 0;
      usage.carryoverSourceDate = usedCarryoverPortions > 0 ? ledger.sourceDate : '';
      usage.cookedBatchCount = cookedBatchCount;
      usage.batchYieldPortions = batchYieldPortions;
      usage.createdCarryoverPortions = roundQuantity(leftoverAfterPortions) ?? 0;
      usage.leftoverAfterPortions = roundQuantity(leftoverAfterPortions) ?? 0;
      usage.effectiveIngredientMultiplier = cookedBatchCount;

      carryoverLedger.set(recipe.id, {
        remainingPortions: leftoverAfterPortions,
        sourceDate: cookedBatchCount > 0 ? entry.date : ledger.sourceDate,
      });

      if (cookedBatchCount > 0) {
        for (const ingredient of recipe.ingredients || []) {
          addIngredientToDraft({
            draftMap,
            ingredient,
            entry,
            recipe,
            scalingFactor: cookedBatchCount,
            sourceMeta: {
              scalingMode: 'batch',
              batchCount: cookedBatchCount,
              batchYieldPortions,
              requiredPortions: roundedRequiredPortions,
              usedCarryoverPortions: usage.usedCarryoverPortions,
            },
          });
        }
      }
    } else {
      for (const ingredient of recipe.ingredients || []) {
        addIngredientToDraft({
          draftMap,
          ingredient,
          entry,
          recipe,
          scalingFactor: requiredPortions,
          sourceMeta: {
            scalingMode: 'portion',
            requiredPortions: roundedRequiredPortions,
          },
        });
      }
    }

    entryUsageById[entry.id] = usage;
  }

  return {
    groceryDraft: Array.from(draftMap.values()).sort((left, right) => left.title.localeCompare(right.title)),
    entryUsageById,
  };
};

export const buildGroceryDraft = ({
  recipes = [],
  entries = [],
  adultCount = null,
  adultPortionTotal = null,
  partnerServingMultiplier = null,
  kidCount = 0,
}) => (
  buildMealPlanPreview({
    recipes,
    entries,
    adultCount,
    adultPortionTotal,
    partnerServingMultiplier,
    kidCount,
  }).groceryDraft
);

export const formatIngredientQuantity = (value) => {
  if (!Number.isFinite(Number(value))) return '';
  const rounded = roundQuantity(value);
  if (rounded === null) return '';
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
};

export const summarizeRecipeIngredients = (recipe, limit = 3) => {
  const names = (recipe?.ingredients || [])
    .map((ingredient) => normalizeSpace(ingredient.ingredientName || ingredient.rawText || ''))
    .filter(Boolean)
    .slice(0, limit);
  return names.join(', ');
};

export const buildImportedMealRows = (importsBySlot = {}) => (
  Object.entries(importsBySlot).flatMap(([slot, rawText]) => parseRecipeImportText(rawText, slot).rows)
);
