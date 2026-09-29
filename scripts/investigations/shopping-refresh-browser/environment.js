export const projects = ['a', 'b'].map(id => ({ id, name: 'Shopping List', user_id: 'synthetic-owner' }));
let rows = projects.map(p => ({ id: `${p.id}-item`, project_id: p.id, title: p.id === 'a' ? 'Milk' : 'Bread', status: 'Open' }));
export const control = { hold: '', pending: [], updates: 0 };
export const supabase = { from(table) {
  let kind = 'read', id, project, patch;
  const builder = { select() { return builder; }, order() { return builder; },
    eq(key, value) { if (key === 'id') id = value; if (key === 'project_id') project = value; return builder; },
    update(value) { patch = value; kind = 'write'; return builder; }, single() { return builder; }, maybeSingle() { return builder; },
    then(resolve, reject) {
      const snapshot = structuredClone(table === 'projects' ? projects : rows.filter(row => row.project_id === project));
      const result = () => { if (kind === 'write') { rows = rows.map(row => row.id === id ? { ...row, ...patch } : row); control.updates++; }
        return { data: kind === 'write' ? rows.find(row => row.id === id) : snapshot, error: null }; };
      if (control.hold === `${kind}:${table}`) {
        control.hold = '';
        return new Promise(done => control.pending.push(fail => done(fail ? { data: null, error: { message: 'Failed to fetch' } } : result()))).then(resolve, reject);
      }
      return Promise.resolve(result()).then(resolve, reject);
    } };
  return builder;
} };
