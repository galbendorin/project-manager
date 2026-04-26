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
const SECTION_LABELS = {
  ingredients: ['ingredients', 'ingredient', 'you need', 'what you need'],
  method: ['method', 'instructions', 'directions', 'preparation', 'how to make', 'steps'],
  notes: ['notes', 'note'],
};

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

export const normalizeMealEntryKind = (value = '') => {
  const key = normalizeSpace(value).toLowerCase();
  return key === 'carryover' ? 'carryover' : 'planned';
};

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
  const match = rawText.match(/^(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*([a-zA-Z]+)\s+(.+)$/);
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

const stripListMarker = (value = '') => normalizeSpace(
  String(value || '')
    .replace(/^[-*•]+\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^[-–—]\s*/, '')
);

const normalizePastedRecipeText = (value = '') => (
  String(value || '')
    .replace(/[¼]/g, ' 1/4 ')
    .replace(/[½]/g, ' 1/2 ')
    .replace(/[¾]/g, ' 3/4 ')
    .replace(/\bhalf\s+(?=\w+)/gi, '1/2 ')
);

const getSectionForLine = (line = '') => {
  const normalized = normalizeSpace(line).replace(/:$/, '').toLowerCase();
  if (!normalized) return '';
  if (SECTION_LABELS.ingredients.includes(normalized)) return 'ingredients';
  if (SECTION_LABELS.method.includes(normalized)) return 'method';
  if (SECTION_LABELS.notes.includes(normalized)) return 'notes';
  return '';
};

const getLabelValue = (line = '', labels = []) => {
  const normalizedLine = normalizeSpace(line);
  for (const label of labels) {
    const pattern = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'i');
    const match = normalizedLine.match(pattern);
    if (match) return normalizeSpace(match[1]);
  }
  return '';
};

const extractServingCount = (line = '') => {
  const normalizedLine = normalizeSpace(line);
  const match = normalizedLine.match(/\b(?:serves|servings|yield|yields|makes|portions)\b[^0-9]*(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const next = Number(String(match[1]).replace(',', '.'));
  return Number.isFinite(next) && next > 0 ? next : null;
};

const extractKcalEstimate = (line = '') => {
  const normalizedLine = normalizeSpace(line);
  const match = normalizedLine.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calories|cal)\b/i);
  if (!match) return null;
  const next = Number(String(match[1]).replace(',', '.'));
  return Number.isFinite(next) && next >= 0 ? next : null;
};

const looksLikeIngredientLine = (line = '') => {
  const normalizedLine = stripListMarker(line);
  if (!normalizedLine) return false;
  if (/^(serves|servings|yield|method|instructions|directions|preparation|how to make)\b/i.test(normalizedLine)) {
    return false;
  }
  if (/\d/.test(normalizedLine) && /\b(g|kg|ml|l|tsp|tbsp|cup|cups|pcs|pieces|piece|egg|eggs)\b/i.test(normalizedLine)) {
    return true;
  }
  return /^\d+(?:[.,]\d+)?(?:\/\d+)?\s+\w+/.test(normalizedLine);
};

const splitIngredientCandidates = (lines = []) => (
  lines.flatMap((line) => {
    const strippedLine = stripListMarker(line);
    if (!strippedLine) return [];
    if (strippedLine.includes(',') && !/^\d/.test(strippedLine)) {
      return strippedLine.split(',').map((part) => stripListMarker(part)).filter(Boolean);
    }
    return [strippedLine];
  })
);

