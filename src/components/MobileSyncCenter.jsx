import React, { useMemo, useState } from 'react';

const STATUS_CLASSES = {
  offline: 'border-amber-200 bg-amber-50 text-amber-700',
  queue: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  syncing: 'border-sky-200 bg-sky-50 text-sky-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const statusClassName = (status) => STATUS_CLASSES[status] || STATUS_CLASSES.queue;

export default function MobileSyncCenter({
  shouldShow = false,
  title = 'Sync center',
  summary = '',
  queueCount = 0,
  items = [],
}) {
  const [open, setOpen] = useState(false);

  const badgeLabel = useMemo(() => {
    if (queueCount > 0) return String(queueCount);
    if (items.some((item) => item.status === 'error')) return '!';
    if (items.some((item) => item.status === 'syncing')) return '...';
    return 'i';
  }, [items, queueCount]);

  if (!shouldShow) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[70] inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-800 shadow-[0_24px_48px_-28px_rgba(15,23,42,0.4)] backdrop-blur md:hidden"
      >
        <span>Sync</span>
        <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
          {badgeLabel}
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] md:hidden">
          <button
            type="button"
            aria-label="Close sync center"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-950/35"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-slate-200 bg-[#faf7f1] px-4 pb-6 pt-4 shadow-[0_-18px_55px_-28px_rgba(15,23,42,0.45)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-950">{title}</div>
                {summary ? (
                  <div className="mt-1 text-sm leading-6 text-slate-500">{summary}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      {item.detail ? (
                        <div className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</div>
                      ) : null}
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName(item.status)}`}>
                      {item.statusLabel}
                    </span>
                  </div>
                  {item.actionLabel && typeof item.onAction === 'function' ? (
                    <button
                      type="button"
                      onClick={item.onAction}
                      className="mt-3 inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-slate-700"
                    >
                      {item.actionLabel}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
