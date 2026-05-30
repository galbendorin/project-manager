import React, { useEffect, useMemo, useState } from 'react';
import { useWeightData } from '../hooks/useWeightData';
import {
  convertWeightFromKg,
  formatWeightDisplayDate,
  formatWeightValue,
  getWeightTodayKey,
  normalizeWeightUnit,
  roundWeight,
  WEIGHT_UNITS,
} from '../utils/weightTracker';

const formatDelta = (deltaKg, unit = 'kg') => {
  if (deltaKg === null || deltaKg === undefined || !Number.isFinite(Number(deltaKg))) return '-';
  const converted = convertWeightFromKg(Math.abs(deltaKg), unit);
  if (!converted) return '-';
  const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '-' : '';
  return `${sign}${roundWeight(converted, 1)} ${normalizeWeightUnit(unit)}`;
};

const getTrendTone = (deltaKg) => {
  if (!Number.isFinite(Number(deltaKg)) || Math.abs(Number(deltaKg)) < 0.05) return 'text-slate-600';
  return Number(deltaKg) < 0 ? 'text-emerald-700' : 'text-amber-700';
};

const MetricCard = ({ label, value, detail, tone = 'text-slate-950' }) => (
  <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
    <div className={`mt-1 text-2xl font-black ${tone}`}>{value}</div>
    {detail ? <div className="mt-1 text-xs font-semibold text-slate-500">{detail}</div> : null}
  </div>
);

