let activeRegistration = null;

const emitWindowEvent = (name, detail = {}) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

const emitUpdateAvailable = () => {
  emitWindowEvent('pmworkspace:update-available');
};

const trackInstallingWorker = (registration) => {
  const installingWorker = registration?.installing;
  if (!installingWorker) return;

  installingWorker.addEventListener('statechange', () => {
    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
      emitUpdateAvailable();
    }
  });
};

export const activatePendingServiceWorker = () => {
  const waitingWorker = activeRegistration?.waiting;
  if (!waitingWorker) return false;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  return true;
};

export const registerServiceWorker = () => {
  if (
    typeof window === 'undefined'
    || !('serviceWorker' in navigator)
    || !import.meta.env.PROD
  ) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        activeRegistration = registration;

        if (registration.waiting) {
          emitUpdateAvailable();
        }

        registration.addEventListener('updatefound', () => {
          trackInstallingWorker(registration);
        });
        trackInstallingWorker(registration);

        const requestUpdateCheck = () => {
          registration.update().catch(() => null);
        };

        window.addEventListener('focus', requestUpdateCheck);
        window.addEventListener('pageshow', requestUpdateCheck);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            requestUpdateCheck();
          }
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          emitWindowEvent('pmworkspace:controller-changed');
        });
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
};
