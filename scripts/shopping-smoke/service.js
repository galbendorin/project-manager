// An isolated, in-memory service, not a Supabase/RLS substitute or certification.
export function createSyntheticShoppingService({ ownerId, projectId }) {
  const rows = [];
  const receipts = new Map();
  const evidence = { adds: 0, edits: 0, failures: 0, completions: 0 };
  let failCompletion = false, keepFailing = false;
  const project = { id: projectId, user_id: ownerId, name: 'Shopping List',
    created_at: new Date().toISOString(), project_members: [] };
  const copy = value => structuredClone(value);
  const reject = () => { throw new Error('Synthetic service refused an unexpected table, list or operation.'); };
  return {
    project, evidence,
    failNextCompletion() { failCompletion = true; },
    keepCompletionFailing() { keepFailing = true; },
    snapshot: () => copy(rows),
    from(table) {
      if (!['projects', 'manual_todos'].includes(table)) return reject();
      const filters = []; let patch = null, single = false;
      const builder = {
        select() { return builder; }, order() { return builder; },
        eq(key, value) { filters.push(row => row[key] === value); return builder; },
        neq(key, value) { filters.push(row => row[key] !== value); return builder; },
        update(value) { patch = value; return builder; },
        single() { single = true; return builder; }, maybeSingle() { single = true; return builder; },
        then(resolve, rejectPromise) {
          return Promise.resolve().then(() => {
            const matches = (table === 'projects' ? [project] : rows).filter(row => filters.every(filter => filter(row)));
            if (patch) {
              if (table !== 'manual_todos' || matches.length !== 1) return reject();
              if ((failCompletion || keepFailing) && patch.status === 'Done') {
                failCompletion = false; evidence.failures++;
                return { data: null, error: { code: 'P0001', message: 'Q11 synthetic save failed. Retry this grocery.' } };
              }
              Object.assign(matches[0], patch);
              if (patch.title) evidence.edits++;
              if (patch.status === 'Done') evidence.completions++;
            }
            return { data: copy(single ? matches[0] : matches), error: null };
          }).then(resolve, rejectPromise);
        },
      };
      return builder;
    },
    async rpc(name, args) {
      if (name !== 'apply_shopping_list_add_v3' || args.target_project_id !== projectId
        || !args.target_title.startsWith('Q11 synthetic ')) return reject();
      const id = args.target_operation_id;
      if (receipts.has(id)) return { data: copy(receipts.get(id)), error: null };
      const row = { id: crypto.randomUUID(), project_id: projectId, user_id: ownerId,
        title: args.target_title, status: 'Open', quantity_value: args.target_quantity_value,
        quantity_unit: args.target_quantity_unit, source_type: '', meta: {},
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      rows.push(row); evidence.adds++;
      const data = { outcome: 'applied', operation_id: id, project_id: projectId, user_id: ownerId,
        confirmed_revision: '0', row_exists: true, current_item: copy(row),
        contribution: { kind: 'inserted', row_id: row.id, revision: '1', before: null, after: copy(row) } };
      receipts.set(id, data);
      return { data, error: null };
    },
    async readProject(id) { if (id !== projectId) return reject(); return copy(rows); },
  };
}
