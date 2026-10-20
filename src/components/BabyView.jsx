import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBabyData } from '../hooks/useBabyData';
import ProjectShareModal from './ProjectShareModal';
import PhoneSleepPicker from './baby/PhoneSleepPicker';
import SleepEntryEditor from './baby/SleepEntryEditor';
import SleepEntryList from './baby/SleepEntryList';
import CareDialog from './baby/CareDialog';
import { useBabySleepEntries } from '../hooks/useBabySleepEntries';
import { sleepEntryIntervalForDay } from '../utils/babySleepEntries';
import {
  addBabyDays,
  buildBabyActivityLog,
  formatBabyDateKey,
  formatBabyDisplayDate,
  formatBabyTime,
  getBabySleepGuidanceForDate,
  getNextBabySleepGuidanceForDate,
  getSleepBlockTimeLabel,
  getSleepGuidanceBlockStatus,
  getSleepGuidanceStatusLabel,
  normalizeSleepBlocks,
  summarizeBabyDay,
  summarizeSleepGuidanceComparison,
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

const SLEEP_GUIDE_CHART_SRC = '/baby-sleep-pattern-plan.png';

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

const formatGuidanceDateRange = (guidance = null) => {
  if (!guidance?.startDate || !guidance?.endDate) return '';
  return `${formatBabyDisplayDate(guidance.startDate)} to ${formatBabyDisplayDate(guidance.endDate)}`;
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

const SleepGuideChartModal = ({ onClose }) => (
  <CareDialog title="Baby sleep pattern guide" onClose={onClose} wide>
    <p className="mb-3 text-[13px] text-slate-600">Swipe sideways to review the full chart on a phone.</p>
    <div tabIndex="0" role="region" aria-label="Sleep guide chart. Scroll horizontally to read the full image." className="overflow-auto rounded-xl border border-slate-200 bg-slate-50">
      <img src={SLEEP_GUIDE_CHART_SRC} alt="Baby Sleep Pattern Plan showing expected and flexible sleep windows by month" className="block w-[1120px] max-w-none sm:w-full sm:max-w-full" />
    </div>
    <a className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-slate-200 px-3 text-[14px] font-semibold text-sky-800" href={SLEEP_GUIDE_CHART_SRC} target="_blank" rel="noreferrer">Open full-size guide ↗</a>
  </CareDialog>
);

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

const getMarkerColor = (marker) => CARE_MARKER_STYLES[marker]?.color || '#334155';

const getTimelinePercent = (blockIndex) => Math.min(100, Math.max(0, ((Number(blockIndex) || 0) / 96) * 100));

const formatTimelineMarkerTime = (entry = {}) => formatDateTime(entry.occurredAt || entry.occurred_at);

const buildTimelineMarkerClusters = (points = []) => {
  const sorted = points
    .filter((point) => Number.isInteger(point.blockIndex))
    .sort((left, right) => left.blockIndex - right.blockIndex);
  const clusters = [];

  sorted.forEach((point) => {
    const previous = clusters[clusters.length - 1];
    if (previous && point.blockIndex - previous.endBlock <= 2) {
      previous.points.push(point);
      previous.endBlock = Math.max(previous.endBlock, point.blockIndex);
      return;
    }

    clusters.push({
      startBlock: point.blockIndex,
      endBlock: point.blockIndex,
      points: [point],
    });
  });

  return clusters.map((cluster) => {
    const counts = cluster.points.reduce((acc, point) => {
      acc[point.marker] = (acc[point.marker] || 0) + 1;
      return acc;
    }, {});
    const pieces = ['F', 'W', 'S', 'WS']
      .filter((marker) => counts[marker])
      .map((marker) => ({
        marker,
        label: counts[marker] > 1 ? `${marker}${counts[marker]}` : marker,
      }));
    const averageBlock = cluster.points.reduce((sum, point) => sum + point.blockIndex, 0) / cluster.points.length;
    const title = cluster.points.map((point) => `${point.timeLabel} ${point.title}`).join(', ');

    return {
      id: `${cluster.startBlock}-${cluster.endBlock}-${pieces.map((piece) => piece.label).join('-')}`,
      blockIndex: Math.round(averageBlock),
      pieces,
      title,
    };
  });
};

const buildMobilePatternMarkers = ({ feeds = [], nappies = [] } = {}) => {
  const feedPoints = feeds.map((feed) => ({
    blockIndex: getCareBlockIndex(feed.occurredAt),
    marker: 'F',
    timeLabel: formatTimelineMarkerTime(feed),
    title: 'feed',
  }));

  const nappyPoints = nappies.map((nappy) => {
    const marker = getNappyMarker(nappy.nappyType);
    const label = marker === 'W' ? 'wet nappy' : marker === 'S' ? 'solid nappy' : marker === 'WS' ? 'mixed nappy' : 'nappy';
    return {
      blockIndex: getCareBlockIndex(nappy.occurredAt),
      marker,
      timeLabel: formatTimelineMarkerTime(nappy),
      title: label,
    };
  });

  return {
    feeds: buildTimelineMarkerClusters(feedPoints),
    nappies: buildTimelineMarkerClusters(nappyPoints),
  };
};

const getSleepBlockIndexFromPoint = (clientX, clientY) => {
  const target = document.elementFromPoint(clientX, clientY);
  const block = target?.closest?.('[data-sleep-block-index]');
  const blockIndex = Number(block?.dataset?.sleepBlockIndex);
  if (Number.isInteger(blockIndex) && blockIndex >= 0 && blockIndex < 96) return blockIndex;

  const hourElement = target?.closest?.('[data-sleep-hour]');
  const hour = Number(hourElement?.dataset?.sleepHour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;

  const rect = hourElement.getBoundingClientRect();
  const relativeX = Math.min(Math.max(clientX - rect.left, 0), rect.width);
  const quarter = Math.min(3, Math.max(0, Math.floor((relativeX / rect.width) * 4)));
  return (hour * 4) + quarter;
};

const getPointerSleepBlockIndex = (event) => {
  return getSleepBlockIndexFromPoint(event.clientX, event.clientY);
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

const ModalShell = ({ title, children, onClose, busy = false }) => <CareDialog title={title} onClose={onClose} busy={busy}>{children}</CareDialog>;

const useCareFormSave = (onSave, saving) => {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false);
  const submit = async payload => {
    if (saving || inFlight.current) return;
    inFlight.current = true; setPending(true); setError('');
    try { await onSave(payload); }
    catch (failure) { setError(`${failure?.message || 'Unable to save.'} Your entries are kept; try again.`); }
    finally { inFlight.current = false; setPending(false); }
  };
  return { busy: saving || pending, error, submit };
};

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
      <p className="text-[13px] font-semibold">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tracking-tight sm:mt-2 sm:text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-[13px] leading-5 opacity-80">{detail}</p> : null}
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

const DateControls = ({
  selectedDate,
  setSelectedDate,
  goToPreviousDay,
  goToNextDay,
  goToToday,
  today,
  compact = false,
}) => (
  <div className={`flex items-center gap-1.5 rounded-[20px] border border-slate-200 bg-slate-50 ${compact ? 'p-1' : 'p-2'}`}>
    <button
      type="button"
      onClick={goToPreviousDay}
      className="pm-subtle-button min-h-[44px] min-w-[44px] shrink-0 rounded-xl px-2 text-xl font-semibold"
      aria-label="Previous day"
    >
      ‹
    </button>
    <input
      type="date"
      value={selectedDate}
      onChange={(event) => setSelectedDate(event.target.value || formatBabyDateKey())}
      className="pm-input min-h-[44px] min-w-0 flex-1 rounded-xl px-2 text-[16px] font-semibold"
      aria-label="Selected baby tracker date"
    />
    <button
      type="button"
      onClick={goToNextDay}
      className="pm-subtle-button min-h-[44px] min-w-[44px] shrink-0 rounded-xl px-2 text-xl font-semibold"
      aria-label="Next day"
    >
      ›
    </button>
    <button
      type="button"
      onClick={goToToday}
      className="min-h-[44px] shrink-0 rounded-xl border border-slate-200 bg-white px-2 text-[13px] font-semibold text-slate-700 disabled:opacity-50"
      disabled={selectedDate === today}
    >
      Today
    </button>
  </div>
);

const FeedModal = ({ dateKey, feed = null, onClose, onSave, saving }) => {
  const isEditing = Boolean(feed?.id);
  const date = feed?.occurredAt ? new Date(feed.occurredAt) : new Date();
  const [time, setTime] = useState(feed?.occurredAt ? formatBabyTime(date) : formatBabyTime(getDefaultFeedStartedAt()));
  const [durationMinutes, setDurationMinutes] = useState(feed?.durationMinutes || 20);
  const [feedType, setFeedType] = useState(feed?.feedType || 'breastfeeding');
  const [breastSide, setBreastSide] = useState(feed?.breastSide || 'both');
  const [notes, setNotes] = useState(feed?.notes || '');
  const showBreastSide = feedType === 'breastfeeding';
  const form = useCareFormSave(onSave, saving);

  return (
    <ModalShell title={isEditing ? 'Edit feed' : 'Add feed'} onClose={onClose} busy={form.busy}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit({ time, durationMinutes, feedType, breastSide: showBreastSide ? breastSide : '', notes });
        }}
      >
        <fieldset disabled={form.busy} className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date</span>
            <input disabled value={dateKey} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm opacity-70" />
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Time</span>
            <input type="time" value={time} onInput={(event) => setTime(event.target.value)} onChange={(event) => setTime(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
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
        {form.error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{form.error}</p> : null}
        <button type="submit" disabled={form.busy} className="pm-toolbar-primary w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {form.busy ? 'Saving...' : 'Save feed'}
        </button>
        </fieldset>
      </form>
    </ModalShell>
  );
};

const WeightModal = ({ dateKey, onClose, onSave, saving }) => {
  const [measuredAt, setMeasuredAt] = useState(dateKey);
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState('kg');
  const [notes, setNotes] = useState('');
  const form = useCareFormSave(onSave, saving);

  return (
    <ModalShell title="Add weight" onClose={onClose} busy={form.busy}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit({ measuredAt, weightValue, weightUnit, notes });
        }}
      >
        <fieldset disabled={form.busy} className="min-w-0 space-y-4">
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
        {form.error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{form.error}</p> : null}
        <button type="submit" disabled={form.busy} className="pm-toolbar-primary w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {form.busy ? 'Saving...' : 'Save weight'}
        </button>
        </fieldset>
      </form>
    </ModalShell>
  );
};

const NappyModal = ({ dateKey, nappy, onClose, onSave, saving }) => {
  const isEditing = Boolean(nappy?.id);
  const date = nappy?.occurredAt ? new Date(nappy.occurredAt) : new Date();
  const [time, setTime] = useState(nappy?.occurredAt ? formatBabyTime(date) : formatBabyTime());
  const [nappyType, setNappyType] = useState(nappy?.nappyType || 'wet');
  const [notes, setNotes] = useState(nappy?.notes || '');
  const form = useCareFormSave(onSave, saving);

  return (
    <ModalShell title={isEditing ? 'Edit nappy' : 'Add nappy'} onClose={onClose} busy={form.busy}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit({ time, nappyType, notes });
        }}
      >
        <fieldset disabled={form.busy} className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date</span>
            <input disabled value={dateKey} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm opacity-70" />
          </label>
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Time</span>
            <input type="time" value={time} onInput={(event) => setTime(event.target.value)} onChange={(event) => setTime(event.target.value)} className="pm-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" />
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
        {form.error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{form.error}</p> : null}
        <button type="submit" disabled={form.busy} className="pm-toolbar-primary w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {form.busy ? 'Saving...' : 'Save nappy'}
        </button>
        </fieldset>
      </form>
    </ModalShell>
  );
};

