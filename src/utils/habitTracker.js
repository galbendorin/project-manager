const DAY_MS = 24 * 60 * 60 * 1000;

export const HABIT_STATUSES = ['yes', 'no', 'skip'];
export const HABIT_REMINDER_FREQUENCIES = ['daily', 'weekdays', 'custom'];

export const formatHabitDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return formatHabitDateKey(new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getHabitTodayKey = () => formatHabitDateKey(new Date());

export const addHabitDays = (dateKey, days) => {
  const [year, month, day] = String(dateKey || getHabitTodayKey()).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + (Number(days) || 0));
  return formatHabitDateKey(date);
};

export const getHabitWeekStart = (dateKey = getHabitTodayKey()) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const dayIndex = date.getDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  date.setDate(date.getDate() + mondayOffset);
  return formatHabitDateKey(date);
};

export const getHabitWeekDays = (weekStartKey = getHabitWeekStart()) => (
  Array.from({ length: 7 }, (_, index) => {
    const dateKey = addHabitDays(weekStartKey, index);
    const date = new Date(`${dateKey}T12:00:00`);
    return {
      dateKey,
      dayLabel: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1),
      shortLabel: date.toLocaleDateString(undefined, { day: 'numeric' }),
      fullLabel: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    };
  })
);

export const formatHabitDisplayDate = (dateKey = getHabitTodayKey()) => {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export const cycleHabitStatus = (currentStatus = '') => {
  if (!currentStatus) return 'yes';
  if (currentStatus === 'yes') return 'no';
  if (currentStatus === 'no') return 'skip';
  return '';
};

export const isHabitSuccess = (habit = {}, status = '') => {
  if (status === 'skip' || !status) return false;
  const direction = habit.direction === 'negative' ? 'negative' : 'positive';
  return direction === 'positive' ? status === 'yes' : status === 'no';
};

export const getHabitEntryMap = (entries = []) => {
  const map = new Map();
  entries.forEach((entry) => {
    if (!entry?.habitId || !entry?.entryDate) return;
    map.set(`${entry.habitId}:${entry.entryDate}`, entry);
  });
  return map;
};

export const summarizeHabitRange = ({ habits = [], entries = [], startDate, endDate } = {}) => {
  const start = new Date(`${startDate || getHabitTodayKey()}T12:00:00`);
  const end = new Date(`${endDate || startDate || getHabitTodayKey()}T12:00:00`);
  const dayCount = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  const activeHabits = habits.filter((habit) => !habit.archivedAt);
  const expected = dayCount * activeHabits.length;
  const byHabit = new Map(activeHabits.map((habit) => [habit.id, habit]));

  const totals = entries.reduce((acc, entry) => {
    const habit = byHabit.get(entry.habitId);
    if (!habit) return acc;
    if (entry.status === 'yes') acc.yes += 1;
    if (entry.status === 'no') acc.no += 1;
    if (entry.status === 'skip') acc.skip += 1;
    if (isHabitSuccess(habit, entry.status)) acc.success += 1;
    return acc;
  }, { yes: 0, no: 0, skip: 0, success: 0 });

  const completed = totals.yes + totals.no + totals.skip;
  return {
    ...totals,
    completed,
    expected,
    dayCount,
    completionRate: expected > 0 ? Math.round((completed / expected) * 100) : 0,
    successRate: completed > 0 ? Math.round((totals.success / completed) * 100) : 0,
  };
};

export const buildHabitTrendBuckets = ({ habit, entries = [], weeks = 12, endDate = getHabitTodayKey() } = {}) => {
  const endWeek = getHabitWeekStart(endDate);
  const bucketStarts = Array.from({ length: Math.max(1, weeks) }, (_, index) => (
    addHabitDays(endWeek, (index - (Math.max(1, weeks) - 1)) * 7)
  ));
  const bucketByStart = new Map(bucketStarts.map((weekStart) => [weekStart, {
    weekStart,
    yes: 0,
    no: 0,
    skip: 0,
    success: 0,
  }]));

  entries
    .filter((entry) => entry.habitId === habit?.id)
    .forEach((entry) => {
      const weekStart = getHabitWeekStart(entry.entryDate);
      const bucket = bucketByStart.get(weekStart);
      if (!bucket) return;
      if (entry.status === 'yes') bucket.yes += 1;
      if (entry.status === 'no') bucket.no += 1;
      if (entry.status === 'skip') bucket.skip += 1;
      if (isHabitSuccess(habit, entry.status)) bucket.success += 1;
    });

  return bucketStarts.map((weekStart) => bucketByStart.get(weekStart));
};

export const getHabitStreak = ({ habit, entries = [], endDate = getHabitTodayKey() } = {}) => {
  const byDate = new Map(entries
    .filter((entry) => entry.habitId === habit?.id)
    .map((entry) => [entry.entryDate, entry]));

  let cursor = endDate;
  let streak = 0;
  for (let index = 0; index < 366; index += 1) {
    const entry = byDate.get(cursor);
    if (!entry || entry.status === 'skip') break;
    if (!isHabitSuccess(habit, entry.status)) break;
    streak += 1;
    cursor = addHabitDays(cursor, -1);
  }
  return streak;
};

export const normalizeHabitReminderTime = (value = '') => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '21:00';
  const hours = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const minutes = Math.min(59, Math.max(0, Number(match[2]) || 0));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const getHabitReminderWeekday = (dateKey = getHabitTodayKey()) => {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().getDay();
  return date.getDay();
};

export const normalizeHabitReminderWeekdays = (value = []) => {
  const source = Array.isArray(value) ? value : [];
  const days = source
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return [...new Set(days)].sort((left, right) => left - right);
};

export const isHabitReminderDueOnDate = (reminder = {}, dateKey = getHabitTodayKey()) => {
  if (reminder.isEnabled === false) return false;
  const frequency = HABIT_REMINDER_FREQUENCIES.includes(reminder.frequency)
    ? reminder.frequency
    : 'daily';
  if (frequency === 'daily') return true;

  const weekday = getHabitReminderWeekday(dateKey);
  if (frequency === 'weekdays') return weekday >= 1 && weekday <= 5;

  return normalizeHabitReminderWeekdays(reminder.weekdays).includes(weekday);
};

export const getDueHabitReminders = ({ reminders = [], dateKey = getHabitTodayKey(), time = '' } = {}) => {
  const normalizedTime = normalizeHabitReminderTime(time);
  return reminders.filter((reminder) => (
    normalizeHabitReminderTime(reminder.reminderTime || reminder.reminder_time) === normalizedTime
    && isHabitReminderDueOnDate(reminder, dateKey)
  ));
};

export const DEFAULT_HABIT_REMINDER_TIMEZONE = 'Europe/London';

const HABIT_CLOCK_FORMATTER_OPTIONS = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

const resolveClockFormatter = (timeZone = DEFAULT_HABIT_REMINDER_TIMEZONE) => {
  const requested = String(timeZone || '').trim() || DEFAULT_HABIT_REMINDER_TIMEZONE;
  try {
    return {
      timeZone: requested,
      formatter: new Intl.DateTimeFormat('en-CA', {
        ...HABIT_CLOCK_FORMATTER_OPTIONS,
        timeZone: requested,
      }),
    };
  } catch {
    return {
      timeZone: DEFAULT_HABIT_REMINDER_TIMEZONE,
      formatter: new Intl.DateTimeFormat('en-CA', {
        ...HABIT_CLOCK_FORMATTER_OPTIONS,
        timeZone: DEFAULT_HABIT_REMINDER_TIMEZONE,
      }),
    };
  }
};

export const getHabitLocalClockParts = (now = new Date(), timeZone = DEFAULT_HABIT_REMINDER_TIMEZONE) => {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return null;

  const { timeZone: resolvedTimeZone, formatter } = resolveClockFormatter(timeZone);
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }

  const hourNumber = Number(parts.hour) % 24;
  const minuteNumber = Number(parts.minute) || 0;
  const hour = String(hourNumber).padStart(2, '0');
  const minute = String(minuteNumber).padStart(2, '0');

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${minute}`,
    minutesSinceMidnight: (hourNumber * 60) + minuteNumber,
    timeZone: resolvedTimeZone,
  };
};

export const evaluateHabitReminderSchedule = ({
  reminder = {},
  now = new Date(),
  windowMinutes = 60,
} = {}) => {
  const isEnabled = reminder.isEnabled ?? reminder.is_enabled;
  if (isEnabled === false) {
    return { due: false, reason: 'disabled' };
  }

  const clock = getHabitLocalClockParts(now, reminder.timezone || DEFAULT_HABIT_REMINDER_TIMEZONE);
  if (!clock) {
    return { due: false, reason: 'invalid_time' };
  }

  const reminderTime = normalizeHabitReminderTime(reminder.reminderTime || reminder.reminder_time);
  const [targetHour, targetMinute] = reminderTime.split(':').map(Number);
  const targetMinutes = (targetHour * 60) + targetMinute;

  let elapsedMinutes;
  let occurrenceDateKey;
  if (clock.minutesSinceMidnight >= targetMinutes) {
    elapsedMinutes = clock.minutesSinceMidnight - targetMinutes;
    occurrenceDateKey = clock.dateKey;
  } else {
    elapsedMinutes = clock.minutesSinceMidnight + 1440 - targetMinutes;
    occurrenceDateKey = addHabitDays(clock.dateKey, -1);
  }

  if (elapsedMinutes < 0 || elapsedMinutes > windowMinutes) {
    return {
      due: false,
      reason: 'outside_window',
      elapsedMinutes,
      dateKey: occurrenceDateKey,
      reminderTime,
      timeZone: clock.timeZone,
    };
  }

  if (!isHabitReminderDueOnDate({ ...reminder, isEnabled: true, reminderTime }, occurrenceDateKey)) {
    return {
      due: false,
      reason: 'weekday_mismatch',
      elapsedMinutes,
      dateKey: occurrenceDateKey,
      reminderTime,
      timeZone: clock.timeZone,
    };
  }

  const lastTriggeredDate = String(
    reminder.lastTriggeredDate ?? reminder.last_triggered_date ?? '',
  ).trim().slice(0, 10);

  if (lastTriggeredDate && lastTriggeredDate >= occurrenceDateKey) {
    return {
      due: false,
      reason: 'already_triggered',
      elapsedMinutes,
      dateKey: occurrenceDateKey,
      reminderTime,
      timeZone: clock.timeZone,
    };
  }

  return {
    due: true,
    reason: 'due',
    elapsedMinutes,
    dateKey: occurrenceDateKey,
    reminderTime,
    timeZone: clock.timeZone,
  };
};

export const HABIT_LOCAL_FIRED_STORAGE_PREFIX = 'pmw-habit-reminders-fired-v1';

const getDefaultLocalHabitStorage = () => (
  typeof window !== 'undefined' ? window.localStorage : null
);

export const buildLocalHabitReminderKey = ({ reminderId = '', dateKey = '', time = '' } = {}) => (
  `${String(reminderId || '').trim()}:${String(dateKey || '').trim()}:${normalizeHabitReminderTime(time)}`
);

const readLocalHabitFiredRecords = ({ userId = 'local', storage = getDefaultLocalHabitStorage() } = {}) => {
  if (!storage?.getItem) return [];
  try {
    const raw = storage.getItem(`${HABIT_LOCAL_FIRED_STORAGE_PREFIX}:${String(userId || '').trim() || 'local'}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.dateKey === 'string' && typeof entry.key === 'string')
      : [];
  } catch {
    return [];
  }
};

