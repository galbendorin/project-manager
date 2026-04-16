import React from 'react';
import { formatDate } from '../utils/helpers';

export default function MobileQuickCapture({
  isOpen,
  mode,
  value,
  saving,
  isOnline,
  projectName,
  statusMessage,
  routeLabel,
  routeDestination,
  routeReason,
  routeBreakdown,
  routeConfidenceLabel,
  routeDueDate,
  routeOwnerText,
  onOpen,
  onClose,
  onModeChange,
  onValueChange,
  onSubmit,
}) {
  return (
    <>
      <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] right-4 z-30 flex md:hidden">
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--pm-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.32)] transition hover:brightness-95"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-lg leading-none">
              +
            </span>
            Capture
          </button>
          {statusMessage ? (
            <div className="mt-2 max-w-[220px] rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] leading-5 text-slate-600 shadow-[0_14px_30px_rgba(15,23,42,0.14)] backdrop-blur">
              {statusMessage}
            </div>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close quick capture"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-4 shadow-[0_-18px_40px_rgba(15,23,42,0.18)]">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-200" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Quick capture
                </div>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  Save it before you forget it
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Adds to <span className="font-medium text-slate-700">{projectName}</span>
                  {isOnline ? '.' : ' and keeps it queued until you reconnect.'}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => onModeChange('smart')}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === 'smart'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Smart
              </button>
              <button
                type="button"
                onClick={() => onModeChange('task')}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === 'task'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Task
              </button>
              <button
                type="button"
                onClick={() => onModeChange('action')}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === 'action'
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Action
              </button>
            </div>

            {mode === 'smart' ? (
              <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">
                    Smart route
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {routeConfidenceLabel ? (
                      <span className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {routeConfidenceLabel}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      {routeDestination}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {routeLabel}
                </p>
                {routeReason ? (
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {routeReason}
                  </p>
                ) : null}
                {routeBreakdown ? (
                  <p className="mt-1 text-xs leading-5 text-indigo-700">
                    Will split into {routeBreakdown}.
                  </p>
                ) : null}
              </div>
            ) : null}

            {routeDueDate || routeOwnerText ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {routeDueDate ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Due {formatDate(routeDueDate)}
                  </span>
                ) : null}
                {routeOwnerText ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Owner {routeOwnerText}
                  </span>
                ) : null}
              </div>
            ) : null}

            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {mode === 'smart'
                    ? `${routeLabel} text`
                    : mode === 'action'
                      ? 'Action description'
                      : 'Task title'}
                </span>
                <textarea
                  autoFocus
                  value={value}
                  onChange={(event) => onValueChange(event.target.value)}
                  placeholder={
                    mode === 'smart'
                      ? 'Try “risk: supplier delay by Friday” or “chase sign-off tomorrow for me”'
                      : mode === 'action'
                        ? 'Follow up on client note tomorrow'
                        : 'Remember to update the RAID log'
                  }
                  rows={3}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--pm-accent-soft)] focus:ring-2 focus:ring-[var(--pm-accent-soft)]/35"
                />
              </label>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>{isOnline ? 'Will save straight away.' : 'Will save offline and sync later.'}</span>
                <span className={`font-semibold ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>

              {statusMessage ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {statusMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={saving || !String(value || '').trim()}
                className="w-full rounded-2xl bg-[var(--pm-accent)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : `Add to ${routeDestination}`}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
