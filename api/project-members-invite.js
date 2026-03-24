import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';
import { normalizeInviteEmail } from '../src/utils/projectSharing.js';

const supabase = getAdminSupabase();

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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', email)
      .maybeSingle();

    if (profileError) {
      console.error('Failed to resolve invite email:', profileError);
      return res.status(500).json({ error: 'Unable to look up that email address.' });
    }

    if (!profile?.id) {
      return res.status(404).json({ error: 'That email does not belong to an existing PM Workspace account yet.' });
    }

    if (profile.id === user.id) {
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
    if (activeMembers.some((member) => member.user_id === profile.id || member.member_email === email)) {
      return res.status(409).json({ error: 'That account already has access to this project.' });
    }

    if (activeMembers.length > 0) {
      return res.status(409).json({ error: 'This MVP supports one collaborator per project.' });
    }

    const { data: insertedMember, error: insertError } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: profile.id,
        member_email: email,
        role: 'editor',
        invited_by_user_id: user.id,
      })
      .select('id, project_id, user_id, member_email, role, invited_by_user_id, created_at')
      .single();

    if (insertError) {
      console.error('Failed to insert project collaborator:', insertError);
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'This project already has a collaborator.' });
      }
      return res.status(500).json({ error: 'Unable to share this project right now.' });
    }

    return res.status(200).json({
      ok: true,
      member: insertedMember,
      project: {
        id: project.id,
        name: project.name,
      },
    });
  } catch (error) {
    console.error('Project invite error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
