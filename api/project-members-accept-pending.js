import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';

const supabase = getAdminSupabase();
const MAX_PROJECT_EDITORS = 5;

const isMissingInviteTableError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42p01' || message.includes('project_member_invites');
};

const normalizeInviteEmail = (value = '') => String(value || '').trim().toLowerCase();

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

    const email = normalizeInviteEmail(user.email);
    if (!email) {
      return res.status(400).json({ error: 'Authenticated user email is missing.' });
    }

    const { data: invites, error: inviteError } = await supabase
      .from('project_member_invites')
      .select('id, project_id, member_email, role, invited_by_user_id')
      .eq('member_email', email)
      .is('accepted_at', null)
      .is('revoked_at', null);

    if (inviteError) {
      if (isMissingInviteTableError(inviteError)) {
        return res.status(200).json({ ok: true, acceptedCount: 0, skippedCount: 0, unavailable: true });
      }
      console.error('Failed to load pending project invites:', inviteError);
      return res.status(500).json({ error: 'Unable to check pending project invites.' });
    }

    const pendingInvites = invites || [];
    if (pendingInvites.length === 0) {
      return res.status(200).json({ ok: true, acceptedCount: 0, skippedCount: 0 });
    }

    let acceptedCount = 0;
    let skippedCount = 0;

    for (const invite of pendingInvites) {
      const { data: existingMember, error: existingMemberError } = await supabase
        .from('project_members')
        .select('id')
        .eq('project_id', invite.project_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingMemberError) {
        console.error('Failed to check existing project membership:', existingMemberError);
        skippedCount += 1;
        continue;
      }

      if (existingMember?.id) {
        await supabase
          .from('project_member_invites')
          .update({
            accepted_by_user_id: user.id,
            accepted_at: new Date().toISOString(),
          })
          .eq('id', invite.id);
        acceptedCount += 1;
        continue;
      }

      const { count: memberCount, error: memberCountError } = await supabase
        .from('project_members')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', invite.project_id);

      if (memberCountError) {
        console.error('Failed to count current project members:', memberCountError);
        skippedCount += 1;
        continue;
      }

      if ((memberCount || 0) >= MAX_PROJECT_EDITORS) {
        skippedCount += 1;
        continue;
      }

      const { error: memberInsertError } = await supabase
        .from('project_members')
        .insert({
          project_id: invite.project_id,
          user_id: user.id,
          member_email: email,
          role: invite.role || 'editor',
          invited_by_user_id: invite.invited_by_user_id || user.id,
        });

      if (memberInsertError && memberInsertError.code !== '23505') {
        console.error('Failed to accept pending project invite:', memberInsertError);
        skippedCount += 1;
        continue;
      }

      const { error: acceptError } = await supabase
        .from('project_member_invites')
        .update({
          accepted_by_user_id: user.id,
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invite.id);

      if (acceptError) {
        console.error('Failed to mark pending invite as accepted:', acceptError);
      }

      acceptedCount += 1;
    }

    return res.status(200).json({
      ok: true,
      acceptedCount,
      skippedCount,
    });
  } catch (error) {
    console.error('Pending invite acceptance error:', error);
    return res.status(500).json({ error: 'Unable to accept pending project invites right now.' });
  }
}
