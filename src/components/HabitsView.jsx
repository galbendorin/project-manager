import React, { useMemo, useState } from 'react';
import { useHabitsData } from '../hooks/useHabitsData';
import {
  buildHabitTrendBuckets,
  cycleHabitStatus,
  formatHabitDisplayDate,
  getHabitEntryMap,
  getHabitStreak,
  getHabitWeekDays,
  getHabitWeekStart,
  isHabitSuccess,
  summarizeHabitRange,
} from '../utils/habitTracker';

const HABIT_COLORS = ['#f59e0b', '#22c55e', '#38bdf8', '#a855f7', '#ef4444', '#14b8a6'];

const NAV_ITEMS = [
  { id: 'journal', label: 'Journal', icon: 'J' },
  { id: 'trend', label: 'Trend', icon: 'T' },
  { id: 'notes', label: 'Notes', icon: 'N' },
  { id: 'setup', label: 'Setup', icon: 'S' },
];

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
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">New habit</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_170px]">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Exercising, No alcohol, Be grateful..."
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-base font-semibold text-white placeholder:text-slate-500"
        />
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-white"
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
            className={`h-9 w-9 rounded-full border-2 ${color === option ? 'border-white' : 'border-transparent'}`}
            style={{ backgroundColor: option }}
            aria-label={`Choose ${option}`}
          />
        ))}
        <button
          type="submit"
          disabled={saving}
          className="ml-auto rounded-2xl bg-amber-400 px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-60"
        >
          {saving ? 'Adding...' : 'Add habit'}
        </button>
      </div>
      {error ? <div className="mt-3 rounded-2xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
    </form>
  );
};

const getStatusLabel = (status = '') => {
  if (status === 'yes') return 'Y';
  if (status === 'no') return 'N';
  if (status === 'skip') return '-';
  return '';
};

