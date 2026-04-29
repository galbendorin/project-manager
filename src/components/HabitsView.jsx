import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHabitsData } from '../hooks/useHabitsData';
import {
  isPushNotificationsSupported,
  requestAppNotificationPermission,
  sendHabitReminderTestAlert,
  showAppNotification,
} from '../utils/pushNotifications';
import {
  buildHabitTrendBuckets,
  cycleHabitStatus,
  formatHabitDateKey,
  formatHabitDisplayDate,
  getDueHabitReminders,
  getHabitEntryMap,
  getHabitStreak,
  getHabitWeekDays,
  getHabitWeekStart,
  isHabitSuccess,
  normalizeHabitReminderTime,
  normalizeHabitReminderWeekdays,
  summarizeHabitRange,
} from '../utils/habitTracker';

const HABIT_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

const NAV_ITEMS = [
  { id: 'journal', label: 'Journal' },
  { id: 'trend', label: 'Trend' },
  { id: 'notes', label: 'Notes' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'setup', label: 'Setup' },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const getStatusLabel = (status = '') => {
  if (status === 'yes') return 'Y';
  if (status === 'no') return 'N';
  if (status === 'skip') return '-';
  return '';
};

const getCellStyle = ({ habit, status }) => {
  if (!status) return 'border-slate-200 bg-slate-50 text-slate-300 hover:border-slate-300';
  if (status === 'skip') return 'border-slate-300 bg-slate-100 text-slate-500';
  return isHabitSuccess(habit, status)
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';
};

const formatReminderFrequency = (reminder = {}) => {
  if (reminder.frequency === 'weekdays') return 'Weekdays';
  if (reminder.frequency === 'custom') {
    const labels = WEEKDAY_OPTIONS
      .filter((day) => normalizeHabitReminderWeekdays(reminder.weekdays).includes(day.value))
      .map((day) => day.label);
    return labels.length ? labels.join(', ') : 'Custom days';
  }
  return 'Every day';
};

const getNowTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const AddHabitForm = ({ onAdd, saving }) => {
  const [name, setName] = useState('');
  const [direction, setDirection] = useState('positive');
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await onAdd({ name, direction, color });
      setName('');
      setDirection('positive');
      setColor(HABIT_COLORS[0]);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add habit.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="pm-kicker">New habit</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_170px]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Exercising, No alcohol, Be grateful..."
          className="pm-input rounded-2xl px-4 py-3 text-base font-semibold text-slate-950 placeholder:text-slate-400"
        />
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          className="pm-input rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900"
        >
          <option value="positive">Positive habit</option>
          <option value="negative">Avoid / reduce</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {HABIT_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setColor(option)}
            className={`h-9 w-9 rounded-full border-2 ${color === option ? 'border-slate-950' : 'border-white'}`}
            style={{ backgroundColor: option }}
            aria-label={`Choose ${option}`}
          />
        ))}
        <button
          type="submit"
          disabled={saving}
          className="pm-toolbar-primary ml-auto rounded-2xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Adding...' : 'Add habit'}
        </button>
      </div>
      {error ? <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
    </form>
  );
};

