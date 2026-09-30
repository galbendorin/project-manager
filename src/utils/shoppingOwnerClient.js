import { createClient } from '@supabase/supabase-js';

const ownerChanged = () => Object.assign(new Error('Your session changed. Sign in again to sync these groceries.'),
  { code: 'SHOPPING_OWNER_CHANGED' });

// The shared client's internal auth await can otherwise select a replacement
// account. Capture the accepted owner's token and fence every dispatch instead.
export async function createShoppingOwnerClient({ supabaseClient, userId, isCurrent,
  url, anonKey, signal, fetchImpl = globalThis.fetch, createClientImpl = createClient }) {
  const assertOwner = () => {
    if (!userId || signal?.aborted || !isCurrent()) throw ownerChanged();
  };
  assertOwner();
  const { data, error } = await supabaseClient.auth.getSession();
  assertOwner();
  if (error) throw error;
  const session = data?.session;
  if (session?.user?.id !== userId || !session.access_token) throw ownerChanged();
  const token = session.access_token;
  return createClientImpl(url, anonKey, {
    accessToken: async () => { assertOwner(); return token; },
    global: { fetch: async (input, init) => {
      assertOwner();
      const response = await fetchImpl(input, { ...init, signal });
      assertOwner();
      return response;
    } },
  });
}
