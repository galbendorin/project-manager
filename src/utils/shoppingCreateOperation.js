import { applyShoppingContribution, reconcileShoppingContribution,
  validateShoppingAddAcknowledgement, validateShoppingIntentAcknowledgement } from './shoppingContributionRpc.js';

const MAX_REVISION = 9223372036854775807n;
const revision = value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= MAX_REVISION;
const maxRevision = (...values) => values.filter(value => value !== null && value !== undefined)
  .reduce((largest, value) => BigInt(value) > BigInt(largest) ? value : largest, '0');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
const DRAFT_FIELDS = ['title', 'quantityValue', 'quantityUnit', 'status', 'cancel'];

function validateDraft(draft) {
  if (!object(draft) || typeof draft.title !== 'string' || !draft.title.trim()
    || typeof draft.quantityUnit !== 'string' || typeof draft.cancel !== 'boolean'
    || !['Open', 'Done'].includes(draft.status)
    || !(draft.quantityValue === null || (typeof draft.quantityValue === 'number' && Number.isFinite(draft.quantityValue)
      && draft.quantityValue >= 0))) {
    fail('SHOPPING_DRAFT_INVALID');
  }
  return draft;
}

function stateOf(record) {
  const state = record?.desired;
  if (!state || state.protocolVersion !== 1 || !revision(state.revision) || !revision(state.reviewedServerRevision) || !Array.isArray(state.intents)
    || !object(state.source) || !(state.addResult === null || object(state.addResult))) fail('SHOPPING_OPERATION_INVALID');
  validateDraft(state.draft);
  const revisions = new Set();
  const ids = new Set();
  for (const intent of state.intents) {
    if (!revision(intent.revision) || intent.revision === '0' || BigInt(intent.revision) > BigInt(state.revision)
      || typeof intent.id !== 'string' || !intent.id || ids.has(intent.id) || revisions.has(intent.revision)
      || !(intent.result === null || object(intent.result))) fail('SHOPPING_OPERATION_INVALID');
    ids.add(intent.id);
    revisions.add(intent.revision);
    validateDraft(intent.desired);
  }
  if (record.submission !== null && (!object(record.submission?.item)
    || !(record.submission.baselineRevision === null || revision(record.submission.baselineRevision))
    || (record.submission.baselineRevision !== null && BigInt(record.submission.baselineRevision) > BigInt(state.revision)))) {
    fail('SHOPPING_OPERATION_INVALID');
  }
  if ((state.addResult || state.intents.length) && !record.submission) fail('SHOPPING_OPERATION_INVALID');
  if (state.intents.length && !state.addResult) fail('SHOPPING_OPERATION_INVALID');
  try {
    if (record.submission) validateDraft({ ...record.submission.item, status: 'Open', cancel: false });
    const scope = { operationId: record.operationId, projectId: record.projectId, userId: record.userId };
    if (state.addResult) validateShoppingAddAcknowledgement(state.addResult, scope);
    for (const intent of state.intents) {
      if (record.submission.baselineRevision !== null
        && BigInt(intent.revision) <= BigInt(record.submission.baselineRevision)) fail('SHOPPING_OPERATION_INVALID');
      if (intent.result) validateShoppingIntentAcknowledgement(intent.result,
        { ...scope, desiredRevision: intent.revision, desired: intent.desired });
    }
  } catch { fail('SHOPPING_OPERATION_INVALID'); }
  return state;
}

const observedRevision = state => maxRevision(state.addResult?.confirmed_revision,
  ...state.intents.flatMap(intent => [intent.result?.confirmed_revision,
    intent.result?.latest_confirmed_revision, intent.result?.latest_received_revision]));

