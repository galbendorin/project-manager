import React, { Suspense } from 'react';
import AuthenticatedFooter from './AuthenticatedFooter';
import AccentThemePicker from './AccentThemePicker';
import PmWorkspaceLogo from './PmWorkspaceLogo';

const ViewFallback = ({ label }) => (
  <div className="flex h-full min-h-[320px] items-center justify-center px-4 py-10 text-sm font-medium text-slate-500">
    {label}
  </div>
);

class MiniToolErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message ? String(error.message) : '',
    };
  }

  componentDidCatch(error, info) {
    console.error(`Failed to render ${this.props.title || 'this view'}.`, error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.boundaryKey !== this.props.boundaryKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[320px] items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-[28px] border border-rose-200 bg-white px-6 py-6 text-center shadow-sm">
          <p className="pm-kicker text-rose-600">View recovery</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            We hit a loading problem in {this.props.title || 'this view'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Try reloading this tool. If the issue came from older cached data on the device, the refreshed view should recover cleanly.
          </p>
          {this.state.errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {this.state.errorMessage}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Reload view
            </button>
            <button
              type="button"
              onClick={this.props.onGoToProjects}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Back to projects
            </button>
          </div>
        </div>
      </div>
    );
  }
}

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
          <MiniToolErrorBoundary boundaryKey={title} onGoToProjects={onGoToProjects} title={title}>
            {children}
          </MiniToolErrorBoundary>
        </Suspense>
      </div>

      <AuthenticatedFooter className="flex-none" />
    </div>
  );
}
