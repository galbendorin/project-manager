import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMealPlannerData } from '../hooks/useMealPlannerData';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { supabase } from '../lib/supabase';
import { formatSharedActorLabel } from '../utils/shoppingListViewState';
import {
  buildNextDayCopyPrompt,
  formatDateKey,
  formatIngredientQuantity,
  getAudienceServingMultiplier,
  getMealAudienceLabel,
  getMealSlotLabel,
  getRecipeYieldModeLabel,
  parsePastedRecipeText,
  parseRecipeImportText,
  summarizeRecipeIngredients,
} from '../utils/mealPlanner';
import { estimateRecipeNutritionFromStarterCatalog } from '../utils/mealCalorieCatalog';

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const AUDIENCE_OPTIONS = ['all', 'adults', 'kids'];
const INGREDIENT_UNIT_SUGGESTIONS = ['pcs', 'g', 'ml', 'tsp', 'tbsp', 'cup'];
const MOBILE_LIBRARY_INITIAL_COUNT = 8;
const DESKTOP_LIBRARY_INITIAL_COUNT = 8;
const PICKER_INITIAL_COUNT = 18;
const PERSONAL_DAILY_TARGETS = {
  proteinG: 77,
  fatG: 62,
  carbsG: 233,
  fiberG: 30,
  caloriesFor64KgKcal: 1485,
};
const RECIPE_AI_CLEANUP_PROMPT = `Convert the recipe below into the exact PM Workspace Meal Planner format.

Return only the cleaned recipe. Do not add commentary.

Format:
Recipe name:
Meal slot: breakfast | lunch | dinner | snack
Suggested day:
Yield portions:
Calories per serving:
Ingredients:
- ingredient name | quantity | unit | notes
Method:

Rules:
- Use one ingredient per line.
- Use simple units only: g, ml, tsp, tbsp, cup, pcs, slice, slices, clove, cloves, block, tin, can, bunch, head, small, medium, large.
- Put alternatives in notes, not as a second grocery row.
- Put preparation words in notes, for example skinless, boneless, chopped, leaves separated, from a tin.
- If a quantity is not clear, leave quantity and unit blank rather than inventing.
- If calories are not provided by the source, write unknown.
- Keep the method short and practical.

Recipe to clean:
<<<PASTE RECIPE HERE>>>`;

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

const NEW_RECIPE_DRAFT_STORAGE_KEY = 'pmworkspace.mealPlanner.newRecipeDraft.v1';

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

const createIngredientFormLine = (ingredient = {}) => ({
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
});

const hasRecipeDraftContent = (formState = {}) => {
  const textFields = [
    formState.name,
    formState.sourcePdf,
    formState.suggestedDay,
    formState.estimatedKcal,
    formState.imageRef,
    formState.howToMake,
    formState.batchYieldPortions,
  ];
  if (textFields.some((value) => String(value || '').trim())) return true;
  return Array.isArray(formState.ingredientLines) && formState.ingredientLines.some((line) => (
    String(line?.ingredientName || '').trim()
    || String(line?.quantityValue || '').trim()
    || String(line?.quantityUnit || '').trim()
    || String(line?.notes || '').trim()
    || String(line?.manualKcal || '').trim()
    || String(line?.estimatedKcal || '').trim()
  ));
};

const normalizeDraftRecipeFormState = (formState = {}) => ({
  ...DEFAULT_FORM_STATE,
  ...formState,
  id: '',
  recipeOrigin: 'manual',
  ingredientLines: Array.isArray(formState.ingredientLines) && formState.ingredientLines.length > 0
    ? formState.ingredientLines.map(createIngredientFormLine)
    : DEFAULT_FORM_STATE.ingredientLines.map(createIngredientFormLine),
});

const clearNewRecipeDraft = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(NEW_RECIPE_DRAFT_STORAGE_KEY);
  } catch {
    // Session storage may be unavailable in private or restricted browser modes.
  }
};

const readNewRecipeDraft = () => {
  if (typeof window === 'undefined') return null;
  try {
    const rawDraft = window.sessionStorage.getItem(NEW_RECIPE_DRAFT_STORAGE_KEY);
    if (!rawDraft) return null;
    const parsedDraft = JSON.parse(rawDraft);
    const formState = normalizeDraftRecipeFormState(parsedDraft?.formState || {});
    if (!hasRecipeDraftContent(formState)) return null;
    return {
      formState,
      quickPasteText: String(parsedDraft?.quickPasteText || ''),
      quickPasteMessage: String(parsedDraft?.quickPasteMessage || ''),
      savedAt: parsedDraft?.savedAt || null,
    };
  } catch {
    return null;
  }
};