const getCellStyle = ({ habit, status }) => {
  if (!status) return 'border-white/5 bg-white/[0.07] text-slate-500';
  if (status === 'skip') return 'border-slate-500/30 bg-slate-500/20 text-slate-300';
  return isHabitSuccess(habit, status)
    ? 'border-emerald-400/40 bg-emerald-400/25 text-emerald-100'
    : 'border-rose-400/40 bg-rose-400/25 text-rose-100';
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

  React.useEffect(() => {
    setNoteDraft(activeEntry?.note || '');
  }, [activeEntry?.id, activeEntry?.note, selectedCell?.dateKey, selectedCell?.habitId]);

  if (habits.length === 0) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-6 text-center">
        <p className="text-sm font-semibold text-slate-300">Create your first habit in Setup, then come back here to mark the week.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.06]">
        <div className="grid grid-cols-[minmax(120px,1.35fr)_repeat(7,minmax(36px,1fr))] border-b border-white/10 text-center text-xs font-black uppercase tracking-[0.18em] text-slate-400">
          <div className="px-4 py-3 text-left">Habit</div>
          {weekDays.map((day) => (
            <div key={day.dateKey} className="px-1 py-3">
              <div>{day.dayLabel}</div>
              <div className="mt-1 text-lg tracking-normal text-slate-200">{day.shortLabel}</div>
            </div>
          ))}
        </div>

        {habits.map((habit) => (
          <div key={habit.id} className="grid grid-cols-[minmax(120px,1.35fr)_repeat(7,minmax(36px,1fr))] items-stretch border-b border-white/5 last:border-b-0">
            <div className="min-w-0 px-4 py-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: habit.color }} />
                <div className="truncate text-base font-black text-slate-100">{habit.name}</div>
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
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
                  className={`m-1 min-h-[54px] rounded-2xl border text-xl font-black transition ${getCellStyle({ habit, status: entry?.status })} ${isSelected ? 'ring-2 ring-amber-300' : ''}`}
                  title={`${habit.name} · ${day.fullLabel}`}
                >
                  {getStatusLabel(entry?.status)}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-slate-950/60 p-4">
        {activeHabit ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Selected</p>
              <h3 className="mt-1 text-lg font-black text-white">{activeHabit.name} - {formatHabitDisplayDate(selectedCell.dateKey)}</h3>
              </div>
              <div className="flex gap-2">
                {['yes', 'no', 'skip'].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onSetEntryStatus({ habit: activeHabit, dateKey: selectedCell.dateKey, status })}
                    className={`rounded-2xl px-3 py-2 text-sm font-black ${activeEntry?.status === status ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-slate-200'}`}
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
              className="mt-3 min-h-[90px] w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => onUpdateEntryNote({ habit: activeHabit, dateKey: selectedCell.dateKey, note: noteDraft })}
              className="mt-3 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-950"
            >
              Save note
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-400">Tap a cell to mark it. The cycle is Yes, No, Skip, then blank. Select a cell to add a note.</p>
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
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 text-slate-300">Create a habit first.</div>;
  }

  return (
    <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Trend</p>
          <h2 className="mt-1 text-2xl font-black text-white">{selectedHabit.name}</h2>
        </div>
        <select
          value={selectedHabit.id}
          onChange={(event) => setSelectedHabitId(event.target.value)}
          className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-2 text-sm font-bold text-white"
        >
          {habits.map((habit) => <option key={habit.id} value={habit.id}>{habit.name}</option>)}
        </select>
      </div>

      <div className="mt-8 flex h-[260px] items-end gap-2 border-b border-slate-600/70 px-2">
        {buckets.map((bucket) => {
          const successHeight = Math.max(4, (bucket.success / maxBucket) * 220);
          const missHeight = Math.max(4, ((bucket.yes + bucket.no - bucket.success) / maxBucket) * 220);
          return (
            <div key={bucket.weekStart} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex h-[230px] items-end gap-1">
                <div className="w-3 rounded-t bg-emerald-400" style={{ height: `${successHeight}px` }} />
                <div className="w-3 rounded-t bg-rose-400" style={{ height: `${missHeight}px` }} />
              </div>
              <span className="text-[10px] font-bold text-slate-500">{bucket.weekStart.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
        <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-emerald-200">Green = aligned</span>
        <span className="rounded-full bg-rose-400/15 px-3 py-1 text-rose-200">Red = not aligned</span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-slate-300">Each bar = one week</span>
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
    <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Notes</p>
      <h2 className="mt-1 text-2xl font-black text-white">Journal notes</h2>
      <div className="mt-4 space-y-3">
        {noteEntries.length ? noteEntries.map((entry) => {
          const habit = habitById.get(entry.habitId);
          return (
            <div key={entry.id} className="rounded-3xl bg-slate-950/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-white">{habit?.name || 'Habit'}</div>
                <div className="text-xs font-bold text-slate-500">{formatHabitDisplayDate(entry.entryDate)}</div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{entry.note}</p>
            </div>
          );
        }) : (
          <div className="rounded-3xl bg-slate-950/50 p-4 text-sm text-slate-400">
            Notes you add from the Journal will collect here.
          </div>
        )}
      </div>
    </div>
  );
};

const SetupView = ({ habits, onAddHabit, onArchiveHabit, onUpdateHabit, saving }) => {
  const [editing, setEditing] = useState(null);

  return (
    <div className="space-y-4">
      <AddHabitForm onAdd={onAddHabit} saving={saving} />
      <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Setup</p>
        <h2 className="mt-1 text-2xl font-black text-white">Your habits</h2>
        <div className="mt-4 space-y-3">
          {habits.map((habit) => (
            <div key={habit.id} className="rounded-3xl bg-slate-950/55 p-4">
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
                      <div className="truncate text-base font-black text-white">{habit.name}</div>
                    </div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      {habit.direction === 'negative' ? 'Avoid / reduce' : 'Positive habit'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(habit.id)} className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-slate-200">Edit</button>
                    <button type="button" onClick={() => onArchiveHabit(habit.id)} className="rounded-2xl bg-rose-400/15 px-3 py-2 text-xs font-black text-rose-200">Archive</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {habits.length === 0 ? <div className="text-sm text-slate-400">No habits yet.</div> : null}
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
        <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white" />
        <select value={direction} onChange={(event) => setDirection(event.target.value)} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white">
          <option value="positive">Positive habit</option>
          <option value="negative">Avoid / reduce</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {HABIT_COLORS.map((option) => (
          <button key={option} type="button" onClick={() => setColor(option)} className={`h-8 w-8 rounded-full border-2 ${color === option ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: option }} />
        ))}
        <button type="button" onClick={() => onSave({ name, direction, color })} className="ml-auto rounded-2xl bg-amber-400 px-4 py-2 text-xs font-black text-slate-950">Save</button>
        <button type="button" onClick={onCancel} className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black text-slate-200">Cancel</button>
      </div>
    </div>
  );
};

export default function HabitsView({ currentUserId }) {
  const [activeTab, setActiveTab] = useState('journal');
  const [selectedCell, setSelectedCell] = useState(null);
  const {
    addHabit,
    archiveHabit,
    entries,
    error,
    goToNextWeek,
    goToPreviousWeek,
    goToToday,
    habits,
    loading,
    saving,
    selectedDate,
    setEntryStatus,
    setSelectedDate,
    today,
    updateEntryNote,
    updateHabit,
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

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-sm font-semibold text-slate-500">Loading Habits...</div>;
  }

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[#18191f] px-3 py-4 text-slate-100 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl pb-24">
        <div className="rounded-[34px] border border-white/10 bg-[#22232b] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">Habits</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl">Way of days</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Fast daily tracking for the behaviours you want to build, reduce, or simply understand.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={goToPreviousWeek} className="rounded-full bg-white/10 px-4 py-3 text-sm font-black text-slate-200">&lt;</button>
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || today)} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-bold text-white" />
              <button type="button" onClick={goToNextWeek} className="rounded-full bg-white/10 px-4 py-3 text-sm font-black text-slate-200">&gt;</button>
              <button type="button" onClick={goToToday} className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950">Today</button>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <div className="rounded-3xl bg-white/[0.07] p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Week</div>
              <div className="mt-2 text-lg font-black text-white">{formatHabitDisplayDate(weekStart)} - {formatHabitDisplayDate(weekEnd)}</div>
            </div>
            <div className="rounded-3xl bg-emerald-400/10 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">Success</div>
              <div className="mt-2 text-3xl font-black text-emerald-100">{summary.successRate}%</div>
            </div>
            <div className="rounded-3xl bg-sky-400/10 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">Logged</div>
              <div className="mt-2 text-3xl font-black text-sky-100">{summary.completed}/{summary.expected}</div>
            </div>
            <div className="rounded-3xl bg-amber-400/10 p-4">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">Streaks</div>
              <div className="mt-2 text-3xl font-black text-amber-100">{streakTotal}</div>
            </div>
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

      <div className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
        <div className="flex w-full max-w-xl rounded-[28px] border border-white/10 bg-[#15161c]/95 p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.35)] backdrop-blur">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[22px] px-2 py-2 text-xs font-black transition ${activeTab === item.id ? 'bg-white/15 text-amber-300' : 'text-slate-300'}`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="mt-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
