const MINUTES_PER_BLOCK = 15;
const BLOCKS_PER_DAY = 96;
const DAY_START_BLOCK = 28; // 07:00
const NIGHT_START_BLOCK = 76; // 19:00
const DEFAULT_BABY_SLEEP_GUIDANCE_BIRTH_DATE = '2026-04-22';
const SLEEP_GUIDANCE_HOURS = [
  20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7,
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
];
const SLEEP_GUIDANCE_LABELS = {
  expected: 'Expected sleep',
  flexible: 'Flexible sleep window',
  awake: 'Expected awake',
};
const BABY_SLEEP_GUIDANCE_BY_MONTH = {
  1: {
    totalSleep: 'Awaiting source',
    nightSleep: '',
    daySleep: '',
    naps: '',
    sourceNote: 'Send Month 1 page',
    regression: 'Can occur at any age',
    hourly: {},
  },
  2: {
    totalSleep: '14-18 h',
    nightSleep: '8-9 h',
    daySleep: '7-9 h',
    naps: '3-5',
    sourceNote: 'Book: second month',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected',
      5: 'flexible', 7: 'expected', 8: 'flexible', 10: 'expected', 11: 'flexible',
      13: 'expected', 14: 'flexible', 16: 'expected', 17: 'flexible',
    },
  },
  3: {
    totalSleep: '14-16 h',
    nightSleep: '8-10 h',
    daySleep: '4-8 h',
    naps: '3-4',
    sourceNote: 'Book: third month',
    regression: 'Common window: 3-4 months',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      8: 'expected', 9: 'expected', 12: 'expected', 13: 'expected', 16: 'expected', 17: 'flexible',
    },
  },
  4: {
    totalSleep: '14-16 h',
    nightSleep: '9-10 h',
    daySleep: '3-6 h',
    naps: '2-3',
    sourceNote: 'Naps about 1.5-2 h',
    regression: 'Common window: 3-4 months',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      8: 'expected', 9: 'expected', 12: 'expected', 13: 'expected', 16: 'flexible', 17: 'flexible',
    },
  },
  5: {
    totalSleep: '~15 h',
    nightSleep: '10-11 h',
    daySleep: '3-4 h',
    naps: '2-3',
    sourceNote: 'May wake 1-2 times at night',
    regression: 'Patterns may still be settling',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'flexible', 9: 'expected', 10: 'expected', 13: 'expected', 14: 'expected', 17: 'flexible',
    },
  },
  6: {
    totalSleep: '~15 h',
    nightSleep: '10-11 h',
    daySleep: '3-4 h',
    naps: '2-3',
    sourceNote: 'Similar totals to Month 5',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'flexible', 9: 'expected', 10: 'expected', 14: 'expected', 15: 'expected', 17: 'flexible',
    },
  },
  7: {
    totalSleep: '~14 h',
    nightSleep: '9-11 h',
    daySleep: '3-4 h',
    naps: '2',
    sourceNote: 'Morning and afternoon naps',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'flexible', 9: 'flexible', 10: 'expected', 11: 'expected', 12: 'flexible',
      14: 'flexible', 15: 'expected', 16: 'expected', 17: 'flexible',
    },
  },
  8: {
    totalSleep: '~14 h',
    nightSleep: '9-11 h',
    daySleep: '3-4 h',
    naps: '2',
    sourceNote: 'Similar to Month 7',
    regression: 'Common window: 8-10 months',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'flexible', 9: 'flexible', 10: 'expected', 11: 'expected', 12: 'flexible',
      14: 'flexible', 15: 'expected', 16: 'expected', 17: 'flexible',
    },
  },
  9: {
    totalSleep: '14-15 h',
    nightSleep: '10-12 h',
    daySleep: '3-4 h',
    naps: '2',
    sourceNote: 'Each nap about 1.5-2 h',
    regression: 'Common window: 8-10 months',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'expected', 7: 'flexible', 9: 'expected', 10: 'expected', 11: 'flexible',
      14: 'expected', 15: 'expected', 16: 'flexible',
    },
  },
  10: {
    totalSleep: '~14 h',
    nightSleep: '10-12 h',
    daySleep: '~3-4 h',
    naps: '2',
    sourceNote: 'Book notes many sleep through',
    regression: 'Common window: 8-10 months',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'flexible', 7: 'flexible', 9: 'expected', 10: 'expected', 11: 'flexible',
      14: 'expected', 15: 'expected', 16: 'flexible',
    },
  },
  11: {
    totalSleep: '~14 h',
    nightSleep: '10-12 h',
    daySleep: '~3-4 h',
    naps: '2',
    sourceNote: 'Morning nap may be resisted',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'flexible', 7: 'flexible', 9: 'expected', 10: 'expected', 11: 'flexible',
      14: 'expected', 15: 'expected', 16: 'flexible',
    },
  },
  12: {
    totalSleep: '12-14 h',
    nightSleep: '10-12 h',
    daySleep: '1-4 h',
    naps: '1-2',
    sourceNote: 'Two shorter naps or one longer nap',
    regression: 'Common window: around 12 months',
    hourly: {
      20: 'expected', 21: 'expected', 22: 'expected', 23: 'expected',
      0: 'expected', 1: 'expected', 2: 'expected', 3: 'expected', 4: 'expected', 5: 'expected',
      6: 'expected', 7: 'flexible', 9: 'flexible', 12: 'expected', 13: 'expected',
      14: 'flexible', 16: 'flexible',
    },
  },
};

