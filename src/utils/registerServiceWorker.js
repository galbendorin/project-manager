export const registerServiceWorker = () => {
  if (
    typeof window === 'undefined'
    || !('serviceWorker' in navigator)
    || !import.meta.env.PROD
  ) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(
        registrations.map((registration) => registration.unregister().catch(() => false))
      ))
      .catch((error) => {
        console.warn('Service worker cleanup failed:', error);
      });
  });
};
