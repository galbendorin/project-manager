const MINUTES_PER_BLOCK = 15;
const BLOCKS_PER_DAY = 96;
const DAY_START_BLOCK = 28; // 07:00
const NIGHT_START_BLOCK = 76; // 19:00

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
