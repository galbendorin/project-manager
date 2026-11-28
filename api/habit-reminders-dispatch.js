import { handleSchedule } from '@vercel/schedules';
import { getAdminSupabase } from './_auth.js';
import {
  deactivatePushSubscription,
  isWebPushConfigured,
  sendWebPushNotification,
} from './_webPush.js';
import { evaluateHabitReminderSchedule } from '../src/utils/habitTracker.js';

const PERMANENT_PUSH_FAILURE_CODES = new Set([404, 410]);

export const createHabitRemindersDispatcher = ({
  supabase = getAdminSupabase(),
  now = () => new Date(),
  windowMinutes = 60,
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

  const { data: reminders, error: remindersError } = await supabase
    .from('habit_reminders')
    .select('id, user_id, habit_id, title, reminder_time, frequency, weekdays, timezone, is_enabled, last_triggered_date')
    .eq('is_enabled', true);

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
      skippedRace: 0,
    };
  }

  const userIds = [...new Set(dueEntries.map(({ reminder }) => reminder.user_id).filter(Boolean))];
  const habitIds = [...new Set(dueEntries.map(({ reminder }) => reminder.habit_id).filter(Boolean))];

  const [subscriptionsResult, habitsResult] = await Promise.all([
    supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, subscription')
      .in('user_id', userIds)
      .eq('is_active', true),
    habitIds.length > 0
      ? supabase
        .from('habit_items')
        .select('id, user_id, name, archived_at')
        .in('id', habitIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (subscriptionsResult.error) {
    throw new Error(`Failed to load push subscriptions: ${subscriptionsResult.error.message || 'unknown error'}`);
  }
  if (habitsResult.error) {
    throw new Error(`Failed to load habit items: ${habitsResult.error.message || 'unknown error'}`);
  }

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
  let skippedRace = 0;

  for (const { reminder, evaluation } of dueEntries) {
    const habit = reminder.habit_id ? habitById.get(reminder.habit_id) : null;
    if (reminder.habit_id && (!habit || Boolean(habit.archived_at))) {
      skippedArchived += 1;
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
          console.error('Habit reminder push delivery failed:', {
            reminderId: reminder.id,
            statusCode,
            message: error?.message,
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
    skippedRace,
  };
};

const dispatchHabitReminders = createHabitRemindersDispatcher();

export const POST = handleSchedule(async (metadata) => {
  const result = await dispatchHabitReminders();
  console.info('Habit reminders schedule run completed:', {
    schedule: metadata?.name || 'habit-reminders-dispatch',
    executionId: metadata?.executionId || '',
    ...result,
  });
});