export const parsePastedRecipeText = (rawText = '', fallbackMealSlot = 'breakfast') => {
  const lines = normalizePastedRecipeText(rawText)
    .split(/\r?\n/)
    .map((line) => stripListMarker(line))
    .filter(Boolean);

  const result = {
    name: '',
    mealSlot: normalizeMealSlot(fallbackMealSlot) || 'breakfast',
    sourcePdf: 'Manual paste',
    suggestedDay: '',
    estimatedKcal: '',
    imageRef: '',
    howToMake: '',
    yieldMode: 'flexible',
    batchYieldPortions: '',
    ingredientLines: [],
    warnings: [],
  };

  if (lines.length === 0) {
    result.warnings.push('Paste a recipe name, ingredients, and method.');
    return result;
  }

  let activeSection = '';
  const ingredientLines = [];
  const methodLines = [];
  const looseIngredientLines = [];
  const looseMethodLines = [];

  lines.forEach((line, index) => {
    const section = getSectionForLine(line);
    if (section) {
      activeSection = section;
      return;
    }

    const inlineSectionMatch = line.match(/^(ingredients?|method|instructions|directions|preparation|how to make|notes?)\s*:\s*(.+)$/i);
    if (inlineSectionMatch) {
      const inlineSection = getSectionForLine(inlineSectionMatch[1]);
      const inlineValue = normalizeSpace(inlineSectionMatch[2]);
      activeSection = inlineSection || activeSection;
      if (inlineSection === 'ingredients') {
        ingredientLines.push(inlineValue);
        return;
      }
      if (inlineSection === 'method' || inlineSection === 'notes') {
        methodLines.push(inlineValue);
        return;
      }
    }

    const nameValue = getLabelValue(line, ['name', 'title', 'recipe']);
    if (nameValue) {
      result.name = nameValue;
      return;
    }

    const mealSlotValue = getLabelValue(line, ['meal', 'slot', 'type']);
    const normalizedSlot = normalizeMealSlot(mealSlotValue);
    if (normalizedSlot) {
      result.mealSlot = normalizedSlot;
      return;
    }

    const dayValue = getLabelValue(line, ['day', 'suggested day']);
    if (dayValue) {
      result.suggestedDay = normalizeSuggestedDay(dayValue);
      return;
    }

    const sourceValue = getLabelValue(line, ['source', 'diet']);
    if (sourceValue) {
      result.sourcePdf = sourceValue;
      return;
    }

    const servingCount = extractServingCount(line);
    if (servingCount !== null) {
      result.yieldMode = 'batch';
      result.batchYieldPortions = String(servingCount);
      return;
    }

    const kcalEstimate = extractKcalEstimate(line);
    if (kcalEstimate !== null && /(?:per serving|serving|portion|kcal|calories|cal)/i.test(line)) {
      result.estimatedKcal = String(Math.round(kcalEstimate));
      return;
    }

    if (!result.name && index === 0 && !looksLikeIngredientLine(line)) {
      result.name = line;
      return;
    }

    if (activeSection === 'ingredients') {
      ingredientLines.push(line);
      return;
    }

    if (activeSection === 'method' || activeSection === 'notes') {
      methodLines.push(line);
      return;
    }

    if (looksLikeIngredientLine(line)) {
      looseIngredientLines.push(line);
      return;
    }

    looseMethodLines.push(line);
  });

  const ingredientCandidates = splitIngredientCandidates(
    ingredientLines.length > 0 ? ingredientLines : looseIngredientLines
  );

  result.ingredientLines = ingredientCandidates.map((line) => parseIngredientText(line));
  result.howToMake = [...methodLines, ...looseMethodLines].join('\n').trim();

  if (!result.name) {
    result.name = lines.find((line) => !looksLikeIngredientLine(line) && !getSectionForLine(line)) || '';
  }

  if (result.ingredientLines.length === 0) {
    result.warnings.push('No ingredient rows were detected. Add ingredients manually before estimating.');
  }

  const uncertainIngredients = result.ingredientLines.filter((ingredient) => (
    !ingredient.quantityValue || !ingredient.quantityUnit || ingredient.parseConfidence < 0.7
  ));
  if (uncertainIngredients.length > 0) {
    result.warnings.push(`${uncertainIngredients.length} ingredient${uncertainIngredients.length === 1 ? '' : 's'} need review before calorie estimates are reliable.`);
  }

  return result;
};

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
  const parsedQuantity = toNullableFiniteNumber(ingredient.quantityValue);
  const hasParsedQuantity = parsedQuantity !== null;
  const contributedQuantity = parsedQuantity !== null
    ? roundQuantity(parsedQuantity * scalingFactor)
    : null;
  const key = hasParsedQuantity && ingredientName
    ? `${normalizeIngredientKey(ingredientName)}::${normalizeUnitKey(quantityUnit)}`
    : `raw::${normalizeIngredientKey(ingredient.rawText || ingredientName)}`;
  const normalizedAudience = normalizeMealAudience(entry.audience);
  const sourceKey = [
    normalizeSpace(entry.date || ''),
    normalizeMealSlot(entry.mealSlot || ''),
    normalizeSpace(recipe.id || ''),
    normalizedAudience,
  ].join('|');

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
    audience: normalizedAudience,
    sourceKey,
    contributedQuantity,
    ...sourceMeta,
  });

  if (parsedQuantity !== null) {
    const nextQuantity = Number(current.quantityValue || 0) + (contributedQuantity || 0);
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
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const draftMap = new Map();
  const carryoverLedger = new Map();
  const entryUsageById = {};
  const carryoverEntryBySourceId = new Map();

  for (const entry of entries) {
    if (normalizeMealEntryKind(entry.entryKind) !== 'carryover' || !entry.carryoverSourceEntryId) continue;
    if (!carryoverEntryBySourceId.has(entry.carryoverSourceEntryId)) {
      carryoverEntryBySourceId.set(entry.carryoverSourceEntryId, entry);
    }
  }

  for (const entry of sortMealEntriesForPreview(entries)) {
    const entryKind = normalizeMealEntryKind(entry.entryKind);
    const sourceEntry = entryKind === 'carryover' && entry.carryoverSourceEntryId
      ? (entryMap.get(entry.carryoverSourceEntryId) || null)
      : null;
    const recipe = entryKind === 'carryover'
      ? (sourceEntry ? recipeMap.get(sourceEntry.mealId) : recipeMap.get(entry.mealId))
      : recipeMap.get(entry.mealId);
    if (!recipe) continue;

    if (entryKind === 'carryover') {
      const sourceUsage = sourceEntry ? entryUsageById[sourceEntry.id] : null;
      const carryoverPortions = roundQuantity(sourceUsage?.reservedCarryoverPortions) ?? 0;
      const isValidCarryover = Boolean(
        sourceEntry
        && sourceUsage
        && sourceUsage.yieldMode === 'batch'
        && carryoverPortions > 0
      );

      entryUsageById[entry.id] = {
        entryId: entry.id,
        recipeId: recipe.id,
        recipeName: recipe.name,
        requiredPortions: carryoverPortions,
        usedCarryoverPortions: 0,
        carryoverSourceDate: sourceEntry?.date || '',
        carryoverSourceEntryId: sourceEntry?.id || '',
        cookedBatchCount: 0,
        batchYieldPortions: sourceUsage?.batchYieldPortions ?? getRecipeBatchYieldPortions(recipe),
        createdCarryoverPortions: 0,
        reservedCarryoverPortions: carryoverPortions,
        leftoverAfterPortions: 0,
        effectiveIngredientMultiplier: 0,
        yieldMode: normalizeRecipeYieldMode(recipe.yieldMode),
        entryKind,
        hasCarryoverChild: false,
        carryoverChildDate: '',
        carryoverChildEntryId: '',
        carryoverStatus: isValidCarryover ? 'active' : 'warning',
        carryoverPortions,
        contributesToNutrition: isValidCarryover,
        contributesToGroceries: false,
        warningMessage: isValidCarryover
          ? ''
          : !sourceEntry
            ? 'Source meal was removed.'
            : sourceUsage?.yieldMode !== 'batch'
              ? 'Source meal is no longer a batch recipe.'
              : 'No leftover is available from the source meal.',
      };
      continue;
    }

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
      reservedCarryoverPortions: 0,
      leftoverAfterPortions: 0,
      effectiveIngredientMultiplier: roundedRequiredPortions,
      yieldMode: normalizeRecipeYieldMode(recipe.yieldMode),
      entryKind,
      hasCarryoverChild: false,
      carryoverChildDate: '',
      carryoverChildEntryId: '',
      carryoverStatus: 'none',
      carryoverPortions: 0,
      contributesToNutrition: entry.audience !== 'kids',
      contributesToGroceries: true,
      warningMessage: '',
    };

    if (isBatchRecipe(recipe)) {
      const batchYieldPortions = getRecipeBatchYieldPortions(recipe);
      const carryoverEntry = carryoverEntryBySourceId.get(entry.id) || null;
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
      usage.leftoverAfterPortions = roundQuantity(leftoverAfterPortions) ?? 0;
      usage.hasCarryoverChild = Boolean(carryoverEntry);
      usage.carryoverChildDate = carryoverEntry?.date || '';
      usage.carryoverChildEntryId = carryoverEntry?.id || '';
      usage.reservedCarryoverPortions = carryoverEntry
        ? (roundQuantity(leftoverAfterPortions) ?? 0)
        : 0;
      usage.createdCarryoverPortions = carryoverEntry
        ? 0
        : (roundQuantity(leftoverAfterPortions) ?? 0);
      usage.effectiveIngredientMultiplier = cookedBatchCount;

      carryoverLedger.set(recipe.id, {
        remainingPortions: carryoverEntry ? 0 : leftoverAfterPortions,
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

export const buildGroceryDraftSourceSignature = (itemKey = '', sourceMeal = {}) => {
  const normalizedItemKey = normalizeSpace(itemKey);
  if (!normalizedItemKey) return '';

  const sourceKey = normalizeSpace(sourceMeal.sourceKey || '');
  if (sourceKey) {
    return `${normalizedItemKey}::${sourceKey}`;
  }

  return [
    normalizedItemKey,
    normalizeSpace(sourceMeal.date || ''),
    normalizeMealSlot(sourceMeal.mealSlot || ''),
    normalizeSpace(sourceMeal.recipeId || sourceMeal.recipeName || ''),
    normalizeMealAudience(sourceMeal.audience || 'all'),
  ].join('::');
};

export const getGroceryDraftItemSourceSignatures = (item = {}) => (
  (item.sourceMeals || [])
    .map((sourceMeal) => buildGroceryDraftSourceSignature(item.key, sourceMeal))
    .filter(Boolean)
);

const splitGroceryDraftByExcludedSources = (draft = [], excludedDraftSourceSignatures = []) => {
  const excludedSet = new Set(
    (excludedDraftSourceSignatures || [])
      .map((value) => normalizeSpace(value))
      .filter(Boolean)
  );

  const visible = [];
  const hidden = [];

  for (const item of draft) {
    const visibleSources = [];
    const hiddenSources = [];
    let visibleQuantityValue = 0;
    let hiddenQuantityValue = 0;
    let hasVisibleParsedQuantity = false;
    let hasHiddenParsedQuantity = false;

    for (const sourceMeal of item.sourceMeals || []) {
      const signature = buildGroceryDraftSourceSignature(item.key, sourceMeal);
      const targetCollection = excludedSet.has(signature) ? hiddenSources : visibleSources;
      targetCollection.push(sourceMeal);

      const contributedQuantity = toNullableFiniteNumber(sourceMeal.contributedQuantity);
      if (contributedQuantity === null) continue;

      if (targetCollection === hiddenSources) {
        hasHiddenParsedQuantity = true;
        hiddenQuantityValue += contributedQuantity;
      } else {
        hasVisibleParsedQuantity = true;
        visibleQuantityValue += contributedQuantity;
      }
    }

    if (visibleSources.length > 0) {
      visible.push({
        ...item,
        occurrenceCount: visibleSources.length,
        quantityValue: hasVisibleParsedQuantity ? roundQuantity(visibleQuantityValue) : null,
        sourceMeals: visibleSources,
      });
    }

    if (hiddenSources.length > 0) {
      hidden.push({
        ...item,
        occurrenceCount: hiddenSources.length,
        quantityValue: hasHiddenParsedQuantity ? roundQuantity(hiddenQuantityValue) : null,
        sourceMeals: hiddenSources,
      });
    }
  }

  const sortByTitle = (left, right) => left.title.localeCompare(right.title);
  return {
    visible: visible.sort(sortByTitle),
    hidden: hidden.sort(sortByTitle),
  };
};

export const applyGroceryDraftExclusions = (draft = [], excludedDraftSourceSignatures = []) => (
  splitGroceryDraftByExcludedSources(draft, excludedDraftSourceSignatures).visible
);

export const getHiddenGroceryDraftItems = (draft = [], excludedDraftSourceSignatures = []) => (
  splitGroceryDraftByExcludedSources(draft, excludedDraftSourceSignatures).hidden
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
