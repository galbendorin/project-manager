import { supabase } from '../../lib/supabase.js';

const isMissingFunctionError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42883' || message.includes('function') || message.includes('does not exist');
};

const isPermissionError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42501' || message.includes('permission denied');
};

export const isDirectProjectMutationFallbackError = (error) => (
  isMissingFunctionError(error) || isPermissionError(error)
);

const normalizeMutationResult = (data = {}) => ({
  version: Number.isInteger(data?.version) ? data.version : null,
  registers: data?.registers || null,
  statusReport: data?.status_report || null,
});

export const syncProjectStatusReportField = async ({ projectId, key, value }) => {
  const { data, error } = await supabase
    .rpc('patch_project_status_report_field', {
      p_project_id: projectId,
      p_field: key,
      p_value: value ?? null,
    })
    .single();

  if (error) return { data: null, error };
  return { data: normalizeMutationResult(data), error: null };
};

export const syncProjectRegisterUpsert = async ({ projectId, registerType, itemData }) => {
  const { data, error } = await supabase
    .rpc('upsert_project_register_item', {
      p_project_id: projectId,
      p_register_type: registerType,
      p_item: itemData,
    })
    .single();

  if (error) return { data: null, error };
  return { data: normalizeMutationResult(data), error: null };
};

export const syncProjectRegisterPatch = async ({ projectId, registerType, itemId, patch }) => {
  const { data, error } = await supabase
    .rpc('patch_project_register_item', {
      p_project_id: projectId,
      p_register_type: registerType,
      p_item_id: itemId,
      p_patch: patch,
    })
    .single();

  if (error) return { data: null, error };
  return { data: normalizeMutationResult(data), error: null };
};

export const syncProjectRegisterDelete = async ({ projectId, registerType, itemId }) => {
  const { data, error } = await supabase
    .rpc('delete_project_register_item', {
      p_project_id: projectId,
      p_register_type: registerType,
      p_item_id: itemId,
    })
    .single();

  if (error) return { data: null, error };
  return { data: normalizeMutationResult(data), error: null };
};