export const hasFiredLocalHabitReminder = ({
  userId = 'local',
  dateKey = '',
  reminderId = '',
  time = '',
  storage = getDefaultLocalHabitStorage(),
} = {}) => {
  const key = buildLocalHabitReminderKey({ reminderId, dateKey, time });
  return readLocalHabitFiredRecords({ userId, storage }).some(
    (entry) => entry.dateKey === dateKey && entry.key === key,
  );
};

export const markLocalHabitReminderFired = ({
  userId = 'local',
  dateKey = '',
  reminderId = '',
  time = '',
  storage = getDefaultLocalHabitStorage(),
} = {}) => {
  const key = buildLocalHabitReminderKey({ reminderId, dateKey, time });
  const cutoffDateKey = addHabitDays(dateKey, -2);
  const existing = readLocalHabitFiredRecords({ userId, storage })
    .filter((entry) => entry.dateKey >= cutoffDateKey);

  if (!existing.some((entry) => entry.dateKey === dateKey && entry.key === key)) {
    existing.push({ dateKey, key });
  }

  if (storage?.setItem) {
    try {
      storage.setItem(
        `${HABIT_LOCAL_FIRED_STORAGE_PREFIX}:${String(userId || '').trim() || 'local'}`,
        JSON.stringify(existing),
      );
    } catch {
      // Ignore storage quota or Safari private browsing errors.
    }
  }

  return key;
};
