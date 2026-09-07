const ADD_RPC = 'apply_shopping_list_add_v3';
const RECONCILE_RPC = 'reconcile_shopping_contribution_v1';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isRevision = value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
  && BigInt(value) <= 9223372036854775807n;
const invalid = message => Object.assign(new Error(message), { code: 'SHOPPING_ACK_INVALID' });
const requireCondition = (condition, message) => { if (!condition) throw invalid(message); };

export const isMissingShoppingContributionRpc = error => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return ['42883', 'PGRST202'].includes(String(error?.code || ''))
    && (message.includes(ADD_RPC) || message.includes(RECONCILE_RPC));
};

function validateContribution(value, projectId) {
  requireCondition(isObject(value) && ['inserted', 'merged'].includes(value.kind), 'Shopping returned invalid contribution evidence.');
  requireCondition(typeof value.row_id === 'string' && value.row_id.length > 0
    && isRevision(value.revision) && BigInt(value.revision) > 0n, 'Shopping returned an invalid item revision.');
  requireCondition(isObject(value.after) && value.after.id === value.row_id
    && value.after.project_id === projectId, 'Shopping returned evidence for a different item or list.');
  requireCondition(value.kind === 'inserted' ? value.before === null
    : isObject(value.before) && value.before.id === value.row_id && value.before.project_id === projectId,
  'Shopping returned an invalid before image.');
}

async function callRpc(supabaseClient, name, args, validate) {
  if (typeof supabaseClient?.rpc !== 'function') {
    return { data: null, error: new Error('Shopping is not ready to sync.') };
  }
  try {
    const response = await supabaseClient.rpc(name, args);
    if (response.error) return { data: null, error: response.error };
    const data = Array.isArray(response.data) && response.data.length === 1 ? response.data[0] : response.data;
    requireCondition(isObject(data), 'Shopping did not confirm this operation.');
    validate(data);
    return { data, error: null };
  } catch (error) { return { data: null, error }; }
}

// Call only with the immutable payload acknowledged by the journal. These
// adapters never downgrade to v2 or infer success from a matching grocery row.
export function applyShoppingContribution({ supabaseClient, operationId, projectId, userId, item } = {}) {
  if (!operationId || !projectId || !userId || !isObject(item)) {
    return Promise.resolve({ data: null, error: invalid('Shopping operation identity is missing.') });
  }
  return callRpc(supabaseClient, ADD_RPC, {
    target_operation_id: operationId,
    target_project_id: projectId,
    target_title: item.title,
    target_quantity_value: item.quantityValue ?? null,
    target_quantity_unit: item.quantityUnit || '',
    target_source_type: item.sourceType || '',
    target_source_batch_id: item.sourceBatchId || null,
    target_meta: item.meta || {},
  }, data => {
    requireCondition(['applied', 'already_applied'].includes(data.outcome), 'Shopping returned an unknown add outcome.');
    requireCondition(data.operation_id === operationId && data.project_id === projectId && data.user_id === userId,
      'Shopping confirmed a different operation, list or user.');
    requireCondition(isRevision(data.confirmed_revision), 'Shopping returned an invalid confirmed revision.');
    if (data.contribution !== null) validateContribution(data.contribution, projectId);
    else requireCondition(data.outcome === 'already_applied' && BigInt(data.confirmed_revision) > 0n,
      'Shopping omitted the original contribution.');
    requireCondition(typeof data.row_exists === 'boolean', 'Shopping did not confirm whether the grocery exists.');
    requireCondition(data.row_exists
      ? isObject(data.current_item) && data.current_item.id === data.contribution?.row_id && data.current_item.project_id === projectId
      : data.current_item === null, 'Shopping returned an inconsistent current grocery.');
  });
}

export function reconcileShoppingContribution({
  supabaseClient, operationId, projectId, intentId, desiredRevision, desired,
} = {}) {
  if (!operationId || !projectId || !intentId || !isRevision(desiredRevision) || desiredRevision === '0'
    || !isObject(desired) || typeof desired.cancel !== 'boolean') {
    return Promise.resolve({ data: null, error: invalid('Shopping intent identity is missing or invalid.') });
  }
  return callRpc(supabaseClient, RECONCILE_RPC, {
    target_operation_id: operationId,
    target_project_id: projectId,
    target_intent_id: intentId,
    target_desired_revision: desiredRevision,
    target_cancel: desired.cancel,
    target_title: desired.title ?? null,
    target_quantity_value: desired.quantityValue ?? null,
    target_quantity_unit: desired.quantityUnit || '',
    target_status: desired.status || 'Open',
  }, data => {
    requireCondition(['applied', 'superseded', 'needs_review'].includes(data.outcome), 'Shopping returned an unknown reconciliation outcome.');
    requireCondition(data.operation_id === operationId && data.desired_revision === desiredRevision,
      'Shopping confirmed a different operation or intent revision.');
    requireCondition(isRevision(data.confirmed_revision) && isRevision(data.latest_received_revision)
      && BigInt(data.latest_received_revision) >= BigInt(desiredRevision)
      && typeof data.replayed === 'boolean', 'Shopping returned invalid reconciliation revisions.');
    if (data.replayed) requireCondition(isRevision(data.latest_confirmed_revision)
      && BigInt(data.latest_confirmed_revision) >= BigInt(data.confirmed_revision), 'Shopping returned an invalid replay revision.');
    if (data.outcome === 'applied') {
      requireCondition(data.confirmed_revision === desiredRevision, 'Shopping did not confirm the submitted intent.');
      if (desired.cancel) requireCondition(data.contribution === null, 'Shopping did not confirm the cancellation.');
      else validateContribution(data.contribution, projectId);
      requireCondition(Array.isArray(data.affected_items) && data.affected_items.every(row => isObject(row)
        && typeof row.id === 'string' && row.project_id === projectId)
        && Array.isArray(data.removed_row_ids) && data.removed_row_ids.every(id => typeof id === 'string'),
      'Shopping returned invalid affected groceries.');
    }
    // needs_review and superseded remain distinct, non-success outcomes. All
    // returned row images remain historical when replayed; do not hydrate from
    // them without reconciling against the latest local desired revision.
  });
}
