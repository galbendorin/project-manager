export const validSleepDate = value => {
  const date = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export const shiftSleepDate = (dateKey, days) => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export const sleepTimeToMinute = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
export const sleepMinuteToTime = minute => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const validateSleepEntry = entry => {
  const { sleepDate, startMinute, endMinute, notes = '' } = entry;
  if (!validSleepDate(sleepDate)) throw new Error('Choose a valid sleep date.');
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute >= 1440
    || !Number.isInteger(endMinute) || endMinute <= startMinute || endMinute > startMinute + 1440) {
    throw new Error('Choose an end after the start, up to 24 hours later. Use Ends next day for overnight sleep.');
  }
  if (typeof notes !== 'string' || notes.length > 2000) throw new Error('Keep the note within 2,000 characters.');
  return { sleepDate, startMinute, endMinute, notes };
};
export const sleepEntryIntervalForDay = (entry, dateKey) => {
  if (entry.archivedAt || !validSleepDate(dateKey)) return null;
  const offset = entry.sleepDate === dateKey ? 0 : entry.sleepDate === shiftSleepDate(dateKey, -1) ? 1440 : null;
  if (offset === null) return null;
  const start = Math.max(0, entry.startMinute - offset), end = Math.min(1440, entry.endMinute - offset);
  return end > start ? { start, end } : null;
};
// Minute precision is retained. Grid marks and exact entries overlap only once.
export const buildSleepMinuteSet = (blocks = [], entries = [], dateKey = '') => {
  const minutes = new Set();
  for (const block of blocks) {
    const index = Number(typeof block === 'number' ? block : block.blockIndex ?? block.block_index);
    const asleep = typeof block === 'number' || (block.status || 'asleep') === 'asleep';
    if (asleep && Number.isInteger(index) && index >= 0 && index < 96) {
      for (let minute = index * 15; minute < (index + 1) * 15; minute += 1) minutes.add(minute);
    }
  }
  for (const entry of entries) {
    const interval = sleepEntryIntervalForDay(entry, dateKey);
    if (interval) for (let minute = interval.start; minute < interval.end; minute += 1) minutes.add(minute);
  }
  return minutes;
};
