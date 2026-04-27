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
  { value: 'week', label: '7 days' },
  { value: 'fortnight', label: '14 days' },
  { value: 'month', label: 'Month' },
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

const getDefaultFeedStartedAt = () => new Date(Date.now() - (20 * 60 * 1000));

const getCareBlockIndex = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = (date.getHours() * 60) + date.getMinutes();
  const index = Math.floor(minutes / 15);
  return Math.max(0, Math.min(95, index));
};

const getNappyMarker = (type = '') => {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'wet') return 'W';
  if (normalized === 'poo') return 'S';
  if (normalized === 'mixed') return 'WS';
  return 'N';
};

const CARE_MARKER_STYLES = {
  F: {
    color: '#c026d3',
    chip: 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200',
  },
  W: {
    color: '#059669',
    chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  S: {
    color: '#ea580c',
    chip: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  },
  WS: {
    color: '#4f46e5',
    chip: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  },
};

const buildCareMarkersByBlock = ({ feeds = [], nappies = [] } = {}) => {
  const markers = new Map();
  const addMarker = (index, marker) => {
    if (index === null) return;
    const existing = markers.get(index) || [];
    if (!existing.includes(marker)) existing.push(marker);
    markers.set(index, existing);
  };

  feeds.forEach((feed) => addMarker(getCareBlockIndex(feed.occurredAt), 'F'));
  nappies.forEach((nappy) => addMarker(getCareBlockIndex(nappy.occurredAt), getNappyMarker(nappy.nappyType)));
  return markers;
};

const getDateParts = (dateKey = formatBabyDateKey()) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return { year: year || new Date().getFullYear(), month: month || 1, day: day || 1 };
};

