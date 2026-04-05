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
      .then((registration) => registration.update().catch(() => null))
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
};
