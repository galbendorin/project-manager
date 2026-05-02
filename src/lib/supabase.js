import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigStatus = {
  missingKeys: [
    !supabaseUrl ? 'VITE_SUPABASE_URL' : '',
    !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : '',
  ].filter(Boolean),
};

export const isSupabaseConfigured = supabaseConfigStatus.missingKeys.length === 0;

const createMissingSupabaseClient = () => new Proxy({}, {
  get() {
    throw new Error(`Supabase is not configured. Missing ${supabaseConfigStatus.missingKeys.join(', ')}.`);
  },
});

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMissingSupabaseClient();
