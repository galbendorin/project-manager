import { getFinishDate } from '../../utils/helpers.js';

export const promotionSourceLink = (source, kind) => kind === 'manual' ? source?.meta?.projectPlanLink : source?.projectPlanLink;

export function linkedTaskFromPromotionSnapshot(snapshot) {
  const { project, source, reference, projectId } = snapshot;
  const link = promotionSourceLink(source, reference.kind);
  const candidates = (project.tasks || []).filter((task) => task.originRef?.sourceKey === reference.key);
  if (!link) {
    if (candidates.length) throw new Error('The source and project changed while loading. Review latest again; your inputs are retained.');
    return null;
  }
  const task = candidates[0];
  if (candidates.length !== 1 || link.projectId !== projectId || link.sourceKind !== reference.kind || link.sourceId !== reference.id || link.sourceKey !== reference.key || task.id !== link.taskId || JSON.stringify(task.originRef) !== JSON.stringify(link)) throw new Error('The source and project changed while loading. Review latest again; your inputs are retained.');
  return task;
}

export async function readPromotionSnapshot(client, projectId, reference) {
  const { data: project, error } = await client.from('projects').select('*').eq('id', projectId).single();
  if (error || !project || project.id !== projectId || !Number.isInteger(project.version)) throw new Error(error?.message || 'The project could not be loaded.');
  let source;
  if (reference.kind === 'manual') {
    const result = await client.from('manual_todos').select('*').eq('id', reference.id).single();
    if (result.error || !result.data || result.data.id !== reference.id) throw new Error(result.error?.message || 'The original task is unavailable.');
    source = result.data;
    if (source.project_id && source.project_id !== projectId) throw new Error('Move this task within its current project.');
  } else {
    const items = reference.kind === 'action' ? project.registers?.actions : project.tracker;
    const matches = (items || []).filter((item) => item._id === reference.id);
    if (matches.length !== 1) throw new Error('The original source is missing or has an ambiguous ID.');
    [source] = matches;
  }
  const snapshot = { project, source, reference, projectId };
  linkedTaskFromPromotionSnapshot(snapshot);
  return snapshot;
}

export function validatePromotionAck(value, { projectId, reference, operationId, returning = false }) {
  const sourceId = reference.kind === 'manual' ? value?.source?.id : value?.source?._id;
  if (value?.ok !== true || value.operation_id !== operationId || value.project_id !== projectId || value.project?.id !== projectId || !Number.isInteger(value.project.version) || value.project.version < 1 || sourceId !== reference.id || !Array.isArray(value.project.tasks)) throw new Error('The save response could not be verified. Retry the same operation.');
  if (reference.kind === 'manual' && value.source.project_id !== projectId) throw new Error('The saved task project could not be verified.');
  const linked = promotionSourceLink(value.source, reference.kind);
  const tasks = value.project.tasks.filter((task) => task.id === value.task_id);
  if (returning) {
    if (linked || value.project.tasks.some((task) => task.originRef?.sourceKey === reference.key) || value.source[reference.kind === 'manual' ? 'meta' : 'projectPlanLastReturn'] == null) throw new Error('The return response could not be verified. Retry the same operation.');
    const receipt = reference.kind === 'manual' ? value.source.meta.projectPlanLastReturn : value.source.projectPlanLastReturn;
    if (receipt?.operationId !== operationId || receipt.link?.taskId !== value.task_id || receipt.link?.sourceId !== reference.id) throw new Error('The return receipt could not be verified.');
  } else {
    const origin = tasks[0]?.originRef;
    if (tasks.length !== 1 || !linked || linked.projectId !== projectId || linked.sourceKind !== reference.kind || linked.sourceId !== reference.id || linked.sourceKey !== reference.key || linked.taskId !== value.task_id || JSON.stringify(origin) !== JSON.stringify(linked)) throw new Error('The saved source link could not be verified. Retry the same operation.');
  }
  return value;
}

