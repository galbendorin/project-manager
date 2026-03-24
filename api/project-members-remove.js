import {
  applyApiCors,
  getAdminSupabase,
  requireAuthenticatedUser,
} from './_auth.js';

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
    const memberUserId = String(req.body?.memberUserId || '').trim();

    if (!projectId || !memberUserId) {
      return res.status(400).json({ error: 'Missing required fields: projectId and memberUserId.' });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('Failed to load project for member removal:', projectError);
      return res.status(500).json({ error: 'Unable to load project.' });
    }

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.user_id !== user.id) {
      return res.status(403).json({ error: 'Only the project owner can remove collaborators.' });
    }

    const { data: existingMember, error: memberLookupError } = await supabase
      .from('project_members')
      .select('id, user_id, member_email')
      .eq('project_id', projectId)
      .eq('user_id', memberUserId)
      .maybeSingle();

    if (memberLookupError) {
      console.error('Failed to load project collaborator for removal:', memberLookupError);
      return res.status(500).json({ error: 'Unable to verify the collaborator.' });
    }

    if (!existingMember) {
      return res.status(404).json({ error: 'Collaborator not found on this project.' });
    }

    const { error: deleteError } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', memberUserId);

    if (deleteError) {
      console.error('Failed to remove project collaborator:', deleteError);
      return res.status(500).json({ error: 'Unable to remove this collaborator right now.' });
    }

    return res.status(200).json({
      ok: true,
      removedMember: existingMember,
    });
  } catch (error) {
    console.error('Project member removal error:', error);
    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}
