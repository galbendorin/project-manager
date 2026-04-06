import React, { Suspense } from 'react';
import AuthenticatedFooter from './AuthenticatedFooter';
import AccentThemePicker from './AccentThemePicker';
import PmWorkspaceLogo from './PmWorkspaceLogo';

const ViewFallback = ({ label }) => (
  <div className="flex h-full min-h-[320px] items-center justify-center px-4 py-10 text-sm font-medium text-slate-500">
    {label}
  </div>
);

export default function AuthenticatedMiniToolShell({
  accentTheme,
  children,
  fallbackLabel,
  onAccentThemeChange,
  onGoToProjects,
  onSignOut,
  title,
  userEmail,
}) {
  return (
    <div className="pm-shell-bg pm-accent-scope min-h-screen flex flex-col">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-3 px-4 py-3 sm:items-center sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <PmWorkspaceLogo iconOnly size="xs" />
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-950 sm:text-lg">{title}</h1>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">{userEmail}</p>
          </div>

          <div className="flex items-center gap-2">
            <AccentThemePicker value={accentTheme} onChange={onAccentThemeChange} />
            <button
              onClick={onGoToProjects}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-4 sm:text-sm"
            >
              Projects
            </button>
            <button
              onClick={onSignOut}
              className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-4 sm:text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense fallback={<ViewFallback label={fallbackLabel} />}>
          {children}
        </Suspense>
      </div>

      <AuthenticatedFooter className="flex-none" />
    </div>
  );
}
