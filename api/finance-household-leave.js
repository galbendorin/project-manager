import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase) return res.status(500).json({ error: 'Server authentication is not configured.' });

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = await checkRateLimit({
      key: `finance-household-leave:${user.id}:${getClientIp(req)}`,
      max: 10,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many access changes. Please wait a moment and try again.');
    }

    const { data, error } = await supabase.rpc('leave_finance_household', {
      p_actor_user_id: user.id,
    });
    if (error) {
      console.error('Finance household leave failed:', error);
      return res.status(500).json({ error: 'Unable to leave this household plan right now.' });
    }
    if (!data?.ok) {
      return res.status(404).json({ error: 'This shared household access is no longer active.' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Finance household leave endpoint failed:', error);
    return res.status(500).json({ error: 'Unable to leave this household plan right now.' });
  }
}
