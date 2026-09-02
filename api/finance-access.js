import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPERATIONS = Object.freeze({
  SET_OWNER_ACCESS: 'set-owner-access',
  RESPOND_TO_INVITATION: 'respond-to-invitation',
  INVITE_MEMBER: 'invite-member',
  REMOVE_MEMBER: 'remove-member',
  LEAVE_HOUSEHOLD: 'leave-household',
});

const RATE_LIMITS = Object.freeze({
  [OPERATIONS.SET_OWNER_ACCESS]: { max: 20, message: 'Too many access changes. Please wait a moment and try again.' },
  [OPERATIONS.RESPOND_TO_INVITATION]: { max: 20, message: 'Too many invitation updates. Please wait a moment and try again.' },
  [OPERATIONS.INVITE_MEMBER]: { max: 15, message: 'Too many invitations. Please wait a moment and try again.' },
  [OPERATIONS.REMOVE_MEMBER]: { max: 20, message: 'Too many access changes. Please wait a moment and try again.' },
  [OPERATIONS.LEAVE_HOUSEHOLD]: { max: 10, message: 'Too many access changes. Please wait a moment and try again.' },
});

const getAdminAccessFailure = (code) => {
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

const getInvitationFailure = (code) => {
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

const getInviteFailure = (result = {}) => {
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

const setOwnerAccess = async ({ req, res, user }) => {
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
    const failure = getAdminAccessFailure(data?.code);
    return res.status(failure.status).json({ error: failure.error });
  }

  return res.status(200).json({
    ok: true,
    email: data.email,
    enabled: data.enabled === true,
  });
};

const respondToInvitation = async ({ req, res, user }) => {
  const invitationId = String(req.body?.invitationId || '').trim();
  const invitationAction = String(req.body?.invitationAction || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(invitationId) || !['accept', 'decline'].includes(invitationAction)) {
    return res.status(400).json({ error: 'Invitation and action are required.' });
  }

  const functionName = invitationAction === 'accept'
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
    const failure = getInvitationFailure(data?.code);
    return res.status(failure.status).json({ error: failure.error });
  }

  return res.status(200).json({ ok: true, action: invitationAction });
};

const inviteMember = async ({ req, res, user }) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || email.length > 320) {
    return res.status(400).json({ error: 'Enter a valid family member email address.' });
  }

  const { data, error } = await supabase.rpc('invite_finance_household_member', {
    p_owner_user_id: user.id,
    p_member_email: email,
  });
  if (error) {
    console.error('Finance household invite failed:', error);
    return res.status(500).json({ error: 'Unable to create this invitation right now.' });
  }
  if (!data?.ok) {
    const failure = getInviteFailure(data);
    return res.status(failure.status).json({ error: failure.error });
  }

  return res.status(200).json({
    ok: true,
    delivery: data.delivery || 'pending',
    expiresAt: data.expires_at || null,
  });
};

const removeMember = async ({ req, res, user }) => {
  const membershipId = String(req.body?.membershipId || '').trim();
  if (!UUID_PATTERN.test(membershipId)) {
    return res.status(400).json({ error: 'Choose the family member to remove.' });
  }

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
};

const leaveHousehold = async ({ res, user }) => {
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
};

const operationHandlers = Object.freeze({
  [OPERATIONS.SET_OWNER_ACCESS]: setOwnerAccess,
  [OPERATIONS.RESPOND_TO_INVITATION]: respondToInvitation,
  [OPERATIONS.INVITE_MEMBER]: inviteMember,
  [OPERATIONS.REMOVE_MEMBER]: removeMember,
  [OPERATIONS.LEAVE_HOUSEHOLD]: leaveHousehold,
});

export default async function handler(req, res) {
  applyApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase) return res.status(500).json({ error: 'Server authentication is not configured.' });

  try {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) return;

    const operation = String(req.body?.operation || '').trim().toLowerCase();
    const operationHandler = operationHandlers[operation];
    const rateLimit = RATE_LIMITS[operation];
    if (!operationHandler || !rateLimit) {
      return res.status(400).json({ error: 'Choose a valid Finance access action.' });
    }

    const limitResult = await checkRateLimit({
      key: `finance-access:${operation}:${user.id}:${getClientIp(req)}`,
      max: rateLimit.max,
      windowMs: 5 * 60_000,
      strictShared: true,
    });
    if (!limitResult.ok) {
      return sendRateLimitResponse(res, limitResult, rateLimit.message);
    }

    return operationHandler({ req, res, user });
  } catch (error) {
    console.error('Finance access endpoint failed:', error);
    return res.status(500).json({ error: 'Unable to update Finance access right now.' });
  }
}