const JournalView = ({
  entries,
  habits,
  onSetEntryStatus,
  onUpdateEntryNote,
  saving,
  selectedDate,
  selectedCell,
  setSelectedCell,
}) => {
  const weekStart = getHabitWeekStart(selectedDate);
  const weekDays = useMemo(() => getHabitWeekDays(weekStart), [weekStart]);
  const entryMap = useMemo(() => getHabitEntryMap(entries), [entries]);
  const activeEntry = selectedCell
    ? entryMap.get(`${selectedCell.habitId}:${selectedCell.dateKey}`)
    : null;
  const activeHabit = selectedCell
    ? habits.find((habit) => habit.id === selectedCell.habitId)
    : null;
  const [noteDraft, setNoteDraft] = useState(activeEntry?.note || '');

  useEffect(() => {
    setNoteDraft(activeEntry?.note || '');
  }, [activeEntry?.id, activeEntry?.note, selectedCell?.dateKey, selectedCell?.habitId]);

  if (habits.length === 0) {
    return (
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-600">
          Create your first habit in Setup, then come back here to mark the week.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(150px,1.35fr)_repeat(7,minmax(58px,1fr))] border-b border-slate-200 bg-slate-50 text-center text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            <div className="px-4 py-3 text-left">Habit</div>
            {weekDays.map((day) => (
              <div key={day.dateKey} className="px-1 py-3">
                <div>{day.dayLabel}</div>
                <div className="mt-1 text-lg tracking-normal text-slate-900">{day.shortLabel}</div>
              </div>
            ))}
          </div>

          {habits.map((habit) => (
            <div key={habit.id} className="grid grid-cols-[minmax(150px,1.35fr)_repeat(7,minmax(58px,1fr))] items-stretch border-b border-slate-100 last:border-b-0">
              <div className="min-w-0 px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
                  <div className="truncate text-base font-bold text-slate-950">{habit.name}</div>
                </div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {habit.direction === 'negative' ? 'Avoid / reduce' : 'Build'}
                </div>
              </div>
              {weekDays.map((day) => {
                const entry = entryMap.get(`${habit.id}:${day.dateKey}`);
                const isSelected = selectedCell?.habitId === habit.id && selectedCell?.dateKey === day.dateKey;
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setSelectedCell({ habitId: habit.id, dateKey: day.dateKey });
                      onSetEntryStatus({ habit, dateKey: day.dateKey, status: cycleHabitStatus(entry?.status || '') });
                    }}
                    className={`m-1 min-h-[54px] rounded-2xl border text-xl font-black transition ${getCellStyle({ habit, status: entry?.status })} ${isSelected ? 'ring-2 ring-[var(--pm-accent)]' : ''}`}
                    title={`${habit.name} - ${day.fullLabel}`}
                  >
                    {getStatusLabel(entry?.status)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
        {activeHabit ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="pm-kicker">Selected</p>
                <h3 className="mt-1 text-lg font-bold text-slate-950">
                  {activeHabit.name} - {formatHabitDisplayDate(selectedCell.dateKey)}
                </h3>
              </div>
              <div className="flex gap-2">
                {['yes', 'no', 'skip'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onSetEntryStatus({ habit: activeHabit, dateKey: selectedCell.dateKey, status })}
                    className={`rounded-2xl px-3 py-2 text-sm font-bold ${activeEntry?.status === status ? 'pm-toolbar-primary text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                  >
                    {status === 'yes' ? 'Yes' : status === 'no' ? 'No' : 'Skip'}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add a quick note for this day..."
              className="pm-input mt-3 min-h-[90px] w-full rounded-2xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => onUpdateEntryNote({ habit: activeHabit, dateKey: selectedCell.dateKey, note: noteDraft })}
              className="pm-subtle-button mt-3 rounded-2xl px-4 py-2 text-sm font-bold"
            >
              Save note
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Tap a cell to mark it. The cycle is Yes, No, Skip, then blank. Select a cell to add a note.
          </p>
        )}
      </div>
    </div>
  );
};

const TrendView = ({ entries, habits, selectedDate }) => {
  const [selectedHabitId, setSelectedHabitId] = useState('');
  const selectedHabit = habits.find((habit) => habit.id === (selectedHabitId || habits[0]?.id)) || habits[0] || null;
  const buckets = useMemo(() => (
    selectedHabit ? buildHabitTrendBuckets({ habit: selectedHabit, entries, weeks: 12, endDate: selectedDate }) : []
  ), [entries, selectedDate, selectedHabit]);
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.yes + bucket.no + bucket.skip));

  if (!selectedHabit) {
    return <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">Create a habit first.</div>;
  }

  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pm-kicker">Trend</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedHabit.name}</h2>
        </div>
        <select
          value={selectedHabit.id}
          onChange={(event) => setSelectedHabitId(event.target.value)}
          className="pm-input rounded-2xl px-4 py-2 text-sm font-bold text-slate-900"
        >
          {habits.map((habit) => <option key={habit.id} value={habit.id}>{habit.name}</option>)}
        </select>
      </div>

      <div className="mt-8 flex h-[260px] items-end gap-2 border-b border-slate-200 px-2">
        {buckets.map((bucket) => {
          const successHeight = Math.max(4, (bucket.success / maxBucket) * 220);
          const missHeight = Math.max(4, ((bucket.yes + bucket.no - bucket.success) / maxBucket) * 220);
          return (
            <div key={bucket.weekStart} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-[230px] items-end gap-1">
                <div className="w-3 rounded-t bg-emerald-400" style={{ height: `${successHeight}px` }} />
                <div className="w-3 rounded-t bg-rose-400" style={{ height: `${missHeight}px` }} />
              </div>
              <span className="text-[10px] font-bold text-slate-400">{bucket.weekStart.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Green = aligned</span>
        <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Red = not aligned</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Each bar = one week</span>
      </div>
    </div>
  );
};

const NotesView = ({ entries, habits }) => {
  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const noteEntries = entries
    .filter((entry) => String(entry.note || '').trim())
    .sort((left, right) => String(right.entryDate).localeCompare(String(left.entryDate)))
    .slice(0, 60);

  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="pm-kicker">Notes</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-950">Journal notes</h2>
      <div className="mt-4 space-y-3">
        {noteEntries.length ? noteEntries.map((entry) => {
          const habit = habitById.get(entry.habitId);
          return (
            <div key={entry.id} className="rounded-3xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-950">{habit?.name || 'Habit'}</div>
                <div className="text-xs font-bold text-slate-400">{formatHabitDisplayDate(entry.entryDate)}</div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{entry.note}</p>
            </div>
          );
        }) : (
          <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-500">
            Notes you add from the Journal will collect here.
          </div>
        )}
      </div>
    </div>
  );
};

const ReminderForm = ({ habits, onAddReminder, saving }) => {
  const [title, setTitle] = useState('It is time to update your journal.');
  const [habitId, setHabitId] = useState('');
  const [reminderTime, setReminderTime] = useState('21:55');
  const [frequency, setFrequency] = useState('daily');
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState('');

  const toggleWeekday = (day) => {
    setWeekdays((previous) => {
      const next = previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day];
      return normalizeHabitReminderWeekdays(next);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await onAddReminder({
        title,
        habitId,
        reminderTime,
        frequency,
        weekdays: frequency === 'weekdays' ? [1, 2, 3, 4, 5] : weekdays,
      });
      setTitle('It is time to update your journal.');
      setHabitId('');
      setReminderTime('21:55');
      setFrequency('daily');
      setWeekdays([0, 1, 2, 3, 4, 5, 6]);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to add reminder.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="pm-kicker">New reminder</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="pm-input rounded-2xl px-4 py-3 text-sm font-semibold text-slate-950"
          placeholder="It is time to update your journal."
        />
        <input
          type="time"
          value={reminderTime}
          onChange={(event) => setReminderTime(normalizeHabitReminderTime(event.target.value))}
          className="pm-input rounded-2xl px-4 py-3 text-sm font-semibold text-slate-950"
        />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <select
          value={habitId}
          onChange={(event) => setHabitId(event.target.value)}
          className="pm-input rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900"
        >
          <option value="">General journal reminder</option>
          {habits.map((habit) => <option key={habit.id} value={habit.id}>{habit.name}</option>)}
        </select>
        <select
          value={frequency}
          onChange={(event) => setFrequency(event.target.value)}
          className="pm-input rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900"
        >
          <option value="daily">Every day</option>
          <option value="weekdays">Weekdays</option>
          <option value="custom">Custom days</option>
        </select>
      </div>

      {frequency === 'custom' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {WEEKDAY_OPTIONS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleWeekday(day.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${weekdays.includes(day.value) ? 'pm-toolbar-primary text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
            >
              {day.label}
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="pm-toolbar-primary mt-4 rounded-2xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Add reminder'}
      </button>
      {error ? <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
    </form>
  );
};

const RemindersView = ({
  habits,
  reminders,
  reminderError,
  onAddReminder,
  onDeleteReminder,
  onUpdateReminder,
  saving,
}) => {
  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const [deviceMessage, setDeviceMessage] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const pushSupported = isPushNotificationsSupported();
  const notificationPermission = typeof window !== 'undefined' && 'Notification' in window
    ? window.Notification.permission
    : 'unsupported';

  const handleEnable = async () => {
    setDeviceBusy(true);
    const result = await requestAppNotificationPermission();
    setDeviceMessage(result.message || 'Reminder status updated.');
    setDeviceBusy(false);
  };

  const handleTest = async () => {
    setDeviceBusy(true);
    const result = await sendHabitReminderTestAlert();
    setDeviceMessage(result.message || 'Test reminder requested.');
    setDeviceBusy(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="pm-kicker">Reminders</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">Phone reminders</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Enable notifications on this device, then create one or more habit reminders. Device reminders work best when the app is installed and allowed to send notifications.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEnable}
              disabled={deviceBusy || !pushSupported}
              className="pm-toolbar-primary rounded-2xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {notificationPermission === 'granted' ? 'Reminders on' : 'Enable reminders'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={deviceBusy || notificationPermission !== 'granted'}
              className="pm-subtle-button rounded-2xl px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              Test
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          <span className={`rounded-full px-3 py-1 ${pushSupported ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {pushSupported ? 'This device supports reminders' : 'This browser does not support reminders'}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
            Permission: {notificationPermission}
          </span>
        </div>
        {deviceMessage ? <div className="mt-3 rounded-2xl bg-blue-50 px-3 py-2 text-sm text-blue-700">{deviceMessage}</div> : null}
        {reminderError ? <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{reminderError}</div> : null}
      </div>

      <ReminderForm habits={habits} onAddReminder={onAddReminder} saving={saving} />

      <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="pm-kicker">Saved</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Your reminders</h2>
        <div className="mt-4 space-y-3">
          {reminders.length ? reminders.map((reminder) => {
            const habit = habitById.get(reminder.habitId);
            return (
              <div key={reminder.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-black tracking-[-0.03em] text-slate-950">{reminder.reminderTime}</div>
                    <div className="mt-1 text-sm font-bold text-slate-700">{reminder.title}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      {habit?.name || 'Journal'} - {formatReminderFrequency(reminder)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateReminder(reminder.id, { isEnabled: !reminder.isEnabled })}
                      className={`rounded-2xl px-3 py-2 text-xs font-bold ${reminder.isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {reminder.isEnabled ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteReminder(reminder.id)}
                      className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-500">
              No reminders yet. Add one above, for example 21:55 every day.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SetupView = ({ habits, onAddHabit, onArchiveHabit, onUpdateHabit, saving }) => {
  const [editing, setEditing] = useState(null);

  return (
    <div className="space-y-4">
      <AddHabitForm onAdd={onAddHabit} saving={saving} />
      <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="pm-kicker">Setup</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Your habits</h2>
        <div className="mt-4 space-y-3">
          {habits.map((habit) => (
            <div key={habit.id} className="rounded-3xl bg-slate-50 p-4">
              {editing === habit.id ? (
                <HabitEditRow
                  habit={habit}
                  onCancel={() => setEditing(null)}
                  onSave={async (patch) => {
                    await onUpdateHabit(habit.id, patch);
                    setEditing(null);
                  }}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
                      <div className="truncate text-base font-bold text-slate-950">{habit.name}</div>
                    </div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      {habit.direction === 'negative' ? 'Avoid / reduce' : 'Positive habit'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(habit.id)} className="pm-subtle-button rounded-2xl px-3 py-2 text-xs font-bold">Edit</button>
                    <button type="button" onClick={() => onArchiveHabit(habit.id)} className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">Archive</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {habits.length === 0 ? <div className="text-sm text-slate-500">No habits yet.</div> : null}
        </div>
      </div>
    </div>
  );
};

const HabitEditRow = ({ habit, onCancel, onSave }) => {
  const [name, setName] = useState(habit.name);
  const [direction, setDirection] = useState(habit.direction);
  const [color, setColor] = useState(habit.color);

  return (
    <div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px]">
        <input value={name} onChange={(event) => setName(event.target.value)} className="pm-input rounded-2xl px-4 py-3 text-sm font-bold text-slate-950" />
        <select value={direction} onChange={(event) => setDirection(event.target.value)} className="pm-input rounded-2xl px-4 py-3 text-sm font-bold text-slate-950">
          <option value="positive">Positive habit</option>
          <option value="negative">Avoid / reduce</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {HABIT_COLORS.map((option) => (
          <button key={option} type="button" onClick={() => setColor(option)} className={`h-8 w-8 rounded-full border-2 ${color === option ? 'border-slate-950' : 'border-white'}`} style={{ backgroundColor: option }} />
        ))}
        <button type="button" onClick={() => onSave({ name, direction, color })} className="pm-toolbar-primary ml-auto rounded-2xl px-4 py-2 text-xs font-bold text-white">Save</button>
        <button type="button" onClick={onCancel} className="pm-subtle-button rounded-2xl px-4 py-2 text-xs font-bold">Cancel</button>
      </div>
    </div>
  );
};

export default function HabitsView({ currentUserId }) {
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedCell, setSelectedCell] = useState(null);
  const firedReminderKeysRef = useRef(new Set());
  const {
    addHabit,
    addReminder,
    archiveHabit,
    deleteReminder,
    entries,
    error,
    goToNextWeek,
    goToPreviousWeek,
    goToToday,
    habits,
    loading,
    reminderError,
    reminders,
    saving,
    selectedDate,
    setEntryStatus,
    setSelectedDate,
    today,
    updateEntryNote,
    updateHabit,
    updateReminder,
  } = useHabitsData({ currentUserId });

  const weekStart = getHabitWeekStart(selectedDate);
  const weekEnd = useMemo(() => {
    const days = getHabitWeekDays(weekStart);
    return days[days.length - 1]?.dateKey || weekStart;
  }, [weekStart]);
  const weekEntries = useMemo(() => (
    entries.filter((entry) => entry.entryDate >= weekStart && entry.entryDate <= weekEnd)
  ), [entries, weekEnd, weekStart]);
  const summary = useMemo(() => summarizeHabitRange({
    habits,
    entries: weekEntries,
    startDate: weekStart,
    endDate: weekEnd,
  }), [habits, weekEnd, weekEntries, weekStart]);
  const streakTotal = useMemo(() => (
    habits.reduce((total, habit) => total + getHabitStreak({ habit, entries, endDate: selectedDate }), 0)
  ), [entries, habits, selectedDate]);

  useEffect(() => {
    if (!reminders.length || typeof window === 'undefined') return undefined;

    const tick = () => {
      const now = new Date();
      const dateKey = formatHabitDateKey(now);
      const time = getNowTime();
      const dueReminders = getDueHabitReminders({ reminders, dateKey, time });
      dueReminders.forEach((reminder) => {
        const key = `${reminder.id}:${dateKey}:${time}`;
        if (firedReminderKeysRef.current.has(key)) return;
        firedReminderKeysRef.current.add(key);
        void showAppNotification({
          title: 'Habit reminder',
          body: reminder.title || 'It is time to update your journal.',
          tag: `habit-reminder:${reminder.id}`,
          url: '/habits',
          kind: 'habit-reminder',
        });
      });
    };

    tick();
    const intervalId = window.setInterval(tick, 30_000);
    return () => window.clearInterval(intervalId);
  }, [reminders]);

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-sm font-semibold text-slate-500">Loading Habits...</div>;
  }

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[var(--pm-page-bg,#f8fafc)] px-3 py-4 text-slate-900 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl pb-24">
        <div className="rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="pm-kicker">Habits</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-slate-950 sm:text-5xl">Daily habit journal</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Mark habits quickly, keep notes, review trends, and set gentle reminders.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={goToPreviousWeek} className="pm-subtle-button rounded-full px-4 py-3 text-sm font-bold">&lt;</button>
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || today)} className="pm-input rounded-2xl px-4 py-3 text-sm font-bold text-slate-950" />
              <button type="button" onClick={goToNextWeek} className="pm-subtle-button rounded-full px-4 py-3 text-sm font-bold">&gt;</button>
              <button type="button" onClick={goToToday} className="pm-toolbar-primary rounded-2xl px-4 py-3 text-sm font-bold text-white">Today</button>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="pm-kicker">Week</div>
              <div className="mt-2 text-lg font-bold text-slate-950">{formatHabitDisplayDate(weekStart)} - {formatHabitDisplayDate(weekEnd)}</div>
            </div>
            <div className="rounded-3xl bg-emerald-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Success</div>
              <div className="mt-2 text-3xl font-black text-emerald-700">{summary.successRate}%</div>
            </div>
            <div className="rounded-3xl bg-sky-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">Logged</div>
              <div className="mt-2 text-3xl font-black text-sky-700">{summary.completed}/{summary.expected}</div>
            </div>
            <div className="rounded-3xl bg-amber-50 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">Streaks</div>
              <div className="mt-2 text-3xl font-black text-amber-700">{streakTotal}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="inline-flex min-w-full gap-2 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-sm sm:min-w-0">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`rounded-[18px] px-4 py-2 text-sm font-bold transition ${activeTab === item.id ? 'pm-toolbar-primary text-white' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          {activeTab === 'journal' ? (
            <JournalView
              entries={entries}
              habits={habits}
              onSetEntryStatus={setEntryStatus}
              onUpdateEntryNote={updateEntryNote}
              saving={saving}
              selectedCell={selectedCell}
              selectedDate={selectedDate}
              setSelectedCell={setSelectedCell}
            />
          ) : activeTab === 'trend' ? (
            <TrendView entries={entries} habits={habits} selectedDate={selectedDate} />
          ) : activeTab === 'notes' ? (
            <NotesView entries={entries} habits={habits} />
          ) : activeTab === 'reminders' ? (
            <RemindersView
              habits={habits}
              reminders={reminders}
              reminderError={reminderError}
              onAddReminder={addReminder}
              onDeleteReminder={deleteReminder}
              onUpdateReminder={updateReminder}
              saving={saving}
            />
          ) : (
            <SetupView
              habits={habits}
              onAddHabit={addHabit}
              onArchiveHabit={archiveHabit}
              onUpdateHabit={updateHabit}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}
