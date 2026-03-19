import { createClient } from '@supabase/supabase-js';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pmworkspace.com';

const ALLOWED_ORIGINS = [
  APP_URL,
  'https://pmworkspace.com',
  'https://www.pmworkspace.com',
  'https://project-manager-app-tau.vercel.app',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:5173',
];

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminSupabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

export const applyApiCors = (req, res) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
};

export const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return '';
  return authHeader.slice(7).trim();
};

export const requireAuthenticatedUser = async (req, res) => {
  if (!adminSupabase) {
    res.status(500).json({ error: 'Server authentication is not configured.' });
    return null;
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }

  const { data, error } = await adminSupabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return null;
  }

  return data.user;
};

export const getAdminSupabase = () => adminSupabase;
