import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();

const getFailure = (result = {}) => {
  switch (String(result.code || '')) {
    case 'invalid_email':
      return { status: 400, error: 'Enter a valid email address.' };
    case 'owner_email':
      return { status: 400, error: 'You already own this household plan.' };
    case 'target_owns_finance':
    case 'already_linked':
    case 'already_invited':
      return { status: 409, error: 'That email cannot be invited to this household plan.' };
    case 'seat_cap_exceeded':
      return { status: 409, error: `A household plan supports up to ${Number(result.limit) || 5} family members.` };
    case 'forbidden':
      return { status: 403, error: 'Only the household-plan owner can invite family members.' };
    default:
      return { status: 500, error: 'Unable to create this invitation right now.' };
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
      key: `finance-household-invite:${user.id}:${getClientIp(req)}`,
      max: 15,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many invitations. Please wait a moment and try again.');
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || email.length > 320) return res.status(400).json({ error: 'Enter a valid family member email address.' });

    const { data, error } = await supabase.rpc('invite_finance_household_member', {
      p_owner_user_id: user.id,
      p_member_email: email,
    });
    if (error) {
      console.error('Finance household invite failed:', error);
      return res.status(500).json({ error: 'Unable to create this invitation right now.' });
    }
    if (!data?.ok) {
      const failure = getFailure(data);
      return res.status(failure.status).json({ error: failure.error });
    }

    return res.status(200).json({
      ok: true,
      delivery: data.delivery || 'pending',
      expiresAt: data.expires_at || null,
    });
  } catch (error) {
    console.error('Finance household invite endpoint failed:', error);
    return res.status(500).json({ error: 'Unable to create this invitation right now.' });
  }
}
