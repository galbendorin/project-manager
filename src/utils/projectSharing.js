export const normalizeInviteEmail = (value = '') => String(value || '').trim().toLowerCase();

export const isProjectOwner = (project, currentUserId) => (
  Boolean(project?.user_id && currentUserId && project.user_id === currentUserId)
);

export const getProjectCollaborator = (project, currentUserId = null) => {
  const members = Array.isArray(project?.project_members) ? project.project_members : [];
  if (members.length === 0) return null;

  if (currentUserId) {
    const matchingMember = members.find((member) => member?.user_id === currentUserId);
    if (matchingMember) return matchingMember;
  }

  return members[0] || null;
};

export const normalizeProjectRecord = (project = {}, currentUserId = null) => {
  const projectMembers = Array.isArray(project?.project_members) ? project.project_members : [];
  const collaborator = getProjectCollaborator(project, currentUserId);
  const owned = isProjectOwner(project, currentUserId);

  return {
    ...project,
    is_demo: Boolean(project?.is_demo),
    project_members: projectMembers,
    collaborator,
    isOwned: owned,
    isShared: projectMembers.length > 0,
    isSharedWithMe: !owned && Boolean(collaborator),
    isSharedByMe: owned && projectMembers.length > 0,
  };
};

export const summarizeProjectAccess = (projects = [], currentUserId = null) => {
  return (projects || []).reduce((summary, project) => {
    if (isProjectOwner(project, currentUserId)) {
      summary.ownedCount += 1;
    } else {
      summary.sharedCount += 1;
    }
    return summary;
  }, { ownedCount: 0, sharedCount: 0 });
};

export const countOwnedProjects = (projects = [], currentUserId = null) => (
  (projects || []).reduce((count, project) => {
    const owned = typeof project?.isOwned === 'boolean'
      ? project.isOwned
      : isProjectOwner(project, currentUserId);
    return count + (owned ? 1 : 0);
  }, 0)
);

export const shouldSeedDemoProject = ({
  projects = [],
  currentUserId = null,
  demoSeeded = false,
} = {}) => countOwnedProjects(projects, currentUserId) === 0 && !demoSeeded;
