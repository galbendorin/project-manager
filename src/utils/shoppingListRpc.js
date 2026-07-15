export const isMissingShoppingUpsertRpcError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42883'
    || message.includes('upsert_shopping_list_item')
    || message.includes('manual_todos');
};

export const isMissingShoppingAddV2RpcError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42883'
    || message.includes('apply_shopping_list_add_v2')
    || message.includes('shopping_list_operation_receipts');
};

const unwrapRpcRow = (data) => (Array.isArray(data) ? data[0] : data);

export const upsertShoppingListItem = async ({
  allowLegacyFallback = true,
  item = {},
  operationId = '',
  projectId = '',
  supabaseClient,
} = {}) => {
  if (!supabaseClient || !projectId) {
    return { data: null, error: new Error('Shopping List RPC is not ready.'), usedV2: false };
  }

  const normalizedOperationId = String(operationId || item.operationId || '').trim();
  if (normalizedOperationId) {
    const { data, error } = await supabaseClient.rpc('apply_shopping_list_add_v2', {
      target_operation_id: normalizedOperationId,
      target_project_id: projectId,
      target_title: item.title,
      target_quantity_value: item.quantityValue ?? null,
      target_quantity_unit: item.quantityUnit || '',
      target_source_type: item.sourceType || '',
      target_source_batch_id: item.sourceBatchId || null,
      target_meta: item.meta || {},
    });
    const savedRow = unwrapRpcRow(data);

    if (!error && savedRow) {
      return { data: savedRow, error: null, usedV2: true };
    }

    if (!allowLegacyFallback || !isMissingShoppingAddV2RpcError(error)) {
      return { data: null, error: error || new Error('Shopping List did not return a saved item.'), usedV2: true };
    }
  }

  const { data, error } = await supabaseClient.rpc('upsert_shopping_list_item', {
    target_project_id: projectId,
    target_title: item.title,
    target_quantity_value: item.quantityValue ?? null,
    target_quantity_unit: item.quantityUnit || '',
    target_source_type: item.sourceType || '',
    target_source_batch_id: item.sourceBatchId || null,
    target_meta: item.meta || {},
  });
  const savedRow = unwrapRpcRow(data);

  return {
    data: savedRow || null,
    error: error || (savedRow ? null : new Error('Shopping List did not return a saved item.')),
    usedV2: false,
  };
};
