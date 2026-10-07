import React, { useId, useRef } from 'react';

export default function TodoQuadrantPanel({ title, label, count, height, limits, onHeightChange, panelRef, isMobile, className, children, ...dragEvents }) {
  const id = useId();
  const gesture = useRef(null);
  const clamp = (value) => Math.max(limits.min, Math.min(limits.max, value));
  const endGesture = (event) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <section ref={panelRef} aria-label={label} style={{ height }} className={`flex min-h-0 min-w-0 flex-col overflow-hidden scroll-mt-4 rounded-2xl border task-quadrant ${className}`} {...dragEvents}>
      <header className="shrink-0 px-3 pb-3 pt-3 sm:px-4 sm:pt-4">
        <h3 id={`${id}-title`} className="text-base font-semibold text-slate-900">{title} <span className="text-sm font-normal text-slate-500">({count})</span></h3>
        <p className="mt-1 text-sm text-slate-600">{label}</p>
      </header>
      <div id={`${id}-body`} aria-labelledby={`${id}-title`} role="region" className={`task-quadrant-body min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-4 sm:px-4 ${isMobile ? '' : 'overscroll-contain'}`}>
        {children}
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white/70 px-2">
        <button type="button" aria-label={`Make ${title} smaller`} disabled={height <= limits.min} onClick={() => onHeightChange(clamp(height - 32))} className="min-h-11 min-w-11 rounded-lg px-2 text-xs text-slate-600 disabled:text-slate-300">Smaller</button>
        <div tabIndex={0} role="separator" aria-orientation="horizontal" aria-label={`Resize ${title}`} aria-controls={`${id}-body`} aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={height} aria-valuetext={`${height} pixels high`}
          style={{ touchAction: 'none' }} className="flex min-h-11 flex-1 cursor-row-resize select-none items-center justify-center rounded-lg text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          onPointerDown={(event) => { if (!event.isPrimary || event.button !== 0) return; event.preventDefault(); gesture.current = { pointerId: event.pointerId, y: event.clientY, height }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { const active = gesture.current; if (active?.pointerId === event.pointerId) onHeightChange(clamp(active.height + event.clientY - active.y)); }}
          onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={() => { gesture.current = null; }}
          onKeyDown={(event) => { let next; const step = event.shiftKey ? 64 : 32; if (event.key === 'ArrowUp') next = height - step; if (event.key === 'ArrowDown') next = height + step; if (event.key === 'Home') next = limits.min; if (event.key === 'End') next = limits.max; if (next !== undefined) { event.preventDefault(); onHeightChange(clamp(next)); } }}>
          <span aria-hidden="true">━</span>
        </div>
        <button type="button" aria-label={`Make ${title} larger`} disabled={height >= limits.max} onClick={() => onHeightChange(clamp(height + 32))} className="min-h-11 min-w-11 rounded-lg px-2 text-xs text-slate-600 disabled:text-slate-300">Larger</button>
      </footer>
    </section>
  );
}
