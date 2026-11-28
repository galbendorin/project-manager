import { handleSchedule } from '@vercel/schedules';
import { getAdminSupabase } from './_auth.js';
import { logServerError, logServerInfo, recordServerMetric } from './_observability.js';
import {
  deactivatePushSubscription,
  isWebPushConfigured,
  sendWebPushNotification,
} from './_webPush.js';
import { evaluateHabitReminderSchedule } from '../src/utils/habitTracker.js';

const PERMANENT_PUSH_FAILURE_CODES = new Set([404, 410]);
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_ID_CHUNK_SIZE = 200;

const fetchAllPagedRows = async (buildQuery, { pageSize = DEFAULT_PAGE_SIZE, orderColumn = 'id' } = {}) => {
  const rows = [];
  let offset = 0;

  while (true) {
    let query = buildQuery();
    const canOrder = typeof query?.order === 'function';
    const canRange = typeof query?.range === 'function';
    if (canOrder) {
      query = query.order(orderColumn, { ascending: true });
    }
    if (canRange) {
      query = query.range(offset, offset + pageSize - 1);
    }

    const { data, error } = await query;
    if (error) {
      return { data: null, error };
    }

    const batch = data || [];
    rows.push(...batch);

    if (!canRange || batch.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return { data: rows, error: null };
};

const fetchRowsByIdChunks = async (ids, buildChunkQuery, { chunkSize = DEFAULT_ID_CHUNK_SIZE, pageSize = DEFAULT_PAGE_SIZE, orderColumn = 'id' } = {}) => {
  if (!ids.length) {
    return { data: [], error: null };
  }

  const rows = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const result = await fetchAllPagedRows(() => buildChunkQuery(chunk), {
      pageSize,
      orderColumn,
    });
    if (result.error) {
      return result;
    }
    rows.push(...result.data);
  }

  return { data: rows, error: null };
};

export const createHabitRemindersDispatcher = ({
  supabase = getAdminSupabase(),
  now = () => new Date(),
  windowMinutes = 60,
  pageSize = DEFAULT_PAGE_SIZE,
  idChunkSize = DEFAULT_ID_CHUNK_SIZE,
  isPushConfigured = isWebPushConfigured,
  sendPush = sendWebPushNotification,
  deactivatePush = deactivatePushSubscription,
} = {}) => async function dispatchHabitReminders() {
  if (!isPushConfigured()) {
    return {
      ok: false,
      skipped: 'push_not_configured',
      remindersChecked: 0,
      dueCount: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      deactivated: 0,
    };
  }

  if (!supabase) {
    return {
      ok: false,
      skipped: 'supabase_not_configured',
      remindersChecked: 0,
      dueCount: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      deactivated: 0,
    };
  }

  const currentNow = typeof now === 'function' ? now() : new Date(now);

  const { data: reminders, error: remindersError } = await fetchAllPagedRows(
    () => supabase
      .from('habit_reminders')
      .select('id, user_id, habit_id, household_project_id, title, reminder_time, frequency, weekdays, timezone, is_enabled, last_triggered_date')
      .eq('is_enabled', true),
    { pageSize },
  );

  if (remindersError) {
    throw new Error(`Failed to load habit reminders: ${remindersError.message || 'unknown error'}`);
  }

  const reminderList = reminders || [];
  const dueEntries = [];
  for (const reminder of reminderList) {
    const evaluation = evaluateHabitReminderSchedule({
      reminder,
      now: currentNow,
      windowMinutes,
    });
    if (evaluation.due) {
      dueEntries.push({ reminder, evaluation });
    }
  }

  if (dueEntries.length === 0) {
    return {
      ok: true,
      remindersChecked: reminderList.length,
      dueCount: 0,
      claimed: 0,
      sent: 0,
      failed: 0,
      deactivated: 0,
      skippedNoSubscription: 0,
      skippedArchived: 0,
      skippedUnauthorized: 0,
      skippedRace: 0,
    };
  }

  const userIds = [...new Set(dueEntries.map(({ reminder }) => reminder.user_id).filter(Boolean))];
  const habitIds = [...new Set(dueEntries.map(({ reminder }) => reminder.habit_id).filter(Boolean))];

  const [subscriptionsResult, habitsResult] = await Promise.all([
    fetchRowsByIdChunks(
      userIds,
      (userChunk) => supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, subscription')
        .in('user_id', userChunk)
        .eq('is_active', true),
      { chunkSize: idChunkSize, pageSize },
    ),
    fetchRowsByIdChunks(
      habitIds,
      (habitChunk) => supabase
        .from('habit_items')
        .select('id, user_id, household_project_id, name, archived_at')
        .in('id', habitChunk),
      { chunkSize: idChunkSize, pageSize },
    ),
  ]);

  if (subscriptionsResult.error) {
    throw new Error(`Failed to load push subscriptions: ${subscriptionsResult.error.message || 'unknown error'}`);
  }
  if (habitsResult.error) {
    throw new Error(`Failed to load habit items: ${habitsResult.error.message || 'unknown error'}`);
  }

  const householdProjectIds = [...new Set([
    ...dueEntries.map(({ reminder }) => reminder.household_project_id),
    ...(habitsResult.data || []).map((habit) => habit.household_project_id),
  ].filter(Boolean))];

  const projectOwnerById = new Map();
  const projectMembersByProject = new Map();
  if (householdProjectIds.length > 0) {
    const [projectsResult, membersResult] = await Promise.all([
      fetchRowsByIdChunks(
        householdProjectIds,
        (projectChunk) => supabase
          .from('projects')
          .select('id, user_id')
          .in('id', projectChunk),
        { chunkSize: idChunkSize, pageSize },
      ),
      fetchRowsByIdChunks(
        householdProjectIds,
        (projectChunk) => supabase
          .from('project_members')
          .select('id, project_id, user_id')
          .in('project_id', projectChunk),
        { chunkSize: idChunkSize, pageSize },
      ),
    ]);

    if (projectsResult.error) {
      throw new Error(`Failed to load household projects: ${projectsResult.error.message || 'unknown error'}`);
    }
    if (membersResult.error) {
      throw new Error(`Failed to load household project members: ${membersResult.error.message || 'unknown error'}`);
    }

    for (const project of projectsResult.data || []) {
      if (project?.id && project?.user_id) {
        projectOwnerById.set(project.id, project.user_id);
      }
    }
    for (const member of membersResult.data || []) {
      if (!member?.project_id || !member?.user_id) continue;
      const members = projectMembersByProject.get(member.project_id) || new Set();
      members.add(member.user_id);
      projectMembersByProject.set(member.project_id, members);
    }
  }

  const canUserAccessHabitRecord = (record, userId) => {
    if (!record || !userId) return false;
    if (record.household_project_id) {
      return (
        projectOwnerById.get(record.household_project_id) === userId
        || Boolean(projectMembersByProject.get(record.household_project_id)?.has(userId))
      );
    }
    return record.user_id === userId;
  };

  const subscriptionsByUser = new Map();
  for (const row of subscriptionsResult.data || []) {
    if (!row?.user_id || !row?.subscription) continue;
    const list = subscriptionsByUser.get(row.user_id) || [];
    list.push(row);
    subscriptionsByUser.set(row.user_id, list);
  }

  const habitById = new Map();
  for (const habit of habitsResult.data || []) {
    if (habit?.id) habitById.set(habit.id, habit);
  }

  let claimed = 0;
  let sent = 0;
  let failed = 0;
  let deactivated = 0;
  let skippedNoSubscription = 0;
  let skippedArchived = 0;
  let skippedUnauthorized = 0;
  let skippedRace = 0;

  for (const { reminder, evaluation } of dueEntries) {
    if (!canUserAccessHabitRecord(reminder, reminder.user_id)) {
      skippedUnauthorized += 1;
      continue;
    }

    const habit = reminder.habit_id ? habitById.get(reminder.habit_id) : null;
    if (reminder.habit_id && (!habit || Boolean(habit.archived_at))) {
      skippedArchived += 1;
      continue;
    }
    if (reminder.habit_id && !canUserAccessHabitRecord(habit, reminder.user_id)) {
      skippedUnauthorized += 1;
      continue;
    }

    const userSubscriptions = subscriptionsByUser.get(reminder.user_id) || [];
    if (userSubscriptions.length === 0) {
      skippedNoSubscription += 1;
      continue;
    }

    const previousTriggeredDate = reminder.last_triggered_date || null;
    let claimQuery = supabase
      .from('habit_reminders')
      .update({ last_triggered_date: evaluation.dateKey })
      .eq('id', reminder.id)
      .eq('is_enabled', true);

    claimQuery = previousTriggeredDate
      ? claimQuery.eq('last_triggered_date', previousTriggeredDate)
      : claimQuery.is('last_triggered_date', null);

    const { data: claimedRows, error: claimError } = await claimQuery.select('id');
    if (claimError || !claimedRows?.length) {
      skippedRace += 1;
      continue;
    }

    claimed += 1;

    const habitName = String(habit?.name || '').trim();
    const payload = {
      title: reminder.title || (habitName ? `${habitName} reminder` : 'Habit reminder'),
      body: habitName
        ? `Time to log "${habitName}" in Track Habits.`
        : 'Time to check in on Track Habits.',
      icon: '/pmworkspace-icon-192.png',
      badge: '/pmworkspace-icon-192.png',
      tag: `habit-reminder:${reminder.id}:${evaluation.dateKey}`,
      data: {
        url: '/habits',
        kind: 'habit-reminder',
        reminderId: reminder.id,
        habitId: reminder.habit_id || '',
        dateKey: evaluation.dateKey,
      },
    };

    let sentForReminder = 0;
    const results = await Promise.allSettled(
      userSubscriptions.map(async (row) => {
        try {
          await sendPush({ subscription: row.subscription, payload });
          return { ok: true };
        } catch (error) {
          const statusCode = Number(error?.statusCode || error?.status || 0);
          if (PERMANENT_PUSH_FAILURE_CODES.has(statusCode) || error?.code === 'invalid_push_subscription') {
            await deactivatePush(row.endpoint);
            return { ok: false, deactivated: true };
          }
          logServerError({
            event: 'habit_reminders.push_failed',
            route: '/api/habit-reminders-dispatch',
            error,
            status: statusCode || undefined,
            meta: { reminderId: reminder.id },
          });
          return { ok: false, deactivated: false };
        }
      }),
    );

    for (const entry of results) {
      if (entry.status === 'fulfilled' && entry.value?.ok) {
        sent += 1;
        sentForReminder += 1;
      } else {
        failed += 1;
        if (entry.status === 'fulfilled' && entry.value?.deactivated) {
          deactivated += 1;
        }
      }
    }

    if (sentForReminder === 0) {
      // Roll back the claim so transient failures or repaired subscriptions can still fire inside the window.
      await supabase
        .from('habit_reminders')
        .update({ last_triggered_date: previousTriggeredDate })
        .eq('id', reminder.id)
        .eq('last_triggered_date', evaluation.dateKey);
    }
  }

  return {
    ok: true,
    remindersChecked: reminderList.length,
    dueCount: dueEntries.length,
    claimed,
    sent,
    failed,
    deactivated,
    skippedNoSubscription,
    skippedArchived,
    skippedUnauthorized,
    skippedRace,
  };
};

const dispatchHabitReminders = createHabitRemindersDispatcher();

export const POST = handleSchedule(async (metadata) => {
  const startedAt = performance.now();
  const scheduleName = metadata?.name || 'habit-reminders-dispatch';
  try {
    const result = await dispatchHabitReminders();
    const durationMs = performance.now() - startedAt;
    const outcome = result?.ok ? 'success' : 'skipped';

    logServerInfo({
      event: 'habit_reminders.dispatch_completed',
      route: '/api/habit-reminders-dispatch',
      durationMs,
      status: 200,
      meta: {
        schedule: scheduleName,
        executionId: metadata?.executionId || '',
        ...result,
      },
    });
    recordServerMetric('habit_reminders.dispatch', 1, { outcome, skipped: result?.skipped || 'none' });
    recordServerMetric('habit_reminders.dispatch.duration_ms', Math.round(durationMs), { outcome });
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    logServerError({
      event: 'habit_reminders.dispatch_failed',
      route: '/api/habit-reminders-dispatch',
      durationMs,
      status: 500,
      error,
      meta: {
        schedule: scheduleName,
        executionId: metadata?.executionId || '',
      },
    });
    recordServerMetric('habit_reminders.dispatch', 1, { outcome: 'error' });
    recordServerMetric('habit_reminders.dispatch.duration_ms', Math.round(durationMs), { outcome: 'error' });
    throw error;
  }
});
