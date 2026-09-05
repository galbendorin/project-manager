let activeRegistration = null;
let lastUpdateCheckAt = 0;

export const hasPendingServiceWorker = () => Boolean(activeRegistration?.waiting);

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
  if (!waitingWorker) return Promise.resolve(true);
  // Subscribe before activation: React state updates and effects can be too late
  // to catch controllerchange on Safari. Never reload on a fixed timer.
  return new Promise((resolve) => {
    const previousController = navigator.serviceWorker.controller;
    let timer;
    const finish = (activated) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(activated);
    };
    const onControllerChange = () => {
      if (navigator.serviceWorker.controller !== previousController) finish(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    timer = setTimeout(() => finish(false), 15_000);
    try {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      finish(false);
    }
  });
};

export const registerServiceWorker = () => {
  if (
    typeof window === 'undefined'
    || !('serviceWorker' in navigator)
    || !import.meta.env.PROD
  ) {
    return;
  }

  const register = () => {
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
          const now = Date.now();
          if (now - lastUpdateCheckAt < 15_000) return;
          lastUpdateCheckAt = now;
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
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
};
