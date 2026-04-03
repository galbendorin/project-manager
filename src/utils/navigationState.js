import { readLocalJson, removeLocalJson, writeLocalJson } from './offlineState';

const LAST_PATH_KEY = 'pmworkspace:last-path:v1';
const LAST_PROJECT_KEY = 'pmworkspace:last-project:v1';

export const loadLastAppPath = () => readLocalJson(LAST_PATH_KEY, '/');

export const saveLastAppPath = (path) => writeLocalJson(LAST_PATH_KEY, path || '/');

export const loadLastProject = () => readLocalJson(LAST_PROJECT_KEY, null);

export const saveLastProject = (project) => {
  if (!project) return false;
  return writeLocalJson(LAST_PROJECT_KEY, {
    id: project.id,
    user_id: project.user_id,
    name: project.name,
    created_at: project.created_at,
    updated_at: project.updated_at,
    isOwned: Boolean(project.isOwned),
    isShared: Boolean(project.isShared),
    project_members: Array.isArray(project.project_members) ? project.project_members : [],
  });
};

export const clearLastProject = () => removeLocalJson(LAST_PROJECT_KEY);
