import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { normalizeInviteEmail } from '../src/utils/projectSharing.js';
import { checkRateLimit, getClientIp, sendRateLimitResponse } from './_rateLimit.js';

const supabase = getAdminSupabase();
const MAX_PROJECT_EDITORS = 5;
const GENERIC_SUCCESS_MESSAGE = 'Access is ready for this email. If they create an account later, it will appear after sign-in.';

const isMissingInviteTableError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42p01' || message.includes('project_member_invites');
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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('Failed to load project for sharing:', projectError);
      return res.status(500).json({ error: 'Unable to load project.' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.user_id !== user.id) {
      return res.status(403).json({ error: 'Only the project owner can share this project.' });
    }

    if (email === normalizeInviteEmail(user.email)) {
      return res.status(400).json({ error: 'You already own this project.' });
    }

    const { data: existingMembers, error: membersError } = await supabase
      .from('project_members')
      .select('id, user_id, member_email')
      .eq('project_id', projectId);

    if (membersError) {
      console.error('Failed to inspect existing project members:', membersError);
      return res.status(500).json({ error: 'Unable to verify existing project access.' });
    }

    const activeMembers = existingMembers || [];
    if (activeMembers.some((member) => member.member_email === email)) {
      return res.status(200).json({ ok: true, message: GENERIC_SUCCESS_MESSAGE, delivery: 'existing-access' });
    }

    let pendingInvites = [];
    let supportsPendingInvites = true;
    const { data: inviteRows, error: inviteError } = await supabase
      .from('project_member_invites')
      .select('id, member_email')
      .eq('project_id', projectId)
      .is('accepted_at', null)
      .is('revoked_at', null);

    if (inviteError) {
      if (isMissingInviteTableError(inviteError)) {
        supportsPendingInvites = false;
      } else {
        console.error('Failed to inspect pending project invites:', inviteError);
        return res.status(500).json({ error: 'Unable to verify pending access.' });
      }
    } else {
      pendingInvites = inviteRows || [];
    }

    if (pendingInvites.some((invite) => invite.member_email === email)) {
      return res.status(200).json({ ok: true, message: GENERIC_SUCCESS_MESSAGE, delivery: 'pending-access' });
    }

    if ((activeMembers.length + pendingInvites.length) >= MAX_PROJECT_EDITORS) {
      return res.status(409).json({ error: `This project supports up to ${MAX_PROJECT_EDITORS} collaborators at once.` });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();

    if (profileError) {
      console.error('Failed to resolve invite email:', profileError);
      return res.status(500).json({ error: 'Unable to look up that email address.' });
    }

    if (profile?.id === user.id) {
      return res.status(400).json({ error: 'You already own this project.' });
    }

    if (profile?.id) {
      const { error: insertError } = await supabase
        .from('project_members')
        .insert({
          project_id: projectId,
          user_id: profile.id,
          member_email: email,
          role: 'editor',
          invited_by_user_id: user.id,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          return res.status(409).json({
            error: 'Project sharing capacity is still using the old MVP limit. Apply the latest sharing migration to support more editors.'
          });
        }
        console.error('Failed to insert project collaborator:', insertError);
        return res.status(500).json({ error: 'Unable to share this project right now.' });
      }

      return res.status(200).json({
        ok: true,
        message: GENERIC_SUCCESS_MESSAGE,
        delivery: 'existing-account'
      });
    }

    if (!supportsPendingInvites) {
      return res.status(503).json({ error: 'Pending invite support is not configured yet. Apply the latest sharing migration first.' });
    }

    const { error: pendingInviteError } = await supabase
      .from('project_member_invites')
      .insert({
        project_id: projectId,
        member_email: email,
        role: 'editor',
        invited_by_user_id: user.id,
      });

    if (pendingInviteError) {
      if (pendingInviteError.code === '23505') {
        return res.status(200).json({ ok: true, message: GENERIC_SUCCESS_MESSAGE, delivery: 'pending-access' });
      }
      console.error('Failed to create pending project invite:', pendingInviteError);
      return res.status(500).json({ error: 'Unable to queue project access right now.' });
    }

    return res.status(200).json({
      ok: true,
      message: GENERIC_SUCCESS_MESSAGE,
      delivery: 'pending-signup'
    });
  } catch (error) {
    console.error('Project invite error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
