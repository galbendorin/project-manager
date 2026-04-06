import { supabase } from '../lib/supabase';
import {
  getWeekDateRange,
  toWeekStartIso,
} from './timesheets';
import { createOfflineTempId, readLocalJson, readOfflineJson, writeLocalJson } from './offlineState';

const TIMESHEET_OFFLINE_PREFIX = 'pmworkspace:timesheet-offline:v1';

export const isMissingColumnError = (error, columnName) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return message.includes(columnName.toLowerCase()) && message.includes('column');
};

export const isMissingRelationError = (error, relationName) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes(relationName.toLowerCase()) && (message.includes('relation') || message.includes('relationship'));
};

export const isSchemaMissingError = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return message.includes('does not exist')
    || message.includes('could not find')
    || message.includes('relation')
    || message.includes('column');
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getTodayIso = () => new Date().toISOString().slice(0, 10);

export const getDefaultDateForWeek = (weekStart) => {
  const { start, endInclusive } = getWeekDateRange(weekStart);
  const today = getTodayIso();
  if (today >= start && today <= endInclusive) return today;
  return start;
};

export const createDefaultComposer = (projectId = '', weekStart = toWeekStartIso(new Date())) => ({
  projectId,
  entryDate: getDefaultDateForWeek(weekStart),
  startTime: '09:00',
  durationMinutes: '60',
  description: '',
});

export const buildTimesheetOfflineKey = (userId = 'anon') => `${TIMESHEET_OFFLINE_PREFIX}:${userId}`;

export const createEmptyTimesheetOfflineState = () => ({
  projects: [],
  entriesByWeek: {},
  queue: [],
  selectedProjectId: '',
  weekStart: '',
  viewMode: 'mine',
  lastSyncedAt: '',
});

export const loadTimesheetOfflineState = (userId) => (
  readLocalJson(buildTimesheetOfflineKey(userId), createEmptyTimesheetOfflineState())
);

export const loadTimesheetOfflineStateAsync = async (userId) => (
  readOfflineJson(buildTimesheetOfflineKey(userId), createEmptyTimesheetOfflineState())
);

export const saveTimesheetOfflineState = (userId, state) => {
  writeLocalJson(buildTimesheetOfflineKey(userId), {
    ...createEmptyTimesheetOfflineState(),
    ...(state || {}),
  });
};

export const sortEntries = (items = []) => (
  [...items].sort((left, right) => {
    if (left.entry_date !== right.entry_date) {
      return String(left.entry_date || '').localeCompare(String(right.entry_date || ''));
    }
    if ((left.start_minutes ?? 0) !== (right.start_minutes ?? 0)) {
      return (left.start_minutes ?? 0) - (right.start_minutes ?? 0);
    }
    return String(left.id || '').localeCompare(String(right.id || ''));
  })
);

export const createOfflineTimeEntry = ({ payload, entryId }) => {
  const timestamp = new Date().toISOString();
  return {
    id: entryId || createOfflineTempId('offline-time'),
    project_id: payload.project_id,
    user_id: payload.user_id,
    entry_date: payload.entry_date,
    start_minutes: payload.start_minutes,
    duration_minutes: payload.duration_minutes,
    description: payload.description || '',
    created_at: timestamp,
    updated_at: timestamp,
  };
};

export const formatSyncTimeLabel = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export const queryTimesheetProjects = async () => {
  let includeMembers = true;
  let includeIsDemo = true;
  let data = null;
  let error = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selectFields = [
      'id',
      'user_id',
      'name',
      includeIsDemo ? 'is_demo' : null,
      'created_at',
      'updated_at',
      includeMembers ? 'project_members(id, user_id, member_email, role, invited_by_user_id, created_at)' : null,
    ].filter(Boolean).join(', ');

    const response = await supabase
      .from('projects')
      .select(selectFields)
      .order('updated_at', { ascending: false });

    data = response.data;
    error = response.error;

    if (!error) break;

    let shouldRetry = false;
    if (includeMembers && isMissingRelationError(error, 'project_members')) {
      includeMembers = false;
      shouldRetry = true;
    }
    if (includeIsDemo && isMissingColumnError(error, 'is_demo')) {
      includeIsDemo = false;
      shouldRetry = true;
    }
    if (!shouldRetry) break;
  }

  return { data, error };
};
