// No real auth client, credentials, requests, or production data.
const listeners = new Set();
let user = { id: 'owner-a' }, cached = user;
export const faults = { saves: false };
export const emit = (event, nextUser) => {
  user = nextUser;
  for (const listener of listeners) listener(event, user ? { user } : null);
};
export const supabase = { auth: {
  getSession: async () => ({ data: { session: user ? { user } : null } }),
  onAuthStateChange: listener => { listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }; },
  signOut: async () => { emit('SIGNED_OUT', null); return { error: null }; },
} };
export const loadCachedOfflineUser = () => cached;
export const saveCachedOfflineUser = next => { cached = next; };
export const clearCachedOfflineUser = id => { if (cached?.id === id) cached = null; };
export const clearOfflineDataForUser = async () => {};
