import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createEmptyProjectSnapshot } from './projectData/defaults';
import {
  generateProjectId,
  isProjectRelationMissingError,
  loadShoppingOfflineStateAsync,
  pickPreferredShoppingProject,
} from '../utils/shoppingListViewState';
import {
  applyGroceryDraftExclusions,
  buildMealPlanPreview,
  buildImportedMealRows,
  buildMealIngredientRecords,
  buildMealLibraryRecords,
  formatDateKey,
  getGroceryDraftItemSourceSignatures,
  getHiddenGroceryDraftItems,
  getAdultServingTotal,
  getDefaultServingMultiplier,
  getWeekDayEntries,
  normalizeMealEntryKind,
  getWeekStartMonday,
  normalizeMealAudience,
  serializeIngredientLines,
  splitIngredientList,
} from '../utils/mealPlanner';
import { STARTER_MEAL_IMPORT_TEXT_BY_SLOT } from '../utils/mealPlannerSeedData';

const SHOPPING_PROJECT_NAME = 'Shopping List';
const MEAL_PLAN_WEEK_SELECT_BASE = 'id, week_start_date, adult_count, kid_count';
const MEAL_PLAN_WEEK_SELECT_WITH_PORTIONS = `${MEAL_PLAN_WEEK_SELECT_BASE}, adult_portion_total`;
const MEAL_PLAN_WEEK_SELECT_SHARED_BASE = `${MEAL_PLAN_WEEK_SELECT_BASE}, shopping_project_id`;
const MEAL_PLAN_WEEK_SELECT_SHARED_WITH_PORTIONS = `${MEAL_PLAN_WEEK_SELECT_WITH_PORTIONS}, shopping_project_id`;
const MEAL_PLAN_GROCERY_BATCH_SELECT_BASE = 'id, shopping_project_id, status';
const MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS = `${MEAL_PLAN_GROCERY_BATCH_SELECT_BASE}, excluded_draft_signatures`;
const MEAL_LIBRARY_SELECT_BASE = 'id, external_id, source_pdf, suggested_day, meal_slot, name, ingredients_raw, how_to_make, estimated_kcal, image_ref, recipe_origin, created_at, updated_at';
const MEAL_LIBRARY_SELECT_WITH_BATCH = `${MEAL_LIBRARY_SELECT_BASE}, yield_mode, batch_yield_portions`;
const MEAL_LIBRARY_SELECT_SHARED_BASE = `${MEAL_LIBRARY_SELECT_BASE}, shopping_project_id`;
const MEAL_LIBRARY_SELECT_SHARED_WITH_BATCH = `${MEAL_LIBRARY_SELECT_WITH_BATCH}, shopping_project_id`;
const STARTER_LIBRARY_ALLOWED_EMAILS = new Set([
  'dorin.galben@yahoo.com',
  'galben.dorin@yahoo.com',
  'irina.urmanschi@gmail.com',
]);

const isMissingRelationError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes(relationName.toLowerCase()) && (msg.includes('relation') || msg.includes('does not exist'));
};

const isMissingMealPlannerFieldError = (error, fieldNames = []) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return fieldNames.some((fieldName) => msg.includes(String(fieldName || '').toLowerCase()));
};

const isFieldStoredAsTextArrayError = (error, fieldName) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    msg.includes(String(fieldName || '').toLowerCase())
    && msg.includes('is of type text[]')
    && msg.includes('expression is of type')
  );
};

const isOutdatedMealPlannerSlotConstraintError = (error) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    msg.includes('meal_plan_entries_week_id_date_meal_slot_key')
    || (msg.includes('duplicate key') && msg.includes('meal_plan_entries'))
    || (msg.includes('unique constraint') && msg.includes('meal_slot'))
  );
};

const toNullableFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const stripMealBatchFields = (payload = {}) => {
  const {
    yield_mode,
    batch_yield_portions,
    ...rest
  } = payload;
  return rest;
};

