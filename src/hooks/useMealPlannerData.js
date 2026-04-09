import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createEmptyProjectSnapshot } from './projectData/defaults';
import { generateProjectId } from '../utils/shoppingListViewState';
import {
  buildGroceryDraft,
  buildImportedMealRows,
  buildMealIngredientRecords,
  buildMealLibraryRecords,
  formatDateKey,
  getDefaultServingMultiplier,
  getWeekDayEntries,
  getWeekStartMonday,
  serializeIngredientLines,
  splitIngredientList,
} from '../utils/mealPlanner';
import { STARTER_MEAL_IMPORT_TEXT_BY_SLOT } from '../utils/mealPlannerSeedData';

const SHOPPING_PROJECT_NAME = 'Shopping List';
const STARTER_LIBRARY_ALLOWED_EMAILS = new Set([
  'dorin.galben@yahoo.com',
  'irina.urmanschi@gmail.com',
]);

const isMissingRelationError = (error, relationName) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return msg.includes(relationName.toLowerCase()) && (msg.includes('relation') || msg.includes('does not exist'));
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
  estimatedKcal: Number.isFinite(Number(row.estimated_kcal)) ? Number(row.estimated_kcal) : null,
  imageRef: row.image_ref || '',
  recipeOrigin: row.recipe_origin || 'manual',
  ingredients,
  createdAt: row.created_at || '',
  updatedAt: row.updated_at || '',
});

const mapIngredientRow = (row = {}) => ({
  id: row.id,
  rawText: row.raw_text || row.ingredient_name || '',
  ingredientName: row.ingredient_name || row.raw_text || '',
  quantityValue: Number.isFinite(Number(row.quantity_value)) ? Number(row.quantity_value) : null,
  quantityUnit: row.quantity_unit || '',
  notes: row.notes || '',
  parseConfidence: Number.isFinite(Number(row.parse_confidence)) ? Number(row.parse_confidence) : 0,
});

const mapWeekRow = (row = {}) => ({
  id: row.id,
  weekStartDate: row.week_start_date || formatDateKey(new Date()),
  adultCount: Number.isFinite(Number(row.adult_count)) ? Number(row.adult_count) : 1,
  kidCount: Number.isFinite(Number(row.kid_count)) ? Number(row.kid_count) : 0,
});

const mapEntryRow = (row = {}) => ({
  id: row.id,
  date: row.date,
  mealSlot: row.meal_slot,
  mealId: row.meal_id,
  servingMultiplier: Number.isFinite(Number(row.serving_multiplier)) ? Number(row.serving_multiplier) : null,
});

const sortRecipes = (recipes = []) => (
  [...recipes].sort((left, right) => (
    `${left.mealSlot}-${left.name}`.localeCompare(`${right.mealSlot}-${right.name}`)
  ))
);

