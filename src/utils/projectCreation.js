import { supabase } from '../lib/supabase';

const isMissingRpcError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42883' || message.includes('function') || message.includes('does not exist');
};

const isProjectQuotaError = (error) => (
  String(error?.message || '').includes('PROJECT_QUOTA_EXCEEDED:')
);

const isProjectTaskLimitError = (error) => (
  String(error?.message || '').includes('PROJECT_TASK_LIMIT_EXCEEDED:')
);

const isShoppingListDuplicateError = (error) => (
  String(error?.message || '').includes('SHOPPING_LIST_PROJECT_ALREADY_EXISTS')
);

export const getProjectCreationErrorMessage = (error) => {
  if (!error) return 'Unable to create this project right now.';

  if (isMissingRpcError(error)) {
    return 'Project creation needs the latest Supabase SQL migration before it can be used safely.';
  }

  if (isProjectQuotaError(error)) {
    const limit = String(error.message || '').split(':').pop();
    const normalizedLimit = Number(limit);
    if (Number.isFinite(normalizedLimit) && normalizedLimit > 0) {
      return `Your current plan allows up to ${normalizedLimit} projects. Upgrade to create more.`;
    }
    return 'Your current plan has reached its project limit.';
  }

  if (isProjectTaskLimitError(error)) {
    const limit = String(error.message || '').split(':').pop();
    const normalizedLimit = Number(limit);
    if (Number.isFinite(normalizedLimit) && normalizedLimit > 0) {
      return `This plan supports up to ${normalizedLimit} tasks in one project. Reduce the imported tasks or upgrade first.`;
    }
    return 'This project has too many tasks for the current plan.';
  }

  if (isShoppingListDuplicateError(error)) {
    return 'You already have a Shopping List project for this workspace.';
  }

  return error.message || 'Unable to create this project right now.';
};

export const createProjectWithLimits = async ({
  projectId = null,
  name,
  snapshot = {},
  isDemo = false,
}) => {
  const { data, error } = await supabase
    .rpc('create_project_with_limits', {
      target_project_id: projectId,
      target_name: name,
      target_tasks: snapshot.tasks || [],
      target_registers: snapshot.registers || {},
      target_tracker: snapshot.tracker || [],
      target_status_report: snapshot.status_report || {},
      target_baseline: snapshot.baseline ?? null,
      target_is_demo: isDemo,
    })
    .single();

  return { data, error };
};