const pad2 = (value) => String(value).padStart(2, '0');

export const formatBabyDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const getBabyTodayKey = () => formatBabyDateKey(new Date());

export const addBabyDays = (dateKey, days) => {
  const [year, month, day] = String(dateKey || getBabyTodayKey()).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  return formatBabyDateKey(date);
};

const parseBabyDateParts = (dateKey = getBabyTodayKey()) => {
  const [year, month, day] = String(dateKey || getBabyTodayKey()).split('-').map(Number);
  return {
    year: year || new Date().getFullYear(),
    month: month || 1,
    day: day || 1,
  };
};

const addBabyMonths = (dateKey, monthsToAdd = 0) => {
  const { year, month, day } = parseBabyDateParts(dateKey);
  const date = new Date(year, month - 1 + monthsToAdd, day);
  return formatBabyDateKey(date);
};

export const formatBabyTime = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const combineBabyDateAndTime = (dateKey, timeValue) => {
  const [year, month, day] = String(dateKey || getBabyTodayKey()).split('-').map(Number);
  const [hours, minutes] = String(timeValue || formatBabyTime()).split(':').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  return date.toISOString();
};

export const formatBabyDisplayDate = (dateKey = getBabyTodayKey()) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  if (!year || !month || !day) return 'Today';
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

export const getSleepBlockTimeLabel = (blockIndex = 0) => {
  const totalMinutes = Math.max(0, Math.min(BLOCKS_PER_DAY - 1, Number(blockIndex) || 0)) * MINUTES_PER_BLOCK;
  return `${pad2(Math.floor(totalMinutes / 60))}:${pad2(totalMinutes % 60)}`;
};

export const getBabySleepGuidanceBirthDate = (birthDate = '') => (
  birthDate || DEFAULT_BABY_SLEEP_GUIDANCE_BIRTH_DATE
);

export const getBabyAgeMonth = ({ birthDate = '', dateKey = getBabyTodayKey() } = {}) => {
  const normalizedBirthDate = getBabySleepGuidanceBirthDate(birthDate);
  const birth = parseBabyDateParts(normalizedBirthDate);
  const target = parseBabyDateParts(dateKey);
  let fullMonths = ((target.year - birth.year) * 12) + (target.month - birth.month);
  if (target.day < birth.day) fullMonths -= 1;
  return Math.min(12, Math.max(1, fullMonths + 1));
};

export const getBabySleepGuidanceForMonth = (monthNumber = 1) => {
  const month = Math.min(12, Math.max(1, Number(monthNumber) || 1));
  const guidance = BABY_SLEEP_GUIDANCE_BY_MONTH[month] || BABY_SLEEP_GUIDANCE_BY_MONTH[1];
  return {
    month,
    monthLabel: `Month ${month}`,
    hourOrder: SLEEP_GUIDANCE_HOURS,
    ...guidance,
  };
};

export const getBabySleepGuidanceForDate = ({ birthDate = '', dateKey = getBabyTodayKey() } = {}) => {
  const normalizedBirthDate = getBabySleepGuidanceBirthDate(birthDate);
  const month = getBabyAgeMonth({ birthDate: normalizedBirthDate, dateKey });
  const startDate = addBabyMonths(normalizedBirthDate, month - 1);
  return {
    ...getBabySleepGuidanceForMonth(month),
    birthDate: normalizedBirthDate,
    dateKey,
    startDate,
    endDate: addBabyDays(addBabyMonths(normalizedBirthDate, month), -1),
    nextMonthStartDate: month < 12 ? addBabyMonths(normalizedBirthDate, month) : '',
  };
};

