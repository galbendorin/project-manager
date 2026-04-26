import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBabyData } from '../hooks/useBabyData';
import {
  addBabyDays,
  buildBabyActivityLog,
  formatBabyDateKey,
  formatBabyDisplayDate,
  formatBabyTime,
  getSleepBlockTimeLabel,
  normalizeSleepBlocks,
  summarizeBabyDay,
} from '../utils/babyTracker';

const FEED_TYPES = [
  { value: '', label: 'Not specified' },
  { value: 'breastfeeding', label: 'Breastfeeding' },
  { value: 'expressed_milk', label: 'Expressed milk' },
  { value: 'formula', label: 'Formula' },
  { value: 'other', label: 'Other' },
];

const BREAST_SIDES = [
  { value: '', label: 'Not specified' },
  { value: 'left', label: 'Left breast' },
  { value: 'right', label: 'Right breast' },
  { value: 'both', label: 'Both sides' },
];

const NAPPY_TYPES = [
  { value: 'wet', label: 'Wet nappy' },
  { value: 'poo', label: 'Poo nappy' },
  { value: 'mixed', label: 'Mixed nappy' },
];

const PATTERN_RANGES = [
  { value: 'day', label: '1 day' },
  { value: 'week', label: '1 week' },
  { value: 'month', label: '1 month' },
  { value: 'last30', label: 'Last 30 days' },
];

const formatDuration = (minutes = 0) => {
  const total = Number(minutes) || 0;
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const remaining = total % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatBabyTime(date);
};

const formatBreastSide = (side = '') => {
  const normalized = String(side || '').toLowerCase();
  if (normalized === 'left') return 'Left breast';
  if (normalized === 'right') return 'Right breast';
  if (normalized === 'both') return 'Both sides';
  return '';
};

const getDateParts = (dateKey = formatBabyDateKey()) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return { year: year || new Date().getFullYear(), month: month || 1, day: day || 1 };
};

const getPatternRange = (range, selectedDate) => {
  const { year, month, day } = getDateParts(selectedDate);
  const selected = new Date(year, month - 1, day);

  if (range === 'week') {
    const monday = new Date(selected);
    const dayIndex = monday.getDay() || 7;
    monday.setDate(monday.getDate() - dayIndex + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: formatBabyDateKey(monday), endDate: formatBabyDateKey(sunday) };
  }

  if (range === 'month') {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    return { startDate: formatBabyDateKey(first), endDate: formatBabyDateKey(last) };
  }

  if (range === 'last30') {
    return { startDate: addBabyDays(selectedDate, -29), endDate: selectedDate };
  }

  return { startDate: selectedDate, endDate: selectedDate };
};

const getDateKeysBetween = (startDate, endDate) => {
  const keys = [];
  let cursor = startDate;
  while (cursor <= endDate && keys.length < 40) {
    keys.push(cursor);
    cursor = addBabyDays(cursor, 1);
  }
  return keys;
};

const groupByDate = (items, fieldName) => items.reduce((groups, item) => {
  const dateKey = item[fieldName] || '';
  if (!dateKey) return groups;
  if (!groups[dateKey]) groups[dateKey] = [];
  groups[dateKey].push(item);
  return groups;
}, {});

const ModalShell = ({ title, children, onClose }) => (
  <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 px-0 sm:items-center sm:px-4">
    <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-hidden="true" tabIndex={-1} />
    <div className="relative w-full max-w-lg rounded-t-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.24)] sm:rounded-[28px] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="pm-kicker">Baby</p>
          <h2 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-slate-950">{title}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500">
          Close
        </button>
      </div>
      {children}
    </div>
  </div>
);

