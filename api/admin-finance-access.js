import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();

const getFailure = (code) => {
  switch (String(code || '')) {
    case 'invalid_email':
      return { status: 400, error: 'Enter a valid account email.' };
    case 'user_not_found':
      return { status: 404, error: 'No PM Workspace account exists for that email yet.' };
    case 'member_conflict':
      return { status: 409, error: 'This account already belongs to another household plan.' };
    case 'forbidden':
      return { status: 403, error: 'Only a platform administrator can change Finance access.' };
    default:
      return { status: 500, error: 'Unable to update Finance access right now.' };
  }
};

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase) return res.status(500).json({ error: 'Server authentication is not configured.' });

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = await checkRateLimit({
      key: `admin-finance-access:${user.id}:${getClientIp(req)}`,
      max: 20,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many access changes. Please wait a moment and try again.');
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const enabled = req.body?.enabled;
    if (!email || email.length > 320 || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Email and enabled status are required.' });
    }

    const { data, error } = await supabase.rpc('set_finance_access_for_email', {
      p_actor_user_id: user.id,
      p_target_email: email,
      p_enabled: enabled,
    });
    if (error) {
      console.error('Finance access update failed:', error);
      return res.status(500).json({ error: 'Unable to update Finance access right now.' });
    }
    if (!data?.ok) {
      const failure = getFailure(data?.code);
      return res.status(failure.status).json({ error: failure.error });
    }

    return res.status(200).json({
      ok: true,
      email: data.email,
      enabled: data.enabled === true,
    });
  } catch (error) {
    console.error('Finance access endpoint failed:', error);
    return res.status(500).json({ error: 'Unable to update Finance access right now.' });
  }
}
