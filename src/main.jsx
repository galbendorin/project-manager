import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { PlanProvider } from './contexts/PlanContext';
import App from './App';
import './styles/index.css';
import { isSupabaseConfigured, supabaseConfigStatus } from './lib/supabase';
import { registerServiceWorker } from './utils/registerServiceWorker';
import {
  buildChunkRecoveryUrl,
  CHUNK_RECOVERY_QUERY_PARAM,
  clearChunkReloadGuard,
  getSafeSessionStorage,
  isLikelyChunkLoadFailure,
  markChunkReloadGuard,
  shouldAttemptChunkRecoveryReload,
  stripChunkRecoveryParam,
} from './utils/appUpdateRecovery';

const DEFAULT_VIEWPORT =
  'width=device-width, initial-scale=1.0, viewport-fit=cover';

const STANDALONE_IOS_VIEWPORT =
  'width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1';

const applyStandaloneViewport = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (!viewportMeta) return;

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator?.standalone === true;
  const isIOS =
    /iPad|iPhone|iPod/.test(window.navigator?.userAgent || '') ||
    (window.navigator?.platform === 'MacIntel' && window.navigator?.maxTouchPoints > 1);

  viewportMeta.setAttribute(
    'content',
    isStandalone && isIOS ? STANDALONE_IOS_VIEWPORT : DEFAULT_VIEWPORT
  );
};

const applyStandaloneClass = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator?.standalone === true;
  document.documentElement.classList.toggle('standalone-web-app', Boolean(isStandalone));
};

applyStandaloneClass();
applyStandaloneViewport();

const attemptChunkRecoveryReload = (errorLike) => {
  if (typeof window === 'undefined') return;
  const sessionStorage = getSafeSessionStorage();
  const isOnline = window.navigator?.onLine !== false;
  if (!shouldAttemptChunkRecoveryReload(errorLike, sessionStorage, isOnline)) return;

  markChunkReloadGuard(sessionStorage);
  window.location.replace(buildChunkRecoveryUrl(window.location));
};

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault?.();
  attemptChunkRecoveryReload(event?.payload || event?.error || event);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event?.reason || event;
  if (!isLikelyChunkLoadFailure(reason)) return;
  attemptChunkRecoveryReload(reason);
});

window.addEventListener('DOMContentLoaded', () => {
  applyStandaloneClass();
  applyStandaloneViewport();
  clearChunkReloadGuard(getSafeSessionStorage());
  if (typeof window !== 'undefined' && window.location.search.includes(CHUNK_RECOVERY_QUERY_PARAM)) {
    const cleanUrl = stripChunkRecoveryParam(window.location);
    window.history.replaceState({}, '', cleanUrl);
  }
}, { once: true });
window.addEventListener('pageshow', applyStandaloneViewport);
registerServiceWorker();

const missingConfigLabel = import.meta.env.DEV ? 'Local setup' : 'Configuration';
const missingConfigMessage = import.meta.env.DEV
  ? 'PM Workspace needs its public Supabase URL and anon key before the app can start locally. Add the missing Vite variables, then restart the dev server.'
  : 'PM Workspace is missing required public Supabase configuration. Please try again shortly.';

const MissingSupabaseConfig = () => (
  <div className="min-h-screen bg-slate-950 px-6 py-10 text-white">
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl flex-col justify-center">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">{missingConfigLabel}</p>
        <h1 className="mt-3 text-2xl font-bold">Supabase environment is missing</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{missingConfigMessage}</p>
        <div className="mt-5 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 font-mono text-sm text-slate-100">
          {supabaseConfigStatus.missingKeys.map((key) => (
            <div key={key}>{key}</div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isSupabaseConfigured ? (
      <AuthProvider>
        <PlanProvider>
          <App />
        </PlanProvider>
      </AuthProvider>
    ) : (
      <MissingSupabaseConfig />
    )}
  </React.StrictMode>
);