// This projection is an operation status, not a replacement grocery snapshot.
// Even an applied response can be historical by the time a view receives it.
export function shoppingCreateProgress(record) {
  const state = stateOf(record);
  const view = { revision: state.revision, desired: copy(state.draft), confirmedRevision: null,
    contribution: null, requiresRefresh: false };
  if (!record.submission) return { ...view, status: state.draft.cancel ? 'local_cancelled' : 'pending_add' };
  if (!state.addResult) return { ...view, status: 'pending_add' };

  let confirmation = null;
  if (state.addResult.confirmed_revision === '0' && record.submission.baselineRevision !== null) {
    confirmation = { revision: record.submission.baselineRevision, serverRevision: '0', contribution: state.addResult.contribution,
      missing: !state.addResult.row_exists };
  }
  for (const intent of state.intents) {
    if (intent.result?.outcome === 'applied'
      && (!confirmation || BigInt(intent.revision) > BigInt(confirmation.revision))) {
      confirmation = { revision: intent.revision, serverRevision: intent.revision, contribution: intent.result.contribution, missing: false };
    }
  }
  if (confirmation && state.addResult.contribution !== null && !state.addResult.row_exists
    && BigInt(state.addResult.confirmed_revision) >= BigInt(confirmation.serverRevision)) confirmation.missing = true;
  view.confirmedRevision = confirmation?.revision ?? null;
  view.contribution = copy(confirmation?.contribution ?? null);
  view.requiresRefresh = true;
  // Retry saved requests before inferring anything from replay watermarks.
  // Their exact stored outcomes can recover acknowledgements lost in another tab.
  if (state.intents.some(intent => intent.result === null)) return { ...view, status: 'pending_change' };

  const received = maxRevision(...state.intents.map(intent => intent.result?.latest_received_revision));
  const serverConfirmed = maxRevision(state.addResult.confirmed_revision,
    ...state.intents.flatMap(intent => [intent.result?.confirmed_revision, intent.result?.latest_confirmed_revision]));
  const knownConfirmed = maxRevision(...state.intents.filter(intent => intent.result?.outcome === 'applied').map(intent => intent.revision));
  const knownReceived = maxRevision(...state.intents.map(intent => intent.revision));
  if ((BigInt(serverConfirmed) > BigInt(knownConfirmed) || BigInt(received) > BigInt(knownReceived))
    && BigInt(state.reviewedServerRevision) < BigInt(maxRevision(serverConfirmed, received))) {
    return { ...view, status: 'needs_review', reason: 'unknown_server_revision' };
  }
  const latest = state.intents.find(intent => intent.revision === state.revision);
  if (latest?.result && latest.result.outcome !== 'applied') {
    return { ...view, status: 'needs_review', reason: latest.result.outcome };
  }
  if (confirmation?.missing) return { ...view, status: 'needs_review', reason: 'missing_grocery' };
  if (confirmation?.revision === state.revision) return { ...view, status: 'settled' };
  return { ...view, status: 'pending_change' };
}

