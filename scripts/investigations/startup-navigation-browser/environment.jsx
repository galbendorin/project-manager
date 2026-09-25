const sessions = [], requests = [];
let session = null;
export const supabase = {
  auth: {
    getSession: () => session ? Promise.resolve({ data: { session } }) : new Promise(resolve => sessions.push(resolve)),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
  rpc: kind => ({ single: () => new Promise(resolve => requests.push({ kind, resolve })) }),
  from: () => ({ select: () => ({ eq: () => new Promise(resolve => requests.push({ kind: 'projects', resolve })) }) }),
};
export function signIn() {
  session = { user: { id: 'q07-synthetic-owner' } };
  sessions.splice(0).forEach(resolve => resolve({ data: { session } }));
}
export function resolveAccess(granted) {
  requests.splice(0).forEach(({ kind, resolve }) => resolve(kind === 'projects'
    ? { count: granted ? 1 : 0, error: null } : { data: {}, error: null }));
}
