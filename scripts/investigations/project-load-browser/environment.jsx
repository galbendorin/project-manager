export const control = { mode: 'fail', requests: 0 };
const user = { id: 'synthetic-q06-owner', email: 'q06@example.invalid' };
const noop = () => {};
const plan = { canCreateProject: true, isReadOnly: false, limits: { label: 'Test', maxProjects: 10 },
  householdToolsEnabled: false, financeToolsEnabled: false, refreshFinanceAccess: noop, refreshProjectCount: noop };
export const useAuth = () => ({ user, signOut: noop });
export const usePlan = () => plan;
export const supabase = { from() { return { select() { return this; }, async order() {
  control.requests++;
  if (control.mode === 'throw') throw new Error('Synthetic transport failure');
  if (control.mode === 'fail') return { data: null, error: { message: 'Synthetic connection failure' } };
  if (control.mode === 'null') return { data: null, error: null };
  return { data: control.mode === 'empty' ? [] : [{ id: 'q06-project', user_id: user.id, name: 'Q06 TEST Project',
    updated_at: '2026-09-30T08:00:00Z', created_at: '2026-09-30T08:00:00Z', project_members: [] }], error: null };
} }; } };