export const getNextBabySleepGuidanceForDate = ({ birthDate = '', dateKey = getBabyTodayKey() } = {}) => {
  const normalizedBirthDate = getBabySleepGuidanceBirthDate(birthDate);
  const currentMonth = getBabyAgeMonth({ birthDate: normalizedBirthDate, dateKey });
  const nextMonth = Math.min(12, currentMonth + 1);
  return {
    ...getBabySleepGuidanceForMonth(nextMonth),
    birthDate: normalizedBirthDate,
    startDate: addBabyMonths(normalizedBirthDate, nextMonth - 1),
    endDate: addBabyDays(addBabyMonths(normalizedBirthDate, nextMonth), -1),
  };
};

export const getSleepGuidanceBlockStatus = (blockIndex = 0, guidance = null) => {
  if (!guidance?.hourly) return 'awake';
  const hour = Math.floor((Number(blockIndex) || 0) / 4);
  return guidance.hourly[hour] || 'awake';
};

export const getSleepGuidanceStatusLabel = (status = 'awake') => (
  SLEEP_GUIDANCE_LABELS[status] || SLEEP_GUIDANCE_LABELS.awake
);

export const summarizeSleepGuidanceComparison = ({ sleepBlocks = [], guidance = null } = {}) => {
  const asleep = normalizeSleepBlocks(sleepBlocks);
  const expectedBlocks = new Set();
  const flexibleBlocks = new Set();

  for (let index = 0; index < BLOCKS_PER_DAY; index += 1) {
    const status = getSleepGuidanceBlockStatus(index, guidance);
    if (status === 'expected') expectedBlocks.add(index);
    if (status === 'flexible') flexibleBlocks.add(index);
  }

  let actualInExpected = 0;
  let actualInFlexible = 0;
  let actualOutsideGuide = 0;
  let missedExpected = 0;

  asleep.forEach((index) => {
    if (expectedBlocks.has(index)) actualInExpected += 1;
    else if (flexibleBlocks.has(index)) actualInFlexible += 1;
    else actualOutsideGuide += 1;
  });

  expectedBlocks.forEach((index) => {
    if (!asleep.has(index)) missedExpected += 1;
  });

  return {
    actualMinutes: asleep.size * MINUTES_PER_BLOCK,
    expectedMinutes: expectedBlocks.size * MINUTES_PER_BLOCK,
    flexibleMinutes: flexibleBlocks.size * MINUTES_PER_BLOCK,
    actualInExpectedMinutes: actualInExpected * MINUTES_PER_BLOCK,
    actualInFlexibleMinutes: actualInFlexible * MINUTES_PER_BLOCK,
    actualOutsideGuideMinutes: actualOutsideGuide * MINUTES_PER_BLOCK,
    missedExpectedMinutes: missedExpected * MINUTES_PER_BLOCK,
  };
};

export const normalizeSleepBlocks = (blocks = []) => {
  const asleep = new Set();
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const index = Number(block?.blockIndex ?? block?.block_index);
    const status = String(block?.status || '').toLowerCase();
    if (Number.isInteger(index) && index >= 0 && index < BLOCKS_PER_DAY && status === 'asleep') {
      asleep.add(index);
    }
  }
  return asleep;
};

export const buildSleepBlockRecords = ({ babyId, userId, householdProjectId = null, dateKey, asleepBlocks = [] } = {}) => (
  Array.from(asleepBlocks)
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0 && index < BLOCKS_PER_DAY)
    .sort((left, right) => left - right)
    .map((blockIndex) => ({
      baby_id: babyId,
      user_id: userId,
      household_project_id: householdProjectId || null,
      sleep_date: dateKey,
      block_index: blockIndex,
      status: 'asleep',
    }))
);

export const summarizeSleepBlocks = (blocks = []) => {
  const asleep = normalizeSleepBlocks(blocks);
  const sorted = Array.from(asleep).sort((left, right) => left - right);
  const sessions = [];
  let current = null;

  for (const blockIndex of sorted) {
    if (!current || blockIndex !== current.endBlock + 1) {
      current = {
        startBlock: blockIndex,
        endBlock: blockIndex,
      };
      sessions.push(current);
    } else {
      current.endBlock = blockIndex;
    }
  }

  let daytimeBlocks = 0;
  let nightBlocks = 0;
  for (const blockIndex of asleep) {
    if (blockIndex >= DAY_START_BLOCK && blockIndex < NIGHT_START_BLOCK) {
      daytimeBlocks += 1;
    } else {
      nightBlocks += 1;
    }
  }

  return {
    asleepBlocks: sorted,
    totalBlocks: asleep.size,
    totalMinutes: asleep.size * MINUTES_PER_BLOCK,
    totalHours: Math.round((asleep.size * MINUTES_PER_BLOCK / 60) * 10) / 10,
    daytimeMinutes: daytimeBlocks * MINUTES_PER_BLOCK,
    nightMinutes: nightBlocks * MINUTES_PER_BLOCK,
    daytimeHours: Math.round((daytimeBlocks * MINUTES_PER_BLOCK / 60) * 10) / 10,
    nightHours: Math.round((nightBlocks * MINUTES_PER_BLOCK / 60) * 10) / 10,
    sessionCount: sessions.length,
    sessions: sessions.map((session) => ({
      ...session,
      startTime: getSleepBlockTimeLabel(session.startBlock),
      endTime: session.endBlock >= BLOCKS_PER_DAY - 1 ? '24:00' : getSleepBlockTimeLabel(session.endBlock + 1),
      durationMinutes: (session.endBlock - session.startBlock + 1) * MINUTES_PER_BLOCK,
    })),
  };
};

