import { buildRecurringFollowUpInsert } from './todos.js';
import {
  LEGACY_MANUAL_TODO_SELECT,
  MANUAL_TODO_SELECT,
  isMissingRelationError,
  isMissingSchemaFieldError,
  mapManualTodoRow,
  normalizeTodoRecurrence,
} from './manualTodoUtils.js';

const EXTENDED_MANUAL_TODO_FIELDS = ['description', 'kanban_column_id', 'kanban_position'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECURRING_UUID_NAMESPACE_BYTES = Uint8Array.from([
  0xb9, 0x3a, 0x0f, 0x12,
  0x7e, 0x6c,
  0x4a, 0x1d,
  0x9c, 0x5e,
  0x21, 0x0f, 0x3a, 0x4b, 0x5c, 0x6d,
]);

const encodeUtf8Bytes = (value) => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value);
  }
  const encoded = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    bytes[i] = encoded.charCodeAt(i);
  }
  return bytes;
};

const leftRotate32 = (value, bits) => ((value << bits) | (value >>> (32 - bits))) >>> 0;

const sha1DigestBytes = (inputBytes) => {
  const length = inputBytes.length;
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(inputBytes);
  padded[length] = 0x80;

  const bitLengthHigh = Math.floor((length * 8) / 0x100000000);
  const bitLengthLow = (length * 8) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLengthHigh, false);
  view.setUint32(paddedLength - 4, bitLengthLow, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      words[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i += 1) {
      words[i] = leftRotate32(words[i - 3] ^ words[i - 8] ^ words[i - 14] ^ words[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i += 1) {
      let f = 0;
      let k = 0;
      if (i < 20) {
        f = ((b & c) | ((~b) & d)) >>> 0;
        k = 0x5a827999;
      } else if (i < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = 0x8f1bbcdc;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = 0xca62c1d6;
      }

      const temp = (leftRotate32(a, 5) + f + e + k + words[i]) >>> 0;
      e = d;
      d = c;
      c = leftRotate32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
};

export const deriveRecurringFollowUpId = (parentTodoId) => {
  const normalized = String(parentTodoId || '').trim();
  if (!normalized) return '';
  const nameBytes = encodeUtf8Bytes(`recurring-follow-up:${normalized}`);
  const combined = new Uint8Array(RECURRING_UUID_NAMESPACE_BYTES.length + nameBytes.length);
  combined.set(RECURRING_UUID_NAMESPACE_BYTES, 0);
  combined.set(nameBytes, RECURRING_UUID_NAMESPACE_BYTES.length);

  const hash = sha1DigestBytes(combined).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

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

export const hasVerifiedRecurrenceLink = (row, parentTodoId) => Boolean(
  row
  && parentTodoId
  && (
    row.recurrence_source_todo_id === parentTodoId
    || row.meta?.recurrenceSourceTodoId === parentTodoId
  )
);

export const isMissingRecurringRpcError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  if (code === '42883' || code === 'PGRST202') return true;
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('complete_recurring_manual_todo_v1')
    && (message.includes('could not find') || message.includes('does not exist'));
};

export const isStaleRecurringCompletionError = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toUpperCase();
  return message.includes('RECURRING_COMPLETION_STALE');
};

const parseComparableTimestamp = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};

export async function completeRecurringManualTodoAtomic({
  client,
  todoId,
  followUpId = null,
  fallbackDate = null,
  completedAt = null,
  requireAlreadyDone = false,
  expectedCompletedAt = null,
  isCurrent = () => true,
}) {
  const active = () => (typeof isCurrent === 'function' ? Boolean(isCurrent()) : true);
  if (!active()) {
    return { ok: false, cancelled: true, missingRpc: false };
  }
  if (!client || !todoId) {
    return { ok: false, missingRpc: false, error: new Error('Invalid atomic recurring completion parameters.') };
  }

  try {
    const rpcPayload = {
      p_todo_id: todoId,
      p_fallback_date: fallbackDate || null,
      p_completed_at: completedAt || null,
      p_follow_up_id: isValidRecurringUuid(followUpId) ? followUpId : null,
      ...(requireAlreadyDone
        ? {
            p_require_already_done: true,
            p_expected_completed_at: expectedCompletedAt || null,
          }
        : {}),
    };
    const { data, error } = await client.rpc('complete_recurring_manual_todo_v1', rpcPayload);
    if (!active()) {
      return { ok: false, cancelled: true, missingRpc: false };
    }
    if (error) {
      return {
        ok: false,
        missingRpc: isMissingRecurringRpcError(error),
        staleCompletion: isStaleRecurringCompletionError(error),
        error,
      };
    }
    if (!data || Array.isArray(data) || data.updated_todo?.id !== todoId) {
      return {
        ok: false,
        missingRpc: false,
        error: new Error('The completed recurring task could not be confirmed.'),
      };
    }
    if (data.follow_up_todo && data.follow_up_todo.recurrence_source_todo_id !== todoId) {
      return {
        ok: false,
        missingRpc: false,
        error: new Error('The next recurring task link could not be verified.'),
      };
    }

    return {
      ok: true,
      updatedTodo: mapManualTodoRow(data.updated_todo),
      followUpTodo: data.follow_up_todo ? mapManualTodoRow(data.follow_up_todo) : null,
    };
  } catch (error) {
    if (!active()) {
      return { ok: false, cancelled: true, missingRpc: false };
    }
    return {
      ok: false,
      missingRpc: isMissingRecurringRpcError(error),
      staleCompletion: isStaleRecurringCompletionError(error),
      error,
    };
  }
}

export async function ensureRecurringManualTodoFollowUp({
  client,
  userId,
  followUpId,
  sourceTodo,
  normalizedRecurrence,
  nextRecurringDueDate,
  supportsExtendedFields = true,
  requireParentDone = false,
  expectedCompletedAt = null,
  onSchemaFallback,
  isCurrent = () => true,
}) {
  const active = () => (typeof isCurrent === 'function' ? Boolean(isCurrent()) : true);
  if (!active()) {
    return { ok: false, cancelled: true, missingTable: false };
  }
  if (!client || !userId || !isValidRecurringUuid(followUpId) || !sourceTodo?._id || !normalizedRecurrence) {
    return { ok: false, missingTable: false, error: new Error('Invalid recurring follow-up parameters.') };
  }

  let extended = Boolean(supportsExtendedFields);
  const selectFor = (useExtended) => `${useExtended ? MANUAL_TODO_SELECT : LEGACY_MANUAL_TODO_SELECT}, user_id`;

  const matchesVerifiedScope = (row) => (
    row?.id === followUpId
    && (sourceTodo.projectId ? row?.project_id === sourceTodo.projectId : row?.user_id === userId)
    && hasVerifiedRecurrenceLink(row, sourceTodo._id)
  );

  const buildFollowUpPayload = (useExtended) => ({
    ...buildRecurringFollowUpInsert({
      userId,
      localUpdated: sourceTodo,
      normalizedRecurrence,
      nextRecurringDueDate,
      supportsExtendedFields: useExtended,
    }),
    id: followUpId,
    meta: { recurrenceSourceTodoId: sourceTodo._id },
  });

  const reconcile = async () => {
    if (!active()) {
      return { cancelled: true, row: null, error: null, missingTable: false };
    }

    const queryFor = (useExtended) => {
      let query = client
        .from('manual_todos')
        .select(selectFor(useExtended))
        .eq('id', followUpId);
      query = sourceTodo.projectId
        ? query.eq('project_id', sourceTodo.projectId)
        : query.eq('user_id', userId);
      return query.maybeSingle();
    };

    let result = await queryFor(extended);
    if (!active()) {
      return { cancelled: true, row: null, error: null, missingTable: false };
    }

    if (result.error && extended && isMissingSchemaFieldError(result.error, EXTENDED_MANUAL_TODO_FIELDS)) {
      extended = false;
      onSchemaFallback?.();
      if (!active()) {
        return { cancelled: true, row: null, error: null, missingTable: false };
      }
      result = await queryFor(false);
      if (!active()) {
        return { cancelled: true, row: null, error: null, missingTable: false };
      }
    }

    if (result.error) {
      return {
        cancelled: false,
        row: null,
        error: result.error,
        missingTable: isMissingRelationError(result.error, 'manual_todos'),
      };
    }

    if (matchesVerifiedScope(result.data)) {
      return { cancelled: false, row: result.data, error: null, missingTable: false };
    }

    if (result.data) {
      return {
        cancelled: false,
        row: null,
        error: new Error('An unlinked task already occupies the recurring follow-up identity.'),
        collision: true,
        missingTable: false,
      };
    }

    return { cancelled: false, row: null, error: null, collision: false, missingTable: false };
  };

  try {
    if (requireParentDone) {
      const parentRes = await client
        .from('manual_todos')
        .select('id, status, completed_at, recurrence, project_id, user_id')
        .eq('id', sourceTodo._id)
        .maybeSingle();
      if (!active()) {
        return { ok: false, cancelled: true, missingTable: false };
      }
      if (parentRes.error) {
        return {
          ok: false,
          missingTable: isMissingRelationError(parentRes.error, 'manual_todos'),
          error: parentRes.error,
        };
      }
      const parentRow = parentRes.data;
      if (!parentRow || parentRow.status !== 'Done') {
        return {
          ok: false,
          staleCompletion: true,
          missingTable: false,
          error: new Error('This task was reopened or changed before its next occurrence could be saved.'),
        };
      }
      if (expectedCompletedAt) {
        const actualMs = parseComparableTimestamp(parentRow.completed_at);
        const expectedMs = parseComparableTimestamp(expectedCompletedAt);
        const matchesCompletedAt = (actualMs !== null && expectedMs !== null)
          ? actualMs === expectedMs
          : String(parentRow.completed_at || '') === String(expectedCompletedAt || '');
        if (!matchesCompletedAt) {
          return {
            ok: false,
            staleCompletion: true,
            missingTable: false,
            error: new Error('This task was reopened or changed before its next occurrence could be saved.'),
          };
        }
      }
      if (!normalizeTodoRecurrence(parentRow.recurrence)) {
        return {
          ok: true,
          followUpTodo: null,
          alreadyExisted: false,
        };
      }
    }

    const existing = await reconcile();
    if (!active() || existing.cancelled) {
      return { ok: false, cancelled: true, missingTable: false };
    }
    if (existing.missingTable) {
      return { ok: false, missingTable: true, error: existing.error };
    }
    if (existing.row) {
      return { ok: true, followUpTodo: mapManualTodoRow(existing.row), alreadyExisted: true };
    }
    if (existing.collision) {
      return { ok: false, missingTable: false, error: existing.error };
    }

    if (!active()) {
      return { ok: false, cancelled: true, missingTable: false };
    }

    let select = selectFor(extended);
    let payload = buildFollowUpPayload(extended);

    let result = await client
      .from('manual_todos')
      .insert(payload)
      .select(select)
      .single();

    if (!active()) {
      return { ok: false, cancelled: true, missingTable: false };
    }

    if (result.error && extended && isMissingSchemaFieldError(result.error, EXTENDED_MANUAL_TODO_FIELDS)) {
      extended = false;
      onSchemaFallback?.();
      if (!active()) {
        return { ok: false, cancelled: true, missingTable: false };
      }
      select = selectFor(false);
      payload = buildFollowUpPayload(false);
      result = await client
        .from('manual_todos')
        .insert(payload)
        .select(select)
        .single();

      if (!active()) {
        return { ok: false, cancelled: true, missingTable: false };
      }
    }

    if (!result.error && matchesVerifiedScope(result.data)) {
      return { ok: true, followUpTodo: mapManualTodoRow(result.data), alreadyExisted: false };
    }

    if (result.error && isMissingRelationError(result.error, 'manual_todos')) {
      return { ok: false, missingTable: true, error: result.error };
    }

    if (!active()) {
      return { ok: false, cancelled: true, missingTable: false };
    }

    const postCheck = await reconcile();
    if (!active() || postCheck.cancelled) {
      return { ok: false, cancelled: true, missingTable: false };
    }
    if (postCheck.missingTable) {
      return { ok: false, missingTable: true, error: postCheck.error };
    }
    if (postCheck.row) {
      return { ok: true, followUpTodo: mapManualTodoRow(postCheck.row), alreadyExisted: true };
    }

    return {
      ok: false,
      missingTable: false,
      error: postCheck.error || result.error || new Error('The next recurring task could not be confirmed.'),
    };
  } catch (error) {
    if (!active()) {
      return { ok: false, cancelled: true, missingTable: false };
    }
    return {
      ok: false,
      missingTable: isMissingRelationError(error, 'manual_todos'),
      error,
    };
  }
}

export async function recoverRecurringManualTodoFollowUp({
  client,
  userId,
  parentTodoId = null,
  followUpId,
  sourceTodo,
  normalizedRecurrence,
  nextRecurringDueDate,
  fallbackDate = null,
  completedAt = null,
  supportsAtomicRpc = true,
  supportsExtendedFields = true,
  onMissingAtomicRpc,
  onSchemaFallback,
  isCurrent = () => true,
}) {
  const active = () => (typeof isCurrent === 'function' ? Boolean(isCurrent()) : true);
  if (!active()) {
    return { ok: false, cancelled: true, missingTable: false };
  }

  const effectiveParentId = parentTodoId || sourceTodo?._id || null;
  const expectedCompletedAt = completedAt || sourceTodo?.completedAt || null;
  if (supportsAtomicRpc && isValidRecurringUuid(effectiveParentId)) {
    const rpcResult = await completeRecurringManualTodoAtomic({
      client,
      todoId: effectiveParentId,
      followUpId,
      fallbackDate,
      completedAt: expectedCompletedAt,
      requireAlreadyDone: true,
      expectedCompletedAt,
      isCurrent,
    });
    if (rpcResult.cancelled || !active()) {
      return { ok: false, cancelled: true, missingTable: false };
    }
    if (rpcResult.ok) {
      return {
        ok: true,
        updatedTodo: rpcResult.updatedTodo,
        followUpTodo: rpcResult.followUpTodo,
        atomic: true,
      };
    }
    if (!rpcResult.missingRpc) {
      return {
        ok: false,
        missingTable: false,
        staleCompletion: Boolean(rpcResult.staleCompletion),
        error: rpcResult.staleCompletion
          ? new Error('This task was reopened or changed before its next occurrence could be saved.')
          : rpcResult.error,
      };
    }
    onMissingAtomicRpc?.();
  }

  return await ensureRecurringManualTodoFollowUp({
    client,
    userId,
    followUpId,
    sourceTodo,
    normalizedRecurrence,
    nextRecurringDueDate,
    supportsExtendedFields,
    requireParentDone: true,
    expectedCompletedAt,
    onSchemaFallback,
    isCurrent,
  });
}
