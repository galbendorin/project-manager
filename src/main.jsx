import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { PlanProvider } from './contexts/PlanContext';
import App from './App';
import './styles/index.css';
import { registerServiceWorker } from './utils/registerServiceWorker';
import {
  clearChunkReloadGuard,
  consumeChunkReloadGuard,
  getSafeSessionStorage,
  isLikelyChunkLoadFailure,
  markChunkReloadGuard,
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
  if (!isLikelyChunkLoadFailure(errorLike)) return;
  const sessionStorage = getSafeSessionStorage();
  if (consumeChunkReloadGuard(sessionStorage)) return;

  markChunkReloadGuard(sessionStorage);
  window.location.reload();
};

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault?.();
  attemptChunkRecoveryReload(event?.payload || event?.error || event);
});

window.addEventListener('error', (event) => {
  attemptChunkRecoveryReload(event?.error || event?.message || event);
});

window.addEventListener('unhandledrejection', (event) => {
  attemptChunkRecoveryReload(event?.reason || event);
});

window.addEventListener('DOMContentLoaded', () => {
  applyStandaloneClass();
  applyStandaloneViewport();
  clearChunkReloadGuard(getSafeSessionStorage());
}, { once: true });
window.addEventListener('pageshow', applyStandaloneViewport);
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <PlanProvider>
        <App />
      </PlanProvider>
    </AuthProvider>
  </React.StrictMode>
);