const getPatternRange = (range, selectedDate) => {
  const { year, month } = getDateParts(selectedDate);

  if (range === 'week') {
    return { startDate: addBabyDays(selectedDate, -6), endDate: selectedDate };
  }

  if (range === 'fortnight') {
    return { startDate: addBabyDays(selectedDate, -13), endDate: selectedDate };
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
    <div className={`rounded-[20px] border px-3 py-3 shadow-sm sm:rounded-[22px] sm:px-4 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70 sm:text-[11px]">{label}</p>
      <p className="mt-1 text-xl font-black tracking-[-0.05em] sm:mt-2 sm:text-2xl">{value}</p>
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
  const [time, setTime] = useState(feed?.occurredAt ? formatBabyTime(date) : formatBabyTime(getDefaultFeedStartedAt()));
  const [durationMinutes, setDurationMinutes] = useState(feed?.durationMinutes || 20);
  const [feedType, setFeedType] = useState(feed ? feed.feedType || '' : 'breastfeeding');
  const [breastSide, setBreastSide] = useState(feed ? feed.breastSide || '' : 'both');
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

const SleepHourColumn = ({ hour, asleepSet, onBlockPointerDown = null, onBlockPointerEnter = null, compact = false }) => {
  const isBedtime = hour < 7 || hour >= 22;
  return (
    <div className={`min-w-0 rounded-xl border p-1 ${isBedtime ? 'border-indigo-100 bg-indigo-50' : hour % 6 === 0 ? 'border-slate-300 bg-white' : 'border-slate-100 bg-slate-50'}`}>
      <div className={`mb-1 text-center font-black tabular-nums ${isBedtime ? 'text-indigo-700' : hour % 6 === 0 ? 'text-slate-700' : 'text-slate-400'} ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        {compact || hour % 3 === 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
      </div>
      <div className={compact ? 'grid grid-cols-4 gap-[3px]' : 'grid gap-[3px]'}>
        {[0, 1, 2, 3].map((quarter) => {
          const index = (hour * 4) + quarter;
          const asleep = asleepSet.has(index);
          const className = `${compact ? 'h-5' : 'h-4 sm:h-5'} rounded-md border transition ${
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
};

const SleepMatrix = ({ days, selectedDate }) => (
  <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white shadow-sm">
    <div className="min-w-[720px] sm:min-w-0">
      <div className="grid grid-cols-[76px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 sm:grid-cols-[92px_minmax(0,1fr)]">
        <div className="border-r border-slate-200 px-2 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
          Date
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className={`border-r border-slate-200 px-0.5 py-2 text-center text-[8px] font-black tabular-nums text-slate-500 last:border-r-0 sm:text-[10px] ${hour % 3 === 0 ? '' : 'text-transparent sm:text-slate-400'}`}>
              {String(hour).padStart(2, '0')}
            </div>
          ))}
        </div>
      </div>
      <div>
        {days.map((day) => {
          const asleepSet = normalizeSleepBlocks(day.sleepBlocks);
          const careMarkers = buildCareMarkersByBlock({ feeds: day.feeds, nappies: day.nappies });
          const hasAnySleep = asleepSet.size > 0;
          return (
            <div key={day.dateKey} className={`grid grid-cols-[76px_minmax(0,1fr)] border-b border-slate-100 last:border-b-0 sm:grid-cols-[92px_minmax(0,1fr)] ${day.dateKey === selectedDate ? 'bg-sky-50/50' : 'bg-white'}`}>
              <div className="border-r border-slate-200 px-2 py-2">
                <div className="text-[10px] font-black leading-tight text-slate-900 sm:text-xs">{formatBabyDisplayDate(day.dateKey)}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold text-slate-500">
                  {day.summary.feedCount ? <span>F{day.summary.feedCount}</span> : null}
                  {day.summary.totalNappies ? <span>N{day.summary.totalNappies}</span> : null}
                  {hasAnySleep ? <span>{formatDuration(day.summary.sleep.totalMinutes)}</span> : <span>No sleep</span>}
                </div>
              </div>
              <div className="grid gap-px bg-slate-200 p-px" style={{ gridTemplateColumns: 'repeat(96, minmax(0, 1fr))' }}>
                {Array.from({ length: 96 }, (_, index) => (
                  (() => {
                    const markers = careMarkers.get(index) || [];
                    const asleep = asleepSet.has(index);
                    return (
                      <div
                        key={index}
                        title={`${formatBabyDisplayDate(day.dateKey)} ${getSleepBlockTimeLabel(index)}${markers.length ? ` · ${markers.join('')}` : ''}`}
                        className={`flex h-5 min-w-0 items-center justify-center overflow-hidden text-[8px] font-black leading-none ${
                          asleep
                            ? 'bg-sky-500 text-white'
                          : index % 4 === 0
                            ? 'bg-slate-50 text-slate-800'
                            : 'bg-white text-slate-800'
                        } ${index % 24 === 0 ? 'shadow-[inset_1px_0_0_rgba(15,23,42,0.2)]' : ''}`}
                      >
                        {markers.map((marker) => (
                          <span
                            key={marker}
                            className={asleep ? 'inline-block rounded-sm bg-white/95 px-px' : 'inline-block'}
                            style={{
                              color: CARE_MARKER_STYLES[marker]?.color || '#334155',
                              WebkitTextFillColor: CARE_MARKER_STYLES[marker]?.color || '#334155',
                            }}
                          >
                            {marker}
                          </span>
                        ))}
                      </div>
                    );
                  })()
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

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
  const hourLabels = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

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

      <div className="mt-4 select-none rounded-[22px] border border-slate-100 bg-slate-50 p-2 sm:hidden touch-none" onPointerLeave={stopToggle} onPointerUp={stopToggle}>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 24 }, (_, hour) => (
            <SleepHourColumn
              key={hour}
              hour={hour}
              asleepSet={draftSet}
              compact
              onBlockPointerDown={startToggle}
              onBlockPointerEnter={(index) => {
                if (dragModeRef.current) applyBlock(index, dragModeRef.current);
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 hidden select-none rounded-[24px] border border-slate-100 bg-slate-50 p-3 sm:block" onPointerLeave={stopToggle} onPointerUp={stopToggle}>
        <div className="relative mb-2 h-3 overflow-hidden rounded-full bg-slate-100">
          <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-300" style={{ width: `${(7 / 24) * 100}%` }} />
          <span className="absolute inset-y-0 rounded-full bg-indigo-300" style={{ left: `${(22 / 24) * 100}%`, right: 0 }} />
        </div>
        <div className="grid overflow-hidden rounded-t-2xl border border-b-0 border-slate-300 bg-slate-100" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {hourLabels.map((label, hour) => (
            <div key={label} className={`border-r border-slate-300 px-0.5 py-1.5 text-center text-[10px] font-black tabular-nums last:border-r-0 ${hour < 7 || hour >= 22 ? 'bg-indigo-50 text-indigo-900' : 'bg-white text-slate-800'}`}>
              {label}
            </div>
          ))}
        </div>
        <div className="grid gap-px overflow-hidden rounded-b-2xl border border-slate-300 bg-slate-300" style={{ gridTemplateColumns: 'repeat(96, minmax(0, 1fr))' }}>
          {Array.from({ length: 96 }, (_, index) => {
            const asleep = draftSet.has(index);
            const hour = Math.floor(index / 4);
            return (
              <button
                key={index}
                type="button"
                title={getSleepBlockTimeLabel(index)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  startToggle(index);
                }}
                onPointerEnter={() => {
                  if (dragModeRef.current) applyBlock(index, dragModeRef.current);
                }}
                className={`h-8 transition ${
                  asleep
                    ? 'bg-sky-500 hover:bg-sky-600'
                    : hour < 7 || hour >= 22
                      ? 'bg-indigo-50 hover:bg-sky-50'
                      : 'bg-white hover:bg-sky-50'
                } ${index % 4 === 0 ? 'shadow-[inset_2px_0_0_rgba(15,23,42,0.34)]' : ''}`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
        <span className="rounded-full bg-slate-100 px-2 py-1">Desktop shows one 24h row</span>
        <span className="rounded-full bg-slate-100 px-2 py-1">Phone wraps hours</span>
        <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">Bedtime guide 22:00-07:00</span>
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
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:flex sm:flex-wrap">
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        <div className="mt-4">
          <SleepMatrix days={patternDays} selectedDate={selectedDate} />
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">
            <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">Blue cells = asleep</span>
            <span className="rounded-full bg-slate-100 px-2 py-1">Each cell = 15 min</span>
            <span className={`rounded-full px-2 py-1 ${CARE_MARKER_STYLES.F.chip}`}>F = feed</span>
            <span className={`rounded-full px-2 py-1 ${CARE_MARKER_STYLES.W.chip}`}>W = wet nappy</span>
            <span className={`rounded-full px-2 py-1 ${CARE_MARKER_STYLES.S.chip}`}>S = solid / poo nappy</span>
            <span className={`rounded-full px-2 py-1 ${CARE_MARKER_STYLES.WS.chip}`}>WS = mixed nappy</span>
          </div>
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
  const latestActivityTime = latestActivity
    ? (latestActivity.type === 'sleep' ? latestActivity.raw.startTime : formatDateTime(latestActivity.occurredAt))
    : '';
  const latestActivityExtra = latestActivity?.type === 'feed' && latestActivity.raw.breastSide
    ? formatBreastSide(latestActivity.raw.breastSide)
    : latestActivity?.detail || '';
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
    <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 sm:py-6 2xl:px-8">
      <div className="rounded-[34px] border border-white/70 bg-white/90 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-6 2xl:p-7">
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
                <button type="button" onClick={() => void addNappy({ nappyType: 'mixed' })} className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-700">Mixed nappy</button>
                <button type="button" onClick={() => setWeightModalOpen(true)} className="pm-subtle-button rounded-2xl px-4 py-2.5 text-xs font-bold">Add weight</button>
              </div>
            </div>

            <div className="mt-4 rounded-[26px] border border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-4 py-3 text-white shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/55">Last entry</p>
                {latestActivity ? (
                  <p className="mt-1 text-lg font-black tracking-[-0.04em]">
                    {latestActivityTime} · {latestActivity.label}
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-black tracking-[-0.04em]">No entries yet</p>
                )}
              </div>
              {latestActivity ? (
                <div className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-white/80 sm:mt-0">
                  {latestActivityExtra || 'Logged today'}
                </div>
              ) : (
                <div className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-white/75 sm:mt-0">
                  Add a feed or nappy to start
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-6">
              <SummaryCard label="Feeds" value={daySummary.feedCount} detail={`${formatDuration(daySummary.totalFeedMinutes)} total`} tone="sky" />
              <SummaryCard label="Avg feed" value={`${daySummary.averageFeedMinutes}m`} detail="per feed" tone="slate" />
              <SummaryCard label="Wet" value={daySummary.wetNappies} detail="nappies" tone="emerald" />
              <SummaryCard label="Poo" value={daySummary.pooNappies} detail="nappies" tone="amber" />
              <SummaryCard label="Sleep" value={formatDuration(daySummary.sleep.totalMinutes)} detail={`${daySummary.sleep.sessionCount} sessions`} tone="indigo" />
              <SummaryCard label="Weight" value={latestWeight?.weightValue ? `${latestWeight.weightValue}${latestWeight.weightUnit}` : '—'} detail={latestWeight?.measuredAt || 'optional'} tone="rose" />
            </div>

            <div className="mt-6 space-y-5">
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

              <aside className="grid gap-5 lg:grid-cols-2">
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
                            Latest: {latestActivityTime} · {latestActivity.label}
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
