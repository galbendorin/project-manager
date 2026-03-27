import React from 'react';

const SIZE_MAP = {
  xs: {
    markClass: 'h-9 w-9 rounded-[10px]',
    textClass: 'text-[1.55rem]',
    gapClass: 'gap-2.5',
  },
  sm: {
    markClass: 'h-11 w-11 rounded-[12px]',
    textClass: 'text-[1.95rem]',
    gapClass: 'gap-3',
  },
  md: {
    markClass: 'h-14 w-14 rounded-[15px]',
    textClass: 'text-[2.45rem]',
    gapClass: 'gap-3.5',
  },
};

const gradientTextStyle = {
  backgroundImage: 'linear-gradient(135deg, #ec4899 0%, #9333ea 52%, #6d28d9 100%)',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
};

export default function PmWorkspaceLogo({
  variant = 'light',
  size = 'sm',
  iconOnly = false,
  className = '',
  textClassName = '',
}) {
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.sm;
  const workspaceColor = variant === 'dark' ? '#d8d4ea' : '#4f4a67';
  const ringClass = variant === 'dark' ? 'ring-1 ring-white/10' : 'ring-1 ring-slate-950/6';
  const shadowClass = variant === 'dark'
    ? 'shadow-[0_16px_30px_-18px_rgba(0,0,0,0.75)]'
    : 'shadow-[0_18px_34px_-22px_rgba(15,23,42,0.45)]';

  return (
    <div className={`inline-flex min-w-0 items-center ${sizeConfig.gapClass} ${className}`.trim()}>
      <span
        className={`inline-flex shrink-0 overflow-hidden bg-black ${ringClass} ${shadowClass} ${sizeConfig.markClass}`.trim()}
      >
        <img
          src="/pmworkspace-mark-dark.png"
          alt={iconOnly ? 'PM Workspace' : ''}
          aria-hidden={iconOnly ? undefined : 'true'}
          className="h-full w-full object-cover"
        />
      </span>
      {!iconOnly && (
        <span
          style={{ fontFamily: "'Manrope', sans-serif" }}
          className={`min-w-0 truncate font-bold leading-none tracking-[-0.055em] ${sizeConfig.textClass} ${textClassName}`.trim()}
        >
          <span style={gradientTextStyle}>PM</span>
          <span style={{ color: workspaceColor }}>Workspace</span>
        </span>
      )}
    </div>
  );
}