const SleepMatrix = ({ days, selectedDate, editor = null, disabled = false }) => (
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
          const hasAnySleep = day.summary.sleep.totalMinutes > 0;
          const comparison = summarizeSleepGuidanceComparison({ sleepBlocks: day.sleepBlocks, sleepEntries: day.sleepEntries, dateKey: day.dateKey, guidance: day.sleepGuidance });
          return (
            <div key={day.dateKey} data-history-date={day.dateKey} className={`grid grid-cols-[76px_minmax(0,1fr)] border-b border-slate-100 last:border-b-0 sm:grid-cols-[92px_minmax(0,1fr)] ${day.dateKey === selectedDate ? 'bg-sky-50/50' : 'bg-white'}`}>
              <div className="border-r border-slate-200 px-2 py-2">
                <div className="text-[10px] font-black leading-tight text-slate-900 sm:text-xs">{formatBabyDisplayDate(day.dateKey)}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[9px] font-bold text-slate-500">
                  {day.summary.feedCount ? <span>F{day.summary.feedCount}</span> : null}
                  {day.summary.totalNappies ? <span>N{day.summary.totalNappies}</span> : null}
                  {hasAnySleep ? <span>{formatDuration(day.summary.sleep.totalMinutes)}</span> : <span>No sleep</span>}
                  {day.sleepGuidance ? <span>{day.sleepGuidance.monthLabel}</span> : null}
                  {comparison.actualOutsideGuideMinutes > 0 ? <span className="text-violet-700">+{formatDuration(comparison.actualOutsideGuideMinutes)}</span> : null}
                </div>
                {day.changed ? <p className="mt-1 text-[10px] font-bold text-indigo-700">Edited</p> : null}
              </div>
              <div className="grid gap-px bg-slate-200 p-px" style={{ gridTemplateColumns: 'repeat(96, minmax(0, 1fr))' }}>
                {Array.from({ length: 96 }, (_, index) => (
                  (() => {
                    const markers = careMarkers.get(index) || [];
                    const asleep = asleepSet.has(index);
                    const guideStatus = getSleepGuidanceBlockStatus(index, day.sleepGuidance);
                    const guideClass = asleep && guideStatus === 'awake'
                      ? 'bg-violet-500 text-white'
                      : asleep
                        ? 'bg-sky-600 text-white'
                        : guideStatus === 'expected'
                          ? 'bg-sky-100 text-sky-900'
                          : guideStatus === 'flexible'
                            ? 'bg-orange-100 text-orange-900'
                            : index % 4 === 0
                              ? 'bg-slate-50 text-slate-800'
                              : 'bg-white text-slate-800';
                    const Block = editor ? 'button' : 'div';
                    return (
                      <Block
                        key={index}
                        {...(editor ? {
                          type: 'button', disabled,
                          'data-sleep-block-index': index,
                          'aria-label': `${formatBabyDisplayDate(day.dateKey)} ${getSleepBlockTimeLabel(index)} ${asleep ? 'asleep' : 'awake'}`,
                          'aria-pressed': asleep,
                          onPointerDown: (event) => {
                            event.preventDefault();
                            event.currentTarget.setPointerCapture?.(event.pointerId);
                            editor.start(day.dateKey, index);
                          },
                          onClick: (event) => { if (event.detail === 0) editor.toggle(day.dateKey, index); },
                        } : {})}
                        title={`${formatBabyDisplayDate(day.dateKey)} ${getSleepBlockTimeLabel(index)} · ${getSleepGuidanceStatusLabel(guideStatus)}${markers.length ? ` · ${markers.join('')}` : ''}`}
                        className={`relative flex ${editor ? 'min-h-[44px] touch-none focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-700' : 'h-5'} min-w-0 items-center justify-center overflow-hidden text-[8px] font-black leading-none ${guideClass} ${index % 24 === 0 ? 'shadow-[inset_1px_0_0_rgba(15,23,42,0.2)]' : ''}`}
                      >
                        {!editor && !asleep ? (day.sleepEntries || []).map(entry => {
                          const interval = sleepEntryIntervalForDay(entry, day.dateKey);
                          if (!interval) return null;
                          const start = Math.max(interval.start, index * 15), end = Math.min(interval.end, (index + 1) * 15);
                          return end > start ? <span key={entry.id} title="Exact sleep · see times and notes below" className="absolute inset-y-0 bg-violet-600" style={{ left: `${(start - index * 15) / 15 * 100}%`, width: `${(end - start) / 15 * 100}%` }} /> : null;
                        }) : null}
                        {markers.map((marker) => (
                          <span
                            key={marker}
                            className={asleep ? 'relative inline-block rounded-sm bg-white/95 px-px' : 'relative inline-block'}
                            style={{
                              color: CARE_MARKER_STYLES[marker]?.color || '#334155',
                              WebkitTextFillColor: CARE_MARKER_STYLES[marker]?.color || '#334155',
                            }}
                          >
                            {marker}
                          </span>
                        ))}
                      </Block>
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

const TimelineBackdrop = () => (
  <>
    <span className="absolute inset-y-0 left-0 bg-indigo-50/80" style={{ width: `${(7 / 24) * 100}%` }} />
    <span className="absolute inset-y-0 bg-indigo-50/80" style={{ left: `${(22 / 24) * 100}%`, right: 0 }} />
    {[0, 6, 12, 18, 24].map((hour) => (
      <span
        key={hour}
        className="absolute inset-y-0 w-px bg-slate-200"
        style={{ left: `${(hour / 24) * 100}%` }}
      />
    ))}
  </>
);

const TimelineAxis = () => (
  <div className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2">
    <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Time</span>
    <div className="flex justify-between text-[10px] font-black tabular-nums text-slate-400">
      {['00', '06', '12', '18', '24'].map((label) => <span key={label}>{label}</span>)}
    </div>
  </div>
);

const TimelineLane = ({ label, tone = 'slate', children }) => {
  const toneClass = {
    sleep: 'text-sky-700',
    feed: 'text-fuchsia-700',
    nappy: 'text-amber-700',
    slate: 'text-slate-500',
  }[tone] || 'text-slate-500';

  return (
    <div className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2">
      <span className={`text-[9px] font-black uppercase tracking-[0.14em] ${toneClass}`}>{label}</span>
      <div className="relative h-9 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
        <TimelineBackdrop />
        {children}
      </div>
    </div>
  );
};

const TimelineMarker = ({ cluster }) => (
  <span
    className="absolute left-0 top-1/2 z-10 flex min-h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full border border-white bg-white/95 px-1.5 text-[10px] font-black shadow-sm ring-1 ring-slate-200"
    style={{ left: `${Math.min(98, Math.max(2, getTimelinePercent(cluster.blockIndex + 0.5)))}%` }}
    title={cluster.title}
  >
    {cluster.pieces.map((piece) => (
      <span
        key={piece.label}
        style={{
          color: getMarkerColor(piece.marker),
          WebkitTextFillColor: getMarkerColor(piece.marker),
        }}
      >
        {piece.label}
      </span>
    ))}
  </span>
);

const buildSleepGuidanceSegments = (guidance = null) => {
  const segments = [];
  let current = null;

  for (let index = 0; index < 96; index += 1) {
    const status = getSleepGuidanceBlockStatus(index, guidance);
    if (status === 'awake') {
      if (current) {
        segments.push(current);
        current = null;
      }
      continue;
    }

    if (!current || current.status !== status || index !== current.endBlock + 1) {
      if (current) segments.push(current);
      current = { status, startBlock: index, endBlock: index };
    } else {
      current.endBlock = index;
    }
  }

  if (current) segments.push(current);
  return segments;
};

const HistoryDayGrid = ({ day, editor, disabled }) => {
  const asleepSet = normalizeSleepBlocks(day.sleepBlocks);
  return <PhoneSleepPicker asleepSet={asleepSet} disabled={disabled} sleepGuidance={day.sleepGuidance}
    onToggle={index => editor.toggle(day.dateKey, index)} />;
};

const MobilePatternTimeline = ({ days, selectedDate, editor = null, disabled = false }) => (
  <div className="space-y-3">
    {days.map((day) => {
      const sleepSummary = day.summary.sleep;
      const markers = buildMobilePatternMarkers({ feeds: day.feeds, nappies: [] });
      const isSelected = day.dateKey === selectedDate;
      const guideSegments = buildSleepGuidanceSegments(day.sleepGuidance);
      const comparison = summarizeSleepGuidanceComparison({ sleepBlocks: day.sleepBlocks, sleepEntries: day.sleepEntries, dateKey: day.dateKey, guidance: day.sleepGuidance });

      return (
        <article key={day.dateKey} data-history-date={day.dateKey} aria-label={`Sleep for ${formatBabyDisplayDate(day.dateKey)}`} className={`rounded-2xl border p-3 ${isSelected ? 'border-sky-200 bg-sky-50/50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[15px] font-semibold leading-5 text-slate-950">{formatBabyDisplayDate(day.dateKey)}</p>
              <p className="mt-1 text-[13px] text-slate-600">
                {formatDuration(day.summary.sleep.totalMinutes)} sleep · {day.summary.feedCount} feeds
              </p>
              {day.sleepGuidance ? (
                <p className="mt-1 text-[12px] text-slate-500">
                  {day.sleepGuidance.monthLabel} guide
                  {comparison.actualOutsideGuideMinutes > 0 ? ` · ${formatDuration(comparison.actualOutsideGuideMinutes)} outside` : ''}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {isSelected ? <span className="rounded-full bg-sky-100 px-2 py-1 text-[12px] font-semibold text-sky-700">Selected</span> : null}
              {day.changed ? <span className="rounded-full bg-indigo-50 px-2 py-1 text-[12px] font-semibold text-indigo-700">Edited</span> : null}
            </div>
          </div>

          {editor ? <HistoryDayGrid day={day} editor={editor} disabled={disabled} /> : <div className="mt-3 space-y-2 rounded-[20px] border border-slate-100 bg-slate-50 p-2.5">
            <TimelineAxis />
            <TimelineLane label="Sleep" tone="sleep">
              <span className="absolute inset-x-1 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-100" />
              {guideSegments.map((segment) => {
                const left = getTimelinePercent(segment.startBlock);
                const width = ((segment.endBlock - segment.startBlock + 1) / 96) * 100;
                return (
                  <span
                    key={`${segment.status}-${segment.startBlock}-${segment.endBlock}`}
                    className={`absolute top-1/2 h-5 -translate-y-1/2 rounded-full ${
                      segment.status === 'expected' ? 'bg-sky-100' : 'bg-orange-100'
                    }`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                    title={getSleepGuidanceStatusLabel(segment.status)}
                  />
                );
              })}
              {sleepSummary.sessions.map((session) => {
                const left = getTimelinePercent(session.startBlock);
                const width = ((session.endBlock - session.startBlock + 1) / 96) * 100;
                const outsideGuide = getSleepGuidanceBlockStatus(session.startBlock, day.sleepGuidance) === 'awake';
                return (
                  <span
                    key={`${session.startBlock}-${session.endBlock}`}
                    className={`absolute top-1/2 z-10 h-4 -translate-y-1/2 rounded-full shadow-sm ${outsideGuide ? 'bg-violet-500' : 'bg-sky-600'}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                    title={`${session.startTime}-${session.endTime}`}
                  />
                );
              })}
            </TimelineLane>
            <TimelineLane label="Feed" tone="feed">
              {markers.feeds.length ? (
                markers.feeds.map((cluster) => <TimelineMarker key={cluster.id} cluster={cluster} />)
              ) : (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">No feeds</span>
              )}
            </TimelineLane>
          </div>}
        </article>
      );
    })}
  </div>
);

const SleepGrid = ({
  sleepBlocks,
  sleepGuidance = null,
  nextSleepGuidance = null,
  onSave,
  saving,
  history = false,
  sleepEntries = [],
  dateKey = '',
  onAddSleep,
  exactDisabled = false,
}) => {
  const initialSet = useMemo(() => normalizeSleepBlocks(sleepBlocks), [sleepBlocks]);
  const guidanceComparison = useMemo(() => (
    summarizeSleepGuidanceComparison({ sleepBlocks, sleepEntries, dateKey, guidance: sleepGuidance })
  ), [sleepBlocks, sleepEntries, dateKey, sleepGuidance]);
  const [draftSet, setDraftSet] = useState(initialSet);
  const dragModeRef = useRef(null);
  const lastDragIndexRef = useRef(null);
  const [guideChartOpen, setGuideChartOpen] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [localSaving, setLocalSaving] = useState(false);
  const savePendingRef = useRef(false);
  const busy = saving || localSaving;

  const saveDraft = async () => {
    if (busy || savePendingRef.current) return;
    savePendingRef.current = true;
    setLocalSaving(true);
    setSaveError('');
    setSaveStatus('');
    try {
      await onSave(new Set(draftSet));
      setSaveStatus('Sleep saved.');
    } catch (error) {
      setSaveError(error?.message || 'Unable to save sleep. Your changes are kept; try again.');
    } finally {
      savePendingRef.current = false;
      setLocalSaving(false);
    }
  };

  React.useEffect(() => {
    setDraftSet(initialSet);
    lastDragIndexRef.current = null;
    dragModeRef.current = null;
  }, [initialSet]);

  const applyBlock = (index, mode) => {
    if (busy) return;
    setDraftSet((previous) => {
      const next = new Set(previous);
      if (mode === 'asleep') next.add(index);
      if (mode === 'awake') next.delete(index);
      return next;
    });
  };
  const applyBlockRange = (fromIndex, toIndex, mode) => {
    if (busy) return;
    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    setDraftSet((previous) => {
      const next = new Set(previous);
      for (let index = start; index <= end; index += 1) {
        if (mode === 'asleep') next.add(index);
        if (mode === 'awake') next.delete(index);
      }
      return next;
    });
  };

  const startToggle = (index) => {
    if (busy) return;
    setSaveStatus('');
    const mode = draftSet.has(index) ? 'awake' : 'asleep';
    dragModeRef.current = mode;
    lastDragIndexRef.current = index;
    applyBlock(index, mode);
  };
  const stopToggle = () => {
    dragModeRef.current = null;
    lastDragIndexRef.current = null;
  };
  const continueToggle = (event) => {
    if (!dragModeRef.current) return;
    const index = getPointerSleepBlockIndex(event);
    if (index === null) return;
    applyBlockRange(lastDragIndexRef.current ?? index, index, dragModeRef.current);
    lastDragIndexRef.current = index;
  };
  const hourLabels = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="hidden text-[13px] text-slate-500 sm:block">{history ? 'Edit history' : 'Sleep pattern'}</p>
          <h2 className="text-[18px] font-semibold leading-6 text-slate-950 sm:mt-1">Sleep grid</h2>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block">Tap or drag 15-minute blocks. Compare expected sleep with actual sleep.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setGuideChartOpen(true)}
            className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Guide
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy}
            className="min-h-[44px] rounded-xl bg-sky-700 px-3 text-[13px] font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy ? 'Saving...' : 'Save sleep'}
          </button>
        </div>
      </div>
      {saveError ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{saveError}</p> : null}
      {saveStatus ? <p role="status" className="mt-2 text-sm font-semibold text-emerald-700">{saveStatus}</p> : null}
      {onAddSleep ? <button type="button" disabled={busy || exactDisabled} onClick={onAddSleep} className="mt-2 min-h-[44px] rounded-xl px-1 text-[14px] font-semibold text-sky-800 disabled:opacity-40">+ Add exact sleep & note</button> : null}
      <p className="mt-1 text-[13px] leading-5 text-slate-500">Grid marks are 15-minute estimates. Exact entries and notes stay separate.</p>

      {sleepGuidance && !history ? (
        <>
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 sm:hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-slate-600">
            <span className="font-semibold text-sky-800">{sleepGuidance.monthLabel} guide</span>
            <span>Recorded {formatDuration(guidanceComparison.actualMinutes)}</span>
            <span>Outside guide {formatDuration(guidanceComparison.actualOutsideGuideMinutes)}</span>
          </div>
        </div>
        <div className="mt-4 hidden gap-2 sm:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="rounded-[22px] border border-sky-100 bg-sky-50 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-700">{sleepGuidance.monthLabel} guidance</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{formatGuidanceDateRange(sleepGuidance)}</p>
              </div>
              {nextSleepGuidance && nextSleepGuidance.month !== sleepGuidance.month ? (
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-500 shadow-sm">
                  Next: {nextSleepGuidance.monthLabel} from {formatBabyDisplayDate(nextSleepGuidance.startDate)}
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700">Total {sleepGuidance.totalSleep || '-'}</div>
              <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700">Night {sleepGuidance.nightSleep || '-'}</div>
              <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700">Day {sleepGuidance.daySleep || '-'}</div>
              <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700">Naps {sleepGuidance.naps || '-'}</div>
            </div>
            <p className="mt-2 text-xs leading-5 text-sky-800">
              {sleepGuidance.sourceNote}
              {sleepGuidance.regression ? ` · ${sleepGuidance.regression}` : ''}
            </p>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[13px] font-semibold text-slate-600">Selected day vs guide</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700">
                Actual <span className="block text-base text-slate-950">{formatDuration(guidanceComparison.actualMinutes)}</span>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700">
                Expected guide <span className="block text-base text-slate-950">{formatDuration(guidanceComparison.expectedMinutes)}</span>
              </div>
              <div className="rounded-2xl bg-sky-100 px-3 py-2 text-xs font-bold text-sky-800">
                In guide <span className="block text-base">{formatDuration(guidanceComparison.actualInExpectedMinutes + guidanceComparison.actualInFlexibleMinutes)}</span>
              </div>
              <div className="rounded-2xl bg-violet-100 px-3 py-2 text-xs font-bold text-violet-800">
                Outside <span className="block text-base">{formatDuration(guidanceComparison.actualOutsideGuideMinutes)}</span>
              </div>
            </div>
          </div>
        </div>
        </>
      ) : null}

      <div className="sm:hidden"><PhoneSleepPicker asleepSet={draftSet} sleepGuidance={sleepGuidance} disabled={busy}
        onToggle={index => { setSaveStatus(''); applyBlock(index, draftSet.has(index) ? 'awake' : 'asleep'); }} /></div>

      <div className="mt-4 hidden select-none rounded-[24px] border border-slate-100 bg-slate-50 p-3 sm:block" onPointerCancel={stopToggle} onPointerLeave={stopToggle} onPointerMove={continueToggle} onPointerUp={stopToggle}>
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
            const guideStatus = getSleepGuidanceBlockStatus(index, sleepGuidance);
            const guideClass = asleep && guideStatus === 'awake'
              ? 'bg-violet-500 hover:bg-violet-600'
              : asleep
                ? 'bg-sky-600 hover:bg-sky-700'
                : guideStatus === 'expected'
                  ? 'bg-sky-100 hover:bg-sky-200'
                  : guideStatus === 'flexible'
                    ? 'bg-orange-100 hover:bg-orange-200'
                    : hour < 7 || hour >= 22
                      ? 'bg-indigo-50 hover:bg-sky-50'
                      : 'bg-white hover:bg-sky-50';
            return (
              <button
                key={index}
                type="button"
                data-sleep-block-index={index}
                disabled={busy}
                aria-label={`${getSleepBlockTimeLabel(index)} ${asleep ? 'asleep' : 'awake'}`}
                aria-pressed={asleep}
                title={`${getSleepBlockTimeLabel(index)} · ${getSleepGuidanceStatusLabel(guideStatus)}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  startToggle(index);
                }}
                onPointerEnter={() => {
                  if (dragModeRef.current) applyBlock(index, dragModeRef.current);
                }}
                onClick={(event) => {
                  if (event.detail === 0 && !busy) applyBlock(index, asleep ? 'awake' : 'asleep');
                }}
                className={`h-8 transition ${guideClass} ${index % 4 === 0 ? 'shadow-[inset_2px_0_0_rgba(15,23,42,0.34)]' : ''}`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1 text-[12px] font-medium text-slate-600 sm:hidden">
        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-sky-800">Expected</span>
        <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-800">Flexible</span>
        <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-white">Actual</span>
        <span className="rounded-full bg-violet-500 px-1.5 py-0.5 text-white">Outside</span>
      </div>
      <div className="mt-3 hidden flex-wrap gap-2 text-[11px] font-bold text-slate-500 sm:flex">
        <span className="rounded-full bg-slate-100 px-2 py-1">Desktop shows one 24h row</span>
        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">Pale blue = expected sleep</span>
        <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-800">Orange = flexible sleep</span>
        <span className="rounded-full bg-sky-600 px-2 py-1 text-white">Solid blue = actual asleep</span>
        <span className="rounded-full bg-violet-500 px-2 py-1 text-white">Violet = actual outside guide</span>
        <span className="rounded-full bg-white px-2 py-1">White = awake</span>
        <span className={`rounded-full px-2 py-1 ${CARE_MARKER_STYLES.F.chip}`}>F = feed</span>
      </div>
      {guideChartOpen ? (
        <SleepGuideChartModal onClose={() => setGuideChartOpen(false)} />
      ) : null}
    </section>
  );
};

const PatternPanel = ({
  birthDate,
  dateKeys,
  feeds,
  nappies,
  patternRange,
  rangeLabel,
  rangeLoading,
  rangeError,
  onRetryRange,
  selectedDate,
  setPatternRange,
  sleepBlocks,
  onSaveHistory,
  saving,
  sleepEntries = [],
  onAddSleep,
  onEditSleep,
  exactDisabled = false,
}) => {
  const [editSession, setEditSession] = useState(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [attemptedCells, setAttemptedCells] = useState(new Set());
  const savePendingRef = useRef(false);
  const editButtonRef = useRef(null);
  const dragRef = useRef(null);
  const busy = saving || savingDraft;
  const closeEditor = (reload = false) => {
    dragRef.current = null;
    setEditSession(null);
    setAttemptedCells(new Set());
    setSaveError('');
    if (reload && attemptedCells.size) void onRetryRange?.();
    requestAnimationFrame(() => editButtonRef.current?.focus?.());
  };
  const startEditing = () => {
    setSavedMessage('');
    setSaveError('');
    setAttemptedCells(new Set());
    setEditSession({ rangeLabel, days: patternDays.map((day) => ({ ...day,
      original: normalizeSleepBlocks(day.sleepBlocks), draft: normalizeSleepBlocks(day.sleepBlocks) })) });
  };
  const feedsByDate = useMemo(() => groupByDate(feeds, 'localDate'), [feeds]);
  const nappiesByDate = useMemo(() => groupByDate(nappies, 'localDate'), [nappies]);
  const sleepByDate = useMemo(() => groupByDate(sleepBlocks, 'sleepDate'), [sleepBlocks]);

  const patternDays = useMemo(() => dateKeys.map((dateKey) => {
    const dayFeeds = feedsByDate[dateKey] || [];
    const dayNappies = nappiesByDate[dateKey] || [];
    const daySleep = sleepByDate[dateKey] || [];
    const sleepGuidance = getBabySleepGuidanceForDate({ birthDate, dateKey });
    return {
      dateKey,
      summary: summarizeBabyDay({ feeds: dayFeeds, nappies: dayNappies, sleepBlocks: daySleep, sleepEntries, dateKey }),
      feeds: dayFeeds,
      nappies: dayNappies,
      sleepBlocks: daySleep,
      sleepEntries,
      sleepGuidance,
    };
  }), [birthDate, dateKeys, feedsByDate, nappiesByDate, sleepByDate, sleepEntries]);

  const changes = useMemo(() => (editSession?.days || []).flatMap((day) => Array.from({ length: 96 }, (_, blockIndex) => (
    day.original.has(blockIndex) === day.draft.has(blockIndex) && !attemptedCells.has(`${day.dateKey}:${blockIndex}`) ? null
      : { dateKey: day.dateKey, blockIndex, status: day.draft.has(blockIndex) ? 'asleep' : 'awake' }
  )).filter(Boolean)), [attemptedCells, editSession]);
  const changedDates = useMemo(() => new Set(changes.map((change) => change.dateKey)), [changes]);
  const displayedDays = useMemo(() => editSession ? editSession.days.map((day) => {
    const blocks = [...day.draft].map((blockIndex) => ({ blockIndex, status: 'asleep' }));
    return { ...day, sleepBlocks: blocks, sleepEntries, changed: changedDates.has(day.dateKey),
      summary: summarizeBabyDay({ feeds: day.feeds, nappies: day.nappies, sleepBlocks: blocks, sleepEntries, dateKey: day.dateKey }) };
  }) : patternDays, [changedDates, editSession, patternDays, sleepEntries]);
  const paint = (dateKey, from, to, asleep) => {
    if (busy || savePendingRef.current) return;
    setEditSession((session) => session ? { ...session, days: session.days.map((day) => {
      if (day.dateKey !== dateKey) return day;
      const draft = new Set(day.draft);
      for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) {
        if (asleep) draft.add(index); else draft.delete(index);
      }
      return { ...day, draft };
    }) } : session);
  };
  const editor = editSession ? {
    paint,
    toggle: (dateKey, index) => paint(dateKey, index, index, !editSession.days.find((day) => day.dateKey === dateKey)?.draft.has(index)),
    start: (dateKey, index) => {
      if (busy || savePendingRef.current) return;
      const asleep = !editSession.days.find((day) => day.dateKey === dateKey)?.draft.has(index);
      dragRef.current = { dateKey, index, asleep };
      paint(dateKey, index, index, asleep);
    },
  } : null;
  const continueDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || busy) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target?.closest?.('[data-history-date]')?.dataset.historyDate !== drag.dateKey) return;
    const index = getPointerSleepBlockIndex(event);
    if (index === null) return;
    paint(drag.dateKey, drag.index, index, drag.asleep);
    drag.index = index;
  };
  const saveChanges = async () => {
    if (!changes.length || busy || savePendingRef.current) return;
    savePendingRef.current = true;
    dragRef.current = null;
    setSavingDraft(true);
    setSaveError('');
    // An unsuccessful acknowledgement can follow a committed write. Keep every
    // attempted cell pending even if the user changes it back to its baseline.
    setAttemptedCells((previous) => new Set([...previous, ...changes.map((change) => `${change.dateKey}:${change.blockIndex}`)]));
    try {
      await onSaveHistory(changes);
      setSavedMessage(`Sleep saved for ${changedDates.size} ${changedDates.size === 1 ? 'day' : 'days'}.`);
      closeEditor();
    } catch (error) {
      setSaveError(`${error?.message || 'Unable to save sleep history.'} Your edits are kept.`);
    } finally {
      savePendingRef.current = false;
      setSavingDraft(false);
    }
  };
  useEffect(() => {
    if (!changes.length || typeof window === 'undefined') return undefined;
    const warnBeforeLeaving = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [changes.length]);
  const rangeTotals = useMemo(() => displayedDays.reduce((totals, day) => ({
    feeds: totals.feeds + day.summary.feedCount,
    feedMinutes: totals.feedMinutes + day.summary.totalFeedMinutes,
    sleepMinutes: totals.sleepMinutes + day.summary.sleep.totalMinutes,
  }), { feeds: 0, feedMinutes: 0, sleepMinutes: 0 }), [displayedDays]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5" onPointerMove={continueDrag}
      onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onPointerLeave={() => { dragRef.current = null; }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[18px] font-semibold text-slate-950">Sleep history</h2>
          <p className="mt-1 text-[13px] text-slate-500">{editSession?.rangeLabel || rangeLabel}</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-600">{editSession ? 'Change marks across dates, then save once. On a phone, choose an hour and tap each 15-minute slot.' : 'Review several days, edit grid estimates or add exact times and notes.'}</p>
        </div>
        <button ref={editButtonRef} type="button" onClick={startEditing} disabled={Boolean(editSession) || rangeLoading || Boolean(rangeError) || busy}
          className="min-h-[44px] shrink-0 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-[14px] font-bold text-indigo-700 disabled:opacity-40">Edit history</button>
      </div>
      {onAddSleep ? <button type="button" disabled={busy || Boolean(editSession) || exactDisabled} onClick={onAddSleep} className="mt-3 min-h-[44px] rounded-xl border border-sky-200 bg-sky-50 px-3 text-[14px] font-semibold text-sky-800 disabled:opacity-40">+ Add sleep</button> : null}
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 sm:flex-wrap">
          {PATTERN_RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPatternRange(option.value)}
              disabled={Boolean(editSession) || busy}
              className={`min-h-[44px] shrink-0 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                patternRange === option.value
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

      {savedMessage ? <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{savedMessage}</p> : null}
      {editSession ? (
        <div className="sticky top-0 z-20 mt-4 rounded-2xl border border-indigo-200 bg-white/95 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-sm font-semibold text-slate-700">{changedDates.size ? `${changedDates.size} ${changedDates.size === 1 ? 'day' : 'days'} edited` : 'No changes yet'}</p>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} onClick={() => closeEditor(true)} className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-bold text-slate-600 disabled:opacity-40">Cancel</button>
              <button type="button" disabled={busy || !changes.length} onClick={saveChanges} className="pm-toolbar-primary min-h-[44px] rounded-xl px-4 text-[14px] font-bold text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save changes'}</button>
            </div>
          </div>
          {saveError ? <p role="alert" className="mt-2 text-sm text-rose-700">{saveError}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-sky-50 px-2 py-2 text-[13px] font-semibold text-sky-800">{formatDuration(rangeTotals.sleepMinutes)} sleep</div>
        <div className="rounded-xl bg-rose-50 px-2 py-2 text-[13px] font-semibold text-rose-800">{rangeTotals.feeds} feeds</div>
        <div className="rounded-xl bg-slate-50 px-2 py-2 text-[13px] font-semibold text-slate-700">{formatDuration(rangeTotals.feedMinutes)} feeding</div>
      </div>

      {!editSession && rangeError ? (
        <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p>{rangeError} Reload history before editing a day.</p>
          <button type="button" onClick={onRetryRange} className="mt-2 min-h-11 rounded-xl border border-rose-200 bg-white px-3 font-bold">Retry history</button>
        </div>
      ) : !editSession && rangeLoading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-semibold text-slate-500">
          Loading pattern...
        </div>
      ) : (
        <div className="mt-4">
          <div className="sm:hidden">
            <MobilePatternTimeline days={displayedDays} selectedDate={selectedDate} editor={editor} disabled={busy} />
          </div>
          <div className="hidden sm:block">
            <SleepMatrix days={displayedDays} selectedDate={selectedDate} editor={editor} disabled={busy} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-medium text-slate-600">
            <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">Pale blue = expected sleep</span>
            <span className="rounded-full bg-orange-100 px-2 py-1 text-orange-800">Orange = flexible sleep</span>
            <span className="rounded-full bg-sky-600 px-2 py-1 text-white">Solid blue = actual asleep</span>
            <span className="rounded-full bg-violet-500 px-2 py-1 text-white">Violet = actual outside guide</span>
            <span className={`rounded-full px-2 py-1 ${CARE_MARKER_STYLES.F.chip}`}>F = feed</span>
          </div>
        </div>
      )}
      {onEditSleep ? <SleepEntryList entries={sleepEntries.filter(entry => dateKeys.some(date => sleepEntryIntervalForDay(entry, date)))} onEdit={onEditSleep} disabled={busy || Boolean(editSession) || exactDisabled} title="History · exact sleep & notes" /> : null}
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
    householdProject,
    latestWeight,
    loadRangeData,
    loading,
    nappies,
    rangeFeeds,
    rangeError,
    rangeLoading,
    rangeNappies,
    rangeSleepBlocks,
    refresh,
    saveSleepBlocks,
    saveSleepHistory,
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
  const [shareOpen, setShareOpen] = useState(false);
  const [weightModalOpen, setWeightModalOpen] = useState(false);
  const [sleepModal, setSleepModal] = useState(null);
  const sleepScope = `${currentUserId}:${babyProfile?.id}`;
  const patternWindow = useMemo(() => getPatternRange(patternRange, selectedDate), [patternRange, selectedDate]);
  const exactSleep = useBabySleepEntries({ currentUserId, babyId: babyProfile?.id, startDate: patternWindow.startDate, endDate: patternWindow.endDate, revision: dayVersion });
  const sleepEntries = exactSleep.entries;
  const exactDisabled = !exactSleep.available || exactSleep.loading || Boolean(exactSleep.error) || saving;
  const openSleep = entry => setSleepModal({ scope: sleepScope, entry: entry || null, dateKey: selectedDate });

  const daySummary = useMemo(() => summarizeBabyDay({ feeds, nappies, sleepBlocks, sleepEntries, dateKey: selectedDate, latestWeight }), [feeds, latestWeight, nappies, sleepBlocks, sleepEntries, selectedDate]);
  const guidanceBirthDate = babyProfile?.birthDate || '';
  const sleepGuidance = useMemo(() => (
    getBabySleepGuidanceForDate({ birthDate: guidanceBirthDate, dateKey: selectedDate })
  ), [guidanceBirthDate, selectedDate]);
  const nextSleepGuidance = useMemo(() => (
    getNextBabySleepGuidanceForDate({ birthDate: guidanceBirthDate, dateKey: selectedDate })
  ), [guidanceBirthDate, selectedDate]);
  const householdMembers = useMemo(() => (
    Array.isArray(householdProject?.project_members) ? householdProject.project_members : []
  ), [householdProject?.project_members]);
  const householdIsShared = householdMembers.length > 0;
  const canManageHouseholdSharing = Boolean(householdProject?.isOwned);
  const sharingStatusLabel = householdIsShared
    ? `Shared with ${householdMembers.length}`
    : 'Private dashboard';
  const sharingActionLabel = canManageHouseholdSharing ? 'Manage sharing' : 'View access';
  const activityLog = useMemo(() => buildBabyActivityLog({ feeds, nappies, sleepBlocks, sleepEntries, dateKey: selectedDate }), [feeds, nappies, sleepBlocks, sleepEntries, selectedDate]);
  const latestActivity = activityLog[activityLog.length - 1] || null;
  const latestActivityTime = latestActivity
    ? (latestActivity.type === 'sleep' ? latestActivity.raw.startTime : formatDateTime(latestActivity.occurredAt))
    : '';
  const latestActivityExtra = latestActivity?.type === 'feed' && latestActivity.raw.breastSide
    ? formatBreastSide(latestActivity.raw.breastSide)
    : latestActivity?.detail || '';
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
    <div className="mx-auto w-full max-w-[1800px] px-3 py-3 sm:px-5 sm:py-6 2xl:px-8">
      <div className="min-w-0 sm:rounded-[24px] sm:border sm:border-slate-200 sm:bg-white sm:p-6 2xl:p-7">
        <div className="hidden flex-col gap-3 sm:flex sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="pm-kicker">Baby</p>
            <h1 className="mt-1 text-2xl font-black tracking-[-0.06em] text-slate-950 sm:mt-2 sm:text-5xl">
              Daily care
            </h1>
            <p className="mt-3 hidden max-w-2xl text-sm leading-6 text-slate-500 sm:block">
              Track sleep, feeds, and weight in one gentle daily view.
            </p>
          </div>
          <DateControls
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            goToPreviousDay={goToPreviousDay}
            goToNextDay={goToNextDay}
            goToToday={goToToday}
            today={today}
          />
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}
        {babyProfile && exactSleep.error ? <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>{exactSleep.error} Displayed totals retain the last loaded information.</p><button type="button" onClick={exactSleep.refresh} disabled={exactSleep.loading} className="mt-2 min-h-[44px] rounded-lg border border-amber-300 bg-white px-3 font-semibold">Retry exact sleep & notes</button></div> : null}

        {!babyProfile ? (
          <BabySetupCard onCreate={createBabyProfile} saving={saving} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 sm:mt-6">
              <div className="min-w-0">
                <h2 className="truncate text-[20px] font-semibold tracking-tight text-slate-950">{babyProfile.name}</h2>
                <p className="mt-1 text-[13px] leading-5 text-slate-500">
                  {formatBabyDisplayDate(selectedDate)} · {sleepGuidance.monthLabel} sleep guide
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                disabled={!householdProject}
                aria-label={sharingActionLabel}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className={`hidden rounded-full px-2 py-1 sm:inline ${householdIsShared ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {sharingStatusLabel}
                </span>
                <span className="hidden text-slate-400 sm:inline">Shared access</span>
                <span className="hidden text-indigo-600 sm:inline">{householdProject ? sharingActionLabel : 'Open groceries to share'}</span>
                <span className="sm:hidden">Sharing</span>
              </button>
            </div>
            <div className="mt-3 sm:hidden"><DateControls compact selectedDate={selectedDate} setSelectedDate={setSelectedDate} goToPreviousDay={goToPreviousDay} goToNextDay={goToNextDay} goToToday={goToToday} today={today} /></div>

            <section aria-label="Daily overview" className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-[18px] font-semibold text-slate-950">Daily overview</h2>
                  {latestActivity ? (
                    <p className="mt-1 text-[13px] leading-5 text-slate-500">
                      Last: {latestActivityTime} · {latestActivity.label}{latestActivityExtra ? ` · ${latestActivityExtra}` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-slate-500">No entries for this day yet.</p>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setFeedModal({ dateKey: selectedDate })} className="min-h-[48px] rounded-xl border border-rose-200 bg-rose-50 px-3 text-[14px] font-semibold text-rose-800">+ Add feed</button><button type="button" disabled={exactDisabled || exactSleep.saving} onClick={() => openSleep()} className="min-h-[48px] rounded-xl border border-sky-200 bg-sky-50 px-3 text-[14px] font-semibold text-sky-800 disabled:opacity-40">+ Add sleep</button></div>
              <div className="mt-3 flex flex-wrap items-center gap-2"><span className="w-full text-[13px] text-slate-500 sm:w-auto">Breastfeed shortcuts</span><button type="button" onClick={() => setFeedModal({ dateKey: selectedDate, feedType: 'breastfeeding', breastSide: 'left', durationMinutes: 20 })} className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-rose-800 sm:flex-none">Left breast</button><button type="button" onClick={() => setFeedModal({ dateKey: selectedDate, feedType: 'breastfeeding', breastSide: 'right', durationMinutes: 20 })} className="min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-rose-800 sm:flex-none">Right breast</button></div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <SummaryCard label="Feeds" value={daySummary.feedCount} detail={`${formatDuration(daySummary.totalFeedMinutes)} total · ${daySummary.averageFeedMinutes} min average`} tone="rose" />
                <SummaryCard label="Sleep" value={formatDuration(daySummary.sleep.totalMinutes)} detail={`${daySummary.sleep.sessionCount} ${daySummary.sleep.sessionCount === 1 ? 'session' : 'sessions'}`} tone="sky" />
                <div className="hidden sm:block"><SummaryCard label="Avg feed" value={`${daySummary.averageFeedMinutes}m`} detail="per feed" tone="slate" /></div>
                <div className="hidden sm:block"><SummaryCard label="Weight" value={latestWeight?.weightValue ? `${latestWeight.weightValue}${latestWeight.weightUnit}` : '—'} detail={latestWeight?.measuredAt || 'optional'} tone="slate" /></div>
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold text-slate-950">Daily activity</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActivityExpanded((current) => !current)}
                  className="min-h-[44px] shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  disabled={activityLog.length === 0}
                  aria-expanded={activityExpanded}
                >
                  {activityExpanded ? 'Minimise' : 'Show log'}
                </button>
              </div>

              <p className="mt-1 text-[13px] text-slate-500">{activityLog.length ? `${activityLog.length} ${activityLog.length === 1 ? 'event' : 'events'} logged for this day` : 'No events for this day yet.'}</p>

              {activityExpanded ? (
                <div className="mt-3 space-y-2">
                  {activityLog.map((event) => (
                    <div key={event.id} className={`rounded-2xl border px-3 py-3 ${event.type === 'sleep' ? 'border-sky-100 bg-sky-50/60' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold text-slate-900">
                            {event.type === 'sleep' ? event.raw.startTime : formatDateTime(event.occurredAt)} · {event.label}
                          </div>
                          <div className="mt-0.5 text-[13px] leading-5 text-slate-600">{event.detail}</div>
                          {event.type === 'feed' && event.raw.breastSide ? (
                            <div className="mt-1 text-xs font-semibold text-rose-600">{formatBreastSide(event.raw.breastSide)}</div>
                          ) : null}
                        </div>
                        {event.type === 'feed' ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setFeedModal({ ...event.raw, dateKey: selectedDate })} className="min-h-[44px] rounded-lg px-3 text-[14px] font-semibold text-slate-600">Edit</button>
                            <button type="button" onClick={() => void deleteFeed(event.sourceId)} className="min-h-[44px] rounded-lg px-3 text-[14px] font-semibold text-rose-700">Delete</button>
                          </div>
                        ) : event.type === 'nappy' ? (
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setNappyModal({ ...event.raw, dateKey: selectedDate })} className="min-h-[44px] rounded-lg px-3 text-[14px] font-semibold text-slate-600">Edit</button>
                            <button type="button" onClick={() => void deleteNappy(event.sourceId)} className="min-h-[44px] rounded-lg px-3 text-[14px] font-semibold text-rose-700">Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <div className="mt-4">
              <SleepGrid
                key={`${currentUserId}:${babyProfile.id}`}
                feeds={feeds}
                nappies={nappies}
                sleepBlocks={sleepBlocks}
                sleepGuidance={sleepGuidance}
                nextSleepGuidance={nextSleepGuidance}
                onSave={saveSleepBlocks}
                saving={saving || exactSleep.saving}
                dateKey={selectedDate} sleepEntries={sleepEntries}
                onAddSleep={() => openSleep()} exactDisabled={exactDisabled}
              />
              <SleepEntryList entries={sleepEntries.filter(entry => sleepEntryIntervalForDay(entry, selectedDate))} onEdit={openSleep} disabled={exactDisabled || exactSleep.saving} />
            </div>

            <div className="mt-5 space-y-5">
              <PatternPanel
                key={`${currentUserId}:${babyProfile.id}`}
                birthDate={guidanceBirthDate}
                dateKeys={patternDateKeys}
                feeds={rangeFeeds}
                nappies={rangeNappies}
                patternRange={patternRange}
                rangeLabel={rangeLabel}
                rangeLoading={rangeLoading}
                rangeError={rangeError}
                onRetryRange={() => loadRangeData(patternWindow)}
                selectedDate={selectedDate}
                setPatternRange={setPatternRange}
                sleepBlocks={rangeSleepBlocks}
                onSaveHistory={saveSleepHistory}
                saving={saving || exactSleep.saving}
                sleepEntries={sleepEntries} onAddSleep={() => openSleep()} onEditSleep={openSleep} exactDisabled={exactDisabled}
              />

              <aside className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
                  <div className="flex items-center justify-between gap-3"><h2 className="text-[18px] font-semibold text-slate-950">Weight records</h2><button type="button" onClick={() => setWeightModalOpen(true)} className="min-h-[44px] shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-700">+ Add weight</button></div>
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
          dateKey={feedModal.dateKey || selectedDate}
          feed={feedModal}
          saving={saving}
          onClose={() => setFeedModal(null)}
          onSave={async (payload) => {
            if (feedModal.id) {
              await updateFeed(feedModal.id, { ...payload, dateKey: feedModal.dateKey || selectedDate });
            } else {
              await addFeed({ ...payload, dateKey: feedModal.dateKey || selectedDate });
            }
            setFeedModal(null);
          }}
        />
      ) : null}

      {nappyModal ? (
        <NappyModal
          dateKey={nappyModal.dateKey || selectedDate}
          nappy={nappyModal}
          saving={saving}
          onClose={() => setNappyModal(null)}
          onSave={async (payload) => {
            if (nappyModal.id) {
              await updateNappy(nappyModal.id, { ...payload, dateKey: nappyModal.dateKey || selectedDate });
            } else {
              await addNappy({ ...payload, dateKey: nappyModal.dateKey || selectedDate });
            }
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
      {sleepModal?.scope === sleepScope ? <SleepEntryEditor key={`${sleepScope}:${sleepModal.entry?.id || 'new'}`} entry={sleepModal.entry} dateKey={sleepModal.dateKey}
        disabled={saving} onClose={() => setSleepModal(null)} onSave={async (entry, archive) => {
          const saved = await exactSleep.save(entry, archive);
          if (!archive) setSelectedDate(saved.sleepDate);
        }} /> : null}

      <ProjectShareModal
        care
        isOpen={shareOpen && Boolean(householdProject)}
        readOnly={!canManageHouseholdSharing}
        project={householdProject}
        onClose={() => setShareOpen(false)}
        onMembershipChanged={refresh}
      />
    </div>
  );
}
