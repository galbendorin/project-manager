import React, { useEffect, useRef } from 'react';

const focusable = 'input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';

export default function CareDialog({ title, onClose, busy = false, wide = false, children }) {
  const panel = useRef(null), latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (panel.current?.querySelector(focusable) || panel.current)?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!latest.current.busy) latest.current.onClose(); }
      if (event.key !== 'Tab') return;
      const targets = [...(panel.current?.querySelectorAll(focusable) || [])];
      if (!targets.length) { event.preventDefault(); panel.current?.focus(); return; }
      if (!targets.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? targets.at(-1) : targets[0])?.focus(); return; }
      if (event.shiftKey && document.activeElement === targets[0]) { event.preventDefault(); targets.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === targets.at(-1)) { event.preventDefault(); targets[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus?.(); };
  }, []);
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-2 sm:items-center sm:p-6" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92dvh] w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-xl ${wide ? 'max-w-6xl' : 'max-w-lg'}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><h2 className="min-w-0 text-[18px] font-semibold leading-6 text-slate-950">{title}</h2><button type="button" disabled={busy} onClick={onClose} className="min-h-[44px] shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-700 disabled:opacity-40">Close</button></header>
      <div className="min-h-0 overflow-auto p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[14px] leading-6 [&_input]:min-h-[48px] [&_input[type=checkbox]]:min-h-0 [&_input]:min-w-0 [&_input]:text-[16px] [&_select]:min-h-[48px] [&_select]:min-w-0 [&_select]:text-[16px] [&_textarea]:text-[16px] [&_button]:min-h-[44px] [&_label]:min-w-0 [&_label>span]:normal-case [&_label>span]:tracking-normal [&_label>span]:text-[13px]">{children}</div>
    </section>
  </div>;
}
