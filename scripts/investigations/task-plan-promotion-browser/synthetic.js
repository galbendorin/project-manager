import { buildPromotionPreview } from '../../../src/utils/taskPlanPromotion';
export const userId = '11111111-1111-4111-8111-111111111111';
export const projectId = '22222222-2222-4222-8222-222222222222';
export const sourceId = '33333333-3333-4333-8333-333333333333';
let failSave = false;
const now = '2026-10-06T00:00:00Z';
const project = { id: projectId, user_id: userId, name: 'Synthetic delivery', tasks: [{ id: 1, name: 'Synthetic existing predecessor', type: 'Task', start: '2026-10-09', dur: 1, pct: 0, indent: 0, dependencies: [], createdAt: now, updatedAt: now }], registers: { actions: [{ _id: 'synthetic-action', description: 'Synthetic captured action', target: '2099-12-01', status: 'Open', notes: 'Preserved action notes', createdAt: now, updatedAt: now }] }, tracker: [{ _id: 'synthetic-tracker', taskName: 'Synthetic captured tracker', status: 'Not Started', notes: 'Preserved tracker notes', rag: 'Amber', createdAt: now, updatedAt: now }], version: 1, baseline: null, status_report: {} };
const manual = { id: sourceId, user_id: userId, project_id: projectId, title: 'Synthetic captured manual task', description: 'Preserved manual notes', due_date: '2099-12-01', status: 'Open', recurrence: null, meta: {}, created_at: now, updated_at: now };
const otherManual = { ...manual, id: '44444444-4444-4444-8444-444444444444', project_id: null, title: 'Synthetic Other task', description: 'Preserved Other notes', meta: {} };
const db = { projects: [project], manual_todos: [manual, otherManual], task_eisenhower_preferences: [], task_card_checklists: [{ id: '55555555-5555-4555-8555-555555555555', user_id: userId, project_id: projectId, card_key: `manual:${sourceId}`, title: 'Synthetic retained checklist', position: 0 }], task_card_checklist_items: [{ id: '66666666-6666-4666-8666-666666666666', user_id: userId, project_id: projectId, checklist_id: '55555555-5555-4555-8555-555555555555', title: 'Synthetic retained checklist item', checked: false, position: 0 }] };
const clone = (value) => JSON.parse(JSON.stringify(value));
export const getProject = () => clone(project);
export const controls = { failSave() { failSave = true; }, remoteChange() { project.version += 1; project.tasks[0].name = 'Synthetic remote edit retained'; } };
class Query {
  constructor(table) { this.table = table; this.operation = 'read'; this.filters = []; this.one = false; }
  select() { return this; } eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  neq(key, value) { this.filters.push((row) => row[key] !== value); return this; }
  in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
  is(key, value) { return this.eq(key, value); } order() { return this; } limit() { return this; }
  range(a, b) { this.bounds = [a, b]; return this; } single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
  update(payload) { this.operation = 'update'; this.payload = payload; return this; }
  insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
  delete() { this.operation = 'delete'; return this; }
  then(resolve, reject) { return Promise.resolve().then(async () => {
    await new Promise((done) => setTimeout(done, 30));
    let rows = (db[this.table] || []).filter((row) => this.filters.every((filter) => filter(row)));
    if (this.operation === 'update') rows.forEach((row) => Object.assign(row, this.payload, { version: (row.version || 0) + 1 }));
    if (this.operation === 'insert') { rows = [{ ...this.payload, id: crypto.randomUUID(), version: 1 }]; db[this.table] = [...(db[this.table] || []), ...rows]; }
    const count = rows.length; if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
    return { data: this.one ? clone(rows[0] || null) : clone(rows), error: null, count };
  }).then(resolve, reject); }
}
export const supabase = {
  from(table) { return new Query(table); },
  rpc(name, payload) { const result = this.performRpc(name, payload); result.single = () => result; return result; },
  async performRpc(name, payload) {
    await new Promise((done) => setTimeout(done, 100));
    if (failSave) { failSave = false; return { error: { message: 'Synthetic network failure' }, data: null }; }
    if (['upsert_project_register_item', 'patch_project_register_item', 'delete_project_register_item', 'patch_project_status_report_field'].includes(name)) {
      if (name === 'patch_project_status_report_field') project.status_report[payload.p_field] = payload.p_value;
      else {
        const list = project.registers[payload.p_register_type] || [];
        const id = payload.p_item?._id || payload.p_item_id;
        project.registers[payload.p_register_type] = name === 'delete_project_register_item' ? list.filter((row) => row._id !== id) : list.some((row) => row._id === id) ? list.map((row) => row._id === id ? { ...row, ...(payload.p_item || payload.p_patch) } : row) : [...list, payload.p_item];
      }
      project.version += 1;
      return { data: clone(project), error: null };
    }
    const kind = payload.p_source_kind;
    const source = kind === 'manual' ? db.manual_todos.find((row) => row.id === payload.p_source_id) : kind === 'action' ? project.registers.actions.find((row) => row._id === payload.p_source_id) : project.tracker.find((row) => row._id === payload.p_source_id);
    if (!source) return { error: { message: 'Source unavailable' } };
    const link = kind === 'manual' ? source.meta.projectPlanLink : source.projectPlanLink;
    if (name === 'promote_task_to_project_plan_v1' && link) return { data: { ok: true, existing: true, operation_id: payload.p_operation_id, project_id: projectId, task_id: link.taskId, project: clone(project), source: clone(source) } };
    if (payload.p_expected_version !== project.version || JSON.stringify(payload.p_expected_source) !== JSON.stringify(source)) return { error: { message: 'PLAN_PROMOTION_CONFLICT' } };
    if (name === 'return_task_from_project_plan_v1') {
      const task = project.tasks.find((row) => row.id === link?.taskId);
      if (!task) return { error: { message: 'Plan link unavailable' } };
      const deadline = payload.p_expected_link.intent.confirmed_finish;
      const receipt = { operationId: payload.p_operation_id, link };
      if (kind === 'manual') { source.title = task.name; source.due_date = deadline; source.meta.projectPlanLastReturn = receipt; delete source.meta.projectPlanLink; }
      else { source.projectPlanLastReturn = receipt; delete source.projectPlanLink; delete source.taskId; delete source.sourceTaskId; if (kind === 'action') { source.description = task.name; source.target = deadline; } else { source.taskName = task.name; source.dueDate = deadline; } }
      project.tasks = project.tasks.filter((row) => row.id !== task.id); project.version += 1;
      return { data: { ok: true, operation_id: payload.p_operation_id, project_id: projectId, task_id: task.id, project: clone(project), source: clone(source) } };
    }
    const intent = payload.p_intent;
    const preview = buildPromotionPreview(project.tasks, { name: intent.name, type: intent.type, duration: intent.duration, start: intent.start, dependencyChoice: intent.dependency_choice, dependencies: intent.dependencies, depLogic: intent.dependency_logic });
    const origin = { version: 1, projectId, taskId: preview.task.id, sourceKind: kind, sourceId: payload.p_source_id, sourceKey: kind === 'manual' ? `manual:${payload.p_source_id}` : `project:${projectId}:${kind === 'action' ? 'register:actions' : 'tracker'}:${payload.p_source_id}`, operationId: payload.p_operation_id, intent };
    project.tasks.push({ ...preview.task, originRef: origin, createdAt: now, updatedAt: now }); project.version += 1;
    if (kind === 'manual') { source.meta.projectPlanLink = origin; source.project_id = projectId; source.updated_at = new Date().toISOString(); }
    else { source.projectPlanLink = origin; source[kind === 'action' ? 'sourceTaskId' : 'taskId'] = origin.taskId; }
    return { data: { ok: true, operation_id: payload.p_operation_id, project_id: projectId, task_id: origin.taskId, project: clone(project), source: clone(source) } };
  },
};