const WeightTrendChart = ({ buckets = [], unit = 'kg' }) => {
  const values = buckets
    .map((bucket, index) => ({ ...bucket, index, displayValue: convertWeightFromKg(bucket.averageKg, unit) }))
    .filter((bucket) => Number.isFinite(bucket.displayValue));

  if (values.length < 2) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
        Add two or more entries to see your trend.
      </div>
    );
  }

  const minValue = Math.min(...values.map((point) => point.displayValue));
  const maxValue = Math.max(...values.map((point) => point.displayValue));
  const range = Math.max(1, maxValue - minValue);
  const points = values.map((point) => {
    const x = 28 + ((point.index / Math.max(1, buckets.length - 1)) * 304);
    const y = 144 - (((point.displayValue - minValue) / range) * 104);
    return { ...point, x, y };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="pm-kicker">Trend</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">12-week average</h2>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {roundWeight(minValue, 1)} - {roundWeight(maxValue, 1)} {unit}
        </div>
      </div>

      <svg viewBox="0 0 360 172" role="img" aria-label="Weight trend chart" className="mt-4 h-48 w-full overflow-visible">
        <line x1="28" y1="144" x2="332" y2="144" stroke="#e2e8f0" strokeWidth="2" />
        <line x1="28" y1="40" x2="332" y2="40" stroke="#eef2f7" strokeWidth="2" />
        <polyline points={linePoints} fill="none" stroke="var(--pm-accent,#7c3aed)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.start}>
            <circle cx={point.x} cy={point.y} r="6" fill="white" stroke="var(--pm-accent,#7c3aed)" strokeWidth="4" />
            {point.index === points[0].index || point.index === points[points.length - 1].index ? (
              <text x={point.x} y={point.y - 14} textAnchor="middle" className="fill-slate-500 text-[11px] font-bold">
                {roundWeight(point.displayValue, 1)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
};

const WeightLogForm = ({ defaultUnit, onSave, saving, today }) => {
  const [measuredOn, setMeasuredOn] = useState(today || getWeightTodayKey());
  const [weightValue, setWeightValue] = useState('');
  const [weightUnit, setWeightUnit] = useState(defaultUnit || 'kg');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setWeightUnit(defaultUnit || 'kg');
  }, [defaultUnit]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    try {
      await onSave({ measuredOn, weightValue, weightUnit, note });
      setWeightValue('');
      setNote('');
      setMeasuredOn(today || getWeightTodayKey());
    } catch (nextError) {
      setFormError(nextError?.message || 'Unable to save weight.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="pm-kicker">Quick log</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Today&apos;s weight</h2>
        </div>
        <button
          type="submit"
          disabled={saving || !weightValue}
          className="pm-toolbar-primary rounded-2xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_110px]">
        <input
          type="date"
          value={measuredOn}
          onChange={(event) => setMeasuredOn(event.target.value || today)}
          className="pm-input rounded-2xl px-4 py-3 text-base font-semibold text-slate-950 sm:text-sm"
        />
        <input
          inputMode="decimal"
          value={weightValue}
          onChange={(event) => setWeightValue(event.target.value)}
          placeholder="Weight"
          enterKeyHint="done"
          className="pm-input rounded-2xl px-4 py-3 text-base font-semibold text-slate-950 placeholder:text-slate-400"
        />
        <select
          value={weightUnit}
          onChange={(event) => setWeightUnit(event.target.value)}
          className="pm-input rounded-2xl px-4 py-3 text-base font-semibold text-slate-950 sm:text-sm"
        >
          {WEIGHT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note"
        className="pm-input mt-3 w-full rounded-2xl px-4 py-3 text-base text-slate-950 placeholder:text-slate-400 sm:text-sm"
      />
      {formError ? <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</div> : null}
    </form>
  );
};

const WeightGoalForm = ({ settings, onSaveSettings, saving }) => {
  const [preferredUnit, setPreferredUnit] = useState(settings.preferredUnit || 'kg');
  const [goalWeightValue, setGoalWeightValue] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unit = settings.preferredUnit || 'kg';
    setPreferredUnit(unit);
    const convertedGoal = settings.goalWeightKg ? convertWeightFromKg(settings.goalWeightKg, unit) : '';
    setGoalWeightValue(convertedGoal ? String(roundWeight(convertedGoal, 1)) : '');
  }, [settings.goalWeightKg, settings.preferredUnit]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      await onSaveSettings({ preferredUnit, goalWeightValue });
      setMessage('Goal saved.');
    } catch (nextError) {
      setMessage(nextError?.message || 'Unable to save goal.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="pm-kicker">Goal</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Target weight</h2>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="pm-subtle-button rounded-2xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          Save goal
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
        <input
          inputMode="decimal"
          value={goalWeightValue}
          onChange={(event) => setGoalWeightValue(event.target.value)}
          placeholder="Optional target"
          className="pm-input rounded-2xl px-4 py-3 text-base font-semibold text-slate-950 placeholder:text-slate-400"
        />
        <select
          value={preferredUnit}
          onChange={(event) => setPreferredUnit(event.target.value)}
          className="pm-input rounded-2xl px-4 py-3 text-base font-semibold text-slate-950 sm:text-sm"
        >
          {WEIGHT_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
      </div>
      {message ? <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{message}</div> : null}
    </form>
  );
};

const RecentEntries = ({ entries, onDeleteEntry, saving, unit }) => {
  const [deleteError, setDeleteError] = useState('');

  if (!entries.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-semibold text-slate-500">
        No weight entries yet.
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="pm-kicker">History</p>
          <h2 className="mt-1 text-lg font-black text-slate-950">Recent entries</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
          {entries.length}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {entries.slice(0, 30).map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-black text-slate-950">{formatWeightDisplayDate(entry.measuredOn)}</div>
              {entry.note ? <div className="mt-1 truncate text-xs font-semibold text-slate-500">{entry.note}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="text-right text-base font-black text-slate-950">{formatWeightValue(entry.weightKg, unit)}</div>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (!window.confirm('Delete this weight entry?')) return;
                  setDeleteError('');
                  try {
                    await onDeleteEntry(entry.id);
                  } catch (nextError) {
                    setDeleteError(nextError?.message || 'Unable to delete entry.');
                  }
                }}
                className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {deleteError ? <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{deleteError}</div> : null}
    </div>
  );
};

export default function WeightTrackerView({ currentUserId }) {
  const {
    deleteEntry,
    entries,
    error,
    loading,
    refresh,
    saveEntry,
    saveSettings,
    saving,
    settings,
    summary,
    today,
  } = useWeightData({ currentUserId });
  const unit = settings.preferredUnit || 'kg';
  const latestValue = summary.latest ? formatWeightValue(summary.latest.weightKg, unit) : '-';
  const previousDelta = formatDelta(summary.changeSincePreviousKg, unit);
  const weekAverage = summary.weekAverageKg ? formatWeightValue(summary.weekAverageKg, unit) : '-';
  const goalRemaining = summary.goalRemainingKg !== null && summary.goalRemainingKg !== undefined
    ? formatDelta(summary.goalRemainingKg, unit)
    : '-';

  const goalDetail = useMemo(() => {
    if (!settings.goalWeightKg) return 'Set a goal when ready';
    if (summary.goalProgress === null) return 'Goal saved';
    return `${summary.goalProgress}% of starting gap`;
  }, [settings.goalWeightKg, summary.goalProgress]);

  if (loading) {
    return <div className="flex min-h-[420px] items-center justify-center text-sm font-semibold text-slate-500">Loading Weight Tracker...</div>;
  }

  return (
    <div className="min-h-[calc(100dvh-84px)] bg-[var(--pm-page-bg,#f8fafc)] px-3 py-4 text-slate-900 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl pb-24">
        <div className="rounded-[30px] border border-slate-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="pm-kicker">Weight Tracker</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">Log, trend, adjust</h1>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="pm-subtle-button rounded-2xl px-4 py-2.5 text-sm font-bold"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Latest" value={latestValue} detail={summary.latest ? formatWeightDisplayDate(summary.latest.measuredOn) : 'No entry yet'} />
            <MetricCard label="Last change" value={previousDelta} detail="Since previous entry" tone={getTrendTone(summary.changeSincePreviousKg)} />
            <MetricCard label="7-day average" value={weekAverage} detail={`${summary.count} total entries`} />
            <MetricCard label="To goal" value={goalRemaining} detail={goalDetail} tone={getTrendTone(summary.goalRemainingKg)} />
          </div>
          <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
            Private to your account. Household access gates the tool, but your weight rows are user-only.
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <WeightLogForm defaultUnit={unit} onSave={saveEntry} saving={saving} today={today} />
            <WeightTrendChart buckets={summary.trendBuckets} unit={unit} />
          </div>
          <div className="space-y-4">
            <WeightGoalForm settings={settings} onSaveSettings={saveSettings} saving={saving} />
            <RecentEntries entries={entries} onDeleteEntry={deleteEntry} saving={saving} unit={unit} />
          </div>
        </div>
      </div>
    </div>
  );
}
