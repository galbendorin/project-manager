const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_IN_DAY = 24 * 60;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_INPUT_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const TRACK_COLOR_PALETTE = [
  {
    bg: 'bg-amber-100/90',
    border: 'border-amber-300/80',
    accent: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    text: 'text-amber-950',
  },
  {
    bg: 'bg-rose-100/85',
    border: 'border-rose-300/75',
    accent: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    text: 'text-rose-950',
  },
  {
    bg: 'bg-sky-100/85',
    border: 'border-sky-300/75',
    accent: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    text: 'text-sky-950',
  },
  {
    bg: 'bg-violet-100/85',
    border: 'border-violet-300/75',
    accent: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 border-violet-200',
    text: 'text-violet-950',
  },
  {
    bg: 'bg-emerald-100/85',
    border: 'border-emerald-300/75',
    accent: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    text: 'text-emerald-950',
  },
  {
    bg: 'bg-fuchsia-100/85',
    border: 'border-fuchsia-300/75',
    accent: 'bg-fuchsia-500',
    chip: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    text: 'text-fuchsia-950',
  },
];

const toDate = (value = new Date()) => {
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
};

export const startOfIsoWeek = (value = new Date()) => {
  const date = toDate(value);
  date.setUTCHours(0, 0, 0, 0);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
};

export const toWeekStartIso = (value = new Date()) => startOfIsoWeek(value).toISOString().slice(0, 10);

export const addWeeks = (weekStart, offset = 0) => {
  const date = startOfIsoWeek(weekStart);
  date.setUTCDate(date.getUTCDate() + (offset * 7));
  return date;
};

export const formatWeekRange = (weekStart, locale = 'en-GB') => {
  const start = startOfIsoWeek(weekStart);
  const end = new Date(start.getTime() + (6 * DAY_MS));
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();
  const yearSuffix = startYear === endYear ? ` ${endYear}` : ` ${startYear} - ${endYear}`;
  return `${formatter.format(start)} - ${formatter.format(end)}${yearSuffix}`;
};

export const getWeekDates = (weekStart, locale = 'en-GB') => {
  const start = startOfIsoWeek(weekStart);
  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const dayFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    timeZone: 'UTC',
  });

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getTime() + (index * DAY_MS));
    return {
      iso: date.toISOString().slice(0, 10),
      weekday: weekdayFormatter.format(date),
      dayLabel: dayFormatter.format(date),
      isToday: toWeekStartIso(new Date()) === toWeekStartIso(date) && date.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10),
    };
  });
};

export const getWeekDateRange = (weekStart) => {
  const start = toWeekStartIso(weekStart);
  const end = addWeeks(start, 1).toISOString().slice(0, 10);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() - 1);

  return {
    start,
    endInclusive: endDate.toISOString().slice(0, 10),
  };
};

export const filterTimesheetProjects = (projects = []) => (
  (projects || []).filter((project) => project && !project.is_demo)
);

export const parseTimeInputToMinutes = (value = '') => {
  const match = String(value || '').trim().match(TIME_INPUT_PATTERN);
  if (!match) return null;

  return (Number(match[1]) * 60) + Number(match[2]);
};

export const minutesToTimeInput = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes >= MINUTES_IN_DAY) {
    return '09:00';
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export const formatDurationMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;

  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

export const formatHoursFromMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = safeMinutes / 60;
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(2).replace(/\.?0+$/, '')}h`;
};

export const sumEntryDurationMinutes = (entries = []) => (
  (entries || []).reduce((total, entry) => total + Math.max(0, Number(entry?.duration_minutes) || 0), 0)
);

export const buildProjectDurationSummary = (entries = [], projects = []) => {
  const projectMap = new Map((projects || []).map((project) => [project.id, project]));
  const totals = new Map();

  for (const entry of entries || []) {
    const current = totals.get(entry.project_id) || 0;
    totals.set(entry.project_id, current + Math.max(0, Number(entry.duration_minutes) || 0));
  }

  return Array.from(totals.entries())
    .map(([projectId, totalMinutes]) => ({
      projectId,
      totalMinutes,
      project: projectMap.get(projectId) || null,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
};

export const getTrackProjectColor = (projectId = '') => {
  const source = String(projectId || 'track');
  const hash = Array.from(source).reduce((total, char) => total + char.charCodeAt(0), 0);
  return TRACK_COLOR_PALETTE[hash % TRACK_COLOR_PALETTE.length];
};

export const getVisibleHourRange = (entries = []) => {
  const defaultStart = 7 * 60;
  const defaultEnd = 19 * 60;

  if (!entries || entries.length === 0) {
    return { startMinutes: defaultStart, endMinutes: defaultEnd };
  }

  const minEntryStart = Math.min(...entries.map((entry) => Number(entry.start_minutes) || defaultStart));
  const maxEntryEnd = Math.max(...entries.map((entry) => (Number(entry.start_minutes) || 0) + (Number(entry.duration_minutes) || 0)));

  const startMinutes = Math.max(0, Math.min(defaultStart, Math.floor(minEntryStart / 60) * 60));
  const endMinutes = Math.min(MINUTES_IN_DAY, Math.max(defaultEnd, Math.ceil(maxEntryEnd / 60) * 60));

  return { startMinutes, endMinutes };
};

export const buildTimeEntryPayload = ({
  projectId,
  userId,
  entryDate,
  startTime,
  durationMinutes,
  description,
}) => {
  const startMinutes = parseTimeInputToMinutes(startTime);
  const duration = Number(durationMinutes);

  if (!projectId || !userId || !entryDate || startMinutes == null || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  return {
    project_id: projectId,
    user_id: userId,
    entry_date: entryDate,
    start_minutes: startMinutes,
    duration_minutes: Math.round(duration),
    description: String(description || '').trim(),
  };
};
