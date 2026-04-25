import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { normalizeInviteEmail } from '../src/utils/projectSharing.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();
const GENERIC_SUCCESS_MESSAGE = 'Access is ready for this email. If they create an account later, it will appear after sign-in.';

const isMissingInviteSupportError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42p01'
    || code === '42883'
    || message.includes('invite_project_member')
    || message.includes('project_member_invites')
    || message.includes('project_members');
};

export const resolveProjectInviteRpcResponse = (result = {}) => {
  if (result?.ok) {
    return {
      status: 200,
      body: {
        ok: true,
        message: GENERIC_SUCCESS_MESSAGE,
        delivery: result.delivery || 'existing-access',
      },
    };
  }

  switch (String(result?.code || '')) {
    case 'invalid_request':
      return { status: 400, body: { error: 'Missing required fields: projectId and email.' } };
    case 'project_not_found':
      return { status: 404, body: { error: 'Project not found.' } };
    case 'forbidden':
      return { status: 403, body: { error: 'Only the project owner can share this project.' } };
    case 'owner_email':
      return { status: 400, body: { error: 'You already own this project.' } };
    case 'seat_cap_exceeded': {
      const limit = Number(result?.limit) || 5;
      return {
        status: 409,
        body: { error: `This project supports up to ${limit} collaborators at once.` },
      };
    }
    default:
      return { status: 500, body: { error: 'Unable to share this project right now.' } };
  }
};

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Server authentication is not configured.' });
  }

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const limitResult = await checkRateLimit({
      key: `project-invite:${user.id}:${getClientIp(req)}`,
      max: 15,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, 'Too many sharing requests. Please wait a moment and try again.');
    }

    const projectId = String(req.body?.projectId || '').trim();
    const email = normalizeInviteEmail(req.body?.email);

    if (!projectId || !email) {
      return res.status(400).json({ error: 'Missing required fields: projectId and email.' });
    }

    if (email === normalizeInviteEmail(user.email)) {
      return res.status(400).json({ error: 'You already own this project.' });
    }

    const { data: inviteResult, error: inviteError } = await supabase.rpc('invite_project_member', {
      target_project_id: projectId,
      invite_email: email,
      invited_by_user_id: user.id,
    });

    if (inviteError) {
      if (isMissingInviteSupportError(inviteError)) {
        return res.status(503).json({ error: 'Sharing protection is not configured yet. Apply the latest sharing migration first.' });
      }
      console.error('Failed to execute protected project invite flow:', inviteError);
      return res.status(500).json({ error: 'Unable to share this project right now.' });
    }

    const response = resolveProjectInviteRpcResponse(inviteResult);
    return res.status(response.status).json(response.body);
  } catch (error) {
    console.error('Project invite error:', error);
    return res.status(500).json({ error: 'Unable to share this project right now.' });
  }
}
