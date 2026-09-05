/* Runs before the module graph: a missing entry or dependency must not leave a blank screen. */
(function () {
  'use strict';

  var GUARD_KEY = 'pmworkspace:chunk-reload-guard:v1';
  var RECOVERY_PARAM = 'pmw-recover';
  var HEALTHY_DELAY_MS = 30000;
  var STARTUP_TIMEOUT_MS = 20000;
  var rendered = false;
  var failed = false;
  var navigating = false;
  var attempted = false;
  var pendingOnlineRecovery = false;
  var healthyTimer;
  var startupTimer;
  var message = '';

  function storage() {
    try { return window.sessionStorage; } catch (_) { return null; }
  }

  function isChunkFailure(error) {
    var value = typeof error === 'string' ? error : error && (error.message || (error.reason && error.reason.message) || error.reason);
    return /failed to fetch dynamically imported module|importing a module script failed|chunkloaderror|error loading dynamically imported module|failed to load module script|unable to preload css/i.test(String(value || ''));
  }

  function hasGuard() {
    if (attempted || new URL(window.location.href).searchParams.has(RECOVERY_PARAM)) return true;
    try { return storage()?.getItem(GUARD_KEY) === '1'; } catch (_) { return false; }
  }

  function paint() {
    var fallback = document.getElementById('app-startup');
    var root = document.getElementById('root');
    if (fallback) fallback.hidden = rendered && !failed;
    if (root) root.hidden = failed;
    if (!failed) return;
    var title = document.getElementById('app-startup-title');
    var detail = document.getElementById('app-startup-detail');
    if (title) title.textContent = window.navigator.onLine === false ? "You're offline" : 'The app could not open';
    if (detail) detail.textContent = message;
  }

  function fail() {
    failed = true;
    window.clearTimeout(healthyTimer);
    window.clearTimeout(startupTimer);
    message = window.navigator.onLine === false
      ? 'Connect to the internet, then try again. Your saved work is still on this device.'
      : 'Please try again to finish opening PM Workspace. Your saved work is still on this device.';
    paint();
  }

  function reloadFresh() {
    if (navigating) return true;
    if (window.navigator.onLine === false) {
      pendingOnlineRecovery = true;
      fail();
      return false;
    }
    attempted = true;
    try { storage()?.setItem(GUARD_KEY, '1'); } catch (_) { /* The URL also guards the next document. */ }
    var url = new URL(window.location.href);
    url.searchParams.set(RECOVERY_PARAM, String(Date.now()));
    try {
      window.location.replace(url.toString());
      navigating = true;
      return true;
    } catch (_) {
      fail();
      return false;
    }
  }

  function recover(error) {
    if (!isChunkFailure(error)) return false;
    fail();
    pendingOnlineRecovery = true;
    if (hasGuard()) return false;
    return reloadFresh();
  }

  function markRendered() {
    rendered = true;
    window.clearTimeout(startupTimer);
    paint();
  }

  function markReady() {
    markRendered();
    if (failed || healthyTimer) return;
    // A DOMContentLoaded event or a Suspense spinner is not a successful startup.
    healthyTimer = window.setTimeout(function () {
      if (failed) return;
      try { storage()?.removeItem(GUARD_KEY); } catch (_) { /* Storage can be disabled in Safari. */ }
      var url = new URL(window.location.href);
      if (url.searchParams.has(RECOVERY_PARAM)) {
        url.searchParams.delete(RECOVERY_PARAM);
        try {
          window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
        } catch (_) { /* Keeping the guard is safe if history is unavailable. */ }
      }
      attempted = false;
      pendingOnlineRecovery = false;
    }, HEALTHY_DELAY_MS);
  }

  window.__PMW_APP_RECOVERY__ = {
    recover: recover,
    retry: reloadFresh,
    fail: fail,
    markRendered: markRendered,
    markReady: markReady,
  };

  window.addEventListener('vite:preloadError', function (event) {
    // Let React's error boundary receive failures when a reload cannot start.
    if (recover(event.payload || event.error || event)) event.preventDefault();
  });

  window.addEventListener('error', function (event) {
    var target = event.target;
    var isModule = target && target.tagName === 'SCRIPT' && target.type === 'module';
    var isAppAsset = target && /^(SCRIPT|LINK)$/.test(target.tagName || '') &&
      /\/assets\/[^/?]+\.(?:js|css)(?:[?#]|$)/.test(target.src || target.href || '');
    if (isModule || isAppAsset) {
      recover('Failed to load module script');
    } else if (isChunkFailure(event.error || event.message)) {
      recover(event.error || event.message);
    } else if (!rendered && (event.error || event.message)) {
      fail();
    }
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    if (isChunkFailure(event.reason)) recover(event.reason);
    else if (!rendered) fail();
  });

  window.addEventListener('online', function () {
    if (pendingOnlineRecovery && !hasGuard()) reloadFresh();
    else if (failed) fail();
  });

  document.addEventListener('DOMContentLoaded', function () {
    var retry = document.getElementById('app-startup-retry');
    if (retry) retry.addEventListener('click', function (event) {
      event.preventDefault();
      reloadFresh();
    });
    paint();
  }, { once: true });

  startupTimer = window.setTimeout(function () {
    if (!rendered) recover('Failed to load module script');
  }, STARTUP_TIMEOUT_MS);
}());
