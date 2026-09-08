const ownerError = () => Object.assign(new Error('Your session changed. Sign in again to sync these groceries.'), { code: 'JOURNAL_OWNER_CHANGED' });

// Pin the bearer token at dispatch. Calling the shared Supabase RPC builder
// would allow its internal auth await to select a different user's session.
export function createShoppingSessionTransport({ supabaseClient, userId, getCurrentUserId, url, anonKey,
  fetchImpl = globalThis.fetch, signal } = {}) {
  const assertOwner = () => {
    if (!userId || signal?.aborted || getCurrentUserId() !== userId) throw ownerError();
  };
  const request = async (path, init = {}) => {
    assertOwner();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    assertOwner();
    if (data?.session?.user?.id !== userId || !data.session.access_token) throw ownerError();
    const pending = fetchImpl(`${url}/rest/v1/${path}`, { ...init, signal,
      headers: { apikey: anonKey, Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' } });
    const response = await pending;
    const body = await response.json();
    assertOwner();
    if (!response.ok) throw Object.assign(new Error(body?.message || 'Unable to sync groceries.'), { code: body?.code, status: response.status });
    return body;
  };
  return {
    rpc: async (name, args) => {
      if (!['apply_shopping_list_add_v3', 'reconcile_shopping_contribution_v1'].includes(name)) {
        return { data: null, error: new Error('Unsupported Shopping operation.') };
      }
      try { return { data: await request(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }), error: null }; }
      catch (error) { return { data: null, error }; }
    },
    readProject: async projectId => {
      const query = new URLSearchParams({ select: '*', project_id: `eq.${projectId}`, order: 'created_at.asc' });
      const rows = await request(`manual_todos?${query}`);
      if (!Array.isArray(rows) || rows.some(row => row.project_id !== projectId)) throw new Error('Unable to confirm this grocery list.');
      return rows;
    },
  };
}
