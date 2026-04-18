import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createEmptyProjectSnapshot } from './projectData/defaults';
import { generateProjectId, isProjectRelationMissingError, pickPreferredShoppingProject } from '../utils/shoppingListViewState';
import { createProjectWithLimits, getProjectCreationErrorMessage } from '../utils/projectCreation';
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

const isMissingRelationError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes(relationName.toLowerCase()) && (msg.includes('relation') || msg.includes('does not exist'));
};

const isMissingMealPlannerFieldError = (error, fieldNames = []) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return fieldNames.some((fieldName) => msg.includes(String(fieldName || '').toLowerCase()));
};

const isOutdatedMealPlannerSlotConstraintError = (error) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    msg.includes('meal_plan_entries_week_id_date_meal_slot_key')
    || (msg.includes('duplicate key') && msg.includes('meal_plan_entries'))
    || (msg.includes('unique constraint') && msg.includes('meal_slot'))
  );
};

const isMissingMealPlanBatchReplacementRpcError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42883'
    || message.includes('replace_meal_plan_grocery_batch')
    || message.includes('meal_plan_grocery_batches');
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
  excludedDraftSignatures: Array.isArray(row.excluded_draft_signatures)
    ? row.excluded_draft_signatures.filter(Boolean)
    : [],
});

const mapEntryRow = (row = {}) => ({
  id: row.id,
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

async function ensureShoppingProject(currentUserId) {
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

  const existing = pickPreferredShoppingProject(data || [], currentUserId);
  if (existing?.id) {
    return existing;
  }

  const projectPayload = {
    id: generateProjectId(),
    user_id: currentUserId,
    name: SHOPPING_PROJECT_NAME,
    ...createEmptyProjectSnapshot(),
  };

  const { data: created, error: createError } = await createProjectWithLimits({
    projectId: projectPayload.id || generateProjectId(),
    name: SHOPPING_PROJECT_NAME,
    snapshot: createEmptyProjectSnapshot(),
    isDemo: false,
  });

  if (createError || !created) {
    throw new Error(getProjectCreationErrorMessage(createError));
  }

  return created;
}

export function useMealPlannerData({ currentUserId, canUseStarterLibrary = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [plannerProject, setPlannerProject] = useState(null);
  const [week, setWeek] = useState(null);
  const [entries, setEntries] = useState([]);
  const [groceryBatch, setGroceryBatch] = useState(null);
  const [excludedDraftSourceSignatures, setExcludedDraftSourceSignatures] = useState([]);
  const [supportsSharedMealPlanner, setSupportsSharedMealPlanner] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => formatDateKey(getWeekStartMonday(new Date())));
  const [lastImportedCount, setLastImportedCount] = useState(0);
  const [lastApprovedCount, setLastApprovedCount] = useState(0);
  const starterSeedAttemptedRef = useRef(false);

  const weekDays = useMemo(() => getWeekDayEntries(selectedWeekStart), [selectedWeekStart]);
  const starterLibraryEnabled = Boolean(canUseStarterLibrary);
  const recipesBySlot = useMemo(() => (
    recipes.reduce((accumulator, recipe) => {
      const slot = recipe.mealSlot || 'other';
      if (!accumulator[slot]) accumulator[slot] = [];
      accumulator[slot].push(recipe);
      return accumulator;
    }, {})
  ), [recipes]);

  const loadShoppingProjectById = useCallback(async (projectId = '') => {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) return null;

    let includeMembers = true;
    let { data, error } = await supabase
      .from('projects')
      .select('id, user_id, name, created_at, project_members(id, user_id, member_email, role, invited_by_user_id, created_at)')
      .eq('id', normalizedProjectId)
      .maybeSingle();

    if (error && includeMembers && isProjectRelationMissingError(error, 'project_members')) {
      includeMembers = false;
      ({ data, error } = await supabase
        .from('projects')
        .select('id, user_id, name, created_at')
        .eq('id', normalizedProjectId)
        .maybeSingle());
    }

    if (error) throw error;
    return data || null;
  }, []);

  const resolveShoppingProject = useCallback(async () => {
    const boundProjectId = String(
      groceryBatch?.shoppingProjectId
      || week?.shoppingProjectId
      || plannerProject?.id
      || ''
    ).trim();

    if (boundProjectId) {
      const boundProject = await loadShoppingProjectById(boundProjectId);
      if (boundProject?.id) {
        setPlannerProject(boundProject);
        return boundProject;
      }
    }

    const fallbackProject = await ensureShoppingProject(currentUserId);
    setPlannerProject(fallbackProject);
    return fallbackProject;
  }, [currentUserId, groceryBatch?.shoppingProjectId, loadShoppingProjectById, plannerProject?.id, week?.shoppingProjectId]);

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

  const loadRecipes = useCallback(async (shoppingProjectId = '') => {
    let mealQuery = supabase
      .from('meal_library_meals')
      .select(supportsSharedMealPlanner ? MEAL_LIBRARY_SELECT_SHARED_WITH_BATCH : MEAL_LIBRARY_SELECT_WITH_BATCH);
    if (supportsSharedMealPlanner) {
      mealQuery = mealQuery.eq('shopping_project_id', shoppingProjectId || '00000000-0000-0000-0000-000000000000');
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
  }, [supportsSharedMealPlanner]);

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

    const shoppingProject = await resolveShoppingProject();
    let useSharedProjectField = supportsSharedMealPlanner;
    setPlannerProject(shoppingProject);
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
  }, [currentUserId, loadRecipes, resolveShoppingProject, supportsSharedMealPlanner]);

  const seedStarterLibrary = useCallback(async () => {
    if (!starterLibraryEnabled) return 0;
    const starterRows = buildImportedMealRows(STARTER_MEAL_IMPORT_TEXT_BY_SLOT);
    return importRowsIntoLibrary(starterRows, { origin: 'imported' });
  }, [importRowsIntoLibrary, starterLibraryEnabled]);

  const ensureWeek = useCallback(async (weekStartDate, shoppingProjectId = '') => {
    const normalizedWeekStart = formatDateKey(weekStartDate);
    let useSharedProjectField = supportsSharedMealPlanner;
    let existingWeekQuery = supabase
      .from('meal_plan_weeks')
      .select(supportsSharedMealPlanner ? MEAL_PLAN_WEEK_SELECT_SHARED_WITH_PORTIONS : MEAL_PLAN_WEEK_SELECT_WITH_PORTIONS)
      .eq('week_start_date', normalizedWeekStart);
    if (supportsSharedMealPlanner) {
      existingWeekQuery = existingWeekQuery.eq('shopping_project_id', shoppingProjectId || '00000000-0000-0000-0000-000000000000');
    }
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
        .eq('week_start_date', normalizedWeekStart);
      if (supportsSharedMealPlanner) {
        fallbackWeekQuery = fallbackWeekQuery.eq('shopping_project_id', shoppingProjectId || '00000000-0000-0000-0000-000000000000');
      }
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
      setWeek(mapWeekRow(existingWeek));
      return existingWeek.id;
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

    setWeek(mapWeekRow(createdWeek));
    return createdWeek.id;
  }, [currentUserId, supportsSharedMealPlanner]);

  const loadEntries = useCallback(async (weekId) => {
    let entriesResult = await supabase
      .from('meal_plan_entries')
      .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position, entry_kind, carryover_source_entry_id')
      .eq('week_id', weekId)
      .order('date', { ascending: true })
      .order('meal_slot', { ascending: true })
      .order('entry_position', { ascending: true })
      .order('created_at', { ascending: true });

    if (entriesResult.error && isMissingMealPlannerFieldError(entriesResult.error, ['entry_kind', 'carryover_source_entry_id'])) {
      entriesResult = await supabase
        .from('meal_plan_entries')
        .select('id, date, meal_slot, meal_id, serving_multiplier, audience, entry_position')
        .eq('week_id', weekId)
        .order('date', { ascending: true })
        .order('meal_slot', { ascending: true })
        .order('entry_position', { ascending: true })
        .order('created_at', { ascending: true });
    }

    if (entriesResult.error) throw entriesResult.error;
    setEntries(sortEntries((entriesResult.data || []).map(mapEntryRow)));
  }, []);

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
      const shoppingProject = await resolveShoppingProject();
      setPlannerProject(shoppingProject);
      const mealRows = await loadRecipes(shoppingProject.id);
      if (mealRows.length === 0 && starterLibraryEnabled && !starterSeedAttemptedRef.current) {
        starterSeedAttemptedRef.current = true;
        await seedStarterLibrary();
      }

      const weekId = await ensureWeek(selectedWeekStart, shoppingProject.id);
      await loadEntries(weekId);
      await loadGroceryBatch(weekId);
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
  }, [currentUserId, ensureWeek, loadEntries, loadGroceryBatch, loadRecipes, resolveShoppingProject, seedStarterLibrary, selectedWeekStart, starterLibraryEnabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!currentUserId || typeof window === 'undefined') return undefined;

    const handleForegroundRefresh = () => {
      if (document.visibilityState === 'visible') {
        void reload();
      }
    };

    const handleWindowFocus = () => {
      void reload();
    };

    document.addEventListener('visibilitychange', handleForegroundRefresh);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleForegroundRefresh);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
    };
  }, [currentUserId, reload]);

  const updateWeekCounts = useCallback(async ({ adultCount, kidCount }) => {
    if (!week?.id) return;

    const nextAdultCount = Math.max(0, Number(adultCount || 0));
    const nextKidCount = Math.max(0, Number(kidCount || 0));
    const previousWeek = week ? { ...week } : null;
    const previousEntries = [...entries];
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
    setEntries((previous) => previous.map((entry) => (
      entryIdsFollowingDefault.includes(entry.id)
        ? { ...entry, servingMultiplier: null }
        : entry
    )));

    if (entryIdsFollowingDefault.length > 0) {
      const { error: normalizeEntriesError } = await supabase
        .from('meal_plan_entries')
        .update({
          serving_multiplier: null,
        })
        .in('id', entryIdsFollowingDefault);

      if (normalizeEntriesError) {
        setWeek(previousWeek);
        setEntries(previousEntries);
        setError(normalizeEntriesError.message || 'Unable to refresh serving multipliers right now.');
        return;
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
      setWeek(previousWeek);
      setEntries(previousEntries);
      setError('Meal Planner needs the latest SQL migration before partner portion settings can be saved.');
      return;
    }

    if (updateError) {
      setWeek(previousWeek);
      setEntries(previousEntries);
      setError(updateError.message || 'Unable to update household counts right now.');
    }
  }, [entries, week]);

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

        const nextEntry = mapEntryRow(data);
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
            const updatedChildren = (childUpdateResult.data || []).map(mapEntryRow);
            const updatedChildrenById = new Map(updatedChildren.map((entry) => [entry.id, entry]));
            nextEntries = nextEntries.map((entry) => updatedChildrenById.get(entry.id) || entry);
          }
        }

        setEntries(sortEntries(nextEntries));
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

      const nextEntry = mapEntryRow(data);
      setEntries((previous) => sortEntries([...previous, nextEntry]));
      return nextEntry;
    } catch (nextError) {
      if (isOutdatedMealPlannerSlotConstraintError(nextError)) {
        setError('Meal Planner needs the latest SQL migration before multiple meals can be saved in the same slot.');
      } else {
        setError(nextError?.message || 'Unable to save planned meal right now.');
      }
      throw nextError;
    }
  }, [entries, week?.id]);

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

    const { error: deleteError } = await supabase
      .from('meal_plan_entries')
      .delete()
      .eq('id', existingEntry.id);

    if (deleteError) throw deleteError;

    setEntries((previous) => previous.filter((entry) => (
      entry.id !== existingEntry.id
      && entry.carryoverSourceEntryId !== existingEntry.id
    )));
  }, [entries]);

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
      const shoppingProject = await resolveShoppingProject();
      let useSharedProjectField = supportsSharedMealPlanner;
      setPlannerProject(shoppingProject);
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
  }, [currentUserId, loadRecipes, replaceRecipeIngredients, resolveShoppingProject, supportsSharedMealPlanner]);

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
  }, [loadRecipes, plannerProject?.id, replaceRecipeIngredients]);

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
  }, [loadRecipes, plannerProject?.id]);

  const persistExcludedDraftSourceSignatures = useCallback(async (nextSignatures = []) => {
    if (!week?.id) return null;

    try {
      const shoppingProject = await resolveShoppingProject();
      const sanitizedSignatures = Array.from(new Set((nextSignatures || []).filter(Boolean)));
      const existingStatus = groceryBatch?.status || 'draft';

      if (groceryBatch?.id) {
        let updateResult = await supabase
          .from('meal_plan_grocery_batches')
          .update({
            shopping_project_id: shoppingProject.id,
            status: existingStatus,
            excluded_draft_signatures: sanitizedSignatures,
          })
          .eq('id', groceryBatch.id)
          .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
          .single();

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
          excluded_draft_signatures: sanitizedSignatures,
        })
        .select(MEAL_PLAN_GROCERY_BATCH_SELECT_WITH_EXCLUSIONS)
        .single();

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
  }, [currentUserId, groceryBatch?.id, groceryBatch?.status, resolveShoppingProject, week?.id]);

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
      const shoppingProject = await resolveShoppingProject();
      const serializedDraftRows = draftRows.map((item) => ({
        title: item.title,
        quantityValue: item.quantityValue,
        quantityUnit: item.quantityUnit || '',
        rawText: item.rawText || '',
        occurrenceCount: item.occurrenceCount ?? 0,
        sourceMeals: item.sourceMeals || [],
        weekStartDate: week.weekStartDate,
      }));

      const { data: replacementResult, error: replacementError } = await supabase.rpc('replace_meal_plan_grocery_batch', {
        target_week_id: week.id,
        target_shopping_project_id: shoppingProject.id,
        target_batch_id: groceryBatch?.id || null,
        target_excluded_draft_signatures: excludedDraftSourceSignatures,
        target_items: serializedDraftRows,
      });

      if (replacementError) {
        if (isMissingMealPlanBatchReplacementRpcError(replacementError)) {
          throw new Error('Meal Planner needs the latest SQL migration before groceries can be approved safely.');
        }
        throw replacementError;
      }

      if (!replacementResult?.ok) {
        throw new Error('Unable to approve groceries right now.');
      }

      await loadGroceryBatch(week.id);
      const count = Number(replacementResult?.count) || serializedDraftRows.length;
      setLastApprovedCount(count);
      return { batchId: replacementResult?.batch_id || groceryBatch?.id || '', count };
    } catch (nextError) {
      setError(nextError?.message || 'Unable to approve groceries right now.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [excludedDraftSourceSignatures, groceryBatch?.id, groceryDraft, loadGroceryBatch, resolveShoppingProject, week?.id, week?.weekStartDate]);

  return {
    applyMealToDates,
    clearMealEntry,
    confirmGroceryDraft,
    canUseStarterLibrary: starterLibraryEnabled,
    createCarryoverForNextDay,
    createRecipe,
    deleteRecipe,
    entries,
    error,
    excludeGroceryDraftItem,
    entryUsageById,
    groceryDraft,
    hiddenGroceryDraft,
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
    week,
    weekDays,
    duplicateRecipe,
    defaultServingMultiplier: getDefaultServingMultiplier({
      adultPortionTotal: week?.adultCount ?? 1.75,
      kidCount: week?.kidCount ?? 0,
    }),
  };
}
