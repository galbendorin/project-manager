import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ACCENT_THEMES, DEFAULT_ACCENT_THEME, getAccentTheme } from '../utils/appearance';

const themeList = Object.values(ACCENT_THEMES);

const Swatch = ({ theme, active, onClick, compact = false }) => (
  <button
    type="button"
    onClick={() => onClick(theme.key)}
    className={`relative transition-transform hover:scale-105 ${
      compact ? 'h-7 w-7 rounded-full' : 'h-8 w-8 rounded-full'
    } ${active ? 'ring-2 ring-offset-2 ring-slate-300' : ''}`}
    style={{ background: theme.gradient }}
    title={theme.label}
    aria-label={`Use ${theme.label} accent`}
    aria-pressed={active}
  >
    {active && (
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-white drop-shadow-sm">
        ✓
      </span>
    )}
  </button>
);

const AccentThemePicker = ({
  value = DEFAULT_ACCENT_THEME,
  onChange,
  mode = 'menu',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const activeTheme = useMemo(() => getAccentTheme(value), [value]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (mode === 'inline') {
    return (
      <div className={className}>
        <div className="pm-kicker">Accent color</div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {themeList.map((theme) => (
            <Swatch
              key={theme.key}
              theme={theme}
              active={theme.key === activeTheme.key}
              onClick={onChange}
            />
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          {activeTheme.label} is active across your main workspace surfaces.
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="pm-subtle-button inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className="h-4 w-4 rounded-full border border-white/70 shadow-sm"
          style={{ background: activeTheme.gradient }}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">Accent</span>
        <span className="text-[10px] text-slate-400">▾</span>
      </button>

      {open && (
        <div className="pm-surface-card absolute right-0 z-[90] mt-2 w-56 rounded-2xl p-3">
          <div className="px-1">
            <div className="pm-kicker">Accent color</div>
            <div className="mt-1 text-xs text-slate-500">Choose a workspace accent.</div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-2">
            {themeList.map((theme) => (
              <Swatch
                key={theme.key}
                theme={theme}
                active={theme.key === activeTheme.key}
                onClick={(nextTheme) => {
                  onChange(nextTheme);
                  setOpen(false);
                }}
                compact
              />
            ))}
          </div>

          <div className="mt-3 rounded-xl bg-white/75 px-3 py-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{activeTheme.label}</span> keeps the app tone updated without changing status colors.
          </div>
        </div>
      )}
    </div>
  );
};

export default AccentThemePicker;
