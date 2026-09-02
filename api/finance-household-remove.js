import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase) return res.status(500).json({ error: 'Server authentication is not configured.' });

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = await checkRateLimit({
      key: `finance-household-remove:${user.id}:${getClientIp(req)}`,
      max: 20,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many access changes. Please wait a moment and try again.');
    }

    const membershipId = String(req.body?.membershipId || '').trim();
    if (!UUID_PATTERN.test(membershipId)) return res.status(400).json({ error: 'Choose the family member to remove.' });

    const { data, error } = await supabase.rpc('remove_finance_household_member', {
      p_owner_user_id: user.id,
      p_membership_id: membershipId,
    });
    if (error) {
      console.error('Finance household member removal failed:', error);
      return res.status(500).json({ error: 'Unable to remove this access right now.' });
    }
    if (!data?.ok) {
      const status = data?.code === 'forbidden' ? 403 : 404;
      const message = data?.code === 'forbidden'
        ? 'Only the household-plan owner can remove family members.'
        : 'This family member or invitation is no longer available.';
      return res.status(status).json({ error: message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Finance household member removal endpoint failed:', error);
    return res.status(500).json({ error: 'Unable to remove this access right now.' });
  }
}
