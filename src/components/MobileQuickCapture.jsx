import React from 'react';

export default function MobileQuickCapture({
  isOpen,
  mode,
  value,
  saving,
  isOnline,
  projectName,
  statusMessage,
  onOpen,
  onClose,
  onModeChange,
  onValueChange,
  onSubmit,
}) {
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 md:hidden">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_14px_30px_rgba(15,23,42,0.14)] backdrop-blur">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full bg-[var(--pm-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
          >
            Capture
          </button>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Quick capture
            </div>
            <div className="truncate text-xs text-slate-600">
              {statusMessage || `Add a ${mode === 'action' ? 'Action' : 'Task'} to ${projectName}.`}
            </div>
          </div>
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

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
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

            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
              }}
            >
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {mode === 'action' ? 'Action description' : 'Task title'}
                </span>
                <textarea
                  autoFocus
                  value={value}
                  onChange={(event) => onValueChange(event.target.value)}
                  placeholder={mode === 'action' ? 'Follow up on client note' : 'Remember to update the RAID log'}
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
                {saving ? 'Saving...' : mode === 'action' ? 'Add to Action Log' : 'Add Task'}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