const mapRecipeRow = (row = {}, ingredients = []) => ({
  id: row.id,
  externalId: row.external_id || '',
  sourcePdf: row.source_pdf || '',
  suggestedDay: row.suggested_day || '',
  mealSlot: row.meal_slot || '',
  name: row.name || '',
  ingredientsRaw: row.ingredients_raw || '',
  howToMake: row.how_to_make || '',
  estimatedKcal: toNullableFiniteNumber(row.estimated_kcal),
  imageRef: row.image_ref || '',
  recipeOrigin: row.recipe_origin || 'manual',
  yieldMode: row.yield_mode || 'flexible',
  batchYieldPortions: toNullableFiniteNumber(row.batch_yield_portions),
  ingredients,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapIngredientRow = (row = {}) => ({
  id: row.id,
  rawText: row.raw_text || row.ingredient_name || '',
  ingredientName: row.ingredient_name || row.raw_text || '',
  quantityValue: toNullableFiniteNumber(row.quantity_value),
  quantityUnit: row.quantity_unit || '',
  notes: row.notes || '',
  estimatedKcal: toNullableFiniteNumber(row.estimated_kcal),
  manualKcal: toNullableFiniteNumber(row.manual_kcal),
  kcalSource: row.kcal_source || '',
  kcalPer100: toNullableFiniteNumber(row.kcal_per_100),
  linkedFdcId: toNullableFiniteNumber(row.linked_fdc_id),
  matchedFoodLabel: row.matched_food_label || '',
  parseConfidence: toNullableFiniteNumber(row.parse_confidence) ?? 0,
});

const mapWeekRow = (row = {}) => ({
  id: row.id,
  userId: row.user_id || '',
  weekStartDate: row.week_start_date || formatDateKey(new Date()),
  shoppingProjectId: row.shopping_project_id || '',
  adultCount: getAdultServingTotal({
    adultPortionTotal: row.adult_portion_total,
    adultCount: (() => {
      const legacyAdultCount = toNullableFiniteNumber(row.adult_count);
      if (legacyAdultCount === null) return null;
      if (legacyAdultCount > 1) return legacyAdultCount;
      return 1.75;
    })(),
  }),
  kidCount: toNullableFiniteNumber(row.kid_count) ?? 0,
});

const mapGroceryBatchRow = (row = {}) => ({
  id: row.id,
  shoppingProjectId: row.shopping_project_id || '',
  status: row.status || 'draft',
  excludedDraftSignatures: (() => {
    const rawValue = row.excluded_draft_signatures;
    if (Array.isArray(rawValue)) {
      return rawValue.map((value) => String(value || '').trim()).filter(Boolean);
    }
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      const nestedSignatures = Array.isArray(rawValue.signatures) ? rawValue.signatures : [];
      return nestedSignatures.map((value) => String(value || '').trim()).filter(Boolean);
    }
    return [];
  })(),
});

const buildExcludedDraftSignaturesPayload = (signatures = [], format = 'jsonb') => {
  const normalizedSignatures = Array.from(
    new Set(
      (Array.isArray(signatures) ? signatures : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  if (format === 'text-array') {
    return normalizedSignatures;
  }

  return { signatures: normalizedSignatures };
};

const mapEntryRow = (row = {}, fallback = {}) => ({
  id: row.id,
  weekId: row.week_id || fallback.weekId || '',
  weekOwnerUserId: row.week_owner_user_id || fallback.weekOwnerUserId || '',
  date: row.date,
  mealSlot: row.meal_slot,
  mealId: row.meal_id,
  servingMultiplier: toNullableFiniteNumber(row.serving_multiplier),
  audience: normalizeMealAudience(row.audience),
  entryPosition: Number.isFinite(Number(row.entry_position)) ? Number(row.entry_position) : 0,
  entryKind: normalizeMealEntryKind(row.entry_kind),
  carryoverSourceEntryId: row.carryover_source_entry_id || '',
});

const sortEntries = (entries = []) => (
  [...entries].sort((left, right) => (
    `${left.date}-${left.mealSlot}`.localeCompare(`${right.date}-${right.mealSlot}`)
    || ((left.entryPosition ?? 0) - (right.entryPosition ?? 0))
    || `${left.id}`.localeCompare(`${right.id}`)
  ))
);

const sortRecipes = (recipes = []) => (
  [...recipes].sort((left, right) => (
    `${left.mealSlot}-${left.name}`.localeCompare(`${right.mealSlot}-${right.name}`)
  ))
);

const mergeVisibleEntriesWithOwnEntries = (visibleEntries = [], ownEntries = [], currentUserId = '') => (
  sortEntries([
    ...(Array.isArray(visibleEntries) ? visibleEntries : []).filter((entry) => entry?.weekOwnerUserId !== currentUserId),
    ...(Array.isArray(ownEntries) ? ownEntries : []),
  ])
);

async function ensureShoppingProject(currentUserId, preferredProjectId = '') {
  let includeMembers = true;
  let { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, created_at, project_members(id, user_id, member_email, role, invited_by_user_id, created_at)')
    .eq('name', SHOPPING_PROJECT_NAME)
    .order('created_at', { ascending: true });

  if (error && includeMembers && isProjectRelationMissingError(error, 'project_members')) {
    includeMembers = false;
    ({ data, error } = await supabase
      .from('projects')
      .select('id, user_id, name, created_at')
      .eq('name', SHOPPING_PROJECT_NAME)
      .order('created_at', { ascending: true }));
  }

  if (error) {
    throw error;
  }

  const offlineState = await loadShoppingOfflineStateAsync(currentUserId);
  const existing = pickPreferredShoppingProject(
    data || [],
    currentUserId,
    preferredProjectId || offlineState.selectedProjectId,
  );
  if (existing?.id) {
    return existing;
  }

  const projectPayload = {
    id: generateProjectId(),
    user_id: currentUserId,
    name: SHOPPING_PROJECT_NAME,
    ...createEmptyProjectSnapshot(),
  };

  const { data: created, error: createError } = await supabase
    .from('projects')
    .insert(projectPayload)
    .select('id, user_id, name, created_at')
    .single();

  if (createError || !created) {
    throw createError || new Error('Unable to prepare Shopping List.');
  }

  return created;
}

export function useMealPlannerData({ currentUserEmail, currentUserId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [plannerProject, setPlannerProject] = useState(null);
  const [week, setWeek] = useState(null);
  const [entries, setEntries] = useState([]);
  const [visibleWeeks, setVisibleWeeks] = useState([]);
  const [visibleEntries, setVisibleEntries] = useState([]);
  const [groceryBatch, setGroceryBatch] = useState(null);
  const [excludedDraftSourceSignatures, setExcludedDraftSourceSignatures] = useState([]);
  // Older databases may not have the shared project field yet, so the planner falls back to private visibility.
  const [supportsSharedMealPlanner, setSupportsSharedMealPlanner] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => formatDateKey(getWeekStartMonday(new Date())));
  const [lastImportedCount, setLastImportedCount] = useState(0);
  const [lastApprovedCount, setLastApprovedCount] = useState(0);
  const starterSeedAttemptedRef = useRef(false);

  const weekDays = useMemo(() => getWeekDayEntries(selectedWeekStart), [selectedWeekStart]);
  const canUseStarterLibrary = useMemo(
    () => STARTER_LIBRARY_ALLOWED_EMAILS.has(String(currentUserEmail || '').trim().toLowerCase()),
    [currentUserEmail]
  );
  const recipesBySlot = useMemo(() => (
    recipes.reduce((accumulator, recipe) => {
      const slot = recipe.mealSlot || 'other';
      if (!accumulator[slot]) accumulator[slot] = [];
      accumulator[slot].push(recipe);
      return accumulator;
    }, {})
  ), [recipes]);
  const resolvePlannerProject = useCallback(async () => {
    const preferredProjectId = plannerProject?.id || week?.shoppingProjectId || '';
    const shoppingProject = await ensureShoppingProject(currentUserId, preferredProjectId);
    setPlannerProject((previous) => (previous?.id === shoppingProject.id ? previous : shoppingProject));
    return shoppingProject;
  }, [currentUserId, plannerProject?.id, week?.shoppingProjectId]);

  const mealPlanPreview = useMemo(() => buildMealPlanPreview({
    recipes,
    entries,
    adultPortionTotal: week?.adultCount ?? 1.75,
    kidCount: week?.kidCount ?? 0,
  }), [entries, recipes, week?.adultCount, week?.kidCount]);

  const rawGroceryDraft = mealPlanPreview.groceryDraft;
  const groceryDraft = useMemo(
    () => applyGroceryDraftExclusions(rawGroceryDraft, excludedDraftSourceSignatures),
    [excludedDraftSourceSignatures, rawGroceryDraft]
  );
  const hiddenGroceryDraft = useMemo(
    () => getHiddenGroceryDraftItems(rawGroceryDraft, excludedDraftSourceSignatures),
    [excludedDraftSourceSignatures, rawGroceryDraft]
  );
  const entryUsageById = mealPlanPreview.entryUsageById;

  const householdMealPlanPreview = useMemo(() => buildMealPlanPreview({
    recipes,
    entries: visibleEntries,
    adultPortionTotal: week?.adultCount ?? 1.75,
    kidCount: week?.kidCount ?? 0,
  }), [recipes, visibleEntries, week?.adultCount, week?.kidCount]);

  const rawHouseholdGroceryDraft = householdMealPlanPreview.groceryDraft;
  const householdGroceryDraft = useMemo(
    () => applyGroceryDraftExclusions(rawHouseholdGroceryDraft, excludedDraftSourceSignatures),
    [excludedDraftSourceSignatures, rawHouseholdGroceryDraft]
  );
  const hiddenHouseholdGroceryDraft = useMemo(
    () => getHiddenGroceryDraftItems(rawHouseholdGroceryDraft, excludedDraftSourceSignatures),
    [excludedDraftSourceSignatures, rawHouseholdGroceryDraft]
  );
  const householdEntryUsageById = householdMealPlanPreview.entryUsageById;

  const loadRecipes = useCallback(async (shoppingProjectId = '') => {
    let mealQuery = supabase
      .from('meal_library_meals')
      .select(supportsSharedMealPlanner ? MEAL_LIBRARY_SELECT_SHARED_WITH_BATCH : MEAL_LIBRARY_SELECT_WITH_BATCH);
    if (supportsSharedMealPlanner) {
      mealQuery = mealQuery.eq('shopping_project_id', shoppingProjectId || '00000000-0000-0000-0000-000000000000');
    } else {
      mealQuery = mealQuery.eq('user_id', currentUserId);
    }
    let mealResult = await mealQuery
      .order('meal_slot', { ascending: true })
      .order('name', { ascending: true });

    if (supportsSharedMealPlanner && mealResult.error && isMissingMealPlannerFieldError(mealResult.error, ['shopping_project_id'])) {
      setSupportsSharedMealPlanner(false);
      mealResult = await supabase
        .from('meal_library_meals')
        .select(MEAL_LIBRARY_SELECT_WITH_BATCH)
        .order('meal_slot', { ascending: true })
        .order('name', { ascending: true });
    }

    if (mealResult.error && isMissingMealPlannerFieldError(mealResult.error, ['yield_mode', 'batch_yield_portions'])) {
      let fallbackMealQuery = supabase
        .from('meal_library_meals')
        .select(supportsSharedMealPlanner ? MEAL_LIBRARY_SELECT_SHARED_BASE : MEAL_LIBRARY_SELECT_BASE);
      if (supportsSharedMealPlanner) {
        fallbackMealQuery = fallbackMealQuery.eq('shopping_project_id', shoppingProjectId || '00000000-0000-0000-0000-000000000000');
      } else {
        fallbackMealQuery = fallbackMealQuery.eq('user_id', currentUserId);
      }
      mealResult = await fallbackMealQuery
        .order('meal_slot', { ascending: true })
        .order('name', { ascending: true });

      if (supportsSharedMealPlanner && mealResult.error && isMissingMealPlannerFieldError(mealResult.error, ['shopping_project_id'])) {
        setSupportsSharedMealPlanner(false);
        mealResult = await supabase
          .from('meal_library_meals')
          .select(MEAL_LIBRARY_SELECT_BASE)
          .order('meal_slot', { ascending: true })
          .order('name', { ascending: true });
      }
    }

    if (mealResult.error) {
      throw mealResult.error;
    }

    const mealRows = mealResult.data || [];

    const mealIds = (mealRows || []).map((row) => row.id);
    let ingredientRows = [];
    if (mealIds.length > 0) {
      const ingredientsResult = await supabase
        .from('meal_library_ingredients')
        .select('id, meal_id, raw_text, ingredient_name, quantity_value, quantity_unit, notes, estimated_kcal, manual_kcal, kcal_source, kcal_per_100, linked_fdc_id, matched_food_label, parse_confidence, created_at, updated_at')
        .in('meal_id', mealIds)
        .order('created_at', { ascending: true });

      if (ingredientsResult.error && isMissingMealPlannerFieldError(ingredientsResult.error, ['estimated_kcal', 'manual_kcal', 'kcal_source', 'kcal_per_100', 'linked_fdc_id', 'matched_food_label'])) {
        const fallbackIngredientsResult = await supabase
          .from('meal_library_ingredients')
          .select('id, meal_id, raw_text, ingredient_name, quantity_value, quantity_unit, notes, parse_confidence, created_at, updated_at')
          .in('meal_id', mealIds)
          .order('created_at', { ascending: true });

        if (fallbackIngredientsResult.error) {
          throw fallbackIngredientsResult.error;
        }

        ingredientRows = fallbackIngredientsResult.data || [];
      } else if (ingredientsResult.error) {
        throw ingredientsResult.error;
      } else {
        ingredientRows = ingredientsResult.data || [];
      }
    }

    const ingredientMap = ingredientRows.reduce((accumulator, row) => {
      if (!accumulator[row.meal_id]) accumulator[row.meal_id] = [];
      accumulator[row.meal_id].push(mapIngredientRow(row));
      return accumulator;
    }, {});

    setRecipes(sortRecipes((mealRows || []).map((row) => mapRecipeRow(row, ingredientMap[row.id] || splitIngredientList(row.ingredients_raw)))));
    return mealRows || [];
  }, [currentUserId, supportsSharedMealPlanner]);

  const replaceRecipeIngredients = useCallback(async (mealId, ingredientLines = []) => {
    const { error: deleteError } = await supabase
      .from('meal_library_ingredients')
      .delete()
      .eq('meal_id', mealId);

    if (deleteError) throw deleteError;

    const ingredientRows = buildMealIngredientRecords(ingredientLines).map((ingredient) => ({
      meal_id: mealId,
      ...ingredient,
    }));

    if (ingredientRows.length === 0) {
      return;
    }

    let insertResult = await supabase
      .from('meal_library_ingredients')
      .insert(ingredientRows);

    if (insertResult.error && isMissingMealPlannerFieldError(insertResult.error, ['estimated_kcal', 'manual_kcal', 'kcal_source', 'kcal_per_100', 'linked_fdc_id', 'matched_food_label'])) {
      insertResult = await supabase
        .from('meal_library_ingredients')
        .insert(ingredientRows.map(({
          estimated_kcal,
          manual_kcal,
          kcal_source,
          kcal_per_100,
          linked_fdc_id,
          matched_food_label,
          ...rest
        }) => rest));
    }

    if (insertResult.error) throw insertResult.error;
  }, []);

  const importRowsIntoLibrary = useCallback(async (rows = [], { origin = 'imported' } = {}) => {
    if (!rows.length) return 0;

    const normalizedRows = rows.filter((row) => row?.name && row?.mealSlot);
    if (!normalizedRows.length) return 0;

    const shoppingProject = await resolvePlannerProject();
    let useSharedProjectField = supportsSharedMealPlanner;
    const externalIds = normalizedRows
      .map((row) => row.externalId)
      .filter(Boolean);

    let existingMap = new Map();
    if (externalIds.length > 0) {
      let existingResult = await supabase
        .from('meal_library_meals')
        .select('id, external_id')
        .eq('shopping_project_id', shoppingProject.id)
        .in('external_id', externalIds);

      if (existingResult.error && isMissingMealPlannerFieldError(existingResult.error, ['shopping_project_id'])) {
        useSharedProjectField = false;
        setSupportsSharedMealPlanner(false);
        existingResult = await supabase
          .from('meal_library_meals')
          .select('id, external_id')
          .eq('user_id', currentUserId)
          .in('external_id', externalIds);
      } else if (existingResult.error) {
        throw existingResult.error;
      }
      if (existingResult.error) throw existingResult.error;
      existingMap = new Map((existingResult.data || []).map((row) => [row.external_id, row.id]));
    }

    const inserts = buildMealLibraryRecords(normalizedRows, origin)
      .map((row) => ({
        user_id: currentUserId,
        shopping_project_id: shoppingProject.id,
        ...row,
      }))
      .filter((row) => !row.external_id || !existingMap.has(row.external_id));

    if (inserts.length > 0) {
      let insertResult = await supabase
        .from('meal_library_meals')
        .insert(inserts);

      if (insertResult.error && isMissingMealPlannerFieldError(insertResult.error, ['shopping_project_id'])) {
        useSharedProjectField = false;
        setSupportsSharedMealPlanner(false);
        insertResult = await supabase
          .from('meal_library_meals')
          .insert(inserts.map(({
            shopping_project_id,
            ...rest
          }) => rest));
      }

      if (insertResult.error && isMissingMealPlannerFieldError(insertResult.error, ['yield_mode', 'batch_yield_portions'])) {
        insertResult = await supabase
          .from('meal_library_meals')
          .insert(inserts.map((payload) => {
            const nextPayload = stripMealBatchFields(payload);
            if (!useSharedProjectField) {
              const { shopping_project_id, ...legacyPayload } = nextPayload;
              return legacyPayload;
            }
            return nextPayload;
          }));
      }

      if (insertResult.error) throw insertResult.error;
    }

    let refreshedMeals = await supabase
      .from('meal_library_meals')
      .select('id, external_id')
      .eq('shopping_project_id', shoppingProject.id)
      .in('external_id', externalIds);

    if (refreshedMeals.error && isMissingMealPlannerFieldError(refreshedMeals.error, ['shopping_project_id'])) {
      useSharedProjectField = false;
      setSupportsSharedMealPlanner(false);
      refreshedMeals = await supabase
        .from('meal_library_meals')
        .select('id, external_id')
        .eq('user_id', currentUserId)
        .in('external_id', externalIds);
    } else if (refreshedMeals.error) {
      throw refreshedMeals.error;
    }
    if (refreshedMeals.error) throw refreshedMeals.error;

    const insertedMap = new Map((refreshedMeals.data || []).map((row) => [row.external_id, row.id]));

    const ingredientPayload = [];
    const mealIdsToRefresh = [];
    for (const row of normalizedRows) {
      const mealId = row.externalId ? insertedMap.get(row.externalId) : null;
      if (!mealId) continue;
      mealIdsToRefresh.push(mealId);
      ingredientPayload.push(...buildMealIngredientRecords(row.ingredientLines).map((ingredient) => ({
        meal_id: mealId,
        ...ingredient,
      })));
    }

    if (mealIdsToRefresh.length > 0) {
      const { error: deleteIngredientsError } = await supabase
        .from('meal_library_ingredients')
        .delete()
        .in('meal_id', mealIdsToRefresh);

      if (deleteIngredientsError) throw deleteIngredientsError;
    }

    if (ingredientPayload.length > 0) {
      const { error: insertIngredientsError } = await supabase
        .from('meal_library_ingredients')
        .insert(ingredientPayload);

      if (insertIngredientsError) throw insertIngredientsError;
    }

    await loadRecipes(shoppingProject.id);
    setLastImportedCount(normalizedRows.length);
    return normalizedRows.length;
  }, [currentUserId, loadRecipes, resolvePlannerProject, supportsSharedMealPlanner]);

  const seedStarterLibrary = useCallback(async () => {
    if (!canUseStarterLibrary) return 0;
    const starterRows = buildImportedMealRows(STARTER_MEAL_IMPORT_TEXT_BY_SLOT);
    return importRowsIntoLibrary(starterRows, { origin: 'imported' });
  }, [canUseStarterLibrary, importRowsIntoLibrary]);

  const ensureWeek = useCallback(async (weekStartDate, shoppingProjectId = '') => {
    const normalizedWeekStart = formatDateKey(weekStartDate);
    let useSharedProjectField = supportsSharedMealPlanner;
    let existingWeekQuery = supabase
      .from('meal_plan_weeks')
      .select(supportsSharedMealPlanner ? MEAL_PLAN_WEEK_SELECT_SHARED_WITH_PORTIONS : MEAL_PLAN_WEEK_SELECT_WITH_PORTIONS)
      .eq('user_id', currentUserId)
      .eq('week_start_date', normalizedWeekStart);
    let existingWeekResult = await existingWeekQuery.maybeSingle();

    if (supportsSharedMealPlanner && existingWeekResult.error && isMissingMealPlannerFieldError(existingWeekResult.error, ['shopping_project_id'])) {
      useSharedProjectField = false;
      setSupportsSharedMealPlanner(false);
      existingWeekResult = await supabase
        .from('meal_plan_weeks')
        .select(MEAL_PLAN_WEEK_SELECT_WITH_PORTIONS)
        .eq('week_start_date', normalizedWeekStart)
        .maybeSingle();
    }

    if (existingWeekResult.error && isMissingMealPlannerFieldError(existingWeekResult.error, ['adult_portion_total'])) {
      let fallbackWeekQuery = supabase
        .from('meal_plan_weeks')
        .select(supportsSharedMealPlanner ? MEAL_PLAN_WEEK_SELECT_SHARED_BASE : MEAL_PLAN_WEEK_SELECT_BASE)
        .eq('user_id', currentUserId)
        .eq('week_start_date', normalizedWeekStart);
      existingWeekResult = await fallbackWeekQuery.maybeSingle();

      if (supportsSharedMealPlanner && existingWeekResult.error && isMissingMealPlannerFieldError(existingWeekResult.error, ['shopping_project_id'])) {
        useSharedProjectField = false;
        setSupportsSharedMealPlanner(false);
        existingWeekResult = await supabase
          .from('meal_plan_weeks')
          .select(MEAL_PLAN_WEEK_SELECT_BASE)
          .eq('week_start_date', normalizedWeekStart)
          .maybeSingle();
      }
    }

    const { data: existingWeek, error: existingError } = existingWeekResult;

    if (existingError) throw existingError;

    if (existingWeek) {
      const nextWeek = {
        ...mapWeekRow(existingWeek),
        userId: existingWeek.user_id || currentUserId,
      };
      setWeek(nextWeek);
      return nextWeek;
    }

    let createdWeekResult = await supabase
      .from('meal_plan_weeks')
      .insert({
        user_id: currentUserId,
        ...(useSharedProjectField ? { shopping_project_id: shoppingProjectId || null } : {}),
        week_start_date: normalizedWeekStart,
        adult_count: 1,
        adult_portion_total: 1.75,
        kid_count: 0,
      })
      .select(supportsSharedMealPlanner ? MEAL_PLAN_WEEK_SELECT_SHARED_WITH_PORTIONS : MEAL_PLAN_WEEK_SELECT_WITH_PORTIONS)
      .single();

    if (createdWeekResult.error && isMissingMealPlannerFieldError(createdWeekResult.error, ['shopping_project_id'])) {
      useSharedProjectField = false;
      setSupportsSharedMealPlanner(false);
      createdWeekResult = await supabase
        .from('meal_plan_weeks')
        .insert({
          user_id: currentUserId,
          week_start_date: normalizedWeekStart,
          adult_count: 1,
          adult_portion_total: 1.75,
          kid_count: 0,
        })
        .select(MEAL_PLAN_WEEK_SELECT_WITH_PORTIONS)
        .single();
    }

    if (createdWeekResult.error && isMissingMealPlannerFieldError(createdWeekResult.error, ['adult_portion_total'])) {
      createdWeekResult = await supabase
        .from('meal_plan_weeks')
        .insert({
          user_id: currentUserId,
          ...(useSharedProjectField && shoppingProjectId ? { shopping_project_id: shoppingProjectId } : {}),
          week_start_date: normalizedWeekStart,
          adult_count: 1,
          kid_count: 0,
        })
        .select(supportsSharedMealPlanner ? MEAL_PLAN_WEEK_SELECT_SHARED_BASE : MEAL_PLAN_WEEK_SELECT_BASE)
        .single();

      if (supportsSharedMealPlanner && createdWeekResult.error && isMissingMealPlannerFieldError(createdWeekResult.error, ['shopping_project_id'])) {
        useSharedProjectField = false;
        setSupportsSharedMealPlanner(false);
        createdWeekResult = await supabase
          .from('meal_plan_weeks')
          .insert({
            user_id: currentUserId,
            week_start_date: normalizedWeekStart,
            adult_count: 1,
            kid_count: 0,
          })
          .select(MEAL_PLAN_WEEK_SELECT_BASE)
          .single();
      }
    }

    const { data: createdWeek, error: createError } = createdWeekResult;
    if (createError || !createdWeek) {
      throw createError || new Error('Unable to create meal planning week.');
    }

    const nextWeek = {
      ...mapWeekRow(createdWeek),
      userId: createdWeek.user_id || currentUserId,
    };
    setWeek(nextWeek);
    return nextWeek;
  }, [currentUserId, supportsSharedMealPlanner]);

  const loadEntries = useCallback(async ({
    ownWeek,
    weekStartDate,
    shoppingProjectId = '',
  }) => {
    let nextVisibleWeeks = ownWeek?.id ? [ownWeek] : [];
    const normalizedWeekStart = formatDateKey(weekStartDate);

    if (supportsSharedMealPlanner && shoppingProjectId) {
      let visibleWeeksResult = await supabase
        .from('meal_plan_weeks')
        .select('id, user_id, week_start_date, adult_count, kid_count, adult_portion_total, shopping_project_id')
        .eq('week_start_date', normalizedWeekStart)
        .eq('shopping_project_id', shoppingProjectId)
        .order('created_at', { ascending: true });

      if (visibleWeeksResult.error && isMissingMealPlannerFieldError(visibleWeeksResult.error, ['adult_portion_total'])) {
        visibleWeeksResult = await supabase
          .from('meal_plan_weeks')
          .select('id, user_id, week_start_date, adult_count, kid_count, shopping_project_id')
          .eq('week_start_date', normalizedWeekStart)
          .eq('shopping_project_id', shoppingProjectId)
          .order('created_at', { ascending: true });
      }

      if (visibleWeeksResult.error && isMissingMealPlannerFieldError(visibleWeeksResult.error, ['shopping_project_id'])) {
        setSupportsSharedMealPlanner(false);
      } else if (visibleWeeksResult.error) {
        throw visibleWeeksResult.error;
      } else {
        nextVisibleWeeks = (visibleWeeksResult.data || []).map((row) => ({
          ...mapWeekRow(row),
          userId: row.user_id || '',
        }));
      }
    }

    if (ownWeek?.id && !nextVisibleWeeks.some((candidate) => candidate.id === ownWeek.id)) {
      nextVisibleWeeks = [...nextVisibleWeeks, ownWeek];
    }

    nextVisibleWeeks = [...nextVisibleWeeks].sort((left, right) => {
      const leftOwn = left?.userId === currentUserId ? 1 : 0;
      const rightOwn = right?.userId === currentUserId ? 1 : 0;
      return rightOwn - leftOwn || `${left?.userId || ''}-${left?.id || ''}`.localeCompare(`${right?.userId || ''}-${right?.id || ''}`);
    });

    const weekIds = nextVisibleWeeks.map((candidate) => candidate.id).filter(Boolean);
    if (weekIds.length === 0) {
      setVisibleWeeks([]);
      setVisibleEntries([]);
      setEntries([]);
      return {
        visibleWeeks: [],
        visibleEntries: [],
        ownEntries: [],
      };
    }

    let entriesResult = await supabase
      .from('meal_plan_entries')
      .select('id, week_id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position, entry_kind, carryover_source_entry_id')
      .in('week_id', weekIds)
      .order('date', { ascending: true })
      .order('meal_slot', { ascending: true })
      .order('entry_position', { ascending: true })
      .order('created_at', { ascending: true });

    if (entriesResult.error && isMissingMealPlannerFieldError(entriesResult.error, ['entry_kind', 'carryover_source_entry_id'])) {
      entriesResult = await supabase
        .from('meal_plan_entries')
        .select('id, week_id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position')
        .in('week_id', weekIds)
        .order('date', { ascending: true })
        .order('meal_slot', { ascending: true })
        .order('entry_position', { ascending: true })
        .order('created_at', { ascending: true });
    }

    if (entriesResult.error) throw entriesResult.error;

    const weekOwnerById = new Map(nextVisibleWeeks.map((candidate) => [candidate.id, candidate.userId || '']));
    const nextVisibleEntries = sortEntries((entriesResult.data || []).map((row) => mapEntryRow(row, {
      weekId: row.week_id,
      weekOwnerUserId: weekOwnerById.get(row.week_id) || '',
    })));
    const ownWeekIds = new Set(
      nextVisibleWeeks
        .filter((candidate) => candidate.userId === currentUserId || candidate.id === ownWeek?.id)
        .map((candidate) => candidate.id)
    );
    const nextOwnEntries = nextVisibleEntries.filter((entry) => ownWeekIds.has(entry.weekId));

    setVisibleWeeks(nextVisibleWeeks);
    setVisibleEntries(nextVisibleEntries);
    setEntries(nextOwnEntries);

    return {
      visibleWeeks: nextVisibleWeeks,
      visibleEntries: nextVisibleEntries,
      ownEntries: nextOwnEntries,
    };
  }, [currentUserId, supportsSharedMealPlanner]);

  const loadGroceryBatch = useCallback(async (weekId) => {
    let batchResult = await supabase
      .from('meal_plan_grocery_batches')
      .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
      .eq('week_id', weekId)
      .maybeSingle();

    if (batchResult.error && isMissingMealPlannerFieldError(batchResult.error, ['excluded_draft_signatures'])) {
      batchResult = await supabase
        .from('meal_plan_grocery_batches')
        .select(MEAL_PLAN_GROCERY_BATCH_SELECT_BASE)
        .eq('week_id', weekId)
        .maybeSingle();
    }

    if (batchResult.error) throw batchResult.error;

    const nextBatch = batchResult.data ? mapGroceryBatchRow(batchResult.data) : null;
    setGroceryBatch(nextBatch);
    setExcludedDraftSourceSignatures(nextBatch?.excludedDraftSignatures || []);
  }, []);

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError('');

    try {
      const shoppingProject = await resolvePlannerProject();
      const mealRows = await loadRecipes(shoppingProject.id);
      if (mealRows.length === 0 && canUseStarterLibrary && !starterSeedAttemptedRef.current) {
        starterSeedAttemptedRef.current = true;
        await seedStarterLibrary();
      }

      const ownWeek = await ensureWeek(selectedWeekStart, shoppingProject.id);
      await loadEntries({
        ownWeek,
        weekStartDate: selectedWeekStart,
        shoppingProjectId: shoppingProject.id,
      });
      await loadGroceryBatch(ownWeek.id);
    } catch (nextError) {
      if (
        isMissingRelationError(nextError, 'meal_library_meals')
        || isMissingRelationError(nextError, 'meal_plan_weeks')
        || isMissingRelationError(nextError, 'meal_plan_entries')
        || isMissingMealPlannerFieldError(nextError, ['audience', 'entry_position', 'adult_portion_total', 'entry_kind', 'carryover_source_entry_id', 'shopping_project_id'])
      ) {
        setError('Meal Planner needs the latest SQL migration before it can load.');
      } else {
        setError(nextError?.message || 'Unable to load Meal Planner right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [canUseStarterLibrary, currentUserId, ensureWeek, loadEntries, loadGroceryBatch, loadRecipes, resolvePlannerProject, seedStarterLibrary, selectedWeekStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateWeekCounts = useCallback(async ({ adultCount, kidCount }) => {
    if (!week?.id) return;

    const nextAdultCount = Math.max(0, Number(adultCount || 0));
    const nextKidCount = Math.max(0, Number(kidCount || 0));
    const previousDefaultMultiplier = getDefaultServingMultiplier({
      adultPortionTotal: week?.adultCount ?? 1.75,
      kidCount: week?.kidCount ?? 0,
    });
    const entryIdsFollowingDefault = entries
      .filter((entry) => (
        entry.servingMultiplier === null
        || entry.servingMultiplier === previousDefaultMultiplier
      ))
      .map((entry) => entry.id);

    setWeek((previous) => previous ? {
      ...previous,
      adultCount: nextAdultCount,
      kidCount: nextKidCount,
    } : previous);
    const nextOwnEntries = entries.map((entry) => (
      entryIdsFollowingDefault.includes(entry.id)
        ? { ...entry, servingMultiplier: null }
        : entry
    ));

    setEntries(nextOwnEntries);
    setVisibleEntries((previous) => mergeVisibleEntriesWithOwnEntries(previous, nextOwnEntries, currentUserId));

    if (entryIdsFollowingDefault.length > 0) {
      const { error: normalizeEntriesError } = await supabase
        .from('meal_plan_entries')
        .update({
          serving_multiplier: null,
        })
        .in('id', entryIdsFollowingDefault);

      if (normalizeEntriesError) {
        setError(normalizeEntriesError.message || 'Unable to refresh serving multipliers right now.');
      }
    }

    const { error: updateError } = await supabase
      .from('meal_plan_weeks')
      .update({
        adult_count: nextAdultCount,
        adult_portion_total: nextAdultCount,
        kid_count: nextKidCount,
      })
      .eq('id', week.id);

    if (updateError && isMissingMealPlannerFieldError(updateError, ['adult_portion_total'])) {
      setError('Meal Planner needs the latest SQL migration before partner portion settings can be saved.');
      return;
    }

    if (updateError) {
      setError(updateError.message || 'Unable to update household counts right now.');
    }
  }, [currentUserId, entries, week?.adultCount, week?.id, week?.kidCount]);

  const upsertMealEntry = useCallback(async ({
    entryId = '',
    date,
    mealSlot,
    mealId,
    servingMultiplier = null,
    audience = 'all',
    entryPosition = null,
    entryKind = 'planned',
    carryoverSourceEntryId = null,
  }) => {
    if (!week?.id) return null;

    try {
      const normalizedAudience = normalizeMealAudience(audience);
      const normalizedEntryKind = normalizeMealEntryKind(entryKind);
      const existingEntry = entryId
        ? (entries.find((entry) => entry.id === entryId) || null)
        : null;
      const payload = {
        week_id: week.id,
        date,
        meal_slot: mealSlot,
        meal_id: mealId,
        serving_multiplier: toNullableFiniteNumber(servingMultiplier),
        audience: normalizedAudience,
        entry_kind: normalizedEntryKind,
        carryover_source_entry_id: carryoverSourceEntryId || null,
        entry_position: entryPosition ?? existingEntry?.entryPosition ?? (
          entries
            .filter((entry) => entry.date === date && entry.mealSlot === mealSlot)
            .reduce((highest, entry) => Math.max(highest, entry.entryPosition ?? 0), -1) + 1
        ),
      };

      if (existingEntry) {
        let updateResult = await supabase
          .from('meal_plan_entries')
          .update({
            meal_id: mealId,
            serving_multiplier: payload.serving_multiplier,
            audience: payload.audience,
            entry_kind: payload.entry_kind,
            carryover_source_entry_id: payload.carryover_source_entry_id,
            entry_position: payload.entry_position,
          })
          .eq('id', existingEntry.id)
          .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position, entry_kind, carryover_source_entry_id')
          .single();

        if (updateResult.error && isMissingMealPlannerFieldError(updateResult.error, ['entry_kind', 'carryover_source_entry_id'])) {
          if (normalizedEntryKind === 'carryover' || payload.carryover_source_entry_id) {
            throw new Error('Meal Planner needs the latest SQL migration before carryover cards can be saved.');
          }
          updateResult = await supabase
            .from('meal_plan_entries')
            .update({
              meal_id: mealId,
              serving_multiplier: payload.serving_multiplier,
              audience: payload.audience,
              entry_position: payload.entry_position,
            })
            .eq('id', existingEntry.id)
            .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position')
            .single();
        }

        const { data, error: updateError } = updateResult;
        if (updateError || !data) throw updateError || new Error('Unable to update planned meal.');

        const nextEntry = mapEntryRow(data, {
          weekId: week.id,
          weekOwnerUserId: currentUserId,
        });
        let nextEntries = entries.map((entry) => entry.id === existingEntry.id ? nextEntry : entry);

        if (normalizedEntryKind === 'planned') {
          const carryoverChildren = nextEntries.filter((entry) => (
            entry.entryKind === 'carryover'
            && entry.carryoverSourceEntryId === existingEntry.id
          ));

          if (carryoverChildren.length > 0) {
            const childIds = carryoverChildren.map((entry) => entry.id);
            let childUpdateResult = await supabase
              .from('meal_plan_entries')
              .update({
                meal_id: mealId,
                audience: payload.audience,
              })
              .in('id', childIds)
              .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position, entry_kind, carryover_source_entry_id');

            if (childUpdateResult.error && isMissingMealPlannerFieldError(childUpdateResult.error, ['entry_kind', 'carryover_source_entry_id'])) {
              childUpdateResult = await supabase
                .from('meal_plan_entries')
                .update({
                  meal_id: mealId,
                  audience: payload.audience,
                })
                .in('id', childIds)
                .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position');
            }

            if (childUpdateResult.error) throw childUpdateResult.error;
            const updatedChildren = (childUpdateResult.data || []).map((row) => mapEntryRow(row, {
              weekId: week.id,
              weekOwnerUserId: currentUserId,
            }));
            const updatedChildrenById = new Map(updatedChildren.map((entry) => [entry.id, entry]));
            nextEntries = nextEntries.map((entry) => updatedChildrenById.get(entry.id) || entry);
          }
        }

        const sortedOwnEntries = sortEntries(nextEntries);
        setEntries(sortedOwnEntries);
        setVisibleEntries((previous) => mergeVisibleEntriesWithOwnEntries(previous, sortedOwnEntries, currentUserId));
        return nextEntry;
      }

      let insertResult = await supabase
        .from('meal_plan_entries')
        .insert(payload)
        .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position, entry_kind, carryover_source_entry_id')
        .single();

      if (insertResult.error && isMissingMealPlannerFieldError(insertResult.error, ['entry_kind', 'carryover_source_entry_id'])) {
        if (normalizedEntryKind === 'carryover' || payload.carryover_source_entry_id) {
          throw new Error('Meal Planner needs the latest SQL migration before carryover cards can be saved.');
        }
        insertResult = await supabase
          .from('meal_plan_entries')
          .insert({
            week_id: payload.week_id,
            date: payload.date,
            meal_slot: payload.meal_slot,
            meal_id: payload.meal_id,
            serving_multiplier: payload.serving_multiplier,
            audience: payload.audience,
            entry_position: payload.entry_position,
          })
          .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position')
          .single();
      }

      const { data, error: insertError } = insertResult;
      if (insertError || !data) throw insertError || new Error('Unable to save planned meal.');

      const nextEntry = mapEntryRow(data, {
        weekId: week.id,
        weekOwnerUserId: currentUserId,
      });
      const nextOwnEntries = sortEntries([...entries, nextEntry]);
      setEntries(nextOwnEntries);
      setVisibleEntries((previous) => mergeVisibleEntriesWithOwnEntries(previous, nextOwnEntries, currentUserId));
      return nextEntry;
    } catch (nextError) {
      if (isOutdatedMealPlannerSlotConstraintError(nextError)) {
        setError('Meal Planner needs the latest SQL migration before multiple meals can be saved in the same slot.');
      } else {
        setError(nextError?.message || 'Unable to save planned meal right now.');
      }
      throw nextError;
    }
  }, [currentUserId, entries, week?.id]);

  const getNextDayKeyWithinWeek = useCallback((dateKey) => {
    const currentIndex = weekDays.findIndex((day) => day.key === dateKey);
    if (currentIndex < 0 || currentIndex >= weekDays.length - 1) return '';
    return weekDays[currentIndex + 1]?.key || '';
  }, [weekDays]);

  const clearMealEntry = useCallback(async ({ entryId = '', date, mealSlot }) => {
    const existingEntry = entryId
      ? (entries.find((entry) => entry.id === entryId) || null)
      : (entries.find((entry) => entry.date === date && entry.mealSlot === mealSlot) || null);
    if (!existingEntry) return;

    const removedEntryIds = Array.from(new Set(
      entries
        .filter((entry) => entry.id === existingEntry.id || entry.carryoverSourceEntryId === existingEntry.id)
        .map((entry) => entry.id)
    ));
    const { error: deleteError } = await supabase
      .from('meal_plan_entries')
      .delete()
      .in('id', removedEntryIds);

    if (deleteError) throw deleteError;

    const removedEntryIdSet = new Set(removedEntryIds);
    const nextOwnEntries = entries.filter((entry) => !removedEntryIdSet.has(entry.id));
    setEntries(nextOwnEntries);
    setVisibleEntries((previous) => mergeVisibleEntriesWithOwnEntries(
      previous.filter((entry) => !removedEntryIdSet.has(entry.id)),
      nextOwnEntries,
      currentUserId,
    ));
  }, [currentUserId, entries]);

  const createCarryoverForNextDay = useCallback(async (sourceEntryId) => {
    const sourceEntry = entries.find((entry) => entry.id === sourceEntryId) || null;
    if (!sourceEntry || sourceEntry.entryKind === 'carryover') return null;

    const existingCarryover = entries.find((entry) => (
      entry.entryKind === 'carryover'
      && entry.carryoverSourceEntryId === sourceEntry.id
    )) || null;
    if (existingCarryover) {
      return existingCarryover;
    }

    const nextDayKey = getNextDayKeyWithinWeek(sourceEntry.date);
    if (!nextDayKey) return null;

    return upsertMealEntry({
      date: nextDayKey,
      mealSlot: sourceEntry.mealSlot,
      mealId: sourceEntry.mealId,
      audience: sourceEntry.audience,
      servingMultiplier: null,
      entryKind: 'carryover',
      carryoverSourceEntryId: sourceEntry.id,
    });
  }, [entries, getNextDayKeyWithinWeek, upsertMealEntry]);

  const moveCarryoverToNextDay = useCallback(async (carryoverEntryId) => {
    const carryoverEntry = entries.find((entry) => entry.id === carryoverEntryId) || null;
    if (!carryoverEntry || carryoverEntry.entryKind !== 'carryover') return null;

    const nextDayKey = getNextDayKeyWithinWeek(carryoverEntry.date);
    if (!nextDayKey) return null;
    const nextEntryPosition = entries
      .filter((entry) => entry.date === nextDayKey && entry.mealSlot === carryoverEntry.mealSlot)
      .reduce((highest, entry) => Math.max(highest, entry.entryPosition ?? 0), -1) + 1;

    return upsertMealEntry({
      entryId: carryoverEntry.id,
      date: nextDayKey,
      mealSlot: carryoverEntry.mealSlot,
      mealId: carryoverEntry.mealId,
      audience: carryoverEntry.audience,
      servingMultiplier: carryoverEntry.servingMultiplier,
      entryPosition: nextEntryPosition,
      entryKind: 'carryover',
      carryoverSourceEntryId: carryoverEntry.carryoverSourceEntryId || null,
    });
  }, [entries, getNextDayKeyWithinWeek, upsertMealEntry]);

  const removeCarryover = useCallback(async (carryoverEntryId) => {
    await clearMealEntry({ entryId: carryoverEntryId });
  }, [clearMealEntry]);

  const applyMealToDates = useCallback(async ({ dates = [], mealSlot, mealId, servingMultiplier = null, audience = 'all' }) => {
    for (const date of dates) {
      await upsertMealEntry({ date, mealSlot, mealId, servingMultiplier, audience });
    }
  }, [upsertMealEntry]);

  const createRecipe = useCallback(async (recipeInput) => {
    setSaving(true);
    setError('');
    try {
      const shoppingProject = await resolvePlannerProject();
      let useSharedProjectField = supportsSharedMealPlanner;
      const ingredientLines = recipeInput.ingredientLines || splitIngredientList(recipeInput.ingredientsRaw || '');
      const isBatchRecipeInput = String(recipeInput.yieldMode || 'flexible') === 'batch';
      const mealPayload = buildMealLibraryRecords([{
        externalId: '',
        sourcePdf: recipeInput.sourcePdf || '',
        suggestedDay: recipeInput.suggestedDay || '',
        mealSlot: recipeInput.mealSlot,
        name: recipeInput.name,
        ingredientsRaw: serializeIngredientLines(ingredientLines),
        howToMake: recipeInput.howToMake || '',
        estimatedKcal: recipeInput.estimatedKcal || null,
        imageRef: recipeInput.imageRef || '',
        ingredientLines,
        yieldMode: recipeInput.yieldMode || 'flexible',
        batchYieldPortions: recipeInput.batchYieldPortions ?? null,
      }], 'manual')[0];

      let insertResult = await supabase
        .from('meal_library_meals')
        .insert({
          user_id: currentUserId,
          ...(useSharedProjectField ? { shopping_project_id: shoppingProject.id } : {}),
          ...mealPayload,
        })
        .select('id')
        .single();

      if (insertResult.error && isMissingMealPlannerFieldError(insertResult.error, ['shopping_project_id'])) {
        useSharedProjectField = false;
        setSupportsSharedMealPlanner(false);
        insertResult = await supabase
          .from('meal_library_meals')
          .insert({
            user_id: currentUserId,
            ...mealPayload,
          })
          .select('id')
          .single();
      }

      if (insertResult.error && isMissingMealPlannerFieldError(insertResult.error, ['yield_mode', 'batch_yield_portions'])) {
        if (isBatchRecipeInput) {
          throw new Error('Meal Planner needs the latest SQL migration before batch recipes can be saved.');
        }
        insertResult = await supabase
          .from('meal_library_meals')
          .insert({
            user_id: currentUserId,
            ...stripMealBatchFields(mealPayload),
          })
          .select('id')
          .single();
      }

      const { data, error: insertError } = insertResult;
      if (insertError || !data) throw insertError || new Error('Unable to create recipe.');
      await replaceRecipeIngredients(data.id, ingredientLines);
      await loadRecipes(shoppingProject.id);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to create recipe.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadRecipes, replaceRecipeIngredients, resolvePlannerProject, supportsSharedMealPlanner]);

  const updateRecipe = useCallback(async (recipeId, recipeInput) => {
    setSaving(true);
    setError('');
    try {
      const ingredientLines = recipeInput.ingredientLines || splitIngredientList(recipeInput.ingredientsRaw || '');
      const isBatchRecipeInput = String(recipeInput.yieldMode || 'flexible') === 'batch';
      const mealPayload = buildMealLibraryRecords([{
        externalId: recipeInput.externalId || '',
        sourcePdf: recipeInput.sourcePdf || '',
        suggestedDay: recipeInput.suggestedDay || '',
        mealSlot: recipeInput.mealSlot,
        name: recipeInput.name,
        ingredientsRaw: serializeIngredientLines(ingredientLines),
        howToMake: recipeInput.howToMake || '',
        estimatedKcal: recipeInput.estimatedKcal || null,
        imageRef: recipeInput.imageRef || '',
        ingredientLines,
        yieldMode: recipeInput.yieldMode || 'flexible',
        batchYieldPortions: recipeInput.batchYieldPortions ?? null,
      }], recipeInput.recipeOrigin || 'manual')[0];

      let updateResult = await supabase
        .from('meal_library_meals')
        .update(mealPayload)
        .eq('id', recipeId);

      if (updateResult.error && isMissingMealPlannerFieldError(updateResult.error, ['yield_mode', 'batch_yield_portions'])) {
        if (isBatchRecipeInput) {
          throw new Error('Meal Planner needs the latest SQL migration before batch recipes can be saved.');
        }
        updateResult = await supabase
          .from('meal_library_meals')
          .update(stripMealBatchFields(mealPayload))
          .eq('id', recipeId);
      }

      if (updateResult.error) throw updateResult.error;
      await replaceRecipeIngredients(recipeId, ingredientLines);
      await loadRecipes(plannerProject?.id || '');
    } catch (nextError) {
      setError(nextError?.message || 'Unable to update recipe.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [loadRecipes, replaceRecipeIngredients]);

  const duplicateRecipe = useCallback(async (recipe) => {
    await createRecipe({
      ...recipe,
      name: `${recipe.name} (Copy)`,
      externalId: '',
      recipeOrigin: 'manual',
      ingredientLines: recipe.ingredients || [],
    });
  }, [createRecipe]);

  const deleteRecipe = useCallback(async (recipeId) => {
    setSaving(true);
    setError('');
    try {
      const { count, error: countError } = await supabase
        .from('meal_plan_entries')
        .select('id', { count: 'exact', head: true })
        .eq('meal_id', recipeId);

      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error('This recipe is already planned in a saved week. Remove it from those days before deleting.');
      }

      const { error: deleteError } = await supabase
        .from('meal_library_meals')
        .delete()
        .eq('id', recipeId);

      if (deleteError) throw deleteError;
      await loadRecipes(plannerProject?.id || '');
    } catch (nextError) {
      setError(nextError?.message || 'Unable to delete recipe.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [loadRecipes]);

  const persistExcludedDraftSourceSignatures = useCallback(async (nextSignatures = []) => {
    if (!week?.id) return null;

    try {
      const shoppingProject = await resolvePlannerProject();
      const sanitizedSignatures = Array.from(new Set((nextSignatures || []).filter(Boolean)));
      const signaturePayload = buildExcludedDraftSignaturesPayload(sanitizedSignatures);
      const legacySignaturePayload = buildExcludedDraftSignaturesPayload(sanitizedSignatures, 'text-array');
      const existingStatus = groceryBatch?.status || 'draft';

      if (groceryBatch?.id) {
        let updateResult = await supabase
          .from('meal_plan_grocery_batches')
          .update({
            shopping_project_id: shoppingProject.id,
            status: existingStatus,
            excluded_draft_signatures: signaturePayload,
          })
          .eq('id', groceryBatch.id)
          .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
          .single();

        if (updateResult.error && isFieldStoredAsTextArrayError(updateResult.error, 'excluded_draft_signatures')) {
          updateResult = await supabase
            .from('meal_plan_grocery_batches')
            .update({
              shopping_project_id: shoppingProject.id,
              status: existingStatus,
              excluded_draft_signatures: legacySignaturePayload,
            })
            .eq('id', groceryBatch.id)
            .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
            .single();
        }

        if (updateResult.error && isMissingMealPlannerFieldError(updateResult.error, ['excluded_draft_signatures'])) {
          updateResult = await supabase
            .from('meal_plan_grocery_batches')
            .update({
              shopping_project_id: shoppingProject.id,
              status: existingStatus,
            })
            .eq('id', groceryBatch.id)
            .select(MEAL_PLAN_GROCERY_BATCH_SELECT_BASE)
            .single();
        }

        if (updateResult.error || !updateResult.data) {
          throw updateResult.error || new Error('Unable to save grocery exclusions.');
        }

        const nextBatch = mapGroceryBatchRow(updateResult.data);
        setGroceryBatch(nextBatch);
        return nextBatch;
      }

      let insertResult = await supabase
        .from('meal_plan_grocery_batches')
        .insert({
          user_id: currentUserId,
          week_id: week.id,
          shopping_project_id: shoppingProject.id,
          status: 'draft',
          excluded_draft_signatures: signaturePayload,
        })
        .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
        .single();

      if (insertResult.error && isFieldStoredAsTextArrayError(insertResult.error, 'excluded_draft_signatures')) {
        insertResult = await supabase
          .from('meal_plan_grocery_batches')
          .insert({
            user_id: currentUserId,
            week_id: week.id,
            shopping_project_id: shoppingProject.id,
            status: 'draft',
            excluded_draft_signatures: legacySignaturePayload,
          })
          .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
          .single();
      }

      if (insertResult.error && isMissingMealPlannerFieldError(insertResult.error, ['excluded_draft_signatures'])) {
        insertResult = await supabase
          .from('meal_plan_grocery_batches')
          .insert({
            user_id: currentUserId,
            week_id: week.id,
            shopping_project_id: shoppingProject.id,
            status: 'draft',
          })
          .select(MEAL_PLAN_GROCERY_BATCH_SELECT_BASE)
          .single();
      }

      if (insertResult.error || !insertResult.data) {
        throw insertResult.error || new Error('Unable to save grocery exclusions.');
      }

      const nextBatch = mapGroceryBatchRow(insertResult.data);
      setGroceryBatch(nextBatch);
      return nextBatch;
    } catch (nextError) {
      if (isMissingMealPlannerFieldError(nextError, ['excluded_draft_signatures'])) {
        setError('Meal Planner needs the latest SQL migration before grocery exclusions can be remembered.');
      } else {
        setError(nextError?.message || 'Unable to save grocery exclusions.');
      }
      throw nextError;
    }
  }, [currentUserId, groceryBatch?.id, groceryBatch?.status, resolvePlannerProject, week?.id]);

  const excludeGroceryDraftItem = useCallback(async (draftItem) => {
    const signaturesToAdd = getGroceryDraftItemSourceSignatures(draftItem);
    if (signaturesToAdd.length === 0) return;

    const previousSignatures = excludedDraftSourceSignatures;
    const nextSignatures = Array.from(new Set([...previousSignatures, ...signaturesToAdd]));
    setExcludedDraftSourceSignatures(nextSignatures);

    try {
      await persistExcludedDraftSourceSignatures(nextSignatures);
    } catch (nextError) {
      setExcludedDraftSourceSignatures(previousSignatures);
      throw nextError;
    }
  }, [excludedDraftSourceSignatures, persistExcludedDraftSourceSignatures]);

  const restoreExcludedGroceryDraftItem = useCallback(async (draftItem) => {
    const signaturesToRemove = new Set(getGroceryDraftItemSourceSignatures(draftItem));
    if (signaturesToRemove.size === 0) return;

    const previousSignatures = excludedDraftSourceSignatures;
    const nextSignatures = previousSignatures.filter((signature) => !signaturesToRemove.has(signature));
    setExcludedDraftSourceSignatures(nextSignatures);

    try {
      await persistExcludedDraftSourceSignatures(nextSignatures);
    } catch (nextError) {
      setExcludedDraftSourceSignatures(previousSignatures);
      throw nextError;
    }
  }, [excludedDraftSourceSignatures, persistExcludedDraftSourceSignatures]);

  const restoreAllExcludedGroceryDraftItems = useCallback(async () => {
    if (excludedDraftSourceSignatures.length === 0) return;

    const previousSignatures = excludedDraftSourceSignatures;
    setExcludedDraftSourceSignatures([]);

    try {
      await persistExcludedDraftSourceSignatures([]);
    } catch (nextError) {
      setExcludedDraftSourceSignatures(previousSignatures);
      throw nextError;
    }
  }, [excludedDraftSourceSignatures, persistExcludedDraftSourceSignatures]);

  const confirmGroceryDraft = useCallback(async (draftOverride = null) => {
    if (!week?.id) return null;
    const draftRows = Array.isArray(draftOverride) ? draftOverride : groceryDraft;

    if (draftRows.length === 0) {
      throw new Error('Plan at least one meal before generating groceries.');
    }

    setSaving(true);
    setError('');

    try {
      const shoppingProject = await resolvePlannerProject();
      const batchPayload = {
        user_id: currentUserId,
        week_id: week.id,
        shopping_project_id: shoppingProject.id,
        status: 'approved',
        excluded_draft_signatures: buildExcludedDraftSignaturesPayload(excludedDraftSourceSignatures),
        ...(groceryBatch?.id ? { id: groceryBatch.id } : {}),
      };
      let batchResult = await supabase
        .from('meal_plan_grocery_batches')
        .upsert(batchPayload, {
          onConflict: 'week_id',
        })
        .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
        .single();

      if (batchResult.error && isFieldStoredAsTextArrayError(batchResult.error, 'excluded_draft_signatures')) {
        batchResult = await supabase
          .from('meal_plan_grocery_batches')
          .upsert({
            ...batchPayload,
            excluded_draft_signatures: buildExcludedDraftSignaturesPayload(excludedDraftSourceSignatures, 'text-array'),
          }, {
            onConflict: 'week_id',
          })
          .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
          .single();
      }

      if (batchResult.error && isMissingMealPlannerFieldError(batchResult.error, ['excluded_draft_signatures'])) {
        const {
          excluded_draft_signatures,
          ...batchPayloadWithoutExclusions
        } = batchPayload;
        batchResult = await supabase
          .from('meal_plan_grocery_batches')
          .upsert(batchPayloadWithoutExclusions, {
            onConflict: 'week_id',
          })
          .select(MEAL_PLAN_GROCERY_BATCH_SELECT_BASE)
          .single();
      }

      if (batchResult.error || !batchResult.data?.id) {
        throw batchResult.error || new Error('Unable to create grocery batch.');
      }

      const nextBatch = mapGroceryBatchRow(batchResult.data);
      setGroceryBatch(nextBatch);
      const batchId = nextBatch.id;

      const { error: deleteExistingError } = await supabase
        .from('manual_todos')
        .delete()
        .eq('source_batch_id', batchId);

      if (deleteExistingError) throw deleteExistingError;

      const rows = draftRows.map((item) => ({
        user_id: currentUserId,
        project_id: shoppingProject.id,
        title: item.title,
        due_date: week.weekStartDate || null,
        owner_text: '',
        assignee_user_id: currentUserId,
        status: 'Open',
        recurrence: null,
        completed_at: null,
        quantity_value: item.quantityValue,
        quantity_unit: item.quantityUnit || '',
        source_type: 'meal_plan',
        source_batch_id: batchId,
        meta: {
          rawText: item.rawText,
          occurrenceCount: item.occurrenceCount,
          sourceMeals: item.sourceMeals,
          weekStartDate: week.weekStartDate,
        },
      }));

      const { error: insertItemsError } = await supabase
        .from('manual_todos')
        .insert(rows);

      if (insertItemsError) throw insertItemsError;
      setLastApprovedCount(rows.length);
      return { batchId, count: rows.length };
    } catch (nextError) {
      setError(nextError?.message || 'Unable to approve groceries right now.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, excludedDraftSourceSignatures, groceryBatch?.id, groceryDraft, resolvePlannerProject, week?.id, week?.weekStartDate]);

  return {
    applyMealToDates,
    clearMealEntry,
    confirmGroceryDraft,
    canUseStarterLibrary,
    createCarryoverForNextDay,
    createRecipe,
    deleteRecipe,
    entries,
    error,
    excludeGroceryDraftItem,
    entryUsageById,
    groceryDraft,
    hiddenHouseholdGroceryDraft,
    hiddenGroceryDraft,
    householdEntryUsageById,
    householdGroceryDraft,
    importRowsIntoLibrary,
    lastApprovedCount,
    lastImportedCount,
    loading,
    plannerProject,
    recipes,
    recipesBySlot,
    reload,
    saving,
    seedStarterLibrary,
    selectedWeekStart,
    setSelectedWeekStart,
    moveCarryoverToNextDay,
    removeCarryover,
    restoreAllExcludedGroceryDraftItems,
    restoreExcludedGroceryDraftItem,
    updateRecipe,
    updateWeekCounts,
    upsertMealEntry,
    visibleEntries,
    visibleWeeks,
    week,
    weekDays,
    duplicateRecipe,
    defaultServingMultiplier: getDefaultServingMultiplier({
      adultPortionTotal: week?.adultCount ?? 1.75,
      kidCount: week?.kidCount ?? 0,
    }),
  };
}