// Each call sends at most one request. Scheduling/backoff and the visible list
// stay with the caller. Use a session-bound Supabase client: its transport must
// also fence authentication if it awaits before dispatching the HTTP request.
export function createShoppingCreateOperations({ journal, supabaseClient, getCurrentUserId,
  createIntentId = () => globalThis.crypto.randomUUID(), maxConflicts = 8 } = {}) {
  if (!journal || typeof getCurrentUserId !== 'function' || typeof createIntentId !== 'function'
    || !Number.isInteger(maxConflicts) || maxConflicts < 1) fail('SHOPPING_CONTROLLER_INVALID');
  const read = async operationId => {
    const record = await journal.read(operationId);
    if (!record) fail('JOURNAL_OPERATION_MISSING');
    stateOf(record);
    return record;
  };
  const change = async (operationId, transform) => {
    for (let attempt = 0; attempt < maxConflicts; attempt++) {
      const record = await read(operationId);
      const next = transform(record);
      if (!next) return record;
      try { return await journal.setDesired(operationId, record.recordVersion, next); }
      catch (error) { if (error.code !== 'JOURNAL_VERSION_CONFLICT') throw error; }
    }
    fail('JOURNAL_VERSION_CONFLICT');
  };

  const prepare = async operationId => {
    for (let attempt = 0; attempt < maxConflicts; attempt++) {
      const record = await read(operationId);
      const state = stateOf(record);
      const progress = shoppingCreateProgress(record);
      if (['settled', 'local_cancelled', 'needs_review'].includes(progress.status)) return { record, command: null };
      if (!record.submission) {
        const { title, quantityValue, quantityUnit, status } = state.draft;
        // add_v3 always adds Open. A pre-send Done edit still needs an intent.
        const submission = { item: { title, quantityValue, quantityUnit, ...state.source },
          baselineRevision: status === 'Open' ? state.revision : null };
        try { await journal.freezeSubmission(operationId, record.recordVersion, submission); }
        catch (error) { if (error.code !== 'JOURNAL_VERSION_CONFLICT') throw error; }
        continue;
      }
      if (!state.addResult) return { record, command: { kind: 'add', submission: copy(record.submission) } };
      const pending = state.intents.find(intent => intent.result === null);
      if (pending) return { record, command: { kind: 'intent', intent: copy(pending) } };
      const id = createIntentId();
      if (typeof id !== 'string' || !id || state.intents.some(intent => intent.id === id)) fail('SHOPPING_INTENT_ID_INVALID');
      const intent = { id, revision: state.revision, desired: copy(state.draft), result: null };
      if (intent.revision === '0') fail('SHOPPING_OPERATION_INVALID');
      try {
        await journal.setDesired(operationId, record.recordVersion, { ...state, intents: [...state.intents, intent] });
      } catch (error) { if (error.code !== 'JOURNAL_VERSION_CONFLICT') throw error; }
    }
    fail('JOURNAL_VERSION_CONFLICT');
  };

  return {
    read,
    create: ({ operationId, projectId, localId, item }) => {
      if (!object(item) || (item.status !== undefined && item.status !== 'Open')) fail('SHOPPING_DRAFT_INVALID');
      const draft = validateDraft({ title: item.title, quantityValue: item.quantityValue ?? null,
        quantityUnit: item.quantityUnit ?? '', status: 'Open', cancel: false });
      return journal.create({ operationId, projectId, localId, desired: { protocolVersion: 1,
        revision: '0', reviewedServerRevision: '0', draft, source: { sourceType: item.sourceType ?? '', sourceBatchId: item.sourceBatchId ?? null,
          meta: item.meta ?? {} }, addResult: null, intents: [] } });
    },
    edit: (operationId, expectedRevision, patch, { fromPendingView = false } = {}) => {
      if (!revision(expectedRevision) || !object(patch) || Object.keys(patch).some(key => !DRAFT_FIELDS.includes(key))) {
        fail('SHOPPING_DRAFT_INVALID');
      }
      const savedPatch = copy(patch);
      // A CAS retry may discover an acknowledgement that arrived after this
      // edit began. It must not turn that discovery into an implicit review.
      let reviewedAtStart;
      return change(operationId, record => {
        const state = stateOf(record);
        reviewedAtStart ??= observedRevision(state);
        if (state.revision !== expectedRevision) fail('SHOPPING_DESIRED_CONFLICT');
        const status = shoppingCreateProgress(record).status;
        if (status === 'local_cancelled' || (status === 'settled' && !fromPendingView)) fail('SHOPPING_OPERATION_SETTLED');
        const draft = validateDraft({ ...state.draft, ...savedPatch });
        if (DRAFT_FIELDS.every(key => draft[key] === state.draft[key])) return null;
        const previousRevision = maxRevision(state.revision, observedRevision(state));
        if (BigInt(previousRevision) === MAX_REVISION) fail('SHOPPING_REVISION_EXHAUSTED');
        return { ...state, draft, revision: String(BigInt(previousRevision) + 1n),
          reviewedServerRevision: maxRevision(state.reviewedServerRevision, reviewedAtStart) };
      });
    },
    syncOnce: async operationId => {
      const { record, command } = await prepare(operationId);
      if (!command) return { record, progress: shoppingCreateProgress(record), sent: false, error: null };
      // Re-check after preparation awaits and immediately before adapter entry.
      await read(operationId);
      if (getCurrentUserId() !== record.userId) fail('JOURNAL_OWNER_CHANGED');
      const options = { supabaseClient, operationId, projectId: record.projectId };
      const response = command.kind === 'add'
        ? await applyShoppingContribution({ ...options, userId: record.userId, item: command.submission.item })
        : await reconcileShoppingContribution({ ...options, intentId: command.intent.id,
          desiredRevision: command.intent.revision, desired: command.intent.desired });
      if (response.error) {
        const current = await read(operationId);
        return { record: current, progress: shoppingCreateProgress(current), sent: true, error: response.error };
      }
      const acknowledged = await change(operationId, current => {
        const state = stateOf(current);
        if (command.kind === 'add') {
          const previous = state.addResult;
          if (previous && (BigInt(previous.confirmed_revision) > BigInt(response.data.confirmed_revision)
            || (previous.confirmed_revision === response.data.confirmed_revision && !previous.row_exists))) return null;
          return { ...state, addResult: response.data };
        }
        const index = state.intents.findIndex(intent => intent.id === command.intent.id && intent.revision === command.intent.revision);
        if (index < 0) fail('SHOPPING_INTENT_MISSING');
        const previous = state.intents[index].result;
        if (previous && previous.outcome !== response.data.outcome) fail('SHOPPING_ACK_CONFLICT');
        const result = { ...response.data, latest_received_revision: maxRevision(previous?.latest_received_revision,
          response.data.latest_received_revision) };
        if (previous?.replayed || result.replayed) {
          result.replayed = true;
          result.latest_confirmed_revision = maxRevision(previous?.latest_confirmed_revision,
            previous?.confirmed_revision, result.latest_confirmed_revision, result.confirmed_revision);
        }
        const intents = [...state.intents];
        intents[index] = { ...intents[index], result };
        return { ...state, intents };
      });
      return { record: acknowledged, progress: shoppingCreateProgress(acknowledged), sent: true, error: null };
    },
  };
}
