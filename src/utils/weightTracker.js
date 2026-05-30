const DAY_MS = 24 * 60 * 60 * 1000;
const KG_PER_LB = 0.45359237;

const pad2 = (value) => String(value).padStart(2, '0');

export const WEIGHT_UNITS = ['kg', 'lb'];

export const normalizeWeightUnit = (value = 'kg') => (
  WEIGHT_UNITS.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'kg'
);

export const formatWeightDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return formatWeightDateKey(new Date());
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const getWeightTodayKey = () => formatWeightDateKey(new Date());

export const addWeightDays = (dateKey, days) => {
  const [year, month, day] = String(dateKey || getWeightTodayKey()).split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + (Number(days) || 0));
  return formatWeightDateKey(date);
};

export const formatWeightDisplayDate = (dateKey = getWeightTodayKey()) => {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

export const roundWeight = (value, decimals = 1) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
};

export const parseWeightInput = (value) => {
  const normalized = String(value ?? '').replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const convertWeightToKg = (value, unit = 'kg') => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return normalizeWeightUnit(unit) === 'lb' ? number * KG_PER_LB : number;
};

export const convertWeightFromKg = (weightKg, unit = 'kg') => {
  const number = Number(weightKg);
  if (!Number.isFinite(number) || number <= 0) return null;
  return normalizeWeightUnit(unit) === 'lb' ? number / KG_PER_LB : number;
};

export const formatWeightValue = (weightKg, unit = 'kg', decimals = 1) => {
  const converted = convertWeightFromKg(weightKg, unit);
  if (!converted) return '-';
  return `${roundWeight(converted, decimals)} ${normalizeWeightUnit(unit)}`;
};

export const sortWeightEntriesAsc = (entries = []) => (
  [...entries].sort((left, right) => String(left.measuredOn).localeCompare(String(right.measuredOn)))
);

export const getWeightEntryValueKg = (entry = {}) => {
  const direct = Number(entry.weightKg ?? entry.weight_kg);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return convertWeightToKg(entry.weightValue ?? entry.weight_value, entry.weightUnit ?? entry.weight_unit);
};

export const buildWeightTrendBuckets = ({ entries = [], weeks = 12, endDate = getWeightTodayKey() } = {}) => {
  const safeWeeks = Math.max(1, Number(weeks) || 12);
  const end = new Date(`${endDate}T12:00:00`);
  const endTime = Number.isNaN(end.getTime()) ? Date.now() : end.getTime();
  const firstBucketStart = new Date(endTime - ((safeWeeks - 1) * 7 * DAY_MS));
  const bucketStarts = Array.from({ length: safeWeeks }, (_, index) => {
    const date = new Date(firstBucketStart.getTime() + (index * 7 * DAY_MS));
    return formatWeightDateKey(date);
  });
  const buckets = new Map(bucketStarts.map((start) => [start, {
    start,
    totalKg: 0,
    count: 0,
  }]));

  for (const entry of entries) {
    const entryDate = new Date(`${entry.measuredOn || entry.measured_on}T12:00:00`);
    if (Number.isNaN(entryDate.getTime())) continue;
    const bucketIndex = Math.floor((entryDate.getTime() - firstBucketStart.getTime()) / (7 * DAY_MS));
    if (bucketIndex < 0 || bucketIndex >= safeWeeks) continue;
    const bucket = buckets.get(bucketStarts[bucketIndex]);
    const weightKg = getWeightEntryValueKg(entry);
    if (!bucket || !weightKg) continue;
    bucket.totalKg += weightKg;
    bucket.count += 1;
  }

  return bucketStarts.map((start) => {
    const bucket = buckets.get(start);
    return {
      start,
      averageKg: bucket.count ? roundWeight(bucket.totalKg / bucket.count, 2) : null,
      count: bucket.count,
    };
  });
};

export const summarizeWeightEntries = ({ entries = [], goalWeightKg = null, unit = 'kg', today = getWeightTodayKey() } = {}) => {
  const sorted = sortWeightEntriesAsc(entries)
    .map((entry) => ({
      ...entry,
      weightKg: getWeightEntryValueKg(entry),
    }))
    .filter((entry) => entry.weightKg);

  const latest = sorted[sorted.length - 1] || null;
  const previous = sorted[sorted.length - 2] || null;
  const sinceDate = addWeightDays(today, -6);
  const weekEntries = sorted.filter((entry) => entry.measuredOn >= sinceDate && entry.measuredOn <= today);
  const weekAverageKg = weekEntries.length
    ? weekEntries.reduce((sum, entry) => sum + entry.weightKg, 0) / weekEntries.length
    : null;
  const first = sorted[0] || null;
  const normalizedGoalKg = Number(goalWeightKg) > 0 ? Number(goalWeightKg) : null;
  const latestKg = latest?.weightKg || null;
  const goalRemainingKg = latestKg && normalizedGoalKg ? latestKg - normalizedGoalKg : null;
  const goalProgress = first?.weightKg && latestKg && normalizedGoalKg && first.weightKg !== normalizedGoalKg
    ? Math.max(0, Math.min(100, Math.round(((first.weightKg - latestKg) / (first.weightKg - normalizedGoalKg)) * 100)))
    : null;

  return {
    count: sorted.length,
    latest,
    previous,
    unit: normalizeWeightUnit(unit),
    weekAverageKg: weekAverageKg ? roundWeight(weekAverageKg, 2) : null,
    changeSincePreviousKg: latestKg && previous?.weightKg ? latestKg - previous.weightKg : null,
    changeSinceFirstKg: latestKg && first?.weightKg ? latestKg - first.weightKg : null,
    goalRemainingKg,
    goalProgress,
    trendBuckets: buildWeightTrendBuckets({ entries: sorted, weeks: 12, endDate: today }),
  };
};
