import {
  applyApiCors,
  getAdminSupabase,
  getUserSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

import {
  buildIngredientSearchQuery,
  estimateIngredientCalories,
  pickBestFoodMatch,
  summarizeRecipeCalorieEstimate,
} from '../src/utils/mealCalorieEstimator.js';
import {
  findRememberedIngredientEstimate,
  findStarterCalorieFoodMatch,
} from '../src/utils/mealCalorieCatalog.js';

const USDA_API_BASE = 'https://api.nal.usda.gov/fdc/v1';
const MAX_INGREDIENTS = 24;
const cacheSupabase = getAdminSupabase();

const normalizeSpace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const createHttpError = ({ message, status = 500, payload = null }) => {
  const error = new Error(message);
  error.status = status;
  error.payload = payload;
  return error;
};

const buildIngredientCacheKey = (ingredient = {}) => (
  [
    normalizeSpace(ingredient.ingredientName || ingredient.rawText || '').toLowerCase(),
    ingredient.quantityValue === null || ingredient.quantityValue === undefined || ingredient.quantityValue === ''
      ? ''
      : Number(ingredient.quantityValue),
    normalizeSpace(ingredient.quantityUnit || '').toLowerCase(),
    normalizeSpace(ingredient.notes || '').toLowerCase(),
  ].join('::')
);

const isMissingCacheRelationError = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('meal_ingredient_calorie_cache') && (message.includes('relation') || message.includes('does not exist'));
};

const toFiniteNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const hasPositiveCalorieEstimate = (result = {}) => {
  const estimatedKcal = toFiniteNumber(result.estimatedKcal);
  const kcalPer100 = toFiniteNumber(result.kcalPer100);
  return (estimatedKcal !== null && estimatedKcal > 0) || (kcalPer100 !== null && kcalPer100 > 0);
};

const normalizeIngredientInput = (ingredient = {}) => ({
  rawText: String(ingredient.rawText || ingredient.ingredientName || '').trim(),
  ingredientName: String(ingredient.ingredientName || ingredient.rawText || '').trim(),
  quantityValue: ingredient.quantityValue === '' || ingredient.quantityValue === null || ingredient.quantityValue === undefined
    ? null
    : Number(ingredient.quantityValue),
  quantityUnit: String(ingredient.quantityUnit || '').trim(),
  notes: String(ingredient.notes || '').trim(),
});

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    let payload = null;
    try {
      payload = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      payload = null;
    }
    const message = payload?.error?.message || bodyText || `Request failed with ${response.status}.`;
    throw createHttpError({
      message,
      status: response.status,
      payload,
    });
  }
  return response.json();
};

const normalizeUsdaApiError = (error, { usingDemoKey = false } = {}) => {
  const status = Number(error?.status);
  const code = String(error?.payload?.error?.code || '').toUpperCase();
  const message = String(error?.payload?.error?.message || error?.message || '');

  if (code === 'OVER_RATE_LIMIT' || status === 429 || message.toLowerCase().includes('rate limit')) {
    return usingDemoKey
      ? 'The USDA demo key is over its shared rate limit right now. Add `USDA_FDC_API_KEY` to your local `.env`, restart `vercel dev`, and try again.'
      : 'Your USDA FoodData Central key is over its rate limit right now. Try again shortly, or use a different API key.'
  }

  if (code === 'API_KEY_MISSING' || message.toLowerCase().includes('api key')) {
    return usingDemoKey
      ? 'USDA did not accept the shared demo key. Add your own `USDA_FDC_API_KEY` to local `.env`, restart `vercel dev`, and try again.'
      : 'Your `USDA_FDC_API_KEY` appears to be missing or invalid.'
  }

  return message || 'Unable to estimate calories right now.';
};

const readCachedIngredientEstimate = async (ingredient = {}) => {
  if (!cacheSupabase) return null;
  const cacheKey = buildIngredientCacheKey(ingredient);
  if (!cacheKey) return null;

  const { data, error } = await cacheSupabase
    .from('meal_ingredient_calorie_cache')
    .select('payload')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error) {
    if (!isMissingCacheRelationError(error)) {
      console.warn('Meal ingredient calorie cache read failed:', error.message || error);
    }
    return null;
  }

  if (!data?.payload) return null;
  if (!hasPositiveCalorieEstimate(data.payload)) return null;
  return {
    ...data.payload,
    cacheHit: true,
    originalLookupSource: data.payload.lookupSource || '',
    lookupSource: 'cached',
  };
};

