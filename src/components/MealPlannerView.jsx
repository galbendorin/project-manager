import React, { useEffect, useMemo, useState } from 'react';
import { useMealPlannerData } from '../hooks/useMealPlannerData';
import { supabase } from '../lib/supabase';
import {
  buildNextDayCopyPrompt,
  formatDateKey,
  formatIngredientQuantity,
  getAudienceServingMultiplier,
  getMealAudienceLabel,
  getMealSlotLabel,
  getRecipeYieldModeLabel,
  parseRecipeImportText,
  summarizeRecipeIngredients,
} from '../utils/mealPlanner';
import { estimateRecipeNutritionFromStarterCatalog } from '../utils/mealCalorieCatalog';

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const AUDIENCE_OPTIONS = ['all', 'adults', 'kids'];
const INGREDIENT_UNIT_SUGGESTIONS = ['pcs', 'g', 'ml', 'tsp', 'tbsp', 'cup'];

const getAudiencePillClasses = (audience) => {
  if (audience === 'adults') {
    return 'bg-sky-50 text-sky-700';
  }
  if (audience === 'kids') {
    return 'bg-violet-50 text-violet-700';
  }
  return 'bg-emerald-50 text-emerald-700';
};

const IconBase = ({ children, className = '', viewBox = '0 0 24 24' }) => (
  <svg
    className={className}
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const Plus = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </IconBase>
);

const ChevronLeft = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="m15 18-6-6 6-6" />
  </IconBase>
);

const ChevronRight = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="m9 18 6-6-6-6" />
  </IconBase>
);

const Loader = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </IconBase>
);

const Copy = ({ className = '' }) => (
  <IconBase className={className}>
    <rect x="9" y="9" width="10" height="10" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </IconBase>
);

const Trash = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M4 7h16" />
    <path d="M10 11v5" />
    <path d="M14 11v5" />
    <path d="M6 7l1 11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-11" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </IconBase>
);

const Edit = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </IconBase>
);

const Calendar = ({ className = '' }) => (
  <IconBase className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </IconBase>
);

const Close = ({ className = '' }) => (
  <IconBase className={className}>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </IconBase>
);

const Search = ({ className = '' }) => (
  <IconBase className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </IconBase>
);

const DEFAULT_FORM_STATE = {
  id: '',
  name: '',
  mealSlot: 'breakfast',
  sourcePdf: '',
  suggestedDay: '',
  estimatedKcal: '',
  imageRef: '',
  howToMake: '',
  ingredientLines: [
    {
      ingredientName: '',
      quantityValue: '',
      quantityUnit: '',
      notes: '',
      estimatedKcal: '',
      manualKcal: '',
      kcalSource: '',
      kcalPer100: '',
      linkedFdcId: '',
      matchedFoodLabel: '',
    },
  ],
  yieldMode: 'flexible',
  batchYieldPortions: '',
  recipeOrigin: 'manual',
  externalId: '',
};

const compileIngredientRow = (row = {}) => {
  const ingredientName = String(row.ingredientName || '').trim();
  const quantityValue = String(row.quantityValue || '').trim();
  const quantityUnit = String(row.quantityUnit || '').trim();
  const notes = String(row.notes || '').trim();
  const rawText = [ingredientName, quantityValue, quantityUnit].filter(Boolean).join(' ').trim();
  return {
    rawText,
    ingredientName: ingredientName || rawText,
    quantityValue: quantityValue === '' ? null : Number(quantityValue),
    quantityUnit,
    notes,
    estimatedKcal: row.estimatedKcal === '' || row.estimatedKcal === null || row.estimatedKcal === undefined
      ? null
      : Number(row.estimatedKcal),
    manualKcal: row.manualKcal === '' || row.manualKcal === null || row.manualKcal === undefined
      ? null
      : Number(row.manualKcal),
    kcalSource: String(row.kcalSource || '').trim(),
    kcalPer100: row.kcalPer100 === '' || row.kcalPer100 === null || row.kcalPer100 === undefined
      ? null
      : Number(row.kcalPer100),
    linkedFdcId: row.linkedFdcId === '' || row.linkedFdcId === null || row.linkedFdcId === undefined
      ? null
      : Number(row.linkedFdcId),
    matchedFoodLabel: String(row.matchedFoodLabel || '').trim(),
    parseConfidence: ingredientName && quantityValue ? 1 : 0.6,
  };
};

const getIngredientDisplayKcal = (ingredient = {}) => {
  const manual = ingredient.manualKcal === '' || ingredient.manualKcal === null || ingredient.manualKcal === undefined
    ? null
    : Number(ingredient.manualKcal);
  if (Number.isFinite(manual)) return manual;
  const estimated = ingredient.estimatedKcal === '' || ingredient.estimatedKcal === null || ingredient.estimatedKcal === undefined
    ? null
    : Number(ingredient.estimatedKcal);
  return Number.isFinite(estimated) ? estimated : null;
};

const getKcalSourceBadgeLabel = (source = '') => {
  if (source === 'manual') return 'Manual';
  if (source === 'remembered') return 'Saved recipe';
  if (source === 'starter') return 'Starter catalog';
  if (source === 'cached') return 'Saved lookup';
  if (source === 'usda') return 'USDA lookup';
  return '';
};

const formatMacroTotal = (value) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return '0';
  if (Math.abs(next - Math.round(next)) < 0.05) return String(Math.round(next));
  return next.toFixed(1).replace(/\.0$/, '');
};

const formatWeekLabel = (weekDays = []) => {
  if (weekDays.length === 0) return 'This week';
  const start = weekDays[0].date;
  const end = weekDays[weekDays.length - 1].date;
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

const formatCarryoverDayLabel = (dateKey = '') => {
  if (!dateKey) return '';
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short' });
};

const buildRecipeFormState = (recipe) => {
  if (!recipe) return DEFAULT_FORM_STATE;
  return {
    id: recipe.id,
    name: recipe.name || '',
    mealSlot: recipe.mealSlot || 'breakfast',
    sourcePdf: recipe.sourcePdf || '',
    suggestedDay: recipe.suggestedDay || '',
    estimatedKcal: recipe.estimatedKcal ?? '',
    imageRef: recipe.imageRef || '',
    howToMake: recipe.howToMake || '',
    ingredientLines: (recipe.ingredients || []).map((ingredient) => ({
      ingredientName: ingredient.ingredientName || '',
      quantityValue: ingredient.quantityValue ?? '',
      quantityUnit: ingredient.quantityUnit || '',
      notes: ingredient.notes || '',
      estimatedKcal: ingredient.estimatedKcal ?? '',
      manualKcal: ingredient.manualKcal ?? '',
      kcalSource: ingredient.kcalSource || '',
      kcalPer100: ingredient.kcalPer100 ?? '',
      linkedFdcId: ingredient.linkedFdcId ?? '',
      matchedFoodLabel: ingredient.matchedFoodLabel || '',
    })).concat((recipe.ingredients || []).length === 0 ? [{
      ingredientName: '',
      quantityValue: '',
      quantityUnit: '',
      notes: '',
      estimatedKcal: '',
      manualKcal: '',
      kcalSource: '',
      kcalPer100: '',
      linkedFdcId: '',
      matchedFoodLabel: '',
    }] : []),
    yieldMode: recipe.yieldMode || 'flexible',
    batchYieldPortions: recipe.batchYieldPortions ?? '',
    recipeOrigin: recipe.recipeOrigin || 'manual',
    externalId: recipe.externalId || '',
  };
};

const fetchRecipeCalorieEstimate = async ({
  ingredientLines = [],
  yieldMode = 'flexible',
  batchYieldPortions = null,
}) => {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token || '';

  let response;
  try {
    response = await fetch('/api/meal-estimate-calories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        ingredientLines,
        yieldMode,
        batchYieldPortions,
      }),
    });
  } catch {
    const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    throw new Error(
      isLocal
        ? 'Local API is not running. Start `vercel dev --listen 3001` in a second terminal, then try again.'
        : 'Unable to estimate calories right now.'
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const fallbackMessage = isLocal
      ? 'Local calorie API did not respond. Check that `vercel dev --listen 3001` is running, then try again.'
      : 'Unable to estimate calories right now.';
    throw new Error(payload.error || fallbackMessage);
  }

  return payload;
};

