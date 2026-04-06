import { bucketByDeadline, getTodoBucketDefaultDueDate } from './helpers.js';

const MONTH_SECTION_PREFIX = 'month:';
const CORE_SECTION_KEYS = ['overdue', 'this_week', 'next_week', 'later'];

const parseIsoDate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const addMonths = (date, count) => new Date(date.getFullYear(), date.getMonth() + count, 1);

const toMonthToken = (date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

const toIsoDateStringLocal = (date) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
);

const compareTodos = (a, b) => {
  if (a.status !== b.status) {
    return a.status === 'Open' ? -1 : 1;
  }
  if (a.dueDate && b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate);
  }
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return String(a.title || '').localeCompare(String(b.title || ''));
};

export const isMonthSectionKey = (key = '') => String(key).startsWith(MONTH_SECTION_PREFIX);

export const formatTodoMonthLabel = (monthToken) => {
  const [year, month] = String(monthToken || '').split('-').map(Number);
  if (!year || !month) return String(monthToken || '');
  const date = new Date(year, month - 1, 1);
  const monthLabel = date.toLocaleDateString('en-GB', { month: 'short' });
  return `${monthLabel} '${String(year).slice(-2)}`;
};

export const getTodoSectionDefaultDueDate = (sectionKey, today) => {
  if (!isMonthSectionKey(sectionKey)) {
    return getTodoBucketDefaultDueDate(sectionKey, today);
  }

  const monthToken = sectionKey.slice(MONTH_SECTION_PREFIX.length);
  const [year, month] = String(monthToken).split('-').map(Number);
  if (!year || !month) return '';
  return toIsoDateStringLocal(endOfMonth(new Date(year, month - 1, 1)));
};

export const buildTodoCalendarSections = (items = [], options = {}) => {
  const {
    today,
    futureMonthCount = 12,
    showFutureMonths = true,
  } = options;

  const baseBuckets = bucketByDeadline(items, today);
  const bucketMap = new Map(baseBuckets.map((bucket) => [bucket.key, bucket.items || []]));
  const currentDate = parseIsoDate(today) || new Date();
  const futureWindowEnd = endOfMonth(addMonths(startOfMonth(currentDate), futureMonthCount - 1));

  const futureMonthMap = new Map();
  const laterItems = [];

  const addFutureMonthItem = (item) => {
    const dueDate = parseIsoDate(item?.dueDate);
    if (!dueDate) {
      laterItems.push(item);
      return;
    }

    if (dueDate > futureWindowEnd) {
      laterItems.push(item);
      return;
    }

    const monthToken = toMonthToken(dueDate);
    const existing = futureMonthMap.get(monthToken) || [];
    existing.push(item);
    futureMonthMap.set(monthToken, existing);
  };

  [...(bucketMap.get('in_2_weeks') || []), ...(bucketMap.get('weeks_3_4') || [])].forEach(addFutureMonthItem);

  (bucketMap.get('later') || []).forEach((item) => {
    if (item?.dueDate) {
      addFutureMonthItem(item);
      return;
    }
    laterItems.push(item);
  });

  const futureMonthSections = Array.from(futureMonthMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([monthToken, monthItems]) => ({
      key: `${MONTH_SECTION_PREFIX}${monthToken}`,
      label: formatTodoMonthLabel(monthToken),
      items: [...monthItems].sort(compareTodos),
    }));

  const sections = [
    ...(baseBuckets.filter((bucket) => CORE_SECTION_KEYS.includes(bucket.key) && bucket.key !== 'later')),
    ...(showFutureMonths ? futureMonthSections : []),
    {
      key: 'later',
      label: 'Later / no deadline',
      items: laterItems.sort(compareTodos),
    },
  ];

  return {
    sections,
    futureMonthSections,
    futureItemCount: futureMonthSections.reduce((count, section) => count + section.items.length, 0),
  };
};