export async function writePromotionTransaction(client, { snapshot, reference, operationId, intent, returning = false }) {
  const payload = {
    p_project_id: snapshot.projectId, p_source_kind: reference.kind, p_source_id: reference.id,
    p_expected_version: snapshot.project.version, p_expected_source: snapshot.source, p_operation_id: operationId,
    ...(returning ? { p_expected_link: promotionSourceLink(snapshot.source, reference.kind) } : { p_intent: intent }),
  };
  const { data, error } = await client.rpc(returning ? 'return_task_from_project_plan_v1' : 'promote_task_to_project_plan_v1', payload);
  if (error) {
    const message = error.message || 'Unable to save. Retry the same operation.';
    const code = String(error.code || '');
    const uncertain = /^08/.test(code) || code === '40003';
    const rejected = !uncertain && (/^(22|23|28|42)[0-9A-Z]{3}$/.test(code) || ['40001', '40P01', '57014', 'P0001', 'PGRST202'].includes(code) || (!code && /PLAN_|AUTHENTICATION_REQUIRED|PROJECT_ACCESS_REQUIRED|TASK_LIMIT|TASK_QUOTA/.test(message)));
    const fail = (text) => Object.assign(new Error(text), { transactionRejected: rejected });
    if (/PLAN_RETURN_DEPENDENTS_EXIST/.test(message)) throw fail('Other tasks depend on this task or its summary group. Update those dependencies before returning it.');
    if (/PLAN_RETURN_ALIAS_EXISTS/.test(message)) throw fail('This task also has another Action Log or Tracker link. Remove that extra link before returning it.');
    if (/CONFLICT|FINISH_CHANGED/.test(message)) throw fail('The source or project changed. Review the latest version before saving.');
    if (['42883', 'PGRST202'].includes(error.code) || /could not find.*function|schema cache/i.test(message)) throw fail('Scheduling is unavailable on the server. Your original task is unchanged.');
    if (/AUTHENTICATION_REQUIRED|PROJECT_ACCESS_REQUIRED|PLAN_SOURCE_UNAVAILABLE/.test(message)) throw fail('The task or project is unavailable. Check your connection and access, then review the latest version.');
    if (/PLAN_OPERATION_REPLAY_MISMATCH|PLAN_OPERATION_RETIRED/.test(message)) throw fail('This save attempt has already been used. Review latest to check the saved source before continuing.');
    if (/PLAN_PREDECESSOR_DATE_REQUIRED|PLAN_GRAPH_INVALID|PLAN_DEPENDENCY_CYCLE|PLAN_PREDECESSOR_NOT_FOUND|PLAN_TASK_ID_INVALID/.test(message)) throw fail('The current plan has an invalid task or dependency. Correct that schedule and review latest before continuing.');
    if (/TASK_LIMIT|TASK_QUOTA/.test(message)) throw fail('This project has reached its task limit. The original source is retained.');
    if (/PLAN_SOURCE_METADATA_INVALID/.test(message)) throw fail('This task’s saved details need repair before scheduling. The original work is retained.');
    throw fail(message);
  }
  return validatePromotionAck(data, { projectId: snapshot.projectId, reference, operationId, returning });
}

export function projectLinkedSource(source, kind, tasks) {
  const link = promotionSourceLink(source, kind);
  if (!link) return source;
  const task = tasks.find((item) => item.id === link.taskId && item.originRef?.sourceKey === link.sourceKey);
  if (!task) return { ...source, planLinkUnavailable: true };
  const completed = Number(task.pct) >= 100;
  const finish = getFinishDate(task.start, task.dur || 0);
  if (kind === 'manual') return { ...source, title: task.name, dueDate: finish, status: completed ? 'Done' : 'Open', planLink: link, planProgress: Number(task.pct) || 0 };
  if (kind === 'action') return { ...source, description: task.name, target: finish, status: completed ? 'Completed' : 'Open', completed: completed ? finish : '', planLink: link, planProgress: Number(task.pct) || 0 };
  return { ...source, taskName: task.name, dueDate: finish, status: completed ? 'Completed' : Number(task.pct) > 0 ? 'In Progress' : 'Not Started', pctCompleted: Number(task.pct) || 0, planLink: link, planProgress: Number(task.pct) || 0 };
}

export function planTaskVisibleExternally(task, registers, tracker) {
  if (task.public === false) return false;
  const origin = task.originRef;
  if (origin?.sourceKind === 'action') {
    const source = registers.actions?.find((item) => item._id === origin.sourceId);
    return Boolean(source && source.public !== false);
  }
  if (origin?.sourceKind === 'tracker') {
    const source = tracker.find((item) => item._id === origin.sourceId);
    return Boolean(source && source.public !== false);
  }
  return true;
}
