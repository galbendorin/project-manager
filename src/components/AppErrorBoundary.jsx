import React, { useEffect } from 'react';
import { buildChunkRecoveryUrl } from '../utils/appUpdateRecovery';

// Place within the page Suspense boundary so loading placeholders do not clear the guard.
export function AppStartupReady() {
  useEffect(() => {
    window.__PMW_APP_RECOVERY__?.markReady();
  }, []);
  return null;
}

export function AppStartupRendered() {
  useEffect(() => {
    window.__PMW_APP_RECOVERY__?.markRendered();
  }, []);
  return null;
}

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('PM Workspace could not render.', error, info);
    const recovery = window.__PMW_APP_RECOVERY__;
    if (!recovery?.recover(error)) recovery?.fail();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="pmw-startup" aria-labelledby="app-error-title">
        <div className="pmw-startup-content">
          <p className="pmw-startup-brand">PM Workspace</p>
          <h1 id="app-error-title">The app could not open</h1>
          <p className="pmw-startup-detail">Please try again. Your saved work is still on this device.</p>
          <button
            type="button"
            className="pmw-startup-retry"
            onClick={() => {
              if (window.__PMW_APP_RECOVERY__) window.__PMW_APP_RECOVERY__.retry();
              else window.location.replace(buildChunkRecoveryUrl(window.location));
            }}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }
}