const writeNewRecipeDraft = ({ formState, quickPasteText = '', quickPasteMessage = '' } = {}) => {
  if (typeof window === 'undefined') return;
  if (formState?.id) return;
  if (!hasRecipeDraftContent(formState) && !String(quickPasteText || '').trim()) {
    clearNewRecipeDraft();
    return;
  }
  try {
    window.sessionStorage.setItem(NEW_RECIPE_DRAFT_STORAGE_KEY, JSON.stringify({
      formState: normalizeDraftRecipeFormState(formState),
      quickPasteText,
      quickPasteMessage,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // Ignore storage quota or restricted-mode failures; the user can still save normally.
  }
};

const buildRecipeFormModalStart = (initialState = DEFAULT_FORM_STATE) => {
  if (initialState?.id) {
    return {
      formState: initialState,
      quickPasteText: '',
      quickPasteMessage: '',
      draftRestored: false,
    };
  }

  const draft = readNewRecipeDraft();
  if (!draft) {
    return {
      formState: initialState,
      quickPasteText: '',
      quickPasteMessage: '',
      draftRestored: false,
    };
  }

  return {
    formState: {
      ...initialState,
      ...draft.formState,
    },
    quickPasteText: draft.quickPasteText,
    quickPasteMessage: draft.quickPasteMessage || 'Unsaved recipe draft restored.',
    draftRestored: true,
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

const createEmptyNutritionTotals = () => ({
  proteinG: 0,
  carbsG: 0,
  fiberG: 0,
});

const parsePlannerNumberInput = (value) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const next = Number(normalized);
  return Number.isFinite(next) ? Math.max(0, next) : null;
};

const formatPlannerNumberInput = (value) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return '';
  if (Math.abs(next - Math.round(next)) < 0.001) return String(Math.round(next));
  return String(next);
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

const formatCarryoverTargetDayLabel = (dateKey = '') => {
  if (!dateKey) return '';
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const getDisplayedNutritionMultiplier = (entry, entryUsage) => {
  if (!entry || entry.audience === 'kids') return 0;
  if (entry.entryKind === 'carryover') {
    return entryUsage?.carryoverStatus === 'active'
      ? Number(entryUsage?.carryoverPortions || 0)
      : 0;
  }
  return 1;
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
  const isMobile = useMediaQuery('(max-width: 768px)');

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 z-[90] flex justify-center bg-slate-950/40 ${isMobile ? 'items-end px-0 py-0' : 'items-center px-4 py-6'}`}>
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-hidden="true" tabIndex={-1} />
      <div
        className={`relative w-full overflow-y-auto border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] ${
          isMobile
            ? 'max-h-[94dvh] rounded-t-[28px] rounded-b-none'
            : `max-h-[90vh] rounded-[28px] ${wide ? 'max-w-5xl' : 'max-w-2xl'}`
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function RecipeFormModal({ initialState, onClose, onSave, saving }) {
  const initialModalStateRef = useRef(null);
  if (!initialModalStateRef.current) {
    initialModalStateRef.current = buildRecipeFormModalStart(initialState);
  }

  const [form, setForm] = useState(initialModalStateRef.current.formState);
  const [quickPasteText, setQuickPasteText] = useState(initialModalStateRef.current.quickPasteText);
  const [quickPasteOpen, setQuickPasteOpen] = useState(!initialState?.id);
  const [quickPasteMessage, setQuickPasteMessage] = useState(initialModalStateRef.current.quickPasteMessage);
  const [draftRestored, setDraftRestored] = useState(initialModalStateRef.current.draftRestored);
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
    const nextStart = buildRecipeFormModalStart(initialState);
    setForm(nextStart.formState);
    setQuickPasteText(nextStart.quickPasteText);
    setQuickPasteOpen(!initialState?.id);
    setQuickPasteMessage(nextStart.quickPasteMessage);
    setDraftRestored(nextStart.draftRestored);
    setEstimateState({
      loading: false,
      error: '',
      result: null,
    });
  }, [initialState]);

  useEffect(() => {
    if (form.id) return;
    writeNewRecipeDraft({
      formState: form,
      quickPasteText,
      quickPasteMessage,
    });
  }, [form, quickPasteText, quickPasteMessage]);

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

    try {
      await onSave({
        ...form,
        estimatedKcal: form.estimatedKcal === '' ? null : Number(form.estimatedKcal),
        batchYieldPortions: form.yieldMode === 'batch' && form.batchYieldPortions !== ''
          ? Number(form.batchYieldPortions)
          : null,
        ingredientLines,
        ingredientsRaw: ingredientLines.map((line) => line.rawText).join(', '),
      });
      if (!form.id) {
        clearNewRecipeDraft();
      }
    } catch {
      // Error banner already set in the data hook.
    }
  };

  const applyCalorieEstimate = async (targetForm = form, { replaceForm = false } = {}) => {
    const compiledRows = targetForm.ingredientLines.map(compileIngredientRow);
    const estimationIndexes = [];
    const ingredientLines = compiledRows.filter((row, index) => {
      const canEstimate = row.ingredientName && row.quantityValue !== null && Number.isFinite(row.quantityValue);
      if (canEstimate) estimationIndexes.push(index);
      return canEstimate;
    });

    if (ingredientLines.length === 0) {
      if (replaceForm) {
        setForm(targetForm);
      }
      setEstimateState({
        loading: false,
        error: 'Add ingredient names and quantities before estimating calories.',
        result: null,
      });
      return null;
    }

    setEstimateState({
      loading: true,
      error: '',
      result: null,
    });

    try {
      const result = await fetchRecipeCalorieEstimate({
        ingredientLines,
        yieldMode: targetForm.yieldMode,
        batchYieldPortions: targetForm.yieldMode === 'batch' && targetForm.batchYieldPortions !== ''
          ? Number(targetForm.batchYieldPortions)
          : null,
      });

      const ingredientResultByFormIndex = new Map();
      estimationIndexes.forEach((formIndex, resultIndex) => {
        ingredientResultByFormIndex.set(formIndex, result.ingredientResults?.[resultIndex]);
      });

      setForm((previous) => {
        const baseForm = replaceForm ? targetForm : previous;
        return {
          ...baseForm,
          ingredientLines: baseForm.ingredientLines.map((line, index) => {
            const ingredientResult = ingredientResultByFormIndex.get(index);
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
          ...(result.perServingKcal !== null ? { estimatedKcal: String(result.perServingKcal) } : {}),
        };
      });

      setEstimateState({
        loading: false,
        error: '',
        result,
      });
      return result;
    } catch (error) {
      if (replaceForm) {
        setForm(targetForm);
      }
      setEstimateState({
        loading: false,
        error: error?.message || 'Unable to estimate calories right now.',
        result: null,
      });
      return null;
    }
  };

  const handleEstimateCalories = async () => {
    await applyCalorieEstimate(form);
  };

  const handleQuickPasteRecipe = async () => {
    const rawText = quickPasteText.trim();
    if (!rawText) return;

    const parsed = parsePastedRecipeText(rawText, form.mealSlot);
    const parsedIngredientLines = parsed.ingredientLines.map(createIngredientFormLine);
    const nextForm = {
      ...form,
      name: parsed.name || form.name,
      mealSlot: parsed.mealSlot || form.mealSlot,
      sourcePdf: parsed.sourcePdf || form.sourcePdf,
      suggestedDay: parsed.suggestedDay || form.suggestedDay,
      estimatedKcal: parsed.estimatedKcal || form.estimatedKcal,
      imageRef: parsed.imageRef || form.imageRef,
      howToMake: parsed.howToMake || form.howToMake,
      yieldMode: parsed.yieldMode || form.yieldMode,
      batchYieldPortions: parsed.yieldMode === 'batch'
        ? parsed.batchYieldPortions
        : form.batchYieldPortions,
      ingredientLines: parsedIngredientLines.length > 0 ? parsedIngredientLines : form.ingredientLines,
    };

    const parsedMessage = parsed.warnings.length > 0
      ? `Parsed ${parsedIngredientLines.length} ingredient${parsedIngredientLines.length === 1 ? '' : 's'} with ${parsed.warnings.length} thing${parsed.warnings.length === 1 ? '' : 's'} to review.`
      : `Parsed ${parsedIngredientLines.length} ingredient${parsedIngredientLines.length === 1 ? '' : 's'}. Review, adjust if needed, then save.`;
    setQuickPasteMessage(parsedMessage);
    setDraftRestored(false);
    writeNewRecipeDraft({
      formState: nextForm,
      quickPasteText: rawText,
      quickPasteMessage: parsedMessage,
    });

    const result = await applyCalorieEstimate(nextForm, { replaceForm: true });
    if (result) {
      setQuickPasteMessage(`${parsedMessage} Calories checked against ${result.resolvedIngredientCount}/${result.totalIngredients} matched ingredient${result.totalIngredients === 1 ? '' : 's'}.`);
    }
  };

  const handleCopyAiCleanupPrompt = async () => {
    try {
      await navigator.clipboard.writeText(RECIPE_AI_CLEANUP_PROMPT);
      setQuickPasteMessage('AI cleanup prompt copied. Paste it into ChatGPT, Claude, or Gemini with the recipe, then paste the cleaned result back here.');
    } catch {
      setQuickPasteMessage('Could not copy the AI prompt automatically. I can still share the prompt text with you.');
    }
  };

  const handleDiscardDraft = () => {
    clearNewRecipeDraft();
    setForm(initialState);
    setQuickPasteText('');
    setQuickPasteMessage('');
    setDraftRestored(false);
    clearEstimateFeedback();
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
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        {draftRestored && !form.id ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Unsaved recipe draft restored.</span>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              Discard draft
            </button>
          </div>
        ) : null}

        <div className="mt-5 rounded-[26px] border border-sky-100 bg-sky-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="pm-kicker text-sky-700">Quick paste</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">Paste a recipe from anywhere and let the app fill the form.</p>
              <p className="mt-1 text-xs text-slate-500">
                No strict format needed. The app parses locally, then estimates nutrition from saved ingredient memory and lookups.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuickPasteOpen((previous) => !previous)}
              className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold"
            >
              {quickPasteOpen ? 'Hide paste box' : 'Paste recipe'}
            </button>
          </div>

          {quickPasteOpen ? (
            <div className="mt-4">
              <textarea
                value={quickPasteText}
                onChange={(event) => {
                  setQuickPasteText(event.target.value);
                  setQuickPasteMessage('');
                }}
                rows={7}
                className="pm-input w-full rounded-[24px] px-4 py-3 text-sm"
                placeholder={`Chicken rice bowl
Serves 4
Ingredients:
- chicken breast 600g
- basmati rice 240g
- olive oil 10 ml
Method: cook rice, grill chicken, combine.`}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleQuickPasteRecipe}
                  disabled={!quickPasteText.trim() || estimateState.loading}
                  className="pm-toolbar-primary rounded-full px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {estimateState.loading ? 'Parsing and estimating...' : 'Parse and estimate'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuickPasteText('');
                    setQuickPasteMessage('');
                  }}
                  className="pm-subtle-button rounded-full px-4 py-2.5 text-xs font-semibold"
                >
                  Clear paste
                </button>
                <button
                  type="button"
                  onClick={handleCopyAiCleanupPrompt}
                  className="pm-subtle-button rounded-full px-4 py-2.5 text-xs font-semibold"
                >
                  Copy AI cleanup prompt
                </button>
                <span className="text-xs text-slate-500">You can still edit every field before saving.</span>
              </div>
              {quickPasteMessage ? (
                <div className="mt-3 rounded-[18px] border border-sky-200 bg-white/80 px-3 py-2 text-xs font-semibold text-sky-800">
                  {quickPasteMessage}
                </div>
              ) : null}
            </div>
          ) : null}
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
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
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
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
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
  const [selectedDateKeys, setSelectedDateKeys] = useState(() => [initialDateKey || weekDays?.[0]?.key || ''].filter(Boolean));
  const [mealSlot, setMealSlot] = useState(initialSlot || recipe?.mealSlot || 'breakfast');
  const [audience, setAudience] = useState(initialAudience);

  useEffect(() => {
    setSelectedDateKeys([initialDateKey || weekDays?.[0]?.key || ''].filter(Boolean));
  }, [initialDateKey, weekDays]);

  useEffect(() => {
    setMealSlot(initialSlot || recipe?.mealSlot || 'breakfast');
  }, [initialSlot, recipe?.id, recipe?.mealSlot]);

  useEffect(() => {
    setAudience(initialAudience || 'all');
  }, [initialAudience]);

  if (!recipe) return null;

  const toggleDateKey = (nextDateKey) => {
    setSelectedDateKeys((previous) => {
      if (previous.includes(nextDateKey)) {
        return previous.length > 1
          ? previous.filter((value) => value !== nextDateKey)
          : previous;
      }
      return weekDays
        .filter((day) => previous.includes(day.key) || day.key === nextDateKey)
        .map((day) => day.key);
    });
  };

  const selectMatchingDays = (predicate) => {
    const nextDateKeys = weekDays.filter(predicate).map((day) => day.key);
    setSelectedDateKeys(nextDateKeys.length > 0 ? nextDateKeys : [initialDateKey || weekDays?.[0]?.key || ''].filter(Boolean));
  };

  const actionLabel = selectedDateKeys.length === 1
    ? 'Add to planner'
    : `Add to ${selectedDateKeys.length} days`;

  return (
    <ModalShell onClose={onClose}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">Add to planner</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">{recipe.name}</h3>
            <p className="mt-2 text-sm text-slate-500">Pick a day, slot, and audience for this recipe. Any recipe can be used in any slot.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Day</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectMatchingDays((day) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(day.shortLabel))}
                className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold"
              >
                Weekdays
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateKeys(weekDays.map((day) => day.key))}
                className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold"
              >
                All week
              </button>
              <button
                type="button"
                onClick={() => setSelectedDateKeys([initialDateKey || weekDays?.[0]?.key || ''].filter(Boolean))}
                className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold"
              >
                Reset
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {weekDays.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => toggleDateKey(day.key)}
                  className={`rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${
                    selectedDateKeys.includes(day.key)
                      ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block">{day.dayLabel}</span>
                  <span className="mt-1 block text-xs font-medium opacity-80">
                    {selectedDateKeys.includes(day.key) ? 'Selected' : 'Tap to include'}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Choose one or more days. This is the fastest way to place the same recipe across the week.
            </p>
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
            onClick={() => onAdd({ dateKeys: selectedDateKeys, mealSlot, audience })}
            className="pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function RecipePickerModal({ recipes, slot, audience = 'all', onAudienceChange, onClose, onPick }) {
  const [search, setSearch] = useState('');
  const [selectedMealFilters, setSelectedMealFilters] = useState([slot]);
  const [visibleCount, setVisibleCount] = useState(PICKER_INITIAL_COUNT);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setSelectedMealFilters([slot]);
  }, [slot]);

  useEffect(() => {
    setVisibleCount(PICKER_INITIAL_COUNT);
  }, [deferredSearch, selectedMealFilters, slot]);

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
        return haystack.includes(deferredSearch.toLowerCase());
      })
      .sort((left, right) => (
        Number(right.mealSlot === slot) - Number(left.mealSlot === slot)
        || left.name.localeCompare(right.name)
      ))
  ), [deferredSearch, recipes, selectedMealFilters, slot]);
  const visibleRecipes = useMemo(() => (
    filteredRecipes.slice(0, visibleCount)
  ), [filteredRecipes, visibleCount]);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="p-5 sm:p-6">
        <div className="sticky top-0 z-20 -mx-5 -mt-5 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 pb-3 pt-5 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
          <div>
            <p className="pm-kicker">{getMealSlotLabel(slot)}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">Choose a recipe</h3>
            <p className="mt-2 text-sm text-slate-500">
              This meal will be planned for <span className="font-semibold text-slate-700">{getMealAudienceLabel(audience).toLowerCase()}</span>.
              Any recipe can be used here, and recipes already matching {getMealSlotLabel(slot).toLowerCase()} are shown first.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
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
          <p className="mt-2 text-xs text-slate-500">
            {filteredRecipes.length} recipe{filteredRecipes.length === 1 ? '' : 's'} available
            {deferredSearch.trim() ? ` for "${deferredSearch.trim()}"` : ''}.
          </p>
        </div>

        {filteredRecipes.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRecipes.map((recipe) => (
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
            {filteredRecipes.length > visibleRecipes.length ? (
              <button
                type="button"
                onClick={() => setVisibleCount((previous) => previous + PICKER_INITIAL_COUNT)}
                className="pm-subtle-button flex min-h-[220px] items-center justify-center rounded-[24px] border-dashed px-4 py-4 text-sm font-semibold"
              >
                Show {Math.min(PICKER_INITIAL_COUNT, filteredRecipes.length - visibleRecipes.length)} more recipes
              </button>
            ) : null}
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
  const canEditEntry = context?.canEditEntry !== false;
  const sharedEntryOwnerLabel = context?.entryOwnerLabel || 'Shared';
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
              {context?.entry && !canEditEntry ? (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-slate-600">
                  {sharedEntryOwnerLabel}&apos;s plan
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
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
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
              {context?.entry && !canEditEntry ? (
                <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  This meal slot belongs to {sharedEntryOwnerLabel}. You can edit the shared recipe here, but changes to this calendar slot still need to be made from their plan or by adding it to yours.
                </div>
              ) : null}
              <div className="mt-4 space-y-2">
                <button type="button" onClick={() => onEditRecipe(recipe)} className="pm-subtle-button flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                  <Edit className="h-4 w-4" />
                  Edit recipe
                </button>
                <button type="button" onClick={() => onDuplicateRecipe(recipe)} className="pm-subtle-button flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold">
                  <Copy className="h-4 w-4" />
                  Duplicate recipe
                </button>
                {context?.entry && canEditEntry ? (
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

            {context?.entry && canEditEntry ? (
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

function GroceryReviewModal({
  draft,
  canClearApprovedBatch,
  hiddenDraft,
  onApprove,
  onClose,
  onExclude,
  onRestore,
  onRestoreAll,
  saving,
  weekLabel,
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [showHiddenDraft, setShowHiddenDraft] = useState(false);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">Grocery review</p>
            <h3 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-slate-950">Weekly shopping draft</h3>
            <p className="mt-2 text-sm text-slate-500">
              Review totals for {weekLabel} before they sync into Shopping List.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              This replaces the existing Meal plan batch for this week. Manual Shopping List items are left untouched.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Batch recipes reuse carryover first, so only newly needed ingredients appear in this draft.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50">
            <Close className="h-4 w-4" />
          </button>
        </div>

        {hiddenDraft.length > 0 ? (
          <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                {hiddenDraft.length} ingredient{hiddenDraft.length === 1 ? '' : 's'} excluded from this week&apos;s grocery draft.
              </p>
              <button
                type="button"
                onClick={() => setShowHiddenDraft((value) => !value)}
                className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                {showHiddenDraft ? 'Hide excluded groceries' : `Show excluded groceries (${hiddenDraft.length})`}
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-800/80">
              These items stay out of this week&apos;s draft until you restore them.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void onRestoreAll().catch(() => {});
                }}
                disabled={saving}
                className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                Restore all groceries
              </button>
            </div>
            {showHiddenDraft ? (
              <div className={`mt-4 grid gap-3 ${isMobile ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
                {hiddenDraft.map((item) => (
                  <div key={`restore-${item.key}`} className="rounded-[20px] border border-amber-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-slate-950">{item.title}</h4>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.quantityValue !== null
                            ? `${formatIngredientQuantity(item.quantityValue)} ${item.quantityUnit}`.trim()
                            : item.rawText}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                        Hidden
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      {item.sourceMeals.slice(0, 3).map((meal) => meal.recipeName).join(', ')}
                      {item.sourceMeals.length > 3 ? ` +${item.sourceMeals.length - 3} more` : ''}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          void onRestore(item).catch(() => {});
                        }}
                        disabled={saving}
                        className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                      >
                        Restore to draft
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={`mt-5 grid gap-3 ${isMobile ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
          {draft.map((item) => (
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
                  onClick={() => {
                    void onExclude(item).catch(() => {});
                  }}
                  disabled={saving}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Hide for this week
                </button>
              </div>
            </div>
          ))}
        </div>

        {draft.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            {canClearApprovedBatch
              ? 'There are no grocery lines left in this draft. Update Shopping List to remove the generated Meal plan batch for this week.'
              : 'There are no grocery lines left in this draft. Restore one ingredient if you want to send groceries to Shopping List.'}
          </div>
        ) : null}

        <div className={`mt-6 flex gap-3 ${isMobile ? 'flex-col-reverse' : 'justify-end'}`}>
          <button type="button" onClick={onClose} className={`pm-subtle-button rounded-full px-4 py-2.5 text-sm font-semibold ${isMobile ? 'w-full' : ''}`}>
            Close
          </button>
          <button type="button" onClick={() => onApprove(draft)} disabled={saving || (draft.length === 0 && !canClearApprovedBatch)} className={`pm-toolbar-primary rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${isMobile ? 'w-full' : ''}`}>
            {saving ? 'Updating groceries…' : (canClearApprovedBatch ? 'Update Shopping List' : 'Add to Shopping List')}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function LazyPlannerDayCard({
  day,
  daySummary,
  forceRender = false,
  planViewHeadline,
  renderDetails,
}) {
  const cardRef = useRef(null);
  const detailsRef = useRef(null);
  const [isNearViewport, setIsNearViewport] = useState(forceRender);
  const [reservedDetailsHeight, setReservedDetailsHeight] = useState(180);
  const shouldRenderDetails = forceRender || isNearViewport;

  useEffect(() => {
    if (forceRender) {
      setIsNearViewport(true);
      return undefined;
    }

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsNearViewport(true);
      return undefined;
    }

    const target = cardRef.current;
    if (!target) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(Boolean(entry?.isIntersecting));
      },
      {
        root: null,
        rootMargin: '900px 0px',
        threshold: 0,
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [forceRender]);

  useEffect(() => {
    if (!shouldRenderDetails || !detailsRef.current) return;
    const measuredHeight = Math.ceil(detailsRef.current.getBoundingClientRect().height);
    if (measuredHeight > 0) {
      setReservedDetailsHeight((previousHeight) => (
        Math.abs(previousHeight - measuredHeight) > 24 ? measuredHeight : previousHeight
      ));
    }
  }, [shouldRenderDetails]);

  return (
    <div ref={cardRef} className="pm-scroll-optimize-day pm-meal-planner-repeated-card rounded-[22px] border border-slate-200 bg-slate-50/70 p-3 sm:rounded-[26px] sm:p-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{day.shortLabel}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{day.dayLabel}</h3>
        </div>
        <div className="w-full rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2 text-left sm:w-auto sm:min-w-[180px] sm:shrink-0 sm:rounded-[20px] sm:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700">{planViewHeadline}</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">
            {daySummary?.calories > 0 ? `${daySummary.calories} kcal` : 'No meals yet'}
          </p>
          {daySummary?.calories > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold sm:justify-end">
              <span className="rounded-full bg-white px-2 py-1 text-sky-700">
                P {formatMacroTotal(daySummary?.nutrition?.proteinG)}g
              </span>
              <span className="rounded-full bg-white px-2 py-1 text-indigo-700">
                C {formatMacroTotal(daySummary?.nutrition?.carbsG)}g
              </span>
              <span className="rounded-full bg-white px-2 py-1 text-emerald-700">
                Fib {formatMacroTotal(daySummary?.nutrition?.fiberG)}g
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {shouldRenderDetails ? (
        <div ref={detailsRef}>
          {renderDetails()}
        </div>
      ) : (
        <div
          className="mt-3 grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-4"
          style={{ minHeight: `${reservedDetailsHeight}px` }}
          aria-hidden="true"
        >
          {SLOT_ORDER.map((slot) => (
            <div key={`placeholder-${day.key}-${slot}`} className="rounded-[18px] border border-slate-200 bg-white/70 p-3">
              <div className="h-3 w-20 rounded-full bg-slate-200/80" />
              <div className="mt-4 h-14 rounded-[16px] border border-dashed border-slate-200 bg-slate-50/80" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MealPlannerView({ currentUserEmail, currentUserId }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    applyMealToDates,
    canUseStarterLibrary,
    clearMealEntry,
    confirmGroceryDraft,
    createCarryoverForNextDay,
    createRecipe,
    defaultServingMultiplier,
    deleteRecipe,
    duplicateRecipe,
    entryUsageById,
    entries,
    error,
    excludeGroceryDraftItem,
    groceryDraft,
    hasApprovedGroceryBatch,
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
  const [showMobilePlannerDetails, setShowMobilePlannerDetails] = useState(false);
  const [activeMobileDayKey, setActiveMobileDayKey] = useState('');
  const [mobileActivePanel, setMobileActivePanel] = useState('planner');
  const [planViewMode, setPlanViewMode] = useState('mine');
  const [libraryVisibleCount, setLibraryVisibleCount] = useState(DESKTOP_LIBRARY_INITIAL_COUNT);
  const [partnerInput, setPartnerInput] = useState('');
  const [kidsInput, setKidsInput] = useState('');
  const [householdSaving, setHouseholdSaving] = useState(false);
  const deferredLibrarySearch = useDeferredValue(librarySearch);
  const autoResolvedPlanViewKeyRef = useRef('');

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

  useEffect(() => {
    if (!weekDays.length) {
      setActiveMobileDayKey('');
      return;
    }

    setActiveMobileDayKey((previous) => (
      weekDays.some((day) => day.key === previous) ? previous : weekDays[0].key
    ));
  }, [weekDays]);

  const recipeMap = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const recipeDisplayMetaById = useMemo(() => (
    recipes.reduce((accumulator, recipe) => {
      accumulator[recipe.id] = {
        cardIngredients: summarizeRecipeIngredients(recipe, 3),
        libraryIngredients: summarizeRecipeIngredients(recipe, 4),
        searchText: `${recipe.name} ${recipe.sourcePdf} ${summarizeRecipeIngredients(recipe, 5)}`.toLowerCase(),
      };
      return accumulator;
    }, {})
  ), [recipes]);
  const plannerIsShared = useMemo(() => (
    Array.isArray(plannerProject?.project_members) && plannerProject.project_members.length > 0
  ), [plannerProject?.project_members]);
  const householdSharedWeeks = useMemo(() => (
    visibleWeeks.filter((visibleWeek) => visibleWeek?.userId && visibleWeek.userId !== currentUserId)
  ), [currentUserId, visibleWeeks]);
  const isCombinedPlanView = plannerIsShared && planViewMode === 'both';
  const plannerEntries = isCombinedPlanView ? visibleEntries : entries;
  const plannerEntryUsageById = isCombinedPlanView ? householdEntryUsageById : entryUsageById;
  const plannerGroceryDraft = isCombinedPlanView ? householdGroceryDraft : groceryDraft;
  const plannerHiddenGroceryDraft = isCombinedPlanView ? hiddenHouseholdGroceryDraft : hiddenGroceryDraft;
  const planViewHeadline = isCombinedPlanView ? 'Family total' : 'Your total';
  const planViewDescription = isCombinedPlanView
    ? 'Both merges every visible household week for this date range. Shared calendar slots stay read-only, but shared recipes can still be opened and edited.'
    : 'Mine shows only the meals saved in your own weekly plan.';
  const entryMap = useMemo(() => new Map(visibleEntries.map((entry) => [entry.id, entry])), [visibleEntries]);
  const resolvedRecipeByEntryId = useMemo(() => (
    visibleEntries.reduce((accumulator, entry) => {
      let resolvedRecipe = recipeMap.get(entry.mealId) || null;
      if (entry.entryKind === 'carryover' && entry.carryoverSourceEntryId) {
        const sourceEntry = entryMap.get(entry.carryoverSourceEntryId);
        const sourceRecipe = sourceEntry ? recipeMap.get(sourceEntry.mealId) : null;
        resolvedRecipe = sourceRecipe || resolvedRecipe;
      }
      accumulator[entry.id] = resolvedRecipe;
      return accumulator;
    }, {})
  ), [entryMap, recipeMap, visibleEntries]);
  const ownEntriesBySlotKey = useMemo(() => (
    entries.reduce((accumulator, entry) => {
      const key = `${entry.date}:${entry.mealSlot}`;
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(entry);
      return accumulator;
    }, {})
  ), [entries]);
  const plannerEntriesBySlotKey = useMemo(() => (
    plannerEntries.reduce((accumulator, entry) => {
      const key = `${entry.date}:${entry.mealSlot}`;
      if (!accumulator[key]) accumulator[key] = [];
      accumulator[key].push(entry);
      return accumulator;
    }, {})
  ), [plannerEntries]);
  const slotEntriesByKey = useMemo(() => (
    Object.entries(plannerEntriesBySlotKey).reduce((accumulator, [slotKey, slotEntries]) => {
      accumulator[slotKey] = slotEntries
        .map((entry) => ({
          entry,
          recipe: resolvedRecipeByEntryId[entry.id] || null,
        }))
        .filter(({ recipe }) => Boolean(recipe));
      return accumulator;
    }, {})
  ), [plannerEntriesBySlotKey, resolvedRecipeByEntryId]);

  const activeMobileDay = useMemo(() => (
    weekDays.find((day) => day.key === activeMobileDayKey) || weekDays[0] || null
  ), [activeMobileDayKey, weekDays]);
  const visibleWeekDays = useMemo(() => (
    isMobile
      ? (activeMobileDay ? [activeMobileDay] : [])
      : weekDays
  ), [activeMobileDay, isMobile, weekDays]);
  const isPlannerVisible = !isMobile || mobileActivePanel === 'planner';
  const isRecipeLibraryVisible = !isMobile || mobileActivePanel === 'recipes';
  const isShoppingGenerationVisible = !isMobile || mobileActivePanel === 'groceries';

  const filteredLibraryRecipes = useMemo(() => (
    isRecipeLibraryVisible ? recipes.filter((recipe) => {
      if (librarySlotFilter !== 'all' && recipe.mealSlot !== librarySlotFilter) {
        return false;
      }
      const haystack = recipeDisplayMetaById[recipe.id]?.searchText || '';
      return haystack.includes(deferredLibrarySearch.toLowerCase());
    }) : []
  ), [deferredLibrarySearch, isRecipeLibraryVisible, librarySlotFilter, recipeDisplayMetaById, recipes]);

  const weekLabel = useMemo(() => formatWeekLabel(weekDays), [weekDays]);
  const partnerServingMultiplier = Math.max(0, (week?.adultCount ?? 1.75) - 1);
  useEffect(() => {
    setPartnerInput(formatPlannerNumberInput(partnerServingMultiplier));
    setKidsInput(formatPlannerNumberInput(week?.kidCount ?? 0));
  }, [partnerServingMultiplier, week?.kidCount]);
  useEffect(() => {
    if (!plannerProject?.id || !Array.isArray(plannerProject?.project_members)) {
      return;
    }

    const nextPlanViewDefaultKey = `${plannerProject.id}:${plannerIsShared ? 'shared' : 'private'}`;
    if (autoResolvedPlanViewKeyRef.current !== nextPlanViewDefaultKey) {
      autoResolvedPlanViewKeyRef.current = nextPlanViewDefaultKey;
      setPlanViewMode(plannerIsShared ? 'both' : 'mine');
      return;
    }

    if (!plannerIsShared && planViewMode !== 'mine') {
      setPlanViewMode('mine');
    }
  }, [planViewMode, plannerIsShared, plannerProject?.id, plannerProject?.project_members]);
  const plannedRecipeIds = useMemo(() => {
    const ids = new Set();
    plannerEntries.forEach((entry) => {
      const recipe = resolvedRecipeByEntryId[entry.id];
      if (recipe?.id) ids.add(recipe.id);
    });
    return ids;
  }, [plannerEntries, resolvedRecipeByEntryId]);
  const plannedRecipeNutritionById = useMemo(() => {
    const accumulator = {};
    plannedRecipeIds.forEach((recipeId) => {
      const recipe = recipeMap.get(recipeId);
      if (recipe) {
        accumulator[recipeId] = estimateRecipeNutritionFromStarterCatalog(recipe);
      }
    });
    return accumulator;
  }, [plannedRecipeIds, recipeMap]);
  const daySummaryByKey = useMemo(() => {
    const visibleDayKeys = new Set(visibleWeekDays.map((day) => day.key));
    const summary = visibleWeekDays.reduce((accumulator, day) => {
      accumulator[day.key] = {
        calories: 0,
        nutrition: createEmptyNutritionTotals(),
      };
      return accumulator;
    }, {});

    plannerEntries.forEach((entry) => {
      if (!visibleDayKeys.has(entry.date)) return;
      const daySummary = summary[entry.date];
      if (!daySummary) return;

      const recipe = resolvedRecipeByEntryId[entry.id];
      if (!recipe) return;

      const entryUsage = plannerEntryUsageById?.[entry.id] || null;
      const multiplier = getDisplayedNutritionMultiplier(entry, entryUsage);
      if (multiplier <= 0) return;

      if (recipe.estimatedKcal) {
        daySummary.calories += recipe.estimatedKcal * multiplier;
      }

      const nutrition = plannedRecipeNutritionById[recipe.id];
      if (!nutrition) return;

      daySummary.nutrition.proteinG += (nutrition.proteinG || 0) * multiplier;
      daySummary.nutrition.carbsG += (nutrition.carbsG || 0) * multiplier;
      daySummary.nutrition.fiberG += (nutrition.fiberG || 0) * multiplier;
    });

    Object.values(summary).forEach((daySummary) => {
      daySummary.calories = Math.round(daySummary.calories);
    });

    return summary;
  }, [plannedRecipeNutritionById, plannerEntries, plannerEntryUsageById, resolvedRecipeByEntryId, visibleWeekDays]);
  const visibleLibraryRecipes = useMemo(() => (
    filteredLibraryRecipes.slice(0, libraryVisibleCount)
  ), [filteredLibraryRecipes, libraryVisibleCount]);
  const mobileRecipeLibraryCount = isRecipeLibraryVisible ? filteredLibraryRecipes.length : recipes.length;
  const parsedPartnerInput = parsePlannerNumberInput(partnerInput);
  const parsedKidsInput = parsePlannerNumberInput(kidsInput);
  const householdCanSave = parsedPartnerInput !== null && parsedKidsInput !== null;
  const householdDirty = householdCanSave && (
    Math.abs(parsedPartnerInput - partnerServingMultiplier) > 0.001
    || Math.abs(parsedKidsInput - (week?.kidCount ?? 0)) > 0.001
  );

  useEffect(() => {
    setLibraryVisibleCount(isMobile ? MOBILE_LIBRARY_INITIAL_COUNT : DESKTOP_LIBRARY_INITIAL_COUNT);
  }, [deferredLibrarySearch, isMobile, librarySlotFilter]);

  const resetHouseholdInputs = () => {
    setPartnerInput(formatPlannerNumberInput(partnerServingMultiplier));
    setKidsInput(formatPlannerNumberInput(week?.kidCount ?? 0));
  };

  const persistHouseholdInputs = async () => {
    if (!householdCanSave || !householdDirty) return;
    setHouseholdSaving(true);
    try {
      await updateWeekCounts({
        adultCount: 1 + parsedPartnerInput,
        kidCount: parsedKidsInput,
      });
    } finally {
      setHouseholdSaving(false);
    }
  };

  const handleMoveWeek = (offset) => {
    const date = new Date(selectedWeekStart);
    date.setDate(date.getDate() + (offset * 7));
    setSelectedWeekStart(formatDateKey(date));
    setCopyPrompt(null);
  };

  const getPreferredDayKeyForSlot = (mealSlot) => {
    const firstEmpty = weekDays.find((day) => (ownEntriesBySlotKey[`${day.key}:${mealSlot}`] || []).length === 0);
    return firstEmpty?.key || weekDays[0]?.key || '';
  };

  const getEntryOwnerLabel = (entry) => {
    if (!entry?.weekOwnerUserId || entry.weekOwnerUserId === currentUserId) {
      return 'You';
    }
    if (entry.weekOwnerUserId === plannerProject?.user_id) {
      return 'Owner';
    }
    const matchingMember = (plannerProject?.project_members || []).find((member) => member?.user_id === entry.weekOwnerUserId);
    return formatSharedActorLabel(matchingMember?.member_email) || 'Shared';
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
      if (isMobile) {
        setMobileActivePanel('planner');
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

  const handleApproveGroceries = async (draftOverride = plannerGroceryDraft) => {
    try {
      const result = await confirmGroceryDraft(draftOverride);
      setShowReviewModal(false);
      if (result?.count === 0) {
        setStatusMessage('Updated Shopping List and removed generated Meal plan groceries for this week.');
      } else {
        const syncedCount = result?.count ?? draftOverride.length;
        setStatusMessage(`Updated Shopping List with ${syncedCount} generated Meal plan grocer${syncedCount === 1 ? 'y' : 'ies'} for this week.`);
      }
    } catch {
      // Error is surfaced through the shared banner state.
    }
  };

  const handleQuickPlanRecipe = async ({ recipe, dateKeys = [], mealSlot, audience }) => {
    const normalizedDateKeys = dateKeys.filter(Boolean);
    if (normalizedDateKeys.length === 0) return;

    try {
      if (normalizedDateKeys.length > 1) {
        await applyMealToDates({
          dates: normalizedDateKeys,
          mealSlot,
          mealId: recipe.id,
          servingMultiplier: null,
          audience,
        });
        setQuickPlanContext(null);
        setCopyPrompt(null);
        if (isMobile) {
          setMobileActivePanel('planner');
        }
        return;
      }

      const [dateKey] = normalizedDateKeys;
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
      if (isMobile) {
        setMobileActivePanel('planner');
      }
    } catch {
      // Error banner already set in the data hook.
    }
  };

  const handleCreateCarryover = async (sourceEntryId) => {
    try {
      await createCarryoverForNextDay(sourceEntryId);
    } catch {
      // Error banner already set in the data hook.
    }
  };

  const handleMoveCarryover = async (carryoverEntryId) => {
    try {
      await moveCarryoverToNextDay(carryoverEntryId);
    } catch {
      // Error banner already set in the data hook.
    }
  };

  const handleRemoveCarryover = async (carryoverEntryId) => {
    try {
      await removeCarryover(carryoverEntryId);
      setStatusMessage('Carryover removed. Review groceries and update Shopping List if this week already has generated groceries.');
    } catch {
      // Error banner already set in the data hook.
    }
  };

  const handleRemovePlannedMeal = async (entryId) => {
    try {
      dismissCopyUiForEntry(entryId);
      await clearMealEntry({ entryId });
      setStatusMessage('Meal removed from the plan. Review groceries, then Update Shopping List to refresh this week\'s generated batch.');
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
    <div className="pm-shell-bg min-h-full w-full overflow-x-hidden px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <section className="pm-home-panel pm-meal-planner-shell w-full min-w-0 overflow-hidden rounded-[24px] p-3.5 sm:rounded-[30px] sm:p-6">
          <div className="flex w-full min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="pm-kicker">Meal Planner</p>
              <h2 className="mt-2 max-w-3xl text-[1.85rem] font-bold leading-[0.98] tracking-[-0.05em] text-slate-950 sm:text-3xl sm:leading-none">
                Plan the week and build shopping automatically
              </h2>
              <p className="mt-2 max-w-3xl text-[13px] leading-5 text-slate-500 sm:text-sm sm:leading-6">
                Pick meals by day, reuse breakfasts, lunches, and dinners across the week, then review one aggregated grocery draft before it hits your shared Shopping List.
              </p>
              {plannerIsShared ? (
                <p className="mt-2 max-w-3xl text-[13px] font-medium leading-5 text-sky-700 sm:text-sm sm:leading-6">
                  This household shares one recipe library and can review weekly plans together. Switch between your plan and the combined family view whenever you need.
                </p>
              ) : null}
              {!canUseStarterLibrary ? (
                <p className="mt-2 max-w-3xl text-[13px] leading-5 text-slate-500 sm:text-sm sm:leading-6">
                  This account starts with an empty recipe library so you can add or import your own meals.
                </p>
              ) : null}
            </div>
            <div className="flex w-full max-w-full flex-col gap-2 xl:w-auto xl:min-w-[220px] xl:items-end">
              {canUseStarterLibrary ? (
                <button type="button" onClick={() => void seedStarterLibrary()} className="pm-subtle-button w-full rounded-full px-4 py-2.5 text-sm font-semibold xl:w-auto">
                  Load starter menu library
                </button>
              ) : null}
              <button type="button" onClick={() => setShowImportModal(true)} className="pm-subtle-button w-full rounded-full px-4 py-2.5 text-sm font-semibold xl:w-auto">
                Import rows
              </button>
              <button type="button" onClick={() => setFormState(DEFAULT_FORM_STATE)} className="pm-toolbar-primary w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white xl:w-auto">
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

          {plannerIsShared ? (
            <div className="mt-5 rounded-[24px] border border-sky-100 bg-sky-50 px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">Plan view</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {isCombinedPlanView ? 'Seeing the combined family plan' : 'Seeing only your saved week'}
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-sky-800">
                    {planViewDescription}
                  </p>
                </div>
                <div className="inline-flex w-full rounded-full border border-sky-200 bg-white p-1 shadow-sm lg:w-auto">
                  {[
                    { id: 'mine', label: 'Mine', meta: `${entries.length}` },
                    { id: 'both', label: 'Both', meta: householdSharedWeeks.length > 0 ? `${plannerEntries.length}` : 'Just you' },
                  ].map((option) => {
                    const isActive = planViewMode === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setPlanViewMode(option.id)}
                        className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition lg:flex-none lg:min-w-[108px] ${
                          isActive
                            ? 'bg-[var(--pm-accent)] text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        <span className="block">{option.label}</span>
                        <span className={`mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                          {option.meta}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {isMobile ? (
            <div className="mt-4 rounded-[20px] border border-slate-200 bg-white/90 p-2 shadow-sm">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'planner', label: 'Plan', meta: activeMobileDay?.shortLabel || 'Week' },
                  { id: 'recipes', label: 'Recipes', meta: `${mobileRecipeLibraryCount}` },
                  { id: 'groceries', label: 'Groceries', meta: `${plannerGroceryDraft.length}` },
                ].map((panel) => {
                  const isActive = mobileActivePanel === panel.id;
                  return (
                    <button
                      key={panel.id}
                      type="button"
                      onClick={() => setMobileActivePanel(panel.id)}
                      className={`rounded-[16px] border px-3 py-2.5 text-left transition ${
                        isActive
                          ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)] shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="block text-[11px] font-semibold">{panel.label}</span>
                      <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-current/70">
                        {panel.meta}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid w-full min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.65fr)_360px]">
            <div className="pm-scroll-optimize-section pm-meal-planner-panel w-full min-w-0 rounded-[24px] border border-slate-200 bg-white p-3.5 shadow-sm sm:rounded-[28px] sm:p-5">
              <div className="grid min-w-0 gap-3 2xl:grid-cols-[auto_minmax(0,1fr)] 2xl:items-start">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <button type="button" onClick={() => handleMoveWeek(-1)} className="pm-subtle-button shrink-0 rounded-full p-2.5">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-semibold leading-tight text-slate-700 sm:flex-none sm:rounded-full sm:px-4 sm:py-2.5">
                    {weekLabel}
                  </div>
                  <button type="button" onClick={() => handleMoveWeek(1)} className="pm-subtle-button shrink-0 rounded-full p-2.5">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 2xl:justify-self-end">
                  <div className="min-w-0 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">You</span>
                    <span className="mt-1 block text-sm font-semibold text-slate-900 sm:text-[15px]">1.0</span>
                  </div>
                  <label className="min-w-0 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Partner</span>
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      value={partnerInput}
                      onChange={(event) => setPartnerInput(event.target.value)}
                      className="mt-1 w-full min-w-0 bg-transparent text-sm font-semibold text-slate-900 outline-none sm:text-[15px]"
                    />
                  </label>
                  <label className="min-w-0 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-2.5">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Kids</span>
                    <input
                      type="number"
                      min="0"
                      value={kidsInput}
                      onChange={(event) => setKidsInput(event.target.value)}
                      className="mt-1 w-full min-w-0 bg-transparent text-sm font-semibold text-slate-900 outline-none sm:text-[15px]"
                    />
                  </label>
                  <div className="sm:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium text-slate-500">
                        Household portions now save together, which keeps planning smoother and avoids extra writes while typing.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={resetHouseholdInputs}
                          disabled={!householdDirty || householdSaving}
                          className="pm-subtle-button rounded-full px-3 py-2 text-[11px] font-semibold disabled:opacity-50"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => void persistHouseholdInputs()}
                          disabled={!householdCanSave || !householdDirty || householdSaving}
                          className="pm-toolbar-primary rounded-full px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          {householdSaving ? 'Saving household…' : 'Save household'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 sm:hidden">
                <div className="space-y-2.5">
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Planner summary</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Household</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{defaultServingMultiplier}x total</p>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Your kcal</p>
                        <p className="mt-1 text-sm font-semibold text-amber-700">{PERSONAL_DAILY_TARGETS.caloriesFor64KgKcal}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMobilePlannerDetails((previous) => !previous)}
                      className="pm-subtle-button mt-3 w-full rounded-full px-4 py-2.5 text-xs font-semibold"
                    >
                      {showMobilePlannerDetails ? 'Hide planner details' : 'Show planner details'}
                    </button>
                  </div>

                  {showMobilePlannerDetails ? (
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                        <span className="rounded-2xl bg-white px-3 py-2 text-sky-700 shadow-sm">Protein {PERSONAL_DAILY_TARGETS.proteinG}g</span>
                        <span className="rounded-2xl bg-white px-3 py-2 text-rose-700 shadow-sm">Fat {PERSONAL_DAILY_TARGETS.fatG}g</span>
                        <span className="rounded-2xl bg-white px-3 py-2 text-indigo-700 shadow-sm">Carbs {PERSONAL_DAILY_TARGETS.carbsG}g</span>
                        <span className="rounded-2xl bg-white px-3 py-2 text-emerald-700 shadow-sm">Fibre {PERSONAL_DAILY_TARGETS.fiberG}g</span>
                      </div>
                      <div className="mt-3 space-y-2 text-[11px] leading-5 text-slate-500">
                        <p>Your calories use only your 1.0 serving reference.</p>
                        <p>Partner and kids still scale groceries, with kids counted as 0.5 portion.</p>
                        <p>Breakfast, lunch, and dinner can copy forward to later days.</p>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setMobileActivePanel('groceries')}
                  className="pm-toolbar-primary mt-3 w-full rounded-full px-4 py-3 text-sm font-semibold text-white"
                >
                  Open {isCombinedPlanView ? 'family' : 'your'} grocery summary
                </button>
              </div>

              <div className="mt-4 hidden flex-col gap-3 sm:flex xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Household total {defaultServingMultiplier}x</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Adults total {week?.adultCount ?? 1.75}x</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Your calories use 1.0 serving only</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Kids count as 0.5 portion</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Daily P / C / Fib are approximate from recipe ingredients</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Breakfast, lunch, and dinner can copy forward</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">64kg calories ~{PERSONAL_DAILY_TARGETS.caloriesFor64KgKcal} kcal</span>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700">Protein target {PERSONAL_DAILY_TARGETS.proteinG}g</span>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">Fat target {PERSONAL_DAILY_TARGETS.fatG}g</span>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-700">Carbs target {PERSONAL_DAILY_TARGETS.carbsG}g</span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">Fibre reference {PERSONAL_DAILY_TARGETS.fiberG}g</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReviewModal(true)}
                  className="pm-toolbar-primary w-full shrink-0 rounded-full px-4 py-3 text-sm font-semibold text-white sm:w-auto xl:self-start"
                >
                  Review groceries
                </button>
              </div>

              {isMobile && isPlannerVisible ? (
                <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Plan the week</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">Focus on one day at a time</p>
                    </div>
                    {activeMobileDay ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                        {activeMobileDay.shortLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
                    {weekDays.map((day) => {
                      const isActive = day.key === activeMobileDayKey;
                      return (
                        <button
                          key={`mobile-day-${day.key}`}
                          type="button"
                          onClick={() => setActiveMobileDayKey(day.key)}
                          className={`min-w-[84px] shrink-0 rounded-[16px] border px-3 py-2.5 text-left transition ${
                            isActive
                              ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)] shadow-sm'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]">
                            {day.shortLabel}
                          </span>
                          <span className="mt-1 block text-sm font-semibold">
                            {day.key.split('-')[2]?.replace(/^0/, '') || day.key}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {isPlannerVisible ? (
              <div className={`mt-5 ${isMobile ? 'space-y-3' : 'space-y-4'}`}>
                {visibleWeekDays.map((day) => {
                  const currentDayIndex = weekDays.findIndex((candidate) => candidate.key === day.key);
                  const hasNextDayInWeek = currentDayIndex >= 0 && currentDayIndex < weekDays.length - 1;

                  return (
                  <LazyPlannerDayCard
                    key={day.key}
                    day={day}
                    daySummary={daySummaryByKey[day.key]}
                    forceRender={isMobile || currentDayIndex < 2 || copyPrompt?.dateKey === day.key}
                    planViewHeadline={planViewHeadline}
                    renderDetails={() => (
                    <div className="mt-3 grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-4">
                      {SLOT_ORDER.map((slot) => {
                        const slotEntries = slotEntriesByKey[`${day.key}:${slot}`] || [];

                        return (
                          <div key={`${day.key}-${slot}`} className="pm-scroll-optimize-card pm-meal-planner-repeated-card rounded-[18px] border border-slate-200 bg-white p-2.5 sm:rounded-[24px] sm:p-3">
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

                            <div className="mt-3 space-y-2.5">
                              {slotEntries.map(({ entry, recipe }) => {
                                const isCarryoverEntry = entry.entryKind === 'carryover';
                                const isOwnedEntry = !entry.weekOwnerUserId || entry.weekOwnerUserId === currentUserId;
                                const canModifyEntry = isOwnedEntry || (plannerIsShared && isCombinedPlanView);
                                const entryOwnerLabel = getEntryOwnerLabel(entry);
                                const isCopyPromptVisible = isOwnedEntry && Boolean(recipe) && copyPrompt?.sourceEntryId === entry.id;
                                const entryUsage = plannerEntryUsageById?.[entry.id] || null;
                                const carryoverNutritionMultiplier = getDisplayedNutritionMultiplier(entry, entryUsage);
                                const carryoverKcal = recipe?.estimatedKcal && carryoverNutritionMultiplier > 0
                                  ? Math.round(recipe.estimatedKcal * carryoverNutritionMultiplier)
                                  : 0;
                                const canCreateCarryover = canModifyEntry
                                  && !isCarryoverEntry
                                  && Boolean(recipe)
                                  && entryUsage?.yieldMode === 'batch'
                                  && (entryUsage?.createdCarryoverPortions || 0) > 0
                                  && !entryUsage?.hasCarryoverChild
                                  && hasNextDayInWeek;
                                const canMoveCarryover = canModifyEntry
                                  && isCarryoverEntry
                                  && entryUsage?.carryoverStatus === 'active'
                                  && hasNextDayInWeek;
                                const cardBody = (
                                  <>
                                    <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold sm:text-[11px]">
                                      {plannerIsShared && isCombinedPlanView ? (
                                        <span className={`rounded-full px-2.5 py-1 ${isOwnedEntry ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                          {entryOwnerLabel}
                                        </span>
                                      ) : null}
                                      {isCarryoverEntry ? (
                                        <>
                                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                                            Carryover
                                          </span>
                                          {entry.audience ? (
                                            <span className={`rounded-full px-2.5 py-1 ${getAudiencePillClasses(entry.audience)}`}>
                                              {getMealAudienceLabel(entry.audience)}
                                            </span>
                                          ) : null}
                                        </>
                                      ) : (
                                        <span className={`rounded-full px-2.5 py-1 ${getAudiencePillClasses(entry.audience)}`}>
                                          {getMealAudienceLabel(entry.audience)}
                                        </span>
                                      )}
                                      {entry.servingMultiplier ? (
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                          {entry.servingMultiplier}x
                                        </span>
                                      ) : null}
                                    </div>
                                    <h4 className="mt-2 text-[15px] font-semibold leading-5 text-slate-950 sm:text-base">{recipe.name}</h4>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                                      {(isCarryoverEntry ? carryoverKcal : recipe.estimatedKcal) ? (
                                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                          {isCarryoverEntry ? carryoverKcal : recipe.estimatedKcal} kcal
                                        </span>
                                      ) : null}
                                    </div>
                                    {isCarryoverEntry ? (
                                      entryUsage?.carryoverStatus === 'active' ? (
                                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                                          {formatIngredientQuantity(entryUsage.carryoverPortions)} portions
                                          {entryUsage.carryoverSourceDate ? ` from ${formatCarryoverTargetDayLabel(entryUsage.carryoverSourceDate)}` : ''}
                                          {entryUsage.batchYieldPortions ? ` · batch ${entryUsage.batchYieldPortions}` : ''}
                                        </p>
                                      ) : (
                                        <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">
                                          {entryUsage?.warningMessage || 'Carryover is no longer available from the source meal.'}
                                        </div>
                                      )
                                    ) : (
                                      <div className="mt-2 space-y-2">
                                        {entryUsage?.usedCarryoverPortions > 0 ? (
                                          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-700">
                                            Carryover {formatIngredientQuantity(entryUsage.usedCarryoverPortions)} portions
                                            {entryUsage.carryoverSourceDate ? ` from ${formatCarryoverDayLabel(entryUsage.carryoverSourceDate)}` : ''}
                                          </div>
                                        ) : null}
                                        {entryUsage?.usedCarryoverPortions === 0 && entryUsage?.createdCarryoverPortions > 0 ? (
                                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                                            Carryover ready: {formatIngredientQuantity(entryUsage.createdCarryoverPortions)} portions
                                          </div>
                                        ) : null}
                                      </div>
                                    )}
                                  </>
                                );
                                return (
                                  <div key={entry.id} className={`pm-scroll-optimize-card pm-meal-planner-repeated-card rounded-[16px] border px-2.5 py-2.5 sm:rounded-[22px] sm:px-3 sm:py-3 ${isCarryoverEntry ? 'border-sky-100 bg-white' : 'border-slate-200 bg-slate-50/60'}`}>
                                    {isCarryoverEntry ? (
                                      <div className="block w-full text-left">
                                        {cardBody}
                                      </div>
                                    ) : (
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
                                          canEditEntry: canModifyEntry,
                                          entryOwnerLabel,
                                        })}
                                        className="block w-full text-left transition hover:text-[var(--pm-accent-strong)]"
                                      >
                                        {cardBody}
                                      </button>
                                    )}

                                    <div className={`grid ${isCarryoverEntry ? 'mt-2 grid-cols-2 gap-1.5' : 'mt-3 grid-cols-2 gap-2'}`}>
                                      {isCarryoverEntry ? (
                                        <>
                                          {canMoveCarryover ? (
                                            <button
                                              type="button"
                                              onClick={() => void handleMoveCarryover(entry.id)}
                                              className="pm-subtle-button rounded-full px-2.5 py-2 text-[10px] font-semibold"
                                            >
                                              Move forward
                                            </button>
                                          ) : null}
                                          {canModifyEntry ? (
                                            <button
                                              type="button"
                                              onClick={() => void handleRemoveCarryover(entry.id)}
                                              className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-2 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-100"
                                            >
                                              Remove
                                            </button>
                                          ) : (
                                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-2 text-[10px] font-semibold text-slate-600">
                                              Read only
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        canModifyEntry ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => openPicker(day.key, slot, { entryId: entry.id, audience: entry.audience || 'all' })}
                                              className="pm-subtle-button rounded-full px-3 py-2 text-[11px] font-semibold sm:text-xs"
                                            >
                                              Change
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => void handleRemovePlannedMeal(entry.id)}
                                              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 sm:text-xs"
                                            >
                                              Remove
                                            </button>
                                            {canCreateCarryover ? (
                                              <button
                                                type="button"
                                                onClick={() => void handleCreateCarryover(entry.id)}
                                                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 sm:text-xs"
                                              >
                                                Carry over to next day
                                              </button>
                                            ) : null}
                                            {entryUsage?.hasCarryoverChild && entryUsage?.carryoverChildDate ? (
                                              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-semibold text-sky-700 sm:text-xs">
                                                Carried to {formatCarryoverTargetDayLabel(entryUsage.carryoverChildDate)}
                                              </span>
                                            ) : null}
                                          </>
                                        ) : (
                                          <>
                                            <span className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 sm:text-xs">
                                              {entryOwnerLabel}&apos;s plan
                                            </span>
                                            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600 sm:text-xs">
                                              Read only
                                            </span>
                                          </>
                                        )
                                      )}
                                    </div>

                                    {isCopyPromptVisible && !isCarryoverEntry ? (
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
                                className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-dashed border-slate-300 px-3 py-3 text-[13px] font-semibold text-slate-500 transition hover:border-[var(--pm-accent)] hover:text-[var(--pm-accent-strong)] sm:rounded-[22px] sm:py-4 sm:text-sm"
                              >
                                <Plus className="h-4 w-4" />
                                {slotEntries.length > 0 ? (plannerIsShared ? 'Add to your plan' : 'Add another meal') : 'Select recipe'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}
                  />
                )})}
              </div>
              ) : null}
            </div>

            {(isRecipeLibraryVisible || isShoppingGenerationVisible) ? (
            <div className="w-full min-w-0 space-y-4">
              <div className={`pm-scroll-optimize-section pm-meal-planner-panel w-full min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${!isRecipeLibraryVisible ? 'hidden' : ''}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="pm-kicker">Recipe library</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Pick from imported or manual meals</h3>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <button type="button" onClick={() => setFormState(DEFAULT_FORM_STATE)} className="pm-subtle-button w-full rounded-full px-3 py-2 text-xs font-semibold sm:w-auto">
                      Add recipe
                    </button>
                  </div>
                </div>

                {isRecipeLibraryVisible ? (
                  <>
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
                    <p className="mt-2 text-xs text-slate-500">
                      Showing {visibleLibraryRecipes.length} of {filteredLibraryRecipes.length} recipe{filteredLibraryRecipes.length === 1 ? '' : 's'}
                      {deferredLibrarySearch.trim() ? ` for "${deferredLibrarySearch.trim()}"` : ''}.
                    </p>

                    <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto pr-1">
                      {visibleLibraryRecipes.map((recipe) => (
                        <div key={recipe.id} className="pm-scroll-optimize-card pm-meal-planner-repeated-card rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
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
                                <span className="hidden rounded-full bg-white px-2.5 py-1 text-slate-600 shadow-sm sm:inline-flex">{recipe.sourcePdf}</span>
                              ) : null}
                            </div>
                            <h4 className="mt-3 text-base font-semibold text-slate-950">{recipe.name}</h4>
                            <p className="mt-2 text-sm text-slate-500">{recipeDisplayMetaById[recipe.id]?.libraryIngredients || ''}</p>
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
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            <button type="button" onClick={() => openQuickPlan(recipe)} className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold">Add to week</button>
                            <button type="button" onClick={() => setFormState(buildRecipeFormState(recipe))} className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold">Edit</button>
                            <button type="button" onClick={() => void duplicateRecipe(recipe)} className="pm-subtle-button rounded-full px-3 py-2 text-xs font-semibold">Duplicate</button>
                            <button type="button" onClick={() => void deleteRecipe(recipe.id)} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {filteredLibraryRecipes.length > visibleLibraryRecipes.length ? (
                      <button
                        type="button"
                        onClick={() => setLibraryVisibleCount((previous) => previous + (isMobile ? MOBILE_LIBRARY_INITIAL_COUNT : DESKTOP_LIBRARY_INITIAL_COUNT))}
                        className="pm-subtle-button mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                      >
                        Show {Math.min(isMobile ? MOBILE_LIBRARY_INITIAL_COUNT : DESKTOP_LIBRARY_INITIAL_COUNT, filteredLibraryRecipes.length - visibleLibraryRecipes.length)} more recipes
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Open the recipe library when you want to search, edit, or add meals to the week.
                  </div>
                )}
              </div>

              <div className={`pm-scroll-optimize-section pm-meal-planner-panel w-full min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${!isShoppingGenerationVisible ? 'hidden' : ''}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="pm-kicker">Shopping generation</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Review before adding groceries</h3>
                  </div>
                </div>
                {isShoppingGenerationVisible ? (
                  <>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {isCombinedPlanView
                        ? 'The planner aggregates ingredients across every visible household plan for this week, including repeated meals across family members.'
                        : 'The planner aggregates ingredients across your week, including repeated meals like oats on multiple days.'}
                    </p>
                    <div className="mt-4 rounded-[20px] border border-sky-100 bg-sky-50 px-4 py-3 text-[13px] leading-5 text-sky-800">
                      <p className="font-semibold text-sky-900">Meal plan groceries are synced as one weekly batch.</p>
                      <p className="mt-1">
                        If you remove or change recipes after approving groceries, open this review again and press Update Shopping List. The generated batch is replaced, while manual groceries stay as they are.
                      </p>
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span>Planned slots</span>
                        <span className="font-semibold text-slate-900">{plannerEntries.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                        <span>Draft batch lines</span>
                        <span className="font-semibold text-slate-900">{plannerGroceryDraft.length}</span>
                      </div>
                      {hasApprovedGroceryBatch ? (
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-3 py-2.5 text-emerald-800">
                          <span>Shopping List batch</span>
                          <span className="font-semibold">Already synced</span>
                        </div>
                      ) : null}
                    </div>
                    <button type="button" onClick={() => setShowReviewModal(true)} className="pm-toolbar-primary mt-4 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white">
                      {hasApprovedGroceryBatch ? 'Review / update groceries' : 'Review groceries'}
                    </button>
                  </>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Open this summary when you want to review counts and send the week into Shopping List.
                  </div>
                )}
              </div>
            </div>
            ) : null}
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
              await handleRemovePlannedMeal(detailContext.entry?.id || '');
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
          onSave={handleCreateOrUpdateRecipe}
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
          draft={plannerGroceryDraft}
          canClearApprovedBatch={hasApprovedGroceryBatch}
          hiddenDraft={plannerHiddenGroceryDraft}
          onApprove={(draftOverride) => void handleApproveGroceries(draftOverride)}
          onClose={() => setShowReviewModal(false)}
          onExclude={(item) => excludeGroceryDraftItem(item)}
          onRestore={(item) => restoreExcludedGroceryDraftItem(item)}
          onRestoreAll={() => restoreAllExcludedGroceryDraftItems()}
          saving={saving}
          weekLabel={weekLabel}
        />
      ) : null}
    </div>
  );
}