async function ensureShoppingProject(currentUserId) {
  let { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, created_at')
    .eq('name', SHOPPING_PROJECT_NAME)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const existing = (data || []).find((project) => project.user_id === currentUserId) || data?.[0] || null;
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
  const [week, setWeek] = useState(null);
  const [entries, setEntries] = useState([]);
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

  const entryMap = useMemo(() => (
    entries.reduce((accumulator, entry) => {
      accumulator[`${entry.date}:${entry.mealSlot}`] = entry;
      return accumulator;
    }, {})
  ), [entries]);

  const groceryDraft = useMemo(() => buildGroceryDraft({
    recipes,
    entries,
    adultCount: week?.adultCount ?? 1,
    kidCount: week?.kidCount ?? 0,
  }), [entries, recipes, week?.adultCount, week?.kidCount]);

  const loadRecipes = useCallback(async () => {
    const { data: mealRows, error: mealError } = await supabase
      .from('meal_library_meals')
      .select('id, external_id, source_pdf, suggested_day, meal_slot, name, ingredients_raw, how_to_make, estimated_kcal, image_ref, recipe_origin, created_at, updated_at')
      .order('meal_slot', { ascending: true })
      .order('name', { ascending: true });

    if (mealError) {
      throw mealError;
    }

    const mealIds = (mealRows || []).map((row) => row.id);
    let ingredientRows = [];
    if (mealIds.length > 0) {
      const ingredientsResult = await supabase
        .from('meal_library_ingredients')
        .select('id, meal_id, raw_text, ingredient_name, quantity_value, quantity_unit, notes, parse_confidence, created_at, updated_at')
        .in('meal_id', mealIds)
        .order('created_at', { ascending: true });

      if (ingredientsResult.error) {
        throw ingredientsResult.error;
      }

      ingredientRows = ingredientsResult.data || [];
    }

    const ingredientMap = ingredientRows.reduce((accumulator, row) => {
      if (!accumulator[row.meal_id]) accumulator[row.meal_id] = [];
      accumulator[row.meal_id].push(mapIngredientRow(row));
      return accumulator;
    }, {});

    setRecipes(sortRecipes((mealRows || []).map((row) => mapRecipeRow(row, ingredientMap[row.id] || splitIngredientList(row.ingredients_raw)))));
    return mealRows || [];
  }, []);

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

    const { error: insertError } = await supabase
      .from('meal_library_ingredients')
      .insert(ingredientRows);

    if (insertError) throw insertError;
  }, []);

  const importRowsIntoLibrary = useCallback(async (rows = [], { origin = 'imported' } = {}) => {
    if (!rows.length) return 0;

    const normalizedRows = rows.filter((row) => row?.name && row?.mealSlot);
    if (!normalizedRows.length) return 0;

    const externalIds = normalizedRows
      .map((row) => row.externalId)
      .filter(Boolean);

    let existingMap = new Map();
    if (externalIds.length > 0) {
      const { data: existingRows, error: existingError } = await supabase
        .from('meal_library_meals')
        .select('id, external_id')
        .in('external_id', externalIds);

      if (existingError) throw existingError;
      existingMap = new Map((existingRows || []).map((row) => [row.external_id, row.id]));
    }

    const inserts = buildMealLibraryRecords(normalizedRows, origin)
      .map((row) => ({
        user_id: currentUserId,
        ...row,
      }))
      .filter((row) => !row.external_id || !existingMap.has(row.external_id));

    if (inserts.length > 0) {
      const { error: insertError } = await supabase
        .from('meal_library_meals')
        .insert(inserts);
      if (insertError) throw insertError;
    }

    const refreshedMeals = await supabase
      .from('meal_library_meals')
      .select('id, external_id')
      .in('external_id', externalIds);

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

    await loadRecipes();
    setLastImportedCount(normalizedRows.length);
    return normalizedRows.length;
  }, [currentUserId, loadRecipes]);

  const seedStarterLibrary = useCallback(async () => {
    if (!canUseStarterLibrary) return 0;
    const starterRows = buildImportedMealRows(STARTER_MEAL_IMPORT_TEXT_BY_SLOT);
    return importRowsIntoLibrary(starterRows, { origin: 'imported' });
  }, [canUseStarterLibrary, importRowsIntoLibrary]);

  const ensureWeek = useCallback(async (weekStartDate) => {
    const normalizedWeekStart = formatDateKey(weekStartDate);
    const { data: existingWeek, error: existingError } = await supabase
      .from('meal_plan_weeks')
      .select('id, week_start_date, adult_count, kid_count')
      .eq('week_start_date', normalizedWeekStart)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingWeek) {
      setWeek(mapWeekRow(existingWeek));
      return existingWeek.id;
    }

    const { data: createdWeek, error: createError } = await supabase
      .from('meal_plan_weeks')
      .insert({
        user_id: currentUserId,
        week_start_date: normalizedWeekStart,
        adult_count: 1,
        kid_count: 0,
      })
      .select('id, week_start_date, adult_count, kid_count')
      .single();

    if (createError || !createdWeek) {
      throw createError || new Error('Unable to create meal planning week.');
    }

    setWeek(mapWeekRow(createdWeek));
    return createdWeek.id;
  }, [currentUserId]);

  const loadEntries = useCallback(async (weekId) => {
    const { data, error: entriesError } = await supabase
      .from('meal_plan_entries')
      .select('id, date, meal_slot, meal_id, serving_multiplier')
      .eq('week_id', weekId)
      .order('date', { ascending: true });

    if (entriesError) throw entriesError;
    setEntries((data || []).map(mapEntryRow));
  }, []);

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    setError('');

    try {
      const mealRows = await loadRecipes();
      if (mealRows.length === 0 && canUseStarterLibrary && !starterSeedAttemptedRef.current) {
        starterSeedAttemptedRef.current = true;
        await seedStarterLibrary();
      }

      const weekId = await ensureWeek(selectedWeekStart);
      await loadEntries(weekId);
    } catch (nextError) {
      if (
        isMissingRelationError(nextError, 'meal_library_meals')
        || isMissingRelationError(nextError, 'meal_plan_weeks')
        || isMissingRelationError(nextError, 'meal_plan_entries')
      ) {
        setError('Meal Planner needs the latest SQL migration before it can load.');
      } else {
        setError(nextError?.message || 'Unable to load Meal Planner right now.');
      }
    } finally {
      setLoading(false);
    }
  }, [canUseStarterLibrary, currentUserId, ensureWeek, loadEntries, loadRecipes, seedStarterLibrary, selectedWeekStart]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateWeekCounts = useCallback(async ({ adultCount, kidCount }) => {
    if (!week?.id) return;

    const nextAdultCount = Math.max(0, Number(adultCount || 0));
    const nextKidCount = Math.max(0, Number(kidCount || 0));

    setWeek((previous) => previous ? {
      ...previous,
      adultCount: nextAdultCount,
      kidCount: nextKidCount,
    } : previous);

    const { error: updateError } = await supabase
      .from('meal_plan_weeks')
      .update({
        adult_count: nextAdultCount,
        kid_count: nextKidCount,
      })
      .eq('id', week.id);

    if (updateError) {
      setError(updateError.message || 'Unable to update household counts right now.');
    }
  }, [week?.id]);

  const upsertMealEntry = useCallback(async ({ date, mealSlot, mealId, servingMultiplier = null }) => {
    if (!week?.id) return null;

    const payload = {
      week_id: week.id,
      date,
      meal_slot: mealSlot,
      meal_id: mealId,
      serving_multiplier: Number.isFinite(Number(servingMultiplier)) ? Number(servingMultiplier) : null,
    };

    const existingEntry = entries.find((entry) => entry.date === date && entry.mealSlot === mealSlot) || null;
    if (existingEntry) {
      const { data, error: updateError } = await supabase
        .from('meal_plan_entries')
        .update({
          meal_id: mealId,
          serving_multiplier: payload.serving_multiplier,
        })
        .eq('id', existingEntry.id)
        .select('id, date, meal_slot, meal_id, serving_multiplier')
        .single();

      if (updateError || !data) throw updateError || new Error('Unable to update planned meal.');

      setEntries((previous) => previous.map((entry) => entry.id === existingEntry.id ? mapEntryRow(data) : entry));
      return mapEntryRow(data);
    }

    const { data, error: insertError } = await supabase
      .from('meal_plan_entries')
      .insert(payload)
      .select('id, date, meal_slot, meal_id, serving_multiplier')
      .single();

    if (insertError || !data) throw insertError || new Error('Unable to save planned meal.');

    setEntries((previous) => [...previous, mapEntryRow(data)]);
    return mapEntryRow(data);
  }, [entries, week?.id]);

  const clearMealEntry = useCallback(async ({ date, mealSlot }) => {
    const existingEntry = entries.find((entry) => entry.date === date && entry.mealSlot === mealSlot);
    if (!existingEntry) return;

    const { error: deleteError } = await supabase
      .from('meal_plan_entries')
      .delete()
      .eq('id', existingEntry.id);

    if (deleteError) throw deleteError;

    setEntries((previous) => previous.filter((entry) => entry.id !== existingEntry.id));
  }, [entries]);

  const applyMealToDates = useCallback(async ({ dates = [], mealSlot, mealId, servingMultiplier = null }) => {
    for (const date of dates) {
      await upsertMealEntry({ date, mealSlot, mealId, servingMultiplier });
    }
  }, [upsertMealEntry]);

  const createRecipe = useCallback(async (recipeInput) => {
    setSaving(true);
    setError('');
    try {
      const ingredientLines = recipeInput.ingredientLines || splitIngredientList(recipeInput.ingredientsRaw || '');
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
      }], 'manual')[0];

      const { data, error: insertError } = await supabase
        .from('meal_library_meals')
        .insert({
          user_id: currentUserId,
          ...mealPayload,
        })
        .select('id')
        .single();

      if (insertError || !data) throw insertError || new Error('Unable to create recipe.');
      await replaceRecipeIngredients(data.id, ingredientLines);
      await loadRecipes();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to create recipe.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadRecipes, replaceRecipeIngredients]);

  const updateRecipe = useCallback(async (recipeId, recipeInput) => {
    setSaving(true);
    setError('');
    try {
      const ingredientLines = recipeInput.ingredientLines || splitIngredientList(recipeInput.ingredientsRaw || '');
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
      }], recipeInput.recipeOrigin || 'manual')[0];

      const { error: updateError } = await supabase
        .from('meal_library_meals')
        .update(mealPayload)
        .eq('id', recipeId);

      if (updateError) throw updateError;
      await replaceRecipeIngredients(recipeId, ingredientLines);
      await loadRecipes();
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
      await loadRecipes();
    } catch (nextError) {
      setError(nextError?.message || 'Unable to delete recipe.');
      throw nextError;
    } finally {
      setSaving(false);
    }
  }, [loadRecipes]);

  const confirmGroceryDraft = useCallback(async () => {
    if (!week?.id) return null;
    if (groceryDraft.length === 0) {
      throw new Error('Plan at least one meal before generating groceries.');
    }

    setSaving(true);
    setError('');

    try {
      const shoppingProject = await ensureShoppingProject(currentUserId);

      const { data: existingBatch, error: batchLookupError } = await supabase
        .from('meal_plan_grocery_batches')
        .select('id, shopping_project_id')
        .eq('week_id', week.id)
        .maybeSingle();

      if (batchLookupError) throw batchLookupError;

      let batchId = existingBatch?.id || '';
      if (!batchId) {
        const { data: createdBatch, error: createBatchError } = await supabase
          .from('meal_plan_grocery_batches')
          .insert({
            user_id: currentUserId,
            week_id: week.id,
            shopping_project_id: shoppingProject.id,
            status: 'approved',
          })
          .select('id')
          .single();

        if (createBatchError || !createdBatch) throw createBatchError || new Error('Unable to create grocery batch.');
        batchId = createdBatch.id;
      } else {
        const { error: updateBatchError } = await supabase
          .from('meal_plan_grocery_batches')
          .update({
            shopping_project_id: shoppingProject.id,
            status: 'approved',
          })
          .eq('id', batchId);

        if (updateBatchError) throw updateBatchError;
      }

      const { error: deleteExistingError } = await supabase
        .from('manual_todos')
        .delete()
        .eq('source_batch_id', batchId);

      if (deleteExistingError) throw deleteExistingError;

      const rows = groceryDraft.map((item) => ({
        user_id: currentUserId,
        project_id: shoppingProject.id,
        title: item.title,
        due_date: null,
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
  }, [currentUserId, groceryDraft, week?.id, week?.weekStartDate]);

  return {
    applyMealToDates,
    clearMealEntry,
    confirmGroceryDraft,
    canUseStarterLibrary,
    createRecipe,
    deleteRecipe,
    entries,
    entryMap,
    error,
    groceryDraft,
    importRowsIntoLibrary,
    lastApprovedCount,
    lastImportedCount,
    loading,
    recipes,
    recipesBySlot,
    reload,
    saving,
    seedStarterLibrary,
    selectedWeekStart,
    setSelectedWeekStart,
    updateRecipe,
    updateWeekCounts,
    upsertMealEntry,
    week,
    weekDays,
    duplicateRecipe,
    defaultServingMultiplier: getDefaultServingMultiplier({
      adultCount: week?.adultCount ?? 1,
      kidCount: week?.kidCount ?? 0,
    }),
  };
}
