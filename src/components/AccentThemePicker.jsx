import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ACCENT_THEMES, DEFAULT_ACCENT_THEME, getAccentTheme } from '../utils/appearance';

const themeList = Object.values(ACCENT_THEMES);
const barGradient = `linear-gradient(90deg, ${themeList.map((theme) => theme.accent).join(', ')})`;

const AccentBar = ({ value, onChange, compact = false, interactive = true }) => {
  const activeIndex = Math.max(0, themeList.findIndex((theme) => theme.key === value));
  const activeTheme = themeList[activeIndex] || themeList[0];
  const position = themeList.length > 1
    ? (activeIndex / (themeList.length - 1)) * 100
    : 0;

  return (
    <div className="relative">
      <div
        className={`${compact ? 'h-4' : 'h-5'} rounded-full border border-white/80 shadow-inner`}
        style={{ background: barGradient }}
        aria-hidden="true"
      />

      <div
        className={`pointer-events-none absolute top-1/2 z-[1] rounded-full border-2 border-white bg-white shadow-lg transition-all ${
          compact ? 'h-5 w-5' : 'h-6 w-6'
        }`}
        style={{
          left: `calc(${position}% - ${compact ? 10 : 12}px)`,
          transform: 'translateY(-50%)',
          boxShadow: '0 10px 24px -14px rgba(15, 23, 42, 0.45)',
        }}
      >
        <span
          className="absolute inset-[2px] rounded-full"
          style={{ background: activeTheme.gradient }}
        />
      </div>

      {interactive && (
        <input
          type="range"
          min="0"
          max={String(themeList.length - 1)}
          step="1"
          value={activeIndex}
          onChange={(event) => {
            const nextTheme = themeList[Number(event.target.value)] || themeList[0];
            onChange(nextTheme.key);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Accent color"
        />
      )}
    </div>
  );
};

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
        <div className="mt-3">
          <AccentBar value={activeTheme.key} onChange={onChange} />
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
        <span className="w-14" aria-hidden="true">
          <AccentBar value={activeTheme.key} onChange={() => {}} compact interactive={false} />
        </span>
        <span className="hidden sm:inline">Accent</span>
        <span className="text-[10px] text-slate-400">▾</span>
      </button>

      {open && (
        <div className="pm-surface-card absolute right-0 z-[90] mt-2 w-64 rounded-2xl p-3">
          <div className="px-1">
            <div className="pm-kicker">Accent color</div>
            <div className="mt-1 text-xs text-slate-500">Choose a workspace accent.</div>
          </div>

          <div className="mt-3 px-1">
            <AccentBar
              value={activeTheme.key}
              onChange={(nextTheme) => {
                onChange(nextTheme);
              }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 px-1">
            {themeList.map((theme) => (
              <button
                key={theme.key}
                type="button"
                onClick={() => onChange(theme.key)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  theme.key === activeTheme.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white/80 text-slate-500 hover:bg-white hover:text-slate-800'
                }`}
              >
                {theme.label}
              </button>
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
