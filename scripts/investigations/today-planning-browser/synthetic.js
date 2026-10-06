/* global window */
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const today = iso(new Date());
const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 2);
export const userId = '11111111-1111-4111-8111-111111111111';
export const project = { id: '22222222-2222-4222-8222-222222222222', name: 'Synthetic delivery', tasks: [], registers: {}, tracker: [], version: 1 };
const other = { ...project, id: '44444444-4444-4444-8444-444444444444', name: 'Synthetic personal project' };
const uuid = (n) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;
const quadrants = ['urgent_important', 'not_urgent_important', 'urgent_not_important', 'not_urgent_not_important'];
function seed() {
  const tasks = Array.from({ length: 120 }, (_, i) => ({ id: uuid(i + 1), user_id: userId, project_id: i % 2 ? other.id : project.id, title: `Synthetic Q${Math.floor(i / 30) + 1} task ${i % 30 + 1}${i % 10 === 0 ? ' with a long wrapping description to verify readable task cards' : ''}`, description: 'Synthetic data only', due_date: i === 0 ? iso(yesterday) : i === 1 ? today : '2099-12-01', status: 'Open', owner_text: 'Test person', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }));
  const future = { ...tasks[0], id: uuid(121), title: 'Synthetic future task to choose for today', due_date: '2099-12-01' };
  return { projects: [project, other], manual_todos: [...tasks, future], task_eisenhower_preferences: tasks.map((task, i) => ({ id: uuid(1000 + i), user_id: userId, task_key: `manual:${task.id}`, manual_todo_id: task.id, manual_quadrant: quadrants[Math.floor(i / 30)], planned_day: today, version: 1 })), task_card_checklists: [{ id: uuid(2000), user_id: userId, project_id: other.id, card_key: `manual:${uuid(32)}`, title: 'Synthetic eight-item checklist', position: 0 }], task_card_checklist_items: Array.from({ length: 8 }, (_, i) => ({ id: uuid(2001 + i), checklist_id: uuid(2000), user_id: userId, project_id: other.id, title: `Synthetic checklist item ${i + 1}`, checked: false, position: i })) };
}
let db = seed(); let failSave = false; let failLoad = false; let writes = 0;
const notify = () => window.dispatchEvent(new Event('synthetic-update'));
export const controls = { stats: () => writes, failSave() { failSave = true; }, failLoad() { failLoad = true; }, reset() { db = seed(); writes = 0; notify(); } };
export const getRows = () => structuredClone(db.manual_todos);
export async function updateSyntheticTodo(id, field, value) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (failSave) { failSave = false; return null; }
  const row = db.manual_todos.find((item) => item.id === id);
  if (!row) return null;
  const column = { dueDate: 'due_date', title: 'title', status: 'status', projectId: 'project_id', description: 'description' }[field];
  if (!column) return null;
  row[column] = value; row.updated_at = new Date().toISOString(); writes += 1; notify();
  return { updatedTodo: { _id: row.id, title: row.title, projectId: row.project_id, dueDate: row.due_date, status: row.status, owner: row.owner_text, description: row.description }, confirmed: true };
}
class Query {
  constructor(table) { this.table = table; this.operation = 'read'; this.filters = []; this.one = false; }
  select() { return this; } eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  neq(key, value) { this.filters.push((row) => row[key] !== value); return this; }
  in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
  is(key, value) { return this.eq(key, value); } order() { return this; } limit() { return this; }
  range(a, b) { this.bounds = [a, b]; return this; } single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
  update(values) { this.operation = 'update'; this.values = values; return this; }
  insert(values) { this.operation = 'insert'; this.values = values; return this; }
  delete() { this.operation = 'delete'; return this; }
  then(resolve, reject) {
    return Promise.resolve().then(async () => {
      await new Promise((done) => setTimeout(done, this.operation === 'read' ? 20 : 100));
      if ((this.operation === 'read' && failLoad && this.table === 'manual_todos') || (this.operation !== 'read' && failSave)) { failLoad = false; failSave = false; return { data: null, count: null, error: { message: 'Synthetic failure' } }; }
      const all = db[this.table] || []; let rows = all.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.operation === 'update') { rows.forEach((row) => Object.assign(row, this.values, { version: row.version + 1 })); writes += 1; notify(); }
      if (this.operation === 'insert') { rows = [{ ...this.values, id: crypto.randomUUID(), version: 1, task_key: `manual:${this.values.manual_todo_id}`, planned_day: this.values.planned_day ?? null }]; db[this.table] = [...all, ...rows]; writes += 1; notify(); }
      if (this.operation === 'delete') { db[this.table] = all.filter((row) => !rows.includes(row)); writes += 1; notify(); }
      const count = rows.length;
      if (this.bounds) rows = rows.slice(this.bounds[0], this.bounds[1] + 1);
      return { data: structuredClone(this.one ? rows[0] || null : rows), count, error: null };
    }).then(resolve, reject);
  }
}
export const supabase = { from: (table) => new Query(table), auth: { getSession: async () => ({ data: { session: null } }) }, rpc() { throw new Error('No hosted RPC in this synthetic preview'); } };
