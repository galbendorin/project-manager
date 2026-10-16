import { matrixReference, taskViewIdentity, validCalendarDay } from './todoEisenhower.js';
import { compareTodoProjects } from './todoManualOrdering.js';

export const CALENDAR_START = 360;
export const CALENDAR_END = 1380;
export const calendarTime = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const calendarDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const shiftCalendarDay = (day, offset) => { const date = new Date(`${day}T12:00:00`); date.setDate(date.getDate() + offset); return calendarDate(date); };
export const calendarWeek = day => {
  const date = new Date(`${day}T12:00:00`);
  const monday = shiftCalendarDay(day, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftCalendarDay(monday, index));
};
export const calendarDayLabel = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const preferenceSnapshot = preference => ({ id: preference?.id || null, version: preference?.version || null, day: preference?.planned_day || null, start: preference?.planned_start_minute ?? null, duration: preference?.planned_duration_minutes ?? null });
export const matchesPreferenceSnapshot = (preference, expected) => Object.entries(preferenceSnapshot(preference)).every(([key, value]) => value === (expected?.[key] ?? null));
export const validCalendarSlot = (day, start, duration) => validCalendarDay(day) && Number.isInteger(start) && Number.isInteger(duration) && start >= CALENDAR_START && start % 30 === 0 && duration >= 30 && duration % 30 === 0 && start + duration <= CALENDAR_END;
export const validPreferenceTiming = preference => {
  const start = preference?.planned_start_minute ?? null, duration = preference?.planned_duration_minutes ?? null;
  return start === null && duration === null || validCalendarSlot(preference?.planned_day, start, duration);
};
export const calendarEntries = (todos, preferences = {}) => [...new Map(todos.filter(todo => todo.status !== 'Done').map(todo => {
  const reference = matrixReference(todo), preference = reference && preferences[reference.task_key];
  const day = validCalendarDay(preference?.planned_day) ? preference.planned_day : validCalendarDay(todo.dueDate) ? todo.dueDate : null;
  const timed = validCalendarSlot(preference?.planned_day, preference?.planned_start_minute, preference?.planned_duration_minutes);
  return [taskViewIdentity(todo), { todo, reference, day, start: timed ? preference.planned_start_minute : null, duration: timed ? preference.planned_duration_minutes : null }];
})).values()].filter(entry => entry.day).sort((a, b) => compareTodoProjects(a.todo, b.todo) || String(a.todo.title || '').localeCompare(String(b.todo.title || '')) || taskViewIdentity(a.todo).localeCompare(taskViewIdentity(b.todo)));
export const calendarOverlaps = (a, b) => a.day === b.day && a.start !== null && b.start !== null && a.start < b.start + b.duration && b.start < a.start + a.duration && taskViewIdentity(a.todo) !== taskViewIdentity(b.todo);
export const layoutCalendarDay = entries => {
  const sorted = entries.filter(entry => entry.start !== null).sort((a, b) => a.start - b.start || b.duration - a.duration);
  const result = []; let cluster = [], end = 0;
  const flush = () => {
    const lanes = []; const placed = cluster.map(entry => { let lane = lanes.findIndex(until => until <= entry.start); if (lane < 0) lane = lanes.length; lanes[lane] = entry.start + entry.duration; return { ...entry, lane }; });
    result.push(...placed.map(entry => ({ ...entry, lanes: lanes.length })));
    cluster = [];
  };
  for (const entry of sorted) { if (cluster.length && entry.start >= end) flush(); if (!cluster.length) end = 0; cluster.push(entry); end = Math.max(end, entry.start + entry.duration); }
  if (cluster.length) flush(); return result;
};
export const calendarTimePassed = (entry, now) => entry.start !== null && (entry.day < calendarDate(now) || entry.day === calendarDate(now) && entry.start + entry.duration <= now.getHours() * 60 + now.getMinutes());