const SummaryCard = ({ label, value, detail, tone = 'slate' }) => {
  const toneClass = {
    sky: 'border-sky-100 bg-sky-50 text-sky-800',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    rose: 'border-rose-100 bg-rose-50 text-rose-800',
    indigo: 'border-indigo-100 bg-indigo-50 text-indigo-800',
    slate: 'border-slate-100 bg-white text-slate-800',
  }[tone] || 'border-slate-100 bg-white text-slate-800';

  return (
    <div className={`rounded-[22px] border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.05em]">{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold opacity-70">{detail}</p> : null}
    </div>
  );
};

const BabySetupCard = ({ onCreate, saving }) => {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');

  return (
    <div className="mx-auto mt-8 max-w-xl rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="pm-kicker">First setup</p>
      <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">Add baby profile</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        This creates the private household record used for feeds, nappies, sleep, and weight.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({ name, birthDate });
        }}
      >
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Baby name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
            placeholder="Baby"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Birth date optional</span>
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
          />
        </label>
        <button type="submit" disabled={saving} className="pm-toolbar-primary w-full rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {saving ? 'Creating...' : 'Create baby profile'}
        </button>
      </form>
    </div>
  );
};

const FeedModal = ({ dateKey, feed = null, onClose, onSave, saving }) => {
  const date = feed?.occurredAt ? new Date(feed.occurredAt) : new Date();
  const [time, setTime] = useState(feed?.occurredAt ? formatBabyTime(date) : formatBabyTime());
  const [durationMinutes, setDurationMinutes] = useState(feed?.durationMinutes || 20);
  const [feedType, setFeedType] = useState(feed?.feedType || '');
  const [breastSide, setBreastSide] = useState(feed?.breastSide || '');
  const [notes, setNotes] = useState(feed?.notes || '');
  const showBreastSide = feedType === 'breastfeeding';

  return (
    <ModalShell title={feed ? 'Edit feed' : 'Add feed'} onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ time, durationMinutes, feedType, breastSide: showBreastSide ? breastSide : '', notes });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date</span>
            <input disabled value={dateKey} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm opacity-70" />
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Time</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Duration minutes</span>
          <input type="number" min="0" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Feed type optional</span>
          <select value={feedType} onChange={(event) => setFeedType(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm">
            {FEED_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {showBreastSide ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Breast side optional</span>
            <select value={breastSide} onChange={(event) => setBreastSide(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm">
              {BREAST_SIDES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Notes optional</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
        </label>
        <button type="submit" disabled={saving} className="pm-toolbar-primary w-full rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {saving ? 'Saving...' : 'Save feed'}
        </button>
      </form>
    </ModalShell>
  );
};

const WeightModal = ({ dateKey, onClose, onSave, saving }) => {
  const [measuredAt, setMeasuredAt] = useState(dateKey);
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [notes, setNotes] = useState('');

  return (
    <ModalShell title="Add weight" onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ measuredAt, weightValue, weightUnit, notes });
        }}
      >
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date</span>
          <input type="date" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
        </label>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Weight</span>
            <input type="number" min="0" step="0.01" value={weightValue} onChange={(event) => setWeightValue(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" required />
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Unit</span>
            <select value={weightUnit} onChange={(event) => setWeightUnit(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm">
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Notes optional</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
        </label>
        <button type="submit" disabled={saving} className="pm-toolbar-primary w-full rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {saving ? 'Saving...' : 'Save weight'}
        </button>
      </form>
    </ModalShell>
  );
};

const NappyModal = ({ dateKey, nappy, onClose, onSave, saving }) => {
  const date = nappy?.occurredAt ? new Date(nappy.occurredAt) : new Date();
  const [time, setTime] = useState(nappy?.occurredAt ? formatBabyTime(date) : formatBabyTime());
  const [nappyType, setNappyType] = useState(nappy?.nappyType || 'wet');
  const [notes, setNotes] = useState(nappy?.notes || '');

  return (
    <ModalShell title="Edit nappy" onClose={onClose}>
      <form
        className="mt-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ time, nappyType, notes });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date</span>
            <input disabled value={dateKey} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm opacity-70" />
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Time</span>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Type</span>
          <select value={nappyType} onChange={(event) => setNappyType(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm">
            {NAPPY_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Notes optional</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
        </label>
        <button type="submit" disabled={saving} className="pm-toolbar-primary w-full rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
          {saving ? 'Saving...' : 'Save nappy'}
        </button>
      </form>
    </ModalShell>
  );
};

const SleepHourColumn = ({ hour, asleepSet, onBlockPointerDown = null, onBlockPointerEnter = null, compact = false }) => (
  <div className={`min-w-[26px] rounded-xl border ${hour % 6 === 0 ? 'border-slate-300 bg-white' : 'border-slate-100 bg-slate-50'} p-1`}>
    <div className={`mb-1 text-center font-bold tabular-nums ${hour % 6 === 0 ? 'text-slate-700' : 'text-slate-400'} ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
      {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
    </div>
    <div className="grid gap-[3px]">
      {[0, 1, 2, 3].map((quarter) => {
        const index = (hour * 4) + quarter;
        const asleep = asleepSet.has(index);
        const className = `${compact ? 'h-2' : 'h-4 sm:h-5'} rounded-md border transition ${
          asleep
            ? 'border-sky-500 bg-sky-500 shadow-sm'
            : 'border-white bg-white hover:bg-sky-50'
        }`;

        if (!onBlockPointerDown) {
          return <div key={index} title={getSleepBlockTimeLabel(index)} className={className} />;
        }

        return (
          <button
            key={index}
            type="button"
            title={getSleepBlockTimeLabel(index)}
            onPointerDown={(event) => {
              event.preventDefault();
              onBlockPointerDown(index);
            }}
            onPointerEnter={() => onBlockPointerEnter?.(index)}
            className={className}
          />
        );
      })}
    </div>
  </div>
);

const SleepPatternStrip = ({ sleepBlocks = [], compact = false }) => {
  const asleepSet = useMemo(() => normalizeSleepBlocks(sleepBlocks), [sleepBlocks]);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid min-w-[720px] gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
        {Array.from({ length: 24 }, (_, hour) => (
          <SleepHourColumn key={hour} hour={hour} asleepSet={asleepSet} compact={compact} />
        ))}
      </div>
    </div>
  );
};

const SleepGrid = ({ sleepBlocks, onSave, saving }) => {
  const initialSet = useMemo(() => normalizeSleepBlocks(sleepBlocks), [sleepBlocks]);
  const [draftSet, setDraftSet] = useState(initialSet);
  const dragModeRef = useRef(null);

  React.useEffect(() => {
    setDraftSet(initialSet);
  }, [initialSet]);

  const applyBlock = (index, mode) => {
    setDraftSet((previous) => {
      const next = new Set(previous);
      if (mode === 'asleep') next.add(index);
      if (mode === 'awake') next.delete(index);
      return next;
    });
  };

  const startToggle = (index) => {
    const mode = draftSet.has(index) ? 'awake' : 'asleep';
    dragModeRef.current = mode;
    applyBlock(index, mode);
  };

  const stopToggle = () => {
    dragModeRef.current = null;
  };

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="pm-kicker">Sleep grid</p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950">24-hour pattern</h2>
          <p className="mt-1 text-xs text-slate-500">Tap or drag 15-minute blocks. Blue means asleep.</p>
        </div>
        <button
          type="button"
          onClick={() => onSave(draftSet)}
          disabled={saving}
          className="pm-toolbar-primary rounded-2xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save sleep'}
        </button>
      </div>

      <div className="mt-4 select-none overflow-x-auto rounded-[24px] border border-slate-100 bg-slate-50 p-2 pb-3 touch-pan-x" onPointerLeave={stopToggle} onPointerUp={stopToggle}>
        <div className="grid min-w-[720px] gap-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <SleepHourColumn
              key={hour}
              hour={hour}
              asleepSet={draftSet}
              onBlockPointerDown={startToggle}
              onBlockPointerEnter={(index) => {
                if (dragModeRef.current) applyBlock(index, dragModeRef.current);
              }}
            />
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-1">Major markers every 6h</span>
        <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">Blue = asleep</span>
        <span className="rounded-full bg-white px-2 py-1">White = awake</span>
      </div>
    </section>
  );
};

const PatternPanel = ({
  dateKeys,
  feeds,
  nappies,
  patternRange,
  rangeLabel,
  rangeLoading,
  selectedDate,
  setPatternRange,
  sleepBlocks,
}) => {
  const feedsByDate = useMemo(() => groupByDate(feeds, 'localDate'), [feeds]);
  const nappiesByDate = useMemo(() => groupByDate(nappies, 'localDate'), [nappies]);
  const sleepByDate = useMemo(() => groupByDate(sleepBlocks, 'sleepDate'), [sleepBlocks]);

  const patternDays = useMemo(() => dateKeys.map((dateKey) => {
    const dayFeeds = feedsByDate[dateKey] || [];
    const dayNappies = nappiesByDate[dateKey] || [];
    const daySleep = sleepByDate[dateKey] || [];
    return {
      dateKey,
      summary: summarizeBabyDay({ feeds: dayFeeds, nappies: dayNappies, sleepBlocks: daySleep }),
      feeds: dayFeeds,
      nappies: dayNappies,
      sleepBlocks: daySleep,
    };
  }), [dateKeys, feedsByDate, nappiesByDate, sleepByDate]);

  const rangeTotals = useMemo(() => patternDays.reduce((totals, day) => ({
    feeds: totals.feeds + day.summary.feedCount,
    feedMinutes: totals.feedMinutes + day.summary.totalFeedMinutes,
    nappies: totals.nappies + day.summary.totalNappies,
    sleepMinutes: totals.sleepMinutes + day.summary.sleep.totalMinutes,
  }), { feeds: 0, feedMinutes: 0, nappies: 0, sleepMinutes: 0 }), [patternDays]);

  return (
    <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="pm-kicker">Pattern</p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950">Sleep, feeds, nappies</h2>
          <p className="mt-1 text-xs text-slate-500">{rangeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {PATTERN_RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPatternRange(option.value)}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                patternRange === option.value
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <div className="rounded-2xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">{rangeTotals.feeds} feeds</div>
        <div className="rounded-2xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800">{formatDuration(rangeTotals.feedMinutes)} feeding</div>
        <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{rangeTotals.nappies} nappies</div>
        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{formatDuration(rangeTotals.sleepMinutes)} sleep</div>
      </div>

      {rangeLoading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500">
          Loading pattern...
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {patternDays.map((day) => {
            const hasCare = day.summary.feedCount || day.summary.totalNappies || day.summary.sleep.totalMinutes;
            return (
              <div key={day.dateKey} className={`rounded-[24px] border p-3 ${day.dateKey === selectedDate ? 'border-sky-200 bg-sky-50/40' : 'border-slate-100 bg-slate-50/70'}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-slate-950">{formatBabyDisplayDate(day.dateKey)}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                      {hasCare
                        ? `${day.summary.feedCount} feeds · ${day.summary.totalNappies} nappies · ${formatDuration(day.summary.sleep.totalMinutes)} sleep`
                        : 'No records yet'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                    {day.feeds.length ? <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700">Feeds {day.feeds.length}</span> : null}
                    {day.nappies.length ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">Nappies {day.nappies.length}</span> : null}
                  </div>
                </div>
                <SleepPatternStrip sleepBlocks={day.sleepBlocks} compact />
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
                  <span>Day {formatDuration(day.summary.sleep.daytimeMinutes)}</span>
                  <span>Night {formatDuration(day.summary.sleep.nightMinutes)}</span>
                  <span>Feeds {day.feeds.map((feed) => formatDateTime(feed.occurredAt)).filter(Boolean).join(', ') || 'none'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default function BabyView({ currentUserId }) {
  const {
    addFeed,
    addNappy,
    addWeight,
    babyProfile,
    createBabyProfile,
    dayVersion,
    deleteFeed,
    deleteNappy,
    error,
    feeds,
    goToNextDay,
    goToPreviousDay,
    goToToday,
    latestWeight,
    loadRangeData,
    loading,
    nappies,
    rangeFeeds,
    rangeLoading,
    rangeNappies,
    rangeSleepBlocks,
    saveSleepBlocks,
    saving,
    selectedDate,
    setSelectedDate,
    sleepBlocks,
    today,
    updateFeed,
    updateNappy,
    weights,
  } = useBabyData({ currentUserId });
  const [feedModal, setFeedModal] = useState(null);
  const [nappyModal, setNappyModal] = useState(null);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [patternRange, setPatternRange] = useState('day');
  const [weightModalOpen, setWeightModalOpen] = useState(false);

  const daySummary = useMemo(() => summarizeBabyDay({ feeds, nappies, sleepBlocks, latestWeight }), [feeds, latestWeight, nappies, sleepBlocks]);
  const activityLog = useMemo(() => buildBabyActivityLog({ feeds, nappies, sleepBlocks }), [feeds, nappies, sleepBlocks]);
  const latestActivity = activityLog[activityLog.length - 1] || null;
  const patternWindow = useMemo(() => getPatternRange(patternRange, selectedDate), [patternRange, selectedDate]);
  const patternDateKeys = useMemo(() => getDateKeysBetween(patternWindow.startDate, patternWindow.endDate), [patternWindow]);
  const rangeLabel = patternRange === 'day'
    ? formatBabyDisplayDate(selectedDate)
    : `${formatBabyDisplayDate(patternWindow.startDate)} to ${formatBabyDisplayDate(patternWindow.endDate)}`;

  useEffect(() => {
    if (!babyProfile?.id) return;
    void loadRangeData(patternWindow);
  }, [babyProfile?.id, dayVersion, loadRangeData, patternWindow]);

  useEffect(() => {
    setActivityExpanded(false);
  }, [selectedDate]);

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-sm font-semibold text-slate-500">Loading Baby...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="rounded-[34px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="pm-kicker">Baby</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] text-slate-950 sm:text-5xl">
              Daily care dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Track feeds, nappies, sleep, and weight in one gentle daily view.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-2">
            <button type="button" onClick={goToPreviousDay} className="pm-subtle-button rounded-2xl px-3 py-2 text-sm font-bold">‹</button>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || formatBabyDateKey())} className="pm-input min-w-[150px] rounded-2xl px-3 py-2 text-sm" />
            <button type="button" onClick={goToNextDay} className="pm-subtle-button rounded-2xl px-3 py-2 text-sm font-bold">›</button>
            <button type="button" onClick={goToToday} className="pm-toolbar-primary rounded-2xl px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={selectedDate === today}>Today</button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {!babyProfile ? (
          <BabySetupCard onCreate={createBabyProfile} saving={saving} />
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-[-0.04em] text-slate-950">{babyProfile.name}</h2>
                <p className="text-sm text-slate-500">{formatBabyDisplayDate(selectedDate)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setFeedModal({})} className="pm-toolbar-primary rounded-2xl px-4 py-2.5 text-xs font-bold text-white">Add feed</button>
                <button type="button" onClick={() => void addFeed({ feedType: 'breastfeeding', breastSide: 'left', durationMinutes: 10 })} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700">Left breast</button>
                <button type="button" onClick={() => void addFeed({ feedType: 'breastfeeding', breastSide: 'right', durationMinutes: 10 })} className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-700">Right breast</button>
                <button type="button" onClick={() => void addNappy({ nappyType: 'wet' })} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-bold text-sky-700">Wet nappy</button>
                <button type="button" onClick={() => void addNappy({ nappyType: 'poo' })} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700">Poo nappy</button>
                <button type="button" onClick={() => setWeightModalOpen(true)} className="pm-subtle-button rounded-2xl px-4 py-2.5 text-xs font-bold">Add weight</button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <SummaryCard label="Feeds" value={daySummary.feedCount} detail={`${formatDuration(daySummary.totalFeedMinutes)} total`} tone="sky" />
              <SummaryCard label="Avg feed" value={`${daySummary.averageFeedMinutes}m`} detail="per feed" tone="slate" />
              <SummaryCard label="Wet" value={daySummary.wetNappies} detail="nappies" tone="emerald" />
              <SummaryCard label="Poo" value={daySummary.pooNappies} detail="nappies" tone="amber" />
              <SummaryCard label="Sleep" value={formatDuration(daySummary.sleep.totalMinutes)} detail={`${daySummary.sleep.sessionCount} sessions`} tone="indigo" />
              <SummaryCard label="Weight" value={latestWeight?.weightValue ? `${latestWeight.weightValue}${latestWeight.weightUnit}` : '—'} detail={latestWeight?.measuredAt || 'optional'} tone="rose" />
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <div className="space-y-5">
                <SleepGrid sleepBlocks={sleepBlocks} onSave={saveSleepBlocks} saving={saving} />
                <PatternPanel
                  dateKeys={patternDateKeys}
                  feeds={rangeFeeds}
                  nappies={rangeNappies}
                  patternRange={patternRange}
                  rangeLabel={rangeLabel}
                  rangeLoading={rangeLoading}
                  selectedDate={selectedDate}
                  setPatternRange={setPatternRange}
                  sleepBlocks={rangeSleepBlocks}
                />
              </div>

              <aside className="space-y-5">
                <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="pm-kicker">Activity log</p>
                      <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950">Today’s events</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivityExpanded((current) => !current)}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={activityLog.length === 0}
                      aria-expanded={activityExpanded}
                    >
                      {activityExpanded ? 'Minimise' : 'Show log'}
                    </button>
                  </div>

                  <div className="mt-4 rounded-[24px] border border-slate-100 bg-slate-50 px-4 py-3">
                    {latestActivity ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-900">
                            {activityLog.length} {activityLog.length === 1 ? 'event' : 'events'} logged
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Latest: {latestActivity.type === 'sleep' ? latestActivity.raw.startTime : formatDateTime(latestActivity.occurredAt)} · {latestActivity.label}
                          </p>
                        </div>
                        <span className="w-fit rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500 shadow-sm">
                          {activityExpanded ? 'Open' : 'Minimised'}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-slate-500">No events yet.</p>
                    )}
                  </div>

                  {activityExpanded ? (
                    <div className="mt-4 space-y-2">
                      {activityLog.map((event) => (
                        <div key={event.id} className={`rounded-2xl border px-3 py-3 ${event.type === 'sleep' ? 'border-sky-100 bg-sky-50/60' : 'border-slate-100 bg-slate-50'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-slate-900">
                                {event.type === 'sleep' ? event.raw.startTime : formatDateTime(event.occurredAt)} · {event.label}
                              </div>
                              <div className="mt-0.5 text-xs text-slate-500">{event.detail}</div>
                              {event.type === 'feed' && event.raw.breastSide ? (
                                <div className="mt-1 text-xs font-semibold text-rose-600">{formatBreastSide(event.raw.breastSide)}</div>
                              ) : null}
                            </div>
                            {event.type === 'feed' ? (
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setFeedModal(event.raw)} className="text-xs font-bold text-slate-500">Edit</button>
                                <button type="button" onClick={() => void deleteFeed(event.sourceId)} className="text-xs font-bold text-rose-500">Delete</button>
                              </div>
                            ) : event.type === 'nappy' ? (
                              <div className="flex gap-2">
                                <button type="button" onClick={() => setNappyModal(event.raw)} className="text-xs font-bold text-slate-500">Edit</button>
                                <button type="button" onClick={() => void deleteNappy(event.sourceId)} className="text-xs font-bold text-rose-500">Delete</button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <p className="pm-kicker">Weight</p>
                  <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-slate-950">Recent records</h2>
                  <div className="mt-4 space-y-2">
                    {weights.length === 0 ? (
                      <p className="text-sm text-slate-500">No weight records yet.</p>
                    ) : weights.slice(0, 5).map((weight) => (
                      <div key={weight.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                        <span className="font-semibold text-slate-700">{weight.measuredAt}</span>
                        <span className="font-bold text-slate-950">{weight.weightValue}{weight.weightUnit}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>

      {feedModal ? (
        <FeedModal
          dateKey={selectedDate}
          feed={feedModal.id ? feedModal : null}
          saving={saving}
          onClose={() => setFeedModal(null)}
          onSave={async (payload) => {
            if (feedModal.id) {
              await updateFeed(feedModal.id, { ...payload, dateKey: selectedDate });
            } else {
              await addFeed({ ...payload, dateKey: selectedDate });
            }
            setFeedModal(null);
          }}
        />
      ) : null}

      {nappyModal ? (
        <NappyModal
          dateKey={selectedDate}
          nappy={nappyModal}
          saving={saving}
          onClose={() => setNappyModal(null)}
          onSave={async (payload) => {
            await updateNappy(nappyModal.id, { ...payload, dateKey: selectedDate });
            setNappyModal(null);
          }}
        />
      ) : null}

      {weightModalOpen ? (
        <WeightModal
          dateKey={selectedDate}
          saving={saving}
          onClose={() => setWeightModalOpen(false)}
          onSave={async (payload) => {
            await addWeight(payload);
            setWeightModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