export const summarizeBabyDay = ({
  feeds = [],
  nappies = [],
  sleepBlocks = [],
  latestWeight = null,
} = {}) => {
  const feedCount = feeds.length;
  const totalFeedMinutes = feeds.reduce((sum, feed) => sum + (Number(feed.durationMinutes ?? feed.duration_minutes) || 0), 0);
  const wetNappies = nappies.filter((nappy) => ['wet', 'mixed'].includes(String(nappy.nappyType ?? nappy.nappy_type ?? '').toLowerCase())).length;
  const pooNappies = nappies.filter((nappy) => ['poo', 'mixed'].includes(String(nappy.nappyType ?? nappy.nappy_type ?? '').toLowerCase())).length;
  const sleep = summarizeSleepBlocks(sleepBlocks);

  return {
    feedCount,
    totalFeedMinutes,
    averageFeedMinutes: feedCount > 0 ? Math.round(totalFeedMinutes / feedCount) : 0,
    wetNappies,
    pooNappies,
    totalNappies: nappies.length,
    sleep,
    latestWeight,
  };
};

const getEventMinuteOfDay = (entry = {}) => {
  const raw = entry.occurredAt || entry.occurred_at || entry.measuredAt || entry.measured_at || entry.createdAt || entry.created_at;
  const date = raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return (date.getHours() * 60) + date.getMinutes();
};

export const buildBabyActivityLog = ({ feeds = [], nappies = [], sleepBlocks = [] } = {}) => {
  const feedEvents = feeds.map((feed) => {
    const feedType = String(feed.feedType ?? feed.feed_type ?? '').toLowerCase();
    const breastSide = String(feed.breastSide ?? feed.breast_side ?? '').toLowerCase();
    const sideLabel = breastSide === 'left' ? 'left' : breastSide === 'right' ? 'right' : breastSide === 'both' ? 'both sides' : '';
    return {
      id: `feed:${feed.id}`,
      sourceId: feed.id,
      type: 'feed',
      occurredAt: feed.occurredAt || feed.occurred_at,
      label: feedType === 'breastfeeding' ? 'Breastfeed' : 'Feed',
      detail: `${Number(feed.durationMinutes ?? feed.duration_minutes) || 0} min${sideLabel ? ` · ${sideLabel}` : ''}`,
      raw: feed,
    };
  });

  const nappyEvents = nappies.map((nappy) => {
    const type = String(nappy.nappyType ?? nappy.nappy_type ?? '').toLowerCase();
    return {
      id: `nappy:${nappy.id}`,
      sourceId: nappy.id,
      type: 'nappy',
      occurredAt: nappy.occurredAt || nappy.occurred_at,
      label: type === 'poo' ? 'Poo nappy' : type === 'mixed' ? 'Mixed nappy' : 'Wet nappy',
      detail: '',
      raw: nappy,
    };
  });

  const sleepEvents = summarizeSleepBlocks(sleepBlocks).sessions.map((session) => ({
    id: `sleep:${session.startBlock}`,
    sourceId: String(session.startBlock),
    type: 'sleep',
    occurredAt: '',
    sortTime: session.startBlock * MINUTES_PER_BLOCK,
    label: 'Sleep',
    detail: `${session.durationMinutes} min`,
    raw: session,
  }));

  return [...feedEvents, ...nappyEvents, ...sleepEvents].sort((left, right) => {
    const leftTime = left.type === 'sleep' ? left.sortTime : getEventMinuteOfDay(left);
    const rightTime = right.type === 'sleep' ? right.sortTime : getEventMinuteOfDay(right);
    return leftTime - rightTime;
  });
};

export { BLOCKS_PER_DAY, MINUTES_PER_BLOCK };