function ModalShell({ children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close modal" />
      <div className={`relative max-h-[90vh] w-full overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}>
        {children}
      </div>
    </div>
  );
}

function RecipeFormModal({ initialState, onClose, onSave, saving }) {
  const [form, setForm] = useState(initialState);
  const [estimateState, setEstimateState] = useState({
    loading: false,
    error: '',
    result: null,
  });

  const clearEstimateFeedback = () => {
    setEstimateState((previous) => (
      previous.loading || (!previous.error && !previous.result)
        ? previous
        : { loading: false, error: '', result: null }
    ));
  };

  useEffect(() => {
    setForm(initialState);
    setEstimateState({
      loading: false,
      error: '',
      result: null,
    });
  }, [initialState]);

  const handleIngredientChange = (index, key, value) => {
    clearEstimateFeedback();
    setForm((previous) => ({
      ...previous,
      ingredientLines: previous.ingredientLines.map((line, lineIndex) => (
        lineIndex === index ? {
          ...line,
          [key]: value,
          ...(key === 'manualKcal'
            ? { kcalSource: value === '' ? (line.estimatedKcal ? line.kcalSource : '') : 'manual' }
            : {}),
          ...(key !== 'manualKcal'
            ? {
              estimatedKcal: ['ingredientName', 'quantityValue', 'quantityUnit', 'notes'].includes(key) ? '' : line.estimatedKcal,
              kcalSource: ['ingredientName', 'quantityValue', 'quantityUnit', 'notes'].includes(key) && line.manualKcal === '' ? '' : line.kcalSource,
              kcalPer100: ['ingredientName', 'quantityValue', 'quantityUnit', 'notes'].includes(key) ? '' : line.kcalPer100,
              linkedFdcId: ['ingredientName', 'quantityValue', 'quantityUnit', 'notes'].includes(key) ? '' : line.linkedFdcId,
              matchedFoodLabel: ['ingredientName', 'quantityValue', 'quantityUnit', 'notes'].includes(key) ? '' : line.matchedFoodLabel,
            }
            : {}),
        } : line
      )),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const ingredientLines = form.ingredientLines
      .map(compileIngredientRow)
      .filter((row) => row.rawText);

    await onSave({
      ...form,
      estimatedKcal: form.estimatedKcal === '' ? null : Number(form.estimatedKcal),
      batchYieldPortions: form.yieldMode === 'batch' && form.batchYieldPortions !== ''
        ? Number(form.batchYieldPortions)
        : null,
      ingredientLines,
      ingredientsRaw: ingredientLines.map((line) => line.rawText).join(', '),
    });
  };

  const handleEstimateCalories = async () => {
    const ingredientLines = form.ingredientLines
      .map(compileIngredientRow)
      .filter((row) => row.ingredientName && row.quantityValue !== null);

    if (ingredientLines.length === 0) {
      setEstimateState({
        loading: false,
        error: 'Add ingredient names and quantities before estimating calories.',
        result: null,
      });
      return;
    }

    setEstimateState({
      loading: true,
      error: '',
      result: null,
    });

    try {
      const result = await fetchRecipeCalorieEstimate({
        ingredientLines,
        yieldMode: form.yieldMode,
        batchYieldPortions: form.yieldMode === 'batch' && form.batchYieldPortions !== ''
          ? Number(form.batchYieldPortions)
          : null,
      });

      if (result.perServingKcal !== null) {
        setForm((previous) => ({
          ...previous,
          ingredientLines: previous.ingredientLines.map((line, index) => {
            const ingredientResult = result.ingredientResults?.[index];
            if (!ingredientResult) return line;
            const hasManualKcal = line.manualKcal !== '' && line.manualKcal !== null && line.manualKcal !== undefined;
            return {
              ...line,
              estimatedKcal: ingredientResult.estimatedKcal ?? '',
              kcalSource: hasManualKcal
                ? 'manual'
                : (ingredientResult.lookupSource || ''),
              kcalPer100: ingredientResult.kcalPer100 ?? '',
              linkedFdcId: ingredientResult.matchedFood?.fdcId ?? '',
              matchedFoodLabel: ingredientResult.matchedFood?.description || '',
            };
          }),
          estimatedKcal: String(result.perServingKcal),
        }));
      } else {
        setForm((previous) => ({
          ...previous,
          ingredientLines: previous.ingredientLines.map((line, index) => {
            const ingredientResult = result.ingredientResults?.[index];
            if (!ingredientResult) return line;
            const hasManualKcal = line.manualKcal !== '' && line.manualKcal !== null && line.manualKcal !== undefined;
            return {
              ...line,
              estimatedKcal: ingredientResult.estimatedKcal ?? '',
              kcalSource: hasManualKcal
                ? 'manual'
                : (ingredientResult.lookupSource || ''),
              kcalPer100: ingredientResult.kcalPer100 ?? '',
              linkedFdcId: ingredientResult.matchedFood?.fdcId ?? '',
              matchedFoodLabel: ingredientResult.matchedFood?.description || '',
            };
          }),
        }));
      }

      setEstimateState({
        loading: false,
        error: '',
        result,
      });
    } catch (error) {
      setEstimateState({
        loading: false,
        error: error?.message || 'Unable to estimate calories right now.',
        result: null,
      });
    }
  };

  const canEstimateCalories = form.ingredientLines.some((line) => (
    String(line.ingredientName || '').trim()
    && String(line.quantityValue || '').trim()
  ));
  const ingredientTotalKcal = form.ingredientLines.reduce((sum, ingredient) => {
    const next = getIngredientDisplayKcal(ingredient);
    return sum + (Number.isFinite(next) ? next : 0);
  }, 0);
  const ingredientKcalCount = form.ingredientLines.filter((ingredient) => Number.isFinite(getIngredientDisplayKcal(ingredient))).length;
  const ingredientDerivedPerServing = form.yieldMode === 'batch'
    ? (
      form.batchYieldPortions !== ''
      && Number(form.batchYieldPortions) > 0
        ? Math.round((ingredientTotalKcal / Number(form.batchYieldPortions)) * 10) / 10
        : null
    )
    : Math.round(ingredientTotalKcal * 10) / 10;

  return (
    <ModalShell onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">{form.id ? 'Edit recipe' : 'New recipe'}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">
              {form.id ? 'Update recipe' : 'Create recipe'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Recipe name</span>
            <input
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
              className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
              placeholder="Chicken stew with vegetables"
              required
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Meal slot</span>
            <select
              value={form.mealSlot}
              onChange={(event) => setForm((previous) => ({ ...previous, mealSlot: event.target.value }))}
              className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
            >
              {SLOT_ORDER.map((slot) => (
                <option key={slot} value={slot}>{getMealSlotLabel(slot)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Source / diet</span>
            <input
              value={form.sourcePdf}
              onChange={(event) => setForm((previous) => ({ ...previous, sourcePdf: event.target.value }))}
              className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
              placeholder="Dieta1 or Personal"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Suggested day</span>
            <select
              value={form.suggestedDay}
              onChange={(event) => setForm((previous) => ({ ...previous, suggestedDay: event.target.value }))}
              className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
            >
              <option value="">Any day</option>
              <option value="mon">Monday</option>
              <option value="tue">Tuesday</option>
              <option value="wed">Wednesday</option>
              <option value="thu">Thursday</option>
              <option value="fri">Friday</option>
              <option value="sat">Saturday</option>
              <option value="sun">Sunday</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Estimated kcal</span>
            <input
              type="number"
              min="0"
              value={form.estimatedKcal}
              onChange={(event) => setForm((previous) => ({ ...previous, estimatedKcal: event.target.value }))}
              className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
              placeholder="450"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleEstimateCalories}
                disabled={estimateState.loading || !canEstimateCalories}
                className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {estimateState.loading ? 'Estimating...' : 'Estimate from ingredients'}
              </button>
              <span className="text-xs text-slate-500">Fills this field from the ingredient rows below. You can still edit it manually.</span>
            </div>
            {estimateState.error ? (
              <div className="mt-3 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {estimateState.error}
              </div>
            ) : null}
            {estimateState.result ? (
              <div className="mt-3 rounded-[18px] border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-xs text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">
                    Total recipe: {estimateState.result.totalKcal} kcal
                  </span>
                  {estimateState.result.perServingKcal !== null ? (
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-emerald-700">
                      Saved here as {estimateState.result.perServingKcal} kcal per 1 serving
                    </span>
                  ) : null}
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">
                    {estimateState.result.resolvedIngredientCount}/{estimateState.result.totalIngredients} ingredients matched
                  </span>
                </div>
                {estimateState.result.warnings?.length ? (
                  <p className="mt-3 text-slate-600">{estimateState.result.warnings.join(' ')}</p>
                ) : null}
                {estimateState.result.unresolvedIngredients?.length ? (
                  <p className="mt-2 text-slate-600">
                    Review: {estimateState.result.unresolvedIngredients.map((item) => item.ingredientName).join(', ')}.
                  </p>
                ) : null}
                <p className="mt-2 text-slate-500">
                  Source: {estimateState.result.source}
                  {estimateState.result.usesDemoKey ? ' using the shared demo key.' : '.'}
                </p>
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Image ref</span>
            <input
              value={form.imageRef}
              onChange={(event) => setForm((previous) => ({ ...previous, imageRef: event.target.value }))}
              className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
              placeholder="D1_R1"
            />
          </label>
        </div>

        <div className="mt-4 rounded-[26px] border border-slate-200 bg-slate-50/70 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Recipe scaling</span>
              <select
                value={form.yieldMode}
                onChange={(event) => {
                  clearEstimateFeedback();
                  setForm((previous) => ({
                    ...previous,
                    yieldMode: event.target.value,
                    batchYieldPortions: event.target.value === 'batch' ? previous.batchYieldPortions : '',
                  }));
                }}
                className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
              >
                <option value="flexible">Flexible portions</option>
                <option value="batch">Batch recipe</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Batch yields</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={form.yieldMode === 'batch' ? form.batchYieldPortions : ''}
                onChange={(event) => {
                  clearEstimateFeedback();
                  setForm((previous) => ({ ...previous, batchYieldPortions: event.target.value }));
                }}
                className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                placeholder="4 portions"
                disabled={form.yieldMode !== 'batch'}
                required={form.yieldMode === 'batch'}
              />
            </label>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {form.yieldMode === 'batch'
              ? 'Batch recipes cook once and then reuse leftovers on later days before adding more ingredients to groceries.'
              : 'Flexible recipes scale ingredient quantities directly from the serving multiplier on each planned meal.'}
          </p>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">How to make</span>
          <textarea
            value={form.howToMake}
            onChange={(event) => setForm((previous) => ({ ...previous, howToMake: event.target.value }))}
            rows={4}
            className="pm-input mt-2 w-full rounded-3xl px-4 py-3 text-sm"
            placeholder="Short cooking method..."
          />
        </label>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Ingredients</p>
              <p className="mt-1 text-sm text-slate-500">Enter one structured line per ingredient. Supported units: {INGREDIENT_UNIT_SUGGESTIONS.join(', ')}.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearEstimateFeedback();
                setForm((previous) => ({
                  ...previous,
                  ingredientLines: [...previous.ingredientLines, {
                    ingredientName: '',
                    quantityValue: '',
                    quantityUnit: '',
                    notes: '',
                    estimatedKcal: '',
                    manualKcal: '',
                    kcalSource: '',
                    kcalPer100: '',
                    linkedFdcId: '',
                    matchedFoodLabel: '',
                  }],
                }));
              }}
              className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold"
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="h-3.5 w-3.5" />
                Add ingredient
              </span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
            {INGREDIENT_UNIT_SUGGESTIONS.map((unit) => (
              <span key={unit} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold">
                {unit}
              </span>
            ))}
            {ingredientKcalCount > 0 ? (
              <>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                  Ingredient total {Math.round(ingredientTotalKcal)} kcal
                </span>
                {ingredientDerivedPerServing !== null ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                    {Math.round(ingredientDerivedPerServing)} kcal per serving
                  </span>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-3 space-y-3">
            {form.ingredientLines.map((line, index) => (
              <div key={`ingredient-${index}`} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_110px_110px_150px_minmax(0,1.2fr)_auto]">
                  <input
                    value={line.ingredientName}
                    onChange={(event) => handleIngredientChange(index, 'ingredientName', event.target.value)}
                    className="pm-input rounded-2xl px-4 py-3 text-sm"
                    placeholder="Ingredient name"
                  />
                  <input
                    value={line.quantityValue}
                    onChange={(event) => handleIngredientChange(index, 'quantityValue', event.target.value)}
                    className="pm-input rounded-2xl px-4 py-3 text-sm"
                    placeholder="Qty"
                  />
                  <input
                    value={line.quantityUnit}
                    onChange={(event) => handleIngredientChange(index, 'quantityUnit', event.target.value)}
                    className="pm-input rounded-2xl px-4 py-3 text-sm"
                    placeholder="pcs / g / ml"
                    list={`ingredient-unit-suggestions-${index}`}
                  />
                  <datalist id={`ingredient-unit-suggestions-${index}`}>
                    {INGREDIENT_UNIT_SUGGESTIONS.map((unit) => (
                      <option key={unit} value={unit} />
                    ))}
                  </datalist>
                  <input
                    value={line.manualKcal !== '' && line.manualKcal !== null && line.manualKcal !== undefined
                      ? line.manualKcal
                      : (line.estimatedKcal ?? '')}
                    onChange={(event) => handleIngredientChange(index, 'manualKcal', event.target.value)}
                    className="pm-input rounded-2xl px-4 py-3 text-sm"
                    placeholder="kcal"
                    type="number"
                    min="0"
                  />
                  <input
                    value={line.notes}
                    onChange={(event) => handleIngredientChange(index, 'notes', event.target.value)}
                    className="pm-input rounded-2xl px-4 py-3 text-sm"
                    placeholder="Notes (optional)"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      clearEstimateFeedback();
                      setForm((previous) => ({
                        ...previous,
                        ingredientLines: previous.ingredientLines.filter((_, lineIndex) => lineIndex !== index),
                      }));
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:bg-slate-100"
                    aria-label="Remove ingredient"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">
                    Units: pcs, g, ml, tsp, tbsp, cup
                  </span>
                  {Number.isFinite(getIngredientDisplayKcal(line)) ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                      {Math.round(getIngredientDisplayKcal(line))} kcal
                    </span>
                  ) : null}
                  {line.manualKcal !== '' && line.manualKcal !== null && line.manualKcal !== undefined ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                      Manual
                    </span>
                  ) : getKcalSourceBadgeLabel(line.kcalSource) ? (
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                      {getKcalSourceBadgeLabel(line.kcalSource)}
                    </span>
                  ) : null}
                  {line.kcalPer100 ? (
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">
                      {Math.round(line.kcalPer100)} kcal / 100g
                    </span>
                  ) : null}
                  {line.matchedFoodLabel ? (
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600">
                      {line.matchedFoodLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save recipe'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ImportRecipesModal({ onClose, onImport, saving }) {
  const [mealSlot, setMealSlot] = useState('breakfast');
  const [rawText, setRawText] = useState('');
  const [errors, setErrors] = useState([]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const parsed = parseRecipeImportText(rawText, mealSlot);
    setErrors(parsed.errors);
    if (parsed.rows.length === 0) return;
    await onImport(parsed.rows);
  };

  return (
    <ModalShell onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">Import recipes</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">Paste recipe rows</h3>
            <p className="mt-2 text-sm text-slate-500">Use the same pipe-delimited row format you already shared.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Meal slot</span>
          <select
            value={mealSlot}
            onChange={(event) => setMealSlot(event.target.value)}
            className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
          >
            {SLOT_ORDER.map((slot) => (
              <option key={slot} value={slot}>{getMealSlotLabel(slot)}</option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Rows</span>
          <textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            rows={12}
            className="pm-input mt-2 w-full rounded-[24px] px-4 py-3 text-sm"
            placeholder="id|source_pdf|day|name|ingredients|how_to_make|estimated_kcal|image_ref"
          />
        </label>

        {errors.length > 0 ? (
          <div className="mt-4 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-semibold text-rose-700">Some rows could not be parsed</p>
            <ul className="mt-2 space-y-1 text-xs text-rose-700">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button type="submit" disabled={saving || !rawText.trim()} className="pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Importing…' : 'Import rows'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ChooseMoreDaysModal({ days, onClose, onConfirm }) {
  const [selectedDays, setSelectedDays] = useState(days.filter((day) => day.defaultSelected).map((day) => day.key));

  return (
    <ModalShell onClose={onClose}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">Copy forward</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">Choose more days</h3>
            <p className="mt-2 text-sm text-slate-500">Apply the same recipe to other days for this meal slot.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {days.map((day) => (
            <label key={day.key} className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3">
              <input
                type="checkbox"
                checked={selectedDays.includes(day.key)}
                onChange={(event) => setSelectedDays((previous) => (
                  event.target.checked
                    ? [...previous, day.key]
                    : previous.filter((value) => value !== day.key)
                ))}
              />
              <span className="text-sm font-medium text-slate-800">{day.dayLabel}</span>
            </label>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedDays)}
            className="pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white"
          >
            Apply to selected days
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function QuickPlanRecipeModal({ recipe, weekDays, initialDateKey, initialSlot, initialAudience = 'all', onClose, onAdd }) {
  const [dateKey, setDateKey] = useState(initialDateKey || weekDays?.[0]?.key || '');
  const [mealSlot, setMealSlot] = useState(initialSlot || recipe?.mealSlot || 'breakfast');
  const [audience, setAudience] = useState(initialAudience);

  useEffect(() => {
    setDateKey(initialDateKey || weekDays?.[0]?.key || '');
  }, [initialDateKey, weekDays]);

  useEffect(() => {
    setMealSlot(initialSlot || recipe?.mealSlot || 'breakfast');
  }, [initialSlot, recipe?.id, recipe?.mealSlot]);

  useEffect(() => {
    setAudience(initialAudience || 'all');
  }, [initialAudience]);

  if (!recipe) return null;

  return (
    <ModalShell onClose={onClose}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">Add to planner</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">{recipe.name}</h3>
            <p className="mt-2 text-sm text-slate-500">Pick a day, slot, and audience for this recipe. Any recipe can be used in any slot.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Day</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {weekDays.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setDateKey(day.key)}
                  className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                    dateKey === day.key
                      ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {day.dayLabel}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Slot</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SLOT_ORDER.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setMealSlot(slot)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    mealSlot === slot
                      ? 'bg-[var(--pm-accent)] text-white'
                      : 'border border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {getMealSlotLabel(slot)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Audience</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setAudience(option)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    audience === option
                      ? 'bg-[var(--pm-accent)] text-white'
                      : 'border border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {getMealAudienceLabel(option)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onAdd({ dateKey, mealSlot, audience })}
            className="pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white"
          >
            Add to planner
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function RecipePickerModal({ recipes, slot, audience = 'all', onAudienceChange, onClose, onPick }) {
  const [search, setSearch] = useState('');
  const [selectedMealFilters, setSelectedMealFilters] = useState([slot]);

  useEffect(() => {
    setSelectedMealFilters([slot]);
  }, [slot]);

  const toggleMealFilter = (nextSlot) => {
    setSelectedMealFilters((previous) => {
      if (previous.includes(nextSlot)) {
        const remaining = previous.filter((value) => value !== nextSlot);
        return remaining.length > 0 ? remaining : [slot];
      }
      return [...previous, nextSlot];
    });
  };

  const filteredRecipes = useMemo(() => (
    (recipes || [])
      .filter((recipe) => {
        if (selectedMealFilters.length > 0 && !selectedMealFilters.includes(recipe.mealSlot)) {
          return false;
        }
        const haystack = `${recipe.name} ${recipe.sourcePdf} ${summarizeRecipeIngredients(recipe, 4)} ${getMealSlotLabel(recipe.mealSlot)}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .sort((left, right) => (
        Number(right.mealSlot === slot) - Number(left.mealSlot === slot)
        || left.name.localeCompare(right.name)
      ))
  ), [recipes, search, selectedMealFilters, slot]);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">{getMealSlotLabel(slot)}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">Choose a recipe</h3>
            <p className="mt-2 text-sm text-slate-500">
              This meal will be planned for <span className="font-semibold text-slate-700">{getMealAudienceLabel(audience).toLowerCase()}</span>.
              Any recipe can be used here, and recipes already matching {getMealSlotLabel(slot).toLowerCase()} are shown first.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {AUDIENCE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onAudienceChange?.(option)}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                audience === option
                  ? 'bg-[var(--pm-accent)] text-white'
                  : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {getMealAudienceLabel(option)}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Recipe types to show</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedMealFilters([])}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                selectedMealFilters.length === 0
                  ? 'bg-[var(--pm-accent)] text-white'
                  : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              All
            </button>
            {SLOT_ORDER.map((filterSlot) => (
              <button
                key={filterSlot}
                type="button"
                onClick={() => toggleMealFilter(filterSlot)}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                  selectedMealFilters.includes(filterSlot)
                    ? 'bg-[var(--pm-accent)] text-white'
                    : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {getMealSlotLabel(filterSlot)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {selectedMealFilters.length === 0
              ? 'Showing recipes from every meal type.'
              : `Showing ${selectedMealFilters.map((value) => getMealSlotLabel(value).toLowerCase()).join(', ')} recipes.`}
          </p>
        </div>

        <div className="mt-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pm-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm"
              placeholder={`Search ${getMealSlotLabel(slot).toLowerCase()} recipes`}
            />
          </label>
        </div>

        {filteredRecipes.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onPick(recipe)}
                className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--pm-accent)] hover:shadow-[0_20px_40px_rgba(15,23,42,0.12)]"
              >
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    {getMealSlotLabel(recipe.mealSlot)}
                  </span>
                  {recipe.sourcePdf ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{recipe.sourcePdf}</span>
                  ) : null}
                  {recipe.suggestedDay ? (
                    <span className="rounded-full border border-[var(--pm-accent)]/20 bg-[var(--pm-accent-soft)] px-2.5 py-1 text-[var(--pm-accent-strong)]">
                      Suggested {recipe.suggestedDay.toUpperCase()}
                    </span>
                  ) : null}
                </div>
                <h4 className="mt-3 text-base font-semibold text-slate-950">{recipe.name}</h4>
                <p className="mt-2 text-sm text-slate-500">{summarizeRecipeIngredients(recipe, 4)}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {recipe.estimatedKcal ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">{recipe.estimatedKcal} kcal</span>
                  ) : null}
                  {recipe.yieldMode === 'batch' && recipe.batchYieldPortions ? (
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                      Batch {recipe.batchYieldPortions} portions
                    </span>
                  ) : null}
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                    {(recipe.ingredients || []).length} ingredients
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No recipes match the selected meal-type filters and search.
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function RecipeDetailModal({
  context,
  onClose,
  onDeleteRecipe,
  onDuplicateRecipe,
  onEditRecipe,
  onOpenPicker,
  onRemoveFromDay,
  onSaveEntryDetails,
}) {
  const recipe = context?.recipe;
  const audienceDefaultMultipliers = useMemo(() => ({
    all: getAudienceServingMultiplier({
      audience: 'all',
      adultCount: context?.adultCount ?? 1,
      kidCount: context?.kidCount ?? 0,
    }),
    adults: getAudienceServingMultiplier({
      audience: 'adults',
      adultCount: context?.adultCount ?? 1,
      kidCount: context?.kidCount ?? 0,
    }),
    kids: getAudienceServingMultiplier({
      audience: 'kids',
      adultCount: context?.adultCount ?? 1,
      kidCount: context?.kidCount ?? 0,
    }),
  }), [context?.adultCount, context?.kidCount]);
  const getDefaultMultiplierForAudience = (nextAudience) => (
    audienceDefaultMultipliers[nextAudience] ?? audienceDefaultMultipliers.all
  );
  const [audience, setAudience] = useState(context?.entry?.audience || 'all');
  const [servingMultiplier, setServingMultiplier] = useState(
    context?.entry?.servingMultiplier ?? getDefaultMultiplierForAudience(context?.entry?.audience || 'all')
  );

  useEffect(() => {
    const entryAudience = context?.entry?.audience || 'all';
    const defaultMultiplierForEntryAudience = audienceDefaultMultipliers[entryAudience] ?? audienceDefaultMultipliers.all;
    setServingMultiplier(context?.entry?.servingMultiplier ?? defaultMultiplierForEntryAudience);
    setAudience(context?.entry?.audience || 'all');
  }, [audienceDefaultMultipliers, context?.entry?.audience, context?.entry?.servingMultiplier, context?.recipe?.id]);

  if (!recipe) return null;

  const audienceDefaultMultiplier = getDefaultMultiplierForAudience(audience);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{getMealSlotLabel(recipe.mealSlot)}</span>
              {recipe.sourcePdf ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{recipe.sourcePdf}</span>
              ) : null}
              {recipe.yieldMode === 'batch' && recipe.batchYieldPortions ? (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700">
                  Batch {recipe.batchYieldPortions} portions
                </span>
              ) : null}
              {context?.entry ? (
                <span className={`rounded-full px-2.5 py-1 ${getAudiencePillClasses(audience)}`}>
                  {getMealAudienceLabel(audience)}
                </span>
              ) : null}
              {recipe.suggestedDay ? (
                <span className="rounded-full border border-[var(--pm-accent)]/20 bg-[var(--pm-accent-soft)] px-2.5 py-1 text-[var(--pm-accent-strong)]">
                  Suggested {recipe.suggestedDay.toUpperCase()}
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 text-3xl font-bold tracking-[-0.05em] text-slate-950">{recipe.name}</h3>
            {recipe.estimatedKcal ? (
              <p className="mt-2 text-sm text-slate-500">{recipe.estimatedKcal} kcal</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_320px]">
          <div>
            <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Ingredients</h4>
              <div className="mt-4 space-y-2.5">
                {(recipe.ingredients || []).map((ingredient) => (
                  <div key={`${recipe.id}-${ingredient.rawText}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{ingredient.ingredientName || ingredient.rawText}</p>
                      {ingredient.notes ? (
                        <p className="mt-1 text-xs text-slate-500">{ingredient.notes}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-slate-500">
                        {ingredient.quantityValue !== null ? `${formatIngredientQuantity(ingredient.quantityValue)} ${ingredient.quantityUnit}`.trim() : ingredient.rawText}
                      </div>
                      {Number.isFinite(getIngredientDisplayKcal(ingredient)) ? (
                        <div className="mt-1 text-xs font-semibold text-amber-700">
                          {Math.round(getIngredientDisplayKcal(ingredient))} kcal
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">How to make</h4>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {recipe.howToMake || 'No method saved yet.'}
              </p>
            </div>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Recipe scaling</h4>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {recipe.yieldMode === 'batch' && recipe.batchYieldPortions
                  ? `Batch recipe: one cook makes ${recipe.batchYieldPortions} portion${recipe.batchYieldPortions === 1 ? '' : 's'}, and the planner reuses leftovers later in the same week before adding more groceries.`
                  : `${getRecipeYieldModeLabel(recipe.yieldMode)}: ingredient quantities scale directly with the serving multiplier for this meal.`}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Actions</h4>
              <div className="mt-4 space-y-2">
                <button type="button" onClick={() => onEditRecipe(recipe)} className="pm-subtle-button flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                  <Edit className="h-4 w-4" />
                  Edit recipe
                </button>
                <button type="button" onClick={() => onDuplicateRecipe(recipe)} className="pm-subtle-button flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                  <Copy className="h-4 w-4" />
                  Duplicate recipe
                </button>
                {context?.entry ? (
                  <>
                    <button type="button" onClick={onOpenPicker} className="pm-subtle-button flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                      <Calendar className="h-4 w-4" />
                      Change recipe for this slot
                    </button>
                    <button type="button" onClick={onRemoveFromDay} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">
                      <Trash className="h-4 w-4" />
                      Remove from this day
                    </button>
                  </>
                ) : null}
                <button type="button" onClick={() => onDeleteRecipe(recipe)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  <Trash className="h-4 w-4" />
                  Delete recipe
                </button>
              </div>
            </div>

            {context?.entry ? (
              <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Meal details</h4>
                <p className="mt-2 text-sm text-slate-500">Choose who this meal is for and optionally override the default serving multiplier.</p>
                <label className="mt-4 block">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Audience</span>
                  <select
                    value={audience}
                    onChange={(event) => {
                      const nextAudience = event.target.value;
                      const previousDefault = getDefaultMultiplierForAudience(audience);
                      setAudience(nextAudience);
                      setServingMultiplier((previous) => {
                        const numericPrevious = Number(previous);
                        return Number.isFinite(numericPrevious) && numericPrevious !== previousDefault
                          ? previous
                          : getDefaultMultiplierForAudience(nextAudience);
                      });
                    }}
                    className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
                  >
                    {AUDIENCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{getMealAudienceLabel(option)}</option>
                    ))}
                  </select>
                </label>
                <h4 className="mt-4 text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Serving multiplier</h4>
                <p className="mt-2 text-sm text-slate-500">
                  Leave it aligned to the audience default, or override it for this one meal.
                  <span className="mt-1 block font-semibold text-slate-700">Default for {getMealAudienceLabel(audience).toLowerCase()}: {audienceDefaultMultiplier}x</span>
                </p>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={servingMultiplier}
                  onChange={(event) => setServingMultiplier(event.target.value)}
                  className="pm-input mt-4 w-full rounded-2xl px-4 py-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => onSaveEntryDetails({
                    audience,
                    servingMultiplier: (() => {
                      const numericMultiplier = Number(servingMultiplier);
                      return Number.isFinite(numericMultiplier) && numericMultiplier !== audienceDefaultMultiplier
                        ? numericMultiplier
                        : null;
                    })(),
                  })}
                  className="pm-toolbar-primary mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white"
                >
                  Save meal details
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function GroceryReviewModal({ draft, onApprove, onClose, saving, weekLabel }) {
  const [removedKeys, setRemovedKeys] = useState([]);

  useEffect(() => {
    setRemovedKeys([]);
  }, [draft]);

  const visibleDraft = useMemo(() => (
    draft.filter((item) => !removedKeys.includes(item.key))
  ), [draft, removedKeys]);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">Grocery review</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">Weekly shopping draft</h3>
            <p className="mt-2 text-sm text-slate-500">Review totals for {weekLabel} before they are added into Shopping List.</p>
            <p className="mt-2 text-sm text-slate-500">Batch recipes reuse carryover first, so only newly needed ingredients appear in this draft.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        {removedKeys.length > 0 ? (
          <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {removedKeys.length} ingredient{removedKeys.length === 1 ? '' : 's'} excluded from this shopping draft.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleDraft.map((item) => (
            <div key={item.key} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-base font-semibold text-slate-950">{item.title}</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.quantityValue !== null
                      ? `${formatIngredientQuantity(item.quantityValue)} ${item.quantityUnit}`.trim()
                      : item.rawText}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {item.occurrenceCount} use{item.occurrenceCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {item.sourceMeals.slice(0, 3).map((meal) => meal.recipeName).join(', ')}
                {item.sourceMeals.length > 3 ? ` +${item.sourceMeals.length - 3} more` : ''}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRemovedKeys((previous) => [...previous, item.key])}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Remove from this draft
                </button>
              </div>
            </div>
          ))}
        </div>

        {visibleDraft.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            There are no grocery lines left in this draft. Keep at least one ingredient if you want to send groceries to Shopping List.
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold">
            Close
          </button>
          <button type="button" onClick={() => onApprove(visibleDraft)} disabled={saving || visibleDraft.length === 0} className="pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Adding groceries…' : 'Add to Shopping List'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export default function MealPlannerView({ currentUserEmail, currentUserId }) {
  const {
    applyMealToDates,
    canUseStarterLibrary,
    clearMealEntry,
    confirmGroceryDraft,
    createRecipe,
    defaultServingMultiplier,
    deleteRecipe,
    duplicateRecipe,
    entryUsageById,
    entries,
    error,
    groceryDraft,
    importRowsIntoLibrary,
    lastApprovedCount,
    lastImportedCount,
    loading,
    recipes,
    saving,
    seedStarterLibrary,
    selectedWeekStart,
    setSelectedWeekStart,
    updateRecipe,
    updateWeekCounts,
    upsertMealEntry,
    week,
    weekDays,
  } = useMealPlannerData({ currentUserEmail, currentUserId });

  const [librarySlotFilter, setLibrarySlotFilter] = useState('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [pickerContext, setPickerContext] = useState(null);
  const [detailContext, setDetailContext] = useState(null);
  const [formState, setFormState] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [quickPlanContext, setQuickPlanContext] = useState(null);
  const [copyPrompt, setCopyPrompt] = useState(null);
  const [multiDayPrompt, setMultiDayPrompt] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (lastImportedCount > 0) {
      setStatusMessage(`Imported ${lastImportedCount} recipe${lastImportedCount === 1 ? '' : 's'} into your library.`);
    }
  }, [lastImportedCount]);

  useEffect(() => {
    if (lastApprovedCount > 0) {
      setStatusMessage(`Added ${lastApprovedCount} grocery item${lastApprovedCount === 1 ? '' : 's'} into Shopping List.`);
    }
  }, [lastApprovedCount]);

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const entriesBySlotKey = useMemo(() => (
    entries.reduce((accumulator, entry) => {
      const key = `${entry.date}:${entry.mealSlot}`;
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(entry);
      return accumulator;
    }, {})
  ), [entries]);

  const filteredLibraryRecipes = useMemo(() => (
    recipes.filter((recipe) => {
      if (librarySlotFilter !== 'all' && recipe.mealSlot !== librarySlotFilter) {
        return false;
      }
      const haystack = `${recipe.name} ${recipe.sourcePdf} ${summarizeRecipeIngredients(recipe, 5)}`.toLowerCase();
      return haystack.includes(librarySearch.toLowerCase());
    })
  ), [librarySearch, librarySlotFilter, recipes]);

  const weekLabel = useMemo(() => formatWeekLabel(weekDays), [weekDays]);
  const partnerServingMultiplier = Math.max(0, (week?.adultCount ?? 1.75) - 1);
  const recipeNutritionById = useMemo(() => (
    recipes.reduce((accumulator, recipe) => {
      accumulator[recipe.id] = estimateRecipeNutritionFromStarterCatalog(recipe);
      return accumulator;
    }, {})
  ), [recipes]);
  const dayCaloriesByKey = useMemo(() => (
    weekDays.reduce((accumulator, day) => {
      const total = entries
        .filter((entry) => entry.date === day.key)
        .reduce((sum, entry) => {
          const recipe = recipeMap.get(entry.mealId);
          if (!recipe?.estimatedKcal) return sum;
          return entry.audience === 'kids'
            ? sum
            : sum + recipe.estimatedKcal;
        }, 0);
      accumulator[day.key] = total;
      return accumulator;
    }, {})
  ), [entries, recipeMap, weekDays]);
  const dayNutritionByKey = useMemo(() => (
    weekDays.reduce((accumulator, day) => {
      const totals = entries
        .filter((entry) => entry.date === day.key)
        .reduce((sum, entry) => {
          if (entry.audience === 'kids') return sum;
          const nutrition = recipeNutritionById[entry.mealId];
          if (!nutrition) return sum;
          return {
            proteinG: sum.proteinG + (nutrition.proteinG || 0),
            carbsG: sum.carbsG + (nutrition.carbsG || 0),
            fiberG: sum.fiberG + (nutrition.fiberG || 0),
          };
        }, {
          proteinG: 0,
          carbsG: 0,
          fiberG: 0,
        });
      accumulator[day.key] = totals;
      return accumulator;
    }, {})
  ), [entries, recipeNutritionById, weekDays]);

  const handleMoveWeek = (offset) => {
    const date = new Date(selectedWeekStart);
    date.setDate(date.getDate() + (offset * 7));
    setSelectedWeekStart(formatDateKey(date));
    setCopyPrompt(null);
  };

  const getPreferredDayKeyForSlot = (mealSlot) => {
    const firstEmpty = weekDays.find((day) => (entriesBySlotKey[`${day.key}:${mealSlot}`] || []).length === 0);
    return firstEmpty?.key || weekDays[0]?.key || '';
  };

  const dismissCopyUiForEntry = (entryId) => {
    setCopyPrompt((previous) => (
      previous && previous.sourceEntryId === entryId
        ? null
        : previous
    ));
    setMultiDayPrompt((previous) => (
      previous && previous.sourceEntryId === entryId
        ? null
        : previous
    ));
  };

  const openPicker = (dateKey, mealSlot, options = {}) => {
    setPickerContext({
      dateKey,
      mealSlot,
      entryId: options.entryId || '',
      audience: options.audience || 'all',
    });
  };

  const openQuickPlan = (recipe) => {
    if (!recipe) return;
    const initialSlot = recipe.mealSlot || 'breakfast';
    setQuickPlanContext({
      recipe,
      initialSlot,
      initialDateKey: getPreferredDayKeyForSlot(initialSlot),
      initialAudience: 'all',
    });
  };

  const applyCopyToDates = async ({ recipeId, mealSlot, dates, sourceEntryId, audience }) => {
    const sourceEntry = entries.find((entry) => entry.id === sourceEntryId) || null;
    await applyMealToDates({
      dates,
      mealSlot,
      mealId: recipeId,
      servingMultiplier: sourceEntry?.servingMultiplier ?? null,
      audience: sourceEntry?.audience || audience || 'all',
    });
  };

  const handleRecipePicked = async (recipe) => {
    if (!pickerContext) return;
    try {
      const selectionContext = pickerContext;
      const savedEntry = await upsertMealEntry({
        entryId: selectionContext.entryId,
        date: selectionContext.dateKey,
        mealSlot: selectionContext.mealSlot,
        mealId: recipe.id,
        audience: selectionContext.audience,
        servingMultiplier: selectionContext.entryId
          ? (entries.find((entry) => entry.id === selectionContext.entryId)?.servingMultiplier ?? null)
          : null,
      });

      const nextCopyPrompt = buildNextDayCopyPrompt({
        weekDays,
        dateKey: selectionContext.dateKey,
        mealSlot: selectionContext.mealSlot,
        recipeId: recipe.id,
        sourceEntryId: savedEntry?.id || '',
        audience: selectionContext.audience,
      });

      setPickerContext(null);

      if (nextCopyPrompt) {
        setCopyPrompt(nextCopyPrompt);
      } else if (selectionContext.mealSlot !== 'snack') {
        setCopyPrompt(null);
      }
    } catch {
      // Error banner already set in the data hook.
    }
  };

  const handleCopyToTomorrow = async () => {
    if (!copyPrompt) return;
    const currentIndex = weekDays.findIndex((day) => day.key === copyPrompt.dateKey);
    const nextDay = weekDays[currentIndex + 1];
    if (!nextDay) {
      setCopyPrompt(null);
      return;
    }

    try {
      await applyCopyToDates({
        recipeId: copyPrompt.recipeId,
        mealSlot: copyPrompt.mealSlot,
        dates: [nextDay.key],
        sourceEntryId: copyPrompt.sourceEntryId,
        audience: copyPrompt.audience,
      });
      setCopyPrompt(null);
    } catch {
      // Error banner already set in the data hook.
    }
  };

  const handleChooseMoreDays = () => {
    if (!copyPrompt) return;
    const currentIndex = weekDays.findIndex((day) => day.key === copyPrompt.dateKey);
    const remainingDays = weekDays.slice(currentIndex + 1).map((day, index) => ({
      ...day,
      defaultSelected: index === 0,
    }));
    setMultiDayPrompt({
      ...copyPrompt,
      days: remainingDays,
    });
  };

  const handleCreateOrUpdateRecipe = async (nextFormState) => {
    if (nextFormState.id) {
      await updateRecipe(nextFormState.id, nextFormState);
    } else {
      await createRecipe(nextFormState);
    }
    setFormState(null);
  };

  const handleApproveGroceries = async (draftOverride = groceryDraft) => {
    try {
      await confirmGroceryDraft(draftOverride);
      setShowReviewModal(false);
    } catch {
      // Error is surfaced through the shared banner state.
    }
  };

  const handleQuickPlanRecipe = async ({ recipe, dateKey, mealSlot, audience }) => {
    try {
      const savedEntry = await upsertMealEntry({
        date: dateKey,
        mealSlot,
        mealId: recipe.id,
        audience,
        servingMultiplier: null,
      });

      const nextCopyPrompt = buildNextDayCopyPrompt({
        weekDays,
        dateKey,
        mealSlot,
        recipeId: recipe.id,
        sourceEntryId: savedEntry?.id || '',
        audience,
      });

      setQuickPlanContext(null);

      if (nextCopyPrompt) {
        setCopyPrompt(nextCopyPrompt);
      }
    } catch {
      // Error banner already set in the data hook.
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center px-4 py-10">
        <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm">
          <Loader className="h-4 w-4 animate-spin" />
          Loading Meal Planner...
        </div>
      </div>
    );
  }

  return (
    <div className="pm-shell-bg min-h-full px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="pm-home-panel rounded-[30px] p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="pm-kicker">Meal Planner</p>
              <h2 className="mt-2 text-3xl font-bold tracking-[-0.05em] text-slate-950">Plan the week and build shopping automatically</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Pick meals by day, reuse breakfasts, lunches, and dinners across the week, then review one aggregated grocery draft before it hits your shared Shopping List.
              </p>
              {!canUseStarterLibrary ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  This account starts with an empty recipe library so you can add or import your own meals.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {canUseStarterLibrary ? (
                <button type="button" onClick={() => void seedStarterLibrary()} className="pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold">
                  Load starter menu library
                </button>
              ) : null}
              <button type="button" onClick={() => setShowImportModal(true)} className="pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold">
                Import rows
              </button>
              <button type="button" onClick={() => setFormState(DEFAULT_FORM_STATE)} className="pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New recipe
                </span>
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {statusMessage ? (
            <div className="mt-5 rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {statusMessage}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_360px]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid gap-3 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-start">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleMoveWeek(-1)} className="pm-subtle-button rounded-full p-2.5">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                    {weekLabel}
                  </div>
                  <button type="button" onClick={() => handleMoveWeek(1)} className="pm-subtle-button rounded-full p-2.5">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 xl:justify-self-end">
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">You</span>
                    <span className="mt-1 block text-[15px] font-semibold text-slate-900">1.0</span>
                  </div>
                  <label className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Partner</span>
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      value={partnerServingMultiplier}
                      onChange={(event) => void updateWeekCounts({
                        adultCount: 1 + Math.max(0, Number(event.target.value || 0)),
                        kidCount: week?.kidCount ?? 0,
                      })}
                      className="mt-1 w-16 bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                    />
                  </label>
                  <label className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Kids</span>
                    <input
                      type="number"
                      min="0"
                      value={week?.kidCount ?? 0}
                      onChange={(event) => void updateWeekCounts({ adultCount: week?.adultCount ?? 1.75, kidCount: event.target.value })}
                      className="mt-1 w-16 bg-transparent text-[15px] font-semibold text-slate-900 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Household total {defaultServingMultiplier}x</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Adults total {week?.adultCount ?? 1.75}x</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Your calories use 1.0 serving only</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Kids count as 0.5 portion</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Daily P / C / F are approximate from recipe ingredients</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Breakfast, lunch, and dinner can copy forward</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewModal(true)}
                  className="pm-toolbar-primary shrink-0 rounded-full px-4 py-3 text-sm font-semibold text-white xl:self-start"
                >
                  Review groceries
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {weekDays.map((day) => (
                  <div key={day.key} className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{day.shortLabel}</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-950">{day.dayLabel}</h3>
                      </div>
                      <div className="shrink-0 rounded-[20px] border border-amber-200 bg-amber-50 px-3 py-2 text-right min-w-[180px]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700">Your total</p>
                        <p className="mt-1 text-sm font-semibold text-amber-800">
                          {dayCaloriesByKey[day.key] > 0 ? `${dayCaloriesByKey[day.key]} kcal` : 'No meals yet'}
                        </p>
                        {dayCaloriesByKey[day.key] > 0 ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-1.5 text-[11px] font-semibold">
                            <span className="rounded-full bg-white px-2 py-1 text-sky-700">
                              P {formatMacroTotal(dayNutritionByKey[day.key]?.proteinG)}g
                            </span>
                            <span className="rounded-full bg-white px-2 py-1 text-indigo-700">
                              C {formatMacroTotal(dayNutritionByKey[day.key]?.carbsG)}g
                            </span>
                            <span className="rounded-full bg-white px-2 py-1 text-emerald-700">
                              F {formatMacroTotal(dayNutritionByKey[day.key]?.fiberG)}g
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {SLOT_ORDER.map((slot) => {
                        const slotEntries = (entriesBySlotKey[`${day.key}:${slot}`] || [])
                          .map((entry) => ({
                            entry,
                            recipe: recipeMap.get(entry.mealId),
                          }))
                          .filter(({ recipe }) => Boolean(recipe));

                        return (
                          <div key={`${day.key}-${slot}`} className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{getMealSlotLabel(slot)}</p>
                              <div className="flex items-center gap-2">
                                {slotEntries.length > 1 ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                    {slotEntries.length} meals
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3 space-y-3">
                              {slotEntries.map(({ entry, recipe }) => {
                                const isCopyPromptVisible = Boolean(recipe) && copyPrompt?.sourceEntryId === entry.id;
                                const entryUsage = entryUsageById?.[entry.id] || null;
                                return (
                                  <div key={entry.id} className="rounded-[22px] border border-slate-200 bg-slate-50/60 px-3 py-3">
                                    <button
                                      type="button"
                                      onClick={() => setDetailContext({
                                        recipe,
                                        entry,
                                        dateKey: day.key,
                                        mealSlot: slot,
                                        defaultServingMultiplier,
                                        adultCount: week?.adultCount ?? 1,
                                        kidCount: week?.kidCount ?? 0,
                                      })}
                                      className="block w-full text-left transition hover:text-[var(--pm-accent-strong)]"
                                    >
                                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                                        <span className={`rounded-full px-2.5 py-1 ${getAudiencePillClasses(entry.audience)}`}>
                                          {getMealAudienceLabel(entry.audience)}
                                        </span>
                                        {entry.servingMultiplier ? (
                                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                            {entry.servingMultiplier}x
                                          </span>
                                        ) : null}
                                        {recipe.sourcePdf ? (
                                          <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 shadow-sm">
                                            {recipe.sourcePdf}
                                          </span>
                                        ) : null}
                                        {recipe.yieldMode === 'batch' && recipe.batchYieldPortions ? (
                                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                                            Batch {recipe.batchYieldPortions}
                                          </span>
                                        ) : null}
                                      </div>
                                      <h4 className="mt-3 text-base font-semibold text-slate-950">{recipe.name}</h4>
                                      <p className="mt-2 text-sm text-slate-500">{summarizeRecipeIngredients(recipe, 3)}</p>
                                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                                        {recipe.estimatedKcal ? (
                                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{recipe.estimatedKcal} kcal</span>
                                        ) : null}
                                      </div>
                                      {entryUsage?.usedCarryoverPortions > 0 ? (
                                        <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-700">
                                          Carryover {formatIngredientQuantity(entryUsage.usedCarryoverPortions)} portions
                                          {entryUsage.carryoverSourceDate ? ` from ${formatCarryoverDayLabel(entryUsage.carryoverSourceDate)}` : ''}
                                        </div>
                                      ) : null}
                                      {entryUsage?.usedCarryoverPortions === 0 && entryUsage?.createdCarryoverPortions > 0 ? (
                                        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                                          Carryover ready: {formatIngredientQuantity(entryUsage.createdCarryoverPortions)} portions
                                        </div>
                                      ) : null}
                                    </button>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => openPicker(day.key, slot, { entryId: entry.id, audience: entry.audience || 'all' })}
                                        className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold"
                                      >
                                        Change
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          dismissCopyUiForEntry(entry.id);
                                          await clearMealEntry({ entryId: entry.id });
                                        }}
                                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                      >
                                        Remove
                                      </button>
                                    </div>

                                    {isCopyPromptVisible ? (
                                      <div className="mt-3 rounded-[20px] border border-[var(--pm-accent)]/20 bg-[var(--pm-accent-soft)] px-3 py-3">
                                        <p className="text-sm font-semibold text-[var(--pm-accent-strong)]">Use the same for tomorrow?</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          <button type="button" onClick={() => void handleCopyToTomorrow()} className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-[var(--pm-accent-strong)] shadow-sm">
                                            Yes, add to next day
                                          </button>
                                          <button type="button" onClick={() => setCopyPrompt(null)} className="rounded-full border border-white/70 px-3 py-2 text-xs font-semibold text-[var(--pm-accent-strong)]">
                                            No
                                          </button>
                                          <button type="button" onClick={handleChooseMoreDays} className="rounded-full border border-white/70 px-3 py-2 text-xs font-semibold text-[var(--pm-accent-strong)]">
                                            Choose more days
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}

                              <button
                                type="button"
                                onClick={() => openPicker(day.key, slot, { audience: 'all' })}
                                className="flex w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-slate-300 px-3 py-4 text-sm font-semibold text-slate-500 transition hover:border-[var(--pm-accent)] hover:text-[var(--pm-accent-strong)]"
                              >
                                <Plus className="h-4 w-4" />
                                {slotEntries.length > 0 ? 'Add another meal' : 'Select recipe'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="pm-kicker">Recipe library</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Pick from imported or manual meals</h3>
                  </div>
                  <button type="button" onClick={() => setFormState(DEFAULT_FORM_STATE)} className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold">
                    Add recipe
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setLibrarySlotFilter('all')} className={`rounded-full px-3 py-2 text-xs font-semibold ${librarySlotFilter === 'all' ? 'bg-[var(--pm-accent)] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
                    All
                  </button>
                  {SLOT_ORDER.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setLibrarySlotFilter(slot)}
                      className={`rounded-full px-3 py-2 text-xs font-semibold ${librarySlotFilter === slot ? 'bg-[var(--pm-accent)] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                    >
                      {getMealSlotLabel(slot)}
                    </button>
                  ))}
                </div>

                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    className="pm-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm"
                    placeholder="Search recipe library"
                  />
                </label>

                <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto pr-1">
                  {filteredLibraryRecipes.map((recipe) => (
                    <div key={recipe.id} className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                      <button type="button" onClick={() => setDetailContext({
                        recipe,
                        entry: null,
                        dateKey: '',
                        mealSlot: recipe.mealSlot,
                        defaultServingMultiplier,
                        adultCount: week?.adultCount ?? 1,
                        kidCount: week?.kidCount ?? 0,
                      })} className="block w-full text-left">
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                          <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 shadow-sm">{getMealSlotLabel(recipe.mealSlot)}</span>
                          {recipe.sourcePdf ? (
                            <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 shadow-sm">{recipe.sourcePdf}</span>
                          ) : null}
                        </div>
                        <h4 className="mt-3 text-base font-semibold text-slate-950">{recipe.name}</h4>
                        <p className="mt-2 text-sm text-slate-500">{summarizeRecipeIngredients(recipe, 4)}</p>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {recipe.estimatedKcal ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{recipe.estimatedKcal} kcal</span>
                        ) : null}
                        {recipe.yieldMode === 'batch' && recipe.batchYieldPortions ? (
                          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                            Batch {recipe.batchYieldPortions} portions
                          </span>
                        ) : null}
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                          {recipe.recipeOrigin === 'manual' ? 'Manual' : 'Imported'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => openQuickPlan(recipe)} className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold">Add to week</button>
                        <button type="button" onClick={() => setFormState(buildRecipeFormState(recipe))} className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold">Edit</button>
                        <button type="button" onClick={() => void duplicateRecipe(recipe)} className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold">Duplicate</button>
                        <button type="button" onClick={() => void deleteRecipe(recipe.id)} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="pm-kicker">Shopping generation</p>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Review before adding groceries</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  The planner aggregates ingredients across the whole week, including repeated meals like oats on multiple days.
                </p>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                    <span>Planned slots</span>
                    <span className="font-semibold text-slate-900">{entries.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                    <span>Draft grocery lines</span>
                    <span className="font-semibold text-slate-900">{groceryDraft.length}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setShowReviewModal(true)} className="pm-toolbar-primary mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white">
                  Review groceries
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {pickerContext ? (
        <RecipePickerModal
          recipes={recipes}
          slot={pickerContext.mealSlot}
          audience={pickerContext.audience || 'all'}
          onAudienceChange={(audience) => setPickerContext((previous) => (
            previous ? { ...previous, audience } : previous
          ))}
          onClose={() => setPickerContext(null)}
          onPick={(recipe) => void handleRecipePicked(recipe)}
        />
      ) : null}

      {quickPlanContext ? (
        <QuickPlanRecipeModal
          recipe={quickPlanContext.recipe}
          weekDays={weekDays}
          initialDateKey={quickPlanContext.initialDateKey}
          initialSlot={quickPlanContext.initialSlot}
          initialAudience={quickPlanContext.initialAudience}
          onClose={() => setQuickPlanContext(null)}
          onAdd={({ dateKey, mealSlot, audience }) => void handleQuickPlanRecipe({
            recipe: quickPlanContext.recipe,
            dateKey,
            mealSlot,
            audience,
          })}
        />
      ) : null}

      {detailContext ? (
        <RecipeDetailModal
          context={detailContext}
          onClose={() => setDetailContext(null)}
          onDeleteRecipe={async (recipe) => {
            try {
              await deleteRecipe(recipe.id);
              setDetailContext(null);
            } catch {
              // Error banner already set in the data hook.
            }
          }}
          onDuplicateRecipe={async (recipe) => {
            try {
              await duplicateRecipe(recipe);
            } catch {
              // Error banner already set in the data hook.
            }
          }}
          onEditRecipe={(recipe) => {
            setDetailContext(null);
            setFormState(buildRecipeFormState(recipe));
          }}
          onOpenPicker={() => {
            setDetailContext(null);
            setPickerContext({
              dateKey: detailContext.dateKey,
              mealSlot: detailContext.mealSlot,
              entryId: detailContext.entry?.id || '',
              audience: detailContext.entry?.audience || 'all',
            });
          }}
          onRemoveFromDay={async () => {
            try {
              dismissCopyUiForEntry(detailContext.entry?.id);
              await clearMealEntry({ entryId: detailContext.entry?.id || '' });
              setDetailContext(null);
            } catch {
              // Error banner already set in the data hook.
            }
          }}
          onSaveEntryDetails={async ({ audience, servingMultiplier }) => {
            try {
              await upsertMealEntry({
                entryId: detailContext.entry?.id || '',
                date: detailContext.dateKey,
                mealSlot: detailContext.mealSlot,
                mealId: detailContext.recipe.id,
                audience,
                servingMultiplier,
                entryPosition: detailContext.entry?.entryPosition ?? null,
              });
              setDetailContext((previous) => previous ? {
                ...previous,
                entry: {
                  ...previous.entry,
                  audience,
                  servingMultiplier,
                },
              } : previous);
              setDetailContext(null);
            } catch {
              // Error banner already set in the data hook.
            }
          }}
        />
      ) : null}

      {formState ? (
        <RecipeFormModal
          initialState={formState}
          onClose={() => setFormState(null)}
          onSave={async (nextState) => {
            try {
              await handleCreateOrUpdateRecipe(nextState);
            } catch {
              // Error banner already set in the data hook.
            }
          }}
          saving={saving}
        />
      ) : null}

      {showImportModal ? (
        <ImportRecipesModal
          onClose={() => setShowImportModal(false)}
          onImport={async (rows) => {
            try {
              await importRowsIntoLibrary(rows, { origin: 'imported' });
              setShowImportModal(false);
            } catch {
              // Error banner already set in the data hook.
            }
          }}
          saving={saving}
        />
      ) : null}

      {multiDayPrompt ? (
        <ChooseMoreDaysModal
          days={multiDayPrompt.days}
          onClose={() => setMultiDayPrompt(null)}
          onConfirm={async (selectedDays) => {
            try {
              await applyCopyToDates({
                recipeId: multiDayPrompt.recipeId,
                mealSlot: multiDayPrompt.mealSlot,
                dates: selectedDays,
                sourceEntryId: multiDayPrompt.sourceEntryId,
                audience: multiDayPrompt.audience,
              });
              setMultiDayPrompt(null);
              setCopyPrompt(null);
            } catch {
              // Error banner already set in the data hook.
            }
          }}
        />
      ) : null}

      {showReviewModal ? (
        <GroceryReviewModal
          draft={groceryDraft}
          onApprove={(draftOverride) => void handleApproveGroceries(draftOverride)}
          onClose={() => setShowReviewModal(false)}
          saving={saving}
          weekLabel={weekLabel}
        />
      ) : null}
    </div>
  );
}