const loadRememberedIngredientRows = async ({ userId, userSupabase }) => {
  const ingredientSelect = [
    'ingredient_name',
    'raw_text',
    'quantity_value',
    'quantity_unit',
    'notes',
    'estimated_kcal',
    'manual_kcal',
    'kcal_per_100',
    'linked_fdc_id',
    'matched_food_label',
    'updated_at',
  ].join(', ');

  try {
      if (userSupabase) {
      const { data, error } = await userSupabase
        .from('meal_library_ingredients')
        .select(ingredientSelect)
        .order('updated_at', { ascending: false })
        .limit(800);

      if (error) throw error;

      return (data || []).filter((row) => (
        (toFiniteNumber(row.kcal_per_100) !== null && Number(row.kcal_per_100) > 0)
        || (toFiniteNumber(row.manual_kcal) !== null && Number(row.manual_kcal) > 0)
        || (toFiniteNumber(row.estimated_kcal) !== null && Number(row.estimated_kcal) > 0)
      ));
    }

    if (!cacheSupabase || !userId) return [];

    const { data: meals, error: mealError } = await cacheSupabase
      .from('meal_library_meals')
      .select('id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(300);

    if (mealError) throw mealError;

    const mealIds = (meals || []).map((meal) => meal.id).filter(Boolean);
    if (mealIds.length === 0) return [];

    const { data, error } = await cacheSupabase
      .from('meal_library_ingredients')
      .select(ingredientSelect)
      .in('meal_id', mealIds)
      .order('updated_at', { ascending: false })
      .limit(800);

    if (error) throw error;

    return (data || []).filter((row) => (
      (toFiniteNumber(row.kcal_per_100) !== null && Number(row.kcal_per_100) > 0)
      || (toFiniteNumber(row.manual_kcal) !== null && Number(row.manual_kcal) > 0)
      || (toFiniteNumber(row.estimated_kcal) !== null && Number(row.estimated_kcal) > 0)
    ));
  } catch (error) {
    console.warn('Meal ingredient memory lookup failed:', error?.message || error);
    return [];
  }
};

const writeCachedIngredientEstimate = async (ingredient = {}, ingredientResult = {}, searchQuery = '') => {
  if (!cacheSupabase) return;
  const cacheKey = buildIngredientCacheKey(ingredient);
  if (!cacheKey) return;

  const { error } = await cacheSupabase
    .from('meal_ingredient_calorie_cache')
    .upsert({
      cache_key: cacheKey,
      search_query: searchQuery || '',
      ingredient_name: ingredient.ingredientName || ingredient.rawText || '',
      raw_text: ingredient.rawText || ingredient.ingredientName || '',
      quantity_value: ingredient.quantityValue ?? null,
      quantity_unit: ingredient.quantityUnit || '',
      notes: ingredient.notes || '',
      resolved: Boolean(ingredientResult.resolved),
      estimated_kcal: ingredientResult.estimatedKcal ?? null,
      quantity_grams: ingredientResult.quantityGrams ?? null,
      kcal_per_100: ingredientResult.kcalPer100 ?? null,
      resolution_method: ingredientResult.resolutionMethod || '',
      reason: ingredientResult.reason || '',
      fdc_id: ingredientResult.matchedFood?.fdcId ?? null,
      matched_food_label: ingredientResult.matchedFood?.description || '',
      matched_food_data_type: ingredientResult.matchedFood?.dataType || '',
      payload: {
        ...ingredientResult,
        cacheHit: false,
        originalLookupSource: ingredientResult.lookupSource || '',
      },
    }, {
      onConflict: 'cache_key',
    });

  if (error && !isMissingCacheRelationError(error)) {
    console.warn('Meal ingredient calorie cache write failed:', error.message || error);
  }
};

const searchFoods = async ({ query, apiKey }) => {
  const url = `${USDA_API_BASE}/foods/search?api_key=${encodeURIComponent(apiKey)}`;
  const body = {
    query,
    pageSize: 8,
  };

  const payload = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return Array.isArray(payload.foods) ? payload.foods : [];
};

const fetchFoodDetails = async ({ fdcId, apiKey }) => {
  const url = `${USDA_API_BASE}/food/${fdcId}?api_key=${encodeURIComponent(apiKey)}`;
  return fetchJson(url);
};

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  const userSupabase = getUserSupabase(req);

  const limitResult = await checkRateLimit({
    key: `meal-estimate:${getClientIp(req)}:${user.id}`,
    max: 18,
    windowMs: 60_000,
  });
  if (!limitResult.ok) {
    return sendRateLimitResponse(
      res,
      limitResult,
      'Recipe calorie estimates are coming in too quickly. Please wait a moment and try again.'
    );
  }

  const ingredientLines = Array.isArray(req.body?.ingredientLines)
    ? req.body.ingredientLines.map(normalizeIngredientInput).filter((ingredient) => ingredient.ingredientName)
    : [];
  const yieldMode = String(req.body?.yieldMode || 'flexible');
  const batchYieldPortions = req.body?.batchYieldPortions ?? null;

  if (ingredientLines.length === 0) {
    return res.status(400).json({ error: 'Add at least one ingredient row before estimating calories.' });
  }

  if (ingredientLines.length > MAX_INGREDIENTS) {
    return res.status(400).json({ error: `Please estimate no more than ${MAX_INGREDIENTS} ingredients at once.` });
  }

  const apiKey = process.env.USDA_FDC_API_KEY || 'DEMO_KEY';

  try {
    const rememberedIngredientRows = await loadRememberedIngredientRows({
      userId: user.id,
      userSupabase,
    });
    const ingredientResults = [];

    for (const ingredient of ingredientLines) {
      const searchQuery = buildIngredientSearchQuery(ingredient);
      const cachedIngredientResult = await readCachedIngredientEstimate(ingredient);
      if (cachedIngredientResult) {
        ingredientResults.push(cachedIngredientResult);
        continue;
      }

      const starterFoodMatch = findStarterCalorieFoodMatch(ingredient);
      if (starterFoodMatch) {
        const starterResult = {
          ...estimateIngredientCalories({
            ingredient,
            food: starterFoodMatch,
          }),
          searchQuery,
          cacheHit: false,
          lookupSource: 'starter',
        };
        ingredientResults.push(starterResult);
        await writeCachedIngredientEstimate(ingredient, starterResult, searchQuery);
        continue;
      }

      const rememberedIngredientResult = findRememberedIngredientEstimate({
        ingredient,
        rememberedRows: rememberedIngredientRows,
      });
      if (rememberedIngredientResult) {
        const rememberedResult = {
          ...rememberedIngredientResult,
          searchQuery,
          cacheHit: false,
          lookupSource: 'remembered',
        };
        ingredientResults.push(rememberedResult);
        await writeCachedIngredientEstimate(ingredient, rememberedResult, searchQuery);
        continue;
      }

      const foods = await searchFoods({ query: searchQuery, apiKey });
      const bestFoodMatch = pickBestFoodMatch(foods, ingredient);

      if (!bestFoodMatch?.fdcId) {
        const unresolvedResult = {
          ingredientName: ingredient.ingredientName,
          rawText: ingredient.rawText,
          quantityValue: ingredient.quantityValue,
          quantityUnit: ingredient.quantityUnit,
          estimatedKcal: null,
          quantityGrams: null,
          kcalPer100: null,
          resolutionMethod: 'unresolved',
          resolved: false,
          reason: 'No suitable USDA food match was found for this ingredient.',
          matchedFood: null,
          searchQuery,
          cacheHit: false,
          lookupSource: '',
        };
        ingredientResults.push(unresolvedResult);
        await writeCachedIngredientEstimate(ingredient, unresolvedResult, searchQuery);
        continue;
      }

      let foodDetails = bestFoodMatch;
      try {
        foodDetails = await fetchFoodDetails({ fdcId: bestFoodMatch.fdcId, apiKey });
      } catch {
        foodDetails = bestFoodMatch;
      }

      const ingredientResult = {
        ...estimateIngredientCalories({
          ingredient,
          food: {
            ...bestFoodMatch,
            ...foodDetails,
          },
        }),
        searchQuery,
        cacheHit: false,
        lookupSource: 'usda',
      };
      ingredientResults.push(ingredientResult);
      await writeCachedIngredientEstimate(ingredient, ingredientResult, searchQuery);
    }

    const summary = summarizeRecipeCalorieEstimate({
      ingredientResults,
      yieldMode,
      batchYieldPortions,
    });

    return res.status(200).json({
      ...summary,
      source: 'PM Workspace calorie estimator',
      usesDemoKey: apiKey === 'DEMO_KEY',
    });
  } catch (error) {
    const normalizedMessage = normalizeUsdaApiError(error, {
      usingDemoKey: apiKey === 'DEMO_KEY',
    });
    return res.status(Number(error?.status) === 429 ? 429 : 502).json({
      error: normalizedMessage,
    });
  }
}
