import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getFailure = (code) => {
  switch (String(code || '')) {
    case 'email_not_verified':
      return { status: 403, error: 'Verify your account email before accepting this invitation.' };
    case 'owner_conflict':
      return { status: 409, error: 'Your account already owns a household plan.' };
    case 'member_conflict':
      return { status: 409, error: 'Your account already belongs to another household plan.' };
    case 'invitation_unavailable':
      return { status: 404, error: 'This invitation is no longer available.' };
    default:
      return { status: 500, error: 'Unable to update this invitation right now.' };
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
      key: `finance-household-invitation:${user.id}:${getClientIp(req)}`,
      max: 20,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many invitation updates. Please wait a moment and try again.');
    }

    const invitationId = String(req.body?.invitationId || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!UUID_PATTERN.test(invitationId) || !['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Invitation and action are required.' });
    }

    const functionName = action === 'accept'
      ? 'accept_finance_household_invitation'
      : 'decline_finance_household_invitation';
    const { data, error } = await supabase.rpc(functionName, {
      p_actor_user_id: user.id,
      p_invitation_id: invitationId,
    });
    if (error) {
      console.error('Finance household invitation update failed:', error);
      return res.status(500).json({ error: 'Unable to update this invitation right now.' });
    }
    if (!data?.ok) {
      const failure = getFailure(data?.code);
      return res.status(failure.status).json({ error: failure.error });
    }

    return res.status(200).json({ ok: true, action });
  } catch (error) {
    console.error('Finance household invitation endpoint failed:', error);
    return res.status(500).json({ error: 'Unable to update this invitation right now.' });
  }
}
