import { buildRecurringFollowUpInsert } from './todos.js';
import {
  LEGACY_MANUAL_TODO_SELECT,
  MANUAL_TODO_SELECT,
  isMissingRelationError,
  isMissingSchemaFieldError,
  mapManualTodoRow,
} from './manualTodoUtils.js';

const EXTENDED_MANUAL_TODO_FIELDS = ['description', 'kanban_column_id', 'kanban_position'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createRecurringUuid = () => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const val = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return val.toString(16);
  });
};

export const isValidRecurringUuid = (value) => UUID_PATTERN.test(String(value || '').trim());

export async function ensureRecurringManualTodoFollowUp({
  client,
  userId,
  followUpId,
  sourceTodo,
  normalizedRecurrence,
  nextRecurringDueDate,
  supportsExtendedFields = true,
  onSchemaFallback,
}) {
  if (!client || !userId || !isValidRecurringUuid(followUpId) || !sourceTodo || !normalizedRecurrence) {
    return { ok: false, missingTable: false, error: new Error('Invalid recurring follow-up parameters.') };
  }

  let extended = Boolean(supportsExtendedFields);
  const selectFor = (useExtended) => `${useExtended ? MANUAL_TODO_SELECT : LEGACY_MANUAL_TODO_SELECT}, user_id`;

  const reconcile = async () => {
    let select = selectFor(extended);
    let result = await client
      .from('manual_todos')
      .select(select)
      .eq('id', followUpId)
      .eq('user_id', userId)
      .maybeSingle();

    if (result.error && extended && isMissingSchemaFieldError(result.error, EXTENDED_MANUAL_TODO_FIELDS)) {
      extended = false;
      onSchemaFallback?.();
      select = selectFor(false);
      result = await client
        .from('manual_todos')
        .select(select)
        .eq('id', followUpId)
        .eq('user_id', userId)
        .maybeSingle();
    }

    if (result.error) {
      return {
        row: null,
        error: result.error,
        missingTable: isMissingRelationError(result.error, 'manual_todos'),
      };
    }

    if (result.data?.id === followUpId && result.data?.user_id === userId) {
      return { row: result.data, error: null, missingTable: false };
    }

    return { row: null, error: null, missingTable: false };
  };

  try {
    const existing = await reconcile();
    if (existing.missingTable) {
      return { ok: false, missingTable: true, error: existing.error };
    }
    if (existing.row) {
      return { ok: true, followUpTodo: mapManualTodoRow(existing.row), alreadyExisted: true };
    }

    let select = selectFor(extended);
    let payload = {
      ...buildRecurringFollowUpInsert({
        userId,
        localUpdated: sourceTodo,
        normalizedRecurrence,
        nextRecurringDueDate,
        supportsExtendedFields: extended,
      }),
      id: followUpId,
    };

    let result = await client
      .from('manual_todos')
      .insert(payload)
      .select(select)
      .single();

    if (result.error && extended && isMissingSchemaFieldError(result.error, EXTENDED_MANUAL_TODO_FIELDS)) {
      extended = false;
      onSchemaFallback?.();
      select = selectFor(false);
      payload = {
        ...buildRecurringFollowUpInsert({
          userId,
          localUpdated: sourceTodo,
          normalizedRecurrence,
          nextRecurringDueDate,
          supportsExtendedFields: false,
        }),
        id: followUpId,
      };
      result = await client
        .from('manual_todos')
        .insert(payload)
        .select(select)
        .single();
    }

    if (!result.error && result.data?.id === followUpId && result.data?.user_id === userId) {
      return { ok: true, followUpTodo: mapManualTodoRow(result.data), alreadyExisted: false };
    }

    if (result.error && isMissingRelationError(result.error, 'manual_todos')) {
      return { ok: false, missingTable: true, error: result.error };
    }

    const postCheck = await reconcile();
    if (postCheck.missingTable) {
      return { ok: false, missingTable: true, error: postCheck.error };
    }
    if (postCheck.row) {
      return { ok: true, followUpTodo: mapManualTodoRow(postCheck.row), alreadyExisted: true };
    }

    return {
      ok: false,
      missingTable: false,
      error: result.error || postCheck.error || new Error('The next recurring task could not be confirmed.'),
    };
  } catch (error) {
    return {
      ok: false,
      missingTable: isMissingRelationError(error, 'manual_todos'),
      error,
    };
  }
}
